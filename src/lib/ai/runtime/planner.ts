import { authorize } from '@/lib/authorization'
import { User } from '@/types'
import { parseCommandToSkill } from './command-parser'
import { getSpiritPersonaForSkill, selectAgentForSkill } from './agent-catalog'
import { AiApprovalPolicy, AiIntentClassification, AiPlanSubtask, AiRiskLevel, AiSkillDefinition, AiTaskPlan, AiWorkflowStep } from './types'

export class AiPlanningError extends Error {
  constructor(
    readonly code: 'UNRECOGNIZED_INTENT' | 'PERMISSION_DENIED' | 'INVALID_SKILL' | 'INVALID_PARAMETERS',
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'AiPlanningError'
  }
}

const LEGACY = {
  query_repairs: '\u62a5\u4fee\u6570\u636e\u67e5\u8be2',
  smart_dispatch: '\u667a\u80fd\u6d3e\u5355',
  batch_dispatch: '\u6279\u91cf\u6d3e\u5355',
  query_materials: '\u7269\u8d44\u5e93\u5b58\u67e5\u8be2',
  approve_material: '\u7269\u8d44\u5ba1\u6279',
  send_notification: '\u53d1\u9001\u901a\u77e5',
  query_classrooms: '\u6559\u5ba4\u9884\u7ea6\u67e5\u8be2',
  dorm_inspection: '\u5bbf\u820d\u5de1\u67e5\u8bb0\u5f55',
  generate_duty: '\u503c\u65e5\u6392\u73ed\u751f\u6210',
  data_report: '\u6570\u636e\u7edf\u8ba1\u62a5\u544a',
  permission_change: '\u6743\u9650\u53d8\u66f4',
  knowledge_search: '\u77e5\u8bc6\u5e93\u68c0\u7d22',
  repair_policy_guard: '\u62a5\u4fee\u5408\u89c4\u6838\u9a8c',
  repair_dispatch: '\u62a5\u4fee\u6d3e\u5355\u63d0\u4ea4',
  notification_publish: '\u901a\u77e5\u53d1\u5e03\u63d0\u4ea4',
  classroom_book: '\u6559\u5ba4\u9884\u7ea6\u63d0\u4ea4',
  lost_found_claim: '\u5931\u7269\u62db\u9886\u786e\u8ba4',
  hygiene_rectification_create: '\u536b\u751f\u6574\u6539\u521b\u5efa',
  dorm_safety_confirm: '\u5bbf\u820d\u5b89\u5168\u73b0\u573a\u786e\u8ba4',
  visitor_approve: '\u8bbf\u5ba2\u51c6\u5165\u5ba1\u6279',
  maintenance_recommendation_create: '\u9884\u6d4b\u6027\u7ef4\u62a4\u5efa\u8bae\u521b\u5efa',
} as const

