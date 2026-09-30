import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 值日状态
export const DutyStatus = {
  PENDING: 'PENDING',     // 待完成
  IN_PROGRESS: 'IN_PROGRESS', // 进行中
  COMPLETED: 'COMPLETED', // 已完成
  CHECKED: 'CHECKED',    // 已检查
} as const

// 获取值日安排列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const duty_date = searchParams.get('duty_date')
    const status = searchParams.get('status')
    const class_name = searchParams.get('class_name')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('duty_schedules')
      .select('*', { count: 'exact' })
      .order('duty_date', { ascending: true })
    
    if (duty_date) {
      query = query.eq('duty_date', duty_date)
    }
    if (status) {
      query = query.eq('status', status.toUpperCase())
    }
    if (class_name) {
      query = query.eq('class_name', class_name)
    }
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, error, count } = await query.range(from, to)
    
    if (error) {
      console.log('数据库查询失败:', error.message)
      return NextResponse.json({
        success: true,
        data: {
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        },
      })
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
    console.error('获取值日列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取值日列表失败' },
      { status: 500 }
    )
  }
}

// 创建值日安排
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { duty_date, class_name, location, students, duty_type, notes } = body
    
    if (!duty_date || !class_name) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    const newDuty = {
      id: crypto.randomUUID(),
      duty_date,
      class_name,
      location: location || '',
      students: students ? JSON.stringify(students) : '[]',
      duty_type: duty_type || 'class',
      status: DutyStatus.PENDING,
      notes: notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('duty_schedules')
      .insert(newDuty)
      .select()
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建值日安排失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建值日安排失败:', error)
    return NextResponse.json(
      { success: false, error: '创建值日安排失败' },
      { status: 500 }
    )
  }
}
