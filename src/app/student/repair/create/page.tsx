'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wrench, MapPin, Loader2 } from 'lucide-react'

const repairTypes = [
  { value: 'desk_chair', label: '桌椅' },
  { value: 'lighting', label: '照明' },
  { value: 'air_conditioner', label: '空调' },
  { value: 'network', label: '网络' },
  { value: 'plumbing', label: '水暖' },
  { value: 'electrical', label: '电气' },
  { value: 'furniture', label: '家具' },
  { value: 'door_lock', label: '门锁' },
  { value: 'other', label: '其他' },
]

const priorities = [
  { value: '2', label: '普通' },
  { value: '1', label: '紧急' },
  { value: '3', label: '低' },
]

export default function CreateRepairPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    type: '',
    damage_type: '',
    location: '',
    description: '',
    priority: '2',
    contact_phone: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          damage_type: formData.type || 'other',
          location: formData.location,
          description: formData.description,
          priority: formData.priority,
          contact_phone: formData.contact_phone,
        }),
      })

      const result = await response.json()
      if (response.status === 401) {
        alert('请先登录')
        router.push('/login')
      } else if (response.ok && result.success) {
        router.push('/student/repairs')
      } else {
        alert(result.error || '提交失败')
      }
    } catch (error) {
      console.error('提交报修失败:', error)
      alert('提交失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">提交报修</h1>
          <p className="text-muted-foreground">填写报修信息，维修人员将尽快处理</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-600" />
              报修信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">报修标题 *</Label>
                <Input
                  id="title"
                  placeholder="请输入报修标题"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>报修类型 *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择报修类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {repairTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_phone">联系电话</Label>
                  <Input
                    id="contact_phone"
                    placeholder="请输入联系电话"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">故障位置 *</Label>
                <div className="flex gap-2">
                  <MapPin className="h-10 w-10 text-muted-foreground" />
                  <Input
                    id="location"
                    placeholder="如：南校区2103教室 第3排第5座"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>优先级</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">故障描述</Label>
                <Textarea
                  id="description"
                  placeholder="请详细描述故障情况"
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  提交报修
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
