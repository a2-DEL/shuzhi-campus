import { authorize } from '@/lib/authorization'
import { BaizeToolError, type BaizeToolDomain, type BaizeToolResult } from './tools/registry'
import { createModelNextPlanner, executeBaizeReadLoop, BaizeExecutionError, type BaizeToolPhase, type BaizeToolStep } from './tools/executor'
import { classifyWithGovernedModel, type BaizeClassification } from './intent'
import { mergeBaizeQuerySlots } from './slots'
import { isBaizeModelCircuitOpen } from './guardrails'
import { isGovernedDeepSeekConfigured } from '@/lib/ai/model-gateway/service'
import type { NextRequest } from 'next/server'
import { conversationalIntent, isReadOnlyFollowUp, type BaizeConversationTurn } from './conversation'
import { getRoleAgentTeam, selectAgentForSkill } from '@/lib/ai/runtime/agent-catalog'
import { classifyAiCommand, getAiSkill } from '@/lib/ai/runtime/planner'
import { createAndPlanAiTask, listAccessibleAiTasks } from '@/lib/ai/runtime/orchestrator'
import type { AiTaskRecord, AiWorkflowStep } from '@/lib/ai/runtime/types'
import type { User } from '@/types'
import { answerKnowledgeWithRag } from '@/lib/ai/knowledge/service'
import { answerGeneralQuestion, type BaizeModelEvidence } from '@/lib/ai/model-gateway/baize'

export type BaizeAssistantMode = 'auto' | 'ask' | 'dispatch'
export type BaizeResponseKind = 'answer' | 'dispatch' | 'clarify'

export interface BaizeRepairDraft {
  type: 'repair'
  description?: string
  location?: string
}

export interface BaizeProgressCallbacks {
  onPhase?: (phase: BaizeToolPhase) => void
  onModelDelta?: (delta: string) => void
}

export interface BaizeAssistantInput {
  message: string
  mode?: BaizeAssistantMode
  skillId?: string
  params?: Record<string, unknown>
  workflow?: AiWorkflowStep[]
  history?: readonly BaizeConversationTurn[]
  conversationId?: string
  queryMessageId?: string
  draft?: BaizeRepairDraft
  verifiedId?: string
  ambiguousMemory?: boolean
}

export interface BaizeSource {
  label: string
  endpoint: string
  backend: 'postgres' | 'runtime' | 'knowledge'
  citationId?: string
  documentId?: string
  version?: number
  excerpt?: string
  score?: number
  recordCount?: number
  asOf?: string
}

export interface BaizeShardPlan {
  id: string
  name: string
  role: 'coordinator' | 'planner' | 'specialist'
  agentId: string
  avatar: string
  state: 'ROUTED' | 'RUNNING' | 'COMPLETED' | 'WAITING'
  skillId?: string
  purpose: string
}

export interface BaizeRouting {
  intent: string
  confidence: number
  priority: 'normal' | 'urgent' | 'critical'
  coordinator: { id: string; name: string; avatar: string }
  shards: BaizeShardPlan[]
  policy: 'READ_ONLY' | 'PREVIEW_REQUIRED' | 'APPROVAL_REQUIRED' | 'CLARIFICATION_REQUIRED'
}

export interface BaizeAssistantResponse {
  kind: BaizeResponseKind
  message: string
  routing: BaizeRouting
  sources: BaizeSource[]
  task?: AiTaskRecord
  answer?: {
    domain: string
    total: number
    pending: number
    completed: number
    latestAt?: string
    metrics?: Record<string, number>
  }
  suggestions: string[]
  model?: BaizeModelEvidence
  code?: string
  verifiedEntities?: Array<{ type: string; key: string; status?: string }>
  toolPhases?: BaizeToolPhase[]
  toolCalls?: number
  application?: { type: 'repair'; description?: string; location?: string; missing: string[]; href: string }
}

export class BaizeAssistantError extends Error {
  constructor(
    readonly code: 'UNAUTHENTICATED' | 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND',
    message: string
  ) {
    super(message)
    this.name = 'BaizeAssistantError'
  }
}

interface DomainSpec {
  id: BaizeToolDomain
  label: string
  terms: string[]
  endpoint: string
}

const DOMAIN_SPECS: DomainSpec[] = [
  { id: 'repair', label: '报修中心', terms: ['报修', '报休', '维修', '工单', 'repair'], endpoint: '/api/ai/business-records?domain=repair' },
  { id: 'notification', label: '通知中心', terms: ['通知', '消息', '推送', 'notification'], endpoint: '/api/ai/business-records?domain=notification' },
  { id: 'classroom', label: '教室资源', terms: ['教室', '教三', '课室', '场地', 'classroom'], endpoint: '/api/ai/business-records?domain=classroom' },
  { id: 'lost_found', label: '失物招领', terms: ['失物', '招领', '拾物', 'lost'], endpoint: '/api/ai/business-records?domain=lost_found' },
  { id: 'hygiene', label: '卫生整改', terms: ['卫生', '整改', 'hygiene'], endpoint: '/api/ai/business-records?domain=hygiene' },
  { id: 'dorm_safety', label: '宿舍安全', terms: ['宿舍安全', '消防', 'dorm safety'], endpoint: '/api/ai/business-records?domain=dorm_safety' },
  { id: 'dormitory', label: '宿舍运营', terms: ['宿舍', '宿管', '公寓', 'dorm'], endpoint: '/api/ai/business-records?domain=dormitory' },
  { id: 'visitor', label: '访客准入', terms: ['访客', '来访', '准入', 'visitor'], endpoint: '/api/ai/business-records?domain=visitor' },
  { id: 'energy', label: '能耗运维', terms: ['能耗', '电量', '电表', 'energy'], endpoint: '/api/ai/business-records?domain=energy' },
  { id: 'material', label: '物资管理', terms: ['物资', '库存', 'material'], endpoint: '/api/ai/business-records?domain=material' },
  { id: 'duty', label: '值日安排', terms: ['值日', '排班', 'duty'], endpoint: '/api/ai/business-records?domain=duty' },
]

