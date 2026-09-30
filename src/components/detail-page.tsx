'use client'

import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Trash2, RefreshCw } from 'lucide-react'

interface DetailField {
  label: string
  value: string | number | null | undefined
  type?: 'text' | 'status' | 'date' | 'badge' | 'link'
  statusMap?: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }>
}

interface DetailSection {
  title: string
  fields: DetailField[]
}

interface DetailPageProps {
  title: string
  loadingTitle?: string
  notFoundTitle?: string
  sections: DetailSection[]
  backUrl: string
  onDelete?: () => void
  onRefresh?: () => void
  loading?: boolean
  error?: string | null
  actions?: React.ReactNode
}

export function DetailPage({
  title,
  loadingTitle,
  notFoundTitle = '未找到相关记录',
  sections,
  backUrl,
  onDelete,
  onRefresh,
  loading = false,
  error,
  actions
}: DetailPageProps) {
  const router = useRouter()

  const renderFieldValue = (field: DetailField) => {
    const value = field.value ?? '-'
    
    if (field.type === 'status' && field.statusMap && typeof value === 'string') {
      const statusConfig = field.statusMap[value] || { label: value, variant: 'secondary' as const }
      return <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
    }

    if (field.type === 'date' && value && value !== '-') {
      try {
        const date = new Date(value as string)
        return date.toLocaleString('zh-CN')
      } catch {
        return value
      }
    }

    return <span className="text-gray-900">{value}</span>
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push(backUrl)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <Skeleton className="h-8 w-48" />
          </div>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push(backUrl)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
          </div>
          
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-8 text-center text-red-600">
              <p>{error}</p>
              <Button variant="outline" className="mt-4" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                重试
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push(backUrl)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {actions}
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
            )}
            {onDelete && (
              <Button variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </Button>
            )}
          </div>
        </div>

        {/* 详情卡片 */}
        {sections.map((section, sectionIndex) => (
          <Card key={sectionIndex}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {section.fields.map((field, fieldIndex) => (
                  <div key={fieldIndex} className="flex items-start gap-4">
                    <span className="text-sm text-gray-500 w-28 flex-shrink-0">
                      {field.label}:
                    </span>
                    {renderFieldValue(field)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </MainLayout>
  )
}
