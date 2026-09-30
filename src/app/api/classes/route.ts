import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取班级列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classes', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const department = searchParams.get('department')
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const client = getSupabaseClient()
    let query = client
      .from('classes')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (department) query = query.eq('department', department)
    if (grade) query = query.eq('grade', grade)
    if (keyword) query = query.or(`name.ilike.%${keyword}%,class_code.ilike.%${keyword}%`)

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
      { success: false, error: `获取班级列表失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

// 创建班级
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classes', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { class_code, name, grade, department, major, head_teacher_id, student_count, classroom_id } = body

    if (!class_code || !name) {
      return NextResponse.json({ success: false, error: '班级代码和名称为必填项' }, { status: 400 })
    }

    const client = getSupabaseClient()
    const { data, error } = await client
      .from('classes')
      .insert({
        class_code,
        name,
        grade,
        department,
        major,
        head_teacher_id,
        student_count: student_count || 0,
        classroom_id,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: `创建班级失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `创建班级失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
