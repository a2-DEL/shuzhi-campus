import { getAiTaskRuntimeRepository } from '@/lib/ai/runtime/repository'
import { listAgentTeamCards } from '@/lib/ai/runtime/agent-catalog'
import { listEnterpriseSkillContracts } from '@/lib/ai/skills/registry'
import { canOperateAiRuntime } from './access'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { loadEnv } from '@/storage/database/supabase-client'
import type { User } from '@/types'
import {
  GovernedModelGatewayError,
  getModelUsageSnapshot,
  runGovernedModelProbe,
  type ModelUsageSnapshot,
} from '@/lib/ai/model-gateway/service'

export type AiRouteMode = 'local_governed' | 'external_preferred' | 'hybrid_fail_closed'

export interface AiRuntimeSettings {
  routeMode: AiRouteMode
  primaryProvider?: string
  fallbackProvider?: string
  maxModelCalls: number
  dailyBudgetCents: number
  updatedAt?: string
  updatedByName?: string
}

export interface AiProviderReadiness {
  id: string
  name: string
  configured: boolean
  modelConfigured: boolean
  description: string
}

export interface AiOperationsOverview {
  generatedAt: string
  persistence: 'postgres' | 'development_memory'
  settings: AiRuntimeSettings
  providers: AiProviderReadiness[]
  runtime: {
    taskCount: number
    awaitingApproval: number
    active: number
    verified: number
    failed: number
    completedNodes: number
    totalNodes: number
    averageDurationMs: number
    latestActivityAt?: string
  }
  governance: {
    pendingOutbox: number
    deadLetters: number
    failedTools: number
    newFeedback: number
  }
  modelUsage: ModelUsageSnapshot
  catalog: { teams: number; agents: number; skills: number }
}

export interface AiDiagnosticCheck {
  id: string
  label: string
  status: 'healthy' | 'attention' | 'unavailable'
  message: string
}

export class AiOperationsError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'PERSISTENCE_REQUIRED' | 'INVALID_PROVIDER' | 'OPERATIONS_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'AiOperationsError'
  }
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', description: '通用推理与工具调用通道' },
  { id: 'azure_openai', name: 'Azure OpenAI', key: 'AZURE_OPENAI_API_KEY', model: 'AZURE_OPENAI_DEPLOYMENT', description: '企业专有网络与区域化模型通道' },
  { id: 'deepseek', name: 'DeepSeek', key: 'DEEPSEEK_API_KEY', model: 'DEEPSEEK_MODEL', description: '高性价比推理与中文任务通道' },
  { id: 'anthropic', name: 'Anthropic', key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL', description: '长文本分析与安全推理通道' },
  { id: 'google', name: 'Google Gemini', key: 'GOOGLE_GENERATIVE_AI_API_KEY', model: 'GOOGLE_GENERATIVE_AI_MODEL', description: '多模态理解通道' },
] as const

const memorySettings = new Map<string, AiRuntimeSettings>()

function requireOperator(user: User): string {
  if (!canOperateAiRuntime(user) || !user.school_id) throw new AiOperationsError('FORBIDDEN', '当前身份没有 AI 系统运维权限')
  return user.school_id
}

function providerReadiness(): AiProviderReadiness[] {
  loadEnv()
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    configured: Boolean(process.env[provider.key]?.trim()),
    modelConfigured: Boolean(process.env[provider.model]?.trim()),
    description: provider.description,
  }))
}

function dateString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : undefined
}

async function loadSettings(schoolId: string): Promise<AiRuntimeSettings> {
  if (!hasPostgresDatabaseUrl()) {
    return memorySettings.get(schoolId) ?? { routeMode: 'local_governed', maxModelCalls: 24, dailyBudgetCents: 0 }
  }
  const result = await getPostgresPool().query<{
    route_mode: AiRouteMode
    primary_provider: string | null
    fallback_provider: string | null
    max_model_calls: number
    daily_budget_cents: number
    updated_at: Date | string
    updated_by_name: string | null
  }>(
    `SELECT s.route_mode,s.primary_provider,s.fallback_provider,s.max_model_calls,s.daily_budget_cents,s.updated_at,u.name AS updated_by_name
     FROM ai_runtime_settings s LEFT JOIN users u ON u.id=s.updated_by
     WHERE s.school_id=$1::uuid`,
    [schoolId],
  )
  const row = result.rows[0]
  if (!row) return { routeMode: 'local_governed', maxModelCalls: 24, dailyBudgetCents: 0 }
  return {
    routeMode: row.route_mode,
    primaryProvider: row.primary_provider ?? undefined,
    fallbackProvider: row.fallback_provider ?? undefined,
    maxModelCalls: Number(row.max_model_calls),
    dailyBudgetCents: Number(row.daily_budget_cents),
    updatedAt: dateString(row.updated_at),
    updatedByName: row.updated_by_name ?? undefined,
  }
}

