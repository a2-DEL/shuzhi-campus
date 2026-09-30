import './assert-isolated-test-environment.mjs'
const res = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-c4661c5ed3b04ea0a9bc914ad1077310' },
  body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }], max_tokens: 10 }),
  signal: AbortSignal.timeout(30000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 500))
