import { authorize } from '@/lib/authorization'
import {
  EnterpriseSkillContract,
  EnterpriseSkillPort,
  PreparedSkillOperation,
  SkillGatewayExecutionResult,
  SkillOperationContext,
  VerifiedSkillOperation,
} from './contracts'
import { EnterpriseSkillPortError, getEnterpriseSkillPort } from './port'
import { getEnterpriseSkillContract } from './registry'

export type EnterpriseSkillGatewayErrorCode =
  | 'SKILL_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'PERMISSION_DENIED'
  | 'SCOPE_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'DUAL_APPROVAL_REQUIRED'
  | 'STALE_PREVIEW'
  | 'PREVIEW_EXPIRED'
  | 'PORT_UNAVAILABLE'
  | 'PORT_FAILURE'
  | 'VERIFICATION_FAILED'

export class EnterpriseSkillGatewayError extends Error {
  constructor(
    readonly code: EnterpriseSkillGatewayErrorCode,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'EnterpriseSkillGatewayError'
  }
}

const LIFECYCLE = Object.freeze(['PREPARE', 'PREVIEW', 'APPROVE', 'REVALIDATE', 'COMMIT', 'VERIFY', 'REPORT'] as const)

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EnterpriseSkillGatewayError('INVALID_INPUT', `${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stableJson(item[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function contractFor(skillIdOrKey: string): EnterpriseSkillContract {
  const contract = getEnterpriseSkillContract(skillIdOrKey)
  if (!contract) throw new EnterpriseSkillGatewayError('SKILL_NOT_FOUND', `No governed enterprise Skill is bound to ${skillIdOrKey}`)
  return contract
}

function parseInput(contract: EnterpriseSkillContract, input: Record<string, unknown>): Record<string, unknown> {
  const parsed = contract.inputSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')
    throw new EnterpriseSkillGatewayError('INVALID_INPUT', `Skill input validation failed: ${issues}`)
  }
  return asRecord(parsed.data, 'Parsed Skill input')
}

function assertIdentityScope(contract: EnterpriseSkillContract, context: SkillOperationContext): void {
  if (!context.actor.school_id || context.actor.school_id !== context.schoolId) {
    throw new EnterpriseSkillGatewayError('SCOPE_DENIED', 'Authenticated actor and Skill tenant do not match')
  }
  const decision = authorize(context.actor, {
    permission: contract.requiredPermission,
    allowedRoles: [...contract.allowedRoles],
  })
  if (!decision.allowed) {
    throw new EnterpriseSkillGatewayError('PERMISSION_DENIED', `Skill permission denied: ${decision.reason}`)
  }
}

function assertPrepared(
  contract: EnterpriseSkillContract,
  parsedInput: Record<string, unknown>,
  prepared: PreparedSkillOperation,
  context: SkillOperationContext,
  allowExpired = false
): void {
  if (prepared.skillKey !== contract.key) {
    throw new EnterpriseSkillGatewayError('INVALID_INPUT', 'Prepared operation is bound to a different immutable Skill version')
  }
  if (stableJson(prepared.input) !== stableJson(parsedInput)) {
    throw new EnterpriseSkillGatewayError('INVALID_INPUT', 'Prepared operation input differs from the validated execution input')
  }
  const scope = contract.resourceScopeSchema.safeParse(prepared.resourceScope)
  if (!scope.success || scope.data.schoolId !== context.schoolId) {
    throw new EnterpriseSkillGatewayError('SCOPE_DENIED', 'Server-resolved business resource scope is invalid or cross-tenant')
  }
  const decision = authorize(context.actor, {
    permission: contract.requiredPermission,
    allowedRoles: [...contract.allowedRoles],
    resource: scope.data,
  })
  if (!decision.allowed) {
    throw new EnterpriseSkillGatewayError('SCOPE_DENIED', `Server-resolved business resource scope denied: ${decision.reason}`)
  }
  if (!allowExpired && Date.parse(prepared.expiresAt) <= Date.now()) {
    throw new EnterpriseSkillGatewayError('PREVIEW_EXPIRED', 'The governed business preview expired before approval/commit')
  }
}

export function requiredApprovalCount(contract: EnterpriseSkillContract, prepared: PreparedSkillOperation): number {
  const base = contract.approvalPolicy === 'dual_approval' ? 2 : contract.approvalPolicy === 'single_approval' ? 1 : 0
  const targetCount = Number(prepared.preview.targetCount ?? 0)
  if (contract.key === 'repair.dispatch.commit.v1' && targetCount > 10) return 2
  if (contract.key === 'notification.publish.commit.v1' && targetCount > 500) return 2
  return base
}

function assertApproval(contract: EnterpriseSkillContract, prepared: PreparedSkillOperation, context: SkillOperationContext): void {
  const required = requiredApprovalCount(contract, prepared)
  if (required === 0) return
  if (context.approvalStatus !== 'APPROVED') {
    throw new EnterpriseSkillGatewayError('APPROVAL_REQUIRED', 'Human approval is required before any business commit')
  }
  if (context.approvalCount < required) {
    throw new EnterpriseSkillGatewayError(
      required === 2 ? 'DUAL_APPROVAL_REQUIRED' : 'APPROVAL_REQUIRED',
      required === 2 ? 'This batch/broadcast operation requires two distinct approvers' : 'This operation requires one approver'
    )
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EnterpriseSkillGatewayError('PORT_FAILURE', `${label} timed out after ${timeoutMs}ms`, true)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function mapPortError(error: unknown): EnterpriseSkillGatewayError {
  if (error instanceof EnterpriseSkillGatewayError) return error
  if (error instanceof EnterpriseSkillPortError) {
    if (error.code === 'PORT_UNAVAILABLE') {
      return new EnterpriseSkillGatewayError('PORT_UNAVAILABLE', error.message, true, error)
    }
    const stale = /version|changed|conflict|expired|consumed/i.test(error.message)
    return new EnterpriseSkillGatewayError(stale ? 'STALE_PREVIEW' : 'PORT_FAILURE', error.message, error.code !== 'INVALID_RESPONSE', error)
  }
  return new EnterpriseSkillGatewayError('PORT_FAILURE', error instanceof Error ? error.message : 'Unknown Skill port failure', true, error)
}

export async function prepareEnterpriseSkillOperation(
  skillIdOrKey: string,
  input: Record<string, unknown>,
  context: SkillOperationContext,
  port: EnterpriseSkillPort = getEnterpriseSkillPort()
): Promise<PreparedSkillOperation> {
  const contract = contractFor(skillIdOrKey)
  const parsedInput = parseInput(contract, input)
  assertIdentityScope(contract, context)
  try {
    const prepared = await withTimeout(port.prepare(contract, parsedInput, context), contract.timeoutMs, `${contract.key} prepare`)
    assertPrepared(contract, parsedInput, prepared, context)
    return prepared
  } catch (error) {
    throw mapPortError(error)
  }
}

export async function executePreparedEnterpriseSkill(
  skillIdOrKey: string,
  input: Record<string, unknown>,
  prepared: PreparedSkillOperation,
  context: SkillOperationContext,
  port: EnterpriseSkillPort = getEnterpriseSkillPort()
): Promise<SkillGatewayExecutionResult> {
  const contract = contractFor(skillIdOrKey)
  const parsedInput = parseInput(contract, input)
  assertIdentityScope(contract, context)
  assertPrepared(contract, parsedInput, prepared, context, true)
  assertApproval(contract, prepared, context)

  try {
    const existing = await withTimeout(port.findEffect(contract, context), contract.timeoutMs, `${contract.key} effect lookup`)
    if (existing) {
      const verified = existing.status === 'VERIFIED' && existing.verification?.verified === true
        ? existing as VerifiedSkillOperation
        : await withTimeout(port.verify(contract, existing, context), contract.timeoutMs, `${contract.key} verify`)
      if (verified.verification.verified !== true) {
        throw new EnterpriseSkillGatewayError('VERIFICATION_FAILED', 'Existing idempotent business effect failed read-back verification', true)
      }
      return {
        success: true,
        data: { ...verified, idempotentReplay: true },
        message: `${contract.displayName} replayed its existing verified business effect`,
        prepared,
        lifecycle: LIFECYCLE,
      }
    }

    if (Date.parse(prepared.expiresAt) <= Date.now()) {
      throw new EnterpriseSkillGatewayError('PREVIEW_EXPIRED', 'The governed business preview expired before revalidation')
    }
    const revalidated = await withTimeout(port.prepare(contract, parsedInput, context), contract.timeoutMs, `${contract.key} revalidate`)
    assertPrepared(contract, parsedInput, revalidated, context)
    if (revalidated.snapshotHash !== prepared.snapshotHash || revalidated.inputHash !== prepared.inputHash) {
      throw new EnterpriseSkillGatewayError('STALE_PREVIEW', 'Business data changed after preview; a new preview and approval are required')
    }

    const committed = await withTimeout(port.commit(contract, revalidated, context), contract.timeoutMs, `${contract.key} commit`)
    const output = contract.outputSchema.safeParse(committed)
    if (!output.success) {
      throw new EnterpriseSkillGatewayError('PORT_FAILURE', `Skill commit output violated its immutable schema: ${output.error.message}`)
    }
    const verified = await withTimeout(port.verify(contract, committed, context), contract.timeoutMs, `${contract.key} verify`)
    if (verified.status !== 'VERIFIED' || verified.verification.verified !== true) {
      throw new EnterpriseSkillGatewayError('VERIFICATION_FAILED', 'Business read-back did not verify the committed effect', true)
    }
    return {
      success: true,
      data: { ...verified, idempotentReplay: committed.idempotentReplay || verified.idempotentReplay },
      message: `${contract.displayName} committed and passed business read-back verification`,
      prepared: revalidated,
      lifecycle: LIFECYCLE,
    }
  } catch (error) {
    throw mapPortError(error)
  }
}

export async function runEnterpriseSkillLifecycle(
  skillIdOrKey: string,
  input: Record<string, unknown>,
  context: SkillOperationContext,
  port: EnterpriseSkillPort = getEnterpriseSkillPort()
): Promise<SkillGatewayExecutionResult> {
  const prepared = await prepareEnterpriseSkillOperation(skillIdOrKey, input, context, port)
  return executePreparedEnterpriseSkill(skillIdOrKey, input, prepared, context, port)
}
