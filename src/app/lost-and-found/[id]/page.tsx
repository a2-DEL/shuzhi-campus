'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface LostAndFoundDetail {
  id: string
  title: string
  description: string
  type: string
  location: string
  found_time: string | null
  claimed_time: string | null
  status: string
  contact_person: string
  contact_phone: string
  images: string[] | null
  created_at: string
}

const lostFoundTypeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  LOST: { label: '寻物启事', variant: 'default' },
  FOUND: { label: '失物招领', variant: 'secondary' },
}

const lostFoundStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  UNCLAIMED: { label: '待认领', variant: 'secondary' },
  CLAIMED: { label: '已认领', variant: 'success' },
  EXPIRED: { label: '已过期', variant: 'outline' },
}

export default function LostAndFoundDetailPage() {
  const params = useParams()
  const [item, setItem] = useState<LostAndFoundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadItem = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<LostAndFoundDetail>(`/api/lost-found/${params.id}`)
      if (response.success && response.data) {
        setItem(response.data)
      } else {
        setError('记录不存在')
      }
    } catch {
      setError('加载信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadItem()
  }, [loadItem])

  if (!item) {
    return (
      <DetailPage
        title="失物招领详情"
        loading={loading}
        error={error}
        backUrl="/lost-and-found"
        onRefresh={loadItem}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '标题', value: item.title },
        { label: '类型', value: item.type, type: 'status' as const, statusMap: lostFoundTypeMap },
        { label: '状态', value: item.status, type: 'status' as const, statusMap: lostFoundStatusMap },
      ],
    },
    {
      title: '详细信息',
      fields: [
        { label: '物品描述', value: item.description },
        { label: '丢失/拾取地点', value: item.location },
        { label: '丢失/拾取时间', value: item.found_time, type: 'date' as const },
      ],
    },
    {
      title: '联系方式',
      fields: [
        { label: '联系人', value: item.contact_person },
        { label: '联系电话', value: item.contact_phone },
      ],
    },
    {
      title: '时间记录',
      fields: [
        { label: '发布时间', value: item.created_at, type: 'date' as const },
        { label: '认领时间', value: item.claimed_time, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`失物招领详情 - ${item.title}`}
      backUrl="/lost-and-found"
      onRefresh={loadItem}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
