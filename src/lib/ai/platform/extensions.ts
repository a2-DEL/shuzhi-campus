import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { z } from 'zod'
import { authorize } from '@/lib/authorization'
import { createAndPlanAiTask } from '@/lib/ai/runtime/orchestrator'
import { getAiSkill } from '@/lib/ai/runtime/planner'
import { toAiProductTask } from '@/lib/ai/product-view'
import { listEnterpriseSkillContracts } from '@/lib/ai/skills/registry'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { UserRole, type User } from '@/types'
import type { ExtensionOverview, McpServerView, McpToolView, PluginManifest, PluginView } from './extension-types'

const managers = new Set<UserRole>([UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN])
const roleSchema = z.nativeEnum(UserRole)
const capabilitySchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(400),
  skillId: z.string().trim().min(1).max(100),
}).strict()
export const pluginManifestSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  capabilities: z.array(capabilitySchema).min(1).max(12),
  allowedRoles: z.array(roleSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>()
  value.capabilities.forEach((capability, index) => {
    if (ids.has(capability.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities', index, 'id'], message: '插件能力标识不能重复' })
    ids.add(capability.id)
    const skill = getAiSkill(capability.skillId)
    if (!skill?.executable || !skill.gatewaySkillKey) context.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities', index, 'skillId'], message: '插件只能绑定可执行的受治理 Skill' })
  })
})

export class ExtensionPlatformError extends Error {
  constructor(
    readonly code: 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'ENDPOINT_BLOCKED' | 'PROBE_FAILED' | 'TOOL_BLOCKED' | 'TOOL_FAILED',
    message: string,
  ) {
    super(message); this.name = 'ExtensionPlatformError'
  }
}

export function canManageExtensions(user: User): boolean { return managers.has(user.role) }
function userContext(user: User): { schoolId: string; manager: boolean } {
  if (!user.school_id) throw new ExtensionPlatformError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (!hasPostgresDatabaseUrl()) throw new ExtensionPlatformError('BACKEND_UNAVAILABLE', '扩展治理需要 PostgreSQL 持久化')
  return { schoolId: user.school_id, manager: canManageExtensions(user) }
}
function requireManager(user: User): string {
  const value = userContext(user); if (!value.manager) throw new ExtensionPlatformError('FORBIDDEN', '只有超级管理员或 AI 运维管理员可以治理插件与 MCP')
  return value.schoolId
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}
function stableJson(value: unknown): string { return JSON.stringify(stable(value)) }
function digest(value: unknown): string { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value), 'utf8').digest('hex') }
function iso(value: unknown): string | undefined { return value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : undefined }
function slug(input: string | undefined, name: string, prefix: string): string {
  const value = (input || name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
  return value || `${prefix}-${randomUUID().slice(0, 8)}`
}

function mapPlugin(row: Record<string, unknown>): PluginView {
  const manifest = pluginManifestSchema.parse(row.manifest ?? { summary: '', capabilities: [], allowedRoles: [] }) as PluginManifest
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name), description: String(row.description ?? ''), publisher: String(row.publisher),
    status: row.status as PluginView['status'], trustLevel: row.trust_level as PluginView['trustLevel'], currentVersion: Number(row.current_version),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(), updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    version: row.version_id ? { id: String(row.version_id), versionNo: Number(row.version_no), status: row.version_status as NonNullable<PluginView['version']>['status'], manifest, publishedAt: iso(row.published_at) } : undefined,
  }
}

async function listPlugins(user: User): Promise<PluginView[]> {
  const { schoolId, manager } = userContext(user)
  const rows = await getPostgresPool().query(
    `SELECT p.*,v.id version_id,v.version_no,v.manifest,v.status version_status,v.published_at
     FROM ai_plugins p LEFT JOIN ai_plugin_versions v ON v.plugin_id=p.id AND v.version_no=p.current_version
     WHERE p.school_id=$1::uuid AND ($2::boolean OR (p.status='PUBLISHED' AND ($3=ANY(COALESCE(ARRAY(SELECT jsonb_array_elements_text(v.manifest->'allowedRoles')),ARRAY[]::text[])))))
     ORDER BY CASE p.status WHEN 'PUBLISHED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,p.updated_at DESC`,
    [schoolId, manager, user.role],
  )
  return rows.rows.map(mapPlugin)
}

