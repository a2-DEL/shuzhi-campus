/**
 * 角色层级定义
 * 层级1: 现教中心管理员 (super_admin)
 * AI 运维专责层级2: 负责 Agent 运行、维护、调试与治理
 * 层级2: 院系管理员、后勤基建处负责人、宿管中心负责人
 * 层级3: 辅导员、后勤管理端、各楼宿管、讲课教师、院系卫生负责人
 * 层级4: 班委
 * 层级5: 维修师傅、学生
 */

import { UserRole } from './index'
export { UserRole }

/**
 * 角色层级映射
 */
export const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 1,
  [UserRole.AI_OPS_ADMIN]: 2,
  [UserRole.DEPT_ADMIN]: 2,
  [UserRole.LOGISTICS_MANAGER]: 2,
  [UserRole.DORM_MANAGER]: 2,
  [UserRole.COUNSELOR]: 3,
  [UserRole.LOGISTICS_ADMIN]: 3,
  [UserRole.DORM_KEEPER]: 3,
  [UserRole.TEACHER]: 3,
  [UserRole.DEPT_HYGIENE_MANAGER]: 3,
  [UserRole.DEPT_HYGIENE_ADMIN]: 4,
  [UserRole.CLASS_COMMITTEE]: 4,
  [UserRole.REPAIRMAN]: 5,
  [UserRole.STUDENT]: 5,
}

/**
 * 角色显示名称
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '现教中心管理员',
  [UserRole.AI_OPS_ADMIN]: 'AI系统运维管理员',
  [UserRole.DEPT_ADMIN]: '院系管理员',
  [UserRole.LOGISTICS_MANAGER]: '后勤基建处负责人',
  [UserRole.DORM_MANAGER]: '宿管中心负责人',
  [UserRole.COUNSELOR]: '辅导员',
  [UserRole.LOGISTICS_ADMIN]: '后勤管理端',
  [UserRole.DORM_KEEPER]: '各楼宿管',
  [UserRole.TEACHER]: '讲课教师',
  [UserRole.DEPT_HYGIENE_MANAGER]: '院系卫生负责人',
  [UserRole.DEPT_HYGIENE_ADMIN]: '\u9662\u7cfb\u536b\u751f\u7ba1\u7406\u5458',
  [UserRole.CLASS_COMMITTEE]: '班委',
  [UserRole.REPAIRMAN]: '维修师傅',
  [UserRole.STUDENT]: '学生',
}

/**
 * 角色可分配的目标角色
 */
export const ASSIGNABLE_ROLES: Record<UserRole, UserRole[]> = {
  [UserRole.SUPER_ADMIN]: [
    UserRole.AI_OPS_ADMIN,
    UserRole.DEPT_ADMIN,
    UserRole.LOGISTICS_MANAGER,
    UserRole.DORM_MANAGER,
  ],
  [UserRole.AI_OPS_ADMIN]: [],
  [UserRole.DEPT_ADMIN]: [
    UserRole.COUNSELOR,
    UserRole.TEACHER,
    UserRole.DEPT_HYGIENE_MANAGER,
  ],
  [UserRole.LOGISTICS_MANAGER]: [
    UserRole.LOGISTICS_ADMIN,
    UserRole.REPAIRMAN,
  ],
  [UserRole.DORM_MANAGER]: [
    UserRole.DORM_KEEPER,
  ],
  [UserRole.COUNSELOR]: [
    UserRole.CLASS_COMMITTEE,
  ],
  [UserRole.LOGISTICS_ADMIN]: [],
  [UserRole.DORM_KEEPER]: [],
  [UserRole.TEACHER]: [],
  [UserRole.DEPT_HYGIENE_MANAGER]: [
    UserRole.DEPT_HYGIENE_ADMIN,
  ],
  [UserRole.DEPT_HYGIENE_ADMIN]: [],
  [UserRole.CLASS_COMMITTEE]: [],
  [UserRole.REPAIRMAN]: [],
  [UserRole.STUDENT]: [],
}

/**
 * 权限定义
 */
