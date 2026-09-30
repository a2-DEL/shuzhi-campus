import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'
import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { getAuthUser } from '@/lib/auth'

// 获取学生值日服务信息
export async function GET(request: NextRequest) {
  const pgResponse: NextResponse | null = await readPgStudentDuties(request)
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

    // 获取班级信息
    const className = authUser.class_name || ''

    // 获取该班级的值日安排
    const { data: duties, error } = await client
      .from('duty_schedules')
      .select('*')
      .eq('class_name', className)
      .order('duty_date', { ascending: false })
      .limit(10)

    if (error) throw error

    // 统计
    const today = new Date().toISOString().split('T')[0]
    const todayDuty = duties?.find(d => d.duty_date === today)
    const upcomingDuties = duties?.filter(d => d.duty_date >= today).slice(0, 3) || []

    const stats = {
      total: duties?.length || 0,
      completed: duties?.filter(d => d.status === 'completed').length || 0,
      pending: duties?.filter(d => d.status === 'pending').length || 0,
      hasTodayDuty: !!todayDuty,
    }

    return NextResponse.json({
      success: true,
      data: {
        stats,
        todayDuty,
        upcomingDuties,
        className
      }
    })
  } catch (error) {
    console.error('获取值日服务失败:', error)
    return NextResponse.json({ success: false, error: '获取数据失败' }, { status: 500 })
  }
}

interface StudentDutyRow {
  id: string
  duty_date: string
  class_name: string
  location: string
  students: unknown
  duty_type: string
  status: string
  created_at: Date | string
}

async function readPgStudentDuties(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Duty service unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  try {
    const result = await getPostgresPool().query<StudentDutyRow>(
      `SELECT d.id,d.duty_date::text,d.class_name,d.location,d.students,d.duty_type,d.status,d.created_at
       FROM duty_schedules d WHERE d.school_id=$1::uuid AND d.class_id IN
        (SELECT a.scope_id FROM user_role_assignments a WHERE a.school_id=$1::uuid AND a.user_id=$2
         AND a.scope_type='class' AND a.status='active' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))
       ORDER BY d.duty_date DESC LIMIT 100`, [user.school_id, user.id],
    )
    const today = new Date().toISOString().slice(0, 10)
    const duties = result.rows
    const todayDuty = duties.find((duty) => duty.duty_date === today)
    return NextResponse.json({ success: true, data: {
      stats: { total: duties.length, completed: duties.filter((duty) => ['COMPLETED','CHECKED'].includes(duty.status)).length,
        pending: duties.filter((duty) => duty.status === 'PENDING').length, hasTodayDuty: Boolean(todayDuty) },
      todayDuty: todayDuty ?? null,
      upcomingDuties: duties.filter((duty) => duty.duty_date >= today).sort((a, b) => a.duty_date.localeCompare(b.duty_date)).slice(0, 3),
      className: user.class_name ?? '',
    } })
  } catch (error) {
    console.error('Failed to read PG student duties', error)
    return NextResponse.json({ success: false, error: '值日服务暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
