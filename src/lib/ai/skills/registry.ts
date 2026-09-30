import { z } from 'zod'
import { UserRole } from '@/types'
import {
  EnterpriseSkillContract,
  EnterpriseSkillKey,
  ENTERPRISE_SKILL_KEYS,
  skillCommitOutputSchema,
  skillResourceScopeSchema,
} from './contracts'

const id = z.string().min(1).max(160)
const timestamp = z.string().datetime({ offset: true })

const repairPolicyGuardInput = z.object({
  count: z.number().int().min(1).max(50),
  operation: z.enum(['sla_dispatch', 'dispatch', 'batch_dispatch']),
  reason: z.string().trim().min(3).max(500),
}).strict()

const repairDispatchInput = z.object({
  count: z.number().int().min(1).max(50).default(1),
  repairId: id.optional(),
  assigneeId: id.optional(),
  assignments: z.array(z.object({ repairId: id, assigneeId: id }).strict()).min(1).max(50).optional(),
  reason: z.string().trim().min(3).max(500).default('Agent-assisted governed dispatch'),
}).strict().superRefine((value, context) => {
  if ((value.repairId && !value.assigneeId) || (!value.repairId && value.assigneeId)) {
    context.addIssue({ code: 'custom', message: 'repairId and assigneeId must be supplied together' })
  }
})

const notificationPublishInput = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(1).max(20000),
  type: z.enum(['EXAM', 'REPAIR', 'ACTIVITY', 'SYSTEM']),
  audience: z.object({
    roles: z.array(z.nativeEnum(UserRole)).max(14).default([]),
    userIds: z.array(id).max(500).default([]),
    organizationIds: z.array(z.string().uuid()).max(100).default([]),
  }).strict().superRefine((value, context) => {
    if (value.roles.length + value.userIds.length + value.organizationIds.length === 0) {
      context.addIssue({ code: 'custom', message: 'At least one server-resolved audience selector is required' })
    }
  }),
  channels: z.array(z.enum(['platform', 'email', 'sms', 'wechat'])).min(1).max(4),
  requireAcknowledgement: z.boolean().default(false),
  scheduledAt: timestamp.optional(),
}).strict()

const classroomBookingInput = z.object({
  classroomId: id,
  startsAt: timestamp,
  endsAt: timestamp,
  purpose: z.string().trim().min(3).max(1000),
  attendeeCount: z.number().int().min(1).max(10000),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'endsAt must be later than startsAt', path: ['endsAt'] })
  }
})

const lostFoundClaimInput = z.object({
  itemId: id,
  claimerId: id,
  humanConfirmed: z.literal(true),
  verificationEvidence: z.string().trim().min(10).max(2000),
}).strict()

const hygieneRectificationInput = z.object({
  inspectionId: id,
  assigneeId: id,
  dueAt: timestamp,
  requirements: z.array(z.string().trim().min(2).max(500)).min(1).max(50),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
}).strict()

const dormSafetyConfirmInput = z.object({
  eventId: id,
  onsiteConfirmed: z.literal(true),
  outcome: z.enum(['false_alarm', 'rectification_required', 'escalated']),
  note: z.string().trim().min(5).max(2000),
}).strict()

const visitorAdmissionInput = z.object({
  visitorApplicationId: id,
  decision: z.enum(['approve', 'reject']),
  rationale: z.string().trim().min(5).max(1000),
  validFrom: timestamp.optional(),
  validUntil: timestamp.optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'approve') {
    if (!value.validFrom || !value.validUntil) {
      context.addIssue({ code: 'custom', message: 'Approved admission requires validFrom and validUntil' })
    } else {
      const duration = Date.parse(value.validUntil) - Date.parse(value.validFrom)
      if (duration <= 0 || duration > 12 * 60 * 60 * 1000) {
        context.addIssue({ code: 'custom', message: 'Visitor QR validity must be greater than zero and no more than 12 hours' })
      }
    }
  }
})

const maintenanceRecommendationInput = z.object({
  assetId: id,
  readingIds: z.array(z.string().uuid()).min(3).max(500),
  recommendedAction: z.string().trim().min(5).max(2000),
  rationale: z.string().trim().min(10).max(4000),
  confidence: z.number().min(0).max(1),
  dueAt: timestamp,
  estimatedSavingsKwh: z.number().nonnegative().max(1000000).optional(),
}).strict()

