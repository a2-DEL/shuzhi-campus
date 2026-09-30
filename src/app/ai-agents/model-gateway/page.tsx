'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BrainCircuit, CheckCircle2, CircleDollarSign, Loader2, LockKeyhole, RefreshCw, Save, ShieldCheck, SlidersHorizontal, TriangleAlert, Zap } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { routeModeLabel } from '@/lib/ai/presentation'

interface Overview {
  settings: { routeMode: 'local_governed' | 'external_preferred' | 'hybrid_fail_closed'; primaryProvider?: string; fallbackProvider?: string; maxModelCalls: number; dailyBudgetCents: number; updatedAt?: string; updatedByName?: string }
  providers: Array<{ id: string; name: string; configured: boolean; modelConfigured: boolean; description: string }>
  modelUsage: { callsToday: number; succeededToday: number; failedToday: number; promptTokensToday: number; completionTokensToday: number; totalTokensToday: number; estimatedCostCentsToday: number; latestCallAt?: string }
}
interface Diagnostic { id: string; label: string; status: 'healthy' | 'attention' | 'unavailable'; message: string }

const MODES = [
  { value: 'local_governed', label: '本地受控路由', description: '白泽使用可审计的规则与业务 Skill，适合当前无外部模型配置的环境。' },
  { value: 'external_preferred', label: '外部模型优先', description: '仅在主模型密钥与模型名称均已配置时允许保存。' },
  { value: 'hybrid_fail_closed', label: '混合路由与失败关闭', description: '外部通道异常时回到受控路由，任何不确定结果都停止。' },
] as const

