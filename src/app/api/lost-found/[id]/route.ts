import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取失物招领详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'lost-found', { permissions: ['lost:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('lost_found')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      return NextResponse.json(
        { success: false, error: '记录不存在' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('获取失物招领详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取失物招领详情失败' },
      { status: 500 }
    )
  }
}

// 认领物品
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'lost-found', { permissions: ['lost:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { action, claimer_id } = body
    
    const client = getSupabaseClient()
    
    if (action === 'claim') {
      // 认领物品
      const { data: item, error: fetchError } = await client
        .from('lost_found')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchError || !item) {
        return NextResponse.json(
          { success: false, error: '记录不存在' },
          { status: 404 }
        )
      }
      
      if (item.status === 'claimed') {
        return NextResponse.json(
          { success: false, error: '该物品已被认领' },
          { status: 400 }
        )
      }
      
      const { error } = await client
        .from('lost_found')
        .update({
          status: 'claimed',
          claimer_id,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      
      if (error) {
        return NextResponse.json(
          { success: false, error: `认领失败: ${error.message}` },
          { status: 500 }
        )
      }
      
      return NextResponse.json({
        success: true,
        message: '认领成功',
      })
    }
    
    if (action === 'match') {
      // 标记为已匹配
      const { error } = await client
        .from('lost_found')
        .update({
          status: 'matched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      
      if (error) {
        return NextResponse.json(
          { success: false, error: `标记失败: ${error.message}` },
          { status: 500 }
        )
      }
      
      return NextResponse.json({
        success: true,
        message: '已标记为匹配',
      })
    }
    
    return NextResponse.json(
      { success: false, error: '无效的操作' },
      { status: 400 }
    )
  } catch (error) {
    console.error('操作失败:', error)
    return NextResponse.json(
      { success: false, error: '操作失败' },
      { status: 500 }
    )
  }
}

// 删除记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'lost-found', { permissions: ['lost:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('lost_found')
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
      message: '删除成功',
    })
  } catch (error) {
    console.error('删除记录失败:', error)
    return NextResponse.json(
      { success: false, error: '删除记录失败' },
      { status: 500 }
    )
  }
}
