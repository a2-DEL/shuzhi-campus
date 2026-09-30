import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取单个课程详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'courses', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('courses')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `获取课程详情失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

// 更新课程
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'courses', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const client = getSupabaseClient()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const allowedFields = ['course_code', 'name', 'credit', 'hours', 'type', 'department', 'teacher_id', 'semester', 'description', 'status']
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }

    const { data, error } = await client
      .from('courses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `更新课程失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}

// 删除课程（软删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'courses', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    const { error } = await client
      .from('courses')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: '课程已删除' })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `删除课程失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
