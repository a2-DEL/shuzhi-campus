import './assert-isolated-test-environment.mjs'
import { DEVELOPMENT_SCHOOL_ID, getDevelopmentUser } from '@/lib/development-users'
import { getPostgresPool } from '@/storage/database/postgres'
import { runGovernedModelProbe } from '@/lib/ai/model-gateway/service'

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

async function main(): Promise<void> {
  const operator = getDevelopmentUser('ai_ops')
  expect(operator?.school_id === DEVELOPMENT_SCHOOL_ID, 'AI operations test identity is unavailable')
  const pool = getPostgresPool()
  await pool.query(
    `UPDATE ai_runtime_settings SET route_mode='hybrid_fail_closed',primary_provider='deepseek',
       fallback_provider=NULL,max_model_calls=24,daily_budget_cents=0,updated_by=$2,updated_at=now()
     WHERE school_id=$1::uuid`,
    [DEVELOPMENT_SCHOOL_ID, operator.id],
  )
  const result = await runGovernedModelProbe(DEVELOPMENT_SCHOOL_ID, operator.id)
  expect(result.content.trim() === 'BAIZE_MODEL_OK', 'DeepSeek did not return the governed probe response')
  expect(result.usage.totalTokens > 0, 'DeepSeek usage metadata is missing')
  const audit = await pool.query<{
    status: string
    prompt_hash: string
    response_hash: string | null
    total_tokens: number | null
    error_message: string | null
  }>(
    `SELECT status,prompt_hash,response_hash,total_tokens,error_message
     FROM ai_model_invocations WHERE id=$1::uuid AND school_id=$2::uuid`,
    [result.invocationId, DEVELOPMENT_SCHOOL_ID],
  )
  const row = audit.rows[0]
  expect(row?.status === 'SUCCEEDED', 'Model invocation was not persisted as successful')
  expect(row.prompt_hash.length === 64 && row.response_hash?.length === 64, 'Model audit hashes are incomplete')
  expect(Number(row.total_tokens) === result.usage.totalTokens, 'Persisted token usage does not match the provider response')
  expect(row.error_message === null, 'Successful model invocation retained an error')
  console.log(`PASS DeepSeek live gateway: provider=${result.provider} model=${result.model} latencyMs=${result.latencyMs} totalTokens=${result.usage.totalTokens} audit=hashed`)
  await pool.end()
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_SECRET]') : 'DeepSeek live verification failed')
  try { await getPostgresPool().end() } catch {}
  process.exit(1)
})
