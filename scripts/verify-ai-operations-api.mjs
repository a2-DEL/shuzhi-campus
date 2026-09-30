import './assert-isolated-test-environment.mjs'
const baseUrl = process.env.AI_OPERATIONS_TEST_BASE_URL || 'http://localhost:3100'

async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}

async function login(userId) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId, password: '123456' }) })
  if (result.response.status !== 200) throw new Error(`${userId} login failed: ${result.response.status}`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}

let assertions = 0
function expect(value, message) {
  if (!value) throw new Error(message)
  assertions += 1
}

let result = await request('/api/ai/operations')
expect(result.response.status === 401, 'anonymous operations access must be denied')

const student = await login('student')
result = await request('/api/ai/operations', student)
expect(result.response.status === 403, 'student operations access must be denied')
result = await request('/api/ai/runtime/recover', student, { method: 'POST', body: JSON.stringify({ limit: 1 }) })
expect(result.response.status === 403, 'student recovery access must be denied')

const operator = await login('ai_ops')
result = await request('/api/auth/me', operator)
expect(result.response.status === 200 && result.json?.data?.role === 'ai_ops_admin', 'AI operations identity is unavailable')

result = await request('/api/ai/operations', operator)
expect(result.response.status === 200 && result.json?.data?.persistence === 'postgres', 'operations overview is not using PostgreSQL')
expect(result.json?.data?.catalog?.teams === 14 && result.json?.data?.catalog?.skills >= 9, 'operations catalog metrics are incomplete')
expect(Array.isArray(result.json?.data?.providers) && result.json.data.providers.every((item) => !('secret' in item) && !('key' in item)), 'provider readiness exposed secrets')

result = await request('/api/ai/operations', operator, {
  method: 'PUT',
  body: JSON.stringify({ routeMode: 'local_governed', maxModelCalls: 32, dailyBudgetCents: 5000 }),
})
expect(result.response.status === 200 && result.json?.data?.maxModelCalls === 32, 'runtime settings were not persisted')
result = await request('/api/ai/operations', operator)
expect(result.response.status === 200 && result.json?.data?.settings?.dailyBudgetCents === 5000, 'runtime settings did not read back')

result = await request('/api/ai/operations', operator, { method: 'POST', body: JSON.stringify({ action: 'diagnose' }) })
expect(result.response.status === 200 && result.json?.data?.checks?.length >= 4, 'operations diagnostics did not run')
expect(result.json.data.checks.some((item) => item.id === 'database' && item.status === 'healthy'), 'database diagnostic is not healthy')

result = await request('/api/ai/runtime/recover', operator, { method: 'POST', body: JSON.stringify({ limit: 1, resume: false }) })
expect(result.response.status === 200, 'AI operations administrator cannot run recovery')

const admin = await login('admin')
result = await request('/api/ai/assistant', admin, { method: 'POST', body: JSON.stringify({ message: '报修派单并通知学生' }) })
expect(result.response.status === 200 && result.json?.data?.task?.state === 'AWAITING_APPROVAL', `governed cross-owner task was not created: ${result.response.status}`)
const taskId = result.json.data.task.id

result = await request('/api/ai/tasks?page_size=100', operator)
expect(result.response.status === 200 && result.json?.data?.data?.some((task) => task.id === taskId), 'operator cannot observe tenant tasks')
result = await request(`/api/ai/tasks/${taskId}`, operator, { method: 'PUT', body: JSON.stringify({ action: 'confirm', reason: 'AI 运维联调验收' }) })
expect(result.response.status === 200 && result.json?.data?.state === 'COMPLETED', 'operator could not approve and complete governed task')
expect(result.json?.data?.nodes?.every((node) => node.effect?.status === 'VERIFIED'), 'operator-supervised task omitted verified effects')

result = await request('/api/ai/feedback', operator, {
  method: 'POST',
  body: JSON.stringify({ taskId, rating: 5, outcome: 'helpful', comment: '分灵体交接清晰，真实业务回读完整。' }),
})
expect(result.response.status === 201 && result.json?.data?.status === 'new', 'feedback sample was not persisted')
const feedbackId = result.json.data.id
result = await request('/api/ai/feedback', operator)
expect(result.response.status === 200 && result.json?.data?.persistent === true && result.json?.data?.records?.some((item) => item.id === feedbackId), 'feedback report omitted the persisted sample')
result = await request('/api/ai/feedback', operator, { method: 'PATCH', body: JSON.stringify({ feedbackId, status: 'reviewed' }) })
expect(result.response.status === 200 && result.json?.data?.status === 'reviewed', 'operator could not review feedback')

console.log(`PASS AI operations API: role=1 settings=1 diagnostics=1 crossOwner=1 feedback=1 assertions=${assertions}`)
