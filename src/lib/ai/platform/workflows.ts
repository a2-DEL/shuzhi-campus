import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { createAndPlanAiTask } from '@/lib/ai/runtime/orchestrator'
import { getAiSkill } from '@/lib/ai/runtime/planner'
import { toAiProductTask } from '@/lib/ai/product-view'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { UserRole, type User } from '@/types'
import type {
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowOverview,
  WorkflowRunEventView,
  WorkflowRunView,
  WorkflowView,
} from './types'

const managerRoles = new Set<UserRole>([UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN])
const nodeKinds = ['trigger', 'knowledge', 'agent', 'skill', 'approval', 'aggregate'] as const
const roleCodes = new Set<string>(Object.values(UserRole))

const positionSchema = z.object({ x: z.number().finite().min(-4000).max(4000), y: z.number().finite().min(-4000).max(4000) }).strict()
const nodeSchema = z.object({
  id: z.string().trim().min(1).max(140).regex(/^[A-Za-z0-9._-]+$/),
  kind: z.enum(nodeKinds),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  skillId: z.string().trim().min(1).max(100).optional(),
  agentLabel: z.string().trim().max(120).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  position: positionSchema,
}).strict()
const edgeSchema = z.object({
  id: z.string().trim().min(1).max(140).regex(/^[A-Za-z0-9._-]+$/),
  source: z.string().trim().min(1).max(140),
  target: z.string().trim().min(1).max(140),
  label: z.string().trim().max(80).optional(),
}).strict()

export const workflowDefinitionSchema = z.object({
  nodes: z.array(nodeSchema).min(3).max(16),
  edges: z.array(edgeSchema).min(2).max(32),
}).strict().superRefine((definition, context) => {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  for (const [index, node] of definition.nodes.entries()) {
    if (nodeIds.has(node.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'id'], message: '节点标识不能重复' })
    nodeIds.add(node.id)
    if ((node.kind === 'agent' || node.kind === 'skill') && !node.skillId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'skillId'], message: '执行节点必须绑定受治理 Skill' })
    }
    if (node.skillId && !getAiSkill(node.skillId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'skillId'], message: 'Skill 不在受治理目录中' })
    }
  }
  for (const [index, edge] of definition.edges.entries()) {
    if (edgeIds.has(edge.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'id'], message: '连线标识不能重复' })
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: '连线必须连接两个不同的有效节点' })
    }
  }
  const executable = definition.nodes.filter((node) => node.kind === 'agent' || node.kind === 'skill')
  if (executable.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: '至少需要一个真实执行节点' })
  const skillIds = executable.map((node) => node.skillId).filter(Boolean)
  if (new Set(skillIds).size !== skillIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: '当前运行引擎要求每个执行节点绑定不同的 Skill' })

  const incoming = new Map(definition.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]))
  definition.edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const queue = [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visited += 1
    for (const target of outgoing.get(id) ?? []) {
      const count = (incoming.get(target) ?? 0) - 1
      incoming.set(target, count)
      if (count === 0) queue.push(target)
    }
  }
  if (visited !== definition.nodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges'], message: '工作流不允许循环依赖' })
})

export class WorkflowPlatformError extends Error {
  constructor(
    readonly code: 'UNAUTHENTICATED' | 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'RUNTIME_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'WorkflowPlatformError'
  }
}

export function canManageWorkflows(user: User): boolean {
  return managerRoles.has(user.role)
}

function context(user: User): { schoolId: string; manager: boolean } {
  if (!user.school_id) throw new WorkflowPlatformError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (!hasPostgresDatabaseUrl()) throw new WorkflowPlatformError('BACKEND_UNAVAILABLE', '工作流中枢需要 PostgreSQL 持久化')
  return { schoolId: user.school_id, manager: canManageWorkflows(user) }
}

function requireManager(user: User): string {
  const value = context(user)
  if (!value.manager) throw new WorkflowPlatformError('FORBIDDEN', '只有超级管理员或 AI 运维管理员可以创建和发布工作流')
  return value.schoolId
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value), 'utf8').digest('hex')
}

function dateValue(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : undefined
}

function parseDefinition(value: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.safeParse(value)
  if (!parsed.success) throw new WorkflowPlatformError('INVALID_REQUEST', parsed.error.issues[0]?.message ?? '工作流定义无效')
  return parsed.data
}

