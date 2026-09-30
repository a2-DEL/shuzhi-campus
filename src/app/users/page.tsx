'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  UserRole, 
  ROLE_LABELS, 
  ROLE_HIERARCHY,
  UserStatus, 
  User, 
  DEPARTMENTS,
} from '@/types'
import { api } from '@/lib/api'
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Key,
  UserX,
  UserCheck,
  RefreshCw,
  Loader2,
  Eye,
  Users,
  Mail,
  Phone,
  Clock,
  Shield,
} from 'lucide-react'

interface UsersResponse {
  data: User[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export default function UsersPage() {
  // 数据状态
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  
  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // 选择状态
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  
  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  
  // 用户活动记录
  const [userActivities, setUserActivities] = useState<{id: string; action: string; time: string; ip: string}[]>([])
  
  // 表单数据
  const [formData, setFormData] = useState({
    user_id: '',
    name: '',
    role: '' as UserRole,
    department: '',
    class_name: '',
    phone: '',
    email: '',
    password: '',
    status: UserStatus.ACTIVE,
  })

  // 加载用户数据
  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('pageSize', pageSize.toString())
      if (searchKeyword) params.append('search', searchKeyword)
      if (roleFilter !== 'all') params.append('role', roleFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      
      const response = await api.get<UsersResponse>(`/api/users?${params.toString()}`)
      
      if (response.success && response.data) {
        setUsers(response.data.data || [])
        setTotal(response.data.pagination.total)
      }
    } catch (err) {
      console.error('加载用户数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchKeyword, roleFilter, statusFilter])

  // 初始加载
  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(users.map((user) => user.id))
    } else {
      setSelectedUsers([])
    }
  }

  // 单个选择
  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId])
    } else {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId))
    }
  }

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingUser(null)
    setFormData({
      user_id: '',
      name: '',
      role: '' as UserRole,
      department: '',
      class_name: '',
      phone: '',
      email: '',
      password: '',
      status: UserStatus.ACTIVE,
    })
    setDialogOpen(true)
  }

  // 打开编辑弹窗
  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      department: user.department || '',
      class_name: user.class_name || '',
      phone: user.phone || '',
      email: user.email || '',
      password: '',
      status: user.status,
    })
    setDialogOpen(true)
  }

  // 查看用户详情
  const handleViewDetail = async (user: User) => {
    setViewingUser(user)
    setDetailDialogOpen(true)
    
    // 加载用户活动记录
    try {
      const response = await api.get<{ data: {id: string; action: string; time: string; ip: string}[] }>(`/api/users/${user.id}/activities`)
      if (response.success && response.data) {
        setUserActivities(response.data.data || [])
      }
    } catch {
      // 使用模拟数据
      setUserActivities([
        { id: '1', action: '登录系统', time: '2024-01-16 10:30:00', ip: '192.168.1.100' },
        { id: '2', action: '提交报修', time: '2024-01-15 14:20:00', ip: '192.168.1.100' },
      ])
    }
  }

  // 保存用户
  const handleSave = async () => {
    if (!formData.user_id || !formData.name || !formData.role) {
      alert('请填写必要信息')
      return
    }
    
    setSaving(true)
    try {
      if (editingUser) {
        const response = await api.put(`/api/users/${editingUser.id}`, formData)
        if (response.success) {
          setDialogOpen(false)
          loadUsers()
        } else {
          alert(response.error || '保存失败')
        }
      } else {
        const response = await api.post('/api/users', formData)
        if (response.success) {
          setDialogOpen(false)
          loadUsers()
        } else {
          alert(response.error || '创建失败')
        }
      }
    } catch (error) {
      console.error('保存失败:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 删除用户
  const handleDelete = async (userId: string) => {
    if (!confirm('确定要删除此用户吗？')) return
    
    try {
      const response = await api.delete(`/api/users/${userId}`)
      if (response.success) {
        loadUsers()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  // 切换用户状态
  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.DISABLED : UserStatus.ACTIVE
    try {
      const response = await api.put(`/api/users/${user.id}`, { status: newStatus })
      if (response.success) {
        loadUsers()
      }
    } catch (error) {
      console.error('更新状态失败:', error)
    }
  }

  // 重置密码
  const handleResetPassword = async (userId: string) => {
    if (!confirm('确定要重置此用户的密码吗？')) return
    
    try {
      const response = await api.post(`/api/users/${userId}/reset-password`)
      if (response.success) {
        alert('密码已重置为：123456')
      }
    } catch (error) {
      console.error('重置密码失败:', error)
    }
  }

  // 获取角色徽章样式
  const getRoleBadgeClass = (role: UserRole) => {
    const level = ROLE_HIERARCHY[role]?.level || 5
    if (level === 1) return 'bg-red-100 text-red-700'
    if (level === 2) return 'bg-orange-100 text-orange-700'
    if (level === 3) return 'bg-blue-100 text-blue-700'
    return 'bg-gray-100 text-gray-700'
  }

  // 统计
  const stats = {
    total,
    active: users.filter(u => u.status === UserStatus.ACTIVE).length,
    students: users.filter(u => u.role === UserRole.STUDENT).length,
    teachers: users.filter(u => [UserRole.TEACHER, UserRole.COUNSELOR].includes(u.role)).length,
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
            <p className="text-gray-500">管理系统用户账号和权限</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadUsers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </Button>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              新增用户
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">总用户数</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">活跃用户</p>
                  <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                </div>
                <UserCheck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">学生用户</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.students}</p>
                </div>
                <Users className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">教师用户</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.teachers}</p>
                </div>
                <Shield className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选区域 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="搜索学号/工号、姓名..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="角色筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value={UserStatus.ACTIVE}>正常</SelectItem>
                  <SelectItem value={UserStatus.DISABLED}>禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 用户列表 */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Users className="h-12 w-12 mb-4" />
                <p>暂无用户数据</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedUsers.length === users.length && users.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>学号/工号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>院系/班级</TableHead>
                    <TableHead>联系方式</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{user.user_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeClass(user.role)}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{user.department || '-'}</div>
                          {user.class_name && (
                            <div className="text-gray-500">{user.class_name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {user.phone}
                            </div>
                          )}
                          {user.email && (
                            <div className="flex items-center gap-1 text-gray-500">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          user.status === UserStatus.ACTIVE 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }>
                          {user.status === UserStatus.ACTIVE ? '正常' : '禁用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetail(user)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                                <Key className="h-4 w-4 mr-2" />
                                重置密码
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                                {user.status === UserStatus.ACTIVE ? (
                                  <>
                                    <UserX className="h-4 w-4 mr-2" />
                                    禁用账号
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    启用账号
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(user.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除用户
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 新增/编辑弹窗 */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingUser ? '编辑用户' : '新增用户'}</DialogTitle>
              <DialogDescription>
                {editingUser ? '修改用户信息' : '创建新的系统用户'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>学号/工号 *</Label>
                  <Input
                    value={formData.user_id}
                    onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                    placeholder="请输入学号或工号"
                    disabled={!!editingUser}
                  />
                </div>
                <div className="space-y-2">
                  <Label>姓名 *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="请输入姓名"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>角色 *</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>院系</Label>
                  <Select 
                    value={formData.department} 
                    onValueChange={(v) => setFormData({ ...formData, department: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择院系" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>班级</Label>
                  <Input
                    value={formData.class_name}
                    onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                    placeholder="如：计科2101班"
                  />
                </div>
                <div className="space-y-2">
                  <Label>手机号</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="请输入手机号"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="请输入邮箱"
                />
              </div>
              {!editingUser && (
                <div className="space-y-2">
                  <Label>初始密码</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="留空则默认为 123456"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 用户详情弹窗 */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>用户详情</DialogTitle>
            </DialogHeader>
            {viewingUser && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList>
                  <TabsTrigger value="info">基本信息</TabsTrigger>
                  <TabsTrigger value="activity">活动记录</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={viewingUser.avatar} />
                      <AvatarFallback className="text-2xl">{viewingUser.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-bold">{viewingUser.name}</h3>
                      <p className="text-gray-500">{viewingUser.user_id}</p>
                      <Badge className={getRoleBadgeClass(viewingUser.role)}>
                        {ROLE_LABELS[viewingUser.role]}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">院系：</span>
                      <span>{viewingUser.department || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">班级：</span>
                      <span>{viewingUser.class_name || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">手机：</span>
                      <span>{viewingUser.phone || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">邮箱：</span>
                      <span>{viewingUser.email || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span>创建时间：{viewingUser.created_at ? new Date(viewingUser.created_at).toLocaleString('zh-CN') : '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-400" />
                      <span>状态：
                        <Badge className={
                          viewingUser.status === UserStatus.ACTIVE 
                            ? 'bg-green-100 text-green-700 ml-2' 
                            : 'bg-red-100 text-red-700 ml-2'
                        }>
                          {viewingUser.status === UserStatus.ACTIVE ? '正常' : '禁用'}
                        </Badge>
                      </span>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="activity" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>操作</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead>IP地址</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userActivities.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell>{activity.action}</TableCell>
                          <TableCell>{activity.time}</TableCell>
                          <TableCell className="font-medium">{activity.ip}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>关闭</Button>
              <Button onClick={() => { setDetailDialogOpen(false); handleEdit(viewingUser!); }}>
                编辑用户
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
