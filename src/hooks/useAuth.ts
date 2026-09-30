import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserRole, ROLE_LABELS } from '@/types'
import { api } from '@/lib/api'

// 用户信息
interface UserInfo {
  id: string
  user_id: string
  name: string
  role: UserRole
  department?: string
  class_name?: string
  phone?: string
  email?: string
  status: string
  avatar?: string
}

// 菜单项
export interface MenuItem {
  key: string
  label: string
  icon: string
  path: string
  roles?: UserRole[] // 允许访问的角色，不设置则所有角色都可访问
  children?: MenuItem[]
}

// 菜单配置
export const MENU_CONFIG: MenuItem[] = [
  {
    key: 'dashboard',
    label: '首页大屏',
    icon: 'LayoutDashboard',
    path: '/dashboard',
  },
  {
    key: 'users',
    label: '用户管理',
    icon: 'Users',
    path: '/users',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN],
  },
  {
    key: 'permissions',
    label: '权限管理',
    icon: 'Shield',
    path: '/permissions',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    key: 'repairs',
    label: '报修管理',
    icon: 'Wrench',
    path: '/repairs',
    roles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN, UserRole.REPAIRMAN],
  },
  {
    key: 'duties',
    label: '值日管理',
    icon: 'Calendar',
    path: '/duties',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.DEPT_HYGIENE_MANAGER, UserRole.DEPT_HYGIENE_ADMIN, UserRole.COUNSELOR],
  },
  {
    key: 'classrooms',
    label: '教室管理',
    icon: 'School',
    path: '/classrooms',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.COUNSELOR],
  },
  {
    key: 'dormitories',
    label: '宿舍管理',
    icon: 'Building',
    path: '/dormitories',
    roles: [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER],
  },
  {
    key: 'visitors',
    label: '访客管理',
    icon: 'UserCheck',
    path: '/visitors',
    roles: [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER],
  },
  {
    key: 'lost-found',
    label: '失物招领',
    icon: 'PackageSearch',
    path: '/lost-found',
  },
  {
    key: 'materials',
    label: '物资管理',
    icon: 'Package',
    path: '/materials',
    roles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN],
  },
  {
    key: 'notifications',
    label: '通知管理',
    icon: 'Bell',
    path: '/notifications',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.COUNSELOR, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER],
  },
  {
    key: 'settings',
    label: '系统设置',
    icon: 'Settings',
    path: '/settings',
    roles: [UserRole.SUPER_ADMIN],
  },
]

// 检查是否有权限访问某个菜单
export function hasMenuPermission(userRole: UserRole, menuItem: MenuItem): boolean {
  // 如果没有设置 roles，则所有角色都可访问
  if (!menuItem.roles || menuItem.roles.length === 0) {
    return true
  }
  return menuItem.roles.includes(userRole)
}

// 获取用户可访问的菜单
export function getAccessibleMenus(userRole: UserRole): MenuItem[] {
  return MENU_CONFIG.filter(item => hasMenuPermission(userRole, item))
}

// 权限Hook
export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [menus, setMenus] = useState<MenuItem[]>([])

  // 加载用户信息
  const loadUser = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get<UserInfo>('/api/auth/me')
      if (response.success && response.data) {
        setUser(response.data)
        // 根据角色过滤菜单
        setMenus(getAccessibleMenus(response.data.role))
      } else {
        // Token 无效，跳转登录
        router.push('/login')
      }
    } catch (error) {
      console.error('加载用户信息失败:', error)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  // 初始加载
  useEffect(() => {
    loadUser()
  }, [loadUser])

  // 登出
  const logout = useCallback(async () => {
    await api.post('/api/auth/logout')
    router.push('/login')
  }, [router])

  // 检查是否有某个权限
  const hasPermission = useCallback((requiredRoles: UserRole[]): boolean => {
    if (!user) return false
    return requiredRoles.includes(user.role)
  }, [user])

  // 检查是否可以访问某个路径
  const canAccess = useCallback((path: string): boolean => {
    if (!user) return false
    const menuItem = MENU_CONFIG.find(item => item.path === path)
    if (!menuItem) return true // 路径不在菜单配置中，默认允许
    return hasMenuPermission(user.role, menuItem)
  }, [user])

  return {
    user,
    loading,
    menus,
    logout,
    hasPermission,
    canAccess,
    refresh: loadUser,
  }
}

// 获取角色显示名称
export function getRoleName(role: UserRole): string {
  return ROLE_LABELS[role] || role
}
