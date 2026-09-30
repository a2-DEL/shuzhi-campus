import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

interface StudentRepairRow {
  id: string
  title: string
  status: string
  damage_type: string
  location: string
  priority: string
  created_at: Date | string
  completed_at: Date | string | null
}

// Tenant and reporter IDs come exclusively from the authenticated session, never query parameters.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  if (!authorize(user, { permission: 'repair:view:own' }).allowed) return NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  if (!hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'PostgreSQL unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  try {
    const result = await getPostgresPool().query<StudentRepairRow>(
      `SELECT id,title,status,damage_type,location,priority,created_at,completed_at FROM repair_orders
       WHERE school_id=$1::uuid AND reporter_id=$2 AND NOT is_deleted ORDER BY created_at DESC`,
      [user.school_id, user.id],
    )
    const repairs = result.rows
    return NextResponse.json({ success: true, data: {
      stats: {
        total: repairs.length,
        pending: repairs.filter((repair) => repair.status === 'PENDING').length,
        processing: repairs.filter((repair) => ['PROCESSING', 'DISPATCHED', 'ASSIGNED', 'IN_PROGRESS'].includes(repair.status)).length,
        completed: repairs.filter((repair) => ['COMPLETED', 'CLOSED'].includes(repair.status)).length,
        rejected: repairs.filter((repair) => repair.status === 'REJECTED').length,
      },
      recentRepairs: repairs.slice(0, 5),
    } })
  } catch (error) {
    console.error('Failed to read student PG repairs', error)
    return NextResponse.json({ success: false, error: '报修进度暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
