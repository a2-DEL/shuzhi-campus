/**
 * 多维度智能派单算法
 * 
 * 基于"多维度智能派单算法技术文档"实现
 * 
 * 核心目标：解决传统派单的三大问题
 * 1. 派单效率低 - 自动化派单，减少人工判断时间
 * 2. 负载不均衡 - 智能均衡维修人员工作量
 * 3. 派单质量不稳定 - 多维度综合评分，确保派单质量
 */

import { RepairType, Campus, UserRole } from '@/types'

// ============================================
// 一、数据结构定义
// ============================================

/**
 * 维修人员信息
 */
export interface Repairman {
  id: string
  name: string
  role: UserRole
  department: string
  // 技能相关
  skills: RepairType[]
  skillLevel: Partial<Record<RepairType, number>>
  // 位置相关
  campus: Campus
  building?: string
  // 工作状态
  currentWorkload: number
  maxWorkload: number
  isAvailable: boolean
  // 历史表现
  avgRating: number
  completedOrders: number
  avgCompleteTime: number
}

/**
 * 报修工单
 */
export interface RepairOrder {
  id: string
  type: RepairType
  location: string
  campus: Campus
  building?: string
  floor?: number
  room?: string
  description: string
  severity: 'minor' | 'major' | 'critical'
  reporter?: { id: string; name: string }
  createdAt: string
  deadline?: string
}

/**
 * 派单结果
 */
export interface DispatchResult {
  recommendedRepairman: Repairman | null
  allCandidates: Array<{
    repairman: Repairman
    score: number
    breakdown: DimensionScore
  }>
  estimatedTime: number
  reasoning: string
}

/**
 * 各维度评分
 */
export interface DimensionScore {
  skillMatch: number
  workloadBalance: number
  distance: number
  urgency: number
  rating: number
}

/**
 * 派单算法配置
 */
export interface DispatchConfig {
  // 各维度权重（总和应为100）
  weights: {
    skillMatch: number
    workloadBalance: number
    distance: number
    urgency: number
    rating: number
  }
  // 技能匹配阈值
  minSkillLevel: number
  // 最大候选人数
  maxCandidates: number
}

// 默认配置
const DEFAULT_CONFIG: DispatchConfig = {
  weights: {
    skillMatch: 35,      // 技能匹配最重要
    workloadBalance: 25,  // 负载均衡
    distance: 20,        // 距离因素
    urgency: 10,         // 紧急程度
    rating: 10           // 历史评价
  },
  minSkillLevel: 2,
  maxCandidates: 5
}

// ============================================
// 二、模拟维修人员数据
// ============================================

