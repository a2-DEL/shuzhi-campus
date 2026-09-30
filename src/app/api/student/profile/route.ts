import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'
import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { getAuthUser } from '@/lib/auth'

// 获取学生个人中心数据
export async function GET(request: NextRequest) {
  const pgResponse: NextResponse | null = await readPgStudentProfile(request)
  if (pgResponse) return pgResponse
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'student', { allowedRoles: ['student', 'class_committee', 'super_admin'] })
  if (legacyResponse) return legacyResponse

  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const client = getSupabaseClient()

    // 获取报修记录统计
    const { data: repairs } = await client
      .from('repair_orders')
      .select('id, status, created_at')
      .eq('reporter_id', authUser.id)

    const repairStats = {
      total: repairs?.length || 0,
      pending: repairs?.filter(r => r.status === 'PENDING' || r.status === 'DISPATCHED').length || 0,
      processing: repairs?.filter(r => r.status === 'PROCESSING').length || 0,
      completed: repairs?.filter(r => r.status === 'COMPLETED' || r.status === 'CLOSED').length || 0,
    }

    // 获取值日记录
    const className = authUser.class_name || ''
    const { data: duties } = await client
      .from('duty_schedules')
      .select('id, duty_date, status')
      .eq('class_name', className)

    const dutyStats = {
      total: duties?.length || 0,
      completed: duties?.filter(d => d.status === 'completed').length || 0,
      pending: duties?.filter(d => d.status === 'pending').length || 0,
    }

    // 获取失物记录
    const { data: lostFound } = await client
      .from('lost_found')
      .select('id, type, status, created_at')
      .eq('reporter_id', authUser.id)

    const lostFoundStats = {
      total: lostFound?.length || 0,
      claimed: lostFound?.filter(l => l.status === 'claimed' || l.status === 'closed').length || 0,
      open: lostFound?.filter(l => l.status === 'open' || l.status === 'matched').length || 0,
    }

    // 获取未读消息数
    const { data: allNotifications } = await client
      .from('notifications')
      .select('id')
      .eq('status', 'published')

    const notificationIds = allNotifications?.map(n => n.id) || []

    let unreadCount = 0
    if (notificationIds.length > 0) {
      const { data: readRecords } = await client
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', authUser.id)
        .in('notification_id', notificationIds)

      const readIds = new Set(readRecords?.map(r => r.notification_id) || [])
      unreadCount = notificationIds.filter(id => !readIds.has(id)).length
    }

    // 获取用户信息
    const userInfo = {
      userId: authUser.user_id,
      name: authUser.name,
      role: authUser.role,
      department: authUser.department,
      className: authUser.class_name,
      phone: authUser.phone,
      avatar: authUser.avatar,
    }

    return NextResponse.json({
      success: true,
      data: {
        user: userInfo,
        repairStats,
        dutyStats,
        lostFoundStats,
        unreadCount
      }
    })
  } catch (error) {
    console.error('获取个人中心数据失败:', error)
    return NextResponse.json({ success: false, error: '获取数据失败' }, { status: 500 })
  }
}

interface StudentProfileCounts {
  repair_total: number
  repair_pending: number
  repair_processing: number
  repair_completed: number
  duty_total: number
  duty_pending: number
  duty_completed: number
  lost_total: number
  lost_claimed: number
  lost_open: number
  unread: number
}

async function readPgStudentProfile(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Profile unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  try {
    const result = await getPostgresPool().query<StudentProfileCounts>(
      `SELECT
       (SELECT count(*)::int FROM repair_orders r WHERE r.school_id=$1::uuid AND r.reporter_id=$2 AND NOT r.is_deleted) repair_total,
       (SELECT count(*)::int FROM repair_orders r WHERE r.school_id=$1::uuid AND r.reporter_id=$2 AND NOT r.is_deleted AND r.status IN ('PENDING','DISPATCHED')) repair_pending,
       (SELECT count(*)::int FROM repair_orders r WHERE r.school_id=$1::uuid AND r.reporter_id=$2 AND NOT r.is_deleted AND r.status IN ('PROCESSING','IN_PROGRESS')) repair_processing,
       (SELECT count(*)::int FROM repair_orders r WHERE r.school_id=$1::uuid AND r.reporter_id=$2 AND NOT r.is_deleted AND r.status IN ('COMPLETED','CLOSED')) repair_completed,
       (SELECT count(*)::int FROM duty_schedules d WHERE d.school_id=$1::uuid AND d.class_id IN
          (SELECT scope_id FROM user_role_assignments a WHERE a.school_id=$1::uuid AND a.user_id=$2 AND a.scope_type='class' AND a.status='active' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))) duty_total,
       (SELECT count(*)::int FROM duty_schedules d WHERE d.school_id=$1::uuid AND d.status='PENDING' AND d.class_id IN
          (SELECT scope_id FROM user_role_assignments a WHERE a.school_id=$1::uuid AND a.user_id=$2 AND a.scope_type='class' AND a.status='active' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))) duty_pending,
       (SELECT count(*)::int FROM duty_schedules d WHERE d.school_id=$1::uuid AND d.status IN ('COMPLETED','CHECKED') AND d.class_id IN
          (SELECT scope_id FROM user_role_assignments a WHERE a.school_id=$1::uuid AND a.user_id=$2 AND a.scope_type='class' AND a.status='active' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))) duty_completed,
       (SELECT count(*)::int FROM lost_found l WHERE l.school_id=$1::uuid AND l.reporter_id=$2) lost_total,
       (SELECT count(*)::int FROM lost_found l WHERE l.school_id=$1::uuid AND l.reporter_id=$2 AND l.status IN ('claimed','closed')) lost_claimed,
       (SELECT count(*)::int FROM lost_found l WHERE l.school_id=$1::uuid AND l.reporter_id=$2 AND l.status IN ('open','matched')) lost_open,
       (SELECT count(DISTINCT n.id)::int FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id AND n.school_id=d.school_id
         WHERE d.school_id=$1::uuid AND d.recipient_user_id=$2 AND d.channel='platform' AND d.status='DELIVERED' AND upper(n.status)='PUBLISHED') unread`,
      [user.school_id, user.id],
    )
    const row = result.rows[0]
    return NextResponse.json({ success: true, data: {
      user: { userId: user.user_id, name: user.name, role: user.role, department: user.department,
        className: user.class_name, phone: user.phone, avatar: user.avatar },
      repairStats: { total: row.repair_total, pending: row.repair_pending, processing: row.repair_processing, completed: row.repair_completed },
      dutyStats: { total: row.duty_total, pending: row.duty_pending, completed: row.duty_completed },
      lostFoundStats: { total: row.lost_total, claimed: row.lost_claimed, open: row.lost_open },
      unreadCount: row.unread,
    } })
  } catch (error) {
    console.error('Failed to read PG student profile', error)
    return NextResponse.json({ success: false, error: '个人中心暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
