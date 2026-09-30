/**
 * 校园设施责任归属知识图谱
 * 
 * 基于"校园设施责任归属知识图谱技术文档"实现的智能责任识别系统
 * 
 * 核心概念：
 * 1. 实体（Entity）：设施类型、位置类型、部门
 * 2. 关系（Relation）：设施-位置-部门 的责任映射
 * 3. 属性（Attribute）：设施详细属性
 */

import { RepairType, Campus, UserRole } from '@/types'

// ============================================
// 一、知识图谱核心数据结构
// ============================================

/**
 * 设施类型节点
 */
export interface FacilityNode {
  id: string
  name: string
  category: 'teaching' | 'dormitory' | 'public' | 'office' | 'campus'
  subCategory?: string
  attributes?: Record<string, string>
}

/**
 * 责任部门节点
 */
export interface DepartmentNode {
  id: string
  name: string
  code: string
  role: UserRole
  responsibilities: string[]  // 负责的设施类型
  contactPhone?: string
}

/**
 * 知识图谱边（关系）
 */
export interface KnowledgeEdge {
  source: string  // 设施类型ID
  target: string   // 部门ID
  relation: 'responsible' | 'secondary' | 'escalate'
  conditions?: {
    campus?: Campus[]
    buildingType?: string[]
    severity?: ('minor' | 'major' | 'critical')[]
  }
}

/**
 * 报修工单输入
 */
export interface RepairOrderInput {
  type: RepairType
  location: string
  campus: Campus
  building?: string
  floor?: number
  room?: string
  description: string
  severity?: 'minor' | 'major' | 'critical'
  images?: string[]
}

/**
 * 责任归属结果
 */
export interface ResponsibilityResult {
  primaryDepartment: DepartmentNode
  secondaryDepartments?: DepartmentNode[]
  matchedRule: string
  confidence: number  // 0-1 置信度
  reasoning: string
}

// ============================================
// 二、知识图谱规则库
// ============================================

/**
 * 设施类型映射表
 */
const FACILITY_TYPES: Record<RepairType, FacilityNode> = {
  [RepairType.DESK_CHAIR]: {
    id: 'desk_chair',
    name: '桌椅',
    category: 'teaching',
    subCategory: '教室家具',
    attributes: { type: '固定设施', material: '木质/金属' }
  },
  [RepairType.LIGHTING]: {
    id: 'lighting',
    name: '照明设备',
    category: 'teaching',
    subCategory: '电气设备',
    attributes: { type: '电气', voltage: '220V' }
  },
  [RepairType.AIR_CONDITIONER]: {
    id: 'ac',
    name: '空调',
    category: 'teaching',
    subCategory: '暖通设备',
    attributes: { type: '暖通', maintenance: '定期' }
  },
  [RepairType.NETWORK]: {
    id: 'network',
    name: '网络设备',
    category: 'campus',
    subCategory: '信息网络',
    attributes: { type: '弱电', system: '校园网' }
  },
  [RepairType.PLUMBING]: {
    id: 'plumbing',
    name: '水暖设施',
    category: 'public',
    subCategory: '管线设施',
    attributes: { type: '水暖', system: '给排水' }
  },
  [RepairType.ELECTRICAL]: {
    id: 'electrical',
    name: '电气设施',
    category: 'public',
    subCategory: '电气设备',
    attributes: { type: '电气', voltage: '220V/380V' }
  },
  [RepairType.OTHER]: {
    id: 'other',
    name: '其他设施',
    category: 'public',
    subCategory: '综合',
    attributes: { type: '综合' }
  }
}

/**
 * 责任部门定义
 */
