import './assert-isolated-test-environment.mjs'
// Live RAG answer assertions require DEEPSEEK_API_KEY and a governed tenant model route.
// If the key is unavailable, an answer assertion may fail by design; local citation/refusal behavior can still be tested separately.
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_KNOWLEDGE_TEST_BASE_URL || 'http://localhost:3100'
const externalKey = `ai5-baize-rag-${Date.now()}`
const startedAt = new Date().toISOString()
let documentId = null
let assertions = 0
function expect(value, message) { assert.ok(value, message); assertions += 1 }
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(90_000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  assert.equal(result.response.status, 200)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const admin = await login('admin'); const student = await login('student')
  let result = await request('/api/ai/knowledge', admin, { method: 'POST', body: JSON.stringify({
    title: '\u97f3\u4e50\u8282\u573a\u5730\u8054\u5408\u7533\u8bf7\u7ec6\u5219', externalKey, sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: '\u5b66\u751f\u7ec4\u7ec7\u7533\u8bf7\u97f3\u4e50\u8282\u573a\u5730\u5fc5\u987b\u63d0\u524d\u4e03\u4e2a\u5de5\u4f5c\u65e5\u3002\u6750\u6599\u5305\u62ec\u6d3b\u52a8\u65b9\u6848\u3001\u53c2\u52a0\u4eba\u6570\u3001\u821e\u53f0\u5e03\u5c40\u56fe\u3001\u5b89\u4fdd\u9884\u6848\u548c\u96e8\u5929\u5907\u7528\u573a\u5730\u3002\u540e\u52e4\u4e2d\u5fc3\u6838\u9a8c\u573a\u5730\u6863\u671f\uff0c\u4fdd\u536b\u4e2d\u5fc3\u5ba1\u6838\u5b89\u4fdd\u9884\u6848\u3002',
  }) })
  expect(result.response.status === 201, 'RAG policy ingestion failed'); documentId = result.json.data.id
  result = await request('/api/ai/tasks?page_size=100', student)
  const beforeTasks = result.json?.data?.data?.length ?? 0
  result = await request('/api/ai/assistant', student, { method: 'POST', body: JSON.stringify({ message: '\u97f3\u4e50\u8282\u573a\u5730\u7533\u8bf7\u8981\u63d0\u524d\u51e0\u4e2a\u5de5\u4f5c\u65e5\uff0c\u9700\u8981\u4ec0\u4e48\u6750\u6599\uff1f', mode: 'ask' }) })
  expect(result.response.status === 200 && result.json?.data?.kind === 'answer', 'White Ze did not route institution knowledge to RAG')
  expect(result.json.data.message.includes('[K1]'), 'White Ze RAG response omitted inline citation')
  expect(result.json.data.sources?.some((source) => source.backend === 'knowledge' && source.documentId === documentId), 'assistant response omitted knowledge source evidence')
  expect(result.json.data.model?.purpose === 'knowledge.answer' && result.json.data.model?.provider === 'deepseek', 'assistant response omitted governed model evidence')
  expect(result.json.data.routing?.intent === 'knowledge.rag' && result.json.data.routing?.shards?.some((shard) => shard.agentId === 'knowledge-citation'), 'assistant response omitted RAG Agent handoff chain')
  expect(!result.json.data.task, 'knowledge question unexpectedly created a business task')
  result = await request('/api/ai/tasks?page_size=100', student)
  expect((result.json?.data?.data?.length ?? 0) === beforeTasks, 'knowledge question mutated task state')
  result = await request('/api/ai/assistant', student, { method: 'POST', body: JSON.stringify({ message: '\u5b66\u6821\u91cf\u5b50\u4f20\u9001\u5b9e\u9a8c\u5ba4\u7684\u9690\u5f62\u95e8\u7981\u89c4\u5b9a\u662f\u4ec0\u4e48\uff1f', mode: 'ask' }) })
  expect(result.response.status === 200 && result.json?.data?.kind === 'clarify', 'unsupported institutional question did not refuse')
  expect(result.json.data.code === 'INSUFFICIENT_AUTHORIZED_EVIDENCE' && result.json.data.sources.length === 0, 'refusal leaked or fabricated evidence')
  const ledger = await pool.query("SELECT count(*)::int AS answered FROM ai_knowledge_retrievals WHERE user_id=(SELECT id FROM users WHERE user_id='student' LIMIT 1) AND created_at >= $1::timestamptz AND status='ANSWERED' AND answer_hash IS NOT NULL AND model_invocation_id IS NOT NULL", [startedAt])
  expect(Number(ledger.rows[0]?.answered ?? 0) >= 1, 'assistant RAG retrieval ledger is incomplete')
  console.log(`PASS White Ze trusted RAG: citation=1 model=1 refusal=1 noTaskMutation=1 assertions=${assertions}`)
} finally {
  const retrievals = await pool.query("SELECT id FROM ai_knowledge_retrievals WHERE user_id=(SELECT id FROM users WHERE user_id='student' LIMIT 1) AND created_at >= $1::timestamptz", [startedAt])
  if (retrievals.rows.length) await pool.query('DELETE FROM ai_knowledge_retrievals WHERE id=ANY($1::uuid[])', [retrievals.rows.map((row) => row.id)])
  if (documentId) await pool.query('DELETE FROM ai_knowledge_documents WHERE id=$1::uuid', [documentId])
  await pool.end()
}
