import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 简单的密码哈希函数
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'campus_platform_salt_2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'init', { allowedRoles: ['super_admin'] })
  if (legacyResponse) return legacyResponse

  try {
    const client = getSupabaseClient()
    const defaultPassword = '123456'
    const passwordHash = await hashPassword(defaultPassword)

    // 测试用户数据 - 按照新标准
    const testUsers = [
      { user_id: 'admin', name: '系统管理员', role: 'super_admin', department: '现教中心', status: 'active', phone: '13800000001' },
      { user_id: 'dept', name: '院系管理员', role: 'dept_admin', department: '数计学院', status: 'active', phone: '13800000002' },
      { user_id: 'counselor', name: '辅导员王老师', role: 'counselor', department: '数计学院', status: 'active', phone: '13800000003' },
      { user_id: 'logistics', name: '后勤负责人', role: 'logistics_manager', department: '后勤处', status: 'active', phone: '13800000004' },
      { user_id: 'dorm', name: '宿管负责人', role: 'dorm_manager', department: '宿管中心', status: 'active', phone: '13800000005' },
      // 学生
      { user_id: '2024010101', name: '张三', role: 'student', department: '数计学院', class_name: '24级计算机科学与技术专业1班', status: 'active', phone: '13900000001' },
      { user_id: '2024010102', name: '李四', role: 'student', department: '数计学院', class_name: '24级计算机科学与技术专业1班', status: 'active', phone: '13900000002' },
      { user_id: '2024010103', name: '王五', role: 'student', department: '数计学院', class_name: '24级计算机科学与技术专业1班', status: 'active', phone: '13900000003' },
      // 班委
      { user_id: '2024010104', name: '赵六', role: 'class_committee', department: '数计学院', class_name: '24级计算机科学与技术专业1班', status: 'active', phone: '13900000004' },
      // 维修人员
      { user_id: 'FIX001', name: '维修师傅张', role: 'repairman', department: '后勤处', status: 'active', phone: '13800000101' },
      { user_id: 'FIX002', name: '维修师傅李', role: 'repairman', department: '后勤处', status: 'active', phone: '13800000102' },
    ]

    // 插入用户
    const usersToInsert = testUsers.map(user => ({
      ...user,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const { data: existingUsers } = await client.from('users').select('user_id')
    const existingUserIds = new Set(existingUsers?.map(u => u.user_id) || [])
    const newUsers = usersToInsert.filter(u => !existingUserIds.has(u.user_id))

    if (newUsers.length > 0) {
      await client.from('users').insert(newUsers)
    }

    // 插入教室数据 - 按新规范命名
    const { data: existingClassrooms } = await client.from('classrooms').select('id')
    if (!existingClassrooms?.length) {
      const classrooms = []
      const campuses = ['南校区', '北校区']
      const buildingNumbers = ['1', '2', '3', '4', '5']
      const floors = [1, 2, 3, 4, 5]
      
      for (const campus of campuses) {
        for (const building of buildingNumbers) {
          for (const floor of floors) {
            // 每层6-10个教室
            const roomsOnFloor = Math.floor(Math.random() * 5) + 6
            for (let room = 1; room <= roomsOnFloor; room++) {
              const roomNum = room.toString().padStart(2, '0')
              classrooms.push({
                campus,
                building: `${building}号楼`,
                floor,
                room_number: roomNum,
                full_name: `${campus}${building}${floor.toString().padStart(2, '0')}${roomNum}`,
                capacity: 40 + Math.floor(Math.random() * 40),
                status: 'available',
                facilities: ['投影仪', '空调', '多媒体'],
                created_at: new Date().toISOString(),
              })
            }
          }
        }
      }
      
      await client.from('classrooms').insert(classrooms)
    }

    // 插入通知数据
    const { data: existingNotifications } = await client.from('notifications').select('id')
    if (!existingNotifications?.length) {
      const notifications = [
        {
          title: '关于2024年寒假放假安排的通知',
          content: '根据学校安排，2024年寒假放假时间为1月15日至2月25日，请各位同学注意假期安全。',
          type: 'SYSTEM',
          publisher_id: (await client.from('users').select('id').eq('user_id', 'admin').maybeSingle()).data?.id || '',
          status: 'published',
          created_at: new Date().toISOString(),
        },
        {
          title: '期末考试安排公告',
          content: '期末考试将于1月8日至12日进行，请同学们做好复习准备。',
          type: 'EXAM',
          publisher_id: (await client.from('users').select('id').eq('user_id', 'dept').maybeSingle()).data?.id || '',
          status: 'published',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          title: '元旦晚会活动通知',
          content: '学院将于12月31日举办元旦晚会，欢迎同学们积极参加。',
          type: 'ACTIVITY',
          publisher_id: (await client.from('users').select('id').eq('user_id', 'counselor').maybeSingle()).data?.id || '',
          status: 'published',
          created_at: new Date(Date.now() - 172800000).toISOString(),
        },
        {
          title: '报修工单处理完成提醒',
          content: '您的报修工单（REP20240116001）已处理完成，请确认。',
          type: 'REPAIR',
          publisher_id: (await client.from('users').select('id').eq('user_id', 'logistics').maybeSingle()).data?.id || '',
          status: 'published',
          created_at: new Date(Date.now() - 259200000).toISOString(),
        },
      ]
      
      await client.from('notifications').insert(notifications)
    }

    // 插入报修工单数据
    const { data: existingRepairs } = await client.from('repair_orders').select('id')
    if (!existingRepairs?.length) {
      const studentId = (await client.from('users').select('id').eq('user_id', '2024010101').maybeSingle()).data?.id
      const repairmanId = (await client.from('users').select('id').eq('user_id', 'FIX001').maybeSingle()).data?.id
      
      const repairs = [
        {
          title: '教室桌椅损坏报修',
          damage_type: '桌椅晃动',
          location: '南校区2103教室 第3排',
          description: '教室第三排桌椅晃动严重，影响正常使用。',
          reporter_id: studentId || '',
          assignee_id: repairmanId,
          status: 'PROCESSING',
          priority: '2',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          title: '照明灯不亮',
          damage_type: '座板脱落',
          location: '北校区3102教室',
          description: '靠窗位置日光灯不亮。',
          reporter_id: studentId || '',
          status: 'PENDING',
          priority: '2',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          title: '空调故障报修',
          damage_type: '座板下垂',
          location: '南校区1105教室',
          description: '空调制冷效果不佳。',
          reporter_id: studentId || '',
          assignee_id: repairmanId,
          status: 'COMPLETED',
          priority: '1',
          completed_at: new Date().toISOString(),
          created_at: new Date(Date.now() - 604800000).toISOString(),
        },
      ]
      
      await client.from('repair_orders').insert(repairs)
    }

    // 插入失物招领数据
    const { data: existingLostFound } = await client.from('lost_found').select('id')
    if (!existingLostFound?.length) {
      const studentId = (await client.from('users').select('id').eq('user_id', '2024010101').maybeSingle()).data?.id
      
      const lostFoundItems = [
        {
          type: 'found',
          item_type: '书',
          item_name: '《高等数学》教材',
          description: '在图书馆三楼拾得，绿色封面。',
          location: '图书馆三楼',
          found_date: new Date().toISOString().split('T')[0],
          reporter_id: studentId || '',
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          type: 'lost',
          item_type: '证件',
          item_name: '学生证',
          description: '学生证丢失，卡套是蓝色。',
          location: '食堂',
          found_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          reporter_id: studentId || '',
          status: 'open',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          type: 'found',
          item_type: '书包',
          item_name: '黑色双肩包',
          description: '在教学楼拾得。',
          location: '教学楼A座',
          found_date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
          reporter_id: studentId || '',
          status: 'claimed',
          created_at: new Date(Date.now() - 172800000).toISOString(),
        },
      ]
      
      await client.from('lost_found').insert(lostFoundItems)
    }

    // 插入值日安排数据
    const { data: existingDuties } = await client.from('duty_schedules').select('id')
    if (!existingDuties?.length) {
      const duties = [
        {
          duty_date: new Date().toISOString().split('T')[0],
          class_name: '24级计算机科学与技术专业1班',
          location: '南校区2号楼',
          students: ['张三', '李四', '王五'],
          duty_type: 'cleaning',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        {
          duty_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          class_name: '24级计算机科学与技术专业1班',
          location: '南校区2号楼',
          students: ['赵六', '孙七'],
          duty_type: 'cleaning',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        {
          duty_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          class_name: '24级计算机科学与技术专业1班',
          location: '南校区2号楼',
          students: ['张三', '李四'],
          duty_type: 'cleaning',
          status: 'completed',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]
      
      await client.from('duty_schedules').insert(duties)
    }

    return NextResponse.json({
      success: true,
      message: '初始化完成',
      users: newUsers.length > 0 ? newUsers.map(u => ({ user_id: u.user_id, name: u.name, role: u.role, password: '123456' })) : [],
    })
  } catch (error) {
    console.error('初始化错误:', error)
    return NextResponse.json({ success: false, error: '初始化失败' }, { status: 500 })
  }
}
