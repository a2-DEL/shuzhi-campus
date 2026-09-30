'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageSquare, Bell, FileText, Wrench, Calendar } from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: string
  title: string
  content: string
  type: string
  isRead: boolean
  created_at: string
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EXAM: { label: '考试通知', icon: <FileText className="h-4 w-4" />, color: 'bg-red-100 text-red-700' },
  REPAIR: { label: '报修通知', icon: <Wrench className="h-4 w-4" />, color: 'bg-blue-100 text-blue-700' },
  ACTIVITY: { label: '活动通知', icon: <Calendar className="h-4 w-4" />, color: 'bg-green-100 text-green-700' },
  SYSTEM: { label: '系统通知', icon: <Bell className="h-4 w-4" />, color: 'bg-gray-100 text-gray-700' },
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingRead, setMarkingRead] = useState<string | null>(null)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const type = activeTab === 'all' ? undefined : activeTab
      const response = await api.get<{ messages: Message[]; unreadCount: number }>(
        `/api/student/messages?${type ? `type=${type}` : ''}`
      )
      if (response.success && response.data) {
        setMessages(response.data.messages)
        setUnreadCount(response.data.unreadCount)
      } else {
        setLoadError(response.error || '消息功能迁移中，暂时无法加载')
      }
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const markAsRead = async (messageId: string) => {
    setMarkingRead(messageId)
    try {
      const result = await api.post('/api/student/messages/read', { notificationId: messageId })
      if (!result.success) return
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, isRead: true } : m))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('标记已读失败:', error)
    } finally {
      setMarkingRead(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">消息中心</h1>
          <p className="text-muted-foreground">查看系统通知和消息</p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {unreadCount} 条未读
          </Badge>
        )}
      </div>

      {loadError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{loadError}</p>}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            全部
          </TabsTrigger>
          <TabsTrigger value="EXAM" className="gap-2">
            <FileText className="h-4 w-4" />
            考试
          </TabsTrigger>
          <TabsTrigger value="REPAIR" className="gap-2">
            <Wrench className="h-4 w-4" />
            报修
          </TabsTrigger>
          <TabsTrigger value="ACTIVITY" className="gap-2">
            <Calendar className="h-4 w-4" />
            活动
          </TabsTrigger>
          <TabsTrigger value="SYSTEM" className="gap-2">
            <Bell className="h-4 w-4" />
            系统
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">消息列表</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无消息</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map(message => {
                    const config = typeConfig[message.type] || typeConfig.SYSTEM
                    return (
                      <Link
                        key={message.id}
                        href={`/messages/${message.id}`}
                        className={`block p-4 rounded-lg transition-colors ${
                          message.isRead
                            ? 'bg-muted/50 hover:bg-muted'
                            : 'bg-blue-50/50 hover:bg-blue-50'
                        }`}
                        onClick={() => !message.isRead && markAsRead(message.id)}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-full ${config.color}`}>
                            {config.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className={`font-medium truncate ${!message.isRead && 'font-semibold'}`}>
                                {message.title}
                              </h3>
                              {!message.isRead && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {message.content}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${config.color}`}>
                                {config.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(message.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
