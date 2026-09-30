import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取课程表（排课信息）
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'schedules', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const class_id = searchParams.get('class_id')
    const course_id = searchParams.get('course_id')
    const teacher_id = searchParams.get('teacher_id')
    const semester = searchParams.get('semester')

    const client = getSupabaseClient()
    let query = client
      .from('course_schedules')
      .select('*, courses(name, course_code, credit), classes(name, class_code)')
      .order('day_of_week', { ascending: true })
      .order('start_period', { ascending: true })

    if (class_id) query = query.eq('class_id', class_id)
    if (course_id) query = query.eq('course_id', course_id)
    if (teacher_id) query = query.eq('teacher_id', teacher_id)
    if (semester) query = query.eq('semester', semester)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `获取课程表失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

// 创建排课记录
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'schedules', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { course_id, class_id, classroom_id, teacher_id, day_of_week, start_period, end_period, semester, notes } = body

    if (!course_id || !class_id || !day_of_week || !start_period || !end_period || !semester) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 })
    }

    const client = getSupabaseClient()
    const { data, error } = await client
      .from('course_schedules')
      .insert({ course_id, class_id, classroom_id, teacher_id, day_of_week, start_period, end_period, semester, notes })
      .select('*, courses(name, course_code), classes(name, class_code)')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: `创建排课记录失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `创建排课记录失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
