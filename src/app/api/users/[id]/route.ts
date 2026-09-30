import { NextRequest, NextResponse } from 'next/server'
import { AuthorizationError, authorize, requireAuthorization } from '@/lib/authorization'
import {
  deactivateIdentityUser,
  getIdentityUser,
  IdentityAdminError,
  updateIdentityUser,
} from '@/lib/identity/admin'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  department: z.string().trim().max(100).nullable().optional(),
  className: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.email().nullable().optional(),
  avatar: z.string().url().max(500).nullable().optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(12).max(128).optional(),
})

function failure(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (error instanceof IdentityAdminError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.code.includes('NOT_FOUND') ? 404 : error.code === 'IDENTITY_SOURCE_ERROR' ? 503 : error.code === 'DEVELOPMENT_IDENTITY_READ_ONLY' ? 409 : 400 }
    )
  }
  console.error('Identity detail endpoint failed', error)
  return NextResponse.json(
    { success: false, error: 'Identity detail endpoint failed', code: 'IDENTITY_DETAIL_FAILED' },
    { status: 500 }
  )
}

async function getTarget(request: NextRequest, id: string) {
  const authorization = await requireAuthorization(request, { permission: 'user:view' })
  const schoolId = authorization.user.school_id
  if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
  const target = await getIdentityUser(schoolId, id)
  if (!target) throw new IdentityAdminError('USER_NOT_FOUND', 'Identity was not found')
  const decision = authorize(authorization.user, {
    permission: 'user:view',
    resource: {
      schoolId,
      organizationId: target.primary_organization_id,
      ownerUserId: target.id,
    },
  })
  if (!decision.allowed) throw new AuthorizationError('FORBIDDEN', 403, 'Identity is outside the active role scope')
  return { authorization, target }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { target } = await getTarget(request, (await params).id)
    return NextResponse.json({ success: true, data: target }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { target } = await getTarget(request, (await params).id)
    const authorization = await requireAuthorization(request, { permission: 'user:edit' })
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid identity update', code: 'INVALID_IDENTITY_UPDATE', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ success: false, error: 'No identity fields to update', code: 'EMPTY_IDENTITY_UPDATE' }, { status: 400 })
    }
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
    const updated = await updateIdentityUser(schoolId, target.id, parsed.data, authorization.user.id)
    return NextResponse.json({ success: true, data: updated }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { target } = await getTarget(request, (await params).id)
    const authorization = await requireAuthorization(request, { permission: 'user:delete' })
    const schoolId = authorization.user.school_id
    if (!schoolId) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
    await deactivateIdentityUser(schoolId, target.id, authorization.user.id)
    return NextResponse.json({ success: true, data: { id: target.id, status: 'disabled' } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}
