import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { buildBusinessScopeFilter } from '@/lib/authorization-resource-scope'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

export const REPAIR_READ_PERMISSIONS = ['repair:view', 'repair:view:own'] as const

export interface RepairReadScope {
  userId: string
  schoolId: string
  clause: string
  values: unknown[]
}

export async function requireRepairReadScope(request: NextRequest): Promise<RepairReadScope | NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  if (!REPAIR_READ_PERMISSIONS.some((permission) => authorize(user, { permission }).allowed)) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }
  if (!hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'PostgreSQL unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  const scope = buildBusinessScopeFilter(user, 'repair', 'r', REPAIR_READ_PERMISSIONS, 2)
  return { userId: user.id, schoolId: user.school_id, clause: scope.clause, values: [user.school_id, ...scope.values] }
}

interface RepairDetailRow {
  id: string
  title: string
  damage_type: string
  location: string
  description: string | null
  images: string[] | null
  status: string
  priority: string | null
  reporter_id: string
  reporter_name: string
  reporter_phone: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_at: Date | string
  updated_at: Date | string
}

export async function readPgRepairDetail(request: NextRequest, id: string): Promise<NextResponse> {
  const access = await requireRepairReadScope(request)
  if (access instanceof NextResponse) return access
  if (!id || id.length > 36) return NextResponse.json({ success: false, error: 'Invalid repair ID', code: 'INVALID_ID' }, { status: 400 })
  try {
    const pool = getPostgresPool()
    const values = [...access.values, id]
    const result = await pool.query<RepairDetailRow>(
      `SELECT r.id,r.title,r.damage_type,r.location,r.description,r.images,r.status,r.priority,
        r.reporter_id,reporter.name AS reporter_name,reporter.phone AS reporter_phone,
        r.assignee_id,assignee.name AS assignee_name,r.created_at,r.updated_at
       FROM repair_orders r JOIN users reporter ON reporter.id=r.reporter_id AND reporter.school_id=r.school_id
       LEFT JOIN users assignee ON assignee.id=r.assignee_id AND assignee.school_id=r.school_id
       WHERE r.school_id=$1::uuid AND NOT r.is_deleted AND ${access.clause} AND r.id=$${values.length}`,
      values,
    )
    const row = result.rows[0]
    if (!row) {
      const exists = await pool.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM repair_orders WHERE id=$1 AND school_id=$2::uuid AND NOT is_deleted) AS exists',
        [id, access.schoolId],
      )
      return NextResponse.json({ success: false, error: exists.rows[0]?.exists ? 'Resource outside authorized scope' : 'Repair not found', code: exists.rows[0]?.exists ? 'SCOPE_DENIED' : 'NOT_FOUND' }, { status: exists.rows[0]?.exists ? 403 : 404 })
    }
    const phone = row.description?.match(/(?:^|\n)联系电话：([^\n]+)/)?.[1] ?? row.reporter_phone ?? ''
    return NextResponse.json({ success: true, data: {
      ...row,
      order_no: row.id,
      type: row.damage_type,
      contact_phone: phone,
      priority: Number(row.priority ?? 2),
      images: row.images ?? [],
      process_logs: [],
    } })
  } catch (error) {
    console.error('Failed to read PG repair detail', error)
    return NextResponse.json({ success: false, error: '报修详情暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
