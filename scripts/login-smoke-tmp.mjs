import './assert-isolated-test-environment.mjs'
import assert from 'node:assert'
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
let assertions = 0
const expect = (v, m) => { assert.ok(v, m); assertions += 1 }

// 匿名访问必须拒绝
let r = await request('/api/ai/overview', null)
expect(r.response.status === 401, `anonymous overview must be 401, got ${r.response.status}`)

// admin 登录
r = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
console.log('admin login:', r.response.status, JSON.stringify(r.payload).slice(0, 200))
expect(r.response.status === 200 && r.payload?.success, `admin login failed: ${r.payload?.error || r.response.status}`)
const admin = r.response.headers.get('set-cookie')?.split(';')[0] || ''
expect(admin.length > 0, 'admin session cookie missing')

// 登录后访问 overview
r = await request('/api/ai/overview', admin)
expect(r.response.status === 200 && r.payload?.success, `overview failed: ${r.payload?.error || r.response.status}`)
expect(r.payload.data.domains?.length >= 9, 'domains incomplete')

console.log(`PASS login-smoke assertions=${assertions}`)
