import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { getDevelopmentUser } from '@/lib/development-users'
import {
  CommittedSkillOperation,
  EnterpriseSkillContract,
  EnterpriseSkillPort,
  PreparedSkillOperation,
  SkillOperationContext,
  VerifiedSkillOperation,
} from '@/lib/ai/skills/contracts'
import {
  EnterpriseSkillGatewayError,
  executePreparedEnterpriseSkill,
  prepareEnterpriseSkillOperation,
} from '@/lib/ai/skills/gateway'

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

class DeterministicSkillPort implements EnterpriseSkillPort {
  snapshotVersion = 1
  prepareCount = 0
  commitCount = 0
  verifyCount = 0
  readonly effects = new Map<string, CommittedSkillOperation>()

  async findEffect(_contract: EnterpriseSkillContract, context: SkillOperationContext): Promise<CommittedSkillOperation | null> {
    return this.effects.get(context.idempotencyKey) ?? null
  }

  async prepare(contract: EnterpriseSkillContract, input: Record<string, unknown>, context: SkillOperationContext): Promise<PreparedSkillOperation> {
    this.prepareCount += 1
    const targetSnapshot = { domain: contract.businessLoop, version: this.snapshotVersion, realRecord: true }
    return {
      previewId: randomUUID(),
      skillKey: contract.key,
      input: structuredClone(input),
      inputHash: hash(input),
      snapshotHash: hash(targetSnapshot),
      resourceScope: { schoolId: context.schoolId },
      targetSnapshot,
      preview: { targetCount: Number(input.count ?? 1), stateChanges: { from: 'PENDING', to: 'COMMITTED' }, warnings: [] },
      expectedVersions: { target: this.snapshotVersion },
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }
  }

  async commit(contract: EnterpriseSkillContract, _prepared: PreparedSkillOperation, context: SkillOperationContext): Promise<CommittedSkillOperation> {
    const existing = this.effects.get(context.idempotencyKey)
    if (existing) return { ...existing, idempotentReplay: true }
    this.commitCount += 1
    const committed: CommittedSkillOperation = {
      effectId: randomUUID(),
      targetType: contract.businessLoop,
      targetId: randomUUID(),
      status: 'APPLIED',
      idempotentReplay: false,
      result: { persisted: true, snapshotVersion: this.snapshotVersion },
    }
    this.effects.set(context.idempotencyKey, committed)
    return committed
  }

  async verify(_contract: EnterpriseSkillContract, committed: CommittedSkillOperation, context: SkillOperationContext): Promise<VerifiedSkillOperation> {
    this.verifyCount += 1
    const verified: VerifiedSkillOperation = {
      ...committed,
      status: 'VERIFIED',
      verification: { verified: true, source: 'deterministic_business_readback' },
    }
    this.effects.set(context.idempotencyKey, verified)
    return verified
  }
}

function context(idempotencyKey: string, approvalStatus: 'NOT_REQUIRED' | 'APPROVED', approvalCount: number): SkillOperationContext {
  const actor = getDevelopmentUser('admin')
  assert.ok(actor?.school_id)
  return {
    taskId: randomUUID(),
    nodeId: 'node-1',
    schoolId: actor.school_id,
    actor,
    agentId: 'super-admin-member-1',
    idempotencyKey,
    approvalStatus,
    approvalCount,
  }
}

async function expectGatewayError(action: () => Promise<unknown>, code: string): Promise<void> {
  let captured: unknown
  try { await action() } catch (error) { captured = error }
  assert.ok(captured instanceof EnterpriseSkillGatewayError, `expected gateway error ${code}`)
  assert.equal(captured.code, code)
}

async function main(): Promise<void> {
  const port = new DeterministicSkillPort()
  const pending = context('effect-1', 'NOT_REQUIRED', 0)
  const prepared = await prepareEnterpriseSkillOperation('repair_dispatch', { count: 2 }, pending, port)
  assert.equal(port.prepareCount, 1)
  assert.equal(port.commitCount, 0, 'Prepare/Preview must not mutate business data')

  await expectGatewayError(
    () => executePreparedEnterpriseSkill('repair_dispatch', { count: 2 }, prepared, pending, port),
    'APPROVAL_REQUIRED'
  )
  assert.equal(port.commitCount, 0, 'Denied approval must not commit')

  const approved = { ...pending, approvalStatus: 'APPROVED' as const, approvalCount: 1 }
  const completed = await executePreparedEnterpriseSkill('repair_dispatch', { count: 2 }, prepared, approved, port)
  assert.deepEqual(completed.lifecycle, ['PREPARE', 'PREVIEW', 'APPROVE', 'REVALIDATE', 'COMMIT', 'VERIFY', 'REPORT'])
  assert.equal(completed.data.status, 'VERIFIED')
  assert.equal(completed.data.verification.verified, true)
  assert.equal(port.prepareCount, 2, 'Execution must revalidate after approval')
  assert.equal(port.commitCount, 1)
  assert.equal(port.verifyCount, 1)

  const replay = await executePreparedEnterpriseSkill('repair_dispatch', { count: 2 }, prepared, approved, port)
  assert.equal(replay.data.idempotentReplay, true)
  assert.equal(port.commitCount, 1, 'Idempotent replay committed a second business effect')
  assert.equal(port.verifyCount, 1, 'Already verified replay should not verify again')

  const stalePort = new DeterministicSkillPort()
  const staleContext = context('effect-stale', 'APPROVED', 1)
  const stalePreview = await prepareEnterpriseSkillOperation('repair_dispatch', { count: 2 }, staleContext, stalePort)
  stalePort.snapshotVersion = 2
  await expectGatewayError(
    () => executePreparedEnterpriseSkill('repair_dispatch', { count: 2 }, stalePreview, staleContext, stalePort),
    'STALE_PREVIEW'
  )
  assert.equal(stalePort.commitCount, 0, 'Stale preview must not commit')

  const batchPort = new DeterministicSkillPort()
  const batchContext = context('effect-batch', 'APPROVED', 1)
  const batchPreview = await prepareEnterpriseSkillOperation('batch_dispatch', { count: 11 }, batchContext, batchPort)
  await expectGatewayError(
    () => executePreparedEnterpriseSkill('batch_dispatch', { count: 11 }, batchPreview, batchContext, batchPort),
    'DUAL_APPROVAL_REQUIRED'
  )
  assert.equal(batchPort.commitCount, 0)

  const student = getDevelopmentUser('student')
  assert.ok(student?.school_id)
  const studentContext: SkillOperationContext = { ...context('student-effect', 'APPROVED', 1), actor: student, schoolId: student.school_id }
  await expectGatewayError(
    () => prepareEnterpriseSkillOperation('repair_dispatch', { count: 1 }, studentContext, new DeterministicSkillPort()),
    'PERMISSION_DENIED'
  )

  await expectGatewayError(
    () => prepareEnterpriseSkillOperation('visitor_approve', {
      visitorApplicationId: 'visitor-1', decision: 'approve', rationale: 'Identity checked',
      validFrom: '2026-08-10T08:00:00.000+08:00', validUntil: '2026-08-11T08:00:00.000+08:00',
    }, context('invalid-visitor', 'APPROVED', 1), new DeterministicSkillPort()),
    'INVALID_INPUT'
  )

  console.log(`PASS Skill Gateway lifecycle: prepare=${port.prepareCount} commit=${port.commitCount} verify=${port.verifyCount} replay=idempotent stale=blocked dual=blocked`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
