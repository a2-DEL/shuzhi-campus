import './assert-isolated-test-environment.mjs'
const baseUrl = process.env.AI_LIVE_EVENTS_TEST_BASE_URL || 'http://localhost:3100'

async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(90_000),
  })
  let json = null
  if (!options.stream) {
    try { json = await response.json() } catch {}
  }
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

const operator = await login('ai_ops')
let result = await request('/api/ai/operations', operator, {
  method: 'PUT',
  body: JSON.stringify({ routeMode: 'hybrid_fail_closed', primaryProvider: 'deepseek', maxModelCalls: 24, dailyBudgetCents: 0 }),
})
expect(result.response.status === 200, 'DeepSeek tenant route could not be enabled')

const admin = await login('admin')
result = await request('/api/ai/assistant', admin, {
  method: 'POST',
  body: JSON.stringify({ message: '\u62a5\u4fee\u6d3e\u5355\u5e76\u901a\u77e5\u5b66\u751f' }),
})
expect(result.response.status === 200 && result.json?.data?.task?.state === 'AWAITING_APPROVAL', 'Live-event task did not stop for approval')
const task = result.json.data.task
expect(task.nodes.length === 2 && task.messages.some((item) => item.data?.model?.purpose === 'task.intent'), 'Task intent did not retain DeepSeek evidence')

const streamResult = await request(`/api/ai/tasks/${task.id}/events`, admin, { stream: true })
expect(streamResult.response.status === 200 && streamResult.response.headers.get('content-type')?.includes('text/event-stream'), 'Task event endpoint is not an SSE stream')
const reader = streamResult.response.body?.getReader()
expect(reader, 'Task event stream has no response body')

const approval = (async () => {
  await new Promise((resolve) => setTimeout(resolve, 700))
  return request(`/api/ai/tasks/${task.id}`, admin, {
    method: 'PUT',
    body: JSON.stringify({ action: 'confirm', reason: 'Real-time Agent event acceptance' }),
  })
})()

const decoder = new TextDecoder()
let buffer = ''
const snapshots = []
let terminal = false
const deadline = Date.now() + 80_000
while (!terminal && Date.now() < deadline) {
  const chunk = await reader.read()
  if (chunk.done) break
  buffer += decoder.decode(chunk.value, { stream: true })
  const blocks = buffer.split('\n\n')
  buffer = blocks.pop() || ''
  for (const block of blocks) {
    const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7)
    const data = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
    if (!event || !data) continue
    const payload = JSON.parse(data)
    if (event === 'task.snapshot') snapshots.push(payload)
    if (event === 'task.terminal') terminal = true
  }
}
const approvalResult = await approval
expect(approvalResult.response.status === 200 && approvalResult.json?.data?.state === 'COMPLETED', 'Approved live Agent task did not complete')
expect(terminal, 'Task event stream did not emit a terminal event')
expect(snapshots.length >= 3, `Expected at least three persisted snapshots, received ${snapshots.length}`)
const states = snapshots.map((item) => item.task?.state)
expect(states.includes('AWAITING_APPROVAL') && states.includes('COMPLETED'), `Live stream omitted lifecycle boundaries: ${states.join(',')}`)
expect(states.some((state) => ['QUEUED','RUNNING','OBSERVING','VERIFYING'].includes(state)), `Live stream omitted the active execution state: ${states.join(',')}`)
const sequences = new Set(snapshots.map((item) => item.sequence))
expect(sequences.size >= 3, 'Live stream snapshots were not backed by advancing persisted versions')
const finalTask = snapshots.at(-1)?.task
expect(finalTask?.nodes?.every((node) => node.state === 'COMPLETED' && node.effect?.status === 'VERIFIED'), 'Final live snapshot omitted verified Agent effects')
expect(finalTask?.messages?.some((item) => item.data?.model?.purpose === 'task.summary'), 'Final live snapshot omitted DeepSeek aggregation evidence')
expect(snapshots.some((item) => item.delta?.messages?.some((message) => message.type === 'handover')), 'Live deltas omitted Agent handoff messages')

console.log(`PASS live Agent event stream: task=${task.id} snapshots=${snapshots.length} versions=${sequences.size} states=${[...new Set(states)].join('>')} nodes=2 modelEvidence=2 assertions=${assertions}`)
