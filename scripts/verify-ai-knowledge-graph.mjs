import './assert-isolated-test-environment.mjs'
// Live RAG answer assertions require DEEPSEEK_API_KEY and a governed tenant model route.
// If the key is unavailable, an answer assertion may fail by design; local citation/refusal behavior can still be tested separately.
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_KNOWLEDGE_TEST_BASE_URL || 'http://localhost:3100'
const externalKey = `ai5-graph-${Date.now()}`
let documentId = null
let assertions = 0
function expect(value, message) { assert.ok(value, message); assertions += 1 }
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(90_000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
const login = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
assert.equal(login.response.status, 200)
const cookie = login.response.headers.get('set-cookie')?.split(';')[0] || ''
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  let result = await request('/api/ai/knowledge', cookie, { method: 'POST', body: JSON.stringify({
    title: '\u661f\u73af\u6f14\u7ec3\u573a\u7ba1\u7406\u89c4\u7a0b', externalKey, sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: '\u661f\u73af\u6f14\u7ec3\u573a\u7531\u6821\u56ed\u6d3b\u52a8\u4e2d\u5fc3\u8d1f\u8d23\u7ba1\u7406\u3002\u5927\u578b\u97f3\u4e50\u8282\u5fc5\u987b\u4f7f\u7528\u661f\u73af\u6f14\u7ec3\u573a\u3002\u6821\u56ed\u6d3b\u52a8\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u661f\u73af\u6f14\u7ec3\u573a\u7684\u573a\u5730\u7533\u8bf7\u3002\u4fdd\u536b\u4e2d\u5fc3\u8d1f\u8d23\u5ba1\u6838\u5927\u578b\u97f3\u4e50\u8282\u7684\u5b89\u4fdd\u9884\u6848\u3002',
  }) })
  expect(result.response.status === 201, 'graph source document ingestion failed')
  documentId = result.json.data.id
  result = await request('/api/ai/knowledge/relations', cookie, { method: 'POST', body: JSON.stringify({ action: 'extract', documentId }) })
  expect(result.response.status === 201 && result.json?.data?.modelInvocationId, `graph extraction failed: ${result.response.status}`)
  expect(result.json.data.entities >= 2 && result.json.data.relations >= 1, 'model returned no evidence-backed graph candidates')
  result = await request('/api/ai/knowledge/relations', cookie)
  expect(result.response.status === 200, 'graph candidate queue unavailable')
  const candidate = result.json.data.find((item) => item.documentTitle === '\u661f\u73af\u6f14\u7ec3\u573a\u7ba1\u7406\u89c4\u7a0b')
  expect(Boolean(candidate?.id && candidate?.evidence), 'extracted relation is missing evidence')
  result = await request('/api/ai/knowledge/relations', cookie, { method: 'PATCH', body: JSON.stringify({ relationId: candidate.id, decision: 'approve' }) })
  expect(result.response.status === 200 && result.json?.data?.status === 'PUBLISHED', 'human relation approval did not persist')
  result = await request('/api/ai/knowledge/graph', cookie)
  expect(result.response.status === 200 && result.json?.data?.edges?.some((edge) => edge.id === candidate.id), 'published relation is absent from graph view')
  const ledger = await pool.query("SELECT count(*)::int AS count FROM ai_model_invocations WHERE id=$1::uuid AND purpose='knowledge.graph_extract' AND status='SUCCEEDED'", [result.json?.data?.edges ? (await pool.query("SELECT (metadata->>'modelInvocationId')::uuid AS id FROM ai_knowledge_audit_events WHERE target_id=$1 AND action='GRAPH_CANDIDATES_EXTRACTED' ORDER BY created_at DESC LIMIT 1", [documentId])).rows[0]?.id : null])
  expect(Number(ledger.rows[0]?.count ?? 0) === 1, 'graph model invocation is absent from governed ledger')
  console.log(`PASS AI-5 graph governance: entities=${result.json.data.nodes.length} publishedEdge=1 modelLedger=1 assertions=${assertions}`)
} finally {
  if (documentId) {
    await pool.query('DELETE FROM ai_knowledge_documents WHERE id=$1::uuid', [documentId])
    await pool.query("DELETE FROM ai_knowledge_entities e WHERE e.school_id=(SELECT id FROM schools WHERE code='dev-school' LIMIT 1) AND NOT EXISTS(SELECT 1 FROM ai_knowledge_entity_mentions m WHERE m.entity_id=e.id) AND NOT EXISTS(SELECT 1 FROM ai_knowledge_relations r WHERE r.subject_entity_id=e.id OR r.object_entity_id=e.id) AND e.metadata->>'sourceDocumentId'=$1", [documentId])
  }
  await pool.end()
}