export async function getAiOperationsOverview(user: User): Promise<AiOperationsOverview> {
  const schoolId = requireOperator(user)
  try {
    const [tasks, settings, modelUsage] = await Promise.all([
      getAiTaskRuntimeRepository().listTasks({ schoolId }),
      loadSettings(schoolId),
      getModelUsageSnapshot(schoolId),
    ])
    const providers = providerReadiness()
    const teams = listAgentTeamCards()
    const completedDurations = tasks
      .filter((task) => task.startedAt && task.completedAt)
      .map((task) => Date.parse(task.completedAt!) - Date.parse(task.startedAt!))
      .filter((duration) => Number.isFinite(duration) && duration >= 0)
    let governance = { pendingOutbox: 0, deadLetters: 0, failedTools: 0, newFeedback: 0 }
    if (hasPostgresDatabaseUrl()) {
      const result = await getPostgresPool().query<{
        pending_outbox: number
        dead_letters: number
        failed_tools: number
        new_feedback: number
      }>(
        `SELECT
          (SELECT count(*)::int FROM ai_outbox_events WHERE school_id=$1::uuid AND status IN ('PENDING','FAILED')) AS pending_outbox,
          (SELECT count(*)::int FROM ai_outbox_events WHERE school_id=$1::uuid AND status='DEAD_LETTER') AS dead_letters,
          (SELECT count(*)::int FROM ai_tool_invocations WHERE school_id=$1::uuid AND status='FAILED') AS failed_tools,
          (SELECT count(*)::int FROM ai_feedback_events WHERE school_id=$1::uuid AND status='new') AS new_feedback`,
        [schoolId],
      )
      governance = {
        pendingOutbox: Number(result.rows[0]?.pending_outbox ?? 0),
        deadLetters: Number(result.rows[0]?.dead_letters ?? 0),
        failedTools: Number(result.rows[0]?.failed_tools ?? 0),
        newFeedback: Number(result.rows[0]?.new_feedback ?? 0),
      }
    }
    const latest = tasks.map((task) => task.updatedAt).sort().at(-1)
    return {
      generatedAt: new Date().toISOString(),
      persistence: hasPostgresDatabaseUrl() ? 'postgres' : 'development_memory',
      settings,
      providers,
      runtime: {
        taskCount: tasks.length,
        awaitingApproval: tasks.filter((task) => task.state === 'AWAITING_APPROVAL').length,
        active: tasks.filter((task) => ['QUEUED', 'RUNNING', 'OBSERVING', 'VERIFYING', 'REPLANNING'].includes(task.state)).length,
        verified: tasks.filter((task) => task.state === 'COMPLETED').length,
        failed: tasks.filter((task) => ['FAILED', 'PARTIAL'].includes(task.state)).length,
        completedNodes: tasks.flatMap((task) => task.nodes).filter((node) => node.state === 'COMPLETED').length,
        totalNodes: tasks.reduce((sum, task) => sum + task.nodes.length, 0),
        averageDurationMs: completedDurations.length > 0 ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length) : 0,
        latestActivityAt: latest,
      },
      governance,
      modelUsage,
      catalog: {
        teams: teams.length,
        agents: teams.reduce((sum, team) => sum + team.members.length + 1, 0),
        skills: listEnterpriseSkillContracts().length,
      },
    }
  } catch (error) {
    if (error instanceof AiOperationsError) throw error
    throw new AiOperationsError('OPERATIONS_UNAVAILABLE', error instanceof Error ? error.message : 'AI 运维状态暂不可用')
  }
}

export async function updateAiRuntimeSettings(user: User, settings: AiRuntimeSettings): Promise<AiRuntimeSettings> {
  const schoolId = requireOperator(user)
  const providers = providerReadiness()
  const knownProviders = new Set(providers.map((provider) => provider.id))
  for (const provider of [settings.primaryProvider, settings.fallbackProvider]) {
    if (provider && !knownProviders.has(provider)) throw new AiOperationsError('INVALID_PROVIDER', '选择了系统未登记的模型服务商')
  }
  if (settings.routeMode !== 'local_governed' && !settings.primaryProvider) {
    throw new AiOperationsError('INVALID_PROVIDER', '启用外部或混合路由前必须选择主模型通道')
  }
  if (settings.routeMode !== 'local_governed') {
    const selected = providers.find((provider) => provider.id === settings.primaryProvider)
    if (!selected?.configured || !selected.modelConfigured) {
      throw new AiOperationsError('INVALID_PROVIDER', '主模型通道尚未完成密钥与模型配置，系统保持失败关闭')
    }
  }
  const normalized: AiRuntimeSettings = {
    routeMode: settings.routeMode,
    primaryProvider: settings.primaryProvider || undefined,
    fallbackProvider: settings.fallbackProvider || undefined,
    maxModelCalls: Math.min(1000, Math.max(1, Math.round(settings.maxModelCalls))),
    dailyBudgetCents: Math.max(0, Math.round(settings.dailyBudgetCents)),
    updatedAt: new Date().toISOString(),
    updatedByName: user.name,
  }
  if (!hasPostgresDatabaseUrl()) {
    memorySettings.set(schoolId, normalized)
    return normalized
  }
  const result = await getPostgresPool().query<{
    route_mode: AiRouteMode
    primary_provider: string | null
    fallback_provider: string | null
    max_model_calls: number
    daily_budget_cents: number
    updated_at: Date | string
  }>(
    `INSERT INTO ai_runtime_settings(school_id,route_mode,primary_provider,fallback_provider,max_model_calls,daily_budget_cents,updated_by,updated_at)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT(school_id) DO UPDATE SET route_mode=EXCLUDED.route_mode,primary_provider=EXCLUDED.primary_provider,
       fallback_provider=EXCLUDED.fallback_provider,max_model_calls=EXCLUDED.max_model_calls,daily_budget_cents=EXCLUDED.daily_budget_cents,
       updated_by=EXCLUDED.updated_by,updated_at=now()
     RETURNING route_mode,primary_provider,fallback_provider,max_model_calls,daily_budget_cents,updated_at`,
    [schoolId, normalized.routeMode, normalized.primaryProvider ?? null, normalized.fallbackProvider ?? null, normalized.maxModelCalls, normalized.dailyBudgetCents, user.id],
  )
  const row = result.rows[0]
  return { ...normalized, updatedAt: dateString(row.updated_at) }
}

