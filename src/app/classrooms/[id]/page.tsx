'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface ClassroomDetail {
  id: string
  name: string
  building: string
  floor: number
  capacity: number
  type: string
  status: string
  equipment: string[]
  description?: string
  created_at: string
}

const classroomTypeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  lecture: { label: '普通教室', variant: 'default' },
  multimedia: { label: '多媒体教室', variant: 'secondary' },
  computer: { label: '计算机教室', variant: 'outline' },
  lab: { label: '实验室', variant: 'outline' },
  conference: { label: '会议室', variant: 'secondary' },
}

const classroomStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  available: { label: '可用', variant: 'success' },
  occupied: { label: '占用中', variant: 'default' },
  maintenance: { label: '维护中', variant: 'destructive' },
  disabled: { label: '禁用', variant: 'secondary' },
}

export default function ClassroomDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadClassroom = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<ClassroomDetail>(`/api/classrooms/${params.id}`)
      if (response.success && response.data) {
        setClassroom(response.data)
      } else {
        setError('教室不存在')
      }
    } catch {
      setError('加载教室信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadClassroom()
  }, [loadClassroom])

  if (!classroom) {
    return (
      <DetailPage
        title="教室详情"
        loading={loading}
        error={error}
        backUrl="/classrooms"
        onRefresh={loadClassroom}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '教室名称', value: classroom.name },
        { label: '教学楼', value: classroom.building },
        { label: '楼层', value: classroom.floor },
        { label: '教室类型', value: classroom.type, type: 'status' as const, statusMap: classroomTypeMap },
        { label: '状态', value: classroom.status, type: 'status' as const, statusMap: classroomStatusMap },
      ],
    },
    {
      title: '容量信息',
      fields: [
        { label: '座位容量', value: `${classroom.capacity}人` },
      ],
    },
    {
      title: '设备信息',
      fields: [
        { label: '设备列表', value: classroom.equipment?.join('、') || '-' },
        { label: '描述', value: classroom.description },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: classroom.created_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`教室详情 - ${classroom.name}`}
      backUrl="/classrooms"
      onRefresh={loadClassroom}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
