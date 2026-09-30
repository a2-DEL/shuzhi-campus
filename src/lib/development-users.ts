import { DEMO_ACCOUNTS, DemoAccount } from '@/lib/demo-accounts'
import { RoleScopeType, User, UserRole, UserRoleAssignment, UserStatus } from '@/types'

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z'
export const DEVELOPMENT_SCHOOL_ID = '00000000-0000-4000-8000-000000000001'

export const DEVELOPMENT_ORGANIZATION_IDS = {
  platform: '00000000-0000-4000-8000-000000000101',
  academic: '00000000-0000-4000-8000-000000000102',
  logistics: '00000000-0000-4000-8000-000000000103',
  dormitory: '00000000-0000-4000-8000-000000000104',
  student: '00000000-0000-4000-8000-000000000105',
} as const

export const DEVELOPMENT_CLASS_ID = '00000000-0000-4000-8000-000000000201'
export const DEVELOPMENT_BUILDING_ID = '00000000-0000-4000-8000-000000000301'

function getDevelopmentScope(account: DemoAccount): { type: RoleScopeType; id?: string } {
  if (account.role === UserRole.SUPER_ADMIN) return { type: 'global' }
  if (account.role === UserRole.AI_OPS_ADMIN) return { type: 'school', id: DEVELOPMENT_SCHOOL_ID }
  if (account.role === UserRole.STUDENT || account.role === UserRole.CLASS_COMMITTEE) {
    return { type: 'class', id: DEVELOPMENT_CLASS_ID }
  }
  if (account.role === UserRole.DORM_KEEPER) {
    return { type: 'building', id: DEVELOPMENT_BUILDING_ID }
  }
  return { type: 'organization', id: DEVELOPMENT_ORGANIZATION_IDS[account.groupId] }
}

const developmentUsers: readonly User[] = DEMO_ACCOUNTS.map((account, index) => {
  const id = `dev-${account.identifier}`
  const scope = getDevelopmentScope(account)
  const assignment: UserRoleAssignment = {
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    school_id: DEVELOPMENT_SCHOOL_ID,
    user_id: id,
    role: account.role,
    scope_type: scope.type,
    scope_id: scope.id,
    is_primary: true,
    status: 'active',
    valid_from: FIXTURE_TIMESTAMP,
    source: 'direct',
  }

  return {
    id,
    user_id: account.identifier,
    name: account.name,
    role: account.role,
    school_id: DEVELOPMENT_SCHOOL_ID,
    primary_organization_id: DEVELOPMENT_ORGANIZATION_IDS[account.groupId],
    auth_version: 1,
    role_assignments: [assignment],
    department: account.department,
    status: UserStatus.ACTIVE,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
  }
})

// This is the legacy SHA-256 fixture for password "123456". It is accepted only
// when NODE_ENV is not production and is never used as a production identity source.
export const DEVELOPMENT_PASSWORD_HASH = 'ef1e4475620ae103968ca054ead3704b56936ad96fd8089f60632f7e6d38b36c'

export function getDevelopmentUser(identifier: string): User | null {
  // demo mode: always return development users
  const user = developmentUsers.find(
    (candidate) => candidate.id === identifier || candidate.user_id === identifier
  )
  return user
    ? { ...user, role_assignments: user.role_assignments?.map((assignment) => ({ ...assignment })) }
    : null
}
export function getDevelopmentUsers(): User[] {
  // demo mode: always return development users
  return developmentUsers.map((user) => ({
    ...user,
    role_assignments: user.role_assignments?.map((assignment) => ({ ...assignment })),
  }))
}
