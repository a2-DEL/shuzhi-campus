'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Wrench,
  Calendar,
  Package,
  Bell,
  Clock,
  ArrowRight,
  FileText,
  CheckCircle,
  AlertCircle,
  Building2,
  User,
  LogOut,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import { UserRole, ROLE_LABELS } from '@/types'

interface RepairProgress {
  stats: {
    total: number
    pending: number
    processing: number
    completed: number
  }
  recentRepairs: Array<{
    id: string
    title: string
    status: string
    damage_type: string
    created_at: string
  }>
}

interface DutyService {
  stats: {
    total: number
    completed: number
    pending: number
    hasTodayDuty: boolean
  }
  todayDuty?: {
    duty_date: string
    duty_type: string
    location: string
  }
  upcomingDuties: Array<{
    id: string
    duty_date: string
    duty_type: string
    location: string
  }>
  className: string
}

interface MessageSummary {
  unreadCount: number
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  PENDING: { label: '待派单', variant: 'secondary' },
  DISPATCHED: { label: '已派单', variant: 'default' },
  PROCESSING: { label: '处理中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'success' },
  CLOSED: { label: '已关闭', variant: 'outline' },
  REJECTED: { label: '已拒单', variant: 'destructive' },
}

export default function StudentDashboard() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(null)
  const [dutyService, setDutyService] = useState<DutyService | null>(null)
  const [messageSummary, setMessageSummary] = useState<MessageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [repairRes, dutyRes, messageRes] = await Promise.all([
        fetch('/api/student/repair-progress').then(r => r.json()),
        fetch('/api/student/duty-service').then(r => r.json()),
        fetch('/api/student/messages?pageSize=1').then(r => r.json()),
      ])

      if (repairRes.success) setRepairProgress(repairRes.data)
      if (dutyRes.success) setDutyService(dutyRes.data)
      if (messageRes.success) setMessageSummary({ unreadCount: messageRes.data.unreadCount })
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 欢迎栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">欢迎回来，{user?.name || '同学'}</h1>
            <p className="text-muted-foreground">
              {user?.department || ''} {user?.class_name || ''} · {ROLE_LABELS[user?.role as UserRole] || '学生'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              <User className="h-3 w-3 mr-1" />
              {user?.user_id}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              退出
            </Button>
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/student/repair/create">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
                  <Wrench className="h-6 w-6" />
                </div>
                <p className="font-medium">提交报修</p>
                <p className="text-xs text-muted-foreground">故障设备报修</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/repairs">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-2">
                  <FileText className="h-6 w-6" />
                </div>
                <p className="font-medium">报修进度</p>
                <p className="text-xs text-muted-foreground">查看工单状态</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/messages">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center relative">
                <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-2">
                  <Bell className="h-6 w-6" />
                </div>
                <p className="font-medium">消息通知</p>
                <p className="text-xs text-muted-foreground">
                  {messageSummary?.unreadCount ? `${messageSummary.unreadCount}条未读` : '查看通知'}
                </p>
                {messageSummary?.unreadCount ? (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {messageSummary.unreadCount > 9 ? '9+' : messageSummary.unreadCount}
                  </span>
                ) : null}
              </CardContent>
            </Card>
          </Link>

          <Link href="/lost-found">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-2">
                  <Package className="h-6 w-6" />
                </div>
                <p className="font-medium">失物招领</p>
                <p className="text-xs text-muted-foreground">寻物/招领发布</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 报修进度 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-blue-600" />
                报修进度
              </CardTitle>
              <Link href="/student/repairs">
                <Button variant="ghost" size="sm">
                  查看全部 <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-700">{repairProgress?.stats.total || 0}</p>
                      <p className="text-xs text-muted-foreground">全部工单</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">{repairProgress?.stats.pending || 0}</p>
                      <p className="text-xs text-muted-foreground">待处理</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{repairProgress?.stats.completed || 0}</p>
                      <p className="text-xs text-muted-foreground">已完成</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {repairProgress?.recentRepairs?.length ? (
                      repairProgress.recentRepairs.map(repair => (
                        <Link
                          key={repair.id}
                          href={`/repairs/${repair.id}`}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{repair.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {repair.damage_type} · {formatDate(repair.created_at)}
                            </p>
                          </div>
                          <Badge variant={statusConfig[repair.status]?.variant || 'secondary'}>
                            {statusConfig[repair.status]?.label || repair.status}
                          </Badge>
                        </Link>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>暂无报修记录</p>
                        <Link href="/student/repair/create">
                          <Button variant="link" size="sm" className="mt-2">立即报修</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 值日服务 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-green-600" />
                值日服务
              </CardTitle>
              <Link href="/student/duties">
                <Button variant="ghost" size="sm">
                  查看全部 <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <>
                  {dutyService?.stats?.hasTodayDuty && (
                    <div className="p-4 bg-green-50 rounded-lg mb-4">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">今日值日</span>
                      </div>
                      {dutyService.todayDuty && (
                        <p className="mt-1 text-sm text-green-600">
                          {dutyService.todayDuty.location} · {dutyService.todayDuty.duty_type === 'cleaning' ? '清洁值日' : '检查值日'}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">近期值日安排</h4>
                    {dutyService?.upcomingDuties?.length ? (
                      dutyService.upcomingDuties.map(duty => (
                        <div
                          key={duty.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{duty.location}</p>
                            <p className="text-xs text-muted-foreground">
                              {duty.duty_type === 'cleaning' ? '清洁值日' : '检查值日'}
                            </p>
                          </div>
                          <Badge variant="outline">{formatDate(duty.duty_date)}</Badge>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>暂无值日安排</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 宿舍信息（如果有） */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" />
                宿舍信息
              </CardTitle>
              <span className="text-xs text-amber-700">功能迁移中，暂不提供详情</span>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>宿舍信息</p>
                <p className="text-sm">功能开发中...</p>
              </div>
            </CardContent>
          </Card>

          {/* 快捷操作 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                快捷操作
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/student/repair/create">
                  <Button variant="outline" className="w-full justify-start">
                    <Wrench className="h-4 w-4 mr-2" />
                    提交报修
                  </Button>
                </Link>
                <Link href="/classrooms">
                  <Button variant="outline" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    教室预约
                  </Button>
                </Link>
                <Link href="/lost-found">
                  <Button variant="outline" className="w-full justify-start">
                    <Package className="h-4 w-4 mr-2" />
                    失物招领
                  </Button>
                </Link>
                <Link href="/messages">
                  <Button variant="outline" className="w-full justify-start">
                    <Bell className="h-4 w-4 mr-2" />
                    消息中心
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
