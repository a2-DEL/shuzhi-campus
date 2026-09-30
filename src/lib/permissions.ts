import { UserRole, ROLE_HIERARCHY, ROLE_PERMISSIONS, DataPermissionFilter, User } from '@/types'

/**
 * 数据权限过滤工具
 * 根据"自上而下，按需分配"的树状分层结构，动态添加数据过滤条件
 */

// Supabase 查询构建器接口简化版本
interface SupabaseQueryBuilder {
  eq(column: string, value: unknown): SupabaseQueryBuilder
  in(column: string, values: unknown[]): SupabaseQueryBuilder
  or(filter: string): SupabaseQueryBuilder
  select(columns?: string): SupabaseQueryBuilder
}

// 检查用户是否有特定权限
export function hasPermission(user: User, permission: string): boolean {
  const userPermissions = ROLE_PERMISSIONS[user.role] || []

  // 检查通配符权限（如 'repair:*'）
  const wildcardPermission = permission.split(':')[0] + ':*'

  return userPermissions.some(p =>
    p === permission ||
    p === wildcardPermission ||
    p === '*'
  )
}

// 检查用户是否可以管理目标角色
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  const managerLevel = ROLE_HIERARCHY[managerRole]?.level || 999
  const targetLevel = ROLE_HIERARCHY[targetRole]?.level || 999

  // 只能管理层级低于自己的角色
  return managerLevel < targetLevel
}

// 获取用户的数据权限过滤条件
export function getDataFilter(user: User): DataPermissionFilter {
  const filter: DataPermissionFilter = {
    user_id: user.id,
    role: user.role,
  }

  // 根据角色添加过滤条件
  switch (user.role) {
    case UserRole.SUPER_ADMIN:
      // 超级管理员可以看到所有数据
      break
      // 超级管理员可以看到所有数据
      break
      
    case UserRole.DEPT_ADMIN:
    case UserRole.DEPT_HYGIENE_MANAGER:
    case UserRole.DEPT_HYGIENE_ADMIN:
      // 院系管理员只能看到本院系的数据
      if (user.college_id) {
        filter.college_id = user.college_id
      }
      break
      
    case UserRole.COUNSELOR:
      // 辅导员只能看到所管理班级的数据
      if (user.college_id) {
        filter.college_id = user.college_id
      }
      if (user.class_id) {
        filter.class_id = user.class_id
      }
      break
      
    case UserRole.LOGISTICS_MANAGER:
    case UserRole.LOGISTICS_ADMIN:
      // 后勤可以看到所有报修数据
      break
      
    case UserRole.REPAIRMAN:
      // 维修师傅只能看到分配给自己的工单
      filter.user_id = user.id
      break
      
    case UserRole.DORM_MANAGER:
      // 宿管中心负责人可以看到所有宿舍数据
      break
      
    case UserRole.DORM_KEEPER:
      // 宿管员只能看到自己负责的楼栋
      if (user.department) {
        filter.building = user.department
      }
      break
      
    case UserRole.STUDENT:
    case UserRole.CLASS_COMMITTEE:
      // 学生只能看到自己的数据
      filter.user_id = user.id
      break
      
    default:
      // 默认只能看到自己的数据
      filter.user_id = user.id
  }
  
  return filter
}

// 应用数据权限过滤到查询条件
export function applyDataFilter(
  query: SupabaseQueryBuilder, // Supabase query builder
  filter: DataPermissionFilter,
  tableName: string
): SupabaseQueryBuilder {
  let filteredQuery = query
  
  // 按用户ID过滤
  if (filter.user_id && tableName !== 'users') {
    // 对于报修表，可以按reporter_id或assignee_id过滤
    if (tableName === 'repairs') {
      filteredQuery = filteredQuery.or(`reporter_id.eq.${filter.user_id},assignee_id.eq.${filter.user_id}`)
    } else if (tableName === 'classroom_bookings') {
      filteredQuery = filteredQuery.eq('applicant_id', filter.user_id)
    } else if (tableName === 'lost_found') {
      filteredQuery = filteredQuery.eq('reporter_id', filter.user_id)
    }
  }
  
  // 按学院过滤
  if (filter.college_id) {
    if (tableName === 'users') {
      filteredQuery = filteredQuery.eq('college_id', filter.college_id)
    } else if (tableName === 'repairs') {
      // 报修按报修人所在学院过滤
      filteredQuery = filteredQuery.select('*, reporter:users!inner(college_id)')
        .eq('reporter.college_id', filter.college_id)
    }
  }
  
  // 按班级过滤
  if (filter.class_id) {
    if (tableName === 'users') {
      filteredQuery = filteredQuery.eq('class_id', filter.class_id)
    }
  }
  
  // 按楼栋过滤
  if (filter.building) {
    if (tableName === 'dormitories' || tableName === 'dorm_inspections') {
      filteredQuery = filteredQuery.eq('building', filter.building)
    }
  }
  
  return filteredQuery
}

// 获取角色层级路径（从当前角色到顶级角色的路径）
export function getRolePath(role: UserRole): UserRole[] {
  const path: UserRole[] = [role]
  let currentRole: UserRole | undefined = role
  
  while (currentRole) {
    const hierarchy: { level: number; parent?: UserRole } | undefined = ROLE_HIERARCHY[currentRole]
    if (hierarchy && hierarchy.parent) {
      path.push(hierarchy.parent)
      currentRole = hierarchy.parent
    } else {
      break
    }
  }
  
  return path
}

// 检查用户是否属于某角色的管理范围
export function isUnderManagement(manager: User, target: User): boolean {
  // 超级管理员可以管理所有人
  if (manager.role === UserRole.SUPER_ADMIN) {
    return true
  }
  
  // 检查角色层级
  if (!canManageRole(manager.role, target.role)) {
    return false
  }
  
  // 检查数据范围
  const managerFilter = getDataFilter(manager)
  
  // 如果管理员有学院限制，目标必须同学院
  if (managerFilter.college_id && target.college_id !== managerFilter.college_id) {
    return false
  }
  
  // 如果管理员有班级限制，目标必须同班级
  if (managerFilter.class_id && target.class_id !== managerFilter.class_id) {
    return false
  }
  
  return true
}
