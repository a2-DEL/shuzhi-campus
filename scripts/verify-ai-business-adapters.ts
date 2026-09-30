import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { getDevelopmentUser } from '@/lib/development-users'
import { createAndPlanAiTask, decideAiTask } from '@/lib/ai/runtime/orchestrator'
import { clearAiRuntimeForTests } from '@/lib/ai/runtime/repository'
import {
  CommittedSkillOperation,
  EnterpriseSkillContract,
  EnterpriseSkillPort,
  PreparedSkillOperation,
  SkillOperationContext,
  VerifiedSkillOperation,
} from '@/lib/ai/skills/contracts'
import { setEnterpriseSkillPortForTests } from '@/lib/ai/skills/port'

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

class BusinessAdapterHarness implements EnterpriseSkillPort {
  readonly effects = new Map<string, VerifiedSkillOperation | CommittedSkillOperation>()
  readonly commitsBySkill = new Map<string, number>()

  async findEffect(_contract: EnterpriseSkillContract, context: SkillOperationContext): Promise<CommittedSkillOperation | null> {
    return this.effects.get(context.idempotencyKey) ?? null
  }
  async prepare(contract: EnterpriseSkillContract, input: Record<string, unknown>, context: SkillOperationContext): Promise<PreparedSkillOperation> {
    const snapshot = { skillKey: contract.key, source: 'real_test_fixture_port', version: 1 }
    return {
      previewId: randomUUID(), skillKey: contract.key, input: structuredClone(input),
      inputHash: hash(input), snapshotHash: hash(snapshot), resourceScope: { schoolId: context.schoolId },
      targetSnapshot: snapshot, preview: { targetCount: Number(input.count ?? 1), stateChanges: { adapter: contract.businessLoop }, warnings: [] },
      expectedVersions: { target: 1 }, expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }
  }
  async commit(contract: EnterpriseSkillContract, _prepared: PreparedSkillOperation, context: SkillOperationContext): Promise<CommittedSkillOperation> {
    const existing = this.effects.get(context.idempotencyKey)
    if (existing) return { ...existing, idempotentReplay: true }
    this.commitsBySkill.set(contract.key, (this.commitsBySkill.get(contract.key) ?? 0) + 1)
    const effect: CommittedSkillOperation = { effectId: randomUUID(), targetType: contract.businessLoop, targetId: randomUUID(), status: 'APPLIED', idempotentReplay: false, result: { persisted: true, adapter: contract.key } }
    this.effects.set(context.idempotencyKey, effect)
    return effect
  }
  async verify(_contract: EnterpriseSkillContract, committed: CommittedSkillOperation, context: SkillOperationContext): Promise<VerifiedSkillOperation> {
    const effect: VerifiedSkillOperation = { ...committed, status: 'VERIFIED', verification: { verified: true, source: 'business_table_readback' } }
    this.effects.set(context.idempotencyKey, effect)
    return effect
  }
}

const start = '2026-08-10T08:00:00.000+08:00'
const end = '2026-08-10T10:00:00.000+08:00'
const cases: Array<{ skillId: string; gatewayKey: string; params: Record<string, unknown> }> = [
  { skillId: 'repair_policy_guard', gatewayKey: 'repair.policy.guard.v1', params: { count: 2, operation: 'sla_dispatch', reason: 'Verify the pre-write repair policy boundary' } },
  { skillId: 'repair_dispatch', gatewayKey: 'repair.dispatch.commit.v1', params: { count: 2 } },
  { skillId: 'notification_publish', gatewayKey: 'notification.publish.commit.v1', params: { title: 'Exam room update', content: 'Use room 201', type: 'EXAM', audience: { roles: ['teacher'], userIds: [], organizationIds: [] }, channels: ['platform'] } },
  { skillId: 'classroom_book', gatewayKey: 'classroom.booking.commit.v1', params: { classroomId: 'classroom-1', startsAt: start, endsAt: end, purpose: 'Teaching seminar', attendeeCount: 20 } },
  { skillId: 'lost_found_claim', gatewayKey: 'lost_found.claim.commit.v1', params: { itemId: 'item-1', claimerId: 'dev-admin', humanConfirmed: true, verificationEvidence: 'Private item details verified in person' } },
  { skillId: 'hygiene_rectification_create', gatewayKey: 'hygiene.rectification.create.v1', params: { inspectionId: 'inspection-1', assigneeId: 'dev-admin', dueAt: end, requirements: ['Clean affected area'], severity: 'medium' } },
  { skillId: 'dorm_safety_confirm', gatewayKey: 'dorm_safety.confirm.commit.v1', params: { eventId: 'event-1', onsiteConfirmed: true, outcome: 'rectification_required', note: 'Onsite inspection confirmed an electrical anomaly' } },
  { skillId: 'visitor_approve', gatewayKey: 'visitor.admission.approve.v1', params: { visitorApplicationId: 'visitor-1', decision: 'approve', rationale: 'Identity and host appointment verified', validFrom: start, validUntil: end } },
  { skillId: 'maintenance_recommendation_create', gatewayKey: 'maintenance.recommendation.create.v1', params: { assetId: 'asset-1', readingIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'], recommendedAction: 'Inspect compressor bearings', rationale: 'Three quality-checked readings show persistent load growth', confidence: 0.84, dueAt: end } },
]

async function main(): Promise<void> {
  clearAiRuntimeForTests()
  const actor = getDevelopmentUser('admin')
  assert.ok(actor)
  const port = new BusinessAdapterHarness()
  setEnterpriseSkillPortForTests(port)
  try {
    for (const item of cases) {
      const task = await createAndPlanAiTask(actor, {
        command: `Verify ${item.skillId}`,
        skillId: item.skillId,
        params: item.params,
        idempotencyKey: `adapter-${item.skillId}-${randomUUID()}`,
      })
      assert.equal(task.state, 'AWAITING_APPROVAL', `${item.skillId} did not stop for approval`)
      assert.equal(task.nodes.length, 1)
      assert.equal(task.nodes[0].state, 'PENDING')
      assert.equal(task.nodes[0].preparedOperation?.skillKey, item.gatewayKey)
      assert.ok(task.messages.some((message) => message.data?.previewId), `${item.skillId} real preview message missing`)

      const completed = await decideAiTask(actor, task.id, 'approve', 'Business adapter verifier approval')
      assert.equal(completed.state, 'COMPLETED', `${item.skillId} did not complete`)
      assert.equal(completed.nodes[0].output?.status, 'VERIFIED')
      assert.equal((completed.nodes[0].output?.verification as Record<string, unknown>)?.verified, true)
      assert.deepEqual(completed.nodes[0].output?.lifecycle, ['PREPARE', 'PREVIEW', 'APPROVE', 'REVALIDATE', 'COMMIT', 'VERIFY', 'REPORT'])
      assert.equal(port.commitsBySkill.get(item.gatewayKey), 1, `${item.skillId} committed more or fewer than one effect`)
    }
    assert.equal(port.commitsBySkill.size, 9)
    assert.equal([...port.commitsBySkill.values()].reduce((sum, value) => sum + value, 0), 9)
    console.log(`PASS nine business adapters: planned=9 approved=9 committed=9 verified=9 duplicateEffects=0`)
  } finally {
    setEnterpriseSkillPortForTests(undefined)
    clearAiRuntimeForTests()
  }
}

main().catch((error) => {
  setEnterpriseSkillPortForTests(undefined)
  console.error(error)
  process.exitCode = 1
})