export const MOCK_REPAIRMEN: Repairman[] = [
  {
    id: 'rp001',
    name: '张师傅',
    role: UserRole.REPAIRMAN,
    department: '电力维修组',
    skills: [RepairType.LIGHTING, RepairType.AIR_CONDITIONER, RepairType.ELECTRICAL],
    skillLevel: {
      [RepairType.LIGHTING]: 5,
      [RepairType.AIR_CONDITIONER]: 4,
      [RepairType.ELECTRICAL]: 5,
      [RepairType.PLUMBING]: 1,
      [RepairType.DESK_CHAIR]: 2,
      [RepairType.NETWORK]: 1,
      [RepairType.OTHER]: 2
    },
    campus: '南校区',
    building: '后勤楼',
    currentWorkload: 2,
    maxWorkload: 5,
    isAvailable: true,
    avgRating: 4.8,
    completedOrders: 156,
    avgCompleteTime: 45
  },
  {
    id: 'rp002',
    name: '李师傅',
    role: UserRole.REPAIRMAN,
    department: '水暖维修组',
    skills: [RepairType.PLUMBING, RepairType.DESK_CHAIR],
    skillLevel: {
      [RepairType.PLUMBING]: 5,
      [RepairType.DESK_CHAIR]: 4,
      [RepairType.LIGHTING]: 1,
      [RepairType.AIR_CONDITIONER]: 1,
      [RepairType.ELECTRICAL]: 2,
      [RepairType.NETWORK]: 1,
      [RepairType.OTHER]: 2
    },
    campus: '南校区',
    building: '后勤楼',
    currentWorkload: 1,
    maxWorkload: 4,
    isAvailable: true,
    avgRating: 4.6,
    completedOrders: 89,
    avgCompleteTime: 60
  },
  {
    id: 'rp003',
    name: '王师傅',
    role: UserRole.REPAIRMAN,
    department: '家具维修组',
    skills: [RepairType.DESK_CHAIR, RepairType.PLUMBING, RepairType.OTHER],
    skillLevel: {
      [RepairType.DESK_CHAIR]: 5,
      [RepairType.PLUMBING]: 3,
      [RepairType.OTHER]: 4,
      [RepairType.LIGHTING]: 1,
      [RepairType.AIR_CONDITIONER]: 1,
      [RepairType.ELECTRICAL]: 2,
      [RepairType.NETWORK]: 1
    },
    campus: '南校区',
    building: '后勤楼',
    currentWorkload: 3,
    maxWorkload: 5,
    isAvailable: true,
    avgRating: 4.9,
    completedOrders: 203,
    avgCompleteTime: 35
  },
  {
    id: 'rp004',
    name: '陈师傅',
    role: UserRole.REPAIRMAN,
    department: '电力维修组',
    skills: [RepairType.LIGHTING, RepairType.AIR_CONDITIONER, RepairType.ELECTRICAL, RepairType.NETWORK],
    skillLevel: {
      [RepairType.LIGHTING]: 4,
      [RepairType.AIR_CONDITIONER]: 4,
      [RepairType.ELECTRICAL]: 4,
      [RepairType.NETWORK]: 3,
      [RepairType.PLUMBING]: 1,
      [RepairType.DESK_CHAIR]: 1,
      [RepairType.OTHER]: 2
    },
    campus: '北校区',
    building: '北后勤楼',
    currentWorkload: 4,
    maxWorkload: 5,
    isAvailable: true,
    avgRating: 4.5,
    completedOrders: 124,
    avgCompleteTime: 55
  },
  {
    id: 'rp005',
    name: '刘师傅',
    role: UserRole.REPAIRMAN,
    department: '网络运维组',
    skills: [RepairType.NETWORK, RepairType.ELECTRICAL],
    skillLevel: {
      [RepairType.NETWORK]: 5,
      [RepairType.ELECTRICAL]: 3,
      [RepairType.LIGHTING]: 1,
      [RepairType.AIR_CONDITIONER]: 1,
      [RepairType.PLUMBING]: 1,
      [RepairType.DESK_CHAIR]: 1,
      [RepairType.OTHER]: 2
    },
    campus: '南校区',
    building: '信息中心',
    currentWorkload: 2,
    maxWorkload: 6,
    isAvailable: true,
    avgRating: 4.7,
    completedOrders: 178,
    avgCompleteTime: 40
  }
]

// ============================================
// 三、多维度评分引擎
// ============================================

/**
 * 位置距离计算（简化版，实际可用地理围栏）
 * 返回距离评分 0-100
 */
function calculateDistanceScore(
  orderCampus: Campus,
  orderBuilding: string | undefined,
  repairmanCampus: Campus,
  repairmanBuilding: string | undefined
): number {
  // 不同校区
  if (orderCampus !== repairmanCampus) {
    return 30 // 跨校区，扣分
  }
  
  // 同校区不同楼
  if (orderBuilding && repairmanBuilding && orderBuilding !== repairmanBuilding) {
    return 70
  }
  
  // 同楼
  return 100
}

/**
 * 技能匹配度计算
 * 返回 0-100
 */
function calculateSkillMatchScore(
  orderType: RepairType,
  repairman: Repairman
): number {
  // 检查是否具备该技能
  if (!repairman.skills.includes(orderType)) {
    return 10 // 无技能
  }
  
  // 技能等级评分 (1-5 -> 0-100)
  const skillLevel = repairman.skillLevel[orderType] || 1
  return Math.min(100, skillLevel * 20 + 20)
}

/**
 * 负载均衡度计算
 * 返回 0-100，负载越低分数越高
 */
function calculateWorkloadScore(repairman: Repairman): number {
  const utilizationRate = repairman.currentWorkload / repairman.maxWorkload
  return Math.max(0, Math.round(100 * (1 - utilizationRate)))
}

/**
 * 紧急程度评分
 * 返回 0-100
 */
