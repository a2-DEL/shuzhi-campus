import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPostgresPool } from '../src/storage/database/postgres'
import { invokeGovernedModel } from '../src/lib/ai/model-gateway/service'

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null
if (process.env.TEST_ISOLATED_DATABASE !== '1' || !url || !/^qa_[a-z0-9_]+$/i.test(url.pathname.slice(1))) {
  throw new Error('Model concurrency verifier requires TEST_ISOLATED_DATABASE=1 and an isolated qa_* PostgreSQL database')
}

async function main(): Promise<void> {
  const pool = getPostgresPool()
  const originalFetch = globalThis.fetch
  const testPurpose = 'operations.probe' as const

  try {
    const tenant = await pool.query<{ school_id: string; route_mode: string; primary_provider: string | null; max_model_calls: number; daily_budget_cents: number }>(
      `SELECT s.school_id::text,s.route_mode,s.primary_provider,s.max_model_calls,s.daily_budget_cents
       FROM ai_runtime_settings s JOIN schools school ON school.id=s.school_id WHERE school.code='default-school' LIMIT 1`,
    )
    assert.ok(tenant.rows[0], 'Isolated tenant settings must exist')
    const settings = tenant.rows[0]
    try {
      await pool.query(`UPDATE ai_runtime_settings SET route_mode='hybrid_fail_closed',primary_provider='deepseek',
        max_model_calls=100,daily_budget_cents=0 WHERE school_id=$1::uuid`, [settings.school_id])
      process.env.DEEPSEEK_API_KEY = randomUUID() // Only the mocked fetch sees this disposable placeholder.
      process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        assert.equal(new URL(String(input)).hostname, 'api.deepseek.com')
        return new Response(JSON.stringify({
          id: randomUUID(), model: 'deepseek-chat',
          choices: [{ finish_reason: 'stop', message: { content: 'MOCK_MODEL_OK' } }],
          usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const concurrency = 8
      const results = await Promise.all(Array.from({ length: concurrency }, () => invokeGovernedModel({
        schoolId: settings.school_id,
        purpose: testPurpose,
        systemPrompt: 'Local mocked concurrency verification only',
        messages: [{ role: 'user', content: 'Return MOCK_MODEL_OK' }],
        maxTokens: 64,
      })))
      const ledger = await pool.query<{ id: string; status: string }>(
        `SELECT id::text,status FROM ai_model_invocations WHERE school_id=$1::uuid AND id=ANY($2::uuid[])`,
        [settings.school_id, results.map((result) => result.invocationId)],
      )
      assert.equal(results.length, concurrency)
      assert.equal(new Set(results.map((result) => result.invocationId)).size, concurrency)
      assert.equal(ledger.rows.length, concurrency, 'Every mocked model call must have exactly one audit row')
      assert.ok(ledger.rows.every((row) => row.status === 'SUCCEEDED'))
      console.log(`PASS concurrent model audit: calls=${concurrency} ledger=${ledger.rows.length} statuses=SUCCEEDED (mocked HTTP, isolated PG)`)
    } finally {
      globalThis.fetch = originalFetch
      await pool.query(`UPDATE ai_runtime_settings SET route_mode=$2,primary_provider=$3,max_model_calls=$4,daily_budget_cents=$5
        WHERE school_id=$1::uuid`, [settings.school_id, settings.route_mode, settings.primary_provider, settings.max_model_calls, settings.daily_budget_cents])
    }
  } finally {
    await pool.end()
  }
}

void main().catch((error: unknown) => {
  console.error('Isolated model concurrency verification failed', error)
  process.exitCode = 1
})