const QUERY_TERMS = ['进度', '怎么样', '上次', '展示', '列出', '汇总', '表格', '给我看', '查一下', '\u67e5\u8be2', '\u67e5\u770b', '\u591a\u5c11', '\u72b6\u6001', '\u60c5\u51b5', '\u5217\u8868', '\u7edf\u8ba1', '\u8fdb\u5c55', '\u6709\u54ea\u4e9b', 'query', 'list', 'status', 'how many']
const ACTION_TERMS = [ '\u8bf7\u6267\u884c', '\u6267\u884c', '\u6d3e\u5355', '\u53d1\u5e03', '\u53d1\u9001', '\u9884\u7ea6', '\u8ba4\u9886', '\u6574\u6539', '\u5ba1\u6279', '\u786e\u8ba4', '\u5efa\u8bae', '\u641e\u5b9a', 'dispatch', 'publish', 'book', 'approve', 'execute']
const KNOWLEDGE_TERMS = ['\u5236\u5ea6', '\u89c4\u5b9a', '\u89c4\u7a0b', '\u6d41\u7a0b', '\u6750\u6599', '\u529e\u7406', '\u600e\u4e48\u529e', '\u4f9d\u636e', '\u8981\u6c42', '\u624b\u518c', '\u653f\u7b56', '\u7533\u8bf7', '\u8d44\u683c', '\u6761\u4ef6', '\u9700\u8981\u4ec0\u4e48', '\u591a\u4e45', '\u8c01\u8d1f\u8d23']

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function priorityFor(text: string, risk: string = 'low'): BaizeRouting['priority'] {
  if (risk === 'critical' || includesAny(text, ['\u7d27\u6025', '\u7acb\u5373', 'urgent', 'critical'])) return 'critical'
  if (risk === 'high' || includesAny(text, ['\u52a0\u6025', '\u5c3d\u5feb', 'asap'])) return 'urgent'
  return 'normal'
}

function baseRouting(user: User, intent: string, confidence: number, policy: BaizeRouting['policy'], priority: BaizeRouting['priority']): BaizeRouting {
  const team = getRoleAgentTeam(user.role)
  return {
    intent,
    confidence,
    priority,
    coordinator: { id: team.coordinator.id, name: team.coordinator.name, avatar: team.coordinator.avatar },
    shards: [{
      id: `${team.coordinator.id}-route`, name: team.coordinator.name, role: 'coordinator', agentId: team.coordinator.id,
      avatar: team.coordinator.avatar, state: 'ROUTED', purpose: '\u63a5\u6536\u767d\u6cfd\u6307\u4ee4\uff0c\u6267\u884c\u6743\u9650\u548c\u628a\u624b\u8def\u7531',
    }],
    policy,
  }
}

interface InferredWorkflow {
  primarySkillId: string
  primaryParams: Record<string, unknown>
  additional: AiWorkflowStep[]
}

export function inferBaizeWorkflow(message: string): InferredWorkflow | undefined {
  const text = message.toLocaleLowerCase()
  const joined = includesAny(text, ['\u5e76', '\u540c\u65f6', '\u4ee5\u53ca', '\u7136\u540e', '\u518d'])
  if (!joined) return undefined
  const hasRepairDispatch = includesAny(text, ['\u6d3e\u5355', 'dispatch']) && includesAny(text, ['\u62a5\u4fee', '\u7ef4\u4fee', 'repair'])
  const hasNotification = includesAny(text, ['\u901a\u77e5', '\u901a\u77e5\u5b66\u751f', '\u63a8\u9001', 'notification', 'notice'])
    && includesAny(text, ['\u53d1\u5e03', '\u53d1\u9001', '\u901a\u77e5', '\u63d0\u9192', 'publish', 'send'])
  if (!hasRepairDispatch || !hasNotification) return undefined
  return {
    primarySkillId: 'repair_dispatch',
    primaryParams: { count: 1, reason: message },
    additional: [{
      skillId: 'notification_publish',
      title: '\u901a\u77e5 Agent\u53d1\u5e03\u6d88\u606f',
      params: {
        title: '\u62a5\u4fee\u6d3e\u5355\u8fdb\u5c55\u901a\u77e5',
        content: message,
        type: 'SYSTEM',
        audience: { roles: ['student'], userIds: [], organizationIds: [] },
        channels: ['platform'],
        requireAcknowledgement: false,
      },
    }],
  }
}

function querySpec(message: string): DomainSpec | undefined {
  const text = message.toLocaleLowerCase()
  return DOMAIN_SPECS.find((spec) => includesAny(text, spec.terms))
}