export enum Permission {
  // AI 运维治理
  AI_VIEW = 'ai:view',
  AI_OPERATE = 'ai:operate',
  AI_GOVERNANCE = 'ai:governance',
  AI_RECOVER = 'ai:recover',
  AI_DEBUG = 'ai:debug',
  AI_CONFIGURE = 'ai:configure',
  // 报修管理
  REPAIR_CREATE = 'repair:create',
  REPAIR_VIEW_ALL = 'repair:view_all',
  REPAIR_VIEW_DEPT = 'repair:view_dept',
  REPAIR_ASSIGN = 'repair:assign',
  REPAIR_PROCESS = 'repair:process',
  REPAIR_CLOSE = 'repair:close',

  // 值日管理
  DUTY_CREATE = 'duty:create',
  DUTY_VIEW_ALL = 'duty:view_all',
  DUTY_VIEW_CLASS = 'duty:view_class',
  DUTY_CHECK = 'duty:check',
  DUTY_STAT = 'duty:stat',

  // 教室管理
  CLASSROOM_CREATE = 'classroom:create',
  CLASSROOM_VIEW = 'classroom:view',
  CLASSROOM_BOOK = 'classroom:book',
  CLASSROOM_APPROVE = 'classroom:approve',

  // 宿舍管理
  DORMITORY_CREATE = 'dormitory:create',
  DORMITORY_VIEW = 'dormitory:view',
  DORMITORY_INSPECT = 'dormitory:inspect',
  DORMITORY_ASSIGN = 'dormitory:assign',

  // 学生管理
  STUDENT_CREATE = 'student:create',
  STUDENT_VIEW_ALL = 'student:view_all',
  STUDENT_VIEW_CLASS = 'student:view_class',

  // 通知管理
  NOTIFICATION_CREATE = 'notification:create',
  NOTIFICATION_VIEW = 'notification:view',
  NOTIFICATION_PUBLISH = 'notification:publish',

  // 访客管理
  VISITOR_CREATE = 'visitor:create',
  VISITOR_VIEW = 'visitor:view',
  VISITOR_CHECK_IN = 'visitor:check_in',
  VISITOR_CHECK_OUT = 'visitor:check_out',

  // 能耗管理
  ENERGY_VIEW = 'energy:view',
  ENERGY_MANAGE = 'energy:manage',

  // 课程管理
  COURSE_CREATE = 'course:create',
  COURSE_VIEW = 'course:view',

  // 班级管理
  CLASS_VIEW = 'class:view',
  CLASS_MANAGE = 'class:manage',

  // 权限管理
  PERMISSION_ASSIGN = 'permission:assign',

  // 系统设置
  SETTINGS_MANAGE = 'settings:manage',
}

