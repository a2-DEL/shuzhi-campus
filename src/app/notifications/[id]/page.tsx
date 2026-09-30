'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface NotificationDetail {
  id: string
  title: string
  content: string
  type: string
  category: string
  priority: string
  target: string
  status: string
  view_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

const notificationTypeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  announcement: { label: '公告', variant: 'default' },
  notice: { label: '通知', variant: 'secondary' },
  urgent: { label: '紧急通知', variant: 'destructive' },
}

const notificationStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  published: { label: '已发布', variant: 'success' },
  archived: { label: '已归档', variant: 'outline' },
}

const priorityMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  high: { label: '高', variant: 'destructive' },
  normal: { label: '普通', variant: 'default' },
  low: { label: '低', variant: 'secondary' },
}

export default function NotificationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [notification, setNotification] = useState<NotificationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNotification = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<NotificationDetail>(`/api/notifications/${params.id}`)
      if (response.success && response.data) {
        setNotification(response.data)
      } else {
        setError('通知不存在')
      }
    } catch {
      setError('加载通知信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadNotification()
  }, [loadNotification])

  if (!notification) {
    return (
      <DetailPage
        title="通知详情"
        loading={loading}
        error={error}
        backUrl="/notifications"
        onRefresh={loadNotification}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '标题', value: notification.title },
        { label: '类型', value: notification.type, type: 'status' as const, statusMap: notificationTypeMap },
        { label: '状态', value: notification.status, type: 'status' as const, statusMap: notificationStatusMap },
        { label: '优先级', value: notification.priority, type: 'status' as const, statusMap: priorityMap },
      ],
    },
    {
      title: '内容信息',
      fields: [
        { label: '通知内容', value: notification.content },
        { label: '分类', value: notification.category },
        { label: '发布对象', value: notification.target },
        { label: '阅读量', value: notification.view_count },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: notification.created_at, type: 'date' as const },
        { label: '发布时间', value: notification.published_at, type: 'date' as const },
        { label: '更新时间', value: notification.updated_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`通知详情 - ${notification.title}`}
      backUrl="/notifications"
      onRefresh={loadNotification}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
