import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AuthorizationError,
  authorize,
  requireAuthorization,
} from '@/lib/authorization'
import {
  getRoleAssignment,
  grantRoleAssignment,
  listRoleAssignments,
  resolveRoleScopeResource,
  revokeRoleAssignment,
} from '@/lib/identity/assignments'
import { IdentityAdminError } from '@/lib/identity/admin'
import { canGrantRole, ROLE_ALLOWED_SCOPES } from '@/lib/role-policy'
import { UserRole } from '@/types'

const roleSchema = z.enum(UserRole)
const scopeSchema = z.enum(['global', 'school', 'campus', 'organization', 'class', 'building', 'self'])
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().max(64).optional(),
  user_id: z.string().max(64).optional(),
  role: roleSchema.optional(),
  status: z.enum(['active', 'suspended', 'revoked']).optional(),
})
const grantSchema = z.object({
  userId: z.string().min(1).max(64),
  role: roleSchema,
  scopeType: scopeSchema,
  scopeId: z.uuid().optional(),
  validUntil: z.iso.datetime().optional(),
  reason: z.string().trim().min(3).max(500),
})
const revokeSchema = z.object({ id: z.uuid() })

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (error instanceof IdentityAdminError) {
    const status = error.code === 'DEVELOPMENT_IDENTITY_READ_ONLY' ? 409
      : error.code.includes('NOT_FOUND') ? 404
        : error.code === 'IDENTITY_SOURCE_ERROR' ? 503
          : 400
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  console.error('Role assignment endpoint failed', error)
  return NextResponse.json(
    { success: false, error: 'Role assignment endpoint failed', code: 'ROLE_ASSIGNMENT_FAILED' },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAuthorization(request, { permission: 'role:view' })
    const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid list filters', code: 'INVALID_QUERY' }, { status: 400 })
    }
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')

    const scopeType = authorization.assignment.scope_type === 'organization' ? 'organization' : undefined
    const scopeId = scopeType ? authorization.assignment.scope_id : undefined
    if (!scopeType && !['global', 'school'].includes(authorization.assignment.scope_type)) {
      throw new AuthorizationError('FORBIDDEN', 403, 'The active scope cannot list role assignments')
    }
    const result = await listRoleAssignments(schoolId, {
      ...parsed.data,
      userId: parsed.data.userId ?? parsed.data.user_id,
      scopeType,
      scopeId,
    })
    return NextResponse.json({
      success: true,
      data: {
        data: result.assignments,
        pagination: {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / parsed.data.pageSize)),
        },
        source: result.source,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireAuthorization(request, { permission: 'role:assign' })
    const parsed = grantSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid role assignment payload', code: 'INVALID_ROLE_ASSIGNMENT', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
    const target = parsed.data
    if (!canGrantRole(authorization.assignment.role, target.role)) {
      throw new AuthorizationError('FORBIDDEN', 403, 'The active role cannot grant the requested role')
    }
    if (!ROLE_ALLOWED_SCOPES[target.role].includes(target.scopeType)) {
      throw new IdentityAdminError('INVALID_SCOPE', `Role ${target.role} cannot use ${target.scopeType} scope`)
    }

    const resource = await resolveRoleScopeResource(schoolId, target.scopeType, target.scopeId)
    const decision = authorize(authorization.user, { permission: 'role:assign', resource })
    if (!decision.allowed) {
      throw new AuthorizationError('FORBIDDEN', 403, `Target role scope is not assignable: ${decision.reason}`)
    }

    const assignment = await grantRoleAssignment({
      schoolId,
      userId: target.userId,
      role: target.role,
      scopeType: target.scopeType,
      scopeId: target.scopeId,
      grantedBy: authorization.user.id,
      validUntil: target.validUntil,
      reason: target.reason,
    })
    return NextResponse.json(
      { success: true, data: assignment },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = await requireAuthorization(request, { permission: 'role:assign' })
    const parsed = revokeSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid assignment id', code: 'INVALID_ASSIGNMENT_ID' }, { status: 400 })
    }
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
    const existing = await getRoleAssignment(schoolId, parsed.data.id)
    if (!existing) throw new IdentityAdminError('ROLE_ASSIGNMENT_NOT_FOUND', 'Role assignment was not found')
    if (!canGrantRole(authorization.assignment.role, existing.role)) {
      throw new AuthorizationError('FORBIDDEN', 403, 'The active role cannot revoke this assignment')
    }
    const resource = await resolveRoleScopeResource(schoolId, existing.scope_type, existing.scope_id)
    const decision = authorize(authorization.user, { permission: 'role:assign', resource })
    if (!decision.allowed) {
      throw new AuthorizationError('FORBIDDEN', 403, `Assignment scope is not revocable: ${decision.reason}`)
    }
    const assignment = await revokeRoleAssignment(schoolId, parsed.data.id)
    return NextResponse.json({ success: true, data: assignment }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
