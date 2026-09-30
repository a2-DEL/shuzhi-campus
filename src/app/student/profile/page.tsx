'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Wrench, Calendar, Package, Bell, FileText, Shield, Building2, ChevronRight, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import { UserRole, ROLE_LABELS } from '@/types'

interface ProfileData {
  user: {
    userId: string
    name: string
    role: string
    department?: string
    className?: string
    phone?: string
    avatar?: string
  }
  repairStats: {
    total: number
    pending: number
    processing: number
    completed: number
  }
  dutyStats: {
    total: number
    completed: number
    pending: number
  }
  lostFoundStats: {
    total: number
    claimed: number
    open: number
  }
  unreadCount: number
}

export default function StudentProfilePage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/student/profile')
      const result = await response.json()
      if (result.success) {
        setProfileData(result.data)
      } else {
        setLoadError(result.error || '功能迁移中，暂时无法加载数据')
      }
    } catch (error) {
      console.error('加载个人中心失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {loadError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{loadError}</p>}
        {/* 用户信息卡片 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profileData?.user.avatar} />
                <AvatarFallback className="text-xl">
                  {profileData?.user.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{profileData?.user.name || user?.name}</h2>
                <p className="text-muted-foreground">
                  {ROLE_LABELS[user?.role as UserRole] || '学生'}
                </p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  {profileData?.user.department && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {profileData.user.department}
                    </span>
                  )}
                  {profileData?.user.className && (
                    <span>{profileData.user.className}</span>
                  )}
                </div>
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 功能菜单 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/student/repairs">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Wrench className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">报修记录</h3>
                  <p className="text-sm text-muted-foreground">
                    {loading ? '加载中...' : `${profileData?.repairStats.completed || 0} 条已完成`}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/duties">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">值日记录</h3>
                  <p className="text-sm text-muted-foreground">
                    {loading ? '加载中...' : `${profileData?.dutyStats.completed || 0} 次已完成`}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/lost-found">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Package className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">失物记录</h3>
                  <p className="text-sm text-muted-foreground">
                    {loading ? '加载中...' : `${profileData?.lostFoundStats.total || 0} 条记录`}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/messages">
            <Card className="hover:shadow-md transition-shadow cursor-pointer relative">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                  <Bell className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">消息通知</h3>
                  <p className="text-sm text-muted-foreground">
                    {loading ? '加载中...' : `${profileData?.unreadCount || 0} 条未读`}
                  </p>
                </div>
                {profileData?.unreadCount ? (
                  <Badge variant="destructive" className="absolute top-2 right-2">
                    {profileData.unreadCount}
                  </Badge>
                ) : null}
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/settings/privacy">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">隐私设置</h3>
                  <p className="text-sm text-muted-foreground">管理个人信息可见性</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/settings/agreement">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">用户协议</h3>
                  <p className="text-sm text-muted-foreground">查看用户协议和隐私政策</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* 详细信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              个人信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b">
                  <span className="text-muted-foreground">账号</span>
                  <span>{profileData?.user.userId || user?.user_id}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b">
                  <span className="text-muted-foreground">姓名</span>
                  <span>{profileData?.user.name || user?.name}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b">
                  <span className="text-muted-foreground">角色</span>
                  <span>{ROLE_LABELS[user?.role as UserRole] || '学生'}</span>
                </div>
                {profileData?.user.department && (
                  <div className="flex items-center justify-between py-3 border-b">
                    <span className="text-muted-foreground">院系</span>
                    <span>{profileData.user.department}</span>
                  </div>
                )}
                {profileData?.user.className && (
                  <div className="flex items-center justify-between py-3 border-b">
                    <span className="text-muted-foreground">班级</span>
                    <span>{profileData.user.className}</span>
                  </div>
                )}
                {profileData?.user.phone && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-muted-foreground">手机</span>
                    <span>{profileData.user.phone}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