async function answerBusinessQuestion(user: User, spec: DomainSpec, request: NextRequest, input: string, classification?: BaizeClassification, verifiedId?: string, executed?: BaizeToolResult, phases?: BaizeToolPhase[], conversationId?: string, progress?: BaizeProgressCallbacks, queryMessageId?: string): Promise<BaizeAssistantResponse> {
  const slots = mergeBaizeQuerySlots(input, classification)
  if (slots.clarification || ((spec.id === 'notification' || spec.id === 'energy') && (slots.args.locations?.length || slots.args.excludeLocations?.length))) {
    return { ...clarification(user, input, 'query.filters.ambiguous'),
      message: slots.clarification ?? '该业务域暂无可核验的楼栋地点字段，请改用其他明确的查询条件。' }
  }
  const args = slots.args
  const format = verifiedId ? 'list' : args.format ?? 'explain'
  const status = args.status ?? 'all'
  const limit = args.limit ?? 10
  let result: BaizeToolResult
  let toolPhases = phases
  try {
    if (executed) result = executed
    else {
      const plan = await executeBaizeReadLoop(user, request, conversationId ?? '', [
        { label: `${spec.label}查询`, args: { domain: spec.id, format, status, limit,
          location: args.location, locations: args.locations, excludeLocations: args.excludeLocations,
          ownerOnly: args.ownerOnly ?? false, excludeCompleted: args.excludeCompleted ?? false,
          id: verifiedId, dateFrom: args.dateFrom, dateTo: args.dateTo } },
      ], conversationId ? createModelNextPlanner(user, conversationId, input) : undefined, progress?.onPhase,
      undefined, { rawQuery: input, queryMessageId })
      result = plan.observations[0].result
      toolPhases = plan.phases
    }
  } catch (error) {
    if (error instanceof BaizeExecutionError) throw new BaizeAssistantError('BACKEND_UNAVAILABLE', error.message)
    if (error instanceof BaizeToolError) {
      if (error.code === 'FORBIDDEN') throw new BaizeAssistantError('FORBIDDEN', error.message)
      if (error.code === 'INVALID') throw new BaizeAssistantError('INVALID_REQUEST', error.message)
      if (error.code === 'NOT_FOUND') throw new BaizeAssistantError('NOT_FOUND', error.message)
      throw new BaizeAssistantError('BACKEND_UNAVAILABLE', error.message)
    }
    throw error
  }
  const { total, pending, completed, latestAt } = result
  if (/(?:如果|若).{0,10}超过\s*5\s*条.{0,15}(?:最近|最新).{0,5}3\s*条/.test(input) && total > 5) result.records = result.records.slice(0, 3)
  const routing = baseRouting(user, `${spec.id}.query`, classification?.confidence ?? 0.9, 'READ_ONLY', 'normal')
  const team = getRoleAgentTeam(user.role)
  routing.shards.push({ id: `${team.coordinator.id}-${spec.id}-reader`, name: `${spec.label}查询分灵`, role: 'specialist', agentId: `${team.coordinator.id}-${spec.id}-reader`, avatar: '🔎', state: 'COMPLETED', purpose: '通过服务端鉴权的 PG 读模型读取业务记录' })
  const display = result.records.map((row, index) => ({ index: index + 1, name: String(row.title ?? row.full_name ?? row.item_name ?? row.name ?? row.id ?? '记录'), status: String(row.status ?? '未知'), id: String(row.id ?? '') }))
  let responseMessage = `${spec.label}当前共 ${total} 条记录，待处理 ${pending} 条，已完成或可用 ${completed} 条。`
  if (result.aggregated) responseMessage = `数据量较大，已为你生成统计汇总：${spec.label}共 ${total} 条，待处理 ${pending} 条，已完成或可用 ${completed} 条。按地点前几项：${result.byLocation.slice(0, 5).map((entry) => `${entry.location} ${entry.count} 条`).join('，')}。如需明细，请指定楼栋或时间。`
  else if (total === 0) responseMessage = `在你有权限查看的范围内，符合条件的${spec.label}共 0 条。可以换个状态或地点再试试。`
  else if (format === 'count') responseMessage = `在你有权限查看的范围内，符合条件的${spec.label}共有 ${total} 条。`
  else if (format === 'table') responseMessage = `在你有权限查看的范围内，符合条件的${spec.label}共 ${total} 条：\n\n| 序号 | 记录 | 状态 |\n| --- | --- | --- |\n${display.map((r) => `| ${r.index} | ${r.name.replace(/\|/g, '／').slice(0, 60)} | ${r.status.replace(/\|/g, '／')} |`).join('\n')}`
  else if (/按(?:楼栋|地点)|各(?:楼栋|地点)|哪栋最多/.test(input)) responseMessage = `在你有权限查看的范围内，符合条件的${spec.label}共 ${total} 条；按地点统计：${result.byLocation.map((entry) => `${entry.location} ${entry.count} 条`).join('，')}。`
  else if (format === 'list') responseMessage += `\n${display.map((r) => `${r.index}. ${r.name}（${r.status}）`).join('\n')}`
  if (/占比/.test(input) && total > 0) responseMessage += `待处理占比 ${(pending / total * 100).toFixed(1)}%。`
  return {
    kind: 'answer', message: responseMessage, routing, toolPhases, toolCalls: toolPhases?.filter((phase) => phase.state === '执行中').length,
    answer: { domain: spec.id, total, pending, completed, latestAt },
    verifiedEntities: result.records.slice(0, 5).filter((row) => typeof row.id === 'string').map((row) => ({ type: spec.id, key: String(row.id), status: typeof row.status === 'string' ? row.status : undefined })),
    sources: [{ label: spec.label, endpoint: result.endpoint, backend: 'postgres', recordCount: total, asOf: latestAt }],
    suggestions: [`继续查询${spec.label}明细`, '查看其他校园服务'],
  }
}

