import './assert-isolated-test-environment.mjs'
﻿const baseUrl = process.env.AI_TEST_BASE_URL || 'http://localhost:3100'

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

async function login(identifier) {
  const result = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ userId: identifier, password: '123456' }) })
  if (result.response.status !== 200) throw new Error(`${identifier} login failed: ${result.response.status} ${JSON.stringify(result.json)}`)
  return result.response.headers.get('set-cookie')?.split(';')[0] || ''
}

async function main() {
  let assertions = 0
  function expect(condition, message) { if (!condition) throw new Error(message); assertions += 1 }

  for (const path of ['/api/ai/agents', '/api/ai/tasks', '/api/ai/skills', '/api/ai/system', '/api/ai/governance', '/api/ai/business-records?domain=repair', '/api/energy']) {
    const result = await request(path)
    expect(result.response.status === 401, `anonymous ${path} must be denied`)
  }
  let result = await request('/api/ai/tasks/execute', null, { method: 'POST', body: JSON.stringify({ command: 'query repairs' }) })
  expect(result.response.status === 401, 'anonymous execution must be denied')
  result = await request('/api/ai/runtime/recover', null, { method: 'POST', body: JSON.stringify({}) })
  expect(result.response.status === 401, 'anonymous recovery must be denied')

  const adminCookie = await login('admin')
  result = await request('/api/ai/agents', adminCookie)
  expect(result.response.status === 200 && result.json?.data?.totalRoles === 14, 'agent catalog must expose 14 governed role teams')
  expect(!JSON.stringify(result.json).includes('systemPrompt'), 'agent catalog exposed a system prompt')

  result = await request('/api/ai/system', adminCookie)
  expect(result.response.status === 200 && result.json?.data?.failClosed === true, 'system readiness is missing fail-closed state')
  const readiness = result.json.data
  if (readiness.databaseConfigured) {
    expect(readiness.executionReady === true && ['postgres', 'supabase'].includes(readiness.businessPort), 'configured database did not pass readiness checks')
    expect(readiness.migrationsRequired?.includes('0005_ai_operations_feedback.sql'), 'current AI operations migration is missing from readiness')
  } else {
    expect(readiness.executionReady === false && readiness.businessPort === 'unconfigured', 'unconfigured system must report execution not ready')
  }

  result = await request('/api/ai/skills', adminCookie)
  expect(result.response.status === 200 && result.json?.data?.skills?.length === 9, 'immutable Skill registry must expose nine governed business loops')
  expect(result.json.data.skills.every((skill) => skill.immutable && skill.published && !('executor' in skill)), 'Skill registry exposed mutable/arbitrary executor fields')
  result = await request('/api/ai/skills', adminCookie, { method: 'POST', body: JSON.stringify({ name: 'arbitrary SQL', executor: 'sql' }) })
  expect(result.response.status === 405 && result.json?.code === 'IMMUTABLE_SKILL_REGISTRY', 'Skill registry must reject runtime creation')

  const configured = readiness.executionReady === true
  const skillId = configured ? 'notification_publish' : 'repair_dispatch'
  const skillKey = configured ? 'notification.publish.commit.v1' : 'repair.dispatch.commit.v1'
  const params = configured
    ? { title: `API 验收通知 ${Date.now()}`, content: '真实数据库 API Preview 验收，不执行发布。', type: 'SYSTEM', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false }
    : { count: 1 }
  const idempotencyKey = `ai-product-api-${Date.now()}`
  const governedRequest = {
    method: 'POST', headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ command: 'Governed product API acceptance', skill_id: skillId, params }),
  }
  result = await request('/api/ai/tasks/execute', adminCookie, governedRequest)
  expect(result.response.status === 200 && result.json?.success === true, 'governed task planning failed')
  const task = result.json.data
  expect(task.state === 'AWAITING_APPROVAL' && task.status === 'awaiting_approval', 'product task state mapping is wrong')
  expect(task.approval?.status === 'PENDING' && task.approval?.requiredCount === 1, 'approval product model is incomplete')
  expect(task.nodes?.length === 1 && task.nodes[0].skillKey === skillKey, 'atomic Gateway node is missing')
  if (configured) {
    expect(task.nodes[0].preview?.ready === true && task.nodes[0].preview?.snapshotHash, 'configured backend did not return a real Preview')
  } else {
    expect(task.nodes[0].preview === undefined, 'unconfigured backend fabricated a Preview')
    expect(task.messages.some((message) => message.data?.code === 'BUSINESS_BACKEND_UNAVAILABLE'), 'backend readiness warning is missing')
  }
  expect(!('task_id' in task) && !('chat_messages' in task) && !('steps' in task), 'legacy task fields remain exposed')

  result = await request('/api/ai/tasks/execute', adminCookie, governedRequest)
  expect(result.response.status === 200 && result.json?.data?.id === task.id, 'idempotent retry created a second task')
  expect(result.json.data.version === task.version, 'idempotent retry changed task version')

  result = await request(`/api/ai/tasks/${task.id}`, adminCookie)
  expect(result.response.status === 200 && result.json?.data?.state === 'AWAITING_APPROVAL', 'task detail failed')
  result = await request(`/api/ai/task-steps?task_id=${task.id}`, adminCookie)
  expect(result.response.status === 200 && result.json?.data?.[0]?.skillKey === skillKey, 'node product view failed')
  result = await request('/api/ai/tasks', adminCookie)
  expect(result.response.status === 200 && result.json?.data?.data?.some((item) => item.id === task.id), 'task list omitted task')

  result = await request(`/api/ai/tasks/${task.id}`, adminCookie, { method: 'PUT', body: JSON.stringify({ action: 'reject', reason: 'Product API verifier' }) })
  expect(result.response.status === 200 && result.json?.data?.state === 'CANCELLED', 'correct approval endpoint did not reject task')

  result = await request(`/api/ai/governance?task_id=${task.id}`, adminCookie)
  expect(result.response.status === 200 && result.json?.data?.backend === (configured ? readiness.businessPort : 'development_memory'), 'governance backend does not match runtime readiness')
  expect(result.json?.data?.persistent === configured, 'governance persistence flag is wrong')
  expect(result.json?.data?.auditEvents?.length > 0 && result.json?.data?.outboxEvents?.length > 0, 'governance task evidence is missing')
  expect(!JSON.stringify(result.json).includes('cotReasoning'), 'governance API must not expose private reasoning chains')

  if (!configured) {
    result = await request('/api/ai/tasks/execute', adminCookie, { method: 'POST', body: JSON.stringify({ command: 'Query repair orders', skill_id: 'query_repairs' }) })
    expect(result.response.status === 200 && result.json?.data?.state === 'FAILED', 'missing backend must fail closed')
    expect(result.json?.data?.blocker?.code === 'BUSINESS_BACKEND_UNAVAILABLE', 'fail-closed blocker missing')
  }

  if (readiness.businessPort === 'postgres') {
    for (const domain of ['repair', 'notification', 'classroom', 'lost_found', 'hygiene', 'dormitory', 'visitor', 'energy']) {
      result = await request(`/api/ai/business-records?domain=${domain}`, adminCookie)
      expect(result.response.status === 200 && result.json?.data?.backend === 'postgres' && Array.isArray(result.json?.data?.data), `Postgres read model failed for ${domain}`)
    }
    result = await request('/api/energy', adminCookie)
    expect(result.response.status === 200 && result.json?.data?.backend === 'postgres', 'energy compatibility API is not using Postgres')
  }

  const studentCookie = await login('student')
  result = await request('/api/ai/tasks/execute', studentCookie, { method: 'POST', body: JSON.stringify({ command: 'Unauthorized dispatch', skill_id: 'repair_dispatch' }) })
  expect(result.response.status === 403 && result.json?.code === 'PERMISSION_DENIED', 'student dispatch was not denied')
  result = await request('/api/ai/skills?available=true', studentCookie)
  expect(result.response.status === 200 && result.json?.data?.skills?.every((skill) => skill.availableToCurrentUser), 'available Skill filter is incorrect')

  console.log(`PASS AI product API verifier: backend=${readiness.businessPort} roles=14 skills=9 assertions=${assertions}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
