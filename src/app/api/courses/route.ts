import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取课程列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'courses', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const department = searchParams.get('department')
    const type = searchParams.get('type')
    const semester = searchParams.get('semester')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const client = getSupabaseClient()
    let query = client
      .from('courses')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (department) query = query.eq('department', department)
    if (type) query = query.eq('type', type)
    if (semester) query = query.eq('semester', semester)
    if (keyword) query = query.or(`name.ilike.%${keyword}%,course_code.ilike.%${keyword}%`)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `获取课程列表失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

// 创建课程
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'courses', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { course_code, name, credit, hours, type, department, teacher_id, semester, description } = body

    if (!course_code || !name) {
      return NextResponse.json({ success: false, error: '课程代码和名称为必填项' }, { status: 400 })
    }

    const client = getSupabaseClient()
    const { data, error } = await client
      .from('courses')
      .insert({
        course_code,
        name,
        credit: credit || 0,
        hours: hours || 0,
        type: type || 'required',
        department,
        teacher_id,
        semester,
        description,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: `创建课程失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `创建课程失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
