import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 值日签到/签退/评价
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { action, score, notes } = body
    
    if (!action) {
      return NextResponse.json({ success: false, error: '缺少操作类型' }, { status: 400 })
    }
    
    const client = getSupabaseClient()
    
    // 获取当前值日安排
    const { data: current, error: fetchError } = await client
      .from('duty_schedules')
      .select('*')
      .eq('id', id)
      .single()
    
    if (fetchError || !current) {
      return NextResponse.json({ success: false, error: '值日记录不存在' }, { status: 404 })
    }
    
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    
    switch (action.toUpperCase()) {
      case 'CHECK_IN':
        // 更新notes字段记录签到时间
        updateData.notes = (current.notes || '') + `\n[签到] ${new Date().toLocaleString('zh-CN')}`
        updateData.status = 'IN_PROGRESS'
        break
      case 'CHECK_OUT':
        // 更新notes字段记录签退时间
        updateData.notes = (current.notes || '') + `\n[签退] ${new Date().toLocaleString('zh-CN')}`
        updateData.status = 'COMPLETED'
        break
      case 'EVALUATE':
        // 评价记录在notes中
        if (score !== undefined) {
          updateData.notes = (current.notes || '') + `\n[评分] ${score}分 ${notes || ''}`
        } else if (notes) {
          updateData.notes = (current.notes || '') + `\n[备注] ${notes}`
        }
        updateData.status = 'CHECKED'
        break
      default:
        return NextResponse.json({ success: false, error: '无效的操作' }, { status: 400 })
    }
    
    const { data, error } = await client
      .from('duty_schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.log('更新失败:', error.message)
      return NextResponse.json({ success: false, error: `更新失败: ${error.message}` }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('更新值日状态失败:', error)
    return NextResponse.json({ success: false, error: '更新值日状态失败' }, { status: 500 })
  }
}

// 获取单个值日记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('duty_schedules')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      return NextResponse.json({ success: false, error: '值日记录不存在' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取值日记录失败:', error)
    return NextResponse.json({ success: false, error: '获取值日记录失败' }, { status: 500 })
  }
}

// 删除值日安排
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('duty_schedules')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json({ success: false, error: `删除失败: ${error.message}` }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除值日安排失败:', error)
    return NextResponse.json({ success: false, error: '删除值日安排失败' }, { status: 500 })
  }
}
