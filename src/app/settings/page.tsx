'use client'

import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings, Bell, Shield, Database, Save } from 'lucide-react'

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-500">配置系统参数和功能选项</p>
          <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 font-medium text-amber-900">演示模拟界面，暂不支持修改配置。以下选项与备份操作均不会生效，请勿用于生产环境。</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">
              <Settings className="h-4 w-4 mr-2" />
              基础设置
            </TabsTrigger>
            <TabsTrigger value="notification">
              <Bell className="h-4 w-4 mr-2" />
              通知设置
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              安全设置
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database className="h-4 w-4 mr-2" />
              数据管理
            </TabsTrigger>
          </TabsList>

          {/* 基础设置 */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>基础设置</CardTitle>
                <CardDescription>配置系统基本信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>系统名称</Label>
                      <Input disabled defaultValue="数智星图校园服务平台" />
                    </div>
                    <div className="space-y-2">
                      <Label>系统简称</Label>
                      <Input disabled defaultValue="数智星图" />
                    </div>
                    <div className="space-y-2">
                      <Label>系统版本</Label>
                      <Input disabled defaultValue="v1.0.0" />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>学校名称</Label>
                      <Input disabled defaultValue="示例大学" />
                    </div>
                    <div className="space-y-2">
                      <Label>学校代码</Label>
                      <Input disabled defaultValue="12345" />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>深色模式</Label>
                        <p className="text-sm text-gray-500">启用深色主题</p>
                      </div>
                      <Switch disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>系统维护模式</Label>
                        <p className="text-sm text-gray-500">启用后用户无法访问系统</p>
                      </div>
                      <Switch disabled />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通知设置 */}
          <TabsContent value="notification">
            <Card>
              <CardHeader>
                <CardTitle>通知设置</CardTitle>
                <CardDescription>配置系统通知和消息推送</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>邮件通知</Label>
                      <p className="text-sm text-gray-500">重要操作发送邮件通知</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>短信通知</Label>
                      <p className="text-sm text-gray-500">紧急事项发送短信通知</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>微信推送</Label>
                      <p className="text-sm text-gray-500">通过微信小程序推送消息</p>
                    </div>
                    <Switch disabled />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>系统公告</Label>
                      <p className="text-sm text-gray-500">在首页显示系统公告轮播</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>SMTP服务器</Label>
                    <Input disabled placeholder="smtp.example.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>发件邮箱</Label>
                      <Input disabled type="email" placeholder="noreply@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>邮箱端口</Label>
                      <Input disabled type="number" placeholder="465" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 安全设置 */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>安全设置</CardTitle>
                <CardDescription>配置系统安全策略</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>强制修改初始密码</Label>
                      <p className="text-sm text-gray-500">用户首次登录必须修改密码</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>密码复杂度要求</Label>
                      <p className="text-sm text-gray-500">密码必须包含字母、数字和特殊字符</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>登录失败锁定</Label>
                      <p className="text-sm text-gray-500">连续登录失败后锁定账号</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>双因素认证</Label>
                      <p className="text-sm text-gray-500">启用双因素身份验证</p>
                    </div>
                    <Switch disabled />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>密码最小长度</Label>
                    <Input disabled type="number" defaultValue="8" />
                  </div>
                  <div className="space-y-2">
                    <Label>密码有效期（天）</Label>
                    <Input disabled type="number" defaultValue="90" />
                  </div>
                  <div className="space-y-2">
                    <Label>登录失败次数限制</Label>
                    <Input disabled type="number" defaultValue="5" />
                  </div>
                  <div className="space-y-2">
                    <Label>账号锁定时间（分钟）</Label>
                    <Input disabled type="number" defaultValue="30" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 数据管理 */}
          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle>数据管理</CardTitle>
                <CardDescription>数据备份与恢复设置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>自动备份</Label>
                      <p className="text-sm text-gray-500">定期自动备份数据库</p>
                    </div>
                    <Switch disabled defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>保留备份数量</Label>
                      <p className="text-sm text-gray-500">自动删除超过数量的旧备份</p>
                    </div>
                    <Select disabled defaultValue="10">
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5份</SelectItem>
                        <SelectItem value="10">10份</SelectItem>
                        <SelectItem value="20">20份</SelectItem>
                        <SelectItem value="30">30份</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">最近备份</p>
                      <p className="text-sm text-gray-500">2024-01-15 02:00:00</p>
                    </div>
                    <Button disabled variant="outline">下载备份</Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">数据库大小</p>
                      <p className="text-sm text-gray-500">256 MB</p>
                    </div>
                    <Button disabled variant="outline">立即备份</Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>恢复数据</Label>
                    <div className="flex gap-2">
                      <Input disabled type="file" className="flex-1" />
                      <Button disabled variant="outline">选择文件</Button>
                    </div>
                    <p className="text-xs text-gray-500">请选择备份文件进行恢复，恢复操作将覆盖当前数据</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
