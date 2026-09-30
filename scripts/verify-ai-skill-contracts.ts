import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { ENTERPRISE_SKILL_KEYS } from '@/lib/ai/skills/contracts'
import {
  ENTERPRISE_SKILL_ALIASES,
  getEnterpriseSkillContract,
  listEnterpriseSkillContracts,
} from '@/lib/ai/skills/registry'

function validInput(key: string): Record<string, unknown> {
  const start = '2026-08-10T08:00:00.000+08:00'
  const end = '2026-08-10T10:00:00.000+08:00'
  switch (key) {
    case 'repair.policy.guard.v1': return { count: 2, operation: 'sla_dispatch', reason: 'Validate the governed repair SLA execution boundary' }
    case 'repair.dispatch.commit.v1': return { count: 2 }
    case 'notification.publish.commit.v1': return { title: 'Exam notice', content: 'Room changed', type: 'EXAM', audience: { roles: ['teacher'], userIds: [], organizationIds: [] }, channels: ['platform'] }
    case 'classroom.booking.commit.v1': return { classroomId: 'room-1', startsAt: start, endsAt: end, purpose: 'Teaching seminar', attendeeCount: 20 }
    case 'lost_found.claim.commit.v1': return { itemId: 'item-1', claimerId: 'user-1', humanConfirmed: true, verificationEvidence: 'Verified private item details in person' }
    case 'hygiene.rectification.create.v1': return { inspectionId: 'inspection-1', assigneeId: 'user-1', dueAt: end, requirements: ['Clean the affected area'], severity: 'medium' }
    case 'dorm_safety.confirm.commit.v1': return { eventId: 'event-1', onsiteConfirmed: true, outcome: 'rectification_required', note: 'Onsite inspection confirmed an electrical anomaly' }
    case 'visitor.admission.approve.v1': return { visitorApplicationId: 'visitor-1', decision: 'approve', rationale: 'Identity and host appointment verified', validFrom: start, validUntil: end }
    case 'maintenance.recommendation.create.v1': return { assetId: 'asset-1', readingIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'], recommendedAction: 'Inspect compressor bearings', rationale: 'Three quality-checked readings show a persistent load increase', confidence: 0.82, dueAt: end }
    default: throw new Error(`No fixture for ${key}`)
  }
}

async function main(): Promise<void> {
  const contracts = listEnterpriseSkillContracts()
  assert.equal(contracts.length, 9)
  assert.deepEqual(contracts.map((item) => item.key), [...ENTERPRISE_SKILL_KEYS])
  assert.equal(new Set(contracts.map((item) => item.businessLoop)).size, 9)
  assert.equal(new Set(contracts.map((item) => item.key)).size, contracts.length)

  for (const contract of contracts) {
    assert.equal(contract.version, 1)
    assert.ok(Object.isFrozen(contract), `${contract.key} must be immutable`)
    assert.ok(Object.isFrozen(contract.retryPolicy))
    assert.ok(Object.isFrozen(contract.rateLimit))
    assert.ok(Object.isFrozen(contract.auditPolicy))
    assert.ok(Object.isFrozen(contract.previewPolicy))
    assert.ok(Object.isFrozen(contract.compensation))
    assert.ok(contract.owner && contract.requiredPermission && contract.evalSet)
    assert.ok(contract.allowedRoles.length > 0)
    assert.ok(contract.timeoutMs > 0 && contract.timeoutMs <= 60_000)
    assert.ok(contract.rateLimit.requests > 0)
    const parsed = contract.inputSchema.safeParse(validInput(contract.key))
    assert.equal(parsed.success, true, `${contract.key} rejected its valid contract fixture`)
    if (contract.key !== 'repair.dispatch.commit.v1') {
      assert.equal(contract.inputSchema.safeParse({}).success, false, `${contract.key} accepted an empty payload`)
    }
  }

  assert.equal(getEnterpriseSkillContract('repair_policy_guard')?.key, 'repair.policy.guard.v1')
  assert.equal(getEnterpriseSkillContract('smart_dispatch')?.key, 'repair.dispatch.commit.v1')
  assert.equal(getEnterpriseSkillContract('visitor_approve')?.key, 'visitor.admission.approve.v1')
  assert.equal(Object.keys(ENTERPRISE_SKILL_ALIASES).length, 12)
  assert.equal(getEnterpriseSkillContract('arbitrary_sql'), undefined)
  assert.equal(getEnterpriseSkillContract('fetch_any_url'), undefined)
  console.log(`PASS enterprise Skill contracts: loops=9 versions=immutable aliases=${Object.keys(ENTERPRISE_SKILL_ALIASES).length}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