function taskRouting(user: User, message: string, skillId: string, confidence: number, risk: string): BaizeRouting {
  const skill = getAiSkill(skillId)
  const agent = selectAgentForSkill(user.role, skillId)
  const routing = baseRouting(user, skill?.name ?? skillId, confidence, skill?.approvalPolicy === 'automatic' ? 'READ_ONLY' : 'PREVIEW_REQUIRED', priorityFor(message, risk))
  routing.shards.push({
    id: agent.id, name: agent.name, role: agent.role === 'reviewer' ? 'specialist' : agent.role, agentId: agent.id, avatar: agent.avatar, state: 'WAITING', skillId,
    purpose: `\u6267\u884c${skill?.name ?? skillId}\uff0c\u56de\u4f20\u53ef\u9a8c\u8bc1\u4e1a\u52a1\u6548\u679c`,
  })
  return routing
}

async function answerWithGovernedModel(user: User, message: string, history: readonly BaizeConversationTurn[] = [], conversationId?: string, progress?: BaizeProgressCallbacks, signal?: AbortSignal): Promise<BaizeAssistantResponse> {
  if (!isGovernedDeepSeekConfigured() || !user.school_id || await isBaizeModelCircuitOpen(user.school_id)) {
    throw new BaizeAssistantError('BACKEND_UNAVAILABLE', '当前智能助手运行于基础模式，复杂语义理解可能受限')
  }
  let hadDelta = false
  let narrative
  try {
    narrative = await answerGeneralQuestion(user, message, history, conversationId, progress?.onModelDelta
      ? (delta) => { hadDelta = true; progress.onModelDelta?.(delta) } : undefined, signal)
  } catch (error) {
    if (hadDelta) throw new BaizeAssistantError('BACKEND_UNAVAILABLE', '模型回复中断，请重试')
    if (!progress?.onModelDelta) throw error
    // No bytes reached the client: a separately audited non-stream request can safely retry.
    narrative = await answerGeneralQuestion(user, message, history, conversationId, undefined, signal)
  }
  const routing = baseRouting(user, 'general.question', 0.86, 'READ_ONLY', 'normal')
  routing.shards.push({
    id: narrative.evidence.invocationId, name: '\u7384\u67a2\u00b7DeepSeek \u8bed\u4e49\u5206\u7075', role: 'specialist',
    agentId: 'deepseek-assistant', avatar: '\u2726', state: 'COMPLETED', purpose: '\u5728\u53d7\u6cbb\u7406\u8fb9\u754c\u5185\u56de\u7b54\u4e00\u822c\u95ee\u9898',
  })
  return {
    kind: 'answer', message: narrative.text, routing, model: narrative.evidence, sources: [],
    suggestions: ['\u67e5\u8be2\u5f85\u5904\u7406\u62a5\u4fee', '\u67e5\u770b\u8bbf\u5ba2\u5ba1\u6279\u60c5\u51b5', '\u8fdb\u5165\u53d7\u63a7\u4efb\u52a1\u8c03\u5ea6'],
  }
}


async function answerWithKnowledge(user: User, message: string): Promise<BaizeAssistantResponse> {
  const rag = await answerKnowledgeWithRag(user, message)
  const routing = baseRouting(user, rag.status === 'ANSWERED' ? 'knowledge.rag' : 'knowledge.refused', rag.confidence, 'READ_ONLY', 'normal')
  routing.shards.push(
    { id: `${rag.retrieval.id}-acl`, name: '\u736c\u8c78\u00b7\u6743\u9650\u5b88\u95e8\u5206\u7075', role: 'specialist', agentId: 'knowledge-acl', avatar: '\ud83d\udee1\ufe0f', state: 'COMPLETED', purpose: '\u6267\u884c\u79df\u6237\u3001\u89d2\u8272\u4e0e\u7ec4\u7ec7\u7ea7\u77e5\u8bc6\u88c1\u526a' },
    { id: `${rag.retrieval.id}-hybrid`, name: '\u7384\u9f9f\u00b7\u6df7\u5408\u68c0\u7d22\u5206\u7075', role: 'specialist', agentId: 'knowledge-hybrid', avatar: '\ud83d\udc22', state: 'COMPLETED', purpose: '\u5e76\u884c\u53ec\u56de\u5168\u6587\u3001\u7279\u5f81\u5411\u91cf\u548c\u5df2\u5ba1\u6838\u56fe\u8c31\u4f9d\u636e' },
    { id: `${rag.retrieval.id}-citation`, name: '\u7075\u9e4a\u00b7\u5f15\u7528\u6838\u9a8c\u5206\u7075', role: 'specialist', agentId: 'knowledge-citation', avatar: '\ud83d\udc26', state: 'COMPLETED', purpose: '\u6838\u5bf9\u6587\u6863\u7248\u672c\u3001\u6765\u6e90\u7247\u6bb5\u4e0e\u7b54\u590d\u6807\u7b7e' },
  )
  if (rag.retrieval.model) routing.shards.push({ id: rag.retrieval.model.invocationId, name: '\u7384\u67a2\u00b7DeepSeek \u5f15\u7528\u5f52\u6574\u5206\u7075', role: 'specialist', agentId: 'deepseek-rag', avatar: '\u2726', state: 'COMPLETED', purpose: '\u53ea\u4f9d\u636e\u5df2\u6838\u9a8c\u5f15\u7528\u7ec4\u7ec7\u81ea\u7136\u8bed\u8a00\u7b54\u590d' })
  return {
    kind: rag.status === 'ANSWERED' ? 'answer' : 'clarify',
    message: rag.answer,
    routing,
    model: rag.retrieval.model,
    code: rag.refusalCode,
    sources: rag.citations.map((citation) => ({ label: `[${citation.label}] ${citation.documentTitle}`, endpoint: `/api/ai/knowledge/${citation.documentId}`, backend: 'knowledge' as const, recordCount: 1, citationId: citation.label, documentId: citation.documentId, version: citation.version, excerpt: citation.excerpt, score: citation.score })),
    suggestions: rag.status === 'ANSWERED' ? ['\u7ee7\u7eed\u8ffd\u95ee\u8be5\u5236\u5ea6\u7684\u6267\u884c\u6d41\u7a0b', '\u6253\u5f00\u767d\u6cfd\u77e5\u85cf\u67e5\u770b\u539f\u59cb\u4f9d\u636e'] : ['\u8865\u5145\u4e1a\u52a1\u8303\u56f4\u6216\u5173\u952e\u8bcd', '\u8054\u7cfb\u77e5\u8bc6\u7ba1\u7406\u5458\u53d1\u5e03\u89c4\u7a0b'],
  }
}