export default function AiModelGatewayPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [mode, setMode] = useState<Overview['settings']['routeMode']>('local_governed')
  const [primary, setPrimary] = useState('none')
  const [fallback, setFallback] = useState('none')
  const [maxCalls, setMaxCalls] = useState('24')
  const [budgetYuan, setBudgetYuan] = useState('0')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/ai/operations', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '模型路由状态加载失败')
      const data = json.data as Overview
      setOverview(data)
      setMode(data.settings.routeMode)
      setPrimary(data.settings.primaryProvider ?? 'none')
      setFallback(data.settings.fallbackProvider ?? 'none')
      setMaxCalls(String(data.settings.maxModelCalls))
      setBudgetYuan(String(Math.round(data.settings.dailyBudgetCents / 100)))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '模型路由状态加载失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const readyProviders = useMemo(() => overview?.providers.filter((item) => item.configured && item.modelConfigured) ?? [], [overview])

  async function save() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/operations', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ routeMode: mode, primaryProvider: primary === 'none' ? undefined : primary, fallbackProvider: fallback === 'none' ? undefined : fallback, maxModelCalls: Number(maxCalls), dailyBudgetCents: Math.round(Number(budgetYuan) * 100) }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '路由设置保存失败')
      setNotice('路由边界已保存到当前学校租户。')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '路由设置保存失败')
    } finally { setSaving(false) }
  }

  async function diagnose() {
    setChecking(true); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'diagnose' }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '通道检查失败')
      setDiagnostics(json.data.checks ?? [])
      setNotice('通道配置检查已完成；检查只读取配置状态，不会泄露密钥。')
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : '通道检查失败')
    } finally { setChecking(false) }
  }

  return (
    <MainLayout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2 text-xs text-gray-400"><Link href="/ai-agents/operations" className="inline-flex items-center gap-1 hover:text-indigo-600"><ArrowLeft className="h-3.5 w-3.5" />返回运维中心</Link><span>/</span><span>AI-4</span></div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-950"><BrainCircuit className="h-6 w-6 text-violet-600" />模型路由与预算中心</h1><p className="mt-1 text-sm text-gray-500">先把模型接入边界、预算和失败关闭规则做成可操作页面；没有真实配置的通道不会被假装可用。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void diagnose()} disabled={checking}>{checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}检查通道</Button><Button onClick={() => void save()} disabled={saving || loading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存边界</Button></div></div>

        <section className="relative overflow-hidden rounded-3xl border border-violet-900 bg-[radial-gradient(circle_at_18%_20%,rgba(167,139,250,0.2),transparent_28%),linear-gradient(135deg,#111329,#1b1b3a_60%,#0c1728)] px-6 py-6 text-white shadow-xl"><div className="flex flex-wrap items-center justify-between gap-6"><div><Badge className="border border-violet-200/20 bg-violet-200/10 text-violet-100"><LockKeyhole className="mr-1 h-3 w-3" />失败关闭</Badge><h2 className="mt-3 text-2xl font-semibold">白泽先守住边界，再选择模型</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">路由配置会落在当前租户的运维设置中。外部模型只负责理解与规划，真正的业务写入仍必须经过 Skill Gateway、审批和回读验证。</p></div><BaizeAvatar mood="focus" size={132} /></div></section>

        {overview && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{'\u4eca\u65e5\u771f\u5b9e\u6a21\u578b\u8c03\u7528'}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{overview.modelUsage.callsToday}</p><p className="mt-1 text-xs text-emerald-600">{'\u6210\u529f'} {overview.modelUsage.succeededToday} {'\u00b7'} {'\u5931\u8d25'} {overview.modelUsage.failedToday}</p></div><div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{'\u4eca\u65e5'} Token</p><p className="mt-2 text-2xl font-semibold text-slate-950">{overview.modelUsage.totalTokensToday.toLocaleString('zh-CN')}</p><p className="mt-1 text-xs text-slate-500">{'\u8f93\u5165'} {overview.modelUsage.promptTokensToday.toLocaleString('zh-CN')} {'\u00b7'} {'\u8f93\u51fa'} {overview.modelUsage.completionTokensToday.toLocaleString('zh-CN')}</p></div><div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{'\u5f53\u524d\u771f\u5b9e\u901a\u9053'}</p><p className="mt-2 text-lg font-semibold text-slate-950">{overview.settings.primaryProvider === 'deepseek' ? 'DeepSeek' : '\u672c\u5730\u53d7\u63a7\u8def\u7531'}</p><p className="mt-1 text-xs text-emerald-600">{readyProviders.length > 0 ? '\u51ed\u636e\u3001\u6a21\u578b\u4e0e\u5ba1\u8ba1\u8d26\u672c\u5df2\u5c31\u7eea' : '\u7b49\u5f85\u670d\u52a1\u7aef\u914d\u7f6e'}</p></div><div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{'\u6700\u8fd1\u8c03\u7528\u8bc1\u636e'}</p><p className="mt-2 text-sm font-semibold text-slate-950">{overview.modelUsage.latestCallAt ? new Date(overview.modelUsage.latestCallAt).toLocaleString('zh-CN') : '\u5c1a\u65e0\u8c03\u7528'}</p><p className="mt-1 text-xs text-slate-500">{'\u539f\u59cb\u63d0\u793a\u8bcd\u4e0d\u5165\u8d26\uff0c\u4fdd\u7559\u54c8\u5e0c\u4e0e\u7528\u91cf'}</p></div></section>}

        {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4" />{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-5 w-5 text-violet-600" />路由边界</CardTitle></CardHeader><CardContent className="space-y-5">
            <div className="grid gap-2">{MODES.map((item) => <button key={item.value} type="button" onClick={() => setMode(item.value)} className={`rounded-2xl border p-4 text-left transition ${mode === item.value ? 'border-violet-400 bg-violet-50 shadow-sm' : 'border-gray-200 hover:border-violet-200'}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold text-gray-900">{item.label}</p>{mode === item.value && <Badge className="bg-violet-100 text-violet-700">当前选择</Badge>}</div><p className="mt-1 text-xs leading-5 text-gray-500">{item.description}</p></button>)}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-gray-800">主模型通道</p><Select value={primary} onValueChange={setPrimary}><SelectTrigger className="w-full"><SelectValue placeholder="选择主通道" /></SelectTrigger><SelectContent><SelectItem value="none">暂不接入外部模型</SelectItem>{overview?.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}{provider.configured && provider.modelConfigured ? ' · 已就绪' : ' · 未完成配置'}</SelectItem>)}</SelectContent></Select><p className="text-xs text-gray-400">当前已完成配置：{readyProviders.length} 个</p></div><div className="space-y-2"><p className="text-sm font-medium text-gray-800">备用通道</p><Select value={fallback} onValueChange={setFallback}><SelectTrigger className="w-full"><SelectValue placeholder="选择备用通道" /></SelectTrigger><SelectContent><SelectItem value="none">不设置备用通道</SelectItem>{overview?.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-gray-400">混合路由异常时仍会失败关闭。</p></div></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-5 w-5 text-emerald-600" />调用与预算护栏</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-medium text-gray-800">单任务最大模型调用</span><Input type="number" min={1} max={1000} value={maxCalls} onChange={(event) => setMaxCalls(event.target.value)} /><span className="block text-xs text-gray-400">当前任务计划也会保留独立预算。</span></label><label className="space-y-2"><span className="text-sm font-medium text-gray-800">每日预算上限（元）</span><Input type="number" min={0} step={1} value={budgetYuan} onChange={(event) => setBudgetYuan(event.target.value)} /><span className="block text-xs text-gray-400">填 0 表示暂不启用外部计费。</span></label></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-900">当前生效策略</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><span className="text-slate-400">路由</span><p className="font-medium text-slate-800">{routeModeLabel(mode)}</p></div><div><span className="text-slate-400">主通道</span><p className="font-medium text-slate-800">{overview?.providers.find((item) => item.id === primary)?.name ?? '本地受控路由'}</p></div><div><span className="text-slate-400">最近修改</span><p className="font-medium text-slate-800">{overview?.settings.updatedAt ? new Date(overview.settings.updatedAt).toLocaleString('zh-CN') : '尚未修改'}</p></div><div><span className="text-slate-400">修改人</span><p className="font-medium text-slate-800">{overview?.settings.updatedByName ?? '系统初始策略'}</p></div></div></div><div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />页面只允许选择已登记通道，密钥永远留在服务端；外部模型尚未接入时，保存外部路由会被服务端拒绝。</div></CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5 text-violet-600" />通道状态</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{overview?.providers.map((provider) => <div key={provider.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold text-gray-900">{provider.name}</p><span className={`h-2.5 w-2.5 rounded-full ${provider.configured && provider.modelConfigured ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div><p className="mt-2 text-sm text-gray-500">{provider.description}</p><div className="mt-4 flex flex-wrap gap-2"><Badge className={provider.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{provider.configured ? '服务凭据已发现' : '服务凭据未发现'}</Badge><Badge className={provider.modelConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{provider.modelConfigured ? '模型已指定' : '模型未指定'}</Badge></div></div>)}{!overview && <div className="col-span-full flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-600" /></div>}</CardContent></Card>

        {diagnostics.length > 0 && <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">通道检查结果</CardTitle><Button size="sm" variant="ghost" onClick={() => setDiagnostics([])}><RefreshCw className="mr-1 h-4 w-4" />收起</Button></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{diagnostics.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${item.status === 'healthy' ? 'border-emerald-200 bg-emerald-50' : item.status === 'attention' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between"><p className="font-medium">{item.label}</p><Badge variant="outline">{item.status === 'healthy' ? '正常' : item.status === 'attention' ? '需关注' : '未就绪'}</Badge></div><p className="mt-1 text-sm text-gray-600">{item.message}</p></div>)}</CardContent></Card>}
      </div>
    </MainLayout>
  )
}

