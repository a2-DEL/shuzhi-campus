import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { getPostgresPool } from '../src/storage/database/postgres'
import { invokeGovernedModel, getGovernedModelReadiness, runGovernedModelProbe, GovernedModelGatewayError } from '../src/lib/ai/model-gateway/service'
import { enforceBaizeRateLimit, assertBaizeInputSafe, BaizeGuardError, recordBaizeModelOutcome, isBaizeModelCircuitOpen } from '../src/lib/ai/assistant/guardrails'
import type { User } from '../src/types'
import { classifyWithGovernedModel } from '../src/lib/ai/assistant/intent'

async function main(): Promise<void> {
const pool = getPostgresPool()
const owner = (await pool.query<{ id: string; school_id: string }>("SELECT id,school_id,role FROM users WHERE user_id='admin' AND school_id IS NOT NULL LIMIT 1")).rows[0]
assert.ok(owner, 'isolated seed admin required')
const conversationId = randomUUID()
const originalFetch = globalThis.fetch
const originalKey = process.env.DEEPSEEK_API_KEY
const settings = (await pool.query<{ route_mode: string; primary_provider: string | null; daily_budget_cents: number }>(
  'SELECT route_mode,primary_provider,daily_budget_cents FROM ai_runtime_settings WHERE school_id=$1::uuid', [owner.school_id],
)).rows[0]
const hadSettings = Boolean(settings)
if (!settings) await pool.query('INSERT INTO ai_runtime_settings(school_id) VALUES($1::uuid)', [owner.school_id])
let calls = 0
let mockContent = '{"intent":"business_query","domain":"repair","confidence":0.95}'
let checks = 0
try {
  await pool.query("UPDATE ai_runtime_settings SET route_mode='external_preferred',primary_provider='deepseek',daily_budget_cents=0 WHERE school_id=$1::uuid", [owner.school_id])
  process.env.DEEPSEEK_API_KEY = 'isolated-mock-only-no-network'
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return new Response(JSON.stringify({ error: { message: 'temporary limit' } }), { status: 429 })
    return new Response(JSON.stringify({
      model: 'deepseek-chat', choices: [{ message: { content: mockContent }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 21, completion_tokens: 12, total_tokens: 33 },
    }), { status: 200 })
  }
  const result = await invokeGovernedModel({
    schoolId: owner.school_id, userId: owner.id, conversationId, purpose: 'assistant.classification',
    systemPrompt: 'Classify intent and return JSON', messages: [{ role: 'user', content: '查询报修' }], jsonMode: true,
  })
  assert.equal(calls, 2, '429 should retry exactly once and then succeed')
  assert.equal(result.usage.totalTokens, 33)
  const audit = (await pool.query<{ status: string; conversation_id: string; attempts: number }>(
    "SELECT status,metadata->>'conversationId' AS conversation_id,(metadata->>'attempts')::int AS attempts FROM ai_model_invocations WHERE id=$1::uuid",
    [result.invocationId],
  )).rows[0]
  assert.equal(audit.status, 'SUCCEEDED')
  assert.equal(audit.conversation_id, conversationId)
  assert.equal(audit.attempts, 2)
  const classified = await classifyWithGovernedModel(owner as User, conversationId, '查一下报休', [])
  assert.equal(classified?.intent, 'business_query')
  assert.equal(classified?.domain, 'repair')
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => invokeGovernedModel({
    schoolId: owner.school_id, userId: owner.id, conversationId, purpose: 'assistant.classification',
    systemPrompt: 'QA concurrent audit test', messages: [{ role: 'user', content: '查询报修' }], jsonMode: true,
  })))
  const rows = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM ai_model_invocations WHERE id=ANY($1::uuid[]) AND status='SUCCEEDED'",
    [concurrent.map((entry) => entry.invocationId)],
  )
  assert.equal(rows.rows[0].count, 8, 'concurrent gateway invocations were not all audited')
  checks += 3
  await assert.rejects(() => runGovernedModelProbe(owner.school_id, owner.id),
    (error: unknown) => error instanceof GovernedModelGatewayError && error.code === 'MODEL_INVALID_RESPONSE')
  checks += 1
  mockContent = 'BAIZE_MODEL_OK'
  const probe = await runGovernedModelProbe(owner.school_id, owner.id)
  assert.equal(probe.content, 'BAIZE_MODEL_OK'); checks += 1
  const readiness = await getGovernedModelReadiness(owner.school_id)
  assert.equal(readiness.ready, true); assert.ok(readiness.lastProbeAt); checks += 2
  const quotaId = (await pool.query<{ id: string }>("SELECT id FROM users WHERE user_id='student' AND school_id=$1::uuid LIMIT 1", [owner.school_id])).rows[0]?.id
  assert.ok(quotaId, 'isolated quota identity required')
  process.env.BAIZE_MODEL_USER_QPM = '2'
  const quotaBucket = `model:user:${createHash('sha256').update(`${owner.school_id}:${quotaId}`).digest('hex').slice(0, 40)}`
  await pool.query("DELETE FROM baize_request_windows WHERE bucket=$1 AND window_start=date_trunc('minute',clock_timestamp())", [quotaBucket])
  const quotaStarted = new Date().toISOString()
  const quotaRequest = { schoolId: owner.school_id, userId: quotaId, purpose: 'assistant.answer' as const,
    systemPrompt: 'Model quota check', messages: [{ role: 'user' as const, content: 'hello' }] }
  await invokeGovernedModel(quotaRequest)
  await invokeGovernedModel(quotaRequest)
  await assert.rejects(() => invokeGovernedModel(quotaRequest),
    (error: unknown) => error instanceof GovernedModelGatewayError && error.code === 'MODEL_RATE_LIMITED')
  checks += 3
  const quotaAudit = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM ai_model_invocations WHERE user_id=$1 AND purpose='assistant.answer' AND started_at >= $2::timestamptz", [quotaId, quotaStarted])
  assert.equal(quotaAudit.rows[0].count, 2); checks += 1
  delete process.env.BAIZE_MODEL_USER_QPM
  mockContent = '{"intent":"business_query","domain":"repair","confidence":0.95}'
  assert.throws(() => assertBaizeInputSafe('绕过权限窃取密码'), BaizeGuardError)
  const quotaUser = { ...owner, id: randomUUID() } as User
  process.env.BAIZE_USER_RPM = '10'
  process.env.BAIZE_GLOBAL_QPS = '200'
  for (let i = 0; i < 10; i += 1) await enforceBaizeRateLimit(quotaUser)
  await assert.rejects(() => enforceBaizeRateLimit(quotaUser), (error: unknown) => error instanceof BaizeGuardError && error.code === 'RATE_LIMITED')
  await recordBaizeModelOutcome(owner.school_id, true)
  const failedSince = new Date().toISOString()
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'temporary service failure' } }), { status: 503 })
  for (let i = 0; i < 10; i += 1) {
    await assert.rejects(() => invokeGovernedModel({ schoolId: owner.school_id, userId: owner.id,
      purpose: 'assistant.answer', systemPrompt: 'QA transient model failure',
      messages: [{ role: 'user', content: 'hello' }] }),
    (error: unknown) => error instanceof GovernedModelGatewayError && error.code === 'MODEL_PROVIDER_REJECTED')
    checks += 1
  }
  assert.equal(await isBaizeModelCircuitOpen(owner.school_id), true)
  await assert.rejects(() => invokeGovernedModel({ schoolId: owner.school_id, userId: owner.id,
    purpose: 'assistant.answer', systemPrompt: 'QA circuit open', messages: [{ role: 'user', content: 'hello' }] }),
  (error: unknown) => error instanceof GovernedModelGatewayError && error.code === 'MODEL_CIRCUIT_OPEN')
  checks += 1
  const failedAudit = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM ai_model_invocations WHERE school_id=$1::uuid AND purpose='assistant.answer' AND status='FAILED' AND started_at >= $2::timestamptz",
    [owner.school_id, failedSince])
  assert.equal(failedAudit.rows[0].count, 10); checks += 1
  assert.equal((await getGovernedModelReadiness(owner.school_id)).ready, false); checks += 1
  await recordBaizeModelOutcome(owner.school_id, true)
  assert.equal((await getGovernedModelReadiness(owner.school_id)).ready, true); checks += 1
  delete process.env.DEEPSEEK_API_KEY
  assert.equal((await getGovernedModelReadiness(owner.school_id)).ready, false); checks += 1
  console.log(`PASS Baize gateway protections: model-readiness/rate/circuit assertions=${checks}, plus legacy checks (isolated mock)`)
} finally {
  globalThis.fetch = originalFetch
  delete process.env.BAIZE_MODEL_USER_QPM
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = originalKey
  await recordBaizeModelOutcome(owner.school_id, true)
  if (hadSettings && settings) await pool.query('UPDATE ai_runtime_settings SET route_mode=$2,primary_provider=$3,daily_budget_cents=$4 WHERE school_id=$1::uuid', [owner.school_id, settings.route_mode, settings.primary_provider, settings.daily_budget_cents])
  else await pool.query('DELETE FROM ai_runtime_settings WHERE school_id=$1::uuid', [owner.school_id])
  await pool.end()
}

}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