function safeEndpointLabel(endpoint: string): string {
  try { const url = new URL(endpoint); return `${url.protocol}//${url.host}${url.pathname}` } catch { return 'Invalid endpoint' }
}
function mapTool(row: Record<string, unknown>): McpToolView {
  return { id: String(row.id), name: String(row.tool_name), title: String(row.title), description: String(row.description ?? ''), riskLevel: row.risk_level as McpToolView['riskLevel'], status: row.status as McpToolView['status'], inputSchema: row.input_schema && typeof row.input_schema === 'object' ? row.input_schema as Record<string, unknown> : {} }
}
async function listMcpServers(user: User): Promise<McpServerView[]> {
  const { schoolId } = userContext(user)
  const [servers, tools] = await Promise.all([
    getPostgresPool().query(`SELECT * FROM ai_mcp_servers WHERE school_id=$1::uuid ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,updated_at DESC`, [schoolId]),
    getPostgresPool().query(`SELECT * FROM ai_mcp_tools WHERE school_id=$1::uuid ORDER BY server_id,tool_name`, [schoolId]),
  ])
  const toolsByServer = new Map<string, McpToolView[]>()
  tools.rows.forEach((row) => { const key = String(row.server_id); const values = toolsByServer.get(key) ?? []; values.push(mapTool(row)); toolsByServer.set(key, values) })
  return servers.rows.map((row) => ({
    id: String(row.id), slug: String(row.slug), name: String(row.name), description: String(row.description ?? ''), endpointLabel: safeEndpointLabel(String(row.endpoint)),
    transport: row.transport as McpServerView['transport'], authMode: row.auth_mode as McpServerView['authMode'], credentialConfigured: row.auth_mode === 'NONE' || Boolean(row.credential_ref && process.env[String(row.credential_ref)]),
    status: row.status as McpServerView['status'], trustLevel: row.trust_level as McpServerView['trustLevel'], protocolVersion: row.protocol_version ? String(row.protocol_version) : undefined,
    serverInfo: row.server_info && typeof row.server_info === 'object' ? row.server_info as Record<string, unknown> : {}, lastProbeAt: iso(row.last_probe_at), lastLatencyMs: row.last_latency_ms === null ? undefined : Number(row.last_latency_ms),
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : undefined, tools: toolsByServer.get(String(row.id)) ?? [], createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
  }))
}

export async function getExtensionOverview(user: User): Promise<ExtensionOverview> {
  const { schoolId, manager } = userContext(user)
  const contracts = listEnterpriseSkillContracts()
  const skills = contracts.map((contract) => ({
    key: contract.key, id: contract.id, displayName: contract.displayName, description: contract.description, version: contract.version, businessLoop: contract.businessLoop,
    riskLevel: contract.riskLevel, approvalPolicy: contract.approvalPolicy, available: authorize(user, { permission: contract.requiredPermission, allowedRoles: [...contract.allowedRoles] }).allowed,
    owner: contract.owner, evalSet: contract.evalSet,
  }))
  const [plugins, mcpServers, counts, invocations] = await Promise.all([
    listPlugins(user), listMcpServers(user),
    getPostgresPool().query(`SELECT
      (SELECT count(*)::int FROM ai_plugins WHERE school_id=$1::uuid AND ($2::boolean OR status='PUBLISHED')) plugins,
      (SELECT count(*)::int FROM ai_mcp_servers WHERE school_id=$1::uuid AND status='ACTIVE') active_servers,
      (SELECT count(*)::int FROM ai_mcp_tools WHERE school_id=$1::uuid) tools,
      (SELECT count(*)::int FROM ai_mcp_probe_runs WHERE school_id=$1::uuid AND status='SUCCEEDED') probes,
      (SELECT count(*)::int FROM ai_mcp_invocations WHERE school_id=$1::uuid) invocations`, [schoolId, manager]),
    getPostgresPool().query(`SELECT i.id,s.name server_name,t.title tool_name,i.status,i.latency_ms,i.created_at FROM ai_mcp_invocations i JOIN ai_mcp_servers s ON s.id=i.server_id JOIN ai_mcp_tools t ON t.id=i.tool_id WHERE i.school_id=$1::uuid ORDER BY i.created_at DESC LIMIT 12`, [schoolId]),
  ])
  const row = counts.rows[0] ?? {}
  return {
    manager, skills, plugins, mcpServers,
    metrics: { skills: skills.length, plugins: Number(row.plugins ?? 0), activeMcpServers: Number(row.active_servers ?? 0), mcpTools: Number(row.tools ?? 0), successfulProbes: Number(row.probes ?? 0), invocations: Number(row.invocations ?? 0) },
    recentInvocations: invocations.rows.map((item) => ({ id: String(item.id), serverName: String(item.server_name), toolName: String(item.tool_name), status: String(item.status), latencyMs: Number(item.latency_ms), createdAt: iso(item.created_at) ?? new Date(0).toISOString() })),
  }
}