/**
 * 角色权限映射
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: [
    Permission.AI_VIEW,
    Permission.AI_OPERATE,
    Permission.AI_GOVERNANCE,
    Permission.AI_RECOVER,
    Permission.AI_DEBUG,
    Permission.AI_CONFIGURE,
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_ALL,
    Permission.REPAIR_ASSIGN,
    Permission.REPAIR_PROCESS,
    Permission.REPAIR_CLOSE,
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_ALL,
    Permission.DUTY_CHECK,
    Permission.DUTY_STAT,
    Permission.CLASSROOM_CREATE,
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.CLASSROOM_APPROVE,
    Permission.DORMITORY_CREATE,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.DORMITORY_ASSIGN,
    Permission.STUDENT_CREATE,
    Permission.STUDENT_VIEW_ALL,
    Permission.NOTIFICATION_CREATE,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_PUBLISH,
    Permission.VISITOR_CREATE,
    Permission.VISITOR_VIEW,
    Permission.VISITOR_CHECK_IN,
    Permission.VISITOR_CHECK_OUT,
    Permission.ENERGY_VIEW,
    Permission.ENERGY_MANAGE,
    Permission.COURSE_CREATE,
    Permission.COURSE_VIEW,
    Permission.CLASS_VIEW,
    Permission.CLASS_MANAGE,
    Permission.PERMISSION_ASSIGN,
    Permission.SETTINGS_MANAGE,
  ],

  [UserRole.AI_OPS_ADMIN]: [
    Permission.AI_VIEW,
    Permission.AI_OPERATE,
    Permission.AI_GOVERNANCE,
    Permission.AI_RECOVER,
    Permission.AI_DEBUG,
    Permission.AI_CONFIGURE,
  ],

  [UserRole.DEPT_ADMIN]: [
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_DEPT,
    Permission.REPAIR_ASSIGN,
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_ALL,
    Permission.DUTY_CHECK,
    Permission.DUTY_STAT,
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.CLASSROOM_APPROVE,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.STUDENT_VIEW_ALL,
    Permission.NOTIFICATION_CREATE,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_PUBLISH,
    Permission.VISITOR_VIEW,
    Permission.COURSE_CREATE,
    Permission.COURSE_VIEW,
    Permission.CLASS_VIEW,
    Permission.CLASS_MANAGE,
    Permission.PERMISSION_ASSIGN,
  ],

  [UserRole.LOGISTICS_MANAGER]: [
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_ALL,
    Permission.REPAIR_ASSIGN,
    Permission.REPAIR_CLOSE,
    Permission.DORMITORY_CREATE,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.DORMITORY_ASSIGN,
    Permission.VISITOR_CREATE,
    Permission.VISITOR_VIEW,
    Permission.ENERGY_VIEW,
    Permission.ENERGY_MANAGE,
    Permission.PERMISSION_ASSIGN,
  ],

  [UserRole.DORM_MANAGER]: [
    Permission.DORMITORY_CREATE,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.DORMITORY_ASSIGN,
    Permission.VISITOR_CREATE,
    Permission.VISITOR_VIEW,
    Permission.VISITOR_CHECK_IN,
    Permission.VISITOR_CHECK_OUT,
    Permission.ENERGY_VIEW,
    Permission.NOTIFICATION_CREATE,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_PUBLISH,
    Permission.STUDENT_VIEW_ALL,
    Permission.PERMISSION_ASSIGN,
  ],

  [UserRole.COUNSELOR]: [
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_DEPT,
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_ALL,
    Permission.DUTY_CHECK,
    Permission.DUTY_STAT,
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.STUDENT_VIEW_CLASS,
    Permission.NOTIFICATION_CREATE,
    Permission.NOTIFICATION_VIEW,
    Permission.NOTIFICATION_PUBLISH,
    Permission.VISITOR_VIEW,
    Permission.CLASS_VIEW,
    Permission.CLASS_MANAGE,
    Permission.PERMISSION_ASSIGN,
  ],

  [UserRole.LOGISTICS_ADMIN]: [
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_ALL,
    Permission.REPAIR_ASSIGN,
    Permission.REPAIR_PROCESS,
    Permission.REPAIR_CLOSE,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.ENERGY_VIEW,
  ],

  [UserRole.DORM_KEEPER]: [
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
    Permission.VISITOR_VIEW,
    Permission.VISITOR_CHECK_IN,
    Permission.VISITOR_CHECK_OUT,
    Permission.ENERGY_VIEW,
  ],

  [UserRole.TEACHER]: [
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.COURSE_CREATE,
    Permission.COURSE_VIEW,
    Permission.CLASS_VIEW,
    Permission.NOTIFICATION_VIEW,
  ],

  [UserRole.DEPT_HYGIENE_MANAGER]: [
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_ALL,
    Permission.DUTY_CHECK,
    Permission.DUTY_STAT,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
  ],

  [UserRole.DEPT_HYGIENE_ADMIN]: [
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_ALL,
    Permission.DUTY_CHECK,
    Permission.DORMITORY_VIEW,
    Permission.DORMITORY_INSPECT,
  ],

  [UserRole.CLASS_COMMITTEE]: [
    Permission.REPAIR_CREATE,
    Permission.REPAIR_VIEW_DEPT,
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_CLASS,
    Permission.DUTY_CHECK,
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.DORMITORY_VIEW,
    Permission.STUDENT_VIEW_CLASS,
    Permission.NOTIFICATION_VIEW,
  ],

  [UserRole.REPAIRMAN]: [
    Permission.REPAIR_VIEW_ALL,
    Permission.REPAIR_PROCESS,
    Permission.REPAIR_CLOSE,
    Permission.NOTIFICATION_VIEW,
  ],

  [UserRole.STUDENT]: [
    Permission.REPAIR_CREATE,
    Permission.DUTY_CREATE,
    Permission.DUTY_VIEW_CLASS,
    Permission.CLASSROOM_VIEW,
    Permission.CLASSROOM_BOOK,
    Permission.DORMITORY_VIEW,
    Permission.NOTIFICATION_VIEW,
    Permission.VISITOR_VIEW,
  ],
}
