export interface ParsedAiCommand {
  skill: string
  params: Record<string, unknown>
  confidence: number
}

const SKILL_NAMES = {
  queryRepairs: '\u62a5\u4fee\u6570\u636e\u67e5\u8be2',
  smartDispatch: '\u667a\u80fd\u6d3e\u5355',
  batchDispatch: '\u6279\u91cf\u6d3e\u5355',
  queryMaterials: '\u7269\u8d44\u5e93\u5b58\u67e5\u8be2',
  sendNotification: '\u53d1\u9001\u901a\u77e5',
  queryClassrooms: '\u6559\u5ba4\u9884\u7ea6\u67e5\u8be2',
  dormInspection: '\u5bbf\u820d\u5de1\u67e5\u8bb0\u5f55',
  generateDuty: '\u503c\u65e5\u6392\u73ed\u751f\u6210',
  dataReport: '\u6570\u636e\u7edf\u8ba1\u62a5\u544a',
} as const

function hasAny(command: string, terms: string[]): boolean {
  return terms.some((term) => command.includes(term))
}

export function parseCommandToSkill(command: string): ParsedAiCommand | null {
  const text = command.trim().toLowerCase()
  if (!text) return null

  const dispatch = hasAny(text, ['\u6d3e\u5355', 'dispatch']) || (text.includes('\u5206\u914d') && hasAny(text, ['\u62a5\u4fee', '\u7ef4\u4fee', 'repair']))
  if (dispatch) {
    const batch = hasAny(text, ['\u6279\u91cf', '\u5168\u90e8', 'batch', 'all'])
    return { skill: batch ? SKILL_NAMES.batchDispatch : SKILL_NAMES.smartDispatch, params: { count: batch ? 10 : 1 }, confidence: 0.92 }
  }
  if (hasAny(text, ['\u62a5\u4fee', 'repair']) && hasAny(text, ['\u67e5\u8be2', '\u67e5\u770b', '\u5217\u8868', 'query', 'list'])) {
    return { skill: SKILL_NAMES.queryRepairs, params: { status: 'PENDING' }, confidence: 0.88 }
  }
  if (hasAny(text, ['\u7269\u8d44', '\u5e93\u5b58', 'inventory', 'material'])) {
    return { skill: SKILL_NAMES.queryMaterials, params: { low_stock: hasAny(text, ['\u4f4e\u5e93\u5b58', '\u4e0d\u8db3', 'low stock']) }, confidence: 0.88 }
  }
  if (hasAny(text, ['\u901a\u77e5', 'notification', 'notice']) && hasAny(text, ['\u53d1\u9001', '\u53d1\u5e03', '\u63a8\u9001', 'send', 'publish'])) {
    return {
      skill: SKILL_NAMES.sendNotification,
      params: {
        title: '\u7cfb\u7edf\u901a\u77e5', content: command, type: 'SYSTEM',
        audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'],
      },
      confidence: 0.84,
    }
  }
  if (hasAny(text, ['\u6559\u5ba4', 'classroom']) && hasAny(text, ['\u67e5\u8be2', '\u67e5\u770b', 'query', 'available'])) {
    return { skill: SKILL_NAMES.queryClassrooms, params: {}, confidence: 0.85 }
  }
  if (hasAny(text, ['\u5bbf\u820d', 'dorm']) && hasAny(text, ['\u5de1\u67e5', '\u5de1\u68c0', 'inspection'])) {
    return { skill: SKILL_NAMES.dormInspection, params: {}, confidence: 0.85 }
  }
  if (hasAny(text, ['\u6392\u73ed', '\u503c\u65e5', 'duty roster'])) {
    return { skill: SKILL_NAMES.generateDuty, params: {}, confidence: 0.85 }
  }
  if (hasAny(text, ['\u7edf\u8ba1', '\u62a5\u544a', '\u6c47\u603b', 'statistics', 'report'])) {
    return { skill: SKILL_NAMES.dataReport, params: {}, confidence: 0.8 }
  }
  return null
}