function mapWorkflow(row: Record<string, unknown>): WorkflowView {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    status: row.status as WorkflowView['status'],
    triggerKind: row.trigger_kind as WorkflowView['triggerKind'],
    currentVersion: Number(row.current_version ?? 0),
    visibilityRoles: Array.isArray(row.visibility_roles) ? row.visibility_roles.map(String) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    lastRunAt: dateValue(row.last_run_at),
    createdAt: dateValue(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: dateValue(row.updated_at) ?? new Date(0).toISOString(),
    version: row.version_id ? {
      id: String(row.version_id),
      versionNo: Number(row.version_no),
      status: row.version_status as NonNullable<WorkflowView['version']>['status'],
      definition: parseDefinition(row.definition),
      checksum: String(row.checksum),
      publishedAt: dateValue(row.published_at),
    } : undefined,
  }
}

function mapEvent(row: Record<string, unknown>): WorkflowRunEventView {
  return {
    id: String(row.id), seq: Number(row.seq), eventType: String(row.event_type),
    nodeId: row.node_id ? String(row.node_id) : undefined,
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    title: String(row.title), message: String(row.message),
    createdAt: dateValue(row.created_at) ?? new Date(0).toISOString(),
  }
}

async function listEvents(schoolId: string, runIds: string[]): Promise<Map<string, WorkflowRunEventView[]>> {
  const result = new Map<string, WorkflowRunEventView[]>()
  runIds.forEach((id) => result.set(id, []))
  if (runIds.length === 0) return result
  const rows = await getPostgresPool().query(
    `SELECT id,run_id,seq,event_type,node_id,agent_id,title,message,created_at
     FROM ai_workflow_run_events WHERE school_id=$1::uuid AND run_id=ANY($2::uuid[]) ORDER BY run_id,seq`,
    [schoolId, runIds],
  )
  rows.rows.forEach((row) => result.get(String(row.run_id))?.push(mapEvent(row)))
  return result
}

async function listRuns(user: User, limit = 12): Promise<WorkflowRunView[]> {
  const { schoolId, manager } = context(user)
  const rows = await getPostgresPool().query(
    `SELECT r.*,w.name workflow_name,v.version_no
     FROM ai_workflow_runs r
     JOIN ai_workflows w ON w.id=r.workflow_id
     JOIN ai_workflow_versions v ON v.id=r.workflow_version_id
     WHERE r.school_id=$1::uuid AND ($2::boolean OR r.triggered_by=$3)
     ORDER BY r.created_at DESC LIMIT $4`,
    [schoolId, manager, user.id, Math.min(Math.max(limit, 1), 50)],
  )
  const events = await listEvents(schoolId, rows.rows.map((row) => String(row.id)))
  return rows.rows.map((row) => ({
    id: String(row.id), workflowId: String(row.workflow_id), workflowName: String(row.workflow_name),
    versionNo: Number(row.version_no), taskId: row.task_id ? String(row.task_id) : undefined,
    status: row.status as WorkflowRunView['status'],
    outputSummary: row.output_summary && typeof row.output_summary === 'object' ? row.output_summary as Record<string, unknown> : {},
    startedAt: dateValue(row.started_at), completedAt: dateValue(row.completed_at),
    createdAt: dateValue(row.created_at) ?? new Date(0).toISOString(),
    events: events.get(String(row.id)) ?? [],
  }))
}

export async function listWorkflows(user: User): Promise<WorkflowView[]> {
  const { schoolId, manager } = context(user)
  const rows = await getPostgresPool().query(
    `SELECT w.*,v.id version_id,v.version_no,v.definition,v.checksum,v.status version_status,v.published_at
     FROM ai_workflows w
     LEFT JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version_no=w.current_version
     WHERE w.school_id=$1::uuid
       AND ($2::boolean OR (w.status='PUBLISHED' AND (cardinality(w.visibility_roles)=0 OR $3=ANY(w.visibility_roles))))
     ORDER BY CASE w.status WHEN 'PUBLISHED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,w.updated_at DESC`,
    [schoolId, manager, user.role],
  )
  return rows.rows.map(mapWorkflow)
}

