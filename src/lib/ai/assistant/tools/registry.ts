import { NextRequest } from 'next/server'
import { z } from 'zod'
import { GET as readBusinessRecords } from '@/app/api/ai/business-records/route'
import { authorize } from '@/lib/authorization'
import type { User } from '@/types'

const domainSchema = z.enum(['repair', 'notification', 'classroom', 'lost_found', 'hygiene', 'dormitory', 'dorm_safety', 'visitor', 'energy', 'material', 'duty'])
export type BaizeToolDomain = z.infer<typeof domainSchema>
export const queryToolSchema = z.object({
  domain: domainSchema,
  status: z.enum(['pending', 'processing', 'completed', 'all']).default('all'),
  location: z.string().trim().max(120).optional(),
  locations: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
  excludeLocations: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
  format: z.enum(['count', 'list', 'table', 'explain']).default('explain'),
  limit: z.number().int().min(1).max(50).default(10),
  ownerOnly: z.boolean().default(false),
  excludeCompleted: z.boolean().default(false),
  id: z.string().trim().min(1).max(120).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()
export type BaizeToolArgs = z.input<typeof queryToolSchema>

export class BaizeToolError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'UNAVAILABLE' | 'TOO_MANY' | 'INVALID' | 'NOT_FOUND', message: string) {
    super(message)
    this.name = 'BaizeToolError'
  }
}

export const baizeDomainPermissions: Record<BaizeToolDomain, readonly string[]> = {
  repair: ['repair:view', 'repair:view:own'], notification: ['notification:view'], classroom: ['classroom:view'],
  lost_found: ['lost:view'], hygiene: ['duty:view'], dormitory: ['dorm:view'], dorm_safety: ['dorm:view'],
  visitor: ['visitor:check'], energy: ['energy:view'], material: ['material:view'], duty: ['duty:view', 'duty:create'],
}
const exposedFields = ['id', 'title', 'status', 'location', 'building', 'building_name', 'full_name', 'item_name', 'name', 'room_number', 'duty_date', 'class_name', 'created_at', 'updated_at', 'observed_at', 'reporter_id', 'visitor_name', 'asset_name'] as const
const pending = new Set(['PENDING', 'OPEN', 'DRAFT', 'WARNING', 'MAINTENANCE', 'PENDING_CONFIRMATION', 'AVAILABLE', 'FREE'])
const processing = new Set(['PROCESSING', 'IN_PROGRESS', 'REVIEWING', 'ASSIGNED', 'APPROVED'])
const completed = new Set(['COMPLETED', 'CLOSED', 'RESOLVED', 'CLAIMED', 'RETURNED', 'PUBLISHED', 'SENT', 'NORMAL', 'ACTIVE', 'OCCUPIED', 'BOOKED', 'VERIFIED', 'SUBMITTED'])

export interface BaizeToolResult {
  domain: BaizeToolDomain
  total: number
  pending: number
  completed: number
  records: Array<Record<string, unknown>>
  latestAt?: string
  endpoint: string
  byLocation: Array<{ location: string; count: number }>
  aggregated?: boolean
}

/** The existing PG read model calculates the assignment scope on the server. Never accept scope from the model or browser. */
export const baizeToolRegistry = {
  business_query: {
    name: 'business_query',
    description: 'Read tenant-scoped campus records; write operations are not supported.',
    schema: queryToolSchema,
    permissions: baizeDomainPermissions,
    execute: queryBusinessTool,
  },
} as const

async function scopedPage(request: NextRequest, domain: BaizeToolDomain, page: number, id?: string): Promise<{ records: Array<Record<string, unknown>>; total: number }> {
  try {
    const url = new URL('/api/ai/business-records', request.url)
    url.searchParams.set('domain', domain)
    if (id) url.searchParams.set('id', id)
    else { url.searchParams.set('page', String(page)); url.searchParams.set('pageSize', '100') }
    const response = await readBusinessRecords(new NextRequest(url, { headers: request.headers }))
    if (!response.ok) {
      const error = await response.json() as { code?: string }
      if (response.status === 403) throw new BaizeToolError('FORBIDDEN', '你没有权限查询该业务信息')
      if (response.status === 404) throw new BaizeToolError('NOT_FOUND', '未找到这条记录，请核对编号')
      throw new BaizeToolError('UNAVAILABLE', `当前业务查询繁忙，请稍后再试（${error.code ?? 'READ_FAILED'}）`)
    }
    const payload = await response.json() as { data?: { data?: Array<Record<string, unknown>>; pagination?: { total?: number } } }
    return { records: payload.data?.data ?? [], total: payload.data?.pagination?.total ?? 0 }
  } catch (error) {
    if (error instanceof BaizeToolError) throw error
    throw new BaizeToolError('UNAVAILABLE', '当前业务查询繁忙，请稍后再试')
  }
}

