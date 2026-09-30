import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

const base = process.env.TEST_BASE_URL || 'http://localhost:5000'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const domains = ['repair','notification','classroom','lost_found','hygiene','dormitory','dorm_safety','visitor','energy','material','duty']
let assertions = 0
function expect(condition, message) { assert.ok(condition, message); assertions += 1 }
async function request(path, cookie, method='GET', body) {
  const response = await fetch(new URL(path, base), { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type':'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) })
  let json = null; try { json = await response.json() } catch {}
  return { response, json }
}
async function login(userId) {
  const result = await request('/api/auth/login', null, 'POST', { userId, password:'123456' })
  expect(result.response.status === 200, `${userId} login failed`)
  return { cookie: result.response.headers.get('set-cookie')?.split(';')[0] || '', user: result.json?.data?.user }
}

let createdRepairId = null
let createdReporterId = null
let createdSchoolId = null
try {
  const health = await request('/api/health')
  expect(health.response.status === 200 && ['ready', 'partial'].includes(health.json?.status) && health.json?.modules?.executionReady === true, 'production readiness failed')
  expect((await request('/api/debug/db')).response.status === 404, 'production database debug route was exposed')
  const admin = await login('admin'), student = await login('student'), repairman = await login('repairman')
  const system = await request('/api/ai/system', admin.cookie)
  expect(system.response.status === 200 && system.json?.data?.businessPort === 'postgres', 'production readiness advertised legacy Supabase')
  for (const domain of domains) {
    const result = await request(`/api/ai/business-records?domain=${domain}&pageSize=100`, admin.cookie)
    expect(result.response.status === 200 && result.json?.data?.backend === 'postgres', `PG read model failed: ${domain}`)
  }
  const repairScope = repairman.user.role_assignments.find((assignment) => assignment.scope_type === 'organization')
  expect(Boolean(repairScope?.scope_id), 'repairman organization assignment is missing')
  const foreign = await pool.query(`SELECT r.id FROM repair_orders r WHERE r.school_id=$1::uuid AND r.organization_id<>$2::uuid AND NOT r.is_deleted LIMIT 1`, [repairman.user.school_id, repairScope.scope_id])
  expect(foreign.rows.length > 0, 'A/B organization regression fixture is missing')
  const scoped = await request('/api/ai/business-records?domain=repair&pageSize=100&scope=global', repairman.cookie)
  expect(scoped.response.status === 200 && !scoped.json?.data?.data?.some((row) => row.id === foreign.rows[0].id), 'repairman list leaked other organization')
  expect(scoped.json?.data?.pagination?.total >= scoped.json?.data?.data?.length, 'scoped total count is invalid')
  expect((await request(`/api/ai/business-records?domain=repair&id=${foreign.rows[0].id}&page=999`, repairman.cookie)).response.status === 403, 'cross-scope business detail was not denied')
  const lastPage = await request('/api/ai/business-records?domain=repair&page=999', repairman.cookie)
  expect(lastPage.response.status === 200 && lastPage.json?.data?.pagination?.total === scoped.json?.data?.pagination?.total, 'empty page erased scoped pagination total')
  expect((await request(`/api/repairs/${foreign.rows[0].id}`, repairman.cookie)).response.status === 403, 'cross-scope legacy repair detail was not denied')
  expect((await request('/api/repairs', null, 'POST', {title:'denied'})).response.status === 401, 'anonymous repair write was not denied')
  expect((await request('/api/materials', null, 'POST', {})).response.status === 401, 'anonymous legacy write was not denied')
  expect((await request('/api/materials', student.cookie, 'POST', {})).response.status === 403, 'unauthorized legacy write was not denied')
  const oldWrite = await request('/api/materials', admin.cookie, 'POST', {})
  expect(oldWrite.response.status === 503 && oldWrite.json?.code === 'LEGACY_FUNCTION_MIGRATING', 'retired write route did not fail safely')
  expect((await request('/api/dormitories/inspections', admin.cookie, 'POST', {})).response.status === 503, 'unmigrated inspection write remained open')
  expect((await request('/api/energy', student.cookie)).response.status === 403, 'energy read escaped permission scope')
  const payload = { title:`Prelaunch QA ${randomUUID().slice(0,8)}`, damage_type:'lighting', location:'隔离验证工位', description:'自动回归专用测试工单', priority:'2' }
  const created = await request('/api/repairs', student.cookie, 'POST', payload)
  expect(created.response.status === 201 && created.json?.data?.reporter_id === student.user.id, 'session-bound student repair create failed')
  createdRepairId = created.json.data.id
  createdReporterId = student.user.id
  createdSchoolId = student.user.school_id
  const own = await request('/api/student/repair-progress', student.cookie)
  expect(own.response.status === 200 && own.json?.data?.recentRepairs?.some((row) => row.id === createdRepairId), 'student cannot see new PG repair')
  const technician = await request(`/api/ai/business-records?domain=repair&id=${createdRepairId}`, repairman.cookie)
  expect(technician.response.status === 200 && technician.json?.data?.data?.length === 1, 'assigned logistics organization cannot see student repair')
  const detail = await request(`/api/repairs/${createdRepairId}`, student.cookie)
  expect(detail.response.status === 200 && detail.json?.data?.reporter_id === student.user.id, 'student PG detail failed')
  const tasksBefore = await request('/api/ai/tasks?page_size=100', admin.cookie)
  const invalid = await request('/api/ai/tasks', admin.cookie, 'POST', {command:'Prelaunch invalid repair dispatch',skill_id:'repair_dispatch',params:{count:-1}})
  const tasksAfter = await request('/api/ai/tasks?page_size=100', admin.cookie)
  expect(invalid.response.status === 400 && invalid.json?.code === 'INVALID_PARAMETERS' && Boolean(invalid.json?.fieldErrors?.['params.count']), 'invalid count was silently clamped')
  expect(tasksBefore.json?.data?.pagination?.total === tasksAfter.json?.data?.pagination?.total, 'invalid command created a task')
  for (const path of ['/api/student/profile','/api/student/duty-service','/api/student/lost-found','/api/student/messages']) {
    expect((await request(path, student.cookie)).response.status === 200, `migrated student PG endpoint failed: ${path}`)
  }
  for (const path of ['/api/auth/wechat/qrcode','/api/auth/wechat/status']) {
    const result = await request(path)
    expect(result.response.status === 503 && result.json?.error === '微信登录尚未接入，待第三方配置', `WeChat unavailable contract incorrect: ${path}`)
  }
  console.log(`PASS prelaunch core isolated PG: domains=${domains.length} scope=A-only crossDetail=403 repair=201 oldWrites=401/403/503 invalidCount=400 assertions=${assertions}`)
} finally {
  if (createdRepairId) {
    await pool.query(`DELETE FROM repair_orders WHERE id=$1 AND reporter_id=$2 AND school_id=$3::uuid AND title LIKE 'Prelaunch QA %'`, [createdRepairId, createdReporterId, createdSchoolId])
  }
  await pool.end()
}
