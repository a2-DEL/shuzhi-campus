import './assert-isolated-test-environment.mjs'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
const baseUrl = process.env.TEST_BASE_URL || process.env.IDENTITY_TEST_BASE_URL || 'http://localhost:5000'
const accounts = [
  ['admin', 'super_admin'],
  ['ai_ops', 'ai_ops_admin'],
  ['dept', 'dept_admin'],
  ['hygiene_manager', 'dept_hygiene_manager'],
  ['hygiene', 'dept_hygiene_admin'],
  ['counselor', 'counselor'],
  ['teacher', 'teacher'],
  ['logistics', 'logistics_manager'],
  ['logistics_admin', 'logistics_admin'],
  ['repairman', 'repairman'],
  ['dorm', 'dorm_manager'],
  ['dorm_keeper', 'dorm_keeper'],
  ['student', 'student'],
  ['committee', 'class_committee'],
]

async function request(path, cookie, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
  })
  let json = null
  try { json = await response.json() } catch {}
  return { response, json }
}

async function cleanupIdentityTestRow(createdId, createdIdentifier) {
  loadDotEnv({ path: '.env.local', quiet: true })
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1 AND user_id IN (SELECT id FROM users WHERE user_id=$1 AND users.user_id=$2)', [createdId, createdIdentifier])
    await client.query('DELETE FROM user_role_assignments WHERE user_id=$1 AND user_id IN (SELECT id FROM users WHERE id=$1 AND user_id=$2)', [createdId, createdIdentifier])
    await client.query('DELETE FROM users WHERE id=$1 AND user_id=$2', [createdId, createdIdentifier])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

async function login(identifier) {
  const { response, json } = await request('/api/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ userId: identifier, password: '123456' }),
  })
  if (response.status !== 200) throw new Error(`${identifier} login failed: ${response.status} ${JSON.stringify(json)}`)
  return response.headers.get('set-cookie')?.split(';')[0] || ''
}

let assertions = 0
function expect(condition, message) {
  if (!condition) throw new Error(message)
  assertions += 1
}

for (const [identifier, role] of accounts) {
  const cookie = await login(identifier)
  const { response, json } = await request('/api/auth/me', cookie)
  expect(response.status === 200, `${identifier} session failed`)
  expect(json?.data?.role === role, `${identifier} role mismatch`)
  expect(json?.data?.role_assignments?.[0]?.role === role, `${identifier} assignment mismatch`)
  expect(Boolean(json?.data?.school_id), `${identifier} school scope missing`)
}

let result = await request('/api/users')
expect(result.response.status === 401, 'anonymous identity list must be denied')

const adminCookie = await login('admin')
result = await request('/api/users?pageSize=100', adminCookie)
expect(result.response.status === 200 && result.json?.data?.data?.some((user) => user.user_id === 'admin'), 'admin identity list omitted the current administrator')
result = await request('/api/permissions/roles', adminCookie)
expect(result.response.status === 200 && result.json?.data?.length === 14, 'canonical role policy mismatch')
result = await request('/api/permissions/assignments?pageSize=100', adminCookie)
expect(result.response.status === 200 && result.json?.data?.pagination?.total >= accounts.length, 'assignment list unavailable')
result = await request('/api/admin/identity/scopes', adminCookie)
expect(result.response.status === 200 && result.json?.data?.organizations?.length >= 1, 'scope catalog unavailable')

const deptCookie = await login('dept')
const deptIdentity = await request('/api/auth/me', deptCookie)
const deptScope = deptIdentity.json?.data?.role_assignments?.find((assignment) => assignment.scope_type === 'organization')?.scope_id
expect(Boolean(deptScope), 'department assignment is missing its organization scope')
result = await request('/api/users?pageSize=100', deptCookie)
expect(result.response.status === 200 && result.json?.data?.data?.every((user) => user.primary_organization_id === deptScope), 'department identity scope leak')
result = await request('/api/permissions/assignments?pageSize=100', deptCookie)
expect(result.response.status === 200 && result.json?.data?.data?.every((assignment) => assignment.school_id === deptIdentity.json?.data?.school_id), 'department assignment tenant scope leak')

const studentCookie = await login('student')
result = await request('/api/users', studentCookie)
expect(result.response.status === 403, 'student identity list must be denied')
result = await request('/api/permissions/assignments', studentCookie)
expect(result.response.status === 403, 'student assignment list must be denied')

const createdIdentifier = `identity-api-test-${Date.now()}-${randomUUID().slice(0, 8)}`
result = await request('/api/admin/accounts', adminCookie, {
  method: 'POST',
  body: JSON.stringify({
    userId: createdIdentifier,
    name: 'Identity API Test',
    password: 'strong-password-123',
    role: 'student',
    scopeType: 'class',
    scopeId: '00000000-0000-4000-8000-000000000201',
  }),
})
expect(result.response.status === 201 && result.json?.data?.user_id === createdIdentifier, 'Postgres identity create failed')
const createdId = result.json.data.id
result = await request(`/api/users?keyword=${encodeURIComponent(createdIdentifier)}`, adminCookie)
expect(result.response.status === 200 && result.json?.data?.data?.some((user) => user.id === createdId), 'unique seeded user was not found')
result = await request(`/api/users/${createdId}`, adminCookie, {
  method: 'PUT',
  body: JSON.stringify({ name: 'Identity API Test Updated' }),
})
expect(result.response.status === 200 && result.json?.data?.name === 'Identity API Test Updated', 'Postgres identity update failed')
result = await request(`/api/users/${createdId}`, adminCookie, { method: 'DELETE' })
expect(result.response.status === 200 && result.json?.data?.status === 'disabled', 'Postgres identity deactivation failed')
result = await request(`/api/users/${createdId}`, adminCookie)
expect(result.response.status === 404, 'deactivated identity remained readable')

result = await request('/api/auth/logout', adminCookie, { method: 'POST' })
expect(result.response.status === 200, 'logout failed')
result = await request('/api/auth/me', adminCookie)
expect(result.response.status === 401, 'revoked session remained valid')
await cleanupIdentityTestRow(createdId, createdIdentifier)

console.log(`PASS identity API verifier: accounts=${accounts.length}/${accounts.length} assertions=${assertions}`)
