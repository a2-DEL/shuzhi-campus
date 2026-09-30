import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AuthorizationError,
  authorize,
  requireAuthorization,
} from '@/lib/authorization'
import {
  createIdentityUser,
  IdentityAdminError,
  listIdentityUsers,
} from '@/lib/identity/admin'
import { canGrantRole, ROLE_ALLOWED_SCOPES } from '@/lib/role-policy'
import {
  DEPARTMENTS,
  RoleScopeType,
  UserRole,
} from '@/types'

const roleSchema = z.enum(UserRole)
const scopeSchema = z.enum(['global', 'school', 'campus', 'organization', 'class', 'building', 'self'])
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: roleSchema.optional(),
  organizationId: z.uuid().optional(),
  keyword: z.string().trim().max(64).optional(),
  search: z.string().trim().max(64).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  department: z.string().trim().max(100).optional(),
})
const createSchema = z.object({
  userId: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(128),
  password: z.string().min(12).max(128),
  role: roleSchema,
  primaryOrganizationId: z.uuid().optional(),
  primaryCampusId: z.uuid().optional(),
  scopeType: scopeSchema,
  scopeId: z.uuid().optional(),
  department: z.string().trim().max(100).optional(),
  className: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.email().max(255).optional(),
})

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (error instanceof IdentityAdminError) {
    const status = error.code === 'DEVELOPMENT_IDENTITY_READ_ONLY' ? 409
      : error.code === 'IDENTIFIER_ALREADY_EXISTS' ? 409
        : error.code === 'INVALID_SCOPE' ? 400
          : 503
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  console.error('Identity administration failed', error)
  return NextResponse.json(
    { success: false, error: 'Identity administration failed', code: 'IDENTITY_ADMIN_FAILED' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAuthorization(request, { permission: 'user:view' })
    const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid list filters', code: 'INVALID_QUERY' },
        { status: 400 }
      )
    }
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')

    let organizationId = parsed.data.organizationId
    if (authorization.assignment.scope_type === 'organization') {
      if (organizationId && organizationId !== authorization.assignment.scope_id) {
        throw new AuthorizationError('FORBIDDEN', 403, 'Requested organization is outside the active role scope')
      }
      organizationId = authorization.assignment.scope_id
    } else if (!['global', 'school'].includes(authorization.assignment.scope_type)) {
      throw new AuthorizationError('FORBIDDEN', 403, 'The active role scope cannot list user accounts')
    }

    const page = await listIdentityUsers(schoolId, {
      ...parsed.data,
      keyword: parsed.data.keyword ?? parsed.data.search,
      organizationId,
    })
    return NextResponse.json({
      success: true,
      data: {
        users: page.users,
        data: page.users,
        departments: DEPARTMENTS,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          totalPages: page.totalPages,
        },
        source: page.source,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireAuthorization(request, { permission: 'user:create' })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid identity payload', code: 'INVALID_IDENTITY_PAYLOAD', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const actor = authorization.user
    const schoolId = actor.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')

    const target = parsed.data
    if (!ROLE_ALLOWED_SCOPES[target.role].includes(target.scopeType)) {
      throw new IdentityAdminError('INVALID_SCOPE', `Role ${target.role} cannot use ${target.scopeType} scope`)
    }
    if (!canGrantRole(authorization.assignment.role, target.role)) {
      throw new AuthorizationError('FORBIDDEN', 403, 'The active role cannot grant the requested role')
    }

    const resource = {
      schoolId,
      campusId: target.scopeType === 'campus' ? target.scopeId : target.primaryCampusId,
      organizationId: target.scopeType === 'organization' ? target.scopeId : target.primaryOrganizationId,
      classId: target.scopeType === 'class' ? target.scopeId : undefined,
      buildingId: target.scopeType === 'building' ? target.scopeId : undefined,
    }
    const scopeDecision = authorize(actor, { permission: 'user:create', resource })
    if (!scopeDecision.allowed) {
      throw new AuthorizationError('FORBIDDEN', 403, `Target identity is outside the active scope: ${scopeDecision.reason}`)
    }

    const created = await createIdentityUser({
      ...target,
      schoolId,
      scopeType: target.scopeType,
      scopeId: target.scopeId,
      grantedBy: actor.id,
    })
    return NextResponse.json(
      { success: true, data: created, message: 'Identity created' },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