type ContractSeed = Omit<EnterpriseSkillContract, 'version' | 'resourceScopeSchema' | 'outputSchema' | 'timeoutMs' | 'retryPolicy' | 'rateLimit' | 'auditPolicy' | 'previewPolicy' | 'compensation' | 'evalSet'> & {
  inputSchema: z.ZodType
  timeoutMs?: number
  retryMaxAttempts?: number
  redactFields?: readonly string[]
  compensation?: EnterpriseSkillContract['compensation']
}

function define(seed: ContractSeed): EnterpriseSkillContract {
  const contract: EnterpriseSkillContract = {
    ...seed,
    version: 1,
    resourceScopeSchema: skillResourceScopeSchema,
    outputSchema: skillCommitOutputSchema,
    timeoutMs: seed.timeoutMs ?? 30_000,
    retryPolicy: Object.freeze({
      maxAttempts: seed.retryMaxAttempts ?? 1,
      backoffMs: 1_000,
      retryableCodes: Object.freeze(['PORT_UNAVAILABLE', 'TIMEOUT', 'SERIALIZATION_FAILURE']),
    }),
    rateLimit: Object.freeze({ requests: seed.riskLevel === 'critical' ? 5 : 20, windowSeconds: 60 }),
    auditPolicy: Object.freeze({
      retainDays: 365,
      redactFields: Object.freeze([...(seed.redactFields ?? [])]),
      recordInput: true,
      recordOutput: true,
    }),
    previewPolicy: Object.freeze({
      ttlSeconds: 600,
      showFields: Object.freeze(['targetCount', 'affectedResources', 'stateChanges', 'warnings', 'deliveryCost']),
    }),
    compensation: Object.freeze(seed.compensation ?? { supported: false, strategy: 'manual_domain_resolution' }),
    evalSet: `${seed.id}.v1.golden`,
  }
  return Object.freeze(contract)
}

