import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取预约详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('classroom_bookings')
      .select('*, classrooms(name, building, capacity)')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      return NextResponse.json(
        { success: false, error: '预约不存在' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        classroom_name: data.classrooms?.full_name || data.classrooms?.room_number || '未知教室',
      },
    })
  } catch (error) {
    console.error('获取预约详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取预约详情失败' },
      { status: 500 }
    )
  }
}

// 审批/取消预约
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { action, operator_id, reason } = body
    
    if (!action) {
      return NextResponse.json(
        { success: false, error: '缺少操作类型' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    // 获取预约信息
    const { data: booking, error: fetchError } = await client
      .from('classroom_bookings')
      .select('*')
      .eq('id', id)
      .single()
    
    if (fetchError || !booking) {
      return NextResponse.json(
        { success: false, error: '预约不存在' },
        { status: 404 }
      )
    }
    
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    
    // 状态值统一使用大写
    switch (action.toUpperCase()) {
      case 'APPROVE':
        if (booking.status !== 'PENDING') {
          return NextResponse.json(
            { success: false, error: '只能审批待审核的预约' },
            { status: 400 }
          )
        }
        updateData.status = 'APPROVED'
        updateData.reviewer_id = operator_id || 'system'
        updateData.review_note = reason || ''
        break
        
      case 'REJECT':
        if (booking.status !== 'PENDING') {
          return NextResponse.json(
            { success: false, error: '只能拒绝待审核的预约' },
            { status: 400 }
          )
        }
        updateData.status = 'REJECTED'
        updateData.reviewer_id = operator_id || 'system'
        updateData.review_note = reason || '不符合使用规定'
        break
        
      case 'CANCEL':
        if (!['PENDING', 'APPROVED'].includes(booking.status)) {
          return NextResponse.json(
            { success: false, error: '当前状态无法取消' },
            { status: 400 }
          )
        }
        updateData.status = 'CANCELLED'
        updateData.reviewer_id = operator_id || 'system'
        updateData.review_note = reason || '用户取消'
        break
        
      default:
        return NextResponse.json(
          { success: false, error: '无效的操作' },
          { status: 400 }
        )
    }
    
    // 更新预约
    const { data, error } = await client
      .from('classroom_bookings')
      .update(updateData)
      .eq('id', id)
      .select('*, classrooms(full_name, building, capacity)')
      .single()
    
    if (error) {
      console.log('更新失败:', error.message)
      return NextResponse.json(
        { success: false, error: `操作失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        classroom_name: data.classrooms?.full_name || data.classrooms?.room_number || '未知教室',
      },
    })
  } catch (error) {
    console.error('操作失败:', error)
    return NextResponse.json(
      { success: false, error: '操作失败' },
      { status: 500 }
    )
  }
}

// 删除预约
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('classroom_bookings')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json(
        { success: false, error: `删除失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: '预约已删除',
    })
  } catch (error) {
    console.error('删除预约失败:', error)
    return NextResponse.json(
      { success: false, error: '删除预约失败' },
      { status: 500 }
    )
  }
}