function conversationalReply(user: User, intent: Exclude<ReturnType<typeof conversationalIntent>, null>): BaizeAssistantResponse {
  const messages = {
    greeting: '您好！我是白泽，很高兴见到您。今天想聊点什么，或者需要我帮您查些什么吗？',
    identity: '我是白泽，数智星图的 AI 智能助手。我可以帮您了解校园服务、查询您有权限查看的业务信息，也能协助整理受控任务方案。需要执行操作时，我会先确认权限和审批，不会擅自修改数据。',
    capabilities: '我可以帮您查询有权限查看的报修、教室等校园信息，解答系统使用问题；如果您的角色有权限，也可以先生成派单或通知等任务预览，得到审批后才执行。您想先了解哪一项？',
  } satisfies Record<Exclude<ReturnType<typeof conversationalIntent>, null>, string>
  return {
    kind: 'answer', message: messages[intent], routing: baseRouting(user, `conversation.${intent}`, 0.99, 'READ_ONLY', 'normal'),
    sources: [], suggestions: ['查询待处理报修', '你能帮我做什么'],
  }
}

function previousTopic(history: readonly BaizeConversationTurn[]): { spec?: DomainSpec; message?: string } {
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user') continue
    const spec = querySpec(turn.content)
    if (spec) return { spec, message: turn.content }
    if (conversationalIntent(turn.content) || !isReadOnlyFollowUp(turn.content)) return {}
  }
  const indexed = [...history].reverse().find((turn) => turn.role === 'assistant' && turn.content.includes('历史记录索引'))
  const remembered = DOMAIN_SPECS.find((item) => indexed?.content.includes(`${item.id}:`))
  return remembered ? { spec: remembered } : {}
}

function clarification(user: User, message: string, intent = '\u5f85\u6f84\u6e05\u8bf7\u6c42'): BaizeAssistantResponse {
  return {
    kind: 'clarify',
    message: `\u6211\u542c\u5230\u4e86\uff1a\u201c${message}\u201d\u3002\u4f46\u8fd9\u4e2a\u8bf7\u6c42\u8fd8\u6ca1\u6709\u5bf9\u5e94\u5230\u5df2\u53d1\u5e03\u7684\u53d7\u63a7 Skill\u3002\u8bf7\u8865\u5145\u4e1a\u52a1\u57df\u3001\u76ee\u6807\u548c\u671f\u671b\u52a8\u4f5c\uff0c\u6211\u4e0d\u4f1a\u64c5\u81ea\u5047\u8bbe\u6216\u5199\u5e93\u3002`,
    routing: baseRouting(user, intent, 0.32, 'CLARIFICATION_REQUIRED', 'normal'),
    sources: [],
    suggestions: ['\u67e5\u8be2\u5f85\u5904\u7406\u62a5\u4fee', '\u67e5\u8be2\u8bbf\u5ba2\u5ba1\u6279\u60c5\u51b5', '\u751f\u6210\u53d7\u63a7\u62a5\u4fee\u6d3e\u5355 Preview'],
  }
}

function repairApplication(user: User, message: string, existing?: BaizeRepairDraft, model?: BaizeClassification): BaizeAssistantResponse {
  const draft: BaizeRepairDraft = { type: 'repair', ...existing }
  const trimmed = message.trim()
  const location = model?.location ?? /(?:在|位置(?:是|在)?|地点(?:是|在)?)(.{2,48}?(?:楼|栋|宿舍|室|号)(?:.{0,12})?)/.exec(trimmed)?.[1]
  if (location) draft.location = location.slice(0, 120)
  const description = model?.description ?? (/(?:坏了|漏水|故障|损坏|不亮|不通|无法使用)/.test(trimmed) ? trimmed : undefined)
  if (description) draft.description = description.slice(0, 500)
  const missing = [!draft.description ? '故障描述' : '', !draft.location ? '报修地点' : ''].filter(Boolean)
  const application = { ...draft, missing, href: '/student/repair/create' }
  const text = missing.length
    ? `我先帮你整理报修申请。还需要补充${missing.join('和')}，可以直接告诉我；我不会替你提交。`
    : `我整理好了报修申请：${draft.description}，地点：${draft.location}。请打开报修表单核对并提交；对话中不会直接写入工单，后续办理依照现有审批流程。`
  return { kind: 'clarify', message: text, application,
    routing: baseRouting(user, 'repair.application', 0.85, 'PREVIEW_REQUIRED', 'normal'),
    sources: [], suggestions: missing.length ? ['补充报修地点', '描述故障情况'] : ['打开报修表单核对申请'] }
}

