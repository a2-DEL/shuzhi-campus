'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, MapPin, CheckCircle, Clock } from 'lucide-react'

interface DutySchedule {
  id: string
  duty_date: string
  class_name: string
  location: string
  students: string[]
  duty_type: string
  status: string
  created_at: string
}

const dutyTypeLabels: Record<string, string> = {
  cleaning: '清洁值日',
  inspection: '检查值日',
}

export default function StudentDutiesPage() {
  const [duties, setDuties] = useState<DutySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, hasTodayDuty: false })

  const loadDuties = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/student/duty-service')
      const result = await response.json()
      if (result.success) {
        setDuties(result.data.upcomingDuties || [])
        setStats(result.data.stats || { total: 0, completed: 0, pending: 0, hasTodayDuty: false })
      } else {
        setLoadError(result.error || '功能迁移中，暂时无法加载数据')
      }
    } catch (error) {
      console.error('加载值日列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDuties()
  }, [loadDuties])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    
    if (dateStr === today) return '今天'
    
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
    if (dateStr === tomorrow) return '明天'
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">我的值日</h1>
          <p className="text-muted-foreground">查看值日安排和记录</p>
        </div>

        {loadError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{loadError}</p>}
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-700">{stats.total}</p>
              <p className="text-sm text-muted-foreground">总安排数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">待完成</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">已完成</p>
            </CardContent>
          </Card>
          <Card className={stats.hasTodayDuty ? 'bg-green-50' : ''}>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.hasTodayDuty ? '是' : '否'}</p>
              <p className="text-sm text-muted-foreground">今日值日</p>
            </CardContent>
          </Card>
        </div>

        {/* 值日列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              值日安排
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : duties.length === 0 ? (
              <div className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">暂无值日安排</p>
              </div>
            ) : (
              <div className="space-y-4">
                {duties.map(duty => (
                  <div
                    key={duty.id}
                    className={`p-4 rounded-lg border ${
                      duty.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={duty.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : ''}>
                            {duty.status === 'completed' ? (
                              <><CheckCircle className="h-3 w-3 mr-1" /> 已完成</>
                            ) : (
                              <><Clock className="h-3 w-3 mr-1" /> 待完成</>
                            )}
                          </Badge>
                          <Badge variant="outline">
                            {dutyTypeLabels[duty.duty_type] || duty.duty_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(duty.duty_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {duty.location}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
