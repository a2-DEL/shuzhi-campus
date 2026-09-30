import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getDevelopmentUser } from '@/lib/development-users'
import { getPostgresPool } from '@/storage/database/postgres'
import { classifyWithGovernedModel } from '@/lib/ai/assistant/intent'

async function main(): Promise<void> {
  const user = getDevelopmentUser('admin')
  assert.ok(user?.school_id, 'QA admin missing')
  const pool = getPostgresPool()
  try {
    const policy = (await pool.query<{ route_mode: string }>('SELECT route_mode FROM ai_runtime_settings WHERE school_id=$1::uuid', [user.school_id])).rows[0]
    assert.ok(policy && policy.route_mode !== 'local_governed', 'Enable the QA tenant external model route before live validation')
    const cases = [
      { message: '您好', intent: 'greeting' },
      { message: '你是谁', intent: 'identity' },
      { message: '帮我查一下3号楼的待处理报修', intent: 'business_query', domain: 'repair', status: 'pending' },
      { message: '我要报修，水龙头坏了，在3号楼201', intent: 'business_application', domain: 'repair' },
    ] as const
    for (const item of cases) {
      const result = await classifyWithGovernedModel(user, randomUUID(), item.message, [])
      assert.equal(result?.intent, item.intent, `Live intent mismatch for ${item.message}`)
      if ('domain' in item) assert.equal(result?.domain, item.domain)
      if ('status' in item) assert.equal(result?.status, item.status)
    }
    const follow = await classifyWithGovernedModel(user, randomUUID(), '那完成的有多少？', [
      { role: 'user', content: '查询待处理报修工单' },
      { role: 'assistant', content: '当前有 3 条待处理报修' },
    ])
    assert.equal(follow?.intent, 'business_query')
    assert.equal(follow?.domain, 'repair')
    console.log(`PASS live DeepSeek intent: ${cases.length + 1} prompts, audited via governed gateway`)
  } finally { await pool.end() }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Live intent failed'); process.exitCode = 1 })
