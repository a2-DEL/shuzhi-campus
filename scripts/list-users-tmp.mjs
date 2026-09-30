import './assert-isolated-test-environment.mjs'
const base = 'http://localhost:5000'
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(30_000),
  })
  let payload = null
  try { payload = await response.json() } catch {}
  return { response, payload }
}
const login = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
const admin = login.response.headers.get('set-cookie')?.split(';')[0] || ''
const r = await request('/api/users?pageSize=100', admin)
console.log('status:', r.response.status)
const users = r.payload?.data?.data || []
console.log('user count:', users.length)
for (const u of users) console.log(' -', u.user_id, '|', u.name, '|', u.role, '| status:', u.status)