export async function createPlugin(user: User, input: { name: string; slug?: string; description?: string; publisher?: string; trustLevel?: PluginView['trustLevel']; manifest: unknown }): Promise<PluginView> {
  const schoolId = requireManager(user); const parsed = pluginManifestSchema.safeParse(input.manifest)
  if (!parsed.success) throw new ExtensionPlatformError('INVALID_REQUEST', parsed.error.issues[0]?.message ?? '插件清单无效')
  const name = input.name.trim(); if (!name || name.length > 220) throw new ExtensionPlatformError('INVALID_REQUEST', '插件名称无效')
  const pluginId = randomUUID(); const versionId = randomUUID(); const checksum = digest(parsed.data)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO ai_plugins(id,school_id,slug,name,description,publisher,status,trust_level,current_version,created_by,metadata) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,'DRAFT',$7,1,$8,'{"kind":"declarative-skill-binding"}'::jsonb)`, [pluginId, schoolId, slug(input.slug, name, 'plugin'), name, input.description?.trim() ?? '', input.publisher?.trim() || '数智星图内部团队', input.trustLevel ?? 'INTERNAL', user.id])
    await client.query(`INSERT INTO ai_plugin_versions(id,school_id,plugin_id,version_no,manifest,checksum,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,1,$4::jsonb,$5,'DRAFT',$6)`, [versionId, schoolId, pluginId, JSON.stringify(parsed.data), checksum, user.id])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); if ((error as { code?: string }).code === '23505') throw new ExtensionPlatformError('CONFLICT', '插件标识或清单已存在'); throw error } finally { client.release() }
  return (await listPlugins(user)).find((item) => item.id === pluginId)!
}

export async function publishPlugin(user: User, pluginId: string): Promise<PluginView> {
  const schoolId = requireManager(user); const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const row = await client.query(`SELECT current_version FROM ai_plugins WHERE id=$1::uuid AND school_id=$2::uuid FOR UPDATE`, [pluginId, schoolId])
    if (!row.rows[0]) throw new ExtensionPlatformError('NOT_FOUND', '插件不存在')
    await client.query(`UPDATE ai_plugin_versions SET status='SUPERSEDED' WHERE plugin_id=$1::uuid AND status='PUBLISHED'`, [pluginId])
    await client.query(`UPDATE ai_plugin_versions SET status='PUBLISHED',published_by=$3,published_at=now() WHERE plugin_id=$1::uuid AND school_id=$2::uuid AND version_no=$4`, [pluginId, schoolId, user.id, row.rows[0].current_version])
    await client.query(`UPDATE ai_plugins SET status='PUBLISHED',updated_at=now() WHERE id=$1::uuid`, [pluginId])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  return (await listPlugins(user)).find((item) => item.id === pluginId)!
}

export async function invokePluginCapability(user: User, pluginId: string, capabilityId: string, params: Record<string, unknown>): Promise<ReturnType<typeof toAiProductTask>> {
  const { schoolId } = userContext(user)
  const selected = await getPostgresPool().query(`SELECT p.id,p.name,v.manifest FROM ai_plugins p JOIN ai_plugin_versions v ON v.plugin_id=p.id AND v.version_no=p.current_version WHERE p.id=$1::uuid AND p.school_id=$2::uuid AND p.status='PUBLISHED' AND v.status='PUBLISHED'`, [pluginId, schoolId])
  if (!selected.rows[0]) throw new ExtensionPlatformError('NOT_FOUND', '插件未发布或不属于当前租户')
  const manifest = pluginManifestSchema.parse(selected.rows[0].manifest)
  if (!manifest.allowedRoles.includes(user.role)) throw new ExtensionPlatformError('FORBIDDEN', '当前角色不在插件允许范围内')
  const capability = manifest.capabilities.find((item) => item.id === capabilityId)
  if (!capability) throw new ExtensionPlatformError('NOT_FOUND', '插件能力不存在')
  const task = await createAndPlanAiTask(user, { command: `通过插件「${selected.rows[0].name}」执行：${capability.name}`, skillId: capability.skillId, params, idempotencyKey: `plugin:${pluginId}:${capabilityId}:${randomUUID()}` })
  return toAiProductTask(task)
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))
  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224
}
function isLoopbackHost(hostname: string): boolean { return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' }
async function validateEndpoint(endpoint: string): Promise<URL> {
  let url: URL
  try { url = new URL(endpoint) } catch { throw new ExtensionPlatformError('INVALID_REQUEST', 'MCP 地址格式无效') }
  if (url.username || url.password || url.search || url.hash) throw new ExtensionPlatformError('ENDPOINT_BLOCKED', 'MCP 地址不得携带账号、密码、查询串或片段')
  if (!['https:', 'http:'].includes(url.protocol)) throw new ExtensionPlatformError('ENDPOINT_BLOCKED', 'MCP 仅允许 HTTPS，开发环境可使用本机 HTTP')
  const loopback = isLoopbackHost(url.hostname)
  if (url.protocol !== 'https:' && !(loopback && process.env.NODE_ENV !== 'production')) throw new ExtensionPlatformError('ENDPOINT_BLOCKED', '外部 MCP 必须使用 HTTPS')
  if (!loopback) {
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true }).catch(() => { throw new ExtensionPlatformError('PROBE_FAILED', '无法解析 MCP 主机') })
    if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) throw new ExtensionPlatformError('ENDPOINT_BLOCKED', 'MCP 主机解析到私有、回环或保留地址')
  }
  return url
}

export function getInternalMcpToken(): string | null {
  const source = process.env.MCP_INTERNAL_TOKEN?.trim() || process.env.AUTH_SECRET?.trim() || (process.env.NODE_ENV !== 'production' ? 'shuzhi-local-mcp-control-plane-v1' : '')
  return source ? digest(`internal-mcp:${source}`) : null
}
export function verifyInternalMcpToken(value: string | null): boolean {
  const expected = getInternalMcpToken(); if (!expected || !value) return false
  const left = Buffer.from(expected); const right = Buffer.from(value); return left.length === right.length && timingSafeEqual(left, right)
}

interface McpRow extends Record<string, unknown> { id: string; school_id: string; endpoint: string; auth_mode: string; credential_ref?: string; trust_level: string; status: string }
async function mcpRpc(server: McpRow, method: string, params: Record<string, unknown>): Promise<unknown> {
  const url = await validateEndpoint(String(server.endpoint))
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (isLoopbackHost(url.hostname) && url.pathname === '/api/ai/mcp/internal') {
    const token = getInternalMcpToken(); if (!token) throw new ExtensionPlatformError('PROBE_FAILED', '内部 MCP 令牌未配置')
    headers['x-shuzhi-mcp-token'] = token
  } else if (server.auth_mode === 'BEARER_ENV') {
    const ref = String(server.credential_ref ?? '')
    const credential = /^[A-Z][A-Z0-9_]{2,119}$/.test(ref) ? process.env[ref]?.trim() : undefined
    if (!credential) throw new ExtensionPlatformError('PROBE_FAILED', 'MCP 凭据引用未配置')
    headers.authorization = `Bearer ${credential}`
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }), signal: AbortSignal.timeout(10_000), redirect: 'error' })
  const text = await response.text()
  if (text.length > 1_000_000) throw new ExtensionPlatformError('PROBE_FAILED', 'MCP 响应超过安全上限')
  if (!response.ok) throw new ExtensionPlatformError('PROBE_FAILED', `MCP 返回 HTTP ${response.status}`)
  const payloadText = text.trim().startsWith('data:') ? text.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim() ?? '' : text
  let payload: { result?: unknown; error?: { code?: number; message?: string } }
  try { payload = JSON.parse(payloadText) } catch { throw new ExtensionPlatformError('PROBE_FAILED', 'MCP 未返回有效 JSON-RPC') }
  if (payload.error) throw new ExtensionPlatformError('PROBE_FAILED', payload.error.message || `MCP error ${payload.error.code}`)
  return payload.result
}

export async function createMcpServer(user: User, input: { name: string; slug?: string; description?: string; endpoint: string; transport?: McpServerView['transport']; authMode?: McpServerView['authMode']; credentialRef?: string; trustLevel?: McpServerView['trustLevel'] }): Promise<McpServerView> {
  const schoolId = requireManager(user); const url = await validateEndpoint(input.endpoint)
  if (input.authMode === 'BEARER_ENV' && !/^[A-Z][A-Z0-9_]{2,119}$/.test(input.credentialRef ?? '')) throw new ExtensionPlatformError('INVALID_REQUEST', 'Bearer 凭据只能填写服务端环境变量名')
  const name = input.name.trim(); if (!name || name.length > 220) throw new ExtensionPlatformError('INVALID_REQUEST', 'MCP 名称无效')
  const serverId = randomUUID(); const config = { endpoint: url.toString(), transport: input.transport ?? 'STREAMABLE_HTTP', authMode: input.authMode ?? 'NONE', credentialRef: input.credentialRef ?? null }
  try {
    await getPostgresPool().query(`INSERT INTO ai_mcp_servers(id,school_id,slug,name,description,endpoint,transport,auth_mode,credential_ref,status,trust_level,config_hash,created_by,metadata) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10,$11,$12,'{"ssrfGuard":"dns-and-ip-v1"}'::jsonb)`, [serverId, schoolId, slug(input.slug, name, 'mcp'), name, input.description?.trim() ?? '', url.toString(), config.transport, config.authMode, input.credentialRef ?? null, input.trustLevel ?? 'INTERNAL', digest(config), user.id])
  } catch (error) { if ((error as { code?: string }).code === '23505') throw new ExtensionPlatformError('CONFLICT', '同名 MCP 已存在'); throw error }
  return (await listMcpServers(user)).find((item) => item.id === serverId)!
}

function normalizeMcpTools(result: unknown, trusted: boolean): Array<{ name: string; title: string; description: string; inputSchema: Record<string, unknown>; riskLevel: McpToolView['riskLevel']; status: McpToolView['status'] }> {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  if (!Array.isArray(record.tools)) throw new ExtensionPlatformError('PROBE_FAILED', 'MCP tools/list 缺少工具列表')
  return record.tools.slice(0, 100).map((value) => {
    const tool = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const name = typeof tool.name === 'string' && /^[A-Za-z0-9._-]{1,180}$/.test(tool.name) ? tool.name : ''
    if (!name) throw new ExtensionPlatformError('PROBE_FAILED', 'MCP 工具名称无效')
    const meta = tool._meta && typeof tool._meta === 'object' ? tool._meta as Record<string, unknown> : {}
    const risk = ['low', 'medium', 'high', 'critical'].includes(String(meta.riskLevel)) ? String(meta.riskLevel) as McpToolView['riskLevel'] : 'medium'
    return { name, title: String(tool.title || name).slice(0, 220), description: String(tool.description || '').slice(0, 2_000), inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema as Record<string, unknown> : {}, riskLevel: risk, status: trusted && ['low', 'medium'].includes(risk) ? 'AVAILABLE' : 'REVIEW_REQUIRED' }
  })
}

export async function probeMcpServer(user: User, serverId: string): Promise<McpServerView> {
  const schoolId = requireManager(user); const selected = await getPostgresPool().query(`SELECT * FROM ai_mcp_servers WHERE id=$1::uuid AND school_id=$2::uuid`, [serverId, schoolId])
  if (!selected.rows[0]) throw new ExtensionPlatformError('NOT_FOUND', 'MCP 服务不存在')
  const server = selected.rows[0] as McpRow; const started = Date.now()
  try {
    const initialized = await mcpRpc(server, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'shuzhi-baize-agent-os', version: '1.0.0' } }) as Record<string, unknown>
    const toolsResult = await mcpRpc(server, 'tools/list', {})
    const endpoint = new URL(String(server.endpoint)); const trusted = server.trust_level === 'VERIFIED' || (isLoopbackHost(endpoint.hostname) && endpoint.pathname === '/api/ai/mcp/internal')
    const tools = normalizeMcpTools(toolsResult, trusted); const latency = Date.now() - started; const responseHash = digest({ initialized, tools: tools.map((tool) => ({ name: tool.name, riskLevel: tool.riskLevel })) })
    const client = await getPostgresPool().connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE ai_mcp_servers SET status='ACTIVE',protocol_version=$3,server_info=$4::jsonb,last_probe_at=now(),last_latency_ms=$5,last_error_code=NULL,updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid`, [serverId, schoolId, String(initialized.protocolVersion ?? 'unknown').slice(0, 32), JSON.stringify(initialized.serverInfo && typeof initialized.serverInfo === 'object' ? initialized.serverInfo : {}), latency])
      const discoveredToolNames = tools.map((tool) => tool.name)
      for (const tool of tools) await client.query(`INSERT INTO ai_mcp_tools(school_id,server_id,tool_name,title,description,input_schema,risk_level,status,discovered_at,updated_at) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7,$8,now(),now()) ON CONFLICT(server_id,tool_name) DO UPDATE SET school_id=EXCLUDED.school_id,title=EXCLUDED.title,description=EXCLUDED.description,input_schema=EXCLUDED.input_schema,risk_level=EXCLUDED.risk_level,status=EXCLUDED.status,discovered_at=now(),updated_at=now()`, [schoolId, serverId, tool.name, tool.title, tool.description, JSON.stringify(tool.inputSchema), tool.riskLevel, tool.status])
      await client.query(`UPDATE ai_mcp_tools SET status='DISABLED',updated_at=now() WHERE server_id=$1::uuid AND school_id=$2::uuid AND NOT (tool_name=ANY($3::text[]))`, [serverId, schoolId, discoveredToolNames])
      await client.query(`INSERT INTO ai_mcp_probe_runs(school_id,server_id,status,latency_ms,tool_count,response_hash,probed_by) VALUES($1::uuid,$2::uuid,'SUCCEEDED',$3,$4,$5,$6)`, [schoolId, serverId, latency, tools.length, responseHash, user.id])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } catch (error) {
    const latency = Date.now() - started; const code = error instanceof ExtensionPlatformError ? error.code : 'PROBE_FAILED'
    await getPostgresPool().query(`UPDATE ai_mcp_servers SET status='DEGRADED',last_probe_at=now(),last_latency_ms=$3,last_error_code=$4,updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid`, [serverId, schoolId, latency, code])
    await getPostgresPool().query(`INSERT INTO ai_mcp_probe_runs(school_id,server_id,status,latency_ms,tool_count,error_code,probed_by) VALUES($1::uuid,$2::uuid,'FAILED',$3,0,$4,$5)`, [schoolId, serverId, latency, code, user.id])
    throw error instanceof ExtensionPlatformError ? error : new ExtensionPlatformError('PROBE_FAILED', error instanceof Error ? error.message : 'MCP 探测失败')
  }
  return (await listMcpServers(user)).find((item) => item.id === serverId)!
}

