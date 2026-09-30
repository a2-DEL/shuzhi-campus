'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DetailPage } from '@/components/detail-page'
import { api } from '@/lib/api'

interface RepairDetail {
  id: string
  order_no: string
  type: string
  location: string
  description: string
  contact_phone: string
  reporter_id: string
  reporter_name: string
  assignee_id: string | null
  assignee_name: string | null
  status: string
  priority: number
  images: string[]
  created_at: string
  updated_at: string
}

const repairTypeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  electrical: { label: '电力维修', variant: 'default' },
  plumbing: { label: '水管维修', variant: 'default' },
  network: { label: '网络维修', variant: 'secondary' },
  door_lock: { label: '门锁维修', variant: 'outline' },
  furniture: { label: '家具维修', variant: 'outline' },
  air_conditioner: { label: '空调维修', variant: 'secondary' },
  other: { label: '其他', variant: 'outline' },
}

const repairStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  PENDING: { label: '待处理', variant: 'secondary' },
  PROCESSING: { label: '处理中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'success' },
  CANCELLED: { label: '已取消', variant: 'destructive' },
  REJECTED: { label: '已拒绝', variant: 'destructive' },
}

const priorityMap: Record<number, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }> = {
  1: { label: '紧急', variant: 'destructive' },
  2: { label: '重要', variant: 'default' },
  3: { label: '一般', variant: 'secondary' },
  4: { label: '低', variant: 'outline' },
}

export default function RepairDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [repair, setRepair] = useState<RepairDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRepair = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<RepairDetail>(`/api/repairs/${params.id}`)
      if (response.success && response.data) {
        setRepair(response.data)
      } else {
        setError('报修工单不存在')
      }
    } catch {
      setError('加载报修信息失败')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadRepair()
  }, [loadRepair])

  if (!repair) {
    return (
      <DetailPage
        title="报修详情"
        loading={loading}
        error={error}
        backUrl="/repairs"
        onRefresh={loadRepair}
        sections={[]}
      />
    )
  }

  const sections = [
    {
      title: '工单信息',
      fields: [
        { label: '工单编号', value: repair.order_no },
        { label: '报修类型', value: repair.type, type: 'status' as const, statusMap: repairTypeMap },
        { label: '工单状态', value: repair.status, type: 'status' as const, statusMap: repairStatusMap },
        { label: '优先级', value: repair.priority, type: 'status' as const, statusMap: priorityMap },
      ],
    },
    {
      title: '报修信息',
      fields: [
        { label: '故障地点', value: repair.location },
        { label: '故障描述', value: repair.description },
        { label: '联系电话', value: repair.contact_phone },
      ],
    },
    {
      title: '人员信息',
      fields: [
        { label: '报修人', value: repair.reporter_name },
        { label: '报修人ID', value: repair.reporter_id },
        { label: '处理人', value: repair.assignee_name },
        { label: '处理人ID', value: repair.assignee_id },
      ],
    },
    {
      title: '时间信息',
      fields: [
        { label: '创建时间', value: repair.created_at, type: 'date' as const },
        { label: '更新时间', value: repair.updated_at, type: 'date' as const },
      ],
    },
  ]

  return (
    <DetailPage
      title={`报修详情 - ${repair.order_no}`}
      backUrl="/repairs"
      onRefresh={loadRepair}
      loading={loading}
      error={error}
      sections={sections}
    />
  )
}
