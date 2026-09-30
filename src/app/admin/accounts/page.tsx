'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { Plus, Search, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { UserRole, ROLE_LABELS, DEPARTMENTS } from '@/types'
import { ROLE_ALLOWED_SCOPES } from '@/lib/role-policy'

interface User {
  id: string
  user_id: string
  name: string
  role: string
  department?: string
  class_name?: string
  phone?: string
  status: string
  created_at: string
  last_login_at?: string
}

const roleOptions = Object.values(UserRole).map((value) => ({ value, label: ROLE_LABELS[value] }))

type ScopeType = 'global' | 'school' | 'campus' | 'organization' | 'class' | 'building' | 'self'
type ScopeOption = { id: string; type: Exclude<ScopeType, 'global' | 'school' | 'self'>; name: string; code?: string; organization_id?: string }
type ScopeCatalog = { organizations: ScopeOption[]; campuses: ScopeOption[]; classes: ScopeOption[]; buildings: ScopeOption[]; source: string }
const EMPTY_SCOPE_CATALOG: ScopeCatalog = { organizations: [], campuses: [], classes: [], buildings: [], source: 'unknown' }
const SCOPE_LABELS: Record<ScopeType, string> = { global: '\u5168\u6821', school: '\u5b66\u6821', campus: '\u6821\u533a', organization: '\u7ec4\u7ec7', class: '\u73ed\u7ea7', building: '\u697c\u680b', self: '\u4ec5\u672c\u4eba' }

export default function AdminAccountsPage() {
  useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterDepartment, setFilterDepartment] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scopeCatalog, setScopeCatalog] = useState<ScopeCatalog>(EMPTY_SCOPE_CATALOG)
  const [formData, setFormData] = useState({
    userId: '',
    name: '',
    password: '',
    role: UserRole.DEPT_ADMIN as string,
    scopeType: 'organization' as ScopeType,
    scopeId: '',
    department: '',
    className: '',
    phone: '',
  })

  useEffect(() => {
    if (!dialogOpen) return
    void fetch('/api/admin/identity/scopes', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (result.success && result.data) setScopeCatalog(result.data as ScopeCatalog)
      })
      .catch((error) => console.error('Failed to load identity scopes', error))
  }, [dialogOpen])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      if (searchKeyword) params.set('keyword', searchKeyword)
      if (filterRole !== 'all') params.set('role', filterRole)
      if (filterDepartment !== 'all') params.set('department', filterDepartment)

      const response = await fetch(`/api/admin/accounts?${params.toString()}`)
      const result = await response.json()
      if (result.success) {
        setUsers(result.data.users || [])
        setTotalPages(result.data.pagination?.totalPages || 1)
      }
    } catch (error) {
      console.error('加载用户列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [page, searchKeyword, filterRole, filterDepartment])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          primaryOrganizationId: formData.scopeType === 'organization' ? formData.scopeId || undefined : undefined,
          scopeId: formData.scopeId || undefined,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setDialogOpen(false)
        setFormData({
          userId: '',
          name: '',
          password: '',
          role: UserRole.DEPT_ADMIN,
          scopeType: 'organization',
          scopeId: '',
          department: '',
          className: '',
          phone: '',
        })
        loadUsers()
      } else {
        alert(result.error || '创建失败')
      }
    } catch (error) {
      console.error('创建用户失败:', error)
      alert('创建失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const selectedScopeOptions = formData.scopeType === 'organization' ? scopeCatalog.organizations
    : formData.scopeType === 'campus' ? scopeCatalog.campuses
      : formData.scopeType === 'class' ? scopeCatalog.classes
        : formData.scopeType === 'building' ? scopeCatalog.buildings
          : []
  const allowedScopeTypes = ROLE_ALLOWED_SCOPES[formData.role as UserRole] ?? []

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">账号管理</h1>
            <p className="text-muted-foreground">管理用户账号和角色权限</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                创建账号
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>创建用户账号</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>账号（学号/工号）*</Label>
                  <Input
                    placeholder="请输入账号"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>姓名 *</Label>
                  <Input
                    placeholder="请输入姓名"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>初始密码 *</Label>
                  <Input
                    type="password"
                    placeholder="请输入初始密码"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    minLength={12}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{'\u751f\u4ea7\u8d26\u53f7\u5bc6\u7801\u81f3\u5c11 12 \u4f4d'}</p>
                </div>

                <div className="space-y-2">
                  <Label>角色 *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => {
                      const nextRole = value as UserRole
                      const nextScopeType = ROLE_ALLOWED_SCOPES[nextRole]?.[0] ?? 'organization'
                      setFormData({ ...formData, role: value, scopeType: nextScopeType, scopeId: '' })
                    }}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{'\u89d2\u8272\u4f5c\u7528\u57df'} *</Label>
                  <Select
                    value={formData.scopeType}
                    onValueChange={(value) => setFormData({ ...formData, scopeType: value as ScopeType, scopeId: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={'\u9009\u62e9\u4f5c\u7528\u57df'} />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedScopeTypes.map((scopeType) => (
                        <SelectItem key={scopeType} value={scopeType}>
                          {SCOPE_LABELS[scopeType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedScopeOptions.length > 0 && (
                    <Select
                      value={formData.scopeId}
                      onValueChange={(value) => setFormData({ ...formData, scopeId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={'\u9009\u62e9\u5177\u4f53\u4f5c\u7528\u57df'} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedScopeOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}{option.code ? ` (${option.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formData.scopeType !== 'global' && formData.scopeType !== 'school' && selectedScopeOptions.length === 0 && (
                    <p className="text-xs text-amber-600">{'\u5f53\u524d\u4f5c\u7528\u57df\u6682\u65e0\u53ef\u9009\u6570\u636e'}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>院系</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择院系" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>班级</Label>
                  <Input
                    placeholder="如：24级资产评估专业1班"
                    value={formData.className}
                    onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>手机号</Label>
                  <Input
                    placeholder="请输入手机号"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={submitting} className="flex-1">
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    创建
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* 筛选 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索账号或姓名"
                    value={searchKeyword}
                    onChange={(e) => {
                      setSearchKeyword(e.target.value)
                      setPage(1)
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select
                value={filterRole}
                onValueChange={(value) => {
                  setFilterRole(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterDepartment}
                onValueChange={(value) => {
                  setFilterDepartment(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择院系" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部院系</SelectItem>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 用户列表 */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>院系/班级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>最后登录</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.user_id}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ROLE_LABELS[user.role as UserRole] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.department || '-'}
                        {user.class_name && <span className="text-muted-foreground"> / {user.class_name}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={user.status === 'active' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                          {user.status === 'active' ? '正常' : '禁用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(user.created_at)}</TableCell>
                      <TableCell className="text-sm">{formatDate(user.last_login_at || '')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 分页 */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-4 py-2 text-sm">
                  第 {page} / {totalPages} 页
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </MainLayout>
  )
}
