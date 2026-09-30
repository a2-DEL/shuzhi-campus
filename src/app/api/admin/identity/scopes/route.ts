import { NextRequest, NextResponse } from 'next/server'
import { requireAuthorization } from '@/lib/authorization'
import { IdentityAdminError } from '@/lib/identity/admin'
import { listIdentityScopes } from '@/lib/identity/scopes'

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthorization(request, { permission: 'user:view' })
    const catalog = await listIdentityScopes(user)
    return NextResponse.json({ success: true, data: catalog }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof IdentityAdminError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.code === 'IDENTITY_SOURCE_ERROR' ? 503 : 400 }
      )
    }
    const status = error instanceof Error && error.name === 'AuthorizationError' ? 403 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scope catalog failed', code: 'SCOPE_CATALOG_FAILED' },
      { status }
    )
  }
}
