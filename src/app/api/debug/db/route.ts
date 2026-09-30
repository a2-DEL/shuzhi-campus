import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { UserRole } from '@/types'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

// Never expose database diagnostics from a production build, including to logged-in administrators.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const user = await getAuthUser(request)
  if (!user || user.role !== UserRole.SUPER_ADMIN || !user.school_id) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }
  if (!hasPostgresDatabaseUrl()) {
    return NextResponse.json({ success: false, error: 'PostgreSQL unavailable', code: 'DATABASE_UNAVAILABLE' }, { status: 503 })
  }
  try {
    const result = await getPostgresPool().query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE school_id=$1::uuid AND NOT is_deleted',
      [user.school_id],
    )
    return NextResponse.json({ success: true, data: { tenantUserCount: result.rows[0]?.count ?? 0 } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ success: false, error: 'Database diagnostics unavailable', code: 'DATABASE_UNAVAILABLE' }, { status: 503 })
  }
}
