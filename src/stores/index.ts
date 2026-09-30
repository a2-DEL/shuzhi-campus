'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { User, UserRole } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  _sessionChecked: boolean
  login: (user: User) => void
  logout: () => Promise<void>
  validateSession: () => Promise<boolean>
  updateUser: (user: Partial<User>) => void
  setHasHydrated: (state: boolean) => void
}

let sessionValidation: Promise<boolean> | null = null

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
      _sessionChecked: false,
      login: (user) =>
        set({
          user,
          isAuthenticated: true,
          _sessionChecked: true,
        }),
      logout: async () => {
        set({ user: null, isAuthenticated: false, _sessionChecked: true })
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
          })
        } catch (error) {
          console.error('Failed to close the server session', error)
        }
      },
      validateSession: async () => {
        if (sessionValidation) return sessionValidation

        sessionValidation = (async () => {
          try {
            const response = await fetch('/api/auth/me', {
              credentials: 'same-origin',
              cache: 'no-store',
            })
            const result = await response.json() as { success?: boolean; data?: User }

            if (response.ok && result.success && result.data) {
              set({ user: result.data, isAuthenticated: true, _sessionChecked: true })
              return true
            }
          } catch (error) {
            console.error('Failed to validate the identity session', error)
          }

          set({ user: null, isAuthenticated: false, _sessionChecked: true })
          return false
        })()

        try {
          return await sessionValidation
        } finally {
          sessionValidation = null
        }
      },
      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

// 用于检测水合状态的 hook
export const useHydration = () => useAuthStore((state) => state._hasHydrated)
export const useSessionChecked = () => useAuthStore((state) => state._sessionChecked)

// 侧边栏状态
interface SidebarState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
}))

// 数据刷新状态
interface RefreshState {
  lastRefreshTime: Record<string, number>
  refreshing: Record<string, boolean>
  setRefreshing: (key: string, refreshing: boolean) => void
  markRefreshed: (key: string) => void
  shouldRefresh: (key: string, intervalMs?: number) => boolean
}

export const useRefreshStore = create<RefreshState>((set, get) => ({
  lastRefreshTime: {},
  refreshing: {},
  setRefreshing: (key, refreshing) =>
    set((state) => ({
      refreshing: { ...state.refreshing, [key]: refreshing },
    })),
  markRefreshed: (key) =>
    set((state) => ({
      lastRefreshTime: { ...state.lastRefreshTime, [key]: Date.now() },
      refreshing: { ...state.refreshing, [key]: false },
    })),
  shouldRefresh: (key, intervalMs = 30000) => {
    const state = get()
    const lastRefresh = state.lastRefreshTime[key] || 0
    return Date.now() - lastRefresh > intervalMs
  },
}))

// 权限检查
export const hasPermission = (userRole: UserRole, allowedRoles: UserRole[]): boolean => {
  return allowedRoles.includes(userRole)
}

// 检查是否为管理员角色
export const isAdmin = (role: UserRole): boolean => {
  const adminRoles: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.AI_OPS_ADMIN,
    UserRole.DEPT_ADMIN,
    UserRole.DEPT_HYGIENE_MANAGER,
    UserRole.LOGISTICS_MANAGER,
    UserRole.DORM_MANAGER,
  ]
  return adminRoles.includes(role)
}

// 检查是否为超级管理员
export const isSuperAdmin = (role: UserRole): boolean => {
  return role === UserRole.SUPER_ADMIN
}

// 菜单权限映射
export const MENU_PERMISSIONS: Record<string, UserRole[]> = {
  '/dashboard': Object.values(UserRole),
  '/users': [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN],
  '/permissions': [UserRole.SUPER_ADMIN],
  '/repairs': [
    UserRole.SUPER_ADMIN,
    UserRole.LOGISTICS_MANAGER,
    UserRole.LOGISTICS_ADMIN,
    UserRole.REPAIRMAN,
  ],
  '/duties': [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.DEPT_HYGIENE_MANAGER, UserRole.DEPT_HYGIENE_ADMIN, UserRole.COUNSELOR],
  '/classrooms': [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.COUNSELOR],
  '/dormitories': [UserRole.SUPER_ADMIN, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER],
  '/materials': [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN],
  '/notifications': [
    UserRole.SUPER_ADMIN,
    UserRole.DEPT_ADMIN,
    UserRole.COUNSELOR,
    UserRole.LOGISTICS_MANAGER,
    UserRole.DORM_MANAGER,
  ],
  '/settings': [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN],
  '/ai-agents/operations': [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN],
  '/ai-agents/model-gateway': [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN],
}

// 检查路径权限
export const canAccessPath = (path: string, userRole: UserRole): boolean => {
  const allowedRoles = MENU_PERMISSIONS[path]
  if (!allowedRoles) return true // 未配置的路径默认允许访问
  return allowedRoles.includes(userRole)
}

// 获取用户可访问的菜单列表
export const getAccessibleMenus = (userRole: UserRole): string[] => {
  return Object.entries(MENU_PERMISSIONS)
    .filter(([_, roles]) => roles.includes(userRole))
    .map(([path]) => path)
}
