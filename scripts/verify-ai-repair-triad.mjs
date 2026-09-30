import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { config as loadDotEnv } from 'dotenv'
import pg from 'pg'

loadDotEnv({ path: '.env.local', quiet: true })
loadDotEnv({ quiet: true })

const baseUrl = process.env.AI_REPAIR_TRIAD_TEST_BASE_URL || 'http://localhost:3100'
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(90_000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}

async function login() {
  const result = await request('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ userId: 'admin', password: '123456' }),
  })
  assert.equal(result.response.status, 200, 'admin login failed')
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}

function expect(value, message) {
  assert.ok(value, message)
}

const cookie = await login()
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let taskId = ''
try {
  let result = await request('/api/ai/scenarios', cookie, {
    method: 'POST',
    body: JSON.stringify({ scenario: 'repair_sla' }),
  })
  assert.equal(result.response.status, 201, `repair SLA preview failed: ${result.json?.error || result.response.status}`)
  const previewTask = result.json?.data
  taskId = previewTask?.id
  expect(taskId, 'repair SLA task id missing')
  assert.equal(previewTask.state, 'AWAITING_APPROVAL')
  assert.deepEqual(previewTask.nodes.map((node) => node.skillId), ['repair_policy_guard', 'repair_dispatch', 'notification_publish'])
  expect(previewTask.nodes.every((node) => node.preview?.ready && !node.effect), 'one or more pre-write previews are missing')

  const guardPreview = previewTask.nodes[0].preview.summary
  assert.equal(guardPreview.policyDecision, 'PASS_TO_HUMAN_APPROVAL')
  assert.equal(guardPreview.businessWriteOccurred, false)
  assert.equal(guardPreview.checks.tenantScope, 'PASS')
  assert.equal(guardPreview.checks.targetState, 'PASS')
  assert.equal(guardPreview.checks.activeWorkerPool, 'PASS')
  const repairIds = guardPreview.affectedResources.map((item) => item.repairId)
  expect(repairIds.length >= 1, 'guard preview did not resolve real repair targets')

  const before = await pool.query(
    `SELECT id,status,version,assignee_id FROM repair_orders WHERE id=ANY($1::text[]) ORDER BY id`,
    [repairIds],
  )
  expect(before.rows.every((row) => row.status === 'PENDING' && row.assignee_id === null), 'repair targets changed before approval')

  result = await request(`/api/ai/tasks/${taskId}`, cookie, {
    method: 'PUT',
    body: JSON.stringify({ action: 'confirm', reason: 'Three-spirit PostgreSQL acceptance approval' }),
  })
  assert.equal(result.response.status, 200, `repair SLA approval failed: ${result.json?.error || result.response.status}`)
  const completed = result.json?.data
  assert.equal(completed.state, 'COMPLETED')
  assert.equal(completed.nodes.length, 3)
  expect(completed.nodes.every((node) => node.state === 'COMPLETED' && node.effect?.status === 'VERIFIED'), 'three-spirit effects did not all verify')

  const guard = completed.nodes.find((node) => node.skillId === 'repair_policy_guard')
  const dispatch = completed.nodes.find((node) => node.skillId === 'repair_dispatch')
  const notification = completed.nodes.find((node) => node.skillId === 'notification_publish')
  assert.equal(guard.effect.result.businessWriteOccurred, false)
  assert.equal(guard.effect.verification.businessWriteOccurred, false)
  assert.equal(guard.effect.verification.snapshotSealed, true)
  assert.equal(guard.effect.verification.humanApprovalRecorded, true)
  assert.equal(dispatch.effect.result.dispatched, repairIds.length)
  expect(notification.effect.result.deliveryTasks >= notification.effect.result.audienceCount, 'notification delivery tasks were not persisted')

  const proof = await pool.query(
    `SELECT
      (SELECT count(*)::int FROM ai_repair_policy_decisions WHERE task_id=$1::uuid AND decision='PASS' AND business_write_occurred=false AND verified_at IS NOT NULL) policy_decisions,
      (SELECT count(*)::int FROM ai_business_effects WHERE task_id=$1::uuid AND status='VERIFIED') verified_effects,
      (SELECT count(*)::int FROM ai_tool_invocations WHERE task_id=$1::uuid AND status IN('PREPARED','SUCCEEDED')) tool_invocations,
      (SELECT count(*)::int FROM repair_orders WHERE id=ANY($2::text[]) AND status='DISPATCHED' AND assignee_id IS NOT NULL) dispatched_repairs,
      (SELECT count(*)::int FROM notification_deliveries WHERE notification_id=$3 AND school_id=(SELECT school_id FROM ai_task_runs WHERE id=$1::uuid)) delivery_tasks`,
    [taskId, repairIds, notification.effect.targetId],
  )
  assert.deepEqual(proof.rows[0], {
    policy_decisions: 1,
    verified_effects: 3,
    tool_invocations: 6,
    dispatched_repairs: repairIds.length,
    delivery_tasks: notification.effect.result.deliveryTasks,
  })

  const events = await pool.query(
    `SELECT event_type,created_at FROM ai_outbox_events
     WHERE aggregate_type='ai_task_run' AND aggregate_id=$1
     ORDER BY created_at,id`,
    [taskId],
  )
  const eventTypes = events.rows.map((row) => row.event_type)
  const expectedOrder = [
    'task.policy_guard.started',
    'task.policy_guard.completed',
    'task.policy_guard.passed',
    'task.nodes.started',
    'task.nodes.completed',
    'task.verification.started',
    'task.completed',
  ]
  let cursor = -1
  for (const eventType of expectedOrder) {
    const next = eventTypes.indexOf(eventType)
    expect(next > cursor, `persisted event order missing or invalid at ${eventType}: ${eventTypes.join(',')}`)
    cursor = next
  }

  const chronology = await pool.query(
    `SELECT
      (SELECT created_at FROM ai_repair_policy_decisions WHERE task_id=$1::uuid LIMIT 1) policy_at,
      (SELECT applied_at FROM ai_business_effects WHERE task_id=$1::uuid AND effect_type='repair.dispatch.commit.v1' LIMIT 1) dispatch_at`,
    [taskId],
  )
  expect(new Date(chronology.rows[0].policy_at).getTime() <= new Date(chronology.rows[0].dispatch_at).getTime(), 'repair dispatch occurred before the policy decision was sealed')

  console.log(`PASS repair triad: task=${taskId} agents=3 guard=VERIFIED repairs=${repairIds.length} deliveries=${notification.effect.result.deliveryTasks} persistedEvents=${eventTypes.length}`)
  console.log(`EVIDENCE task=${taskId} policyEffect=${guard.effect.id} dispatchEffect=${dispatch.effect.id} notificationEffect=${notification.effect.id}`)
} finally {
  await pool.end()
}
