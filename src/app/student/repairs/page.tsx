'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, Plus, Clock, CheckCircle, XCircle, FileText } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/stores'

interface RepairOrder {
  id: string
  title: string
  damage_type: string
  location: string
  status: string
  priority: string
  created_at: string
  completed_at?: string
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success'; icon: React.ReactNode }> = {
  PENDING: { label: '待派单', variant: 'secondary', icon: <Clock className="h-4 w-4" /> },
  DISPATCHED: { label: '已派单', variant: 'default', icon: <Clock className="h-4 w-4" /> },
  PROCESSING: { label: '处理中', variant: 'default', icon: <Wrench className="h-4 w-4" /> },
  COMPLETED: { label: '已完成', variant: 'success', icon: <CheckCircle className="h-4 w-4" /> },
  CLOSED: { label: '已关闭', variant: 'outline', icon: <CheckCircle className="h-4 w-4" /> },
  REJECTED: { label: '已拒单', variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
}

const priorityLabels: Record<string, string> = {
  '1': '紧急',
  '2': '普通',
  '3': '低',
}

export default function StudentRepairsPage() {
  const { user } = useAuthStore()
  const [repairs, setRepairs] = useState<RepairOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, pending: 0, processing: 0, completed: 0 })

  const loadRepairs = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/student/repair-progress')
      const result = await response.json()
      if (result.success) {
        setRepairs(result.data.recentRepairs || [])
        setStats(result.data.stats || { total: 0, pending: 0, processing: 0, completed: 0 })
      } else {
        setLoadError(result.error || '功能迁移中，暂时无法加载数据')
      }
    } catch (error) {
      console.error('加载报修列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRepairs()
  }, [loadRepairs])

  const filteredRepairs = repairs.filter(repair => {
    if (activeTab === 'all') return true
    if (activeTab === 'pending') return repair.status === 'PENDING' || repair.status === 'DISPATCHED'
    if (activeTab === 'processing') return repair.status === 'PROCESSING'
    if (activeTab === 'completed') return repair.status === 'COMPLETED' || repair.status === 'CLOSED'
    return true
  })

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">我的报修</h1>
            <p className="text-muted-foreground">查看和管理您的报修工单</p>
          </div>
          <Link href="/student/repair/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              提交报修
            </Button>
          </Link>
        </div>

        {loadError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{loadError}</p>}
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-700">{stats.total}</p>
              <p className="text-sm text-muted-foreground">全部工单</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">待处理</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.processing}</p>
              <p className="text-sm text-muted-foreground">处理中</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">已完成</p>
            </CardContent>
          </Card>
        </div>

        {/* 筛选标签 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="pending">待处理</TabsTrigger>
            <TabsTrigger value="processing">处理中</TabsTrigger>
            <TabsTrigger value="completed">已完成</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : filteredRepairs.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">暂无报修记录</p>
                    <Link href="/student/repair/create">
                      <Button variant="link" className="mt-2">立即报修</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredRepairs.map(repair => {
                      const statusInfo = statusConfig[repair.status] || statusConfig.PENDING
                      return (
                        <Link
                          key={repair.id}
                          href={`/repairs/${repair.id}`}
                          className="block p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium truncate">{repair.title}</h3>
                                <Badge variant={statusInfo.variant} className="gap-1">
                                  {statusInfo.icon}
                                  {statusInfo.label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {repair.damage_type} · {repair.location}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                提交时间：{formatDate(repair.created_at)}
                              </p>
                            </div>
                            <div className="text-right ml-4">
                              <Badge variant="outline">
                                {priorityLabels[repair.priority] || '普通'}
                              </Badge>
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
    </MainLayout>
  )
}