export async function runAiOperationsDiagnostics(user: User): Promise<{ checkedAt: string; checks: AiDiagnosticCheck[] }> {
  const schoolId = requireOperator(user)
  const checks: AiDiagnosticCheck[] = []
  const providers = providerReadiness()
  checks.push({
    id: 'agent-catalog', label: 'Agent 团队目录', status: listAgentTeamCards().length >= 14 ? 'healthy' : 'attention',
    message: `已装载 ${listAgentTeamCards().length} 支角色团队与 ${listEnterpriseSkillContracts().length} 项核心业务能力`,
  })
  if (!hasPostgresDatabaseUrl()) {
    checks.push({ id: 'database', label: '持久化数据库', status: 'unavailable', message: '未配置 PostgreSQL，诊断不会伪造连接成功' })
  } else {
    try {
      const result = await getPostgresPool().query<{ tasks: number; tables_ready: number }>(
        `SELECT
          (SELECT count(*)::int FROM ai_task_runs WHERE school_id=$1::uuid) AS tasks,
          (SELECT count(*)::int FROM pg_class WHERE oid IN ('ai_task_runs'::regclass,'ai_runtime_settings'::regclass,'ai_feedback_events'::regclass,'ai_model_invocations'::regclass)) AS tables_ready`,
        [schoolId],
      )
      checks.push({
        id: 'database', label: '持久化数据库', status: result.rows[0]?.tables_ready === 4 ? 'healthy' : 'attention',
        message: `核心运维数据表 ${result.rows[0]?.tables_ready ?? 0}/4 就绪，已回读 ${result.rows[0]?.tasks ?? 0} 个租户任务`,
      })
    } catch (error) {
      checks.push({ id: 'database', label: '持久化数据库', status: 'unavailable', message: error instanceof Error ? error.message : '数据库检查失败' })
    }
  }
  const configured = providers.filter((provider) => provider.configured && provider.modelConfigured)
  checks.push({
    id: 'model-provider', label: '外部模型通道', status: configured.length > 0 ? 'healthy' : 'attention',
    message: configured.length > 0 ? `${configured.map((provider) => provider.name).join('、')} 已完成配置` : '尚未接入外部模型；白泽继续使用可审计的本地受控路由',
  })
  const overview = await getAiOperationsOverview(user)
  if (overview.settings.routeMode !== 'local_governed' && overview.settings.primaryProvider === 'deepseek') {
    try {
      const probe = await runGovernedModelProbe(schoolId, user.id)
      checks.push({
        id: 'model-live', label: 'DeepSeek 实际调用', status: 'healthy',
        message: `真实请求成功，${probe.latencyMs}ms，使用 ${probe.usage.totalTokens} Token；调用证据已写入模型账本`,
      })
    } catch (error) {
      const code = error instanceof GovernedModelGatewayError ? error.code : 'MODEL_PROBE_FAILED'
      checks.push({
        id: 'model-live', label: 'DeepSeek 实际调用', status: 'unavailable',
        message: `真实请求未通过（${code}），系统没有伪造通道健康状态`,
      })
    }
  } else {
    checks.push({ id: 'model-live', label: 'DeepSeek 实际调用', status: 'attention', message: '当前租户尚未启用 DeepSeek 路由，因此未发起计费探测' })
  }
  checks.push({
    id: 'governance', label: '治理与恢复队列',
    status: overview.governance.deadLetters > 0 || overview.governance.failedTools > 0 ? 'attention' : 'healthy',
    message: `待处理消息 ${overview.governance.pendingOutbox}，死信 ${overview.governance.deadLetters}，工具失败 ${overview.governance.failedTools}`,
  })
  return { checkedAt: new Date().toISOString(), checks }
}
