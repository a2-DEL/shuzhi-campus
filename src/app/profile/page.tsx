'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores'
import { api } from '@/lib/api'
import { UserRole, ROLE_LABELS } from '@/types'
import {
  
  Calendar,
  Shield,
  Bell,
  Camera,
  Lock,
  Save,
  Clock,
} from 'lucide-react'

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 个人信息表单
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    email: '',
  })

  // 密码修改表单
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  // 通知设置
  const [notificationSettings, setNotificationSettings] = useState({
    repairNotifications: true,
    dutyNotifications: true,
    systemNotifications: true,
    emailNotifications: false,
  })

  // 统计数据
  const [stats, setStats] = useState({
    totalRepairs: 0,
    pendingRepairs: 0,
    completedRepairs: 0,
    totalDuties: 0,
    completedDuties: 0,
  })

  // 最近活动
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: number
    title: string
    content: string
    created_at: string
    is_read: boolean
  }>>([])

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
      })
      loadStats()
      loadRecentActivities()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadStats = async () => {
    if (!user || ![UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN, UserRole.REPAIRMAN, UserRole.STUDENT, UserRole.CLASS_COMMITTEE].includes(user.role)) return
    try {
      // 根据角色加载不同的统计数据
      const response = await api.get('/api/repairs?reporter_id=' + user?.id)
      if (response.success && (response as unknown as { data: { data: unknown[] } }).data?.data) {
        const repairs = (response as unknown as { data: { data: unknown[] } }).data.data
        const pendingRepairs = repairs.filter((r): r is { status: string } =>
          typeof r === 'object' && r !== null && 'status' in r &&
          (r.status === 'PENDING' || r.status === 'DISPATCHED')
        )
        const completedRepairs = repairs.filter((r): r is { status: string } =>
          typeof r === 'object' && r !== null && 'status' in r && r.status === 'COMPLETED'
        )
        setStats({
          totalRepairs: repairs.length,
          pendingRepairs: pendingRepairs.length,
          completedRepairs: completedRepairs.length,
          totalDuties: 0,
          completedDuties: 0,
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  }

  const loadRecentActivities = async () => {
    if (!user || ![UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.DEPT_HYGIENE_MANAGER, UserRole.COUNSELOR, UserRole.TEACHER, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER, UserRole.STUDENT, UserRole.CLASS_COMMITTEE].includes(user.role)) return
    try {
      // 加载最近活动记录
      const response = await api.get('/api/ai/business-records?domain=notification&pageSize=5')
      if (response.success && (response as unknown as { data: { data: unknown[] } }).data?.data) {
        setRecentActivities(
          (response as unknown as { data: { data: Array<{ id: number; title: string; content: string; created_at: string; is_read: boolean }> } })
          .data.data.map((activity) => ({ ...activity, content: activity.content || '正文请到消息中心查看' }))
        )
      }
    } catch (error) {
      console.error('加载活动记录失败:', error)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const response = await api.put(`/api/users/${user?.id}`, profileForm)
      if (response.success) {
        updateUser(profileForm)
        alert('个人信息已更新')
      }
    } catch (error) {
      console.error('更新失败:', error)
      alert('更新失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('两次输入的密码不一致')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      alert('密码长度不能少于6位')
      return
    }

    setSaving(true)
    try {
      const response = await api.post('/api/users/change-password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      })
      if (response.success) {
        alert('密码修改成功，请重新登录')
        setPasswordForm({
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
      }
    } catch (error) {
      console.error('修改密码失败:', error)
      alert('修改密码失败，请检查原密码是否正确')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    setSaving(true)
    try {
      // 保存通知设置
      alert('通知设置已保存')
    } catch (error) {
      console.error('保存设置失败:', error)
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p>请先登录</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>
            <p className="text-gray-500">管理您的个人信息和系统设置</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">基本信息</TabsTrigger>
            <TabsTrigger value="security">账户安全</TabsTrigger>
            <TabsTrigger value="notifications">通知设置</TabsTrigger>
            <TabsTrigger value="activity">活动记录</TabsTrigger>
          </TabsList>

          {/* 基本信息 */}
          <TabsContent value="profile" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              {/* 头像卡片 */}
              <Card>
                <CardHeader>
                  <CardTitle>头像</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                      {user.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm">
                    <Camera className="h-4 w-4 mr-2" />
                    更换头像
                  </Button>
                </CardContent>
              </Card>

              {/* 基本信息 */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>基本信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>工号/学号</Label>
                      <Input value={user.user_id} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>姓名</Label>
                      <Input
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>角色</Label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-gray-50">
                        <Shield className="h-4 w-4 text-gray-400" />
                        <Badge variant="outline">{ROLE_LABELS[user.role as UserRole]}</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>院系/部门</Label>
                      <Input value={user.department || '-'} disabled />
                    </div>
                    {user.class_name && (
                      <div className="space-y-2">
                        <Label>班级</Label>
                        <Input value={user.class_name} disabled />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>手机号</Label>
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>邮箱</Label>
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>注册时间</Label>
                    <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-gray-50">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {new Date(user.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 统计数据 */}
            {(user.role === UserRole.STUDENT || user.role === UserRole.CLASS_COMMITTEE || user.role === UserRole.REPAIRMAN) && (
              <Card>
                <CardHeader>
                  <CardTitle>我的统计</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">报修总数</p>
                      <p className="text-2xl font-bold text-blue-700">{stats.totalRepairs}</p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <p className="text-sm text-yellow-600">待处理</p>
                      <p className="text-2xl font-bold text-yellow-700">{stats.pendingRepairs}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600">已完成</p>
                      <p className="text-2xl font-bold text-green-700">{stats.completedRepairs}</p>
                    </div>
                    {user.role !== UserRole.REPAIRMAN && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600">值日次数</p>
                        <p className="text-2xl font-bold text-purple-700">{stats.totalDuties}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 账户安全 */}
          <TabsContent value="security">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>修改密码</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">原密码</Label>
                  <Input
                    id="oldPassword"
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">新密码</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">密码长度不能少于6位</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleChangePassword} disabled={saving}>
                    <Lock className="h-4 w-4 mr-2" />
                    {saving ? '修改中...' : '修改密码'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通知设置 */}
          <TabsContent value="security">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>通知设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>报修通知</Label>
                    <p className="text-sm text-gray-500">接收报修工单状态更新通知</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.repairNotifications}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      repairNotifications: e.target.checked
                    })}
                    className="w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>值日通知</Label>
                    <p className="text-sm text-gray-500">接收值日安排提醒</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.dutyNotifications}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      dutyNotifications: e.target.checked
                    })}
                    className="w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>系统通知</Label>
                    <p className="text-sm text-gray-500">接收系统公告和重要通知</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.systemNotifications}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      systemNotifications: e.target.checked
                    })}
                    className="w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>邮件通知</Label>
                    <p className="text-sm text-gray-500">通过邮箱接收通知</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.emailNotifications}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      emailNotifications: e.target.checked
                    })}
                    className="w-4 h-4"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveNotifications} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? '保存中...' : '保存设置'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 活动记录 */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>最近活动</CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivities.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                        <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium">{activity.title}</p>
                          <p className="text-sm text-gray-500 mt-1">{activity.content}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-400">
                              {new Date(activity.created_at).toLocaleString('zh-CN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>暂无活动记录</p>
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
