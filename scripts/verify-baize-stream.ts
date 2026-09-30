import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPostgresPool } from '../src/storage/database/postgres'
import { invokeGovernedModel } from '../src/lib/ai/model-gateway/service'
import { readBaizeStream } from '../src/lib/ai/assistant/client-stream'
import { decodeDeepSeekEvents } from '../src/lib/ai/model-gateway/stream'

const pool = getPostgresPool()
const originalFetch = globalThis.fetch
const originalKey = process.env.DEEPSEEK_API_KEY
const encoder = new TextEncoder()
function stream(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(encoder.encode(part)); controller.close() } })
}
function providerStream(text: string, terminated = true): Response {
  const events = [`data: ${JSON.stringify({ id: randomUUID(), model: 'deepseek-chat', choices: [{ delta: { content: text.slice(0, 2) } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(2) }, finish_reason: 'stop' }] })}\n\n`,
    `data: ${JSON.stringify({ usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 } })}\n\n`,
    ...(terminated ? ['data: [DONE]\n\n'] : [])]
  const bytes = events.join('')
  return new Response(stream([bytes.slice(0, 11), bytes.slice(11, 42), bytes.slice(42)]), { status: 200 })
}
async function main(): Promise<void> {
  const school = (await pool.query<{ school_id: string }>("SELECT school_id FROM users WHERE user_id='admin' AND school_id IS NOT NULL LIMIT 1")).rows[0]
  assert.ok(school)
  const previous = (await pool.query<{ route_mode: string; primary_provider: string | null; daily_budget_cents: number }>('SELECT route_mode,primary_provider,daily_budget_cents FROM ai_runtime_settings WHERE school_id=$1::uuid', [school.school_id])).rows[0]
  assert.ok(previous)
  let count = 0
  try {
    await pool.query("UPDATE ai_runtime_settings SET route_mode='external_preferred',primary_provider='deepseek',daily_budget_cents=0 WHERE school_id=$1::uuid", [school.school_id])
    process.env.DEEPSEEK_API_KEY = 'isolated-mock-only-no-network'
    const decoded: string[] = []
    for await (const chunk of decodeDeepSeekEvents(providerStream('您好').body!)) decoded.push(chunk.choices?.[0]?.delta?.content ?? '')
    assert.equal(decoded.join(''), '您好'); count += 1
    const framed: string[] = []
    await readBaizeStream(new Response(stream(['event: start\nda', 'ta: {"messageId":"id"}\n\nevent: delta\ndata: {"text":"你', '好"}\n\nevent: done\ndata: {"data":{"message":"你好"}}\n\n'])), ({ event }) => framed.push(event))
    assert.deepEqual(framed, ['start', 'delta', 'done']); count += 1
    await assert.rejects(readBaizeStream(new Response(stream(['event: delta\ndata: {"text":"部分"}\n\n'])), () => undefined), /中断/); count += 1
    let attempts = 0
    globalThis.fetch = async () => { attempts += 1; return attempts === 1 ? new Response('{}', { status: 429 }) : providerStream('白泽为你服务') }
    const deltas: string[] = []
    const first = await invokeGovernedModel({ schoolId: school.school_id, userId: 'dev-admin', conversationId: randomUUID(), purpose: 'assistant.clarification', systemPrompt: '校园助手', messages: [{ role: 'user', content: '您好' }] }, (part) => deltas.push(part))
    assert.equal(first.content, '白泽为你服务'); count += 1
    assert.equal(deltas.join(''), first.content); count += 1
    assert.equal(first.usage.totalTokens, 10); count += 1
    assert.equal(attempts, 2); count += 1
    const row = (await pool.query<{ status: string; streaming: boolean; attempts: string }>("SELECT status,(metadata->>'streaming')::boolean AS streaming,metadata->>'attempts' AS attempts FROM ai_model_invocations WHERE id=$1::uuid", [first.invocationId])).rows[0]
    assert.equal(row.status, 'SUCCEEDED'); assert.equal(row.streaming, true); assert.equal(row.attempts, '2'); count += 3
    globalThis.fetch = async () => providerStream('中断输出', false)
    await assert.rejects(invokeGovernedModel({ schoolId: school.school_id, userId: 'dev-admin', purpose: 'assistant.answer', systemPrompt: '校园助手', messages: [{ role: 'user', content: '问题' }] }, () => undefined)); count += 1
    const failed = (await pool.query<{ status: string; n: number }>("SELECT status,count(*)::int AS n FROM ai_model_invocations WHERE school_id=$1::uuid AND purpose='assistant.answer' AND metadata->>'streaming'='true' GROUP BY status ORDER BY status", [school.school_id])).rows.find((item) => item.status === 'FAILED')
    assert.ok(failed && failed.n >= 1); count += 1
    globalThis.fetch = async () => providerStream('并发审计正常')
    const runs = await Promise.all(Array.from({ length: 8 }, (_, i) => invokeGovernedModel({ schoolId: school.school_id, userId: 'dev-admin', conversationId: randomUUID(), purpose: 'assistant.clarification', systemPrompt: '校园助手', messages: [{ role: 'user', content: `并发${i}` }] }, () => undefined)))
    assert.equal(new Set(runs.map((item) => item.invocationId)).size, 8); count += 1
    const audit = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM ai_model_invocations WHERE id=ANY($1::uuid[]) AND status='SUCCEEDED'", [runs.map((item) => item.invocationId)])
    assert.equal(audit.rows[0].count, 8); count += 1
    console.log(`PASS native DeepSeek stream parser, retry, interrupted audit, 8 concurrent streams: assertions=${count}`)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
    await pool.query('UPDATE ai_runtime_settings SET route_mode=$2,primary_provider=$3,daily_budget_cents=$4 WHERE school_id=$1::uuid', [school.school_id, previous.route_mode, previous.primary_provider, previous.daily_budget_cents])
    await pool.end()
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })

