import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取教室详情
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
      .from('classrooms')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, error: '教室不存在' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取教室详情失败:', error)
    return NextResponse.json({ success: false, error: '获取教室详情失败' }, { status: 500 })
  }
}

// 更新教室
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
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('classrooms')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('更新教室失败:', error)
    return NextResponse.json({ success: false, error: '更新教室失败' }, { status: 500 })
  }
}

// 删除教室
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
      .from('classrooms')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: '教室已删除' })
  } catch (error) {
    console.error('删除教室失败:', error)
    return NextResponse.json({ success: false, error: '删除教室失败' }, { status: 500 })
  }
}
