import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { getPostgresPool } from '../src/storage/database/postgres'
import { invokeGovernedModel } from '../src/lib/ai/model-gateway/service'

async function main(): Promise<void> {
  if (process.env.RUN_BAIZE_LIVE_MODEL_TEST !== '1') throw new Error('Set RUN_BAIZE_LIVE_MODEL_TEST=1 to explicitly allow one paid model call in the isolated database')
  config({ path: '.env.local', quiet: true })
  if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is not configured; live model test is not a business regression failure')
  const pool = getPostgresPool()
  const school = (await pool.query<{ school_id: string }>("SELECT school_id FROM users WHERE user_id='admin' AND school_id IS NOT NULL LIMIT 1")).rows[0]
  assert.ok(school)
  const prior = (await pool.query<{ route_mode: string; primary_provider: string | null; daily_budget_cents: number }>('SELECT route_mode,primary_provider,daily_budget_cents FROM ai_runtime_settings WHERE school_id=$1::uuid', [school.school_id])).rows[0]
  assert.ok(prior)
  try {
    await pool.query("UPDATE ai_runtime_settings SET route_mode='external_preferred',primary_provider='deepseek',daily_budget_cents=0 WHERE school_id=$1::uuid", [school.school_id])
    const parts: string[] = []
    const result = await invokeGovernedModel({ schoolId: school.school_id, userId: 'dev-admin', conversationId: randomUUID(), purpose: 'assistant.clarification',
      systemPrompt: '你是校园助手白泽。不要提供真实校园业务记录，只回答一般帮助介绍。用一段不少于100字的中文说明你如何引导学生通过页面提交报修、查询进度和保护隐私。',
      messages: [{ role: 'user', content: '请介绍你的校园服务用途。' }], maxTokens: 250 }, (delta) => parts.push(delta))
    assert.equal(parts.join(''), result.content)
    assert.ok(parts.length > 1, 'native provider yielded no incremental fragments')
    const audit = (await pool.query<{ status: string; streaming: boolean }>("SELECT status,(metadata->>'streaming')::boolean AS streaming FROM ai_model_invocations WHERE id=$1::uuid", [result.invocationId])).rows[0]
    assert.equal(audit.status, 'SUCCEEDED'); assert.equal(audit.streaming, true)
    console.log(`PASS live DeepSeek stream: fragments=${parts.length}, outputCharacters=${result.content.length}, audited=true`)
  } finally {
    await pool.query('UPDATE ai_runtime_settings SET route_mode=$2,primary_provider=$3,daily_budget_cents=$4 WHERE school_id=$1::uuid', [school.school_id, prior.route_mode, prior.primary_provider, prior.daily_budget_cents])
    await pool.end()
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
