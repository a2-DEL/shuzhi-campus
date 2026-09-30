'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Building,
  CheckCircle2,
  Clock3,
  Database,
  Expand,
  FileCheck2,
  GitBranch,
  Globe,
  Home,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { taskStateLabel } from '@/lib/ai/presentation'
import type { AiSystemReadiness } from '@/lib/ai/product-types'

interface DomainMetric { label: string; value: number; unit?: string }
interface DomainStatus {
  key: string
  title: string
  href: string
  agent: string
  painPoint: string
  primaryValue: number
  primaryLabel: string
  health: 'healthy' | 'attention' | 'critical'
  healthLabel: string
  metrics: DomainMetric[]
}
interface RecentTask {
  id: string
  title: string
  command: string
  state: string
  risk_level: string
  updated_at: string
  completed_at?: string
  nodes: number
  verified_effects: number
  agents?: string
}
interface Overview {
  generatedAt: string
  dataset: { kind: 'simulated' | 'live'; label: string; version?: string; executionMode: string; activeUsers: number; visibleRecordCount: number }
  governance: { tasks: number; awaiting: number; active: number; completed: number; failed: number; cancelled: number; verifiedEffects: number; effectTypes: number; audits: number; outbox: number; successfulTools: number }
  domains: DomainStatus[]
  recentTasks: RecentTask[]
}
interface AgentSummary { totalRoles: number; totalTeams: number; totalAgents: number }