const SKILLS: AiSkillDefinition[] = [
  { id: 'query_repairs', name: LEGACY.query_repairs, legacyName: LEGACY.query_repairs, description: 'Query repair orders in the authorized scope', capability: 'repair.query', requiredPermission: 'repair:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'smart_dispatch', name: LEGACY.smart_dispatch, legacyName: LEGACY.smart_dispatch, description: 'Governed repair dispatch compatibility alias', capability: 'repair.dispatch', requiredPermission: 'repair:dispatch', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'repair.dispatch.commit.v1' },
  { id: 'batch_dispatch', name: LEGACY.batch_dispatch, legacyName: LEGACY.batch_dispatch, description: 'Governed batch repair dispatch compatibility alias', capability: 'repair.dispatch', requiredPermission: 'repair:dispatch', riskLevel: 'critical', approvalPolicy: 'dual_approval', readOnly: false, executable: true, gatewaySkillKey: 'repair.dispatch.commit.v1' },
  { id: 'query_materials', name: LEGACY.query_materials, legacyName: LEGACY.query_materials, description: 'Query inventory in the authorized scope', capability: 'inventory.query', requiredPermission: 'material:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'approve_material', name: LEGACY.approve_material, legacyName: LEGACY.approve_material, description: 'Approve a material request with audit trail', capability: 'inventory.approve', requiredPermission: 'material:approve', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: false },
  { id: 'send_notification', name: LEGACY.send_notification, legacyName: LEGACY.send_notification, description: 'Governed notification publish compatibility alias', capability: 'notification.send', requiredPermission: 'notification:create', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'notification.publish.commit.v1' },
  { id: 'query_classrooms', name: LEGACY.query_classrooms, legacyName: LEGACY.query_classrooms, description: 'Query classroom availability', capability: 'classroom.query', requiredPermission: 'classroom:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'dorm_inspection', name: LEGACY.dorm_inspection, legacyName: LEGACY.dorm_inspection, description: 'Query dormitory inspection records', capability: 'dorm.query', requiredPermission: 'dorm:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'generate_duty', name: LEGACY.generate_duty, legacyName: LEGACY.generate_duty, description: 'Generate a duty roster draft', capability: 'duty.plan', requiredPermission: 'duty:create', riskLevel: 'medium', approvalPolicy: 'single_approval', readOnly: false, executable: false },
  { id: 'data_report', name: LEGACY.data_report, legacyName: LEGACY.data_report, description: 'Generate an operational report', capability: 'analytics.report', requiredPermission: 'user:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'permission_change', name: LEGACY.permission_change, legacyName: LEGACY.permission_change, description: 'Request a permission change', capability: 'permission.govern', requiredPermission: 'permission:*', riskLevel: 'critical', approvalPolicy: 'dual_approval', readOnly: false, executable: false },
  { id: 'knowledge_search', name: LEGACY.knowledge_search, legacyName: LEGACY.knowledge_search, description: 'Search governed knowledge sources', capability: 'knowledge.search', requiredPermission: 'user:view', riskLevel: 'low', approvalPolicy: 'automatic', readOnly: true, executable: false },
  { id: 'repair_policy_guard', name: LEGACY.repair_policy_guard, legacyName: LEGACY.repair_policy_guard, description: 'Seal a real pre-write repair compliance decision without mutating repair business data', capability: 'policy.review', requiredPermission: 'repair:dispatch', riskLevel: 'medium', approvalPolicy: 'single_approval', readOnly: true, executable: true, gatewaySkillKey: 'repair.policy.guard.v1' },
  { id: 'repair_dispatch', name: LEGACY.repair_dispatch, legacyName: LEGACY.repair_dispatch, description: 'Dispatch real pending repairs to eligible workers with SLA/outbox effects', capability: 'repair.dispatch', requiredPermission: 'repair:dispatch', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'repair.dispatch.commit.v1' },
  { id: 'notification_publish', name: LEGACY.notification_publish, legacyName: LEGACY.notification_publish, description: 'Resolve a real audience and persist notification delivery tasks', capability: 'notification.send', requiredPermission: 'notification:create', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'notification.publish.commit.v1' },
  { id: 'classroom_book', name: LEGACY.classroom_book, legacyName: LEGACY.classroom_book, description: 'Create a capacity-safe conflict-free classroom booking', capability: 'classroom.book', requiredPermission: 'classroom:book', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'classroom.booking.commit.v1' },
  { id: 'lost_found_claim', name: LEGACY.lost_found_claim, legacyName: LEGACY.lost_found_claim, description: 'Commit a human-confirmed privacy-safe lost item claim', capability: 'lost.claim', requiredPermission: 'lost:claim', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'lost_found.claim.commit.v1' },
  { id: 'hygiene_rectification_create', name: LEGACY.hygiene_rectification_create, legacyName: LEGACY.hygiene_rectification_create, description: 'Create deterministic hygiene rectification work', capability: 'hygiene.rectify', requiredPermission: 'duty:check', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'hygiene.rectification.create.v1' },
  { id: 'dorm_safety_confirm', name: LEGACY.dorm_safety_confirm, legacyName: LEGACY.dorm_safety_confirm, description: 'Persist a human onsite dorm safety confirmation', capability: 'dorm.safety.confirm', requiredPermission: 'dorm:inspect', riskLevel: 'critical', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'dorm_safety.confirm.commit.v1' },
  { id: 'visitor_approve', name: LEGACY.visitor_approve, legacyName: LEGACY.visitor_approve, description: 'Apply a visitor admission decision and issue a one-time QR', capability: 'visitor.admit', requiredPermission: 'visitor:check', riskLevel: 'critical', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'visitor.admission.approve.v1' },
  { id: 'maintenance_recommendation_create', name: LEGACY.maintenance_recommendation_create, legacyName: LEGACY.maintenance_recommendation_create, description: 'Create advisory maintenance from real quality-checked readings', capability: 'energy.maintenance', requiredPermission: 'energy:manage', riskLevel: 'high', approvalPolicy: 'single_approval', readOnly: false, executable: true, gatewaySkillKey: 'maintenance.recommendation.create.v1' },
]

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]))
const SKILL_BY_LEGACY_NAME = new Map(SKILLS.map((skill) => [skill.legacyName, skill]))

