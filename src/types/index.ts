// Canonical 14-role model from the approved role planning material.
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  AI_OPS_ADMIN = 'ai_ops_admin',
  DEPT_ADMIN = 'dept_admin',
  DEPT_HYGIENE_MANAGER = 'dept_hygiene_manager',
  DEPT_HYGIENE_ADMIN = 'dept_hygiene_admin',
  COUNSELOR = 'counselor',
  TEACHER = 'teacher',
  LOGISTICS_MANAGER = 'logistics_manager',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPAIRMAN = 'repairman',
  DORM_MANAGER = 'dorm_manager',
  DORM_KEEPER = 'dorm_keeper',
  STUDENT = 'student',
  CLASS_COMMITTEE = 'class_committee',
}

export const ROLE_HIERARCHY: Record<UserRole, { level: number; parent?: UserRole }> = {
  [UserRole.SUPER_ADMIN]: { level: 1 },
  [UserRole.AI_OPS_ADMIN]: { level: 2, parent: UserRole.SUPER_ADMIN },
  [UserRole.DEPT_ADMIN]: { level: 2, parent: UserRole.SUPER_ADMIN },
  [UserRole.DEPT_HYGIENE_MANAGER]: { level: 3, parent: UserRole.DEPT_ADMIN },
  [UserRole.DEPT_HYGIENE_ADMIN]: { level: 4, parent: UserRole.DEPT_HYGIENE_MANAGER },
  [UserRole.COUNSELOR]: { level: 3, parent: UserRole.DEPT_ADMIN },
  [UserRole.TEACHER]: { level: 3, parent: UserRole.DEPT_ADMIN },
  [UserRole.LOGISTICS_MANAGER]: { level: 2, parent: UserRole.SUPER_ADMIN },
  [UserRole.LOGISTICS_ADMIN]: { level: 3, parent: UserRole.LOGISTICS_MANAGER },
  [UserRole.REPAIRMAN]: { level: 4, parent: UserRole.LOGISTICS_ADMIN },
  [UserRole.DORM_MANAGER]: { level: 2, parent: UserRole.SUPER_ADMIN },
  [UserRole.DORM_KEEPER]: { level: 3, parent: UserRole.DORM_MANAGER },
  [UserRole.STUDENT]: { level: 4, parent: UserRole.COUNSELOR },
  [UserRole.CLASS_COMMITTEE]: { level: 4, parent: UserRole.COUNSELOR },
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '\u73b0\u4ee3\u6280\u672f\u6559\u80b2\u4e2d\u5fc3\u7ba1\u7406\u5458',
  [UserRole.AI_OPS_ADMIN]: 'AI系统运维管理员',
  [UserRole.DEPT_ADMIN]: '\u9662\u7cfb\u7ba1\u7406\u8001\u5e08',
  [UserRole.DEPT_HYGIENE_MANAGER]: '\u9662\u7cfb\u536b\u751f\u8d1f\u8d23\u4eba',
  [UserRole.DEPT_HYGIENE_ADMIN]: '\u9662\u7cfb\u536b\u751f\u7ba1\u7406\u5458',
  [UserRole.COUNSELOR]: '\u8f85\u5bfc\u5458',
  [UserRole.TEACHER]: '\u4efb\u8bfe\u6559\u5e08',
  [UserRole.LOGISTICS_MANAGER]: '\u540e\u52e4\u57fa\u5efa\u5904\u8d1f\u8d23\u4eba',
  [UserRole.LOGISTICS_ADMIN]: '\u540e\u52e4\u57fa\u5efa\u5904\u7ba1\u7406\u7aef',
  [UserRole.REPAIRMAN]: '\u7ef4\u4fee\u5e08\u5085',
  [UserRole.DORM_MANAGER]: '\u5bbf\u7ba1\u4e2d\u5fc3\u8d1f\u8d23\u4eba',
  [UserRole.DORM_KEEPER]: '\u5404\u5bbf\u820d\u697c\u5bbf\u7ba1',
  [UserRole.STUDENT]: '\u666e\u901a\u5b66\u751f',
  [UserRole.CLASS_COMMITTEE]: '\u73ed\u59d4',
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    'user:*', 'role:*', 'permission:*', 'repair:*', 'classroom:*',
    'material:*', 'notification:*', 'dorm:*', 'lost:*', 'duty:*', 'energy:*', 'visitor:*', 'ai:*',
  ],
  [UserRole.AI_OPS_ADMIN]: ['ai:*'],
  [UserRole.DEPT_ADMIN]: [
    'user:view', 'user:create', 'user:edit', 'role:view', 'role:assign', 'classroom:*', 'notification:*', 'duty:*',
  ],
  [UserRole.DEPT_HYGIENE_MANAGER]: ['duty:*', 'notification:view'],
  [UserRole.DEPT_HYGIENE_ADMIN]: ['duty:view', 'duty:create', 'duty:edit', 'duty:check'],
  [UserRole.COUNSELOR]: ['student:view', 'duty:view', 'notification:view'],
  [UserRole.TEACHER]: ['classroom:view', 'classroom:book', 'notification:view'],
  [UserRole.LOGISTICS_MANAGER]: ['repair:*', 'material:*', 'notification:*'],
  [UserRole.LOGISTICS_ADMIN]: ['repair:view', 'repair:dispatch', 'material:*'],
  [UserRole.REPAIRMAN]: ['repair:view', 'repair:process', 'repair:complete'],
  [UserRole.DORM_MANAGER]: ['dorm:*', 'visitor:*', 'energy:*', 'notification:*'],
  [UserRole.DORM_KEEPER]: ['dorm:view', 'dorm:inspect', 'visitor:check'],
  [UserRole.STUDENT]: ['repair:create', 'repair:view:own', 'classroom:view', 'lost:*', 'notification:view'],
  [UserRole.CLASS_COMMITTEE]: ['repair:create', 'repair:view:own', 'classroom:book', 'duty:create', 'lost:*', 'notification:view'],
}

