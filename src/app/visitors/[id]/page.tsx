'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface VisitorDetail {
  id: string
  visitor_name: string
  visitor_phone: string
  visitor_id_card: string
  host_student_id: string
  host_student_name: string
  host_room: string
  reason: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
}

const visitorStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  REGISTERED: { label: '已登记', variant: 'secondary' },
  CHECKED_IN: { label: '已签入', variant: 'default' },
  CHECKED_OUT: { label: '已离开', variant: 'success' },
  CANCELLED: { label: '已取消', variant: 'destructive' },
  EXPIRED: { label: '已过期', variant: 'outline' },
}

export default function VisitorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [visitor, setVisitor] = useState<VisitorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadVisitor = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<VisitorDetail>(`/api/visitors/${params.id}`)
      if (response.success && response.data) {
        setVisitor(response.data)
      } else {
        setError('访客记录不存在')
      }
    } catch {
      setError('加载访客信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadVisitor()
  }, [loadVisitor])

  if (!visitor) {
    return (
      <DetailPage
        title="访客详情"
        loading={loading}
        error={error}
        backUrl="/visitors"
        onRefresh={loadVisitor}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '访客信息',
      fields: [
        { label: '访客姓名', value: visitor.visitor_name },
        { label: '联系电话', value: visitor.visitor_phone },
        { label: '身份证号', value: visitor.visitor_id_card },
        { label: '来访事由', value: visitor.reason },
        { label: '状态', value: visitor.status, type: 'status' as const, statusMap: visitorStatusMap },
      ],
    },
    {
      title: '被访人信息',
      fields: [
        { label: '被访学生', value: visitor.host_student_name },
        { label: '学生学号', value: visitor.host_student_id },
        { label: '宿舍位置', value: visitor.host_room },
      ],
    },
    {
      title: '时间记录',
      fields: [
        { label: '登记时间', value: visitor.created_at, type: 'date' as const },
        { label: '签入时间', value: visitor.check_in_time, type: 'date' as const },
        { label: '签离时间', value: visitor.check_out_time, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`访客详情 - ${visitor.visitor_name}`}
      backUrl="/visitors"
      onRefresh={loadVisitor}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
