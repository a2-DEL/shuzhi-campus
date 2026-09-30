import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取通知详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const user_id = searchParams.get('user_id')
    
    const client = getSupabaseClient()
    
    // 获取通知详情
    const { data: notification, error } = await client
      .from('notifications')
      .select(`
        *,
        publisher:users(id, name)
      `)
      .eq('id', id)
      .single()
    
    if (error || !notification) {
      return NextResponse.json(
        { success: false, error: '通知不存在' },
        { status: 404 }
      )
    }
    
    // 如果提供了用户ID，查询阅读状态
    let is_read = false
    if (user_id) {
      const { data: readRecord } = await client
        .from('notification_reads')
        .select('id')
        .eq('notification_id', id)
        .eq('user_id', user_id)
        .single()
      
      is_read = !!readRecord
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...notification,
        is_read,
      },
    })
  } catch (error) {
    console.error('获取通知详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取通知详情失败' },
      { status: 500 }
    )
  }
}

// 标记通知为已读
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { user_id } = body
    
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: '缺少用户ID' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    // 检查是否已标记
    const { data: existing } = await client
      .from('notification_reads')
      .select('id')
      .eq('notification_id', id)
      .eq('user_id', user_id)
      .single()
    
    if (existing) {
      return NextResponse.json({
        success: true,
        message: '已标记为已读',
      })
    }
    
    // 插入阅读记录
    const { error } = await client
      .from('notification_reads')
      .insert({
        notification_id: id,
        user_id,
        read_at: new Date().toISOString(),
      })
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: '已标记为已读',
    })
  } catch (error) {
    console.error('标记已读失败:', error)
    return NextResponse.json(
      { success: false, error: '标记已读失败' },
      { status: 500 }
    )
  }
}

// 批量标记已读
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { user_id, notification_ids } = body
    
    if (!user_id || !notification_ids || !Array.isArray(notification_ids)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    const now = new Date().toISOString()
    
    // 批量插入阅读记录（忽略已存在的）
    const records = notification_ids.map(nid => ({
      notification_id: nid,
      user_id,
      read_at: now,
    }))
    
    const { error } = await client
      .from('notification_reads')
      .upsert(records, { onConflict: 'notification_id,user_id' })
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: `已标记${notification_ids.length}条通知为已读`,
    })
  } catch (error) {
    console.error('批量标记已读失败:', error)
    return NextResponse.json(
      { success: false, error: '批量标记已读失败' },
      { status: 500 }
    )
  }
}

// 删除通知
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('notifications')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: '通知已删除',
    })
  } catch (error) {
    console.error('删除通知失败:', error)
    return NextResponse.json(
      { success: false, error: '删除通知失败' },
      { status: 500 }
    )
  }
}
