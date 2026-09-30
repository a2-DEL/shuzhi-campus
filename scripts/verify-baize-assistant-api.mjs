import './assert-isolated-test-environment.mjs'
const baseUrl = process.env.BAIZE_TEST_BASE_URL || 'http://localhost:3100'

async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(60_000),
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

let result = await request('/api/ai/assistant', null, { method: 'POST', body: JSON.stringify({ message: '\u67e5\u8be2\u62a5\u4fee' }) })
expect(result.response.status === 401, 'anonymous Baize request must be denied')

const admin = await login('admin')
result = await request('/api/ai/assistant', admin, { method: 'POST', body: JSON.stringify({ message: '\u67e5\u8be2\u5f85\u5904\u7406\u62a5\u4fee\u5de5\u5355', mode: 'ask' }) })
expect(result.response.status === 200 && result.json?.data?.kind === 'answer', 'Postgres business question failed')
expect(result.json?.data?.sources?.[0]?.backend === 'postgres', 'business answer omitted its Postgres source')
expect(typeof result.json?.data?.answer?.total === 'number', 'business answer omitted aggregate data')

result = await request('/api/ai/assistant', admin, { method: 'POST', body: JSON.stringify({ message: '\u62a5\u4fee\u6d3e\u5355\u5e76\u901a\u77e5\u5b66\u751f' }) })
expect(result.response.status === 200 && result.json?.data?.kind === 'dispatch', 'natural-language workflow dispatch failed')
const task = result.json?.data?.task
expect(task?.state === 'AWAITING_APPROVAL', 'Baize workflow bypassed approval')
expect(task?.plan?.executionMode === 'fan_out', 'Baize workflow was not classified as fan-out')
expect(task?.nodes?.length === 2 && task.nodes.every((node) => node.preview?.ready), 'Baize workflow did not prepare two real previews')
expect(result.json?.data?.routing?.shards?.length === 3, 'Baize routing did not expose coordinator plus two member shards')
expect(task?.messages?.[0]?.content?.includes('\u4e0b\u8fbe\u6307\u4ee4'), 'persisted collaboration omitted the user command handoff')
expect(task?.messages?.some((item) => item.agentName.includes('\u767d\u6cfd')), 'coordinator was not presented as Baize')

result = await request(`/api/ai/tasks/${task.id}`, admin, { method: 'PUT', body: JSON.stringify({ action: 'confirm', reason: 'Baize integration acceptance' }) })
expect(result.response.status === 200 && result.json?.data?.state === 'COMPLETED', 'Baize fan-out workflow did not complete')
expect(result.json?.data?.nodes?.every((node) => node.state === 'COMPLETED' && node.effect?.status === 'VERIFIED'), 'Baize fan-out nodes did not verify real effects')
expect(result.json?.data?.summary?.includes('2/2'), 'Baize aggregate report omitted member completion')
expect(result.json?.data?.messages?.some((item) => item.type === 'result' && item.content.includes('\u771f\u5b9e\u62a5\u4fee\u5de5\u5355')), 'repair result was not translated into business language')
expect(result.json?.data?.messages?.some((item) => item.type === 'result' && item.content.includes('\u53ef\u8ffd\u8e2a\u89e6\u8fbe\u4efb\u52a1')), 'notification result was not translated into business language')
expect(result.json?.data?.summary?.includes('\u771f\u5b9e\u62a5\u4fee\u5de5\u5355') && result.json.data.summary.includes('\u53ef\u8ffd\u8e2a\u89e6\u8fbe\u4efb\u52a1'), 'Baize aggregate report omitted business outcomes')

result = await request(`/api/ai/governance?task_id=${task.id}`, admin)
expect(result.response.status === 200 && result.json?.data?.persistent === true, 'Baize governance evidence is not persistent')
expect(result.json?.data?.auditEvents?.length > 0 && result.json?.data?.outboxEvents?.length > 0, 'Baize governance evidence is incomplete')

const student = await login('student')
result = await request('/api/ai/assistant', student, { method: 'POST', body: JSON.stringify({
  message: '\u8bf7\u53d1\u5e03\u901a\u77e5', mode: 'dispatch', skillId: 'notification_publish',
  params: { title: 'Denied', content: 'Denied', type: 'SYSTEM', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'] },
}) })
expect(result.response.status === 403 && result.json?.code === 'PERMISSION_DENIED', 'student dispatch was not denied')

result = await request('/api/ai/assistant', admin, { method: 'POST', body: JSON.stringify({ message: '\u8bf7\u5206\u6790\u5c1a\u672a\u63a5\u5165\u7684\u8de8\u90e8\u95e8\u4e8b\u9879' }) })
expect(result.response.status === 200 && result.json?.data?.kind === 'clarify', 'unsupported intent did not fail closed with clarification')

console.log(`PASS Baize assistant: postgresAnswer=1 naturalFanOut=2/2 persistentGovernance=1 studentDenied=1 assertions=${assertions}`)
