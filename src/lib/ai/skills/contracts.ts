import { z } from 'zod'
import type { AiApprovalPolicy, AiRiskLevel } from '@/lib/ai/runtime/types'
import type { ResourceScope } from '@/lib/authorization'
import type { User, UserRole } from '@/types'

export const ENTERPRISE_SKILL_KEYS = [
  'repair.policy.guard.v1',
  'repair.dispatch.commit.v1',
  'notification.publish.commit.v1',
  'classroom.booking.commit.v1',
  'lost_found.claim.commit.v1',
  'hygiene.rectification.create.v1',
  'dorm_safety.confirm.commit.v1',
  'visitor.admission.approve.v1',
  'maintenance.recommendation.create.v1',
] as const

export type EnterpriseSkillKey = typeof ENTERPRISE_SKILL_KEYS[number]
export type SkillBusinessLoop =
  | 'repair_policy'
  | 'repair'
  | 'notification'
  | 'classroom_booking'
  | 'lost_found'
  | 'hygiene_rectification'
  | 'dorm_safety'
  | 'visitor'
  | 'energy_maintenance'

export interface EnterpriseSkillContract<TInput extends z.ZodType = z.ZodType> {
  readonly key: EnterpriseSkillKey
  readonly id: string
  readonly version: 1
  readonly businessLoop: SkillBusinessLoop
  readonly displayName: string
  readonly description: string
  readonly owner: string
  readonly requiredPermission: string
  readonly allowedRoles: readonly UserRole[]
  readonly riskLevel: AiRiskLevel
  readonly approvalPolicy: AiApprovalPolicy
  readonly inputSchema: TInput
  readonly outputSchema: z.ZodType
  readonly resourceScopeSchema: z.ZodType<ResourceScope>
  readonly timeoutMs: number
  readonly retryPolicy: Readonly<{ maxAttempts: number; backoffMs: number; retryableCodes: readonly string[] }>
  readonly rateLimit: Readonly<{ requests: number; windowSeconds: number }>
  readonly auditPolicy: Readonly<{ retainDays: number; redactFields: readonly string[]; recordInput: boolean; recordOutput: boolean }>
  readonly previewPolicy: Readonly<{ ttlSeconds: number; showFields: readonly string[] }>
  readonly compensation: Readonly<{ supported: boolean; skillKey?: string; strategy: string }>
  readonly evalSet: string
}

export const skillResourceScopeSchema = z.object({
  schoolId: z.string().uuid(),
  campusId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationPathIds: z.array(z.string().uuid()).optional(),
  classId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  ownerUserId: z.string().min(1).max(36).optional(),
}).strict()

export const skillCommitOutputSchema = z.object({
  effectId: z.string().uuid(),
  targetType: z.string().min(1).max(100),
  targetId: z.string().min(1).max(160).nullable(),
  status: z.enum(['APPLIED', 'VERIFIED']),
  idempotentReplay: z.boolean(),
  result: z.record(z.string(), z.unknown()),
  verification: z.record(z.string(), z.unknown()).optional(),
}).strict()

export interface SkillOperationContext {
  taskId: string
  nodeId: string
  schoolId: string
  actor: User
  agentId: string
  idempotencyKey: string
  approvalStatus: 'NOT_REQUIRED' | 'APPROVED'
  approvalCount: number
}

export interface PreparedSkillOperation {
  previewId: string
  skillKey: EnterpriseSkillKey
  input: Record<string, unknown>
  inputHash: string
  snapshotHash: string
  resourceScope: ResourceScope
  targetSnapshot: Record<string, unknown>
  preview: Record<string, unknown>
  expectedVersions: Record<string, number>
  expiresAt: string
}

export interface CommittedSkillOperation {
  effectId: string
  targetType: string
  targetId: string | null
  status: 'APPLIED' | 'VERIFIED'
  idempotentReplay: boolean
  result: Record<string, unknown>
  verification?: Record<string, unknown>
}

export interface VerifiedSkillOperation extends CommittedSkillOperation {
  status: 'VERIFIED'
  verification: Record<string, unknown> & { verified: true }
}

export interface EnterpriseSkillPort {
  findEffect(
    contract: EnterpriseSkillContract,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation | null>
  prepare(
    contract: EnterpriseSkillContract,
    input: Record<string, unknown>,
    context: SkillOperationContext
  ): Promise<PreparedSkillOperation>
  commit(
    contract: EnterpriseSkillContract,
    prepared: PreparedSkillOperation,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation>
  verify(
    contract: EnterpriseSkillContract,
    committed: CommittedSkillOperation,
    context: SkillOperationContext
  ): Promise<VerifiedSkillOperation>
}

export interface SkillGatewayExecutionResult {
  success: true
  data: VerifiedSkillOperation
  message: string
  prepared: PreparedSkillOperation
  lifecycle: readonly ['PREPARE', 'PREVIEW', 'APPROVE', 'REVALIDATE', 'COMMIT', 'VERIFY', 'REPORT']
}