function calculateUrgencyScore(severity: 'minor' | 'major' | 'critical'): number {
  switch (severity) {
    case 'critical': return 100  // 紧急优先
    case 'major': return 60
    case 'minor': return 30
    default: return 50
  }
}

/**
 * 历史评价评分
 * 返回 0-100
 */
function calculateRatingScore(avgRating: number): number {
  return Math.round(avgRating * 20) // 4.5分 -> 90分
}

// ============================================
// 四、智能派单算法
// ============================================

/**
 * 多维度智能派单算法
 */
export class MultiDimensionDispatch {
  private config: DispatchConfig
  private repairmen: Repairman[]
  
  constructor(
    config: Partial<DispatchConfig> = {},
    repairmen: Repairman[] = MOCK_REPAIRMEN
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.repairmen = repairmen
  }
  
  /**
   * 更新维修人员状态
   */
  updateRepairman(repairman: Repairman) {
    const index = this.repairmen.findIndex(r => r.id === repairman.id)
    if (index >= 0) {
      this.repairmen[index] = repairman
    }
  }
  
  /**
   * 批量更新
   */
  updateRepairmen(repairmen: Repairman[]) {
    repairmen.forEach(rp => this.updateRepairman(rp))
  }
  
  /**
   * 获取可用维修人员
   */
  getAvailableRepairmen(orderType: RepairType): Repairman[] {
    return this.repairmen.filter(rp => 
      rp.isAvailable && 
      rp.skills.includes(orderType) &&
      rp.currentWorkload < rp.maxWorkload &&
      (rp.skillLevel[orderType] || 1) >= this.config.minSkillLevel
    )
  }
  
  /**
   * 计算单个候选人的综合评分
   */
  calculateScore(
    order: RepairOrder,
    repairman: Repairman
  ): { total: number; breakdown: DimensionScore } {
    // 各维度得分
    const skillMatch = calculateSkillMatchScore(order.type, repairman)
    const workloadBalance = calculateWorkloadScore(repairman)
    const distance = calculateDistanceScore(
      order.campus,
      order.building,
      repairman.campus,
      repairman.building
    )
    const urgency = calculateUrgencyScore(order.severity)
    const rating = calculateRatingScore(repairman.avgRating)
    
    // 综合评分
    const total = Math.round(
      skillMatch * (this.config.weights.skillMatch / 100) +
      workloadBalance * (this.config.weights.workloadBalance / 100) +
      distance * (this.config.weights.distance / 100) +
      urgency * (this.config.weights.urgency / 100) +
      rating * (this.config.weights.rating / 100)
    )
    
    return {
      total,
      breakdown: {
        skillMatch,
        workloadBalance,
        distance,
        urgency,
        rating
      }
    }
  }
  
  /**
   * 派单决策
   */
  dispatch(order: RepairOrder): DispatchResult {
    // 获取符合条件的候选人
    const candidates = this.getAvailableRepairmen(order.type)
    
    if (candidates.length === 0) {
      // 无候选人，返回空结果
      return {
        recommendedRepairman: null,
        allCandidates: [],
        estimatedTime: 0,
        reasoning: '无可用维修人员，请人工派单'
      }
    }
    
    // 计算所有候选人评分
    const scoredCandidates = candidates.map(repairman => {
      const { total, breakdown } = this.calculateScore(order, repairman)
      return {
        repairman,
        score: total,
        breakdown
      }
    })
    
    // 按评分排序
    scoredCandidates.sort((a, b) => b.score - a.score)
    
    // 取前N名
    const topCandidates = scoredCandidates.slice(0, this.config.maxCandidates)
    const best = topCandidates[0]
    
    // 生成推荐理由
    const reasoning = this.generateReasoning(order, best)
    
    // 估算完成时间
    const estimatedTime = this.estimateCompleteTime(order, best.repairman)
    
    return {
      recommendedRepairman: best.repairman,
      allCandidates: topCandidates,
      estimatedTime,
      reasoning
    }
  }
  
  /**
   * 批量派单（用于工单批量处理）
   */
  dispatchBatch(orders: RepairOrder[]): DispatchResult[] {
    return orders.map(order => this.dispatch(order))
  }
  
