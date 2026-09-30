'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Cpu, Database, Gauge, HeartPulse, Loader2, Network, RefreshCw, RotateCcw, Settings2, ShieldCheck, Sparkles, TriangleAlert, Workflow } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { backendLabel, formatDuration, routeModeLabel } from '@/lib/ai/presentation'

interface Overview {
  generatedAt: string
  persistence: string
  settings: { routeMode: string; primaryProvider?: string; fallbackProvider?: string; maxModelCalls: number; dailyBudgetCents: number; updatedAt?: string; updatedByName?: string }
  providers: Array<{ id: string; name: string; configured: boolean; modelConfigured: boolean; description: string }>
  runtime: { taskCount: number; awaitingApproval: number; active: number; verified: number; failed: number; completedNodes: number; totalNodes: number; averageDurationMs: number; latestActivityAt?: string }
  governance: { pendingOutbox: number; deadLetters: number; failedTools: number; newFeedback: number }
  catalog: { teams: number; agents: number; skills: number }
}
interface Diagnostic { id: string; label: string; status: 'healthy' | 'attention' | 'unavailable'; message: string }

function statusClass(status: Diagnostic['status']): string {
  if (status === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'attention') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

export default function AiOperationsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<'diagnose' | 'recover' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/ai/operations', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? 'AI 运维状态加载失败')
      setOverview(json.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'AI 运维状态加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(timer)
  }, [load])

  async function diagnose() {
    setWorking('diagnose'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'diagnose' }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '诊断未完成')
      setDiagnostics(json.data.checks ?? [])
      setNotice('白泽已完成一次真实自检，结果已回写到本页。')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '诊断未完成')
    } finally { setWorking(null) }
  }

  async function recover() {
    setWorking('recover'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/runtime/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 5, resume: true }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '恢复作业未完成')
      setNotice(json.data.recovered > 0 ? `已接回 ${json.data.recovered} 个可恢复任务，正在继续观察。` : '当前没有需要接回的任务，运行队列保持清洁。')
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '恢复作业未完成')
    } finally { setWorking(null) }
  }

  const providerReady = useMemo(() => overview?.providers.filter((provider) => provider.configured && provider.modelConfigured).length ?? 0, [overview])
  const runtimeHealth = overview && overview.governance.deadLetters === 0 && overview.governance.failedTools === 0

  return (
    <MainLayout>
      <div className="space-y-6 pb-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_78%_20%,rgba(251,191,36,0.2),transparent_28%),linear-gradient(135deg,#07111f,#101b33_58%,#171525)] px-6 py-7 text-white shadow-2xl md:px-9">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(103,232,249,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="relative flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2"><Badge className="border border-amber-200/20 bg-amber-200/10 text-amber-100"><ShieldCheck className="mr-1 h-3 w-3" />运维专责席</Badge><Badge variant="outline" className="border-white/15 text-slate-300">只看真实运行证据</Badge></div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">AI 系统运维中心</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">这里是白泽的值守台。模型通道、任务队列、治理账本、恢复作业与反馈样本都从真实租户数据读取；任何未配置的能力都会明确显示为未就绪。</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">当前路由：{overview ? routeModeLabel(overview.settings.routeMode) : '检查中'}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">持久化：{overview ? backendLabel(overview.persistence) : '检查中'}</span></div>
            </div>
            <BaizeAvatar mood={working ? 'busy' : runtimeHealth === false ? 'alert' : 'focus'} size={180} showThreads threadCount={3} />
          </div>
        </section>

        {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4" />{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Workflow className="h-4 w-4 text-indigo-600" />租户任务</div><p className="mt-2 text-2xl font-bold">{overview?.runtime.taskCount ?? '—'}</p><p className="text-xs text-gray-400">跨角色真实台账</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Activity className="h-4 w-4 text-cyan-600" />执行中</div><p className="mt-2 text-2xl font-bold text-cyan-700">{overview?.runtime.active ?? '—'}</p><p className="text-xs text-gray-400">队列与分灵体</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />验证完成</div><p className="mt-2 text-2xl font-bold text-emerald-700">{overview?.runtime.verified ?? '—'}</p><p className="text-xs text-gray-400">业务回读通过</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><AlertTriangle className="h-4 w-4 text-amber-600" />待审批</div><p className="mt-2 text-2xl font-bold text-amber-700">{overview?.runtime.awaitingApproval ?? '—'}</p><p className="text-xs text-gray-400">等待人工裁决</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><HeartPulse className="h-4 w-4 text-rose-600" />异常工具</div><p className="mt-2 text-2xl font-bold text-rose-700">{overview?.governance.failedTools ?? '—'}</p><p className="text-xs text-gray-400">保留重试证据</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Cpu className="h-4 w-4 text-violet-600" />外部模型</div><p className="mt-2 text-2xl font-bold text-violet-700">{providerReady}</p><p className="text-xs text-gray-400">完成密钥与模型配置</p></CardContent></Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-5 w-5 text-indigo-600" />值守动作</CardTitle><p className="mt-1 text-xs text-gray-500">所有按钮都调用真实运维接口，不会用动画掩盖异常。</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新</Button></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void diagnose()} disabled={working !== null} className="group rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"><div className="flex items-center justify-between"><span className="rounded-xl bg-indigo-600 p-2 text-white"><HeartPulse className="h-5 w-5" /></span>{working === 'diagnose' ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <span className="text-xs text-indigo-700">即时</span>}</div><p className="mt-4 font-semibold text-gray-900">运行全链路自检</p><p className="mt-1 text-xs leading-5 text-gray-500">检查团队目录、持久化表、模型通道与治理队列。</p></button>
              <button type="button" onClick={() => void recover()} disabled={working !== null} className="group rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg"><div className="flex items-center justify-between"><span className="rounded-xl bg-amber-500 p-2 text-white"><RotateCcw className="h-5 w-5" /></span>{working === 'recover' ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> : <span className="text-xs text-amber-700">可恢复任务</span>}</div><p className="mt-4 font-semibold text-gray-900">接回中断任务</p><p className="mt-1 text-xs leading-5 text-gray-500">只接管持有合法租约且仍可重试的任务，失败会留痕。</p></button>
              <Link href="/ai-agents/model-gateway" className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"><Settings2 className="h-6 w-6 text-violet-600" /><p className="mt-4 font-semibold text-gray-900">模型路由与预算</p><p className="mt-1 text-xs leading-5 text-gray-500">设置受控路由边界，未配置通道不会被强行调用。</p></Link>
              <Link href="/ai-agents/learning" className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"><Network className="h-6 w-6 text-emerald-600" /><p className="mt-4 font-semibold text-gray-900">反馈样本审核</p><p className="mt-1 text-xs leading-5 text-gray-500">当前待审核样本 {overview?.governance.newFeedback ?? 0} 条，进入人工复核池。</p></Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="h-5 w-5 text-cyan-600" />模型通道值守</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {overview?.providers.map((provider) => <div key={provider.id} className="flex items-center gap-3 rounded-xl border p-3"><div className={`h-2.5 w-2.5 rounded-full ${provider.configured && provider.modelConfigured ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'bg-slate-300'}`} /><div className="min-w-0 flex-1"><p className="font-medium text-gray-900">{provider.name}</p><p className="truncate text-xs text-gray-500">{provider.description}</p></div><Badge className={provider.configured && provider.modelConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{provider.configured && provider.modelConfigured ? '已就绪' : '未接入'}</Badge></div>)}
              {!overview && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>}
              <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-900"><ShieldCheck className="mr-1 inline h-4 w-4" />当前白泽仍以可审计的受控路由为主，外部模型未配置时不会伪造连通或调用。</div>
            </CardContent>
          </Card>
        </div>

        {diagnostics.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-5 w-5 text-emerald-600" />最近一次自检</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{diagnostics.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${statusClass(item.status)}`}><div className="flex items-center justify-between gap-2"><p className="font-semibold">{item.label}</p><Badge variant="outline">{item.status === 'healthy' ? '正常' : item.status === 'attention' ? '需关注' : '未就绪'}</Badge></div><p className="mt-1 text-sm leading-5 opacity-80">{item.message}</p></div>)}</CardContent></Card>}

        <Card className="border-slate-200 bg-slate-50"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-slate-600" /><div><p className="font-semibold text-slate-900">运维边界</p><p className="mt-1 text-sm text-slate-600">运维管理员可以观察、恢复、调试和治理 AI 运行，但业务数据仍按租户、角色和 Skill 权限隔离。</p></div></div><Button asChild variant="outline"><Link href="/ai-agents/runtime">打开全屏运行星图</Link></Button></CardContent></Card>
      </div>
    </MainLayout>
  )
}
