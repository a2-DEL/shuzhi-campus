import type { AiRiskLevel, AiTaskState } from '@/lib/ai/runtime/types'

const SKILL_LABELS: Record<string, string> = {
  repair_policy_guard: '\u62a5\u4fee\u5408\u89c4\u6838\u9a8c',
  'repair.policy.guard.v1': '\u62a5\u4fee\u5408\u89c4\u6838\u9a8c',
  repair_dispatch: '报修智能派单',
  smart_dispatch: '报修智能派单',
  batch_dispatch: '批量报修派单',
  'repair.dispatch.commit.v1': '报修智能派单',
  notification_publish: '通知发布',
  send_notification: '通知发布',
  'notification.publish.commit.v1': '通知发布',
  classroom_book: '教室预约',
  'classroom.booking.commit.v1': '教室预约',
  lost_found_claim: '失物认领',
  'lost_found.claim.commit.v1': '失物认领',
  hygiene_rectification_create: '卫生整改',
  'hygiene.rectification.create.v1': '卫生整改',
  dorm_safety_confirm: '宿舍安全复核',
  'dorm_safety.confirm.commit.v1': '宿舍安全复核',
  visitor_approve: '访客准入',
  'visitor.admission.approve.v1': '访客准入',
  maintenance_recommendation_create: '预测性维护',
  'maintenance.recommendation.create.v1': '预测性维护',
  query_repairs: '报修查询',
  query_classrooms: '教室查询',
  query_materials: '物资查询',
  data_report: '数据分析',
  knowledge_search: '知识检索',
  generate_duty: '值日排班',
  dorm_inspection: '宿舍巡检',
  approve_material: '物资审批',
  permission_change: '权限治理',
}

const STATE_LABELS: Record<string, string> = {
  RECEIVED: '已接令',
  AUTHENTICATED: '身份已确认',
  CLASSIFIED: '意图已分辨',
  CONTEXT_BUILT: '业务上下文已汇聚',
  PLANNED: '任务已拆解',
  PLAN_VALIDATED: '计划已校验',
  POLICY_CHECKED: '策略已核验',
  PREVIEWED: '执行预览已形成',
  AWAITING_APPROVAL: '等待人工裁决',
  QUEUED: '已进入执行队列',
  RUNNING: '分灵体执行中',
  OBSERVING: '正在收拢结果',
  REPLANNING: '正在重新推演',
  VERIFYING: '正在回读验证',
  COMPLETED: '已完成并验证',
  PARTIAL: '部分完成',
  FAILED: '执行受阻',
  CANCELLED: '已安全取消',
  COMPENSATED: '已完成补偿',
  PENDING: '等待接令',
  BLOCKED: '已阻断',
  VERIFIED: '已回读验证',
  WAITING: '静候调度',
  ROUTED: '已完成分诊',
}

const RISK_LABELS: Record<AiRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '关键风险',
}

const MESSAGE_LABELS: Record<string, string> = {
  chat: '主脑通报',
  handover: '任务交接',
  result: '成果回传',
  error: '异常示警',
  approval_request: '请示裁决',
  approval_decision: '人工裁决',
}

const APPROVAL_LABELS: Record<string, string> = {
  automatic: '自动受控执行',
  single_approval: '单人审批',
  dual_approval: '双人复核',
  NOT_REQUIRED: '无需人工审批',
  PENDING: '等待审批',
  APPROVED: '审批通过',
  REJECTED: '审批拒绝',
}

const CAPABILITY_LABELS: Record<string, string> = {
  ai: 'AI 中枢',
  system: '系统协同',
  analytics: '数据研判',
  permission: '权限治理',
  repair: '报修业务',
  notification: '消息触达',
  classroom: '教学空间',
  inventory: '物资保障',
  hygiene: '卫生治理',
  duty: '值日协同',
  dorm: '宿舍治理',
  visitor: '访客准入',
  knowledge: '知识检索',
  student: '学生服务',
  department: '院系协同',
  policy: '策略复核',
}

export function skillDisplayName(value?: string): string {
  if (!value) return '业务能力'
  return SKILL_LABELS[value] ?? '受控业务能力'
}

export function taskStateLabel(value: AiTaskState | string): string {
  return STATE_LABELS[value] ?? '状态已记录'
}

export function nodeStateLabel(value: string): string {
  return STATE_LABELS[value] ?? '状态已记录'
}

export function riskLevelLabel(value: AiRiskLevel): string {
  return RISK_LABELS[value]
}

export function messageTypeLabel(value: string): string {
  return MESSAGE_LABELS[value] ?? '协作消息'
}

export function approvalLabel(value: string): string {
  return APPROVAL_LABELS[value] ?? '审批状态已记录'
}

export function backendLabel(value?: string): string {
  if (value === 'postgres') return '企业级持久数据库'
  if (value === 'supabase') return '云端持久数据库'
  if (value === 'development_memory') return '本地临时运行空间'
  if (value === 'unconfigured') return '尚未连接业务数据库'
  return '受控运行服务'
}

export function capabilityLabel(value: string): string {
  const prefix = value.split('.')[0]
  return CAPABILITY_LABELS[prefix] ?? '专业协同'
}

export function routeModeLabel(value: string): string {
  if (value === 'local_governed') return '本地受控路由'
  if (value === 'external_preferred') return '外部模型优先'
  if (value === 'hybrid_fail_closed') return '混合路由与失败关闭'
  return '受控路由'
}

export function formatDuration(milliseconds: number): string {
  if (!milliseconds || milliseconds < 1_000) return milliseconds > 0 ? `${milliseconds} 毫秒` : '尚无完成样本'
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} 秒`
  return `${(milliseconds / 60_000).toFixed(1)} 分钟`
}

export function naturalValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return new Intl.NumberFormat('zh-CN').format(value)
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(timestamp)) return new Date(timestamp).toLocaleString('zh-CN')
    return value
  }
  if (Array.isArray(value)) return value.length === 0 ? '无' : value.map(naturalValue).join('、')
  return '已完成结构化校验'
}
