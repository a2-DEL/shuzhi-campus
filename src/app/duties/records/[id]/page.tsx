'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface DutyRecordDetail {
  id: string
  duty_date: string
  building: string
  floor: string
  inspector_name: string
  inspector_phone: string
  dormitory_count: number
  inspected_count: number
  passed_count: number
  failed_count: number
  status: string
  notes: string | null
  created_at: string
}

const dutyRecordStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  PENDING: { label: '待检查', variant: 'secondary' },
  IN_PROGRESS: { label: '检查中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'success' },
  CANCELLED: { label: '已取消', variant: 'destructive' },
}

export default function DutyRecordDetailPage() {
  const params = useParams()
  const [record, setRecord] = useState<DutyRecordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRecord = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<DutyRecordDetail>(`/api/duty-records/${params.id}`)
      if (response.success && response.data) {
        setRecord(response.data)
      } else {
        setError('记录不存在')
      }
    } catch {
      setError('加载记录信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadRecord()
  }, [loadRecord])

  if (!record) {
    return (
      <DetailPage
        title="值日记录详情"
        loading={loading}
        error={error}
        backUrl="/duties"
        onRefresh={loadRecord}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '检查信息',
      fields: [
        { label: '值日日期', value: record.duty_date, type: 'date' as const },
        { label: '检查区域', value: `${record.building} - ${record.floor}层` },
        { label: '检查员', value: record.inspected_count },
        { label: '联系电话', value: record.inspected_count },
        { label: '状态', value: record.status, type: 'status' as const, statusMap: dutyRecordStatusMap },
      ],
    },
    {
      title: '检查统计',
      fields: [
        { label: '应检宿舍', value: `${record.dormitory_count}间` },
        { label: '已检宿舍', value: `${record.inspected_count}间` },
        { label: '合格宿舍', value: `${record.passed_count}间` },
        { label: '不合格宿舍', value: `${record.failed_count}间` },
      ],
    },
    {
      title: '备注',
      fields: [
        { label: '检查备注', value: record.notes || '暂无备注' },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: record.created_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`值日记录详情 - ${record.duty_date}`}
      backUrl="/duties"
      onRefresh={loadRecord}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
