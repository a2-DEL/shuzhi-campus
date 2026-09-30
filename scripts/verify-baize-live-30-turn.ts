import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { extractBaizeLocalSlots } from '../src/lib/ai/assistant/slots'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5002'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const turns = [
  '您好', '你是谁？', '请用一句话说明你如何保护校园数据。', '为什么查询记录还需要权限校验？',
  '查一下报修工单', '那待处理的有多少？', '查一下3号楼的待处理报修', '这个地点没有记录吗？',
  '查一下本地集成楼栋 101 的待处理报修', '那已完成的有多少？',
  '请解释只读查询和业务办理的区别。', '我如何查看自己提交的报修？',
  '查一下我提交的报修', '给我表格展示最近3条报修',
  '报修流程是什么？', '没有已发布制度时，你会如何回答？',
  '请说明为什么不能直接批准我提交的申请。', '审批前需要核对什么？',
  '查一下上周完成的报修', '查一下本周待处理的报修',
  '查一下不要已完成的报修', '查一下3号楼和4号楼的报修',
  '什么情况下应该联系后勤人员？', '查询信息不足时你会如何澄清？',
  '查一下宿舍的记录', '再查一下教室的记录',
  '查一下失物招领', '请简要说说你能做的校园服务。',
  '请提醒我如何核对答案来源。', '谢谢，再见！',
] as const

async function call(path: string, cookie?: string, body?: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown>; cookie?: string }> {
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90_000),
  })
  return { status: response.status, body: await response.json() as Record<string, unknown>,
    cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

async function main(): Promise<void> {
  try {
    const login = await call('/api/auth/login', undefined, { userId: 'admin', password: '123456' })
    assert.equal(login.status, 200)
    const cookie = login.cookie || ''
    const diagnosis = await call('/api/ai/operations', cookie, { action: 'diagnose' })
    assert.equal(diagnosis.status, 200)
    const check = (diagnosis.body.data as { checks: Array<{ id: string; status: string }> }).checks.find((item) => item.id === 'model-live')
    assert.equal(check?.status, 'healthy', 'real DeepSeek probe must pass before conversation')
    const system = await call('/api/ai/system', cookie)
    assert.equal((system.body.data as { modelReady: boolean }).modelReady, true, 'configured key alone is insufficient; probe must be fresh')
    const conversation = await call('/api/ai/conversations', cookie, {})
    assert.equal(conversation.status, 201)
    const conversationId = (conversation.body.data as { id: string }).id
    let verifiedBusiness = 0
    let refusal = 0
    for (const [index, message] of turns.entries()) {
      const result = await call('/api/ai/assistant', cookie, { message, conversationId, mode: 'ask' })
      assert.equal(result.status, 200, `turn ${index + 1}: ${JSON.stringify(result.body)}`)
      const data = result.body.data as { message: string; answer?: { domain: string; total: number }; code?: string }
      assert.ok(data.message?.trim(), `turn ${index + 1} empty reply`)
      if (index === 6 || index === 8 || index === 18 || index === 19) {
        const query = new URL('/api/ai/business-records', base)
        query.searchParams.set('domain', 'repair'); query.searchParams.set('aggregate', '1')
        if (index === 6 || index === 8) { query.searchParams.set('status', 'pending'); query.searchParams.append('location', index === 6 ? '3号楼' : '本地集成楼栋 101') }
        if (index === 18 || index === 19) {
          const dates = extractBaizeLocalSlots(message).args
          if (dates.dateFrom) query.searchParams.set('dateFrom', dates.dateFrom)
          if (dates.dateTo) query.searchParams.set('dateTo', dates.dateTo)
          query.searchParams.set('status', index === 18 ? 'completed' : 'pending')
        }
        const direct = await call(query.pathname + query.search, cookie)
        assert.equal(direct.status, 200)
        assert.equal(data.answer?.total, (direct.body.data as { total: number }).total, `turn ${index + 1} scoped PG mismatch`)
        verifiedBusiness += 1
      }
      if ([2, 3, 10, 11].includes(index)) assert.equal(data.answer, undefined, `turn ${index + 1} procedural question was misrouted as a business count`)
      if (index === 14) { assert.ok(data.code === 'INSUFFICIENT_AUTHORIZED_EVIDENCE' || data.message.includes('依据'), 'knowledge answer invented policy'); refusal += 1 }
      console.log(`turn ${index + 1}/30: ${data.answer?.domain ?? data.code ?? 'conversation'}`)
    }
    const stored = await call(`/api/ai/conversations/${conversationId}`, cookie)
    assert.equal((stored.body.data as { messages: unknown[] }).messages.length, 60, '30 turns must persist 60 messages')
    const audit = await pool.query<{ count: number; tokens: number; invalid_usage: number }>(
      `SELECT count(*)::int AS count,coalesce(sum(total_tokens),0)::int AS tokens,
        count(*) FILTER (WHERE total_tokens IS NULL OR total_tokens<=0 OR total_tokens<>coalesce(prompt_tokens,0)+coalesce(completion_tokens,0))::int AS invalid_usage
       FROM ai_model_invocations WHERE school_id=(SELECT school_id FROM users WHERE user_id='admin' LIMIT 1)
         AND metadata->>'conversationId'=$1 AND status='SUCCEEDED'`, [conversationId],
    )
    assert.ok(audit.rows[0].count >= 10, `only ${audit.rows[0].count} audited model calls in 30-turn session`)
    assert.ok(audit.rows[0].tokens > 0 && audit.rows[0].invalid_usage === 0, 'model token audit incomplete')
    console.log(`PASS 30-turn real model: ${turns.length} turns, scoped comparisons=${verifiedBusiness}, knowledge refusals=${refusal}, audited calls=${audit.rows[0].count}, tokens=${audit.rows[0].tokens}`)
  } finally { await pool.end() }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
