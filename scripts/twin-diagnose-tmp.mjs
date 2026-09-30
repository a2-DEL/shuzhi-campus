import './assert-isolated-test-environment.mjs'
const base = 'http://localhost:3100'
async function request(route, cookie, options = {}) {
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(120000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}
const login = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
const admin = login.response.headers.get('set-cookie')?.split(';')[0] || ''

let r = await request('/api/ai/twin', admin)
console.log('GET twin:', r.response.status)
if (r.response.status === 200) {
  console.log('  snapshot quality:', r.json.data.snapshot?.dataQualityScore)
  console.log('  metrics:', JSON.stringify(r.json.data.snapshot?.metrics))
  console.log('  topology:', r.json.data.snapshot?.topology?.length)
}

r = await request('/api/ai/twin', admin, { method: 'POST', body: JSON.stringify({ action: 'capture' }) })
console.log('POST capture:', r.response.status)
const snapshotId = r.json?.data?.id
const baselineRisk = r.json?.data?.metrics?.campusRiskScore
console.log('  snapshotId:', snapshotId, 'baselineRisk:', baselineRisk)

r = await request('/api/ai/twin', admin, {
  method: 'POST',
  body: JSON.stringify({
    action: 'simulate',
    name: 'Diagnostic campus simulation',
    hypothesis: 'Governed interventions should reduce operational risk.',
    snapshotId,
    interventions: { repairCapacityDelta: 5, energyReductionPct: 15, notificationEscalation: true, visitorDeskDelta: 3, eventAttendees: 600 },
  }),
})
console.log('POST simulate:', r.response.status)
const d = r.json?.data ?? r.json
console.log('  baseline.campusRiskScore:', d?.baseline?.campusRiskScore)
console.log('  projected.campusRiskScore:', d?.projected?.campusRiskScore)
console.log('  confidence:', d?.confidence, 'evidenceHash len:', d?.evidenceHash?.length, 'recommendations:', d?.recommendations?.length)