export async function handleBaizeRequest(user: User, input: BaizeAssistantInput, request: NextRequest, progress?: BaizeProgressCallbacks): Promise<BaizeAssistantResponse> {
  if (!user.school_id) throw new BaizeAssistantError('TENANT_REQUIRED', '\u5f53\u524d\u8eab\u4efd\u6ca1\u6709\u7ed1\u5b9a\u5b66\u6821\u79df\u6237')
  const message = input.message.trim()
  if (!message) throw new BaizeAssistantError('INVALID_REQUEST', '\u8bf7\u5148\u544a\u8bc9\u767d\u6cfd\u4f60\u60f3\u67e5\u4ec0\u4e48\u6216\u8ba9\u5b83\u6267\u884c\u4ec0\u4e48')
  if (input.ambiguousMemory) return { ...clarification(user, message, 'repair.reference.ambiguous'),
    message: '你此前提到过不止一条报修工单，请提供工单编号或位置，确认后我会按当前权限重新查询。' }

  const readQuestion = /(?:查一下|查询|查看|统计|多少|列出|我提交的|换个话题)/.test(message)
  if (input.mode !== 'dispatch' && !readQuestion && ((input.draft && !/(记录|进度)/.test(message)) || /(?:我要|帮我|想|申请|提交).{0,6}报修/.test(message))) {
    const model = input.conversationId ? await classifyWithGovernedModel(user, input.conversationId, message, input.history ?? []) : null
    return repairApplication(user, message, input.draft, model ?? undefined)
  }

  const inferredWorkflow = !input.workflow?.length && !input.skillId ? inferBaizeWorkflow(message) : undefined
  const workflow = input.workflow ?? inferredWorkflow?.additional
  const requestedSkillId = input.skillId ?? inferredWorkflow?.primarySkillId
  const requestedParams = input.params ?? inferredWorkflow?.primaryParams ?? {}
  const forcedDispatch = input.mode === 'dispatch' && Boolean(requestedSkillId || workflow?.length)
  // Chit-chat never creates Skill tasks; previous turns are only hints for read-only questions.
  if (!forcedDispatch) {
    const intent = conversationalIntent(message)
    if (intent) return conversationalReply(user, intent)
  }
  const modelIntent = !forcedDispatch && input.conversationId ? await classifyWithGovernedModel(user, input.conversationId, message, input.history ?? []) : null
  if (!forcedDispatch && modelIntent?.intent === 'business_application' && !/(?:查一下|查询|查看|统计|列出|给我看)/.test(message)) return { ...clarification(user, message, 'business.application'), message: '我可以先帮你整理申请，但不会直接提交或修改业务数据。请在对应业务表单补齐信息；派单等受控操作请在右侧生成预览，并由有权限的人审批。', suggestions: ['打开报修表单', '生成受控调度方案'] }
  if (!forcedDispatch && modelIntent?.intent === 'greeting') return conversationalReply(user, 'greeting')
  if (!forcedDispatch && modelIntent?.intent === 'identity') return conversationalReply(user, 'identity')
  if (!forcedDispatch && modelIntent?.intent === 'capabilities') return conversationalReply(user, 'capabilities')
  let parsed: ReturnType<typeof classifyAiCommand> | undefined
  try {
    parsed = classifyAiCommand(message, requestedSkillId, requestedParams)
  } catch {
    parsed = undefined
  }
  if (!forcedDispatch && /我(?:的|所在)(?:宿舍|寝室)|我住哪(?:间|个)宿舍/.test(message)) {
    return { ...clarification(user, message, 'dormitory.personal.unlinked'),
      message: '当前身份资料中没有可核验的本人宿舍和房间关联，我不能根据楼栋列表推断宿舍号。请到个人中心核对，或联系宿管补全住宿绑定。' }
  }
  if (!forcedDispatch && /我(?:的|所在)(?:班级|班)/.test(message) && !/(值日|报修|记录)/.test(message)) {
    return { kind: 'answer', message: user.class_name ? `你当前身份资料登记的班级是“${user.class_name}”。如有变更，请联系管理员核对。` : '当前身份资料未登记班级，无法确认你的班级；请联系管理员核对。',
      routing: baseRouting(user, 'identity.class', 1, 'READ_ONLY', 'normal'), sources: [], suggestions: ['查询本周值日安排'] }
  }
  const topic = !forcedDispatch && isReadOnlyFollowUp(message) ? previousTopic(input.history ?? []) : {}
  const explicitSpec = querySpec(message)
  if (modelIntent?.domain && explicitSpec && modelIntent.domain !== explicitSpec.id) {
    return { ...clarification(user, message, 'query.domain.conflict'), message: '你提到的业务与模型识别结果不一致，请明确要查询的业务领域。' }
  }
  const spec = (modelIntent?.domain ? DOMAIN_SPECS.find((item) => item.id === modelIntent.domain) : undefined) ?? explicitSpec ?? topic.spec
  if (!forcedDispatch && /^(?:帮我)?查一下报修[。？?]?$/.test(message)) return { ...clarification(user, message, 'repair.query.clarify'), message: '请问你想查询哪种状态的报修？也可以说“全部报修”或“我提交的报修”。' }
  const asksStructuredQuery = includesAny(message.toLocaleLowerCase(), QUERY_TERMS)
  const explicitReadRequest = /(?:查一下|查询|查看|统计|列出|给我看|多少|情况|状态|进度)/.test(message)
  const asksQuestion = input.mode === 'ask' || asksStructuredQuery
  const asksAction = forcedDispatch || (includesAny(message.toLocaleLowerCase(), ACTION_TERMS) && !explicitReadRequest)

  const segments = !forcedDispatch && /(再(?:查|看|统计)|然后|同时|以及)/.test(message)
    ? message.split(/[,，]?\s*(?:再(?:查|看|统计)|然后|同时|以及)/).map((part) => part.trim()).filter(Boolean)
    : []
  const localSteps: BaizeToolStep[] = segments.length > 1 ? segments.map((part): BaizeToolStep | null => {
    const domain = querySpec(part)
    const slots = mergeBaizeQuerySlots(part, undefined)
    return domain ? { label: `${domain.label}查询`, args: { domain: domain.id, ...slots.args } } : null
  }).filter((step): step is BaizeToolStep => step !== null) : []
  if (!forcedDispatch && ((modelIntent?.intent === 'business_query' && (modelIntent.queries?.length ?? 0) > 1) || localSteps.length > 1)) {
    const steps: BaizeToolStep[] = modelIntent?.queries && modelIntent.queries.length > 1 ? modelIntent.queries.map((query) => ({ label: `${query.domain}查询`,
      args: { ...query, status: query.status ?? modelIntent.status ?? 'all', limit: query.limit ?? modelIntent.limit ?? 10,
        format: query.format ?? modelIntent.format ?? 'explain' } })) : localSteps
    if (segments.length <= 1 && steps.length > 1) {
      const commonSlots = mergeBaizeQuerySlots(message, undefined)
      if (commonSlots.clarification || commonSlots.args.locations?.length || commonSlots.args.excludeLocations?.length) {
        return { ...clarification(user, message, 'query.filters.ambiguous'),
          message: commonSlots.clarification ?? '多个业务查询的地点条件归属不明确，请分别说明每个业务的地点。' }
      }
    }
    const checked = steps.map((step, index) => ({ step, slots: mergeBaizeQuerySlots(segments[index] ?? message, step.args) }))
    const invalid = checked.find((item) => item.slots.clarification)
    if (invalid) return { ...clarification(user, message, 'query.filters.ambiguous'), message: invalid.slots.clarification! }
    const mergedSteps = checked.map(({ step, slots }) => ({ ...step, args: { ...step.args, ...slots.args } }))
    const run = await executeBaizeReadLoop(user, request, input.conversationId ?? '', mergedSteps,
      input.conversationId ? createModelNextPlanner(user, input.conversationId, message) : undefined, progress?.onPhase,
      undefined, { rawQuery: message, queryMessageId: input.queryMessageId })
    const results = await Promise.all(run.observations.map(async (item) => {
      const domain = DOMAIN_SPECS.find((entry) => entry.id === item.result.domain)
      if (!domain) throw new BaizeAssistantError('INVALID_REQUEST', '不支持的业务查询领域')
      return answerBusinessQuestion(user, domain, request, modelIntent?.queries && modelIntent.queries.length > 1 ? message : (segments[item.step - 1] ?? message),
        modelIntent ? { ...modelIntent, domain: item.result.domain, status: item.args.status, format: item.args.format } : undefined,
        input.verifiedId, item.result, run.phases, input.conversationId)
    }))
    return { kind: 'answer', message: results.map((item) => item.message).join('\n\n'),
      routing: baseRouting(user, 'business.multi_query', modelIntent?.confidence ?? 0.8, 'READ_ONLY', 'normal'),
      sources: results.flatMap((item) => item.sources), suggestions: ['继续查询明细'], toolPhases: run.phases,
      toolCalls: run.observations.length, verifiedEntities: results.flatMap((item) => item.verifiedEntities ?? []) }
  }
  const proceduralQuestion = /(?:为什么|如何|怎样|怎么|解释|说明)/.test(message) && !/(?:查一下|统计|列出|给我看|一共有|多少条)/.test(message)
  const currentBusinessQuestion = Boolean(explicitSpec) && !asksAction && !includesAny(message.toLocaleLowerCase(), KNOWLEDGE_TERMS)
  if (!forcedDispatch && spec && !proceduralQuestion && ((modelIntent?.intent === 'business_query' && (asksStructuredQuery || currentBusinessQuestion || Boolean(topic.spec)))
    || (asksStructuredQuery && !asksAction) || (input.mode === 'ask' && currentBusinessQuestion))) return answerBusinessQuestion(user, spec, request, message, modelIntent ?? undefined, input.verifiedId, undefined, undefined, input.conversationId, progress, input.queryMessageId)
  if (!forcedDispatch && (input.mode === 'ask' || includesAny(message.toLocaleLowerCase(), KNOWLEDGE_TERMS)) && !asksAction) {
    try {
      const knowledgeQuestion = topic.message ? `${topic.message.slice(0, 160)}；追问：${message}` : message
      const knowledge = await answerWithKnowledge(user, knowledgeQuestion)
      if (knowledge.kind === 'answer' || includesAny(message.toLocaleLowerCase(), KNOWLEDGE_TERMS)) return knowledge
    } catch {
      // Fall through to the governed general assistant only when this is not an institution-specific knowledge request.
    }
    if (input.mode === 'ask') {
      try { return await answerWithGovernedModel(user, message, input.history, input.conversationId, progress, request.signal) } catch (error) { if (error instanceof BaizeAssistantError && error.message.includes('模型回复中断')) throw error; return clarification(user, message, 'knowledge.unavailable') }
    }
  }
  if (!parsed || !getAiSkill(parsed.skillId)) {
    if (input.mode === 'ask') {
      try { return await answerWithGovernedModel(user, message, input.history, input.conversationId, progress, request.signal) } catch (error) { if (error instanceof BaizeAssistantError && error.message.includes('模型回复中断')) throw error; /* fail closed to explicit clarification */ }
    }
    if (topic.message) {
      return {
        ...clarification(user, message, 'conversation.follow_up'),
        message: `你刚才提到“${topic.message.slice(0, 60)}”。我可以接着聊这个话题；你更想了解哪一方面？涉及校园记录时，我会先按你的权限核对。`,
      }
    }
    return clarification(user, message)
  }

  if (!forcedDispatch) return { ...clarification(user, message, 'business.application'), message: '我已理解你的办理意向，但对话不会直接写入业务数据。请在业务表单填写申请；需要派单等操作，请在受控调度区生成预览并按原有 Skill 审批流程执行。' }
  const skill = getAiSkill(parsed.skillId)!
  if (!skill.executable || !skill.gatewaySkillKey) {
    if (spec) return answerBusinessQuestion(user, spec, request, message, modelIntent ?? undefined, input.verifiedId, undefined, undefined, input.conversationId)
    return clarification(user, message, `${skill.id}.read_only`)
  }
  const routing = taskRouting(user, message, skill.id, parsed.confidence, skill.riskLevel)
  const task = await createAndPlanAiTask(user, { command: message, skillId: skill.id, params: parsed.params, workflow })
  const stateMessage = task.state === 'AWAITING_APPROVAL'
    ? `\u6211\u5df2\u5c06\u8bf7\u6c42\u62c6\u89e3\u4e3a ${task.nodes.length} \u4e2a Agent \u8282\u70b9\uff0c\u771f\u5b9e Preview \u5df2\u5c31\u7eea\u3002\u8bf7\u5ba1\u6279\u540e\u6211\u624d\u4f1a\u8ba9\u6210\u5458\u6267\u884c\u3002`
    : task.state === 'COMPLETED' ? (task.summary ?? '\u4efb\u52a1\u5df2\u5b8c\u6210\u5e76\u901a\u8fc7\u56de\u8bfb\u9a8c\u8bc1')
      : task.blocker?.message ?? `\u5df2\u521b\u5efa\u53d7\u63a7\u4efb\u52a1\uff0c\u5f53\u524d\u72b6\u6001\u4e3a ${task.state}`
  routing.policy = task.approvalPolicy === 'automatic' ? 'READ_ONLY' : 'APPROVAL_REQUIRED'
  const coordinator = routing.coordinator
  routing.shards = [
    { id: `${coordinator.id}-route`, name: coordinator.name, role: 'coordinator', agentId: coordinator.id, avatar: coordinator.avatar, state: task.state === 'COMPLETED' ? 'COMPLETED' : 'ROUTED', purpose: '\u4e3b\u8111\u5206\u53d1\u3001\u76d1\u63a7\u548c\u6c47\u62a5' },
    ...task.nodes.map((node) => ({ id: node.id, name: node.agentName, role: 'specialist' as const, agentId: node.agentId, avatar: node.agentAvatar, state: node.state === 'COMPLETED' ? 'COMPLETED' as const : node.state === 'RUNNING' ? 'RUNNING' as const : 'WAITING' as const, skillId: node.skillId, purpose: node.title })),
  ]
  return {
    kind: 'dispatch', message: stateMessage, routing, sources: [], task,
    suggestions: task.state === 'AWAITING_APPROVAL' ? ['\u6253\u5f00 Preview \u5e76\u5ba1\u6279', '\u67e5\u770b Agent \u5206\u5de5'] : ['\u67e5\u8be2\u4e1a\u52a1\u56de\u8bfb', '\u6253\u5f00\u5ba1\u8ba1\u8bc1\u636e'],
  }
}