export function listAiSkills(): AiSkillDefinition[] { return SKILLS.map((skill) => ({ ...skill })) }
export function getAiSkill(skillId: string): AiSkillDefinition | undefined { return SKILL_BY_ID.get(skillId) ?? SKILL_BY_LEGACY_NAME.get(skillId) }

export function classifyAiCommand(command: string, requestedSkillId?: string, params: Record<string, unknown> = {}): AiIntentClassification {
  const parsed = requestedSkillId ? undefined : parseCommandToSkill(command)
  const skill = requestedSkillId ? getAiSkill(requestedSkillId) : parsed ? getAiSkill(parsed.skill) : undefined
  if (!skill) throw new AiPlanningError('UNRECOGNIZED_INTENT', '\u65e0\u6cd5\u8bc6\u522b\u4e3a\u53d7\u6cbb\u7406\u7684\u53ef\u6267\u884c\u6280\u80fd')
  return { mode: 'execute', skillId: skill.id, confidence: parsed?.confidence ?? 1, params: { ...(parsed?.params ?? {}), ...params }, reasoning: parsed ? `\u57fa\u4e8e\u53d7\u6cbb\u7406\u89c4\u5219\u8bc6\u522b\u4e3a\u300c${skill.name}\u300d` : `\u7531\u53d7\u6cbb\u7406\u6280\u80fd\u76ee\u5f55\u6307\u5b9a\u300c${skill.name}\u300d` }
}

function validateBusinessParameters(skill: AiSkillDefinition, params: Record<string, unknown>, index: number): void {
  const countLimit = skill.id === 'batch_dispatch' || skill.id === 'repair_policy_guard' ? 50
    : ['repair_dispatch', 'smart_dispatch'].includes(skill.id) ? 10 : undefined
  if (countLimit === undefined) return
  const count = params.count
  const fieldName = index === 0 ? 'params.count' : `workflow.${index - 1}.params.count`
  if (count === undefined && skill.id !== 'repair_policy_guard') return
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > countLimit) {
    throw new AiPlanningError('INVALID_PARAMETERS', `count must be an integer between 1 and ${countLimit}`, {
      [fieldName]: [`必须填写 1 至 ${countLimit} 的整数，不能自动修正原始输入`],
    })
  }
  if (skill.id === 'repair_policy_guard') {
    const fieldErrors: Record<string, string[]> = {}
    if (!['sla_dispatch', 'dispatch', 'batch_dispatch'].includes(String(params.operation))) {
      fieldErrors[index === 0 ? 'params.operation' : `workflow.${index - 1}.params.operation`] = ['必须填写有效的 operation']
    }
    if (typeof params.reason !== 'string' || params.reason.trim().length < 3) {
      fieldErrors[index === 0 ? 'params.reason' : `workflow.${index - 1}.params.reason`] = ['reason 至少需要 3 个字符']
    }
    if (Object.keys(fieldErrors).length > 0) throw new AiPlanningError('INVALID_PARAMETERS', 'Required business parameters are missing', fieldErrors)
  }
}

function maxRisk(current: AiRiskLevel, next: AiRiskLevel): AiRiskLevel {
  const levels: AiRiskLevel[] = ['low', 'medium', 'high', 'critical']
  return levels.indexOf(next) > levels.indexOf(current) ? next : current
}
function maxApproval(current: AiApprovalPolicy, next: AiApprovalPolicy): AiApprovalPolicy {
  const levels: AiApprovalPolicy[] = ['automatic', 'single_approval', 'dual_approval']
  return levels.indexOf(next) > levels.indexOf(current) ? next : current
}

function makeSubtask(
  user: User,
  skill: AiSkillDefinition,
  index: number,
  inputParams: Record<string, unknown>,
  dependsOn: string[] = [],
  title?: string,
): AiPlanSubtask {
  const agent = selectAgentForSkill(user.role, skill.id)
  const spirit = getSpiritPersonaForSkill(skill.id)
  return {
    id: `node-${index + 1}`,
    title: title ?? `\u6267\u884c${skill.name}`,
    capability: skill.capability,
    preferredAgent: agent.id,
    preferredAgentName: spirit.name,
    skillId: skill.id,
    dependsOn,
    inputBindings: {},
    inputParams,
    expectedOutputSchema: skill.gatewaySkillKey ? { effectId: 'string', status: 'VERIFIED', result: 'object', verification: 'object' } : { result: 'object' },
    riskLevel: skill.riskLevel,
    timeoutSeconds: skill.readOnly ? 30 : 120,
    retryPolicy: { maxAttempts: skill.readOnly ? 2 : 1, backoffSeconds: 2 },
    approvalPolicy: skill.approvalPolicy,
  }
}

