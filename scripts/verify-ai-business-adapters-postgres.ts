import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import { createAndPlanAiTask, decideAiTask } from '@/lib/ai/runtime/orchestrator'
import { getDevelopmentUser, DEVELOPMENT_SCHOOL_ID } from '@/lib/development-users'
const INTEGRATION_FIXTURES = {
  repairId: 'fixture-repair-1', classroomId: 'fixture-classroom-1', lostItemId: 'fixture-lost-1',
  hygieneInspectionId: 'fixture-hygiene-1', dormSafetyEventId: 'fixture-safety-1', visitorId: 'fixture-visitor-1',
  energyAssetId: 'fixture-energy-1',
  energyReadingIds: ['00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000503'],
} as const

interface Case {
  skillId: string
  gatewayKey: string
  params: Record<string, unknown>
}

async function scalar(client: Client, sql: string, values: unknown[] = []): Promise<unknown> {
  const result = await client.query(sql, values)
  return result.rows[0]?.value
}

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true })
  loadDotEnv({ quiet: true })
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const actor = getDevelopmentUser('admin')
  assert.ok(actor)

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const due = new Date(start.getTime() + 48 * 60 * 60 * 1000)
  const visitorFrom = new Date(Date.now() + 60 * 60 * 1000)
  const visitorUntil = new Date(visitorFrom.getTime() + 2 * 60 * 60 * 1000)
  const cases: Case[] = [
    { skillId: 'repair_policy_guard', gatewayKey: 'repair.policy.guard.v1', params: { count: 1, operation: 'sla_dispatch', reason: 'Postgres pre-write policy acceptance' } },
    { skillId: 'repair_dispatch', gatewayKey: 'repair.dispatch.commit.v1', params: { count: 1, reason: 'Postgres integration acceptance' } },
    { skillId: 'notification_publish', gatewayKey: 'notification.publish.commit.v1', params: { title: '本地集成通知', content: '这是由真实 PostgreSQL 适配器发布的验收通知。', type: 'SYSTEM', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: true } },
    { skillId: 'classroom_book', gatewayKey: 'classroom.booking.commit.v1', params: { classroomId: INTEGRATION_FIXTURES.classroomId, startsAt: start.toISOString(), endsAt: end.toISOString(), purpose: '企业 Agent 集成验收', attendeeCount: 20 } },
    { skillId: 'lost_found_claim', gatewayKey: 'lost_found.claim.commit.v1', params: { itemId: INTEGRATION_FIXTURES.lostItemId, claimerId: 'dev-student', humanConfirmed: true, verificationEvidence: '已由管理员现场核验校园卡隐私信息' } },
    { skillId: 'hygiene_rectification_create', gatewayKey: 'hygiene.rectification.create.v1', params: { inspectionId: INTEGRATION_FIXTURES.hygieneInspectionId, assigneeId: 'dev-hygiene', dueAt: due.toISOString(), requirements: ['清理检查区域并上传整改证据'], severity: 'medium' } },
    { skillId: 'dorm_safety_confirm', gatewayKey: 'dorm_safety.confirm.commit.v1', params: { eventId: INTEGRATION_FIXTURES.dormSafetyEventId, onsiteConfirmed: true, outcome: 'rectification_required', note: '宿管现场确认电流异常，需要整改' } },
    { skillId: 'visitor_approve', gatewayKey: 'visitor.admission.approve.v1', params: { visitorApplicationId: INTEGRATION_FIXTURES.visitorId, decision: 'approve', rationale: '身份与被访学生预约已由人工核验', validFrom: visitorFrom.toISOString(), validUntil: visitorUntil.toISOString() } },
    { skillId: 'maintenance_recommendation_create', gatewayKey: 'maintenance.recommendation.create.v1', params: { assetId: INTEGRATION_FIXTURES.energyAssetId, readingIds: [...INTEGRATION_FIXTURES.energyReadingIds], recommendedAction: '检查压缩机轴承与制冷剂压力', rationale: '三条通过质量检查的真实本地电表读数持续升高', confidence: 0.86, dueAt: due.toISOString(), estimatedSavingsKwh: 120 } },
  ]

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const targets = new Map<string, string | null>()
  try {
    for (const item of cases) {
      const task = await createAndPlanAiTask(actor, {
        command: `Postgres acceptance: ${item.skillId}`,
        skillId: item.skillId,
        params: item.params,
        idempotencyKey: `postgres-${item.skillId}-${randomUUID()}`,
      })
      assert.equal(task.state, 'AWAITING_APPROVAL', `${item.skillId}: must stop for approval`)
      assert.equal(task.nodes.length, 1, `${item.skillId}: must be one atomic business node`)
      assert.equal(task.nodes[0].preparedOperation?.skillKey, item.gatewayKey, `${item.skillId}: real Preview missing`)
      assert.ok(task.nodes[0].preparedOperation?.snapshotHash, `${item.skillId}: snapshot hash missing`)

      const completed = await decideAiTask(actor, task.id, 'approve', 'PostgreSQL adapter acceptance approval')
      assert.equal(completed.state, 'COMPLETED', `${item.skillId}: task not completed`)
      assert.equal(completed.nodes[0].state, 'COMPLETED', `${item.skillId}: node not completed`)
      assert.equal(completed.nodes[0].output?.status, 'VERIFIED', `${item.skillId}: effect not verified`)
      assert.equal((completed.nodes[0].output?.verification as Record<string, unknown>)?.verified, true, `${item.skillId}: readback evidence failed`)
      assert.deepEqual(completed.nodes[0].output?.lifecycle, ['PREPARE', 'PREVIEW', 'APPROVE', 'REVALIDATE', 'COMMIT', 'VERIFY', 'REPORT'])
      targets.set(item.skillId, typeof completed.nodes[0].output?.targetId === 'string' ? completed.nodes[0].output.targetId : null)
      console.log(`verified ${item.skillId}: task=${task.id} effect=${completed.nodes[0].output?.effectId}`)
    }

    assert.equal(await scalar(client, `SELECT decision AS value FROM ai_repair_policy_decisions WHERE id=$1::uuid AND school_id=$2::uuid AND business_write_occurred=false`, [targets.get('repair_policy_guard'), DEVELOPMENT_SCHOOL_ID]), 'PASS')
    assert.equal(await scalar(client, `SELECT business_write_occurred AS value FROM ai_repair_policy_decisions WHERE id=$1::uuid AND school_id=$2::uuid`, [targets.get('repair_policy_guard'), DEVELOPMENT_SCHOOL_ID]), false)
    assert.equal(await scalar(client, `SELECT status AS value FROM repair_orders WHERE id=$1 AND school_id=$2::uuid AND assignee_id='dev-repairman'`, [targets.get('repair_dispatch'), DEVELOPMENT_SCHOOL_ID]), 'DISPATCHED')
    assert.equal(await scalar(client, `SELECT status AS value FROM notifications WHERE id=$1 AND school_id=$2::uuid`, [targets.get('notification_publish'), DEVELOPMENT_SCHOOL_ID]), 'PUBLISHED')
    assert.equal(Number(await scalar(client, `SELECT count(*)::int AS value FROM notification_deliveries WHERE notification_id=$1 AND school_id=$2::uuid`, [targets.get('notification_publish'), DEVELOPMENT_SCHOOL_ID])), 1)
    assert.equal(await scalar(client, `SELECT upper(status) AS value FROM classroom_bookings WHERE id=$1 AND school_id=$2::uuid`, [targets.get('classroom_book'), DEVELOPMENT_SCHOOL_ID]), 'PENDING')
    assert.equal(await scalar(client, `SELECT lower(status) AS value FROM lost_found WHERE id=$1 AND school_id=$2::uuid AND claimer_id='dev-student' AND claim_evidence_hash IS NOT NULL`, [INTEGRATION_FIXTURES.lostItemId, DEVELOPMENT_SCHOOL_ID]), 'claimed')
    assert.equal(await scalar(client, `SELECT status AS value FROM hygiene_rectifications WHERE id=$1::uuid AND school_id=$2::uuid`, [targets.get('hygiene_rectification_create'), DEVELOPMENT_SCHOOL_ID]), 'OPEN')
    assert.equal(await scalar(client, `SELECT status AS value FROM dorm_safety_events WHERE id=$1 AND school_id=$2::uuid AND confirmed_by='dev-admin'`, [INTEGRATION_FIXTURES.dormSafetyEventId, DEVELOPMENT_SCHOOL_ID]), 'RECTIFICATION_REQUIRED')
    assert.equal(await scalar(client, `SELECT status AS value FROM visitors WHERE id=$1 AND school_id=$2::uuid AND qr_token_hash IS NOT NULL AND qr_valid_until>qr_valid_from`, [INTEGRATION_FIXTURES.visitorId, DEVELOPMENT_SCHOOL_ID]), 'APPROVED')
    assert.equal(await scalar(client, `SELECT status AS value FROM maintenance_recommendations WHERE id=$1::uuid AND school_id=$2::uuid AND data_quality->>'source'='real_energy_readings' AND (data_quality->>'synthetic')::boolean=false`, [targets.get('maintenance_recommendation_create'), DEVELOPMENT_SCHOOL_ID]), 'DRAFT')

    const ledger = await client.query(
      `SELECT
        count(*)::int AS effects,
        count(*) FILTER(WHERE status='VERIFIED')::int AS verified,
        count(DISTINCT effect_type)::int AS adapters
       FROM ai_business_effects WHERE school_id=$1::uuid`,
      [DEVELOPMENT_SCHOOL_ID]
    )
    assert.deepEqual(ledger.rows[0], { effects: 9, verified: 9, adapters: 9 })
    assert.equal(Number(await scalar(client, `SELECT count(*)::int AS value FROM ai_task_runs WHERE school_id=$1::uuid AND state='COMPLETED'`, [DEVELOPMENT_SCHOOL_ID])), 9)
    assert.equal(Number(await scalar(client, `SELECT count(*)::int AS value FROM ai_outbox_events WHERE school_id=$1::uuid`, [DEVELOPMENT_SCHOOL_ID])) > 0, true)
    assert.equal(Number(await scalar(client, `SELECT count(*)::int AS value FROM ai_audit_events WHERE school_id=$1::uuid`, [DEVELOPMENT_SCHOOL_ID])) > 0, true)
    assert.equal(Number(await scalar(client, `SELECT count(*)::int AS value FROM ai_tool_invocations WHERE school_id=$1::uuid AND status IN('PREPARED','SUCCEEDED')`, [DEVELOPMENT_SCHOOL_ID])) >= 18, true)

    console.log('PASS real PostgreSQL business adapters: planned=9 approved=9 committed=9 verified=9 domainReadbacks=9')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