  /**
   * 生成推荐理由
   */
  private generateReasoning(
    order: RepairOrder,
    best: { repairman: Repairman; score: number; breakdown: DimensionScore }
  ): string {
    const parts: string[] = []
    const { repairman, breakdown } = best
    
    // 技能匹配
    if (breakdown.skillMatch >= 80) {
      parts.push(`技能优秀（${repairman.skillLevel[order.type]}级）`)
    } else if (breakdown.skillMatch >= 50) {
      parts.push(`技能匹配`)
    }
    
    // 负载情况
    if (breakdown.workloadBalance >= 70) {
      parts.push('当前工作负载较轻')
    } else if (breakdown.workloadBalance >= 40) {
      parts.push('工作负载适中')
    }
    
    // 距离
    if (breakdown.distance >= 90) {
      parts.push('距离最近')
    }
    
    // 评分
    if (breakdown.rating >= 90) {
      parts.push(`历史评价优秀（${repairman.avgRating}分）`)
    }
    
    // 紧急情况
    if (order.severity === 'critical') {
      parts.push('紧急优先处理')
    }
    
    return parts.length > 0 
      ? `推荐原因：${parts.join('，')}。综合评分：${best.score}分`
      : `综合评分：${best.score}分`
  }
  
  /**
   * 估算完成时间
   */
  private estimateCompleteTime(order: RepairOrder, repairman: Repairman): number {
    // 基础时间 = 维修人员平均完成时长
    let time = repairman.avgCompleteTime
    
    // 根据工单类型调整
    if (order.severity === 'critical') {
      time = Math.min(time, 30) // 紧急工单缩短时间
    } else if (order.severity === 'minor') {
      time = time * 1.2 // 简单工单可延长时间
    }
    
    // 根据距离调整（跨校区增加时间）
    if (order.campus !== repairman.campus) {
      time += 30
    }
    
    return Math.round(time)
  }
  
  /**
   * 获取派单统计信息
   */
  getStatistics() {
    return {
      totalRepairmen: this.repairmen.length,
      availableCount: this.repairmen.filter(r => r.isAvailable).length,
      avgWorkload: this.repairmen.reduce((sum, r) => sum + r.currentWorkload, 0) / this.repairmen.length,
      avgRating: this.repairmen.reduce((sum, r) => sum + r.avgRating, 0) / this.repairmen.length,
      totalCompleted: this.repairmen.reduce((sum, r) => sum + r.completedOrders, 0)
    }
  }
}

// 导出单例实例
export const dispatchAlgorithm = new MultiDimensionDispatch()

/**
 * 便捷函数：智能派单
 */
export function smartDispatch(order: RepairOrder): DispatchResult {
  return dispatchAlgorithm.dispatch(order)
}

/**
 * 获取维修人员列表
 */
export function getRepairmen(): Repairman[] {
  return [...dispatchAlgorithm['repairmen']]
}

/**
 * 更新维修人员工作负载
 */
export function updateRepairmanWorkload(repairmanId: string, delta: number) {
  const repairmen = dispatchAlgorithm['repairmen']
  const repairman = repairmen.find(r => r.id === repairmanId)
  if (repairman) {
    repairman.currentWorkload += delta
  }
}

// ============================================
// 五、可视化评分详情
// ============================================

/**
 * 评分雷达图数据
 */
export interface RadarChartData {
  labels: string[]
  datasets: Array<{
    repairmanId: string
    repairmanName: string
    values: number[]
  }>
}

/**
 * 生成雷达图数据
 */
export function generateRadarChartData(
  order: RepairOrder,
  candidates?: Repairman[]
): RadarChartData {
  const labels = ['技能匹配', '负载均衡', '距离因素', '紧急响应', '历史评价']
  const repairmen = candidates || dispatchAlgorithm.getAvailableRepairmen(order.type)
  
  const datasets = repairmen.slice(0, 5).map(rp => {
    const { breakdown } = dispatchAlgorithm.calculateScore(order, rp)
    return {
      repairmanId: rp.id,
      repairmanName: rp.name,
      values: [
        breakdown.skillMatch,
        breakdown.workloadBalance,
        breakdown.distance,
        breakdown.urgency,
        breakdown.rating
      ]
    }
  })
  
  return { labels, datasets }
}
