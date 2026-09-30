'use client'

import { legacyDetailMigrationMessage } from '@/lib/legacy-api-client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface MaterialDetail {
  id: string
  name: string
  category: string
  unit: string
  stock: number
  min_stock: number
  location: string
  status: string
  description?: string
  created_at: string
  updated_at: string
}

const materialStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  normal: { label: '正常', variant: 'success' },
  low: { label: '库存不足', variant: 'default' },
  out_of_stock: { label: '已用完', variant: 'destructive' },
  discontinued: { label: '已停用', variant: 'secondary' },
}

export default function MaterialDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [material, setMaterial] = useState<MaterialDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMaterial = useCallback(async () => {
    const migrationMessage = legacyDetailMigrationMessage()
    if (migrationMessage) { setError(migrationMessage); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<MaterialDetail>(`/api/materials/${params.id}`)
      if (response.success && response.data) {
        setMaterial(response.data)
      } else {
        setError('物资不存在')
      }
    } catch {
      setError('加载物资信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadMaterial()
  }, [loadMaterial])

  if (!material) {
    return (
      <DetailPage
        title="物资详情"
        loading={loading}
        error={error}
        backUrl="/materials"
        onRefresh={loadMaterial}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '基本信息',
      fields: [
        { label: '物资名称', value: material.name },
        { label: '物资分类', value: material.category },
        { label: '计量单位', value: material.unit },
        { label: '状态', value: material.status, type: 'status' as const, statusMap: materialStatusMap },
      ],
    },
    {
      title: '库存信息',
      fields: [
        { label: '当前库存', value: `${material.stock}${material.unit}` },
        { label: '最低库存', value: `${material.min_stock}${material.unit}` },
        { label: '存放位置', value: material.location },
      ],
    },
    {
      title: '其他信息',
      fields: [
        { label: '描述', value: material.description },
        { label: '创建时间', value: material.created_at, type: 'date' as const },
        { label: '更新时间', value: material.updated_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`物资详情 - ${material.name}`}
      backUrl="/materials"
      onRefresh={loadMaterial}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
