'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Building2, CheckCircle2, Expand, Gauge, GitBranch, Loader2, RefreshCw, ShieldCheck, Sparkles, Wrench, Zap } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { BaizeConstellation } from '@/components/ai/baize-constellation'
import { TaskDetail } from '@/components/ai/product/task-detail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { AiProductTask } from '@/lib/ai/product-types'

interface Scenario {
  key: 'forum_assurance' | 'repair_sla' | 'energy_guard' | 'hygiene_closure'
  title: string
  subtitle: string
  painPoint: string
  outcome: string
  spirits: string[]
  risk: string
  steps: number
  availableRecords: number
  availableToCurrentRole: boolean
}

const SCENARIO_STYLE = {
  forum_assurance: { icon: Building2, accent: 'cyan', glow: 'from-cyan-400/18 via-blue-500/8', iconStyle: 'bg-cyan-100 text-cyan-700', badge: '跨部门旗舰' },
  repair_sla: { icon: Wrench, accent: 'amber', glow: 'from-amber-400/18 via-orange-500/8', iconStyle: 'bg-amber-100 text-amber-700', badge: '高频痛点' },
  energy_guard: { icon: Zap, accent: 'violet', glow: 'from-violet-400/18 via-indigo-500/8', iconStyle: 'bg-violet-100 text-violet-700', badge: '预测性运维' },
  hygiene_closure: { icon: ShieldCheck, accent: 'emerald', glow: 'from-emerald-400/18 via-teal-500/8', iconStyle: 'bg-emerald-100 text-emerald-700', badge: '责任闭环' },
} as const

