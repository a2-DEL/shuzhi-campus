import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_EVOLUTION_TEST_BASE_URL || 'http://localhost:3100'
const canonicalExperimentId = '75000000-0000-4000-8000-000000000001'
let assertions = 0
const expect = (value, message) => { assert.ok(value, message); assertions += 1 }
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(170000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  assert.equal(result.response.status, 200)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let experimentId = null
let releaseId = null
try {
  let result = await request('/api/ai/evolution')
  expect(result.response.status === 401, 'anonymous evolution access must be denied')
  const student = await login('student')
  result = await request('/api/ai/evolution', student)
  expect(result.response.status === 403, 'non-operator evolution access must be denied')
  const operator = await login('ai_ops')
  result = await request('/api/ai/evolution', operator)
  expect(result.response.status === 200 && result.json.data.operator === true, 'operator evolution overview unavailable')
  expect(result.json.data.metrics.benchmarkCases === 6 && result.json.data.datasets[0].caseCount === 6, 'canonical benchmark dataset is incomplete')
  expect(result.json.data.production.governedRelease === true && result.json.data.production.version === 'hybrid-rank-v2.1', 'canonical governed release is not active')
  expect(result.json.data.guardrails.length === 5, 'governance guardrails are incomplete')
  result = await request('/api/ai/evolution', operator, { method: 'POST', body: JSON.stringify({ action: 'collect' }) })
  expect(result.response.status === 200 && result.json.data.scanned >= 0, 'runtime signal collection failed')
  const candidateVersion = `contract-${Date.now()}`
  result = await request('/api/ai/evolution', operator, { method: 'POST', body: JSON.stringify({ action: 'create', datasetId: '74000000-0000-4000-8000-000000000001', hypothesis: 'Contract evaluation must preserve all retrieval quality and safety gates.', changeSummary: 'Use the current balanced ranking as a controlled release contract candidate.', candidateVersion, candidateWeights: { lexical: 0.40, vector: 0.40, graph: 0.15, authority: 0.05 } }) })
  expect(result.response.status === 201 && result.json.data.status === 'DRAFT', 'candidate experiment was not created as draft')
  experimentId = result.json.data.id
  const beforeApproval = await pool.query(`SELECT count(*)::int count FROM ai_evolution_releases WHERE experiment_id=$1::uuid`, [experimentId])
  expect(beforeApproval.rows[0].count === 0, 'candidate auto-published before evaluation and human approval')
  result = await request('/api/ai/evolution', operator, { method: 'POST', body: JSON.stringify({ action: 'evaluate', experimentId }) })
  expect(result.response.status === 200 && result.json.data.status === 'PASSED', 'actual retrieval benchmark did not pass')
  expect(result.json.data.caseCount === 6 && result.json.data.passedCases === 6 && result.json.data.safetyScore === 1, 'benchmark quality or safety gate failed')
  expect(result.json.data.evidenceHash?.length === 64, 'evaluation evidence hash missing')
  const stillNoRelease = await pool.query(`SELECT count(*)::int count FROM ai_evolution_releases WHERE experiment_id=$1::uuid`, [experimentId])
  expect(stillNoRelease.rows[0].count === 0, 'passed evaluation bypassed the human release gate')
  result = await request('/api/ai/evolution', operator, { method: 'POST', body: JSON.stringify({ action: 'approve', experimentId, releaseNotes: 'Contract operator reviewed six cases, safety evidence and ranking quality before release.' }) })
  expect(result.response.status === 200 && result.json.data.status === 'ACTIVE' && result.json.data.version === candidateVersion, 'human-approved release was not activated')
  releaseId = result.json.data.id
  result = await request('/api/ai/knowledge/vector', operator)
  expect(result.response.status === 200 && result.json.data.rankingVersion === candidateVersion && result.json.data.governedRelease === true, 'active release is not wired into production retrieval diagnostics')
  result = await request('/api/ai/knowledge/vector', operator, { method: 'POST', body: JSON.stringify({ query: '一级报修故障十五分钟响应，五分钟无人接单跨区域改派' }) })
  expect(result.response.status === 200 && result.json.data.results.some((item) => item.documentTitle.includes('校园报修')), 'production retrieval did not execute with the approved ranking')
  const proof = await pool.query(`SELECT (SELECT count(*)::int FROM ai_knowledge_retrievals WHERE metadata->'evaluation'->>'experimentId'=$1) eval_retrievals,(SELECT count(*)::int FROM ai_evolution_eval_runs WHERE experiment_id=$1::uuid AND status='PASSED' AND length(evidence_hash)=64) passed_runs,(SELECT count(*)::int FROM ai_knowledge_audit_events WHERE target_type='EVOLUTION' AND metadata->>'experimentId'=$1 AND action='EVOLUTION_RELEASE_ACTIVATED') activation_audits`, [experimentId])
  expect(proof.rows[0].eval_retrievals === 12 && proof.rows[0].passed_runs === 1, 'actual baseline/candidate retrieval evidence is incomplete')
  expect(proof.rows[0].activation_audits === 1, 'human release audit is missing')
  result = await request('/api/ai/evolution', operator, { method: 'POST', body: JSON.stringify({ action: 'rollback', releaseId, reason: 'Contract test verifies immediate safe baseline rollback.' }) })
  expect(result.response.status === 200 && result.json.data.status === 'ROLLED_BACK', 'governed rollback failed')
  result = await request('/api/ai/knowledge/vector', operator)
  expect(result.response.status === 200 && result.json.data.rankingVersion === 'baseline-v1' && result.json.data.governedRelease === false, 'rollback did not restore the built-in safe baseline')
  const page = await fetch(`${base}/ai-agents/learning`, { headers: { cookie: operator }, signal: AbortSignal.timeout(90000) })
  const html = await page.text()
  const chunkPath = html.match(/src=\"([^\"]*src_app_ai-agents_learning_page[^\"]*\.js)\"/)?.[1]
  const pageManifest = chunkPath ? await (await fetch(`${base}${chunkPath}`, { signal: AbortSignal.timeout(90000) })).text() : ''
  const relatedChunks = [...pageManifest.matchAll(/\"(static\/chunks\/[^\"]+\.js)\"/g)].map((match) => match[1])
  const pageChunk = (await Promise.all(relatedChunks.map(async (path) => (await (await fetch(`${base}/_next/${path}`, { signal: AbortSignal.timeout(90000) })).text())))).join('\n')
  expect(page.status === 200 && pageChunk.includes('evolution-workbench') && !html.includes('&quot;candidate_config&quot;'), 'self-evolution workbench page is unavailable or exposes code')
  console.log(`PASS governed self-evolution API: cases=6 eval=real safety=100% humanGate=true rollback=baseline assertions=${assertions}`)
} finally {
  if (experimentId) {
    await pool.query('BEGIN')
    try {
      await pool.query(`DELETE FROM ai_knowledge_audit_events WHERE target_type='EVOLUTION' AND metadata->>'experimentId'=$1`, [experimentId])
      await pool.query(`DELETE FROM ai_knowledge_retrievals WHERE metadata->'evaluation'->>'experimentId'=$1`, [experimentId])
      await pool.query(`DELETE FROM ai_evolution_releases WHERE experiment_id=$1::uuid`, [experimentId])
      await pool.query(`DELETE FROM ai_evolution_eval_runs WHERE experiment_id=$1::uuid`, [experimentId])
      await pool.query(`DELETE FROM ai_evolution_experiments WHERE id=$1::uuid`, [experimentId])
      await pool.query(`UPDATE ai_evolution_releases SET status='ACTIVE',rolled_back_by=NULL,rolled_back_at=NULL WHERE experiment_id=$1::uuid`, [canonicalExperimentId])
      await pool.query(`UPDATE ai_evolution_experiments SET status='APPROVED' WHERE id=$1::uuid`, [canonicalExperimentId])
      await pool.query('COMMIT')
    } catch (error) { await pool.query('ROLLBACK'); throw error }
  }
  await pool.end()
}