export async function getWorkflowOverview(user: User): Promise<WorkflowOverview> {
  const { schoolId, manager } = context(user)
  const [workflows, recentRuns, metrics] = await Promise.all([
    listWorkflows(user), listRuns(user),
    getPostgresPool().query(
      `SELECT
        count(DISTINCT w.id)::int workflows,
        count(DISTINCT w.id) FILTER (WHERE w.status='PUBLISHED')::int published,
        count(DISTINCT r.id) FILTER (WHERE $2::boolean OR r.triggered_by=$3)::int runs,
        count(DISTINCT r.id) FILTER (WHERE r.status='AWAITING_APPROVAL' AND ($2::boolean OR r.triggered_by=$3))::int awaiting,
        count(DISTINCT r.id) FILTER (WHERE r.status='COMPLETED' AND ($2::boolean OR r.triggered_by=$3))::int completed
       FROM ai_workflows w LEFT JOIN ai_workflow_runs r ON r.workflow_id=w.id AND r.school_id=w.school_id
       WHERE w.school_id=$1::uuid AND ($2::boolean OR (w.status='PUBLISHED' AND (cardinality(w.visibility_roles)=0 OR $4=ANY(w.visibility_roles))))`,
      [schoolId, manager, user.id, user.role],
    ),
  ])
  const row = metrics.rows[0] ?? {}
  return { manager, metrics: { workflows: Number(row.workflows ?? 0), published: Number(row.published ?? 0), runs: Number(row.runs ?? 0), awaitingApproval: Number(row.awaiting ?? 0), completed: Number(row.completed ?? 0) }, workflows, recentRuns }
}