export default function ScenarioOrchestrationPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selected, setSelected] = useState<Scenario['key']>('forum_assurance')
  const [activeTask, setActiveTask] = useState<AiProductTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/ai/scenarios', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '业务场景加载失败')
      setScenarios(json.data.scenarios ?? [])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '业务场景加载失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const selectedScenario = useMemo(() => scenarios.find((item) => item.key === selected), [scenarios, selected])
  const available = scenarios.filter((scenario) => scenario.availableToCurrentRole && scenario.availableRecords > 0).length
  const spiritCount = new Set(scenarios.flatMap((scenario) => scenario.spirits)).size

  async function launch() {
    if (!selectedScenario) return
    setLaunching(true); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/scenarios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: selectedScenario.key }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '场景执行预览生成失败')
      setActiveTask(json.data)
      setNotice('白泽已读取真实业务记录并形成执行预览。当前未发生业务写入，请核对后再进行人工裁决。')
      await load()
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : '场景执行预览生成失败')
    } finally { setLaunching(false) }
  }

  async function decide(action: 'confirm' | 'reject') {
    if (!activeTask) return
    setDeciding(true); setError(null)
    try {
      const response = await fetch(`/api/ai/tasks/${activeTask.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'confirm' ? '场景编排台人工核对全部真实执行预览后批准' : '场景编排台人工决定暂不执行' }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '人工裁决失败')
      setActiveTask(json.data)
      setNotice(action === 'confirm' ? '分灵体已完成受控业务执行，白泽正在归整回读成果。' : '白泽已收回全部光路，没有发生业务写入。')
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : '人工裁决失败')
    } finally { setDeciding(false) }
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1600px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_78%_20%,rgba(167,139,250,0.2),transparent_26%),radial-gradient(circle_at_20%_90%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#07111f,#101931_58%,#17152d)] px-6 py-8 text-white shadow-2xl md:px-9">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(103,232,249,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="relative grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div><div className="flex flex-wrap items-center gap-2"><Badge className="border border-violet-200/20 bg-violet-200/10 text-violet-100"><GitBranch className="mr-1 h-3 w-3" />业务场景编排</Badge><Badge variant="outline" className="border-emerald-200/20 text-emerald-200">真实记录解析</Badge><Badge variant="outline" className="border-amber-200/20 text-amber-100">人工裁决后执行</Badge></div><h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">把跨部门痛点，封装成可重复运行的 Agent 联合作战方案</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">每个模板都会现场选择满足条件的真实业务记录，形成权限受控的多节点执行预览。按钮不会直接修改数据；只有人工核对并批准后，分灵体才会提交事务并完成回读。</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">标杆场景 {scenarios.length || '—'}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">当前角色可启动 {available}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">分灵体类型 {spiritCount || '—'}</span></div></div>
            <div className="flex justify-center lg:justify-end"><BaizeAvatar mood={launching || deciding ? 'busy' : activeTask?.status === 'verified' ? 'success' : 'focus'} size={230} showThreads threadCount={3} /></div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_390px]">
          <section className="grid gap-4 md:grid-cols-2">
            {loading && scenarios.length === 0 ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-80 animate-pulse rounded-3xl bg-slate-100" />) : scenarios.map((scenario) => {
              const style = SCENARIO_STYLE[scenario.key]
              const Icon = style.icon
              const active = selected === scenario.key
              const runnable = scenario.availableToCurrentRole && scenario.availableRecords > 0
              return <button key={scenario.key} type="button" onClick={() => setSelected(scenario.key)} className={`group relative overflow-hidden rounded-3xl border bg-white p-5 text-left transition duration-200 ${active ? 'border-cyan-300 shadow-[0_14px_40px_rgba(8,145,178,0.12)]' : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg'}`}>
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.glow} to-transparent opacity-70`} />
                <div className="relative"><div className="flex items-start justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${style.iconStyle}`}><Icon className="h-5 w-5" /></span><div className="flex flex-wrap justify-end gap-1.5"><Badge variant="outline" className="bg-white/70 text-[10px]">{style.badge}</Badge><Badge className={runnable ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{runnable ? '可启动' : scenario.availableToCurrentRole ? '等待业务记录' : '当前角色只读'}</Badge></div></div><p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-slate-400">{scenario.subtitle}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{scenario.title}</h2><div className="mt-4 rounded-xl border border-slate-100 bg-white/65 p-3"><p className="text-[10px] font-semibold text-rose-600">现实痛点</p><p className="mt-1 text-xs leading-5 text-slate-600">{scenario.painPoint}</p></div><div className="mt-3 rounded-xl border border-slate-100 bg-white/65 p-3"><p className="text-[10px] font-semibold text-emerald-600">可交付成果</p><p className="mt-1 text-xs leading-5 text-slate-600">{scenario.outcome}</p></div><div className="mt-4 flex items-center justify-between text-[11px] text-slate-400"><span>{scenario.spirits.join(' · ')}</span><span>{scenario.steps} 个执行节点</span></div></div>
              </button>
            })}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
            <Card className="overflow-hidden border-slate-800 bg-[#0a1424] text-white shadow-xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold tracking-[0.16em] text-cyan-200/60">LAUNCH CONTROL</p><h3 className="mt-1 text-lg font-semibold">白泽场景启动台</h3></div><Gauge className="h-6 w-6 text-cyan-300" /></div>
                {selectedScenario ? <div className="mt-5"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4"><p className="text-sm font-semibold text-cyan-50">{selectedScenario.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">将调度 {selectedScenario.spirits.join('、')}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[0.04] p-2"><p className="text-lg font-semibold text-white">{selectedScenario.steps}</p><p className="text-[9px] text-slate-500">节点</p></div><div className="rounded-lg bg-white/[0.04] p-2"><p className="text-lg font-semibold text-white">{selectedScenario.availableRecords}</p><p className="text-[9px] text-slate-500">可用记录</p></div><div className="rounded-lg bg-white/[0.04] p-2"><p className="text-xs font-semibold leading-6 text-amber-200">{selectedScenario.risk}</p><p className="text-[9px] text-slate-500">风险</p></div></div></div><div className="mt-4 space-y-2">{['解析真实业务目标','形成多 Agent 执行预览','等待人工裁决','事务提交与业务回读','白泽归整成果汇报'].map((step, index) => <div key={step} className="flex items-center gap-2 text-xs text-slate-400"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] text-[9px] text-cyan-200">{index + 1}</span>{step}</div>)}</div><Button className="mt-5 w-full rounded-xl bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => void launch()} disabled={launching || !selectedScenario.availableToCurrentRole || selectedScenario.availableRecords < 1}>{launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{launching ? '白泽正在解析真实记录' : '生成受控执行预览'}</Button><p className="mt-2 text-center text-[10px] text-slate-600">此按钮只生成预览，不直接修改业务数据</p></div> : <div className="py-10 text-center text-sm text-slate-500">请选择一个场景</div>}
              </CardContent>
            </Card>
            <Button variant="outline" className="w-full rounded-xl bg-white" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}重新核验可用记录</Button>
          </aside>
        </div>

        {activeTask && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-950">当前联合行动</h2><p className="mt-1 text-xs text-slate-500">真实分工、业务预览、人工裁决与回读证据</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href={`/ai-agents/runtime?task=${activeTask.id}`}><Expand className="mr-2 h-4 w-4" />全屏观察</Link></Button><Button variant="ghost" asChild><Link href={`/ai-agents/execution?task=${activeTask.id}`}>进入任务台账<ArrowRight className="ml-1 h-4 w-4" /></Link></Button></div></div><BaizeConstellation task={activeTask} /><TaskDetail task={activeTask} deciding={deciding} onDecision={(action) => void decide(action)} /></section>}
      </div>
    </MainLayout>
  )
}
