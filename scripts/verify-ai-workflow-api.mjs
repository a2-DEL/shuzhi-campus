import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: '.env.local', quiet: true })
const base = process.env.AI_WORKFLOW_TEST_BASE_URL || 'http://localhost:3100'
const slug = `workflow-contract-${Date.now()}`
let assertions = 0
const expect = (value, message) => { assert.ok(value, message); assertions += 1 }
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(90_000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  assert.equal(result.response.status, 200, `${userId} login failed`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
const definition = {
  nodes: [
    { id: 'trigger', kind: 'trigger', label: 'SLA risk trigger', position: { x: 0, y: 120 } },
    { id: 'dispatch', kind: 'agent', label: 'Governed repair dispatch', skillId: 'repair_dispatch', agentLabel: 'Logistics spirit', params: { count: 1, reason: 'Workflow contract verification' }, position: { x: 300, y: 40 } },
    { id: 'aggregate', kind: 'aggregate', label: 'Baize verified aggregation', position: { x: 600, y: 120 } },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger', target: 'dispatch', label: 'dispatch' },
    { id: 'edge-2', source: 'dispatch', target: 'aggregate', label: 'readback' },
  ],
}
let result = await request('/api/ai/workflows')
expect(result.response.status === 401, 'anonymous workflow access must be denied')
const student = await login('student')
result = await request('/api/ai/workflows', student)
expect(result.response.status === 200 && result.json?.data?.manager === false, 'student cannot read published workflows')
expect(result.json.data.workflows.every((item) => item.status === 'PUBLISHED'), 'student can see non-published workflows')
result = await request('/api/ai/workflows', student, { method: 'POST', body: JSON.stringify({ action: 'create', name: 'forbidden', definition }) })
expect(result.response.status === 403, 'student can create workflow definitions')
const operator = await login('ai_ops')
result = await request('/api/ai/workflows', operator, { method: 'POST', body: JSON.stringify({ action: 'create', slug, name: 'Workflow contract test', description: 'Disposable governed workflow', definition }) })
expect(result.response.status === 201 && result.json?.data?.status === 'DRAFT', 'AI operator cannot persist a workflow draft')
const workflowId = result.json.data.id
expect(result.json.data.version?.versionNo === 1 && result.json.data.version?.definition?.nodes?.length === 3, 'workflow version definition is incomplete')
result = await request('/api/ai/workflows', operator, { method: 'PATCH', body: JSON.stringify({ action: 'publish', workflowId }) })
expect(result.response.status === 200 && result.json?.data?.status === 'PUBLISHED' && result.json?.data?.version?.status === 'PUBLISHED', 'workflow publish did not freeze the current version')
const admin = await login('admin')
result = await request('/api/ai/workflows', admin, { method: 'POST', body: JSON.stringify({ action: 'run', workflowId, command: 'Execute the governed repair workflow contract' }) })
expect(result.response.status === 200, `published workflow run failed: ${result.json?.error || result.response.status}`)
expect(result.json.data.run.status === 'AWAITING_APPROVAL', 'high-risk workflow bypassed human approval')
expect(Boolean(result.json.data.run.taskId), 'workflow run did not link a governed task')
expect(result.json.data.run.events.length >= 4, 'workflow handoff events were not persisted')
expect(result.json.data.task.nodes.length === 1 && result.json.data.task.state === 'AWAITING_APPROVAL', 'governed Agent task was not materialized')
const taskId = result.json.data.run.taskId
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const proof = await pool.query(`SELECT r.status,r.input_hash,r.task_id,count(e.id)::int events FROM ai_workflow_runs r JOIN ai_workflow_run_events e ON e.run_id=r.id WHERE r.workflow_id=$1::uuid GROUP BY r.id`, [workflowId])
expect(proof.rows.length === 1 && proof.rows[0].status === 'AWAITING_APPROVAL', 'database run ledger is incomplete')
expect(String(proof.rows[0].input_hash).length === 64 && Number(proof.rows[0].events) >= 4, 'run hash/event lineage is incomplete')
await pool.query('DELETE FROM ai_workflows WHERE id=$1::uuid', [workflowId])
await pool.query('DELETE FROM ai_task_runs WHERE id=$1::uuid', [taskId])
await pool.end()
console.log(`PASS visual workflow API: draft=1 publish=1 governedTask=1 approvalGate=1 events=${proof.rows[0].events} assertions=${assertions}`)
