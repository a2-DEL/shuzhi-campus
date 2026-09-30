import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ROLE_PERMISSIONS, RoleScopeType, User, UserRole, UserRoleAssignment } from '@/types'

export interface ResourceScope {
  schoolId: string
  campusId?: string
  organizationId?: string
  organizationPathIds?: string[]
  classId?: string
  buildingId?: string
  ownerUserId?: string
}

export interface AuthorizationRequirement {
  permission: string
  resource?: ResourceScope
  allowedRoles?: UserRole[]
}

export interface AuthorizationDecision {
  allowed: boolean
  reason: 'allowed' | 'unauthenticated' | 'role_denied' | 'permission_denied' | 'scope_denied'
  assignment?: UserRoleAssignment
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    readonly status: 401 | 403,
    message: string
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true
  if (!granted.endsWith(':*')) return false
  return required.startsWith(granted.slice(0, -1))
}

function assignmentHasPermission(assignment: UserRoleAssignment, permission: string): boolean {
  return (ROLE_PERMISSIONS[assignment.role] ?? []).some((granted) => permissionMatches(granted, permission))
}

function assignmentIsActive(assignment: UserRoleAssignment, now: Date): boolean {
  if (assignment.status !== 'active') return false
  const validFrom = Date.parse(assignment.valid_from)
  if (Number.isFinite(validFrom) && validFrom > now.getTime()) return false
  if (assignment.valid_until) {
    const validUntil = Date.parse(assignment.valid_until)
    if (!Number.isFinite(validUntil) || validUntil <= now.getTime()) return false
  }
  return true
}

function exactScopeMatch(type: RoleScopeType, assignment: UserRoleAssignment, resource: ResourceScope): boolean {
  if (assignment.school_id !== resource.schoolId) return false
  switch (type) {
    case 'global':
    case 'school':
      return type === 'global' || assignment.scope_id === resource.schoolId
    case 'campus':
      return Boolean(assignment.scope_id && assignment.scope_id === resource.campusId)
    case 'organization':
      return Boolean(
        assignment.scope_id && (
          assignment.scope_id === resource.organizationId ||
          resource.organizationPathIds?.includes(assignment.scope_id)
        )
      )
    case 'class':
      return Boolean(assignment.scope_id && assignment.scope_id === resource.classId)
    case 'building':
      return Boolean(assignment.scope_id && assignment.scope_id === resource.buildingId)
    case 'self':
      return resource.ownerUserId === assignment.user_id
    default:
      return false
  }
}

export function authorize(
  user: User | null,
  requirement: AuthorizationRequirement,
  now = new Date()
): AuthorizationDecision {
  if (!user) return { allowed: false, reason: 'unauthenticated' }

  const assignments = (user.role_assignments ?? []).filter((assignment) => assignmentIsActive(assignment, now))
  const roleEligible = requirement.allowedRoles
    ? assignments.filter((assignment) => requirement.allowedRoles?.includes(assignment.role))
    : assignments
  if (requirement.allowedRoles && roleEligible.length === 0) {
    return { allowed: false, reason: 'role_denied' }
  }

  const permissionEligible = roleEligible.filter((assignment) => assignmentHasPermission(assignment, requirement.permission))
  if (permissionEligible.length === 0) {
    return { allowed: false, reason: 'permission_denied' }
  }

  if (!requirement.resource) {
    return { allowed: true, reason: 'allowed', assignment: permissionEligible[0] }
  }

  const scopedAssignment = permissionEligible.find((assignment) =>
    exactScopeMatch(assignment.scope_type, assignment, requirement.resource!)
  )
  return scopedAssignment
    ? { allowed: true, reason: 'allowed', assignment: scopedAssignment }
    : { allowed: false, reason: 'scope_denied' }
}

export async function requireAuthorization(
  request: NextRequest,
  requirement: AuthorizationRequirement
): Promise<{ user: User; assignment: UserRoleAssignment }> {
  const user = await getAuthUser(request)
  const decision = authorize(user, requirement)
  if (!user || decision.reason === 'unauthenticated') {
    throw new AuthorizationError('UNAUTHENTICATED', 401, 'Authentication required')
  }
  if (!decision.allowed || !decision.assignment) {
    throw new AuthorizationError('FORBIDDEN', 403, `Authorization denied: ${decision.reason}`)
  }
  return { user, assignment: decision.assignment }
}

export function getActiveAssignments(user: User, permission: string, now = new Date()): UserRoleAssignment[] {
  return (user.role_assignments ?? []).filter(
    (assignment) => assignmentIsActive(assignment, now) && assignmentHasPermission(assignment, permission)
  )
}

export function getActiveAssignmentsForPermissions(
  user: User,
  permissions: readonly string[],
  now = new Date(),
): UserRoleAssignment[] {
  return (user.role_assignments ?? []).filter(
    (assignment) => assignmentIsActive(assignment, now) && permissions.some((permission) => assignmentHasPermission(assignment, permission)),
  )
}
