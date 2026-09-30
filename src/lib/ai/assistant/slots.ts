import type { BaizeToolArgs } from './tools/registry'

export interface BaizeLocalSlots {
  args: Partial<BaizeToolArgs>
  explicit: { locations: string[]; excludedLocations: string[]; status?: string; dateFrom?: string; dateTo?: string }
  clarification?: string
}

const LOCATION_PATTERN = /本地集成楼栋\s*\d{1,4}|(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*号\s*(?:教学楼|宿舍楼|楼)|(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*栋|(?:教学楼|宿舍)\s*[A-Za-z0-9一二三四五六七八九十]{1,3}\s*(?:区|号楼|栋)?/g
const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function campusDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number)
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
}

export function localDateWindow(text: string, now = new Date()): { dateFrom?: string; dateTo?: string } {
  const day = campusDay(now)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (/上周/.test(text)) {
    const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7) - 7)
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
    return { dateFrom: iso(monday), dateTo: iso(sunday) }
  }
  if (/这周|本周/.test(text)) {
    const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
    return { dateFrom: iso(monday), dateTo: iso(day) }
  }
  if (/上个月/.test(text)) {
    const previous = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1))
    const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0))
    return { dateFrom: iso(previous), dateTo: iso(last) }
  }
  if (/这个月|本月/.test(text)) return { dateFrom: iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))), dateTo: iso(day) }
  if (/昨天|昨日/.test(text)) { day.setUTCDate(day.getUTCDate() - 1); return { dateFrom: iso(day), dateTo: iso(day) } }
  if (/今天|今日/.test(text)) return { dateFrom: iso(day), dateTo: iso(day) }
  return {}
}

function canonicalPlace(value: string): string {
  if (/^本地集成楼栋\s*\d+$/.test(value)) return value.trim().replace(/\s+/g, ' ').replace(/楼栋(?=\d)/, '楼栋 ')
  const compact = value.trim().replace(/\s*(号|栋|区|楼)\s*/g, '$1').replace(/\s+/g, ' ')
  return compact.replace(/^[一二三四五六七八九十]+(?=号|栋)/, (digit) => String(CHINESE_DIGITS[digit] ?? digit))
}

function locationMatches(text: string): Array<{ value: string; negative: boolean }> {
  return [...text.matchAll(LOCATION_PATTERN)].map((match) => {
    const before = text.slice(Math.max(0, match.index - 35), match.index).split(/[，,。；;！!？?]/).at(-1) ?? ''
    return { value: canonicalPlace(match[0]), negative: /(?:不是|不在|不含|不包含|排除|除了|不看|不要|非)(?:[^，,。；;]{0,28})$/.test(before) }
  })
}

