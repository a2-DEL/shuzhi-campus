import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { extractBaizeLocalSlots } from '../src/lib/ai/assistant/slots'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
let checks = 0

async function login(userId: string): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', base), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password: '123456' }), signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.status, 200, `${userId} login`)
  checks += 1
  return response.headers.get('set-cookie')?.split(';')[0] || ''
}
async function get(path: string, cookie: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(new URL(path, base), { headers: { cookie }, signal: AbortSignal.timeout(30_000) })
  return { status: response.status, data: await response.json() as Record<string, unknown> }
}
async function talk(cookie: string, message: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(new URL('/api/ai/assistant', base), {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ message, mode: 'ask' }), signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, data: await response.json() as Record<string, unknown> }
}

const queries = [
  '查一下3号楼的待处理报修', '查一下3 号楼的待处理报修',
  '查一下本地集成楼栋 101 的待处理报修', '查一下本地集成楼栋 101 的报修',
  '查一下4号楼的报修', '查一下3栋已完成的报修', '查一下三号楼的报修',
  '查一下宿舍A区的报修', '查一下教学楼3的报修', '查一下3号教学楼的报修',
  '查一下不是3号楼的报修', '查一下排除3号楼和4号楼的报修',
  '查一下3号楼和4号楼的报修', '查一下上周完成的报修',
  '查一下上周待处理报修', '查一下本月我提交的报修',
  '查一下不要已完成的报修', '查一下本地集成楼栋 101 上周的报修',
] as const
const clarifications = [
  '查一下3号楼到5号楼的报修', '查一下3号楼但不是3号楼的报修',
  '查一下去年待处理的报修', '查一下排除待处理的报修',
] as const

async function main(): Promise<void> {
try {
  const admin = await login('admin')
  const student = await login('student')
  for (const message of queries) {
    const parsed = extractBaizeLocalSlots(message)
    assert.equal(parsed.clarification, undefined, `parser unexpected clarification: ${message}`)
    const url = new URL('/api/ai/business-records', base)
    url.searchParams.set('domain', 'repair'); url.searchParams.set('aggregate', '1')
    url.searchParams.set('status', parsed.args.status ?? 'all')
    for (const location of parsed.args.locations ?? []) url.searchParams.append('location', location)
    for (const location of parsed.args.excludeLocations ?? []) url.searchParams.append('excludeLocation', location)
    if (parsed.args.dateFrom) url.searchParams.set('dateFrom', parsed.args.dateFrom)
    if (parsed.args.dateTo) url.searchParams.set('dateTo', parsed.args.dateTo)
    if (parsed.args.ownerOnly) url.searchParams.set('ownerOnly', 'true')
    if (parsed.args.excludeCompleted) url.searchParams.set('excludeCompleted', 'true')
    const direct = await get(url.pathname + url.search, admin)
    const response = await talk(admin, message)
    assert.equal(direct.status, 200, `PG scoped aggregate ${message}`)
    assert.equal(response.status, 200, `assistant ${message}: ${JSON.stringify(response.data)}`)
    const expected = direct.data.data as { total: number }
    const actual = response.data.data as { answer?: { total: number }; conversationId: string; message: string }
    assert.equal(actual.answer?.total, expected.total, `answer must equal scoped PG: ${message}`)
    if (expected.total === 0) assert.match(actual.message, /0 条/, `zero explicit: ${message}`)
    checks += 4
    const audit = await pool.query<{ content: string; raw_query_hash: string; parsed_args: Record<string, unknown>; effective_args: Record<string, unknown>; scope_snapshot: Record<string, unknown>; record_count: number }>(
      `SELECT m.content,t.raw_query_hash,t.parsed_args,t.effective_args,t.scope_snapshot,t.record_count
       FROM baize_tool_invocations t JOIN baize_messages m ON m.id=t.query_message_id AND m.user_id=t.user_id
       WHERE t.conversation_id=$1::uuid AND t.status='SUCCEEDED' ORDER BY t.created_at DESC LIMIT 1`, [actual.conversationId],
    )
    assert.equal(audit.rows[0]?.content, message, `raw query link ${message}`)
    assert.equal(audit.rows[0]?.raw_query_hash, createHash('sha256').update(message).digest('hex'))
    assert.equal(audit.rows[0]?.record_count, expected.total, `audit count ${message}`)
    assert.equal(audit.rows[0]?.effective_args?.domain, 'repair')
    assert.ok(audit.rows[0]?.scope_snapshot?.clause && audit.rows[0]?.scope_snapshot?.values, `scope audit ${message}`)
    checks += 5
  }
  for (const message of clarifications) {
    const response = await talk(admin, message)
    assert.equal(response.status, 200, `clarification ${message}`)
    assert.equal((response.data.data as { kind: string })?.kind, 'clarify', `ambiguous filter must not run: ${message}`)
    checks += 2
  }
  const studentReply = await talk(student, '查一下本地集成楼栋 101 的待处理报修')
  const studentDirect = await get('/api/ai/business-records?domain=repair&aggregate=1&status=pending&location=%E6%9C%AC%E5%9C%B0%E9%9B%86%E6%88%90%E6%A5%BC%E6%A0%8B%20101', student)
  assert.equal((studentReply.data.data as { answer?: { total: number } })?.answer?.total, (studentDirect.data.data as { total: number })?.total)
  checks += 1
  const denied = await talk(student, '查一下访客记录')
  assert.equal(denied.status, 403); checks += 1
  console.log(`PASS Baize slot-to-PG: ${queries.length} scoped queries, ${clarifications.length} clarifications, ${checks} assertions`)
} finally { await pool.end() }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