// User status
export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

// 院系列表
export const DEPARTMENTS = [
  '数计学院',
  '物理学院',
  '化学系',
  '计算机系',
  '生命科学系',
  '海洋学院',
  '体育系',
  '音乐系',
] as const

export type Department = typeof DEPARTMENTS[number]

// 班级格式：年级 + 专业 + 班号
export interface ClassInfo {
  grade: string // 如 "24级"
  major: string // 如 "资产评估专业"
  classNumber: string // 如 "1班"
  fullName: string // 如 "24级资产评估专业1班"
}

// 校区
export const CAMPUSES = ['南校区', '北校区'] as const
export type Campus = typeof CAMPUSES[number]

// 教室命名规则：校区 + 楼号 + 楼层 + 教室顺序
// 如：南校区2103 = 南校区二号楼一层03教室
export interface ClassroomInfo {
  campus: Campus
  building: string // 楼号
  floor: number // 楼层（1-9）
  roomNumber: string // 教室顺序（01-99）
  fullName: string // 完整名称
}

// 报修损坏类型
export const DAMAGE_TYPES = [
  '桌椅晃动',
  '座板脱落',
  '座板下垂',
  '座板开裂',
  '座板无弹簧',
  '座板螺母脱落',
  '座板不能翻转',
  '上桌板脱落',
  '下桌板脱落',
  '桌板开裂',
  '靠背板脱落',
  '靠背板开裂',
  '扶手脱落',
] as const

export type DamageType = typeof DAMAGE_TYPES[number]

// 失物类型
export const LOST_FOUND_TYPES = [
  '书',
  '书包',
  '证件',
  '其他物品',
] as const

export type LostFoundType = typeof LOST_FOUND_TYPES[number]

// 报修工单状态 - 根据文档定义
export enum RepairStatus {
  PENDING = 'PENDING', // 待派单
  DISPATCHED = 'DISPATCHED', // 已派单
  PROCESSING = 'PROCESSING', // 处理中
  COMPLETED = 'COMPLETED', // 已完成
  CLOSED = 'CLOSED', // 已关闭
  REJECTED = 'REJECTED', // 已拒单
}