/** Local evidence is never a source of permission or resource IDs; uncertain slot semantics fail closed to clarification. */
export function extractBaizeLocalSlots(text: string, now = new Date()): BaizeLocalSlots {
  const matches = locationMatches(text)
  const locations = [...new Set(matches.filter((match) => !match.negative).map((match) => match.value))]
  const excludedLocations = [...new Set(matches.filter((match) => match.negative).map((match) => match.value))]
  const explicit: BaizeLocalSlots['explicit'] = { locations, excludedLocations }
  const args: Partial<BaizeToolArgs> = {}
  const dates = localDateWindow(text, now)
  Object.assign(args, dates)
  Object.assign(explicit, dates)
  const statusTerms = [/(?:待处理|待派|未受理)/.test(text) ? 'pending' : '', /(?:处理中|进行中)/.test(text) ? 'processing' : '', /(?<!未)(?:已完成|已办结|完成的|完工)/.test(text) ? 'completed' : ''].filter(Boolean)
  const notCompleted = /(?:未完成|不要|排除|不看|不是|非).{0,8}(?:已完成|完成)|未完成/.test(text)
  if (/(?:排除|不要|不是|不看).{0,8}(?:待处理|处理中)/.test(text)) return { args, explicit, clarification: '暂不能准确执行排除待处理或处理中状态的条件，请明确需要查询的状态。' }
  if (statusTerms.length > 1 && !notCompleted) return { args, explicit, clarification: '你同时指定了多种状态，请分别查询或明确需要哪一种状态。' }
  if (notCompleted) { args.status = 'all'; args.excludeCompleted = true; explicit.status = 'not_completed' }
  else if (statusTerms[0]) { args.status = statusTerms[0] as BaizeToolArgs['status']; explicit.status = statusTerms[0] }
  if (/(?:我提交|我发布|我申领|我接待|我的报修|我找的|查我|我自己的)/.test(text) && !/我的辖区|我的组织|我的部门/.test(text)) args.ownerOnly = true
  const format = /表格/.test(text) ? 'table' : /(?:多少|数量|几条|总量)/.test(text) ? 'count' : undefined
  if (format) args.format = format
  const limit = /(?:最近|最新|列出|展示)\s*(\d+)\s*条/.exec(text)
  if (limit) {
    const count = Number(limit[1])
    if (count < 1 || count > 50) return { args, explicit, clarification: '展示条数需在 1 至 50 条之间，请调整后重试。' }
    args.limit = count
  }
  if (/(?:去年|上上周|下周|下个月|\d{4}年\d{1,2}月)/.test(text) && !dates.dateFrom) {
    return { args, explicit, clarification: '暂不能准确识别你指定的时间范围，请改用上周、本周、本月或明确日期查询。' }
  }
  if (locations.length > 5 || excludedLocations.length > 5 || /(?:号楼|栋)\s*(?:到|至|~|－|-)\s*(?:\d|[一二三四五六七八九十])/.test(text)) {
    return { args, explicit, clarification: '地点范围过多或存在未明确的楼栋区间，请指定最多五个明确地点。' }
  }
  if (locations.some((value) => excludedLocations.includes(value))) return { args, explicit, clarification: '地点条件同时包含和排除了同一地点，请明确你想查询的范围。' }
  if ((/\d+\s*号\s*楼|\d+\s*栋|本地集成楼栋\s*\d+|宿舍\s*[A-Za-z0-9]+\s*区/.test(text) || /(?:地点|位置)(?:是|在)?\s*[^，,。；;]{2,20}/.test(text)) && matches.length === 0) {
    return { args, explicit, clarification: '我没能准确识别你说的地点，请补充具体楼栋名称后再查询。' }
  }
  if (locations.length) { args.location = locations[0]; args.locations = locations }
  if (excludedLocations.length) args.excludeLocations = excludedLocations
  return { args, explicit }
}

export function mergeBaizeQuerySlots(
  text: string, model: Partial<BaizeToolArgs> | undefined, now = new Date(),
): { args: Partial<BaizeToolArgs>; clarification?: string; parsed: BaizeLocalSlots } {
  const parsed = extractBaizeLocalSlots(text, now)
  if (parsed.clarification) return { args: parsed.args, clarification: parsed.clarification, parsed }
  const modelLocation = model?.location ? canonicalPlace(model.location) : undefined
  if (modelLocation && parsed.explicit.locations.length > 0 && !parsed.explicit.locations.includes(modelLocation)) {
    return { args: parsed.args, clarification: '你说的地点与模型识别的地点不一致，请确认具体楼栋。', parsed }
  }
  if (parsed.explicit.excludedLocations.includes(modelLocation ?? '')) return { args: parsed.args, clarification: '你指定了排除地点，请明确需要查询的地点范围。', parsed }
  const args: Partial<BaizeToolArgs> = { ...model, ...parsed.args }
  if (!parsed.explicit.locations.length && modelLocation) args.location = modelLocation
  if (parsed.explicit.locations.length) { args.location = parsed.explicit.locations[0]; args.locations = parsed.explicit.locations }
  if (parsed.explicit.excludedLocations.length) args.excludeLocations = parsed.explicit.excludedLocations
  return { args, parsed }
}
