'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Package, Plus, Calendar } from 'lucide-react'
import Link from 'next/link'
import { LOST_FOUND_TYPES } from '@/types'

interface LostFoundItem {
  id: string
  type: string
  item_type: string
  item_name: string
  description?: string
  location?: string
  found_date?: string
  status: string
  isOwner: boolean
  created_at: string
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  open: { label: '待认领', variant: 'secondary' },
  matched: { label: '已匹配', variant: 'default' },
  claimed: { label: '已认领', variant: 'success' },
  closed: { label: '已关闭', variant: 'outline' },
}

export default function StudentLostFoundPage() {
  const [items, setItems] = useState<LostFoundItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, lost: 0, found: 0, myReports: 0 })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    type: 'found',
    itemType: '',
    itemName: '',
    description: '',
    location: '',
    foundDate: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const type = activeTab === 'all' ? undefined : activeTab
      const response = await fetch(`/api/student/lost-found?${type ? `type=${type}` : ''}`)
      const result = await response.json()
      if (result.success) {
        setItems(result.data.items || [])
        setStats(result.data.stats || { total: 0, lost: 0, found: 0, myReports: 0 })
      } else {
        setLoadError(result.error || '功能迁移中，暂时无法加载数据')
      }
    } catch (error) {
      console.error('加载失物招领失败:', error)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch('/api/student/lost-found', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()
      if (result.success) {
        setDialogOpen(false)
        setFormData({
          type: 'found',
          itemType: '',
          itemName: '',
          description: '',
          location: '',
          foundDate: '',
        })
        loadItems()
      } else {
        alert(result.error || '发布失败')
      }
    } catch (error) {
      console.error('发布失败:', error)
      alert('发布失败，请重试')
    } finally {
      setSubmitting(false)
    }
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">失物招领</h1>
            <p className="text-muted-foreground">寻物启事和失物招领</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled title="发布功能迁移中，暂不开放">
                <Plus className="h-4 w-4 mr-2" />
                发布招领（迁移中）
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>发布失物招领</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="found">我捡到了物品（招领）</SelectItem>
                      <SelectItem value="lost">我丢失了物品（寻物）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>物品类型</Label>
                  <Select
                    value={formData.itemType}
                    onValueChange={(value) => setFormData({ ...formData, itemType: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择物品类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOST_FOUND_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>物品名称 *</Label>
                  <Input
                    placeholder="请输入物品名称"
                    value={formData.itemName}
                    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>丢失/拾取地点</Label>
                  <Input
                    placeholder="如：南校区图书馆三楼"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>丢失/拾取日期</Label>
                  <Input
                    type="date"
                    value={formData.foundDate}
                    onChange={(e) => setFormData({ ...formData, foundDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>详细描述</Label>
                  <Textarea
                    placeholder="请描述物品特征"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={submitting} className="flex-1">
                    {submitting ? '发布中...' : '发布'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">发布功能迁移中，暂不开放；下方仅展示当前账号可访问的记录。</p>

        {loadError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{loadError}</p>}
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-700">{stats.total}</p>
              <p className="text-sm text-muted-foreground">全部记录</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">{stats.lost}</p>
              <p className="text-sm text-muted-foreground">寻物启事</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.found}</p>
              <p className="text-sm text-muted-foreground">失物招领</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.myReports}</p>
              <p className="text-sm text-muted-foreground">我的发布</p>
            </CardContent>
          </Card>
        </div>

        {/* 筛选标签 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="lost">寻物</TabsTrigger>
            <TabsTrigger value="found">招领</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">暂无记录</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {items.map(item => {
                      const statusInfo = statusConfig[item.status] || statusConfig.open
                      return (
                        <Link
                          key={item.id}
                          href={`/lost-and-found/${item.id}`}
                          className="block p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              item.type === 'lost' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                            }`}>
                              <Package className="h-6 w-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{item.item_name}</h3>
                                <Badge variant={item.type === 'lost' ? 'destructive' : 'default'}>
                                  {item.type === 'lost' ? '寻物' : '招领'}
                                </Badge>
                                <Badge variant={statusInfo.variant}>
                                  {statusInfo.label}
                                </Badge>
                                {item.isOwner && (
                                  <Badge variant="outline">我的发布</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {item.item_type} · {item.location || '未填写地点'}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {item.found_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(item.found_date)}
                                  </span>
                                )}
                                <span>{formatDate(item.created_at)}</span>
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
    </MainLayout>
  )
}
