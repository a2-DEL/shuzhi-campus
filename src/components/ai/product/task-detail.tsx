import { AlertCircle, Bot, Check, CheckCircle2, Clock3, Eye, Fingerprint, MessagesSquare, ShieldCheck, UserCheck, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AiProductTask } from '@/lib/ai/product-types'
import { approvalLabel, messageTypeLabel, naturalValue, nodeStateLabel, riskLevelLabel, skillDisplayName } from '@/lib/ai/presentation'

const STATUS: Record<string, { label: string; className: string }> = {
  planning: { label: '规划中', className: 'bg-slate-100 text-slate-700' },
  awaiting_approval: { label: '待审批', className: 'bg-amber-100 text-amber-800' },
  queued: { label: '已入队', className: 'bg-blue-100 text-blue-800' },
  running: { label: '执行中', className: 'bg-indigo-100 text-indigo-800' },
  verified: { label: '已验证', className: 'bg-emerald-100 text-emerald-800' },
  failed: { label: '执行受阻', className: 'bg-red-100 text-red-800' },
  cancelled: { label: '已安全取消', className: 'bg-gray-100 text-gray-700' },
}

const LIFECYCLE = [
  ['PREPARE', '准备'],
  ['PREVIEW', '预览'],
  ['APPROVE', '审批'],
  ['REVALIDATE', '复核'],
  ['COMMIT', '提交'],
  ['VERIFY', '回读'],
  ['REPORT', '汇报'],
] as const

const FIELD_LABELS: Record<string, string> = {
  count: '处理数量',
  reason: '执行说明',
  title: '通知主题',
  content: '通知内容',
  type: '业务类型',
  channels: '触达方式',
  requireAcknowledgement: '需要确认查收',
  scheduledAt: '计划发布时间',
  startsAt: '开始时间',
  endsAt: '结束时间',
  purpose: '用途',
  attendeeCount: '参与人数',
  humanConfirmed: '已完成人工核验',
  verificationEvidence: '核验说明',
  dueAt: '要求完成时间',
  requirements: '整改要求',
  severity: '重要程度',
  onsiteConfirmed: '已完成现场确认',
  outcome: '人工处理结论',
  note: '现场说明',
  decision: '准入决定',
  rationale: '决定依据',
  validFrom: '有效开始时间',
  validUntil: '有效结束时间',
  recommendedAction: '维护建议',
  confidence: '建议可信度',
  estimatedSavingsKwh: '预计节能量',
  targetCount: '预计影响记录',
  conflictCount: '发现冲突',
  deliveryCost: '预计触达工作量',
  warnings: '执行提醒',
}

const HIDDEN_FIELD = /(id|hash|token|version|key|scope|evidence)$/i
const WARNING_LABELS: Record<string, string> = {
  sensitive_content_detected: '发现可能涉及敏感内容，需要人工复核',
  human_identity_evidence_required: '需要人工核验身份凭据',
  ai_score_is_advisory_only: 'AI 评分仅作建议',
  human_onsite_decision: '结论必须来自现场人工确认',
  no_punitive_ai_conclusion: 'AI 不生成惩戒性结论',
  one_time_qr_will_be_issued: '通过后签发一次性短效凭证',
  recommendation_is_advisory: '维护建议仅作决策参考',
  no_random_or_synthetic_curve: '仅使用真实读数，不使用合成曲线',
}

interface Fact { label: string; value: string }

function audienceText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '由服务端按权限解析'
  const audience = value as Record<string, unknown>
  const roles = Array.isArray(audience.roles) ? audience.roles.length : 0
  const users = Array.isArray(audience.userIds) ? audience.userIds.length : 0
  const organizations = Array.isArray(audience.organizationIds) ? audience.organizationIds.length : 0
  const parts = [roles ? `${roles} 类角色` : '', users ? `${users} 名指定人员` : '', organizations ? `${organizations} 个组织` : ''].filter(Boolean)
  return parts.join('、') || '由服务端按权限解析'
}

function formatWarning(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '无额外提醒'
  return value.map((item) => WARNING_LABELS[String(item)] ?? '存在一项需要人工留意的条件').join('；')
}

