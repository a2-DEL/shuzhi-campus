import './assert-isolated-test-environment.mjs'
import { readFile } from 'node:fs/promises'

const baseUrl = process.env.ENTERPRISE_UI_TEST_BASE_URL || 'http://localhost:3100'
async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  })
  const type = response.headers.get('content-type') || ''
  let payload = null
  if (type.includes('application/json')) { try { payload = await response.json() } catch {} }
  else { try { payload = await response.text() } catch {} }
  return { response, payload }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  if (result.response.status !== 200) throw new Error(`${userId} login failed: ${result.response.status}`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}
let assertions = 0
function expect(value, message) { if (!value) throw new Error(message); assertions += 1 }

let result = await request('/api/ai/overview', null)
expect(result.response.status === 401, 'anonymous enterprise overview access must be denied')
const admin = await login('admin')

result = await request('/api/ai/overview', admin)
expect(result.response.status === 200 && result.payload?.success, `enterprise overview failed: ${result.payload?.error || result.response.status}`)
expect(result.payload.data.dataset?.kind === 'simulated' && result.payload.data.dataset?.executionMode === 'real_governed_runtime', 'dataset provenance or execution mode is missing')
expect(result.payload.data.domains?.length >= 9, 'enterprise business radar is incomplete')
expect(result.payload.data.governance?.verifiedEffects >= 5, 'verified business outcomes are missing')
expect(result.payload.data.governance?.audits > 0 && result.payload.data.governance?.outbox > 0, 'governance proof is incomplete')

for (const [domain, minimum] of [['repair', 18], ['classroom', 10], ['notification', 10], ['lost_found', 12], ['hygiene', 7], ['dorm_safety', 8], ['visitor', 12], ['energy', 60], ['material', 12], ['duty', 14]]) {
  result = await request(`/api/ai/business-records?domain=${domain}&pageSize=100`, admin)
  expect(result.response.status === 200 && result.payload?.data?.pagination?.total >= minimum, `${domain} real read model is incomplete`)
}

result = await request('/api/ai/scenarios', admin)
expect(result.response.status === 200 && result.payload?.data?.scenarios?.length === 4, 'scenario catalog is incomplete')
expect(result.payload.data.scenarios.some((item) => item.key === 'forum_assurance' && item.steps === 3 && item.availableToCurrentRole), 'flagship three-Agent scenario is unavailable')
expect(result.payload.data.scenarios.some((item) => item.key === 'repair_sla' && item.availableRecords > 0), 'repair SLA scenario has no real target')

result = await request('/api/ai/scenarios', admin, { method: 'POST', body: JSON.stringify({ scenario: 'repair_sla' }) })
expect(result.response.status === 201 && result.payload?.data?.state === 'AWAITING_APPROVAL', `scenario preview failed: ${result.payload?.error || result.response.status}`)
const task = result.payload.data
expect(task.nodes?.length === 3 && task.nodes.every((node) => node.preview?.ready), 'scenario did not prepare three real business previews')
expect(task.plan?.executionMode === 'fan_out', 'scenario was not planned as parallel Agent work')
result = await request(`/api/ai/tasks/${task.id}`, admin, { method: 'PUT', body: JSON.stringify({ action: 'reject', reason: 'enterprise page acceptance: safe rejection' }) })
expect(result.response.status === 200 && result.payload?.data?.state === 'CANCELLED', 'scenario safe rejection failed')
expect(result.payload.data.nodes.every((node) => !node.effect), 'rejected preview produced a business effect')

for (const page of ['/ai-agents', '/ai-agents/scenarios', '/repairs', '/materials']) {
  result = await request(page, admin)
  expect(result.response.status === 200 && typeof result.payload === 'string', `${page} page is not renderable`)
}
const businessPage = await readFile('src/components/business/business-module-page.tsx', 'utf8')
expect(!businessPage.includes('<pre') && !businessPage.includes('<code') && !businessPage.includes('font-mono'), 'business page exposes code-oriented UI')
expect(!businessPage.includes('JSON.stringify(selected, null'), 'business details expose raw structured records')
const menu = await readFile('src/lib/menu-config.ts', 'utf8')
expect(menu.includes('/ai-agents/scenarios') && !menu.includes('/committee/dashboard'), 'professional menu did not replace the legacy data screen')
const dashboard = await readFile('src/app/dashboard/page.tsx', 'utf8')
expect(dashboard.includes("redirect('/ai-agents')") && !dashboard.toLowerCase().includes('mock'), 'legacy mock dashboard remains active')

console.log(`PASS enterprise pages: domains=10 scenarios=4 previewNodes=3 safeReject=1 pages=4 assertions=${assertions}`)
