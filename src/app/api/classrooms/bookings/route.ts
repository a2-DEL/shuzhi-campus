import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 教室预约状态
export const ClassroomBookingStatus = {
  PENDING: 'PENDING',     // 待审批
  APPROVED: 'APPROVED',  // 已批准
  REJECTED: 'REJECTED',  // 已拒绝
  CANCELLED: 'CANCELLED', // 已取消
} as const

// 获取教室预约列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const classroom_id = searchParams.get('classroom_id')
    const applicant_id = searchParams.get('applicant_id')
    const status = searchParams.get('status')
    const booking_date = searchParams.get('booking_date')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('classroom_bookings')
      .select('*, classrooms(full_name, room_number, building, capacity)', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (classroom_id) {
      query = query.eq('classroom_id', classroom_id)
    }
    
    if (applicant_id) {
      query = query.eq('applicant_id', applicant_id)
    }
    
    if (status) {
      query = query.eq('status', status.toUpperCase())
    }
    
    if (booking_date) {
      query = query.eq('booking_date', booking_date)
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
    
    // 格式化返回数据
    const formattedData = (data || []).map(item => ({
      id: item.id,
      classroom_id: item.classroom_id,
      classroom_name: item.classrooms?.full_name || item.classrooms?.room_number || '未知教室',
      classroom_building: item.classrooms?.building || '',
      classroom_capacity: item.classrooms?.capacity || 0,
      applicant_id: item.applicant_id,
      booking_date: item.booking_date,
      time_slot: item.time_slot,
      purpose: item.purpose,
      status: item.status,
      reviewer_id: item.reviewer_id,
      review_note: item.review_note,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))
    
    return NextResponse.json({
      success: true,
      data: {
        data: formattedData,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error) {
    console.error('获取预约列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取预约列表失败' },
      { status: 500 }
    )
  }
}

// 创建教室预约
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const {
      classroom_id,
      applicant_id,
      booking_date,
      time_slot,
      purpose,
      department,
    } = body
    
    if (!classroom_id || !applicant_id) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    // 检查是否与其他预约冲突
    const { data: existingBookings } = await client
      .from('classroom_bookings')
      .select('id')
      .eq('classroom_id', classroom_id)
      .eq('booking_date', booking_date)
      .eq('time_slot', time_slot)
      .neq('status', 'REJECTED')
    
    if (existingBookings && existingBookings.length > 0) {
      return NextResponse.json(
        { success: false, error: '该时间段已被预约' },
        { status: 400 }
      )
    }
    
    const newBooking = {
      id: crypto.randomUUID(),
      classroom_id,
      applicant_id,
      booking_date: booking_date || new Date().toISOString().split('T')[0],
      time_slot: time_slot || '08:00-10:00',
      purpose: purpose || '',
      status: ClassroomBookingStatus.PENDING,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('classroom_bookings')
      .insert(newBooking)
      .select('*, classrooms(full_name, room_number, building, capacity)')
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建预约失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        classroom_id: data.classroom_id,
        classroom_name: data.classrooms?.full_name || data.classrooms?.room_number || '未知教室',
        applicant_id: data.applicant_id,
        booking_date: data.booking_date,
        time_slot: data.time_slot,
        purpose: data.purpose,
        status: data.status,
        created_at: data.created_at,
      },
    })
  } catch (error) {
    console.error('创建预约失败:', error)
    return NextResponse.json(
      { success: false, error: '创建预约失败' },
      { status: 500 }
    )
  }
}