export const DEPARTMENTS: Record<string, DepartmentNode> = {
  logistics_electrical: {
    id: 'logistics_electrical',
    name: '后勤处-电力维修组',
    code: 'LOG_ELEC',
    role: UserRole.LOGISTICS_ADMIN,
    responsibilities: ['lighting', 'electrical', 'ac'],
    contactPhone: '0571-88888801'
  },
  logistics_plumbing: {
    id: 'logistics_plumbing',
    name: '后勤处-水暖维修组',
    code: 'LOG_PLUMB',
    role: UserRole.LOGISTICS_ADMIN,
    responsibilities: ['plumbing'],
    contactPhone: '0571-88888802'
  },
  logistics_furniture: {
    id: 'logistics_furniture',
    name: '后勤处-家具维修组',
    code: 'LOG_FURN',
    role: UserRole.LOGISTICS_ADMIN,
    responsibilities: ['desk_chair'],
    contactPhone: '0571-88888803'
  },
  it_center: {
    id: 'it_center',
    name: '现教中心-网络运维组',
    code: 'IT_NET',
    role: UserRole.SUPER_ADMIN,
    responsibilities: ['network'],
    contactPhone: '0571-88888810'
  },
  dormitory_office: {
    id: 'dormitory_office',
    name: '宿管中心',
    code: 'DORM',
    role: UserRole.DORM_MANAGER,
    responsibilities: ['desk_chair', 'lighting', 'electrical', 'plumbing'],
    contactPhone: '0571-88888820'
  }
}

/**
 * 知识图谱规则引擎
 * 定义：设施类型 + 位置特征 → 责任部门
 */
const RESPONSIBILITY_RULES: Array<{
  id: string
  priority: number
  match: (input: RepairOrderInput) => boolean
  primaryDepartment: string
  secondaryDepartments?: string[]
  confidence: number
  reasoning: string
}> = [
  // 规则1：教室桌椅 → 家具维修组
  {
    id: 'rule_classroom_desk_chair',
    priority: 100,
    match: (input) => {
      const isDeskChair = input.type === RepairType.DESK_CHAIR
      const locationMatch = input.location.includes('教室') || input.location.includes('教学楼')
      const buildingMatch = input.building ? input.building.includes('教学楼') : false
      return isDeskChair && (locationMatch || buildingMatch)
    },
    primaryDepartment: 'logistics_furniture',
    confidence: 0.95,
    reasoning: '教室桌椅由后勤处家具维修组负责'
  },
  
  // 规则2：宿舍桌椅 → 宿管中心
  {
    id: 'rule_dorm_desk_chair',
    priority: 100,
    match: (input) => {
      const isDeskChair = input.type === RepairType.DESK_CHAIR
      const locationMatch = input.location.includes('宿舍') || input.location.includes('公寓')
      const buildingMatch = input.building ? 
        (input.building.includes('宿舍') || input.building.includes('公寓')) : false
      return isDeskChair && (locationMatch || buildingMatch)
    },
    primaryDepartment: 'dormitory_office',
    secondaryDepartments: ['logistics_furniture'],
    confidence: 0.90,
    reasoning: '宿舍桌椅由宿管中心负责，复杂维修转后勤处理'
  },
  
  // 规则3：照明设备 → 电力维修组
  {
    id: 'rule_lighting',
    priority: 90,
    match: (input) => input.type === RepairType.LIGHTING,
    primaryDepartment: 'logistics_electrical',
    confidence: 0.95,
    reasoning: '照明设备由后勤处电力维修组负责'
  },
  
  // 规则4：空调 → 电力维修组
  {
    id: 'rule_ac',
    priority: 90,
    match: (input) => input.type === RepairType.AIR_CONDITIONER,
    primaryDepartment: 'logistics_electrical',
    confidence: 0.90,
    reasoning: '空调维修由后勤处电力维修组负责'
  },
  
  // 规则5：网络 → 现教中心
  {
    id: 'rule_network',
    priority: 95,
    match: (input) => input.type === RepairType.NETWORK,
    primaryDepartment: 'it_center',
    confidence: 0.98,
    reasoning: '校园网络由现教中心网络运维组负责'
  },
  
  // 规则6：水暖 → 水暖维修组
  {
    id: 'rule_plumbing',
    priority: 90,
    match: (input) => input.type === RepairType.PLUMBING,
    primaryDepartment: 'logistics_plumbing',
    confidence: 0.95,
    reasoning: '水暖设施由后勤处水暖维修组负责'
  },
  
  // 规则7：电气（插座、配电）→ 电力维修组
  {
    id: 'rule_electrical',
    priority: 90,
    match: (input) => {
      return input.type === RepairType.ELECTRICAL ||
             input.description.includes('插座') ||
             input.description.includes('配电') ||
             input.description.includes('漏电')
    },
    primaryDepartment: 'logistics_electrical',
    confidence: 0.92,
    reasoning: '电气设施由后勤处电力维修组负责'
  },
  
  // 规则8：宿舍基础设施 → 宿管中心（优先）
  {
    id: 'rule_dorm_infrastructure',
    priority: 85,
    match: (input) => {
      return (input.location.includes('宿舍') || 
              input.location.includes('公寓')) &&
             (input.description.includes('门') ||
              input.description.includes('窗') ||
              input.description.includes('锁') ||
              input.description.includes('水') ||
              input.description.includes('电'))
    },
    primaryDepartment: 'dormitory_office',
    secondaryDepartments: ['logistics_electrical', 'logistics_plumbing'],
    confidence: 0.88,
    reasoning: '宿舍日常维修优先由宿管中心处理'
  },
  
  // 规则9：紧急故障 → 多部门联合响应
  {
    id: 'rule_urgent',
    priority: 99,
    match: (input) => input.severity === 'critical',
    primaryDepartment: 'logistics_electrical',
    secondaryDepartments: ['logistics_plumbing', 'it_center'],
    confidence: 0.85,
    reasoning: '紧急故障启动多部门联合响应机制'
  },
  
  // 规则10：默认规则
  {
    id: 'rule_default',
    priority: 1,
    match: () => true,
    primaryDepartment: 'logistics_electrical',
    confidence: 0.50,
    reasoning: '无法识别类型，转后勤处统一处理'
  }
]

