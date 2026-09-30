import './assert-isolated-test-environment.mjs'
const base = 'http://localhost:3100'
const pages = [
  '/login', '/', '/dashboard', '/ai-agents', '/ai-agents/runtime', '/ai-agents/scenarios',
  '/ai-agents/skills', '/ai-agents/knowledge', '/ai-agents/workflows', '/ai-agents/collaboration',
  '/ai-agents/learning', '/ai-agents/twin', '/ai-agents/ecosystem', '/ai-agents/operations',
  '/ai-agents/model-gateway', '/ai-agents/graph', '/ai-agents/audit', '/ai-agents/my-team',
  '/ai-agents/conversation', '/ai-agents/execution',
  '/users', '/permissions', '/repairs', '/duties', '/classrooms', '/dormitories',
  '/materials', '/notifications', '/settings', '/committee', '/visitors', '/energy',
  '/lost-and-found', '/repairman', '/dispatch', '/classes', '/courses', '/messages',
  '/profile', '/student', '/schedules', '/admin',
]
async function login() {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'admin', password: '123456' }),
    signal: AbortSignal.timeout(30000),
  })
  return r.headers.get('set-cookie')?.split(';')[0] || ''
}
const cookie = await login()
let pass = 0, fail = 0
const failed = []
for (const page of pages) {
  try {
    const r = await fetch(`${base}${page}`, { headers: { cookie }, signal: AbortSignal.timeout(60000), redirect: 'manual' })
    if (r.status === 200) pass++
    else { fail++; failed.push(`${page} -> ${r.status}`) }
  } catch (e) {
    fail++; failed.push(`${page} -> ERR ${e.message}`)
  }
}
console.log(`PAGE SMOKE: total=${pages.length} pass=${pass} fail=${fail}`)
if (failed.length) console.log('FAILED:\n' + failed.join('\n'))
