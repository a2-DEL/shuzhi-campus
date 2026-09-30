import { UserRole } from '@/types'

export type MenuSection = 'baize' | 'business' | 'intelligence' | 'platform'

export const MENU_SECTION_LABELS: Record<MenuSection, string> = {
  baize: '白泽智能体中枢',
  business: '校园业务闭环',
  intelligence: '认知、评测与治理',
  platform: '平台运行与组织',
}

export interface MenuItem {
  title: string
  href: string
  icon: string
  description?: string
  badge?: string
  section: MenuSection
  exact?: boolean
  roles?: UserRole[]
  children?: MenuItem[]
}

const ALL_ROLES = Object.values(UserRole)
const OPERATIONS_ROLES = [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN]
const TWIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER]
const MANAGEMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.AI_OPS_ADMIN,
  UserRole.DEPT_ADMIN,
  UserRole.LOGISTICS_MANAGER,
  UserRole.DORM_MANAGER,
  UserRole.COUNSELOR,
  UserRole.LOGISTICS_ADMIN,
  UserRole.DORM_KEEPER,
  UserRole.TEACHER,
  UserRole.DEPT_HYGIENE_MANAGER,
  UserRole.DEPT_HYGIENE_ADMIN,
  UserRole.CLASS_COMMITTEE,
  UserRole.REPAIRMAN,
]

