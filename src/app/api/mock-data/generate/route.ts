import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 生成差异化模拟数据
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'mock-data', { allowedRoles: ['super_admin'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { role, count = 10 } = body

    const client = getSupabaseClient()

    let data: unknown[] = []

    switch (role) {
      case 'student':
        data = generateStudentData(client, count)
        break
      case 'teacher':
        data = generateTeacherData(client, count)
        break
      case 'repairman':
        data = generateRepairmanData(client, count)
        break
      case 'repair':
        data = generateRepairData(client, count)
        break
      case 'duty':
        data = generateDutyData(client, count)
        break
      default:
        return NextResponse.json(
          { success: false, error: '不支持的类型' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      data,
      message: `成功生成 ${data.length} 条 ${role} 数据`,
    })
  } catch (error) {
    console.error('生成模拟数据失败:', error)
    return NextResponse.json(
      { success: false, error: '生成模拟数据失败' },
      { status: 500 }
    )
  }
}

// 生成学生数据
function generateStudentData(client: unknown, count: number) {
  const students = []
  const names = ['张', '李', '王', '赵', '陈', '刘', '杨', '黄', '周', '吴']
  const lastNames = ['三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

  for (let i = 0; i < count; i++) {
    const name = names[i % names.length] + lastNames[i % lastNames.length]
    const student = {
      user_id: `2024${String(i + 1).padStart(4, '0')}`,
      name,
      role: 'student',
      department: ['计算机学院', '外国语学院', '商学院'][i % 3],
      class_name: `2024级${i % 5 + 1}班`,
      phone: `138${String(i + 1).padStart(8, '0')}`,
      email: `student${i + 1}@campus.edu`,
      status: 'active',
      created_at: new Date().toISOString(),
    }
    students.push(student)
  }

  return students
}

// 生成教师数据
function generateTeacherData(client: unknown, count: number) {
  const teachers = []
  const titles = ['教授', '副教授', '讲师']
  const departments = ['计算机学院', '外国语学院', '商学院', '数学学院']

  for (let i = 0; i < count; i++) {
    const teacher = {
      user_id: `TEA${String(i + 1).padStart(4, '0')}`,
      name: `教师${i + 1}`,
      role: 'teacher',
      department: departments[i % departments.length],
      class_name: null,
      title: titles[i % titles.length],
      phone: `139${String(i + 1).padStart(8, '0')}`,
      email: `teacher${i + 1}@campus.edu`,
      status: 'active',
      created_at: new Date().toISOString(),
    }
    teachers.push(teacher)
  }

  return teachers
}

// 生成维修师傅数据
function generateRepairmanData(client: unknown, count: number) {
  const repairmen = []
  const specialties = ['电力维修', '水暖维修', '空调维修', '网络维修', '综合维修']

  for (let i = 0; i < count; i++) {
    const repairman = {
      user_id: `FIX${String(i + 1).padStart(4, '0')}`,
      name: `维修师傅${i + 1}`,
      role: 'repairman',
      department: '后勤服务中心',
      specialty: specialties[i % specialties.length],
      phone: `150${String(i + 1).padStart(8, '0')}`,
      email: `repair${i + 1}@campus.edu`,
      status: 'active',
      created_at: new Date().toISOString(),
    }
    repairmen.push(repairman)
  }

  return repairmen
}

// 生成报修数据
function generateRepairData(client: unknown, count: number) {
  const repairs = []
  const types = ['electrical', 'plumbing', 'air_conditioner', 'network', 'furniture', 'other']
  const locations = [
    '南校区1号宿舍楼',
    '北校区教学楼A栋',
    '图书馆三楼',
    '食堂二楼',
    '实验室B205',
  ]
  const statuses = ['PENDING', 'DISPATCHED', 'PROCESSING', 'COMPLETED', 'REJECTED']

  for (let i = 0; i < count; i++) {
    const repair = {
      order_no: `REP${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(i + 1).padStart(4, '0')}`,
      type: types[i % types.length],
      location: locations[i % locations.length] + `${(i % 10) + 1}室`,
      description: `模拟报修问题${i + 1}`,
      contact_phone: `138${String(i + 1).padStart(8, '0')}`,
      reporter_id: `2024${String(i + 1).padStart(4, '0')}`,
      reporter_name: `学生${i + 1}`,
      assignee_id: i % 2 === 0 ? `FIX${String(i + 1).padStart(4, '0')}` : null,
      status: statuses[i % statuses.length],
      priority: (i % 3) + 1,
      images: [],
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      updated_at: new Date(Date.now() - i * 3600000).toISOString(),
      is_deleted: false,
    }
    repairs.push(repair)
  }

  return repairs
}

// 生成值日数据
function generateDutyData(client: unknown, count: number) {
  const duties = []
  const weekDays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

  for (let i = 0; i < count; i++) {
    const date = new Date()
    date.setDate(date.getDate() - count + i + 1)
    const duty = {
      date: date.toISOString().split('T')[0],
      week_day: weekDays[date.getDay() === 0 ? 6 : date.getDay() - 1],
      class_id: `CLASS001`,
      students: [
        { id: `S${i * 3 + 1}`, name: `学生${i * 3 + 1}` },
        { id: `S${i * 3 + 2}`, name: `学生${i * 3 + 2}` },
        { id: `S${i * 3 + 3}`, name: `学生${i * 3 + 3}` },
      ],
      status: i % 3 === 0 ? 'pending' : 'completed',
      completed_at: i % 3 === 0 ? null : date.toISOString(),
      created_at: new Date().toISOString(),
    }
    duties.push(duty)
  }

  return duties
}