// 工单处理日志操作类型
export enum RepairAction {
  CREATE = 'CREATE', // 创建工单
  DISPATCH = 'DISPATCH', // 派单
  START = 'START', // 开始处理
  COMPLETE = 'COMPLETE', // 完成
  CLOSE = 'CLOSE', // 关闭
  REJECT = 'REJECT', // 拒单
  REASSIGN = 'REASSIGN', // 重新派单
}

// 报修类型
export enum RepairType {
  DESK_CHAIR = 'DESK_CHAIR', // 桌椅
  LIGHTING = 'LIGHTING', // 照明
  AIR_CONDITIONER = 'AIR_CONDITIONER', // 空调
  NETWORK = 'NETWORK', // 网络
  PLUMBING = 'PLUMBING', // 水暖
  ELECTRICAL = 'ELECTRICAL', // 电气
  OTHER = 'OTHER', // 其他
}

// 报修优先级
export enum RepairPriority {
  URGENT = 1, // 紧急
  NORMAL = 2, // 普通
  LOW = 3, // 低
}

// 用户信息
export type RoleScopeType = 'global' | 'school' | 'campus' | 'organization' | 'class' | 'building' | 'self'

export interface UserRoleAssignment {
  id: string
  school_id: string
  user_id: string
  role: UserRole
  scope_type: RoleScopeType
  scope_id?: string
  is_primary: boolean
  status: 'active' | 'suspended' | 'revoked'
  valid_from: string
  valid_until?: string
  granted_by?: string
  source?: 'direct' | 'delegation'
}

export interface User {
  id: string
  user_id: string // 学号/工号
  name: string
  role: UserRole
  school_id?: string
  primary_organization_id?: string
  primary_campus_id?: string
  auth_version?: number
  role_assignments?: UserRoleAssignment[]
  role_id?: number // 角色ID（关联role表）
  department?: string
  college_id?: number // 学院ID
  class_id?: number // 班级ID
  class_name?: string
  phone?: string
  email?: string
  status: UserStatus
  avatar?: string
  wechat_openid?: string
  wechat_unionid?: string
  last_login_at?: string
  created_at: string
  updated_at: string
  is_deleted?: boolean
}

// 角色信息（支持树形结构）
export interface Role {
  id: number
  name: string
  code: string
  parent_id: number
  level: number
  permissions: string[]
  created_at: string
}

// 报修工单
export interface RepairOrder {
  id: string
  order_no: string // 工单编号：REP+年月日+流水号
  title: string
  damage_type: DamageType
  repair_type: RepairType
  location: string
  description: string
  images?: string[]
  status: RepairStatus
  priority: RepairPriority
  reporter_id: string
  assignee_id?: string
  assigned_at?: string
  started_at?: string
  completed_at?: string
  rating?: number // 评分1-5
  comment?: string // 评价内容
  created_at: string
  updated_at: string
  is_deleted?: boolean
}

// 工单处理日志
export interface RepairProcessLog {
  id: string
  order_id: string
  operator_id: string
  operator_name?: string
  action: RepairAction
  before_status?: RepairStatus
  after_status?: RepairStatus
  remark?: string
  created_at: string
}

// 教室预约状态
export enum ClassroomStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
}

// 教室
export interface Classroom {
  id: string
  campus: Campus
  building: string
  floor: number
  room_number: string
  full_name: string
  capacity: number
  status: ClassroomStatus
  facilities?: string[]
}