function summarizeMcpResult(result: unknown): { text: string; facts: Record<string, unknown> } {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const content = Array.isArray(record.content) ? record.content : []
  const text = content.map((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text' ? String((item as Record<string, unknown>).text ?? '') : '').filter(Boolean).join('\n').slice(0, 8_000)
  const structured = record.structuredContent && typeof record.structuredContent === 'object' ? record.structuredContent as Record<string, unknown> : {}
  return { text: text || 'MCP 工具已完成调用并返回结构化结果。', facts: structured }
}

export async function invokeMcpTool(user: User, serverId: string, toolId: string, args: Record<string, unknown>): Promise<{ text: string; facts: Record<string, unknown>; latencyMs: number }> {
  const schoolId = requireManager(user)
  const selected = await getPostgresPool().query(`SELECT s.*,t.id tool_id,t.tool_name,t.title tool_title,t.risk_level,t.status tool_status FROM ai_mcp_servers s JOIN ai_mcp_tools t ON t.server_id=s.id WHERE s.id=$1::uuid AND t.id=$2::uuid AND s.school_id=$3::uuid`, [serverId, toolId, schoolId])
  if (!selected.rows[0]) throw new ExtensionPlatformError('NOT_FOUND', 'MCP 工具不存在')
  const row = selected.rows[0] as McpRow & Record<string, unknown>; const started = Date.now(); const argumentsHash = digest(args)
  if (row.status !== 'ACTIVE' || row.tool_status !== 'AVAILABLE' || ['high', 'critical'].includes(String(row.risk_level))) {
    await getPostgresPool().query(`INSERT INTO ai_mcp_invocations(school_id,server_id,tool_id,invoked_by,status,arguments_hash,latency_ms,error_code,summary) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'BLOCKED',$5,0,'POLICY_BLOCKED','{"businessWriteOccurred":false}'::jsonb)`, [schoolId, serverId, toolId, user.id, argumentsHash])
    throw new ExtensionPlatformError('TOOL_BLOCKED', '该 MCP 工具尚未通过风险审核，不能直接调用')
  }
  try {
    const result = await mcpRpc(row, 'tools/call', { name: String(row.tool_name), arguments: { ...args, schoolId } })
    const latency = Date.now() - started; const summary = summarizeMcpResult(result)
    await getPostgresPool().query(`INSERT INTO ai_mcp_invocations(school_id,server_id,tool_id,invoked_by,status,arguments_hash,result_hash,latency_ms,summary) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'SUCCEEDED',$5,$6,$7,$8::jsonb)`, [schoolId, serverId, toolId, user.id, argumentsHash, digest(result), latency, JSON.stringify({ textLength: summary.text.length, factKeys: Object.keys(summary.facts).slice(0, 20) })])
    return { ...summary, latencyMs: latency }
  } catch (error) {
    const latency = Date.now() - started; const code = error instanceof ExtensionPlatformError ? error.code : 'TOOL_FAILED'
    await getPostgresPool().query(`INSERT INTO ai_mcp_invocations(school_id,server_id,tool_id,invoked_by,status,arguments_hash,latency_ms,error_code,summary) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'FAILED',$5,$6,$7,'{"businessWriteOccurred":false}'::jsonb)`, [schoolId, serverId, toolId, user.id, argumentsHash, latency, code])
    throw error instanceof ExtensionPlatformError ? new ExtensionPlatformError('TOOL_FAILED', error.message) : new ExtensionPlatformError('TOOL_FAILED', 'MCP 工具调用失败')
  }
}