const contracts = [
  define({ key: 'repair.policy.guard.v1', id: 'repair.policy.guard', businessLoop: 'repair_policy', displayName: '\u62a5\u4fee\u6267\u884c\u524d\u5408\u89c4\u6838\u9a8c', description: '\u8bfb\u53d6\u771f\u5b9e\u5f85\u6d3e\u5de5\u5355\u3001\u79df\u6237\u8fb9\u754c\u548c\u7ef4\u4fee\u4eba\u5458\u6c60\uff0c\u5728\u4efb\u4f55\u6d3e\u5355\u5199\u5165\u524d\u5f62\u6210\u53ef\u5ba1\u8ba1\u7684\u5408\u89c4\u8bc1\u636e\uff1b\u6838\u9a8c\u672c\u8eab\u4e0d\u4fee\u6539\u62a5\u4fee\u6570\u636e', owner: 'ai-governance', requiredPermission: 'repair:dispatch', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN], riskLevel: 'medium', approvalPolicy: 'single_approval', inputSchema: repairPolicyGuardInput, timeoutMs: 30_000, compensation: { supported: false, strategy: 'append_only_policy_evidence' } }),
  define({ key: 'repair.dispatch.commit.v1', id: 'repair.dispatch.commit', businessLoop: 'repair', displayName: 'Repair dispatch commit', description: 'Dispatch validated repair orders to eligible real workers and emit notification/SLA outbox events atomically', owner: 'logistics-platform', requiredPermission: 'repair:dispatch', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: repairDispatchInput, timeoutMs: 60_000, compensation: { supported: true, skillKey: 'repair.dispatch.compensate.v1', strategy: 'reassign_or_return_to_pending_with_audit' } }),
  define({ key: 'notification.publish.commit.v1', id: 'notification.publish.commit', businessLoop: 'notification', displayName: 'Notification publish commit', description: 'Resolve the audience server-side and persist notification delivery/acknowledgement tasks without fabricated delivery', owner: 'communications-platform', requiredPermission: 'notification:create', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: notificationPublishInput, timeoutMs: 45_000, redactFields: ['content'] }),
  define({ key: 'classroom.booking.commit.v1', id: 'classroom.booking.commit', businessLoop: 'classroom_booking', displayName: 'Classroom booking commit', description: 'Check real schedules and booking conflicts before creating a capacity-safe reservation', owner: 'teaching-resources', requiredPermission: 'classroom:book', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.TEACHER, UserRole.CLASS_COMMITTEE], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: classroomBookingInput }),
  define({ key: 'lost_found.claim.commit.v1', id: 'lost_found.claim.commit', businessLoop: 'lost_found', displayName: 'Lost-and-found claim commit', description: 'Record a privacy-preserving, human-confirmed claim after identity evidence verification', owner: 'student-services', requiredPermission: 'lost:claim', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.CLASS_COMMITTEE], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: lostFoundClaimInput, redactFields: ['verificationEvidence'] }),
  define({ key: 'hygiene.rectification.create.v1', id: 'hygiene.rectification.create', businessLoop: 'hygiene_rectification', displayName: 'Hygiene rectification create', description: 'Create deterministic rectification work from real inspection evidence; AI scores remain advisory', owner: 'hygiene-operations', requiredPermission: 'duty:check', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DEPT_HYGIENE_MANAGER, UserRole.DEPT_HYGIENE_ADMIN], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: hygieneRectificationInput }),
  define({ key: 'dorm_safety.confirm.commit.v1', id: 'dorm_safety.confirm.commit', businessLoop: 'dorm_safety', displayName: 'Dorm safety onsite confirmation', description: 'Persist an onsite human confirmation of an IoT/rule safety event without producing punitive conclusions', owner: 'dorm-safety', requiredPermission: 'dorm:inspect', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER], riskLevel: 'critical', approvalPolicy: 'single_approval', inputSchema: dormSafetyConfirmInput }),
  define({ key: 'visitor.admission.approve.v1', id: 'visitor.admission.approve', businessLoop: 'visitor', displayName: 'Visitor admission decision', description: 'Apply a human admission decision and issue a one-time, short-lived, application-bound QR credential', owner: 'dorm-access-control', requiredPermission: 'visitor:check', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER], riskLevel: 'critical', approvalPolicy: 'single_approval', inputSchema: visitorAdmissionInput, redactFields: ['qrToken'] }),
  define({ key: 'maintenance.recommendation.create.v1', id: 'maintenance.recommendation.create', businessLoop: 'energy_maintenance', displayName: 'Predictive maintenance recommendation', description: 'Create an advisory maintenance recommendation only from quality-checked real meter readings', owner: 'energy-operations', requiredPermission: 'energy:manage', allowedRoles: [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER], riskLevel: 'high', approvalPolicy: 'single_approval', inputSchema: maintenanceRecommendationInput }),
] as const

const byKey = new Map<EnterpriseSkillKey, EnterpriseSkillContract>(contracts.map((contract) => [contract.key, contract]))

export const ENTERPRISE_SKILL_ALIASES: Readonly<Record<string, EnterpriseSkillKey>> = Object.freeze({
  repair_policy_guard: 'repair.policy.guard.v1',
  repair_dispatch: 'repair.dispatch.commit.v1',
  smart_dispatch: 'repair.dispatch.commit.v1',
  batch_dispatch: 'repair.dispatch.commit.v1',
  notification_publish: 'notification.publish.commit.v1',
  send_notification: 'notification.publish.commit.v1',
  classroom_book: 'classroom.booking.commit.v1',
  lost_found_claim: 'lost_found.claim.commit.v1',
  hygiene_rectification_create: 'hygiene.rectification.create.v1',
  dorm_safety_confirm: 'dorm_safety.confirm.commit.v1',
  visitor_approve: 'visitor.admission.approve.v1',
  maintenance_recommendation_create: 'maintenance.recommendation.create.v1',
})

export function getEnterpriseSkillContract(skillIdOrKey: string): EnterpriseSkillContract | undefined {
  const key = (ENTERPRISE_SKILL_KEYS as readonly string[]).includes(skillIdOrKey)
    ? skillIdOrKey as EnterpriseSkillKey
    : ENTERPRISE_SKILL_ALIASES[skillIdOrKey]
  return key ? byKey.get(key) : undefined
}

export function listEnterpriseSkillContracts(): readonly EnterpriseSkillContract[] {
  return contracts
}

export function isEnterpriseSkillBound(skillIdOrKey: string): boolean {
  return Boolean(getEnterpriseSkillContract(skillIdOrKey))
}
