import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_KNOWLEDGE_TEST_BASE_URL || 'http://localhost:3100'
const externalKey = `ai5-contract-${Date.now()}`

async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  assert.equal(result.response.status, 200, `${userId} login failed`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
let assertions = 0
function expect(value, message) { assert.ok(value, message); assertions += 1 }
const title = 'AI-5 \u77e5\u8bc6\u7248\u672c\u5951\u7ea6\u6d4b\u8bd5'
const contentV1 = '\u6821\u56ed\u5927\u578b\u6d3b\u52a8\u573a\u5730\u7533\u8bf7\u5fc5\u987b\u63d0\u524d\u4e94\u4e2a\u5de5\u4f5c\u65e5\u63d0\u4ea4\u3002\u540e\u52e4\u4e2d\u5fc3\u8d1f\u8d23\u6838\u9a8c\u573a\u5730\u6863\u671f\uff0c\u4fdd\u536b\u4e2d\u5fc3\u8d1f\u8d23\u6838\u9a8c\u4eba\u6d41\u4e0a\u9650\uff0c\u6d3b\u52a8\u8d1f\u8d23\u4eba\u987b\u540c\u6b65\u63d0\u4ea4\u5b89\u4fdd\u9884\u6848\u548c\u96e8\u5929\u5907\u7528\u65b9\u6848\u3002\u5ba1\u6279\u901a\u8fc7\u540e\uff0c\u767d\u6cfd\u624d\u4f1a\u521b\u5efa\u771f\u5b9e\u9884\u7ea6\u3002'
const contentV2 = `${contentV1} \u82e5\u573a\u5730\u5b58\u5728\u7ef4\u4fee\u51b2\u7a81\uff0c\u7cfb\u7edf\u5fc5\u987b\u7ed9\u51fa\u66ff\u4ee3\u573a\u5730\u5efa\u8bae\u5e76\u4fdd\u7559\u4eba\u5de5\u88c1\u51b3\u8bb0\u5f55\u3002`

let result = await request('/api/ai/knowledge')
expect(result.response.status === 401, 'anonymous knowledge access must be denied')
const student = await login('student')
result = await request('/api/ai/knowledge', student)
expect(result.response.status === 200 && result.json?.data?.persistence === 'postgres', 'student cannot read knowledge overview')
result = await request('/api/ai/knowledge', student, { method: 'POST', body: JSON.stringify({ title, content: contentV1, externalKey, sourceKind: 'POLICY' }) })
expect(result.response.status === 403, 'student could ingest knowledge documents')
const admin = await login('admin')
result = await request('/api/ai/knowledge', admin, { method: 'POST', body: JSON.stringify({ title, content: contentV1, externalKey, sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL' }) })
expect(result.response.status === 201 && result.json?.data?.status === 'PUBLISHED', 'admin ingestion did not publish a document')
const documentId = result.json.data.id
expect(result.json.data.currentVersion === 1 && result.json.data.chunkCount >= 1, 'first document version/chunk index is missing')
result = await request('/api/ai/knowledge?scope=documents', admin)
expect(result.response.status === 200 && result.json?.data?.some((item) => item.id === documentId), 'document list omitted the ingested document')
result = await request(`/api/ai/knowledge/${documentId}`, student)
expect(result.response.status === 200 && result.json?.data?.id === documentId, 'tenant-visible document cannot be read by student')
result = await request('/api/ai/knowledge', admin, { method: 'POST', body: JSON.stringify({ title, content: contentV2, externalKey, sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL' }) })
expect(result.response.status === 201 && result.json?.data?.currentVersion === 2, 'same external key did not create a governed new version')
result = await request(`/api/ai/knowledge/${documentId}`, admin, { method: 'PATCH', body: JSON.stringify({ action: 'archive' }) })
expect(result.response.status === 200 && result.json?.data?.status === 'ARCHIVED', 'document archive did not persist')
result = await request(`/api/ai/knowledge/${documentId}`, admin, { method: 'PATCH', body: JSON.stringify({ action: 'restore' }) })
expect(result.response.status === 200 && result.json?.data?.status === 'PUBLISHED', 'document restore did not persist')
result = await request('/api/ai/knowledge/graph', admin)
expect(result.response.status === 200 && Array.isArray(result.json?.data?.nodes) && Array.isArray(result.json?.data?.edges), 'knowledge graph endpoint is not operational')

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await pool.query('DELETE FROM ai_knowledge_documents WHERE external_key=$1', [externalKey])
await pool.end()
console.log(`PASS AI-5 knowledge API: ingestion=1 versioning=1 archive=1 restore=1 tenantRead=1 graph=1 assertions=${assertions}`)
