'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Building,
  Calendar,
  Database,
  Eye,
  FileCheck2,
  Home,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wrench,
  Zap,
} from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BusinessAgentPanel } from '@/components/ai/product/business-agent-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface BusinessColumn {
  key: string
  label: string
  kind?: 'text' | 'number' | 'date' | 'status' | 'person' | 'list' | 'phone'
}
interface DomainSummary {
  key: string
  primaryValue: number
  primaryLabel: string
  health: 'healthy' | 'attention' | 'critical'
  healthLabel: string
  metrics: Array<{ label: string; value: number; unit?: string }>
  agent: string
  painPoint: string
}

const DOMAIN_VISUAL = {
  repair: { icon: Wrench, label: 'SERVICE OPERATIONS', gradient: 'from-cyan-500/18 via-blue-500/8', iconStyle: 'bg-cyan-100 text-cyan-700' },
  classroom: { icon: Building, label: 'SPACE OPERATIONS', gradient: 'from-indigo-500/18 via-violet-500/8', iconStyle: 'bg-indigo-100 text-indigo-700' },
  notification: { icon: Sparkles, label: 'MESSAGE DELIVERY', gradient: 'from-violet-500/18 via-fuchsia-500/8', iconStyle: 'bg-violet-100 text-violet-700' },
  lost_found: { icon: Search, label: 'STUDENT SERVICES', gradient: 'from-amber-500/18 via-orange-500/8', iconStyle: 'bg-amber-100 text-amber-700' },
  dormitory: { icon: Home, label: 'DORM SAFETY', gradient: 'from-rose-500/18 via-orange-500/8', iconStyle: 'bg-rose-100 text-rose-700' },
  hygiene: { icon: FileCheck2, label: 'HYGIENE CLOSURE', gradient: 'from-emerald-500/18 via-teal-500/8', iconStyle: 'bg-emerald-100 text-emerald-700' },
  visitor: { icon: UserPlus, label: 'ADMISSION GOVERNANCE', gradient: 'from-blue-500/18 via-cyan-500/8', iconStyle: 'bg-blue-100 text-blue-700' },
  energy: { icon: Zap, label: 'ASSET INTELLIGENCE', gradient: 'from-amber-500/18 via-yellow-500/8', iconStyle: 'bg-amber-100 text-amber-700' },
  material: { icon: Package, label: 'SUPPLY ASSURANCE', gradient: 'from-slate-500/18 via-blue-500/8', iconStyle: 'bg-slate-100 text-slate-700' },
  duty: { icon: Calendar, label: 'DUTY COORDINATION', gradient: 'from-teal-500/18 via-cyan-500/8', iconStyle: 'bg-teal-100 text-teal-700' },
} as const

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理', pending_confirmation: '待现场确认', dispatched: '已派单', processing: '处理中', completed: '已完成',
  approved: '已批准', rejected: '已拒绝', admitted: '已入校', published: '已发布', scheduled: '已排期', draft: '草稿',
  open: '待处理', matched: '已匹配', claimed: '已认领', returned: '已归还', available: '可用', occupied: '使用中', maintenance: '维护中',
  valid: '质量合格', suspect: '待复核', invalid: '无效', normal: '正常', attention: '需关注', warning: '低库存', out_of_stock: '已缺货',
  in_progress: '处理中', submitted: '已提交复核', verified: '已复核', escalated: '已升级', false_alarm: '确认误报', rectification_required: '需要整改',
  checked: '已检查', active: '运行中', failed: '失败', read: '已阅读', acknowledged: '已确认', delivered: '已送达',
}

