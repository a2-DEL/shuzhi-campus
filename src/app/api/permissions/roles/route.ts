import { NextRequest, NextResponse } from 'next/server'
import { AuthorizationError, requireAuthorization } from '@/lib/authorization'
import { ROLE_LABELS, ROLE_PERMISSIONS, UserRole } from '@/types'

function groupedPermissions(role: UserRole): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}
  for (const permission of ROLE_PERMISSIONS[role]) {
    const [module, action = '*'] = permission.split(':')
    grouped[module] ??= []
    if (!grouped[module].includes(action)) grouped[module].push(action)
  }
  return grouped
}

function authorizationError(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  console.error('Role policy endpoint failed', error)
  return NextResponse.json(
    { success: false, error: 'Role policy endpoint failed', code: 'ROLE_POLICY_FAILED' },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    await requireAuthorization(request, { permission: 'permission:view' })
    const role = request.nextUrl.searchParams.get('role')
    const roles = Object.values(UserRole).filter((candidate) => !role || candidate === role)
    if (role && roles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Unknown role', code: 'INVALID_ROLE' },
        { status: 400 }
      )
    }
    return NextResponse.json({
      success: true,
      data: roles.map((roleCode) => ({
        role: roleCode,
        label: ROLE_LABELS[roleCode],
        permissions: groupedPermissions(roleCode),
        source: 'versioned_code_policy',
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return authorizationError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuthorization(request, { permission: 'permission:edit' })
    return NextResponse.json(
      {
        success: false,
        error: 'Runtime policy mutation is disabled until versioned policy publishing is available',
        code: 'POLICY_PUBLISHING_REQUIRED',
      },
      { status: 501, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return authorizationError(error)
  }
}
