import './assert-isolated-test-environment.mjs'
const baseUrl = process.env.AI_SCENARIO_TEST_BASE_URL || 'http://localhost:3100'
async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(30_000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}
async function login() {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
  if (result.response.status !== 200) throw new Error('admin login failed')
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
let assertions = 0
function expect(value, message) { if (!value) throw new Error(message); assertions += 1 }

const cookie = await login()
let result = await request('/api/ai/scenarios', cookie)
expect(result.response.status === 200 && result.json?.data?.scenarios?.length === 4, 'scenario catalog unavailable')
const expectedNodes = { forum_assurance: 3, repair_sla: 3, energy_guard: 1, hygiene_closure: 1 }
for (const scenario of Object.keys(expectedNodes)) {
  result = await request('/api/ai/scenarios', cookie, { method: 'POST', body: JSON.stringify({ scenario }) })
  expect(result.response.status === 201, `${scenario} preview failed: ${result.json?.error || result.response.status}`)
  const task = result.json?.data
  expect(task?.state === 'AWAITING_APPROVAL', `${scenario} bypassed human approval`)
  expect(task?.nodes?.length === expectedNodes[scenario], `${scenario} Agent node count is incorrect`)
  if (scenario === 'repair_sla') expect(task.nodes.some((node) => node.skillId === 'repair_policy_guard' && node.agent?.name?.includes('\u736c\u8c78')), 'repair SLA did not include the real Xiezhi policy guard')
  expect(task.nodes.every((node) => node.preview?.ready && !node.effect), `${scenario} did not create real pre-write previews`)
  result = await request(`/api/ai/tasks/${task.id}`, cookie, { method: 'PUT', body: JSON.stringify({ action: 'reject', reason: 'scenario acceptance: verify safe no-write rejection' }) })
  expect(result.response.status === 200 && result.json?.data?.state === 'CANCELLED', `${scenario} safe rejection failed`)
  expect(result.json.data.nodes.every((node) => !node.effect), `${scenario} rejection produced a business effect`)
}
console.log(`PASS AI scenarios: catalog=4 forum=3 repair=3 energy=1 hygiene=1 safeReject=4 assertions=${assertions}`)
