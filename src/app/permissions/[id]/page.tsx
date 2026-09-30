'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface RoleDetail {
  id: string
  name: string
  code: string
  description: string | null
  status: string
  permissions: string[]
  user_count: number
  created_at: string
  updated_at: string
}

const roleStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  ACTIVE: { label: '正常', variant: 'success' },
  DISABLED: { label: '禁用', variant: 'destructive' },
}

export default function RoleDetailPage() {
  const params = useParams()
  const [role, setRole] = useState<RoleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRole = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<RoleDetail>(`/api/permissions/roles?role=${params.id}`)
      if (response.success && response.data) {
        setRole(response.data)
      } else {
        setError('角色不存在')
      }
    } catch {
      setError('加载角色信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadRole()
  }, [loadRole])

  if (!role) {
    return (
      <DetailPage
        title="角色详情"
        loading={loading}
        error={error}
        backUrl="/permissions"
        onRefresh={loadRole}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '角色名称', value: role.name },
        { label: '角色编码', value: role.code },
        { label: '状态', value: role.status, type: 'status' as const, statusMap: roleStatusMap },
      ],
    },
    {
      title: '角色描述',
      fields: [
        { label: '描述', value: role.description || '暂无描述' },
      ],
    },
    {
      title: '使用情况',
      fields: [
        { label: '关联用户数', value: `${role.user_count}人` },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: role.created_at, type: 'date' as const },
        { label: '更新时间', value: role.updated_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`角色详情 - ${role.name}`}
      backUrl="/permissions"
      onRefresh={loadRole}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
