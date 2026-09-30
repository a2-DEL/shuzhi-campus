import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'

export interface LegacyApiAccess {
  permissions?: readonly string[]
  allowedRoles?: readonly string[]
}

/** Supabase-era endpoint quarantine: retain the historical handlers for reference, but never execute them. */
export async function legacyApiGuard(
  request: NextRequest,
  moduleName: string,
  access: LegacyApiAccess = {},
): Promise<NextResponse | null> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  if (access.allowedRoles && !access.allowedRoles.includes(user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }
  if (access.permissions && !access.permissions.some((permission) => authorize(user, { permission }).allowed)) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }
  // No legacy write reaches Supabase or bypasses PG Skill governance, even if old environment keys are configured.
  return NextResponse.json({ success: false, error: '该功能正在迁移升级，暂不可使用', code: 'LEGACY_FUNCTION_MIGRATING', module: moduleName }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
