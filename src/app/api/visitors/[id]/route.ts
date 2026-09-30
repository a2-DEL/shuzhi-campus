import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取单个访客记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'visitors', { permissions: ['visitor:check'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('visitors')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      return NextResponse.json({ success: false, error: '访客记录不存在' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取访客记录失败:', error)
    return NextResponse.json({ success: false, error: '获取访客记录失败' }, { status: 500 })
  }
}

// 访客签离
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'visitors', { permissions: ['visitor:check'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    // 获取访客记录
    const { data: visitor, error: fetchError } = await client
      .from('visitors')
      .select('*')
      .eq('id', id)
      .single()
    
    if (fetchError || !visitor) {
      return NextResponse.json({ success: false, error: '访客记录不存在' }, { status: 404 })
    }
    
    if (visitor.leave_time) {
      return NextResponse.json({ success: false, error: '该访客已签离' }, { status: 400 })
    }
    
    const { data, error } = await client
      .from('visitors')
      .update({ leave_time: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ success: false, error: `签离失败: ${error.message}` }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('访客签离失败:', error)
    return NextResponse.json({ success: false, error: '访客签离失败' }, { status: 500 })
  }
}

// 删除访客记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'visitors', { permissions: ['visitor:check'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('visitors')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json({ success: false, error: `删除失败: ${error.message}` }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除访客记录失败:', error)
    return NextResponse.json({ success: false, error: '删除访客记录失败' }, { status: 500 })
  }
}
