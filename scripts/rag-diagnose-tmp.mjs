import './assert-isolated-test-environment.mjs'
const base = 'http://localhost:3100'
async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(60000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}
const login = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: 'admin', password: '123456' }) })
const admin = login.response.headers.get('set-cookie')?.split(';')[0] || ''

// 先搜索已有知识库
const r = await request('/api/ai/knowledge/search', admin, {
  method: 'POST',
  body: JSON.stringify({ question: '申请大型活动场地需要提前多久并提交哪些材料？' }),
})
console.log('search status:', r.response.status)
const d = r.json?.data
console.log('citations:', d?.citations?.length)
console.log('answer preview:', (d?.answer || '').slice(0, 200))
console.log('retrieval.model:', JSON.stringify(d?.retrieval?.model))
console.log('retrieval.status:', d?.retrieval?.status, '| backend:', d?.retrieval?.vectorBackend ?? d?.retrieval?.vector_backend)