function recordFacts(value: Record<string, unknown> | undefined, limit = 8): Fact[] {
  if (!value) return []
  const facts: Fact[] = []
  if ('audience' in value) facts.push({ label: '目标受众', value: audienceText(value.audience) })
  if ('stateChanges' in value) facts.push({ label: '状态变化', value: '已由业务规则校验并纳入执行预览' })
  if ('affectedResources' in value && Array.isArray(value.affectedResources)) facts.push({ label: '涉及资源', value: `${value.affectedResources.length} 项` })
  for (const [key, item] of Object.entries(value)) {
    if (facts.length >= limit || key === 'audience' || key === 'stateChanges' || key === 'affectedResources' || HIDDEN_FIELD.test(key)) continue
    const label = FIELD_LABELS[key]
    if (!label) continue
    facts.push({ label, value: key === 'warnings' ? formatWarning(item) : naturalValue(item) })
  }
  return facts
}

function lifecycleDone(task: AiProductTask, stage: string): boolean {
  const hasPreview = task.nodes.some((node) => Boolean(node.preview))
  const hasEffect = task.nodes.some((node) => Boolean(node.effect))
  const allVerified = task.nodes.length > 0 && task.nodes.every((node) => node.effect?.status === 'VERIFIED')
  if (stage === 'PREPARE' || stage === 'PREVIEW') return hasPreview
  if (stage === 'APPROVE') return task.approval.status === 'APPROVED' || task.approval.requiredCount === 0
  if (stage === 'REVALIDATE' || stage === 'COMMIT') return hasEffect
  if (stage === 'VERIFY' || stage === 'REPORT') return allVerified
  return false
}

function Facts({ facts, empty = '结构化业务参数已通过服务端校验' }: { facts: Fact[]; empty?: string }) {
  if (facts.length === 0) return <p className="rounded-xl border border-dashed bg-gray-50 p-3 text-sm text-gray-500">{empty}</p>
  return <div className="grid gap-2 sm:grid-cols-2">{facts.map((fact, index) => <div key={`${fact.label}-${index}`} className="rounded-xl border bg-gray-50 p-3"><p className="text-xs text-gray-400">{fact.label}</p><p className="mt-1 break-words text-sm font-medium text-gray-800">{fact.value}</p></div>)}</div>
}

export function TaskStatusBadge({ task }: { task: AiProductTask }) {
  const config = STATUS[task.status] ?? STATUS.planning
  return <Badge className={config.className}>{config.label}</Badge>
}

