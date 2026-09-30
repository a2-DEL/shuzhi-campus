import './assert-isolated-test-environment.mjs'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 简单的密码哈希函数
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'campus_platform_salt_2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function seedUsers() {
  const client = getSupabaseClient()
  
  // 测试用户数据
  const testUsers = [
    {
      user_id: 'admin',
      name: '系统管理员',
      role: 'super_admin',
      department: '现教中心',
      status: 'active',
      phone: '13800000001',
      email: 'admin@campus.edu',
    },
    {
      user_id: 'dept',
      name: '院系管理员',
      role: 'dept_admin',
      department: '数计学院',
      status: 'active',
      phone: '13800000002',
      email: 'dept@campus.edu',
    },
    {
      user_id: 'counselor',
      name: '辅导员',
      role: 'counselor',
      department: '数计学院',
      status: 'active',
      phone: '13800000003',
      email: 'counselor@campus.edu',
    },
    {
      user_id: 'logistics',
      name: '后勤负责人',
      role: 'logistics_manager',
      department: '后勤处',
      status: 'active',
      phone: '13800000004',
      email: 'logistics@campus.edu',
    },
    {
      user_id: 'dorm',
      name: '宿管负责人',
      role: 'dorm_manager',
      department: '宿管中心',
      status: 'active',
      phone: '13800000005',
      email: 'dorm@campus.edu',
    },
    {
      user_id: '2024001',
      name: '张三',
      role: 'student',
      department: '数计学院',
      class_name: '24级计算机专业1班',
      status: 'active',
      phone: '13800000006',
    },
  ]

  // 默认密码
  const defaultPassword = '123456'
  const passwordHash = await hashPassword(defaultPassword)

  // 批量插入用户
  const usersToInsert = testUsers.map(user => ({
    ...user,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  // 先检查是否已存在
  const { data: existingUsers } = await client
    .from('users')
    .select('user_id')

  const existingUserIds = new Set(existingUsers?.map(u => u.user_id) || [])
  
  // 只插入不存在的用户
  const newUsers = usersToInsert.filter(u => !existingUserIds.has(u.user_id))

  if (newUsers.length > 0) {
    const { error } = await client
      .from('users')
      .insert(newUsers)

    if (error) {
      console.error('插入测试用户失败:', error)
      return false
    }
    
    console.log(`已插入 ${newUsers.length} 个测试用户`)
  } else {
    console.log('测试用户已存在，跳过初始化')
  }

  return true
}

// 运行初始化
if (typeof window === 'undefined') {
  seedUsers()
    .then(() => console.log('用户数据初始化完成'))
    .catch(err => console.error('初始化失败:', err))
}