// 教室预约
export interface ClassroomBooking {
  id: string
  classroom_id: string
  applicant_id: string
  booking_date: string
  time_slot: string
  purpose: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// 值日安排
export interface DutySchedule {
  id: string
  duty_date: string
  class_name: string
  location: string
  students: string[]
  duty_type: 'cleaning' | 'inspection'
  status: 'pending' | 'completed'
  created_at: string
}

// 宿舍巡查记录
export interface DormInspection {
  id: string
  dormitory_id: string
  room_number: string
  inspector_id: string
  inspection_date: string
  score: number
  issues?: string[]
  images?: string[]
  notes?: string
  created_at: string
}

// 物资状态
export enum MaterialStatus {
  NORMAL = 'normal',
  WARNING = 'warning',
  OUT_OF_STOCK = 'out_of_stock',
}

// 物资
export interface Material {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  threshold: number
  status: MaterialStatus
  location?: string
  updated_at: string
}

// 物资申领记录
export interface MaterialRequest {
  id: string
  material_id: string
  quantity: number
  requester_id: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  created_at: string
}

// 通知公告
export interface Notification {
  id: string
  title: string
  content: string
  type: 'EXAM' | 'REPAIR' | 'ACTIVITY' | 'SYSTEM' // 根据文档定义
  target_type: 'ROLE' | 'USER' | 'ALL' // 目标类型
  target_ids?: string[] // 目标ID列表
  publisher_id: string
  send_at: string
  is_timed?: boolean // 是否定时发送
  scheduled_at?: string
  status: 'SENT' | 'SCHEDULED' | 'FAILED'
  created_at: string
}

// 通知阅读记录
export interface NotificationRead {
  id: string
  notification_id: string
  user_id: string
  read_at: string
}

// 失物招领（扩展）
export interface LostFound {
  id: string
  type: 'lost' | 'found'
  item_type: LostFoundType
  item_name: string
  description?: string
  location?: string
  found_date?: string // 拾获日期
  images?: string[]
  reporter_id: string
  status: 'open' | 'matched' | 'claimed' | 'closed'
  matched_id?: string // 匹配的失物/招领ID
  match_score?: number // 匹配度
  created_at: string
}

// 失物匹配记录
export interface LostFoundMatch {
  id: string
  lost_id: string
  found_id: string
  match_score: number
  status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
}

// 统计数据
export interface DashboardStats {
  totalUsers: number
  todayRepairs: number
  processingRepairs: number
  completedRepairs: number
  classroomUsageRate: number
  materialNormal: number
  materialWarning: number
  materialOutOfStock: number
}

// 分页参数
export interface PaginationParams {
  page: number
  pageSize: number
  total?: number
}

// 分页响应
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// API 响应
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// 登录请求
export interface LoginRequest {
  userId: string // 学号/工号
  password: string
}

// 登录响应
export interface LoginResponse {
  user: User
}

// 访客管理
export interface Visitor {
  id: string
  visitor_name: string
  visitor_phone: string
  visitor_id_card?: string // 加密存储
  host_id: string // 被访人ID
  host_name: string
  dormitory: string
  room_number: string
  visit_purpose: string
  visit_date: string
  check_in_time?: string
  check_out_time?: string
  qr_code?: string // 访客二维码
  status: 'pending' | 'checked_in' | 'checked_out' | 'expired'
  created_at: string
}

// 宿舍能耗监控
export interface EnergyUsage {
  id: string
  dormitory: string
  room_number: string
  electricity_usage: number // 电量（度）
  water_usage: number // 用水量（吨）
  month: string // 统计月份 YYYY-MM
  created_at: string
}

// 能耗预警
export interface EnergyAlert {
  id: string
  dormitory: string
  room_number: string
  alert_type: 'high' | 'abnormal' // 高用量/异常
  threshold: number
  actual_value: number
  status: 'pending' | 'notified' | 'resolved'
  created_at: string
}

// 卫生检查记录
export interface HygieneInspection {
  id: string
  location: string // 教室/宿舍
  room_number: string
  inspector_id: string
  inspection_date: string
  score: number
  items: {
    name: string
    score: number
    max_score: number
    issues?: string[]
  }[]
  issues?: string[]
  images?: string[]
  notes?: string
  status: 'pending' | 'completed' | 'reviewed'
  created_at: string
}

// 数据权限过滤条件
export interface DataPermissionFilter {
  user_id?: string
  role?: UserRole
  college_id?: number
  class_id?: number
  building?: string
  dormitory?: string
}
