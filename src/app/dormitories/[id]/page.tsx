'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface DormitoryDetail {
  id: string
  campus: string
  building: string
  floor: number
  room_number: string
  full_name: string
  capacity: number
  occupied: number
  status: string
  type: string
  created_at: string
}

const dormitoryStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  normal: { label: '正常', variant: 'success' },
  maintenance: { label: '维护中', variant: 'default' },
  full: { label: '已满员', variant: 'secondary' },
  disabled: { label: '禁用', variant: 'destructive' },
}

const dormitoryTypeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  male: { label: '男生宿舍', variant: 'default' },
  female: { label: '女生宿舍', variant: 'secondary' },
  mixed: { label: '混合宿舍', variant: 'outline' },
}

export default function DormitoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [dormitory, setDormitory] = useState<DormitoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDormitory = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<DormitoryDetail>(`/api/dormitories/${params.id}`)
      if (response.success && response.data) {
        setDormitory(response.data)
      } else {
        setError('宿舍不存在')
      }
    } catch {
      setError('加载宿舍信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadDormitory()
  }, [loadDormitory])

  if (!dormitory) {
    return (
      <DetailPage
        title="宿舍详情"
        loading={loading}
        error={error}
        backUrl="/dormitories"
        onRefresh={loadDormitory}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '校区', value: dormitory.campus },
        { label: '楼栋', value: dormitory.building },
        { label: '楼层', value: dormitory.floor },
        { label: '房间号', value: dormitory.room_number },
        { label: '宿舍名称', value: dormitory.full_name },
      ],
    },
    {
      title: '宿舍信息',
      fields: [
        { label: '宿舍类型', value: dormitory.type, type: 'status' as const, statusMap: dormitoryTypeMap },
        { label: '状态', value: dormitory.status, type: 'status' as const, statusMap: dormitoryStatusMap },
        { label: '床位容量', value: `${dormitory.capacity}人` },
        { label: '已入住', value: `${dormitory.occupied}人` },
        { label: '空余床位', value: `${dormitory.capacity - dormitory.occupied}人` },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: dormitory.created_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`宿舍详情 - ${dormitory.full_name}`}
      backUrl="/dormitories"
      onRefresh={loadDormitory}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