export const menuItems: MenuItem[] = [
  {
    title: '智能体运营总览', href: '/ai-agents', icon: 'Monitor', badge: 'PRO', section: 'baize', exact: true,
    description: '业务成果、风险、任务与 Agent 态势', roles: ALL_ROLES,
  },
  {
    title: '白泽智能指挥台', href: '/ai-agents/conversation', icon: 'MessageSquare', badge: 'AI', section: 'baize',
    description: '对话接令、任务拆解与总调度', roles: ALL_ROLES,
  },
  {
    title: '全域协同战情室', href: '/ai-agents/runtime', icon: 'Globe', badge: 'LIVE', section: 'baize',
    description: '全屏观察分灵体交接与真实执行', roles: ALL_ROLES,
  },
  {
    title: '可视化流程编排', href: '/ai-agents/workflows', icon: 'GitBranch', badge: 'NEW', section: 'baize',
    description: '拖拽画布、版本发布与持久化执行', roles: ALL_ROLES,
  },
  {
    title: '业务场景编排', href: '/ai-agents/scenarios', icon: 'GitBranch', badge: 'NEW', section: 'baize',
    description: '跨部门场景模板与受控启动', roles: ALL_ROLES,
  },
  {
    title: '任务与人工裁决', href: '/ai-agents/execution', icon: 'Terminal', section: 'baize',
    description: '预览、审批、执行、回读与异常处置', roles: ALL_ROLES,
  },
  {
    title: '多 Agent 协同办公', href: '/ai-agents/collaboration', icon: 'Users', badge: 'LIVE', section: 'baize',
    description: '真实交接、人工裁决与联合交付', roles: ALL_ROLES,
  },
  {
    title: 'Agent 编队与能力', href: '/ai-agents/my-team', icon: 'Users', section: 'baize',
    description: '每个角色的专属 Agent 团队', roles: ALL_ROLES,
  },

  {
    title: '报修与 SLA 作战', href: '/repairs', icon: 'Wrench', section: 'business',
    description: '工单受理、智能派单与现场闭环',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.COUNSELOR, UserRole.LOGISTICS_ADMIN, UserRole.REPAIRMAN, UserRole.CLASS_COMMITTEE],
  },
  {
    title: '教学空间运营', href: '/classrooms', icon: 'Building', section: 'business',
    description: '容量、设施、冲突与活动保障',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.COUNSELOR, UserRole.LOGISTICS_ADMIN, UserRole.DORM_KEEPER, UserRole.TEACHER, UserRole.CLASS_COMMITTEE, UserRole.STUDENT],
  },
  {
    title: '宿舍与安全事件', href: '/dormitories', icon: 'Home', section: 'business',
    description: '楼宇态势、IoT 异常与现场确认',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER, UserRole.COUNSELOR, UserRole.LOGISTICS_ADMIN, UserRole.DORM_KEEPER, UserRole.CLASS_COMMITTEE],
  },
  {
    title: '卫生整改闭环', href: '/duties', icon: 'Calendar', section: 'business',
    description: '检查证据、责任派发与整改验收',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.COUNSELOR, UserRole.DEPT_HYGIENE_MANAGER, UserRole.DEPT_HYGIENE_ADMIN, UserRole.CLASS_COMMITTEE],
  },
  {
    title: '访客准入治理', href: '/visitors', icon: 'UserPlus', section: 'business',
    description: '人工裁决与一次性短效通行凭证',
    roles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER, UserRole.DORM_KEEPER],
  },
  {
    title: '消息触达中心', href: '/notifications', icon: 'Bell', section: 'business',
    description: '受众解析、投递、阅读与确认回执',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.DORM_MANAGER, UserRole.COUNSELOR, UserRole.LOGISTICS_MANAGER, UserRole.STUDENT, UserRole.TEACHER],
  },
  {
    title: '能耗与设备健康', href: '/energy', icon: 'Zap', section: 'business',
    description: '质量读数、异常研判与预测性维护',
    roles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER, UserRole.DEPT_ADMIN],
  },
  {
    title: '失物服务闭环', href: '/lost-found', icon: 'Search', section: 'business',
    description: '隐私保护匹配与人工核验认领',
    roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.COUNSELOR, UserRole.CLASS_COMMITTEE, UserRole.STUDENT],
  },
  {
    title: '物资保障中心', href: '/materials', icon: 'Package', section: 'business',
    description: '库存阈值、申领审批与工单保障',
    roles: [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.LOGISTICS_ADMIN, UserRole.REPAIRMAN],
  },
  {
    title: '我的校园服务', href: '/student/dashboard', icon: 'GraduationCap', section: 'business',
    description: '个人事项、进度与消息入口', roles: [UserRole.STUDENT],
  },

  {
    title: '知识库与向量检索', href: '/ai-agents/knowledge', icon: 'BookOpen', section: 'intelligence',
    description: '版本、权限、混合召回与可验证引用', roles: ALL_ROLES,
  },
  {
    title: '知识图谱与关系链', href: '/ai-agents/graph', icon: 'GitBranch', badge: 'GRAPH', section: 'intelligence',
    description: '实体、原文证据、邻域与可解释路径', roles: ALL_ROLES,
  },
  {
    title: '治理型自进化', href: '/ai-agents/learning', icon: 'BrainCircuit', badge: 'GOV', section: 'intelligence',
    description: '真实信号、固定评测、人工发布与一键回滚', roles: OPERATIONS_ROLES,
  },
  {
    title: 'Skills、插件与 MCP', href: '/ai-agents/skills', icon: 'Puzzle', section: 'intelligence',
    description: '契约、声明式插件与 MCP 工具治理', roles: ALL_ROLES,
  },
  {
    title: '成果与审计账本', href: '/ai-agents/audit', icon: 'FileText', section: 'intelligence',
    description: '效果、回读、审计与 Outbox 证据', roles: ALL_ROLES,
  },
    {
    title: '校园数字孪生', href: '/ai-agents/twin', icon: 'Building', badge: 'TWIN', section: 'intelligence',
    description: '真实快照、情景推演与受控下发', roles: TWIN_ROLES,
  },
{
    title: '多模态可信联邦', href: '/ai-agents/ecosystem', icon: 'Network', badge: 'FED', section: 'intelligence',
    description: '私有证据、签名聚合与隐私预算', roles: OPERATIONS_ROLES,
  },

  {
    title: 'AI 运维驾驶舱', href: '/ai-agents/operations', icon: 'Cpu', badge: 'OPS', section: 'platform',
    description: '运行维护、诊断、恢复与反馈处置', roles: OPERATIONS_ROLES,
  },
  {
    title: '模型路由与预算', href: '/ai-agents/model-gateway', icon: 'BrainCircuit', section: 'platform',
    description: '路由策略、调用上限与成本边界', roles: OPERATIONS_ROLES,
  },
  {
    title: '组织与账号治理', href: '/users', icon: 'Shield', section: 'platform',
    description: '租户人员、角色与授权范围', roles: [UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN, UserRole.DORM_MANAGER, UserRole.COUNSELOR],
  },
  {
    title: '平台运行设置', href: '/settings', icon: 'Settings', section: 'platform',
    description: '系统策略与基础运行参数', roles: MANAGEMENT_ROLES,
  },
]

export function filterMenuByRole(items: MenuItem[], userRole: UserRole): MenuItem[] {
  return items
    .filter((item) => !item.roles?.length || item.roles.includes(userRole))
    .map((item) => item.children?.length ? { ...item, children: filterMenuByRole(item.children, userRole) } : item)
    .filter((item) => !item.children || item.children.length > 0)
}

export function isMenuItemActive(item: MenuItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function findMenuItem(pathname: string): MenuItem | undefined {
  return [...menuItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isMenuItemActive(item, pathname))
}
