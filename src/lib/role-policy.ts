import { ROLE_HIERARCHY, RoleScopeType, UserRole } from '@/types'

export const ROLE_ALLOWED_SCOPES: Record<UserRole, readonly RoleScopeType[]> = {
  [UserRole.SUPER_ADMIN]: ['global'],
  [UserRole.AI_OPS_ADMIN]: ['school'],
  [UserRole.DEPT_ADMIN]: ['organization'],
  [UserRole.DEPT_HYGIENE_MANAGER]: ['organization'],
  [UserRole.DEPT_HYGIENE_ADMIN]: ['organization'],
  [UserRole.COUNSELOR]: ['organization', 'class'],
  [UserRole.TEACHER]: ['organization'],
  [UserRole.LOGISTICS_MANAGER]: ['organization'],
  [UserRole.LOGISTICS_ADMIN]: ['organization'],
  [UserRole.REPAIRMAN]: ['organization'],
  [UserRole.DORM_MANAGER]: ['organization'],
  [UserRole.DORM_KEEPER]: ['building'],
  [UserRole.STUDENT]: ['class'],
  [UserRole.CLASS_COMMITTEE]: ['class'],
}

export function canGrantRole(grantorRole: UserRole, targetRole: UserRole): boolean {
  if (grantorRole === UserRole.SUPER_ADMIN) return true
  let current: UserRole | undefined = targetRole
  while (current) {
    const parent: UserRole | undefined = ROLE_HIERARCHY[current]?.parent
    if (!parent) return false
    if (parent === grantorRole) return true
    current = parent
  }
  return false
}