function normalizedSlug(input: string | undefined, name: string): string {
  const source = (input || name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
  return source || `workflow-${randomUUID().slice(0, 8)}`
}

export async function createWorkflow(user: User, input: {
  name: string; slug?: string; description?: string; triggerKind?: WorkflowView['triggerKind']; visibilityRoles?: string[]; tags?: string[]; definition: unknown
}): Promise<WorkflowView> {
  const schoolId = requireManager(user)
  const name = input.name.trim()
  if (!name || name.length > 220) throw new WorkflowPlatformError('INVALID_REQUEST', '工作流名称长度无效')
  const definition = parseDefinition(input.definition)
  const visibilityRoles = [...new Set(input.visibilityRoles ?? [])]
  if (visibilityRoles.some((role) => !roleCodes.has(role))) throw new WorkflowPlatformError('INVALID_REQUEST', '工作流可见角色无效')
  const tags = [...new Set((input.tags ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8)
  const workflowId = randomUUID(); const versionId = randomUUID(); const checksum = hash(definition); const slug = normalizedSlug(input.slug, name)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO ai_workflows(id,school_id,slug,name,description,status,trigger_kind,current_version,visibility_roles,tags,owner_user_id,metadata)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,'DRAFT',$6,1,$7::text[],$8::text[],$9,'{"source":"visual-composer"}'::jsonb)`,
      [workflowId, schoolId, slug, name, input.description?.trim() ?? '', input.triggerKind ?? 'MANUAL', visibilityRoles, tags, user.id],
    )
    await client.query(
      `INSERT INTO ai_workflow_versions(id,school_id,workflow_id,version_no,definition,checksum,status,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,1,$4::jsonb,$5,'DRAFT',$6)`,
      [versionId, schoolId, workflowId, JSON.stringify(definition), checksum, user.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if ((error as { code?: string }).code === '23505') throw new WorkflowPlatformError('CONFLICT', '同一租户下已存在相同标识或相同定义的工作流')
    throw error
  } finally { client.release() }
  const workflows = await listWorkflows(user)
  return workflows.find((item) => item.id === workflowId)!
}

export async function publishWorkflow(user: User, workflowId: string): Promise<WorkflowView> {
  const schoolId = requireManager(user)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const selected = await client.query(`SELECT id,current_version,status FROM ai_workflows WHERE id=$1::uuid AND school_id=$2::uuid FOR UPDATE`, [workflowId, schoolId])
    if (!selected.rows[0]) throw new WorkflowPlatformError('NOT_FOUND', '没有找到当前租户的工作流')
    await client.query(`UPDATE ai_workflow_versions SET status='SUPERSEDED' WHERE workflow_id=$1::uuid AND status='PUBLISHED'`, [workflowId])
    const published = await client.query(
      `UPDATE ai_workflow_versions SET status='PUBLISHED',published_by=$3,published_at=now()
       WHERE workflow_id=$1::uuid AND school_id=$2::uuid AND version_no=$4 RETURNING id`,
      [workflowId, schoolId, user.id, selected.rows[0].current_version],
    )
    if (!published.rows[0]) throw new WorkflowPlatformError('NOT_FOUND', '没有找到可发布的工作流版本')
    await client.query(`UPDATE ai_workflows SET status='PUBLISHED',updated_at=now() WHERE id=$1::uuid`, [workflowId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
  return (await listWorkflows(user)).find((item) => item.id === workflowId)!
}

function topologicalExecutable(definition: WorkflowDefinition): Array<{ node: WorkflowNodeDefinition; dependencies: string[] }> {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]))
  const incoming = new Map(definition.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]))
  definition.edges.forEach((edge) => { incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1); outgoing.get(edge.source)?.push(edge.target) })
  const queue = [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id)
  const order: WorkflowNodeDefinition[] = []
  while (queue.length) {
    const id = queue.shift()!; const node = byId.get(id); if (node) order.push(node)
    for (const target of outgoing.get(id) ?? []) { const count = (incoming.get(target) ?? 0) - 1; incoming.set(target, count); if (count === 0) queue.push(target) }
  }
  const executable = order.filter((node) => (node.kind === 'agent' || node.kind === 'skill') && node.skillId)
  const indexById = new Map(executable.map((node, index) => [node.id, `node-${index + 1}`]))
  const reverse = new Map(definition.nodes.map((node) => [node.id, [] as string[]]))
  definition.edges.forEach((edge) => reverse.get(edge.target)?.push(edge.source))
  function upstreamExecutables(id: string, seen = new Set<string>()): string[] {
    if (seen.has(id)) return []
    seen.add(id)
    const result = new Set<string>()
    for (const parent of reverse.get(id) ?? []) {
      if (indexById.has(parent)) result.add(indexById.get(parent)!)
      else upstreamExecutables(parent, seen).forEach((value) => result.add(value))
    }
    return [...result]
  }
  return executable.map((node) => ({ node, dependencies: upstreamExecutables(node.id) }))
}

async function insertEvent(client: PoolClient, input: { schoolId: string; runId: string; seq: number; eventType: string; nodeId?: string; agentId?: string; title: string; message: string; payload?: Record<string, unknown> }): Promise<void> {
  const payload = input.payload ?? {}
  await client.query(
    `INSERT INTO ai_workflow_run_events(school_id,run_id,seq,event_type,node_id,agent_id,title,message,payload,payload_hash)
     VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [input.schoolId, input.runId, input.seq, input.eventType, input.nodeId ?? null, input.agentId ?? null, input.title, input.message, JSON.stringify(payload), hash(payload)],
  )
}

export async function runWorkflow(user: User, workflowId: string, input: { command?: string; nodeInputs?: Record<string, Record<string, unknown>> } = {}): Promise<{ run: WorkflowRunView; task: ReturnType<typeof toAiProductTask> }> {
  const { schoolId } = context(user)
  const selected = await getPostgresPool().query(
    `SELECT w.*,v.id version_id,v.version_no,v.definition,v.checksum,v.status version_status,v.published_at
     FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version_no=w.current_version
     WHERE w.id=$1::uuid AND w.school_id=$2::uuid AND w.status='PUBLISHED'
       AND (cardinality(w.visibility_roles)=0 OR $3=ANY(w.visibility_roles))`,
    [workflowId, schoolId, user.role],
  )
  if (!selected.rows[0]) throw new WorkflowPlatformError('NOT_FOUND', '工作流未发布、不可见或不属于当前租户')
  const workflow = mapWorkflow(selected.rows[0]); const definition = workflow.version!.definition
  const executable = topologicalExecutable(definition)
  if (executable.length === 0) throw new WorkflowPlatformError('INVALID_REQUEST', '工作流没有可执行节点')
  const runId = randomUUID(); const startedAt = new Date().toISOString(); const inputHash = hash(input.nodeInputs ?? {})
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO ai_workflow_runs(id,school_id,workflow_id,workflow_version_id,triggered_by,status,input_hash,started_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'RUNNING',$6,$7::timestamptz)`,
      [runId, schoolId, workflowId, workflow.version!.id, user.id, inputHash, startedAt],
    )
    await insertEvent(client, { schoolId, runId, seq: 1, eventType: 'workflow.accepted', title: '白泽接收编排', message: `白泽独目微启：已接收「${workflow.name}」，正在核验版本、权限与业务边界。`, payload: { workflowVersion: workflow.currentVersion } })
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }

  try {
    const steps = executable.map(({ node, dependencies }) => ({
      skillId: node.skillId!, title: node.label,
      params: { ...(node.params ?? {}), ...(input.nodeInputs?.[node.id] ?? {}) },
      dependsOn: dependencies,
    }))
    const task = await createAndPlanAiTask(user, {
      command: input.command?.trim() || `执行企业工作流：${workflow.name}`,
      skillId: steps[0].skillId,
      params: steps[0].params,
      workflow: steps.slice(1),
      idempotencyKey: `workflow:${workflowId}:${runId}`,
    })
    const status: WorkflowRunView['status'] = task.state === 'COMPLETED' ? 'COMPLETED'
      : task.state === 'AWAITING_APPROVAL' || task.state === 'PREVIEWED' ? 'AWAITING_APPROVAL'
        : task.state === 'FAILED' ? 'FAILED' : task.state === 'CANCELLED' ? 'CANCELLED' : 'RUNNING'
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
    const write = await getPostgresPool().connect()
    try {
      await write.query('BEGIN')
      let seq = 2
      await insertEvent(write, { schoolId, runId, seq: seq++, eventType: 'workflow.materialized', title: '受控计划已成形', message: `白泽已把画布反编译为 ${task.nodes.length} 个持久化 Agent 节点，并绑定正式 Skill Gateway。`, payload: { taskId: task.id, taskState: task.state, nodeCount: task.nodes.length } })
      for (const node of task.nodes) {
        await insertEvent(write, { schoolId, runId, seq: seq++, eventType: 'agent.bound', nodeId: node.id, agentId: node.agentId, title: `${node.agentName} 接令`, message: `${node.agentName} 化作流光就位，接手「${node.title}」；业务写入仍受审批和回读校验约束。`, payload: { skillId: node.skillId, nodeState: node.state } })
      }
      await insertEvent(write, { schoolId, runId, seq, eventType: status === 'AWAITING_APPROVAL' ? 'workflow.awaiting_approval' : `workflow.${status.toLowerCase()}`, title: status === 'AWAITING_APPROVAL' ? '等待人类裁决' : '白泽归整运行态', message: status === 'AWAITING_APPROVAL' ? '白泽收住光丝：执行预览与风险证据已经铺开，得到授权前不会触碰真实业务数据。' : `白泽已归整本次运行，当前状态为 ${status}。`, payload: { taskId: task.id, taskState: task.state } })
      await write.query(
        `UPDATE ai_workflow_runs SET task_id=$2::uuid,status=$3,output_summary=$4::jsonb,completed_at=$5,updated_at=now() WHERE id=$1::uuid`,
        [runId, task.id, status, JSON.stringify({ taskId: task.id, taskState: task.state, nodeCount: task.nodes.length, approvalPolicy: task.approvalPolicy }), terminal ? new Date().toISOString() : null],
      )
      await write.query(`UPDATE ai_workflows SET last_run_at=now(),updated_at=now() WHERE id=$1::uuid`, [workflowId])
      await write.query('COMMIT')
    } catch (error) { await write.query('ROLLBACK'); throw error } finally { write.release() }
    const run = (await listRuns(user, 50)).find((item) => item.id === runId)!
    return { run, task: toAiProductTask(task) }
  } catch (error) {
    const message = error instanceof Error ? error.message : '工作流运行失败'
    const write = await getPostgresPool().connect()
    try {
      await write.query('BEGIN')
      await write.query(`UPDATE ai_workflow_runs SET status='FAILED',output_summary=$2::jsonb,completed_at=now(),updated_at=now() WHERE id=$1::uuid`, [runId, JSON.stringify({ errorCode: error instanceof WorkflowPlatformError ? error.code : 'RUNTIME_FAILED' })])
      await insertEvent(write, { schoolId, runId, seq: 2, eventType: 'workflow.failed', title: '白泽安全收束', message: `白泽已收回全部光路，本次未继续执行：${message}`, payload: { businessWriteAssumed: false } })
      await write.query('COMMIT')
    } catch { await write.query('ROLLBACK') } finally { write.release() }
    if (error instanceof WorkflowPlatformError) throw error
    throw new WorkflowPlatformError('RUNTIME_FAILED', message)
  }
}