// ============================================
// 三、知识图谱推理引擎
// ============================================

/**
 * 知识图谱推理器
 */
export class ResponsibilityKnowledgeGraph {
  private rules: typeof RESPONSIBILITY_RULES
  
  constructor(customRules?: typeof RESPONSIBILITY_RULES) {
    this.rules = customRules || RESPONSIBILITY_RULES
  }
  
  /**
   * 添加自定义规则
   */
  addRule(rule: typeof RESPONSIBILITY_RULES[0]) {
    this.rules.push(rule)
    // 按优先级排序
    this.rules.sort((a, b) => b.priority - a.priority)
  }
  
  /**
   * 查询报修工单的责任归属
   */
  query(input: RepairOrderInput): ResponsibilityResult {
    // 按优先级遍历规则，找到第一个匹配的
    const matchedRule = this.rules.find(rule => rule.match(input))
    
    if (!matchedRule) {
      // 默认兜底
      return {
        primaryDepartment: DEPARTMENTS.logistics_electrical,
        confidence: 0.3,
        matchedRule: 'fallback',
        reasoning: '系统默认分配'
      }
    }
    
    const primaryDept = DEPARTMENTS[matchedRule.primaryDepartment]
    const secondaryDepts = matchedRule.secondaryDepartments?.map(
      id => DEPARTMENTS[id]
    ).filter(Boolean)
    
    return {
      primaryDepartment: primaryDept,
      secondaryDepartments: secondaryDepts,
      matchedRule: matchedRule.id,
      confidence: matchedRule.confidence,
      reasoning: matchedRule.reasoning
    }
  }
  
  /**
   * 批量查询
   */
  queryBatch(orders: RepairOrderInput[]): ResponsibilityResult[] {
    return orders.map(order => this.query(order))
  }
  
  /**
   * 获取所有可用规则
   */
  getRules() {
    return this.rules.map(rule => ({
      id: rule.id,
      priority: rule.priority,
      confidence: rule.confidence,
      reasoning: rule.reasoning
    }))
  }
}

// 导出单例实例
export const responsibilityGraph = new ResponsibilityKnowledgeGraph()

/**
 * 便捷函数：根据报修信息获取责任部门
 */
export function getResponsibility(input: RepairOrderInput): ResponsibilityResult {
  return responsibilityGraph.query(input)
}

/**
 * 根据设施类型获取所有负责部门
 */
export function getDepartmentsForFacility(type: RepairType): DepartmentNode[] {
  return Object.values(DEPARTMENTS).filter(dept => 
    dept.responsibilities.includes(FACILITY_TYPES[type]?.id || type)
  )
}