export function TaskDetail({
  task,
  deciding = false,
  onDecision,
}: {
  task: AiProductTask
  deciding?: boolean
  onDecision?: (action: 'confirm' | 'reject') => void
}) {
  const canDecide = task.state === 'AWAITING_APPROVAL'
  const previewReady = task.nodes.every((node) => Boolean(node.preview))
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="text-lg">{task.title.replace(/\s+task$/i, '')}</CardTitle><p className="mt-1 text-sm leading-6 text-gray-500">{task.command}</p></div>
            <div className="flex items-center gap-2"><Badge variant="outline">{riskLevelLabel(task.riskLevel)}</Badge><TaskStatusBadge task={task} /></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-4"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">业务能力</p><p className="mt-1 font-medium">{skillDisplayName(task.skill.key ?? task.skill.id)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">执行方式</p><p className="mt-1 font-medium">{task.plan.executionMode === 'fan_out' ? '多 Agent 并行协同' : '单链路受控执行'}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">审批要求</p><p className="mt-1 font-medium">{approvalLabel(task.approval.policy)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">节点进度</p><p className="mt-1 font-medium">{task.nodes.filter((node) => node.state === 'COMPLETED').length}/{task.nodes.length} 已完成</p></div></div>

          <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><ShieldCheck className="h-4 w-4 text-blue-600" />受控执行链</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{LIFECYCLE.map(([stage, label]) => { const done = lifecycleDone(task, stage); return <div key={stage} className={`rounded-xl border px-2 py-2 text-center text-xs font-medium ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}><div className="mb-1 flex justify-center">{done ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}</div>{label}</div> })}</div></div>

          {task.blocker && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">执行被安全阻断</p><p className="mt-1">{task.blocker.message}</p></div></div>}
        </CardContent>
      </Card>

      {task.nodes.map((node, index) => {
        const inputFacts = recordFacts(node.input)
        const requestedInputFacts = recordFacts(node.requestedInput ?? node.input)
        const inputChanged = JSON.stringify(node.requestedInput ?? node.input) !== JSON.stringify(node.input)
        const previewFacts = recordFacts(node.preview?.summary)
        const resultFacts = recordFacts(node.effect?.result)
        return <Card key={node.id} className="overflow-hidden"><CardHeader className="border-b bg-gray-50/70 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-lg">{node.agent.avatar}</span><span>分灵体 {index + 1} · {node.agent.name}</span></CardTitle><Badge variant="outline">{nodeStateLabel(node.state)}</Badge></div><p className="text-xs text-gray-500">{node.title}</p></CardHeader><CardContent className="space-y-5 pt-4">
          <div className="grid gap-3 md:grid-cols-2"><div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><Bot className="h-4 w-4 text-indigo-600" />原始请求参数</p><Facts facts={requestedInputFacts} /></div><div className={inputChanged ? 'rounded-xl border border-amber-300 bg-amber-50 p-3' : ''}><p className="mb-2 text-sm font-semibold text-gray-800">实际生效参数{inputChanged ? ' · 与原始输入不同，请人工核对' : ''}</p><Facts facts={inputFacts} /></div></div>
          {node.preview ? <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Eye className="h-4 w-4 text-blue-600" />真实业务执行预览</p><Badge className="bg-blue-100 text-blue-700">已锁定执行前快照</Badge></div><Facts facts={previewFacts} empty="业务目标已定位，执行前快照已锁定。" /><div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2"><span className="rounded-xl bg-gray-50 p-2"><Fingerprint className="mr-1 inline h-3.5 w-3.5" />执行前后可核对，敏感指纹不在页面展示</span><span className="rounded-xl bg-gray-50 p-2">预览有效至 {new Date(node.preview.expiresAt).toLocaleString('zh-CN')}</span></div></div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">尚未形成真实业务预览，系统不会允许提交。</div>}
          {node.effect && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><UserCheck className="h-4 w-4" />业务效果已回读验证</p><Badge className="bg-emerald-100 text-emerald-700">真实落地</Badge></div><Facts facts={resultFacts} empty="业务效果已写入并通过回读核验。" /><div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />提交、幂等保护与验证均已留痕。</div></div>}
          {node.error && <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><XCircle className="h-4 w-4" />{node.error}</div>}
        </CardContent></Card>
      })}

      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessagesSquare className="h-4 w-4 text-indigo-600" />Agent 团队工作交接</CardTitle></CardHeader><CardContent className="space-y-3">{task.messages.length === 0 ? <p className="rounded-xl border border-dashed p-3 text-sm text-gray-400">当前尚无协作消息；任务分工以上方持久节点为准。</p> : <div className="space-y-2">{task.messages.map((message) => <div key={message.id} className="flex gap-3 rounded-xl border p-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg">{message.agentAvatar}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{message.agentName}</p><div className="flex items-center gap-2"><Badge variant="outline">{messageTypeLabel(message.type)}</Badge><span className="text-xs text-gray-400">{new Date(message.createdAt).toLocaleString('zh-CN')}</span></div></div><p className="mt-1 text-sm leading-6 text-gray-600">{message.content}</p></div></div>)}</div>}</CardContent></Card>

      {task.approval.requiredCount > 0 && <Card className="border-amber-200"><CardHeader className="pb-3"><CardTitle className="text-base">人机协同裁决</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-gray-600">需要 {task.approval.requiredCount} 名不同审批人，已通过 {task.approval.approvedCount} 人。审批只针对上方真实执行预览。</p>{task.approval.decisions.map((decision) => <div key={decision.userId} className="rounded-xl bg-gray-50 p-3 text-sm"><div className="flex justify-between"><span className="font-medium">{decision.userName}</span><Badge variant="outline">{decision.decision === 'APPROVED' ? '同意执行' : '拒绝执行'}</Badge></div>{decision.reason && <p className="mt-1 text-gray-500">{decision.reason}</p>}</div>)}{canDecide && onDecision && <div className="flex flex-wrap gap-2"><Button variant="outline" className="text-red-600" disabled={deciding} onClick={() => onDecision('reject')}>拒绝任务</Button><Button disabled={deciding || !previewReady} onClick={() => onDecision('confirm')}>{previewReady ? '确认预览并执行' : '等待真实执行预览'}</Button></div>}</CardContent></Card>}

      {task.summary && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">白泽归整汇报</p><p className="mt-1 leading-6">{task.summary}</p></div>}
    </div>
  )
}
