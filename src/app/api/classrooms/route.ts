import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取教室列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const campus = searchParams.get('campus')
    const building = searchParams.get('building')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('classrooms')
      .select('*', { count: 'exact' })
      .order('full_name', { ascending: true })
    
    if (campus) {
      query = query.eq('campus', campus)
    }
    if (building) {
      query = query.eq('building', building)
    }
    if (status) {
      query = query.eq('status', status)
    }
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, error, count } = await query.range(from, to)
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
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
    console.error('获取教室列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取教室列表失败' },
      { status: 500 }
    )
  }
}

// 创建教室
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'classrooms', { permissions: ['classroom:book'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const {
      campus,
      building,
      floor,
      room_number,
      capacity,
      facilities,
      status = 'available',
    } = body
    
    if (!campus || !building || floor === undefined || !room_number) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    // 生成完整名称：校区 + 楼号 + 楼层 + 教室号
    // 如：南校区二号楼一层03教室 = 南校区2103
    const fullName = `${campus}${building}${floor}${room_number}`
    
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('classrooms')
      .insert({
        campus,
        building,
        floor,
        room_number,
        full_name: fullName,
        capacity: capacity || 50,
        facilities: facilities || [],
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建教室失败:', error)
    return NextResponse.json(
      { success: false, error: '创建教室失败' },
      { status: 500 }
    )
  }
}
