import { UserRole } from '@/types'
import type { User } from '@/types'

export const AI_OPERATIONS_ROLES: readonly UserRole[] = [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN]

export function isAiOperationsAdmin(user: Pick<User, 'role'>): boolean {
  return AI_OPERATIONS_ROLES.includes(user.role)
}

export function canOperateAiRuntime(user: User): boolean {
  return isAiOperationsAdmin(user) && Boolean(user.school_id)
}