function valueAt(record: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[part] : undefined, record)
}
function normalizeStatus(value: unknown): string { return String(value ?? '').trim().toLowerCase() }
function statusLabel(value: unknown): string {
  const normalized = normalizeStatus(value)
  return STATUS_LABELS[normalized] ?? (value ? String(value) : '未标记')
}
function displayValue(value: unknown, column: BusinessColumn): string {
  if (value === null || value === undefined || value === '') return '—'
  if (column.kind === 'status') return statusLabel(value)
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === 'string' ? item : '结构化信息').join('、') : '—'
  if (typeof value === 'object') return '已记录结构化业务信息'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (column.kind === 'date' || column.key.endsWith('_at') || column.key.includes('time') || column.key.includes('date')) {
    const timestamp = Date.parse(String(value))
    if (!Number.isNaN(timestamp)) return new Date(timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  if (column.kind === 'number' && typeof value === 'number') return new Intl.NumberFormat('zh-CN').format(value)
  return String(value)
}
function statusStyle(value: unknown): string {
  const status = normalizeStatus(value)
  if (['verified','completed','published','approved','available','active','valid','normal','checked','acknowledged','returned','resolved'].some((item) => status.includes(item))) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (['failed','rejected','critical','invalid','expired','out_of_stock','escalated'].some((item) => status.includes(item))) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (['pending','draft','warning','maintenance','suspect','attention','open','rectification'].some((item) => status.includes(item))) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (['processing','dispatched','occupied','in_progress','submitted','matched','scheduled'].some((item) => status.includes(item))) return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

export function BusinessModulePage({
  domainKey,
  title,
  subtitle,
  endpoint,
  skillId,
  agentTitle,
  agentDescription,
  columns,
  statusKey = 'status',
  agentParams = {},
  agentParamMap = {},
  recordLabel = '业务记录',
}: {
  domainKey: keyof typeof DOMAIN_VISUAL
  title: string
  subtitle: string
  endpoint: string
  skillId?: string
  agentTitle?: string
  agentDescription?: string
  columns: BusinessColumn[]
  statusKey?: string
  agentParams?: Record<string, unknown>
  agentParamMap?: Record<string, string>
  recordLabel?: string
}) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<DomainSummary | null>(null)
  const [datasetLabel, setDatasetLabel] = useState('企业租户数据')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const visual = DOMAIN_VISUAL[domainKey]
  const VisualIcon = visual.icon

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const separator = endpoint.includes('?') ? '&' : '?'
      const [response, overviewResponse, systemResponse] = await Promise.all([
        fetch(`${endpoint}${separator}pageSize=100`, { cache: 'no-store' }),
        fetch('/api/ai/overview', { cache: 'no-store' }),
        fetch('/api/ai/system', { cache: 'no-store' }),
      ])
      const [json, overview, system] = await Promise.all([response.json(), overviewResponse.json(), systemResponse.json()])
      if (!systemResponse.ok || !system.success || !system.data?.executionReady) throw new Error(system.error ?? system.data?.message ?? '真实业务执行链未就绪')
      if (!response.ok || !json.success) throw new Error(json.error ?? `业务数据读取失败`)
      const payload = json.data?.data ?? json.data ?? []
      if (!Array.isArray(payload)) throw new Error('业务数据格式不符合契约')
      setRecords(payload)
      setTotal(json.data?.pagination?.total ?? payload.length)
      if (overviewResponse.ok && overview.success) {
        const candidate = (overview.data?.domains ?? []).find((item: DomainSummary) => item.key === domainKey || (domainKey === 'dormitory' && item.key === 'dormitory') || (domainKey === 'hygiene' && item.key === 'hygiene'))
        setSummary(candidate ?? null)
        setDatasetLabel(overview.data?.dataset?.label ?? '企业租户数据')
      }
    } catch (loadError) {
      setRecords([]); setTotal(0); setError(loadError instanceof Error ? loadError.message : '业务数据加载失败')
    } finally { setLoading(false) }
  }, [domainKey, endpoint])

  useEffect(() => { void load() }, [load])

  const statuses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of records) {
      const raw = normalizeStatus(valueAt(record, statusKey))
      if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [records, statusKey])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return records.filter((record) => {
      if (statusFilter !== 'all' && normalizeStatus(valueAt(record, statusKey)) !== statusFilter) return false
      if (!keyword) return true
      return columns.some((column) => displayValue(valueAt(record, column.key), column).toLowerCase().includes(keyword))
    })
  }, [columns, records, search, statusFilter, statusKey])

  const selectedParams = useMemo(() => {
    const output = { ...agentParams }
    if (selected) for (const [paramKey, recordKey] of Object.entries(agentParamMap)) output[paramKey] = valueAt(selected, recordKey)
    return output
  }, [agentParamMap, agentParams, selected])
  const selectedAgentHref = skillId ? `/ai-agents/conversation?skill=${encodeURIComponent(skillId)}&params=${encodeURIComponent(JSON.stringify(selectedParams))}` : ''

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1660px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm md:px-7">
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visual.gradient} to-transparent`} />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${visual.iconStyle}`}><VisualIcon className="h-6 w-6" /></span><div><p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">{visual.label}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{datasetLabel}</Badge><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><Database className="mr-1 h-3 w-3" />正式数据库读模型</Badge><Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700"><ShieldCheck className="mr-1 h-3 w-3" />写操作受控</Badge></div></div></div>
            <div className="flex gap-2"><Button variant="outline" className="rounded-xl bg-white/80" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新业务态势</Button>{skillId && <Button className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" asChild><Link href={`/ai-agents/conversation?skill=${encodeURIComponent(skillId)}&params=${encodeURIComponent(JSON.stringify(agentParams))}`}><Bot className="mr-2 h-4 w-4" />交给 Agent 团队</Link></Button>}</div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="border-slate-200/80 bg-slate-950 text-white"><CardContent className="p-4"><p className="text-[10px] font-medium tracking-wider text-slate-400">当前业务量</p><div className="mt-2 flex items-end gap-2"><p className="text-3xl font-semibold">{total}</p><span className="pb-1 text-xs text-slate-500">{recordLabel}</span></div><p className="mt-2 text-[10px] text-slate-500">租户隔离 · 实时回读</p></CardContent></Card>
          {summary ? <><Card className="border-slate-200/80"><CardContent className="p-4"><p className="text-[10px] text-slate-500">{summary.primaryLabel}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{summary.primaryValue}</p><p className={`mt-2 text-[10px] ${summary.health === 'critical' ? 'text-rose-600' : summary.health === 'attention' ? 'text-amber-600' : 'text-emerald-600'}`}>{summary.healthLabel}</p></CardContent></Card>{summary.metrics.slice(0, 3).map((metric) => <Card key={metric.label} className="border-slate-200/80"><CardContent className="p-4"><p className="text-[10px] text-slate-500">{metric.label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{metric.value}<span className="ml-1 text-xs font-normal text-slate-400">{metric.unit}</span></p><p className="mt-2 text-[10px] text-slate-400">来自业务事实表</p></CardContent></Card>)}</> : Array.from({ length: 4 }).map((_, index) => <Card key={index} className="border-slate-200/80"><CardContent className="h-[108px] animate-pulse bg-slate-50" /></Card>)}
        </section>

        {skillId && agentTitle && agentDescription && <BusinessAgentPanel skillId={skillId} title={agentTitle} description={agentDescription} params={agentParams} />}
        {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-semibold">业务链路需要处理</p><p className="mt-1">{error}</p></div>}

        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{recordLabel}台账</h2><p className="mt-1 text-xs text-slate-500">每一行均来自正式业务表；详情只展示用户可理解的业务字段。</p></div><Badge variant="outline" className="bg-slate-50">当前显示 {filtered.length} / {total}</Badge></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>全部 {records.length}</Button>{statuses.slice(0, 7).map(([status, count]) => <Button key={status} size="sm" variant={statusFilter === status ? 'default' : 'outline'} onClick={() => setStatusFilter(status)}>{statusLabel(status)} {count}</Button>)}</div>
            <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-10 rounded-xl border-slate-200 bg-slate-50/70 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`搜索${recordLabel}、地点、状态或责任人`} /></div>
          </div>
          <CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50/80">{columns.map((column) => <TableHead key={column.key} className="text-[11px] font-semibold text-slate-500">{column.label}</TableHead>)}<TableHead className="text-right text-[11px] font-semibold text-slate-500">业务操作</TableHead></TableRow></TableHeader><TableBody>
            {loading ? <TableRow><TableCell colSpan={columns.length + 1} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-600" /><p className="mt-2 text-xs text-slate-400">正在回读正式业务数据</p></TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={columns.length + 1} className="py-16 text-center text-sm text-slate-400">当前筛选下没有业务记录</TableCell></TableRow> : filtered.map((record, index) => <TableRow key={typeof record.id === 'string' ? record.id : index} className="hover:bg-cyan-50/25">{columns.map((column) => { const value = valueAt(record, column.key); return <TableCell key={column.key} className="max-w-72 truncate text-sm text-slate-700">{column.kind === 'status' || column.key === statusKey ? <Badge variant="outline" className={statusStyle(value)}>{statusLabel(value)}</Badge> : displayValue(value, column)}</TableCell> })}<TableCell className="text-right"><Button size="sm" variant="ghost" className="rounded-lg text-slate-500" onClick={() => setSelected(record)}><Eye className="mr-1.5 h-3.5 w-3.5" />查看档案</Button></TableCell></TableRow>)}
          </TableBody></Table></div></CardContent>
        </Card>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
          <DialogContent className="max-h-[86vh] max-w-3xl overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${visual.iconStyle}`}><VisualIcon className="h-4 w-4" /></span>{recordLabel}业务档案</DialogTitle></DialogHeader>
            {selected && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{columns.map((column) => { const value = valueAt(selected, column.key); return <div key={column.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-[10px] font-medium text-slate-400">{column.label}</p><div className="mt-1.5 text-sm font-medium leading-6 text-slate-800">{column.kind === 'status' || column.key === statusKey ? <Badge variant="outline" className={statusStyle(value)}>{statusLabel(value)}</Badge> : displayValue(value, column)}</div></div> })}</div><div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-xs leading-5 text-cyan-900"><ShieldCheck className="mr-1 inline h-4 w-4" />此档案来自租户正式业务读模型。任何修改都必须经 Agent 执行预览、权限校验和人工裁决。</div>{skillId && Object.keys(agentParamMap).length > 0 && <Button asChild className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"><Link href={selectedAgentHref}><Sparkles className="mr-2 h-4 w-4" />将这条记录带入 Agent 工作台<ArrowRight className="ml-auto h-4 w-4" /></Link></Button>}</div>}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
