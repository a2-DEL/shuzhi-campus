'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface DutyDetail {
  id: string
  date: string
  area: string
  assigned_user_id: string
  assigned_user_name: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  score: number | null
  remark: string | null
  created_at: string
}

const dutyStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  pending: { label: '待执行', variant: 'secondary' },
  in_progress: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'outline' },
}

export default function DutyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [duty, setDuty] = useState<DutyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDuty = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<DutyDetail>(`/api/duties/${params.id}`)
      if (response.success && response.data) {
        setDuty(response.data)
      } else {
        setError('值日记录不存在')
      }
    } catch {
      setError('加载值日信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadDuty()
  }, [loadDuty])

  if (!duty) {
    return (
      <DetailPage
        title="值日详情"
        loading={loading}
        error={error}
        backUrl="/duties"
        onRefresh={loadDuty}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '任务信息',
      fields: [
        { label: '值日日期', value: duty.date },
        { label: '值日区域', value: duty.area },
        { label: '任务状态', value: duty.status, type: 'status' as const, statusMap: dutyStatusMap },
      ],
    },
    {
      title: '执行人员',
      fields: [
        { label: '值日人员', value: duty.assigned_user_name },
        { label: '人员ID', value: duty.assigned_user_id },
      ],
    },
    {
      title: '执行记录',
      fields: [
        { label: '签到时间', value: duty.check_in_time, type: 'date' as const },
        { label: '签退时间', value: duty.check_out_time, type: 'date' as const },
        { label: '评分', value: duty.score ? `${duty.score}分` : '-' },
        { label: '备注', value: duty.remark },
      ],
    },
    {
      title: '其他信息',
      fields: [
        { label: '创建时间', value: duty.created_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`值日详情 - ${duty.date} ${duty.area}`}
      backUrl="/duties"
      onRefresh={loadDuty}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
