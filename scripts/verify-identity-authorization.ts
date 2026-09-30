import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { authorize } from '@/lib/authorization'
import { getDevelopmentUser } from '@/lib/development-users'
import { UserRole, UserRoleAssignment } from '@/types'

const schoolA = '00000000-0000-4000-8000-000000000001'
const schoolB = '00000000-0000-4000-8000-000000000099'
const academicOrg = '00000000-0000-4000-8000-000000000102'
const logisticsOrg = '00000000-0000-4000-8000-000000000103'
const classA = '00000000-0000-4000-8000-000000000201'
const classB = '00000000-0000-4000-8000-000000000299'

function user(identifier: string) {
  const result = getDevelopmentUser(identifier)
  assert.ok(result, `missing development user ${identifier}`)
  return result
}

const admin = user('admin')
assert.equal(authorize(admin, { permission: 'user:view', resource: { schoolId: schoolA } }).allowed, true)
assert.equal(authorize(admin, { permission: 'user:view', resource: { schoolId: schoolB } }).reason, 'scope_denied')

const dept = user('dept')
assert.equal(authorize(dept, { permission: 'user:view', resource: { schoolId: schoolA, organizationId: academicOrg } }).allowed, true)
assert.equal(authorize(dept, { permission: 'user:view', resource: { schoolId: schoolA, organizationId: logisticsOrg } }).reason, 'scope_denied')

const student = user('student')
assert.equal(authorize(student, { permission: 'repair:create', resource: { schoolId: schoolA, classId: classA } }).allowed, true)
assert.equal(authorize(student, { permission: 'repair:create', resource: { schoolId: schoolA, classId: classB } }).reason, 'scope_denied')
assert.equal(authorize(student, { permission: 'user:view' }).reason, 'permission_denied')

const delegated: UserRoleAssignment = {
  ...dept.role_assignments![0],
  id: '20000000-0000-4000-8000-000000000001',
  role: UserRole.LOGISTICS_MANAGER,
  source: 'delegation',
  scope_type: 'organization',
  scope_id: logisticsOrg,
  is_primary: false,
}
const delegatedUser = { ...dept, role_assignments: [dept.role_assignments![0], delegated] }
assert.equal(authorize(delegatedUser, { permission: 'repair:view', resource: { schoolId: schoolA, organizationId: logisticsOrg } }).allowed, true)
assert.equal(authorize(delegatedUser, { permission: 'repair:view', resource: { schoolId: schoolA, organizationId: academicOrg } }).reason, 'scope_denied')

const suspended = { ...dept, role_assignments: [{ ...dept.role_assignments![0], status: 'suspended' as const }] }
assert.equal(authorize(suspended, { permission: 'user:view' }).reason, 'permission_denied')

console.log('PASS identity authorization invariants: tenant, organization, class, delegation, suspension')