export function buildAiPlan(
  user: User,
  command: string,
  intent: AiIntentClassification,
  workflow: AiWorkflowStep[] = [],
): { skill: AiSkillDefinition; plan: AiTaskPlan; riskLevel: AiRiskLevel; approvalPolicy: AiApprovalPolicy; policyAllowed: boolean; policyReason: string } {
  const primarySkill = getAiSkill(intent.skillId)
  if (!primarySkill) throw new AiPlanningError('INVALID_SKILL', `\u6280\u80fd\u4e0d\u5b58\u5728: ${intent.skillId}`)
  const steps: AiWorkflowStep[] = [
    { skillId: primarySkill.id, params: intent.params },
    ...workflow.filter((step) => step.skillId !== primarySkill.id),
  ].slice(0, 8)
  const skills = steps.map((step) => {
    const skill = getAiSkill(step.skillId)
    if (!skill) throw new AiPlanningError('INVALID_SKILL', `\u6280\u80fd\u4e0d\u5b58\u5728: ${step.skillId}`)
    validateBusinessParameters(skill, step.params ?? {}, steps.indexOf(step))
    return skill
  })
  const subtasks = skills.map((skill, index) => {
    const step = steps[index]
    return makeSubtask(user, skill, index, step.params ?? {}, step.dependsOn ?? [], step.title)
  })
  let riskLevel = skills.reduce<AiRiskLevel>((risk, skill) => maxRisk(risk, skill.riskLevel), 'low')
  let approvalPolicy = skills.reduce<AiApprovalPolicy>((policy, skill) => maxApproval(policy, skill.approvalPolicy), 'automatic')
  skills.forEach((skill, index) => {
    if (skill.gatewaySkillKey === 'repair.dispatch.commit.v1' && Number(steps[index].params?.count ?? 0) > 10) {
      riskLevel = 'critical'
      approvalPolicy = 'dual_approval'
      subtasks[index].riskLevel = 'critical'
      subtasks[index].approvalPolicy = 'dual_approval'
    }
  })
  const decisions = skills.map((skill) => authorize(user, { permission: skill.requiredPermission }))
  const denied = decisions.find((decision) => !decision.allowed)
  const plan: AiTaskPlan = {
    goal: command,
    mode: intent.mode,
    assumptions: [
      { description: '\u6240\u6709\u5de5\u5177\u8c03\u7528\u4f7f\u7528\u670d\u52a1\u7aef\u4f1a\u8bdd\u8eab\u4efd\u548c\u6570\u636e\u8303\u56f4', requiresConfirmation: false },
      { description: '\u5199\u64cd\u4f5c\u4ec5\u5728\u5ba1\u6279\u901a\u8fc7\u540e\u63d0\u4ea4\uff0c\u4e14\u5fc5\u987b\u7ecf\u8fc7\u4e1a\u52a1\u56de\u8bfb\u9a8c\u8bc1', requiresConfirmation: riskLevel !== 'low' },
    ],
    completionCriteria: [
      { id: 'business_readback', description: '\u4e1a\u52a1\u7cfb\u7edf\u56de\u8bfb\u7ed3\u679c\u4e0e\u9884\u671f\u4e00\u81f4', verifier: 'skill_gateway_verify' },
      { id: 'audit_recorded', description: '\u5de5\u5177\u8c03\u7528\u3001\u4e1a\u52a1\u6548\u679c\u3001\u5ba1\u8ba1\u4e8b\u4ef6\u53ef\u5173\u8054', verifier: 'audit_trace' },
    ],
    subtasks,
    executionMode: subtasks.length > 1 ? 'fan_out' : 'single',
    budget: { maxDurationSeconds: 300, maxModelCalls: 3, maxToolCalls: Math.max(4, subtasks.length * 4) },
  }
  return { skill: primarySkill, plan, riskLevel, approvalPolicy, policyAllowed: !denied, policyReason: denied?.reason ?? 'allowed' }
}