const DOMAIN_ICONS = { repair: Wrench, classroom: Building, notification: Bell, dormitory: Home, hygiene: FileCheck2, visitor: ShieldCheck, energy: Zap, lost_found: Search, material: Package, duty: Users } as const
const HEALTH_STYLE = {
  healthy: { dot: 'bg-emerald-400', text: 'text-emerald-700', border: 'border-emerald-200/80', wash: 'from-emerald-50/70' },
  attention: { dot: 'bg-amber-400', text: 'text-amber-700', border: 'border-amber-200/80', wash: 'from-amber-50/70' },
  critical: { dot: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-200/80', wash: 'from-rose-50/70' },
} as const

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AiAgentDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [readiness, setReadiness] = useState<AiSystemReadiness | null>(null)
  const [agents, setAgents] = useState<AgentSummary>({ totalRoles: 0, totalTeams: 0, totalAgents: 0 })
  const [skills, setSkills] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const responses = await Promise.all([
        fetch('/api/ai/overview', { cache: 'no-store' }),
        fetch('/api/ai/system', { cache: 'no-store' }),
        fetch('/api/ai/agents', { cache: 'no-store' }),
        fetch('/api/ai/skills', { cache: 'no-store' }),
      ])
      const payloads = await Promise.all(responses.map((response) => response.json()))
      const failed = responses.findIndex((response) => !response.ok)
      if (failed >= 0) throw new Error(payloads[failed]?.error ?? '白泽运营态势加载失败')
      setOverview(payloads[0].data)
      setReadiness(payloads[1].data)
      setAgents({
        totalRoles: payloads[2].data?.totalRoles ?? 0,
        totalTeams: payloads[2].data?.totalTeams ?? 0,
        totalAgents: payloads[2].data?.totalAgents ?? 0,
      })
      setSkills(payloads[3].data?.skills?.length ?? 0)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '白泽运营态势加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const healthCounts = useMemo(() => ({
    healthy: overview?.domains.filter((domain) => domain.health === 'healthy').length ?? 0,
    attention: overview?.domains.filter((domain) => domain.health === 'attention').length ?? 0,
    critical: overview?.domains.filter((domain) => domain.health === 'critical').length ?? 0,
  }), [overview])
  const baizeMood = overview?.governance.active ? 'busy' : healthCounts.critical ? 'alert' : overview?.governance.verifiedEffects ? 'success' : 'calm'

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1680px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-800/90 bg-[radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_18%_88%,rgba(99,102,241,0.19),transparent_32%),linear-gradient(132deg,#06101d_0%,#0a1830_54%,#11152a_100%)] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] md:px-9 md:py-9">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(103,232,249,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.075)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-cyan-200/10" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-cyan-200/10" />
          <div className="relative grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><Sparkles className="mr-1 h-3 w-3" />数智星图 · 白泽 Agent OS</Badge>
                <Badge variant="outline" className="border-amber-200/20 bg-amber-200/[0.05] text-amber-100">{overview?.dataset.label ?? '正在核验数据集'}</Badge>
                <Badge variant="outline" className="border-emerald-200/20 text-emerald-200"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300" />正式执行链</Badge>
              </div>
              <p className="mt-5 text-xs font-medium tracking-[0.28em] text-cyan-200/60">ENTERPRISE AGENT OPERATING SYSTEM</p>
              <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.025em] md:text-[42px] md:leading-[1.15]">从校园现实痛点，到可验证的多 Agent 业务成果</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">白泽负责接令、拆解、分发、人工裁决与归整汇报；每支分灵体连接真实租户权限、正式业务表、事务写入、业务回读和审计证据。演示数据与生产数据明确分层，执行机制完全一致。</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button className="h-10 rounded-xl bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200" asChild><Link href="/ai-agents/conversation"><Bot className="mr-2 h-4 w-4" />向白泽下令</Link></Button>
                <Button variant="outline" className="h-10 rounded-xl border-white/15 bg-white/[0.055] text-white hover:bg-white/10 hover:text-white" asChild><Link href="/ai-agents/runtime"><Expand className="mr-2 h-4 w-4" />进入全域战情室</Link></Button>
                <Button variant="ghost" className="h-10 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新态势</Button>
              </div>
            </div>
            <div className="relative flex flex-col items-center">
              <div className="absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
              <BaizeAvatar mood={baizeMood} size={250} showThreads threadCount={3} />
              <div className="mt-1 grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-cyan-200/10 bg-white/[0.035] px-2 py-2"><p className="text-lg font-semibold text-cyan-100">{agents.totalTeams || '—'}</p><p className="text-[9px] tracking-wider text-slate-500">角色团队</p></div>
                <div className="rounded-xl border border-violet-200/10 bg-white/[0.035] px-2 py-2"><p className="text-lg font-semibold text-violet-100">{agents.totalAgents || '—'}</p><p className="text-[9px] tracking-wider text-slate-500">专业 Agent</p></div>
                <div className="rounded-xl border border-amber-200/10 bg-white/[0.035] px-2 py-2"><p className="text-lg font-semibold text-amber-100">{skills || '—'}</p><p className="text-[9px] tracking-wider text-slate-500">核心 Skill</p></div>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: '已完成任务', value: overview?.governance.completed, icon: CheckCircle2, color: 'text-emerald-600', note: '完成状态已持久化' },
            { label: '验证业务效果', value: overview?.governance.verifiedEffects, icon: ShieldCheck, color: 'text-cyan-600', note: `${overview?.governance.effectTypes ?? 0} 类业务适配器` },
            { label: '等待人工裁决', value: overview?.governance.awaiting, icon: Clock3, color: 'text-amber-600', note: '未审批绝不写业务库' },
            { label: '成功工具调用', value: overview?.governance.successfulTools, icon: Activity, color: 'text-indigo-600', note: '准备、提交与回读' },
            { label: '审计证据', value: overview?.governance.audits, icon: FileCheck2, color: 'text-violet-600', note: '任务、节点、操作者关联' },
            { label: '可靠事件', value: overview?.governance.outbox, icon: Database, color: 'text-blue-600', note: 'Outbox 可重试投递' },
          ].map(({ label, value, icon: Icon, color, note }) => (
            <Card key={label} className="border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/40"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-medium text-slate-500">{label}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-[28px] font-semibold tracking-tight text-slate-950">{loading && value === undefined ? '?' : String(value ?? 0)}</p><p className="mt-1 truncate text-[10px] text-slate-400">{note}</p></CardContent></Card>
          ))}
        </section>

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(390px,0.55fr)]">
          <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
              <div><div className="flex items-center gap-2"><Globe className="h-5 w-5 text-cyan-600" /><h2 className="font-semibold text-slate-950">校园业务痛点雷达</h2></div><p className="mt-1 text-xs text-slate-500">来自正式业务表的当前态势，不使用页面随机数。</p></div>
              <div className="flex items-center gap-3 text-[11px]"><span className="flex items-center gap-1.5 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />稳态 {healthCounts.healthy}</span><span className="flex items-center gap-1.5 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />关注 {healthCounts.attention}</span><span className="flex items-center gap-1.5 text-rose-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />关键 {healthCounts.critical}</span></div>
            </div>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
              {loading && !overview ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />) : overview?.domains.map((domain) => {
                const Icon = DOMAIN_ICONS[domain.key as keyof typeof DOMAIN_ICONS] ?? Globe
                const style = HEALTH_STYLE[domain.health]
                return <Link key={domain.key} href={domain.href} className={`group relative overflow-hidden rounded-2xl border ${style.border} bg-gradient-to-br ${style.wash} via-white to-white p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50`}>
                  <div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white bg-white/80 shadow-sm"><Icon className="h-4 w-4 text-slate-700" /></span><span className={`flex items-center gap-1.5 text-[10px] font-medium ${style.text}`}><span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{domain.healthLabel}</span></div>
                  <div className="mt-4 flex items-end gap-2"><p className="text-3xl font-semibold tracking-tight text-slate-950">{domain.primaryValue}</p><p className="pb-1 text-[11px] text-slate-500">{domain.primaryLabel}</p></div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{domain.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{domain.painPoint}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5"><span className="text-[10px] text-slate-400">{domain.agent}</span><ArrowRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-600" /></div>
                </Link>
              })}
              {!loading && overview?.domains.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-slate-400">当前角色没有跨域业务读取权限，仍可使用自己的白泽 Agent 团队。</div>}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-indigo-600" /><h2 className="font-semibold text-slate-950">最近联合行动</h2></div><p className="mt-1 text-xs text-slate-500">真实任务与业务回读结果</p></div><Button size="sm" variant="ghost" asChild><Link href="/ai-agents/execution">全部<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button></div>
              <CardContent className="space-y-2 p-3">
                {loading && !overview ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : overview?.recentTasks.map((task) => (
                  <Link key={task.id} href={`/ai-agents/execution?task=${task.id}`} className="block rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/30">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{task.command}</p><p className="mt-1 truncate text-[10px] text-slate-400">{task.agents || '白泽总调度'} · {task.nodes} 个节点</p></div><Badge className={task.state === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : task.state === 'AWAITING_APPROVAL' ? 'bg-amber-100 text-amber-700' : task.state === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-700'}>{taskStateLabel(task.state)}</Badge></div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400"><span>{task.verified_effects > 0 ? `${task.verified_effects} 项业务效果已验证` : task.state === 'CANCELLED' ? '安全收回，未发生业务写入' : '等待业务结果'}</span><span>{formatTime(task.updated_at)}</span></div>
                  </Link>
                ))}
                {!loading && overview?.recentTasks.length === 0 && <div className="p-8 text-center text-sm text-slate-400">尚无受控任务</div>}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-800 bg-[#0a1424] text-white shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-medium tracking-[0.16em] text-cyan-200/60">DATA & EXECUTION PROOF</p><h3 className="mt-1 font-semibold">不是动画，而是七段式受控闭环</h3></div><ShieldCheck className="h-6 w-6 text-cyan-300" /></div>
                <div className="mt-5 grid grid-cols-7 gap-1">{['接令','预览','审批','提交','回读','审计','汇报'].map((step, index) => <div key={step} className="text-center"><div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200/15 bg-cyan-200/[0.07] text-[10px] text-cyan-100">{index + 1}</div><p className="mt-1.5 text-[9px] text-slate-500">{step}</p></div>)}</div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-2"><p className="text-lg font-semibold text-cyan-100">{overview?.dataset.activeUsers ?? '—'}</p><p className="text-[9px] text-slate-500">活跃租户人员</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-2"><p className="text-lg font-semibold text-violet-100">{agents.totalRoles || '—'}</p><p className="text-[9px] text-slate-500">正式角色模型</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-2"><p className="text-lg font-semibold text-emerald-100">{readiness?.executionReady ? '在线' : '检查'}</p><p className="text-[9px] text-slate-500">业务执行端口</p></div></div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </MainLayout>
  )
}
