'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'
import { User } from '@/types'


const roleStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  super_admin: { label: '超级管理员', variant: 'destructive' },
  dept_admin: { label: '院系管理员', variant: 'default' },
  counselor: { label: '辅导员', variant: 'secondary' },
  logistics_manager: { label: '后勤负责人', variant: 'default' },
  logistics_admin: { label: '后勤管理员', variant: 'secondary' },
  dorm_manager: { label: '宿管负责人', variant: 'default' },
  dorm_keeper: { label: '宿管员', variant: 'secondary' },
  repairman: { label: '维修员', variant: 'outline' },
  student: { label: '学生', variant: 'outline' },
  teacher: { label: '教师', variant: 'outline' },
}

const userStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  active: { label: '正常', variant: 'success' },
  disabled: { label: '禁用', variant: 'destructive' },
  pending: { label: '待审核', variant: 'secondary' },
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUser = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<User>(`/api/users/${params.id}`)
      if (response.success && response.data) {
        setUser(response.data)
      } else {
        setError('用户不存在')
      }
    } catch {
      setError('加载用户信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const handleDelete = async () => {
    if (!confirm('确定要删除该用户吗？')) return
    
    try {
      const response = await api.delete(`/api/users/${params.id}`)
      if (response.success) {
        router.push('/users')
      } else {
        alert(response.error || '删除失败')
      }
    } catch {
      alert('删除失败')
    }
  }

  if (!user) {
    return (
      <DetailPage
        title="用户详情"
        loading={loading}
        error={error}
        backUrl="/users"
        onRefresh={loadUser}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '用户ID', value: user.user_id },
        { label: '姓名', value: user.name },
        { label: '角色', value: user.role, type: 'status' as const, statusMap: roleStatusMap },
        { label: '状态', value: user.status, type: 'status' as const, statusMap: userStatusMap },
      ],
    },
    {
      title: '联系信息',
      fields: [
        { label: '手机号', value: user.phone },
        { label: '邮箱', value: user.email },
        { label: '部门/学院', value: user.department },
        { label: '班级', value: user.class_name },
      ],
    },
    {
      title: '其他信息',
      fields: [
        { label: '创建时间', value: user.created_at, type: 'date' as const },
        { label: '更新时间', value: user.updated_at, type: 'date' as const },
        { label: '最后登录', value: user.last_login_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`用户详情 - ${user.name}`}
      backUrl="/users"
      onDelete={handleDelete}
      onRefresh={loadUser}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
