import './assert-isolated-test-environment.mjs'
// Live RAG answer assertions require DEEPSEEK_API_KEY and a governed tenant model route.
// If the key is unavailable, an answer assertion may fail by design; local citation/refusal behavior can still be tested separately.
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_KNOWLEDGE_TEST_BASE_URL || 'http://localhost:3100'
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
const counts = await pool.query(`SELECT
 (SELECT count(*)::int FROM ai_knowledge_documents WHERE metadata->>'showcaseVersion'='2026.08-ai5-v1' AND status='PUBLISHED') documents,
 (SELECT count(*)::int FROM ai_knowledge_chunks c JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE d.metadata->>'showcaseVersion'='2026.08-ai5-v1' AND c.version_id IN (SELECT id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED')) chunks,
 (SELECT count(*)::int FROM ai_knowledge_entities WHERE metadata->>'showcaseVersion'='2026.08-ai5-v1' AND status='PUBLISHED') entities,
 (SELECT count(*)::int FROM ai_knowledge_relations WHERE metadata->>'showcaseVersion'='2026.08-ai5-v1' AND status='PUBLISHED') relations,
 (SELECT count(*)::int FROM ai_knowledge_relations r JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id JOIN ai_knowledge_document_versions v ON v.id=c.version_id WHERE r.metadata->>'showcaseVersion'='2026.08-ai5-v1' AND v.version_no<>d.current_version) stale_relations`)
const row = counts.rows[0]
expect(Number(row.documents) === 10, 'showcase knowledge document count is not canonical')
expect(Number(row.chunks) >= 10, 'showcase knowledge chunks are incomplete')
expect(Number(row.entities) >= 24, 'showcase graph entities are incomplete')
expect(Number(row.relations) === 15, 'showcase graph relations are incomplete')
expect(Number(row.stale_relations) === 0, 'published graph contains superseded-version relations')
const student = await login('student'); const logistics = await login('logistics'); const operator = await login('ai_ops')
let result = await request('/api/ai/knowledge?scope=documents', student)
expect(result.response.status === 200 && result.json.data.length === 8, 'student knowledge scope is incorrect')
expect(!result.json.data.some((item) => item.title.includes('Agent') || item.title.includes('\u80fd\u8017\u5f02\u5e38')), 'student can see restricted operations knowledge')
result = await request('/api/ai/knowledge?scope=documents', logistics)
expect(result.response.status === 200 && result.json.data.length === 9, 'logistics knowledge scope is incorrect')
expect(result.json.data.some((item) => item.title.includes('\u80fd\u8017\u5f02\u5e38')), 'logistics role cannot see restricted energy runbook')
result = await request('/api/ai/knowledge?scope=documents', operator)
expect(result.response.status === 200 && result.json.data.length === 10, 'AI operations administrator cannot govern all knowledge documents')
result = await request('/api/ai/knowledge/graph', student)
expect(result.response.status === 200 && result.json.data.edges.length >= 10, 'student graph view omitted accessible published relations')
expect(result.json.data.edges.every((edge) => !edge.documentTitle.includes('Agent') && !edge.documentTitle.includes('\u80fd\u8017\u5f02\u5e38')), 'restricted graph edge leaked to student')
result = await request('/api/ai/knowledge/graph', operator)
expect(result.response.status === 200 && result.json.data.edges.length === 15, 'operations graph does not include all curated relations')
result = await request('/api/ai/knowledge/search', student, { method: 'POST', body: JSON.stringify({ question: '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u9700\u8981\u54ea\u4e9b\u6750\u6599\uff0c\u8c01\u8d1f\u8d23\u5ba1\u6838\uff1f' }) })
expect(result.response.status === 200 && result.json.data.status === 'ANSWERED', 'showcase trusted RAG did not answer')
expect(result.json.data.route.mode === 'HYBRID_GRAPH', 'showcase question did not use published graph expansion')
expect(result.json.data.citations.length >= 1 && result.json.data.answer.includes('[K1]'), 'showcase answer omitted source citation')
expect(result.json.data.retrieval.model?.purpose === 'knowledge.answer', 'showcase answer omitted governed DeepSeek evidence')
const audit = await pool.query('SELECT status,query_hash,answer_hash,model_invocation_id FROM ai_knowledge_retrievals WHERE id=$1::uuid', [result.json.data.retrieval.id])
expect(audit.rows[0]?.status === 'ANSWERED' && audit.rows[0]?.query_hash && audit.rows[0]?.answer_hash && audit.rows[0]?.model_invocation_id, 'showcase RAG audit lineage is incomplete')
console.log(`PASS AI-5 knowledge showcase: documents=${row.documents} chunks=${row.chunks} entities=${row.entities} relations=${row.relations} graphRAG=1 assertions=${assertions}`)
await pool.end()
