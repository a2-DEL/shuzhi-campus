import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
let count = 0
async function main() {
  let id
  let cookie
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'student', password: '123456' }) })
    assert.equal(login.status, 200); count += 1
    cookie = login.headers.get('set-cookie')?.split(';')[0]
    const created = await fetch(`${base}/api/ai/conversations`, { method: 'POST', headers: { cookie } })
    id = (await created.json()).data.id
    assert.equal(created.status, 201); count += 1
    for (let turn = 1; turn <= 30; turn += 1) {
      const reply = await fetch(`${base}/api/ai/assistant`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: turn === 1 ? '查询待处理报修工单' : '您好', conversationId: id, mode: 'ask' }) })
      assert.equal(reply.status, 200, `turn ${turn} failed`); count += 1
    }
    const stored = await pool.query('SELECT count(*)::int AS n FROM baize_messages WHERE conversation_id=$1::uuid', [id])
    assert.equal(stored.rows[0].n, 60); count += 1
    const conversation = await pool.query('SELECT summary FROM baize_conversations WHERE id=$1::uuid', [id])
    assert.ok(conversation.rows[0].summary?.length <= 100 && conversation.rows[0].summary.includes('60条')); count += 1
    const loaded = await fetch(`${base}/api/ai/conversations/${id}`, { headers: { cookie } })
    const history = await loaded.json()
    assert.equal(history.data.messages.length, 60); count += 1
    assert.equal(history.data.messages[0].content, '查询待处理报修工单'); count += 1
    console.log(`PASS 30-turn persistent dialogue and bounded summary: assertions=${count}`)
  } finally {
    if (id && cookie) await fetch(`${base}/api/ai/conversations/${id}`, { method: 'DELETE', headers: { cookie } }).catch(() => undefined)
    await pool.end()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
