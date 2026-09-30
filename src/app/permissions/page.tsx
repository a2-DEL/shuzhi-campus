'use client'

import { useCallback, useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserRole, ROLE_HIERARCHY, ROLE_LABELS } from '@/types'

interface RolePolicyRow {
  role: UserRole
  label: string
  permissions: Record<string, string[]>
  source: 'versioned_code_policy'
}

interface AssignmentRow {
  id: string
  user_id: string
  role: UserRole
  scope_type: string
  scope_id?: string
  status: string
  valid_from: string
  valid_until?: string
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

export default function PermissionsPage() {
  const [roles, setRoles] = useState<RolePolicyRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [roleResponse, assignmentResponse] = await Promise.all([
        fetch('/api/permissions/roles', { cache: 'no-store' }),
        fetch('/api/permissions/assignments?pageSize=100', { cache: 'no-store' }),
      ])
      const roleBody = await roleResponse.json() as ApiEnvelope<RolePolicyRow[]>
      const assignmentBody = await assignmentResponse.json() as ApiEnvelope<{ data: AssignmentRow[] }>
      if (!roleResponse.ok || !assignmentResponse.ok || !roleBody.success || !assignmentBody.success) {
        setError(roleResponse.status === 403 || assignmentResponse.status === 403
          ? '当前身份无权查看权限治理信息。运行时角色策略仅供有权限的管理员查看。'
          : '权限数据暂不可用，请稍后重试。')
        return
      }
      setRoles(roleBody.data ?? [])
      setAssignments(assignmentBody.data?.data ?? [])
      setError('')
    } catch {
      setError('无法连接权限服务，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const filtered = assignments.filter((assignment) =>
    !search || assignment.user_id.includes(search) || ROLE_LABELS[assignment.role]?.includes(search),
  )

  return <MainLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">权限管理</h1>
        <p className="text-gray-500">查看真实角色策略和当前租户角色分配记录。</p>
        <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 font-medium text-amber-900">
          角色权限来自版本化代码策略；本页面为只读视图，不支持直接保存或修改角色权限。角色分配请使用已有的受控管理流程。
        </p>
      </div>
      {loading ? <Card><CardContent className="p-6">正在读取权限数据…</CardContent></Card>
        : error ? <Card><CardContent className="p-6 text-red-700">{error}</CardContent></Card>
          : <Tabs defaultValue="roles" className="space-y-4">
            <TabsList><TabsTrigger value="roles">角色权限配置</TabsTrigger><TabsTrigger value="assignments">角色分配记录</TabsTrigger></TabsList>
            <TabsContent value="roles"><Card><CardHeader><CardTitle>版本化角色策略（{roles.length} 类）</CardTitle></CardHeader><CardContent className="space-y-3">
              {roles.map((role) => <div key={role.role} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{role.label}</span><Badge variant="outline">第 {ROLE_HIERARCHY[role.role]?.level ?? '-'} 级</Badge></div>
                <p className="mt-2 break-words text-sm text-gray-600">{Object.entries(role.permissions).map(([module, actions]) => `${module}: ${actions.join(', ')}`).join(' · ') || '未授予权限'}</p>
              </div>)}
            </CardContent></Card></TabsContent>
            <TabsContent value="assignments"><Card><CardHeader><CardTitle>当前租户分配记录（当前页）</CardTitle></CardHeader><CardContent className="space-y-3">
              <Input aria-label="搜索角色分配" placeholder="搜索用户ID或角色" value={search} onChange={(event) => setSearch(event.target.value)} />
              {filtered.map((assignment) => <div key={assignment.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>{assignment.user_id} · {ROLE_LABELS[assignment.role] ?? assignment.role}</span>
                <span className="text-gray-500">{assignment.scope_type}{assignment.scope_id ? ` / ${assignment.scope_id}` : ''} · {assignment.status}</span>
              </div>)}
              {filtered.length === 0 && <p className="text-sm text-gray-500">没有符合条件的分配记录。</p>}
            </CardContent></Card></TabsContent>
          </Tabs>}
    </div>
  </MainLayout>
}
