import './assert-isolated-test-environment.mjs'
// Live RAG answer assertions require DEEPSEEK_API_KEY and a governed tenant model route.
// If the key is unavailable, an answer assertion may fail by design; local citation/refusal behavior can still be tested separately.
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_KNOWLEDGE_TEST_BASE_URL || 'http://localhost:3100'
const stamp = Date.now()
const tenantKey = `ai5-retrieval-tenant-${stamp}`
const restrictedKey = `ai5-retrieval-role-${stamp}`
const retrievalIds = []

async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(60_000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  assert.equal(result.response.status, 200, `${userId} login failed`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
let assertions = 0
function expect(value, message) { assert.ok(value, message); assertions += 1 }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const admin = await login('admin'); const student = await login('student'); const logistics = await login('logistics')
  let result = await request('/api/ai/knowledge', admin, { method: 'POST', body: JSON.stringify({
    title: '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u4e0e\u5b89\u4fdd\u8054\u5408\u7533\u8bf7\u89c4\u7a0b', externalKey: tenantKey, sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL',
    content: '\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u5fc5\u987b\u63d0\u524d\u4e94\u4e2a\u5de5\u4f5c\u65e5\u63d0\u4ea4\u3002\u6d3b\u52a8\u8d1f\u8d23\u4eba\u9700\u8981\u63d0\u4ea4\u6d3b\u52a8\u65b9\u6848\u3001\u53c2\u52a0\u4eba\u6570\u3001\u573a\u5730\u9700\u6c42\u3001\u5b89\u4fdd\u9884\u6848\u548c\u96e8\u5929\u5907\u7528\u65b9\u6848\u3002\u540e\u52e4\u4e2d\u5fc3\u6838\u9a8c\u573a\u5730\u6863\u671f\uff0c\u4fdd\u536b\u4e2d\u5fc3\u6838\u9a8c\u4eba\u6d41\u4e0a\u9650\u3002\u4e24\u9879\u6838\u9a8c\u901a\u8fc7\u540e\u7531\u5b66\u6821\u529e\u516c\u5ba4\u5b8c\u6210\u6700\u7ec8\u5ba1\u6279\u3002',
  }) })
  expect(result.response.status === 201, 'tenant policy ingestion failed')
  const tenantDocumentId = result.json.data.id
  result = await request('/api/ai/knowledge', admin, { method: 'POST', body: JSON.stringify({
    title: '\u51b7\u7ad9\u8bbe\u5907\u632f\u52a8\u5f02\u5e38\u5185\u90e8\u5904\u7f6e\u624b\u518c', externalKey: restrictedKey, sourceKind: 'RUNBOOK', visibility: 'ROLE', sensitivity: 'RESTRICTED', grants: [{ principalType: 'ROLE', principalId: 'logistics_manager' }],
    content: '\u51b7\u7ad9\u84dd\u864e\u673a\u7ec4\u51fa\u73b0\u4e03\u70b9\u516b\u6beb\u7c73\u6bcf\u79d2\u632f\u52a8\u65f6\uff0c\u540e\u52e4\u8d1f\u8d23\u4eba\u5fc5\u987b\u5728\u5341\u4e94\u5206\u949f\u5185\u9694\u79bb\u4e8c\u53f7\u51b7\u5374\u6cf5\uff0c\u5e76\u901a\u77e5\u8bbe\u5907\u5de5\u7a0b\u5e08\u6267\u884c\u8f74\u627f\u590d\u6838\u3002\u8be5\u5904\u7f6e\u624b\u518c\u4ec5\u9650\u540e\u52e4\u8d1f\u8d23\u4eba\u4f7f\u7528\uff0c\u4e0d\u5f97\u5411\u65e0\u5173\u89d2\u8272\u5f00\u653e\u3002',
  }) })
  expect(result.response.status === 201, 'restricted runbook ingestion failed')
  const restrictedDocumentId = result.json.data.id

  result = await request('/api/ai/knowledge/search', student, { method: 'POST', body: JSON.stringify({ question: '\u7533\u8bf7\u5927\u578b\u6d3b\u52a8\u573a\u5730\u9700\u8981\u63d0\u524d\u591a\u4e45\u5e76\u63d0\u4ea4\u54ea\u4e9b\u6750\u6599\uff1f' }) })
  expect(result.response.status === 200 && result.json?.data?.citations?.length >= 1, 'student hybrid retrieval returned no citation')
  retrievalIds.push(result.json.data.retrieval.id)
  expect(result.json.data.citations.some((item) => item.documentId === tenantDocumentId), 'tenant policy was not retrieved')
  expect(result.json.data.answer.includes('[K1]'), 'RAG answer omitted inline citation labels')
  expect(result.json.data.retrieval.model?.provider === 'deepseek' && result.json.data.retrieval.model?.purpose === 'knowledge.answer', 'governed DeepSeek answer evidence is missing')
  expect(result.json.data.citations.every((item) => item.documentId !== restrictedDocumentId), 'student received a restricted citation')
  expect(result.json.data.citations.every((item) => item.score >= 0 && item.score <= 1 && item.vectorScore >= 0 && item.vectorScore <= 1), 'retrieval scores are outside governed range')

  result = await request('/api/ai/knowledge?scope=documents', student)
  expect(result.response.status === 200 && !result.json.data.some((item) => item.id === restrictedDocumentId), 'restricted document leaked into student list')
  result = await request('/api/ai/knowledge/search', student, { method: 'POST', body: JSON.stringify({ question: '\u51b7\u7ad9\u84dd\u864e\u673a\u7ec4\u4e03\u70b9\u516b\u6beb\u7c73\u6bcf\u79d2\u632f\u52a8\u5e94\u8be5\u9694\u79bb\u54ea\u53f0\u8bbe\u5907\uff1f' }) })
  expect(result.response.status === 200, 'student restricted retrieval did not fail safely')
  expect(result.json?.data?.status === 'REFUSED' && result.json?.data?.citations?.length === 0, 'unauthorized evidence did not produce a strict refusal')
  retrievalIds.push(result.json.data.retrieval.id)
  expect(result.json.data.citations.every((item) => item.documentId !== restrictedDocumentId), 'restricted runbook leaked through retrieval')

  result = await request('/api/ai/knowledge?scope=documents', logistics)
  expect(result.response.status === 200 && result.json.data.some((item) => item.id === restrictedDocumentId), 'authorized logistics role cannot see runbook')
  result = await request('/api/ai/knowledge/search', logistics, { method: 'POST', body: JSON.stringify({ question: '\u51b7\u7ad9\u84dd\u864e\u673a\u7ec4\u4e03\u70b9\u516b\u6beb\u7c73\u6bcf\u79d2\u632f\u52a8\u5e94\u8be5\u9694\u79bb\u54ea\u53f0\u8bbe\u5907\uff1f' }) })
  expect(result.response.status === 200 && result.json.data.citations.some((item) => item.documentId === restrictedDocumentId), 'authorized role did not retrieve restricted runbook')
  expect(result.json.data.answer.includes('[K1]') && result.json.data.retrieval.model?.purpose === 'knowledge.answer', 'authorized RAG answer is not citation/model backed')
  retrievalIds.push(result.json.data.retrieval.id)
  const audit = await pool.query("SELECT count(*)::int AS count,count(*) FILTER (WHERE status='ANSWERED' AND answer_hash IS NOT NULL)::int AS answered,count(*) FILTER (WHERE status='REFUSED' AND refusal_code IS NOT NULL)::int AS refused FROM ai_knowledge_retrievals WHERE id=ANY($1::uuid[]) AND query_hash IS NOT NULL", [retrievalIds])
  expect(Number(audit.rows[0].count) === retrievalIds.length, 'retrieval hash audit is incomplete')
  expect(Number(audit.rows[0].answered) === 2 && Number(audit.rows[0].refused) === 1, 'retrieval terminal audit statuses are incomplete')
  console.log(`PASS AI-5 hybrid retrieval: tenantCitation=1 restrictedDenied=1 roleAllowed=1 retrievalAudit=${retrievalIds.length} assertions=${assertions}`)
} finally {
  if (retrievalIds.length) await pool.query('DELETE FROM ai_knowledge_retrievals WHERE id=ANY($1::uuid[])', [retrievalIds])
  await pool.query('DELETE FROM ai_knowledge_documents WHERE external_key=ANY($1::text[])', [[tenantKey, restrictedKey]])
  await pool.end()
}
