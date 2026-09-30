'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Wrench, Calendar, Bell, Clock } from 'lucide-react'

interface MessageDetail {
  id: string
  title: string
  content: string
  type: string
  publisherName?: string
  publishAt?: string
  created_at: string
  isRead: boolean
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EXAM: { label: '考试通知', icon: <FileText className="h-5 w-5" />, color: 'bg-red-100 text-red-700' },
  REPAIR: { label: '报修通知', icon: <Wrench className="h-5 w-5" />, color: 'bg-blue-100 text-blue-700' },
  ACTIVITY: { label: '活动通知', icon: <Calendar className="h-5 w-5" />, color: 'bg-green-100 text-green-700' },
  SYSTEM: { label: '系统通知', icon: <Bell className="h-5 w-5" />, color: 'bg-gray-100 text-gray-700' },
}

export default function MessageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [message, setMessage] = useState<MessageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMessage = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<MessageDetail>(`/api/student/messages/${params.id}`)
      if (response.success && response.data) {
        setMessage({
          ...response.data,
          isRead: true // 详情页默认已读
        })
      } else {
        setError('消息不存在')
      }
    } catch (err) {
      setError('加载失败')
      console.error('加载消息详情失败:', err)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadMessage()
  }, [loadMessage])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/4 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mt-4" />
            <Skeleton className="h-4 w-full mt-2" />
            <Skeleton className="h-4 w-2/3 mt-2" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !message) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error || '消息不存在'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const config = typeConfig[message.type] || typeConfig.SYSTEM

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回消息列表
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${config.color}`}>
              {config.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className={config.color}>
                  {config.label}
                </Badge>
              </div>
              <CardTitle className="text-xl">{message.title}</CardTitle>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDate(message.created_at)}
                </span>
                {message.publisherName && (
                  <span>发布人：{message.publisherName}</span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            <p className="whitespace-pre-wrap text-base leading-relaxed">
              {message.content}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
