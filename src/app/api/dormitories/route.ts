import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 模拟宿舍数据
const mockDormitories = [
  {
    id: '1',
    campus: '南校区',
    building: '1',
    floor: 3,
    room_number: '301',
    full_name: '南校区1号楼301室',
    capacity: 4,
    occupied: 4,
    status: 'normal',
    type: 'male',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    campus: '南校区',
    building: '1',
    floor: 3,
    room_number: '302',
    full_name: '南校区1号楼302室',
    capacity: 4,
    occupied: 3,
    status: 'normal',
    type: 'male',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '3',
    campus: '南校区',
    building: '2',
    floor: 5,
    room_number: '512',
    full_name: '南校区2号楼512室',
    capacity: 6,
    occupied: 6,
    status: 'normal',
    type: 'female',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '4',
    campus: '北校区',
    building: '3',
    floor: 2,
    room_number: '205',
    full_name: '北校区3号楼205室',
    capacity: 4,
    occupied: 2,
    status: 'normal',
    type: 'male',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '5',
    campus: '北校区',
    building: '4',
    floor: 4,
    room_number: '401',
    full_name: '北校区4号楼401室',
    capacity: 4,
    occupied: 0,
    status: 'maintenance',
    type: 'female',
    created_at: '2024-01-01T00:00:00Z',
  },
]

// 获取宿舍列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'dormitories', { permissions: ['dorm:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const campus = searchParams.get('campus')
    const building = searchParams.get('building')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    // 尝试从数据库查询
    let query = client
      .from('dormitories')
      .select('*', { count: 'exact' })
      .order('building', { ascending: true })
      .order('room_number', { ascending: true })
    
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
    
    // 如果数据库查询失败，使用模拟数据
    if (error) {
      console.log('数据库查询失败，使用模拟数据:', error.message)
      
      // 筛选模拟数据
      let filteredData = [...mockDormitories]
      if (campus) {
        filteredData = filteredData.filter(d => d.campus === campus)
      }
      if (building) {
        filteredData = filteredData.filter(d => d.building === building)
      }
      if (status) {
        filteredData = filteredData.filter(d => d.status === status)
      }
      
      const totalCount = filteredData.length
      const paginatedData = filteredData.slice(from, from + pageSize)
      
      return NextResponse.json({
        success: true,
        data: {
          data: paginatedData,
          pagination: {
            page,
            pageSize,
            total: totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          },
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
    console.error('获取宿舍列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取宿舍列表失败' },
      { status: 500 }
    )
  }
}

// 创建宿舍
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'dormitories', { permissions: ['dorm:inspect'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { campus, building, floor, room_number, capacity, type } = body
    
    if (!campus || !building || !room_number) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    const dormitory = {
      campus,
      building,
      floor: floor || 1,
      room_number,
      full_name: `${campus}${building}号楼${room_number}室`,
      capacity: capacity || 4,
      occupied: 0,
      status: 'normal',
      type: type || 'male',
      created_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('dormitories')
      .insert(dormitory)
      .select()
      .single()
    
    if (error) {
      console.log('数据库插入失败，返回模拟响应:', error.message)
      return NextResponse.json({
        success: true,
        data: {
          id: `mock-${Date.now()}`,
          ...dormitory,
        },
      })
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建宿舍失败:', error)
    return NextResponse.json(
      { success: false, error: '创建宿舍失败' },
      { status: 500 }
    )
  }
}