export async function summarizeBaizeTasks(user: User): Promise<BaizeAssistantResponse> {
  const tasks = await listAccessibleAiTasks(user)
  const active = tasks.filter((task) => ['AWAITING_APPROVAL', 'QUEUED', 'RUNNING', 'VERIFYING'].includes(task.state))
  const team = getRoleAgentTeam(user.role)
  const routing = baseRouting(user, '\u4efb\u52a1\u8fd0\u884c\u6001', 0.96, 'READ_ONLY', active.length > 0 ? 'urgent' : 'normal')
  routing.shards.push(...active.slice(0, 4).map((task) => ({
    id: task.id, name: task.title, role: 'specialist' as const, agentId: task.nodes[0]?.agentId ?? team.coordinator.id,
    avatar: task.nodes[0]?.agentAvatar ?? team.coordinator.avatar, state: task.state === 'RUNNING' ? 'RUNNING' as const : 'WAITING' as const,
    skillId: task.intent.skillId, purpose: task.command,
  })))
  return {
    kind: 'answer',
    message: active.length > 0 ? `\u767d\u6cfd\u6b63\u5728\u76d1\u63a7 ${active.length} \u4e2a\u53d7\u63a7\u4efb\u52a1\uff0c\u6700\u8fd1\u4e00\u4e2a\u662f\u201c${active[0].title}\u201d\u3002` : '\u5f53\u524d\u6ca1\u6709\u9700\u8981\u6301\u7eed\u76d1\u63a7\u7684\u53d7\u63a7\u4efb\u52a1\u3002',
    routing,
    sources: [{ label: '\u767d\u6cfd\u4efb\u52a1\u8fd0\u884c\u65f6\u95f4\u7ebf', endpoint: '/api/ai/tasks', backend: 'runtime', recordCount: tasks.length, asOf: new Date().toISOString() }],
    suggestions: ['\u67e5\u8be2\u5f85\u5904\u7406\u62a5\u4fee', '\u8fdb\u5165 Agent \u6267\u884c\u76d1\u63a7'],
  }
}