async function scopedAggregate(request: NextRequest, args: z.output<typeof queryToolSchema>): Promise<BaizeToolResult> {
  const url = new URL('/api/ai/business-records', request.url)
  url.searchParams.set('domain', args.domain)
  url.searchParams.set('aggregate', '1')
  url.searchParams.set('status', args.status)
  for (const location of args.locations?.length ? args.locations : args.location ? [args.location] : []) url.searchParams.append('location', location)
  for (const location of args.excludeLocations ?? []) url.searchParams.append('excludeLocation', location)
  if (args.dateFrom) url.searchParams.set('dateFrom', args.dateFrom)
  if (args.dateTo) url.searchParams.set('dateTo', args.dateTo)
  if (args.ownerOnly) url.searchParams.set('ownerOnly', 'true')
  if (args.excludeCompleted) url.searchParams.set('excludeCompleted', 'true')
  try {
    const response = await readBusinessRecords(new NextRequest(url, { headers: request.headers }))
    if (!response.ok) {
      if (response.status === 403) throw new BaizeToolError('FORBIDDEN', '你没有权限查询该业务信息')
      if (response.status === 400) throw new BaizeToolError('INVALID', '该业务域暂不支持此个人筛选条件')
      throw new BaizeToolError('UNAVAILABLE', '当前业务统计繁忙，请稍后再试')
    }
    const body = await response.json() as { data: Omit<BaizeToolResult, 'records' | 'endpoint'> }
    return { ...body.data, records: [], endpoint: `/api/ai/business-records?domain=${args.domain}&aggregate=1` }
  } catch (error) {
    if (error instanceof BaizeToolError) throw error
    throw new BaizeToolError('UNAVAILABLE', '当前业务统计繁忙，请稍后再试')
  }
}

export async function queryBusinessTool(user: User, request: NextRequest, raw: BaizeToolArgs): Promise<BaizeToolResult> {
  const parsed = queryToolSchema.safeParse(raw)
  if (!parsed.success) throw new BaizeToolError('INVALID', '查询参数格式不正确，请调整筛选条件')
  const args = parsed.data
  if (args.dateFrom && args.dateTo && args.dateFrom > args.dateTo) throw new BaizeToolError('INVALID', '开始日期不能晚于结束日期')
  if (!user.school_id || !baizeDomainPermissions[args.domain].some((permission) => authorize(user, { permission }).allowed)) {
    throw new BaizeToolError('FORBIDDEN', '你没有权限查询该业务信息')
  }
  const first = await scopedPage(request, args.domain, 1, args.id)
  // A bounded query must fail closed instead of silently producing a false aggregate or disclosing uncensored pages.
  if (first.total > 1000 && !args.id) return scopedAggregate(request, args)
  const rows = [...first.records]
  if (!args.id) for (let page = 2; page <= Math.ceil(first.total / 100); page += 1) {
    const next = await scopedPage(request, args.domain, page)
    rows.push(...next.records)
  }
  const matches = rows.filter((row) => {
    const status = String(row.status ?? '').toUpperCase()
    if (args.status !== 'all' && !(args.status === 'pending' ? pending : args.status === 'processing' ? processing : completed).has(status)) return false
    if (args.excludeCompleted && completed.has(status)) return false
    if (args.ownerOnly && !(args.domain === 'duty' ? Boolean(user.class_name) && row.class_name === user.class_name :
      args.domain === 'notification' ? row.publisher_id === user.id :
        args.domain === 'visitor' ? row.host_id === user.id : String(row.reporter_id ?? '') === user.id)) return false
    if (args.dateFrom || args.dateTo) {
      const date = new Date(String(row.created_at ?? row.observed_at ?? row.duty_date ?? ''))
      if (Number.isNaN(date.getTime())) return false
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
      if (args.dateFrom && day < args.dateFrom) return false
      if (args.dateTo && day > args.dateTo) return false
    }
    const places = [row.location, row.building, row.building_name, row.full_name, row.room_number, row.name].map((value) => String(value ?? '').toLocaleLowerCase())
    const locations = args.locations?.length ? args.locations : args.location ? [args.location] : []
    if (locations.length && !locations.some((location) => places.some((place) => place.includes(location.toLocaleLowerCase())))) return false
    if (args.excludeLocations?.some((location) => places.some((place) => place.includes(location.toLocaleLowerCase())))) return false
    return true
  })
  const sanitized = matches.slice(0, args.limit).map((row) => Object.fromEntries(exposedFields.filter((field) => row[field] !== undefined && field !== 'reporter_id' && field !== 'visitor_name').map((field) => [field, row[field]])))
  const latest = matches.map((row) => String(row.updated_at ?? row.created_at ?? row.observed_at ?? '')).filter(Boolean).sort().at(-1)
  const locationCounts = new Map<string, number>()
  for (const row of matches) {
    const place = String(row.building_name ?? row.building ?? row.location ?? '未标明地点').slice(0, 80)
    locationCounts.set(place, (locationCounts.get(place) ?? 0) + 1)
  }
  return {
    domain: args.domain, total: matches.length,
    byLocation: [...locationCounts.entries()].map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count),
    pending: matches.filter((row) => pending.has(String(row.status ?? '').toUpperCase())).length,
    completed: matches.filter((row) => completed.has(String(row.status ?? '').toUpperCase())).length,
    records: sanitized, latestAt: latest, endpoint: `/api/ai/business-records?domain=${args.domain}`,
  }
}
