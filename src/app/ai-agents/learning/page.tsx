'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, Beaker, CheckCircle2, ChevronRight, Database,
  Gauge, GitCompareArrows, History, Loader2, LockKeyhole, RefreshCw, RotateCcw,
  ShieldCheck, Sparkles, Target, TriangleAlert, WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { EvolutionExperimentView, EvolutionOverview, EvolutionRankingWeights } from '@/lib/ai/platform/evolution-types'

const PRESETS: Array<{ id: string; name: string; detail: string; weights: EvolutionRankingWeights }> = [
  { id: 'balanced', name: '均衡增强', detail: '兼顾制度关键词与口语化问法', weights: { lexical: 0.40, vector: 0.40, graph: 0.15, authority: 0.05 } },
  { id: 'semantic', name: '语义优先', detail: '提高自然语言相似问法召回', weights: { lexical: 0.38, vector: 0.42, graph: 0.15, authority: 0.05 } },
  { id: 'evidence', name: '证据优先', detail: '提高图谱关系与权威来源贡献', weights: { lexical: 0.39, vector: 0.36, graph: 0.18, authority: 0.07 } },
]
const WEIGHT_LABELS: Array<{ key: keyof EvolutionRankingWeights; label: string; color: string }> = [
  { key: 'lexical', label: '制度关键词', color: 'bg-cyan-400' },
  { key: 'vector', label: '语义向量', color: 'bg-violet-400' },
  { key: 'graph', label: '知识图谱', color: 'bg-amber-400' },
  { key: 'authority', label: '权威来源', color: 'bg-emerald-400' },
]
const STATUS_LABEL: Record<string, string> = { DRAFT: '待评测', EVALUATING: '评测中', READY_FOR_REVIEW: '待人工审批', APPROVED: '生产生效', REJECTED: '已退回', ROLLED_BACK: '已回滚' }
const STATUS_CLASS: Record<string, string> = { DRAFT: 'border-slate-200 bg-slate-50 text-slate-600', EVALUATING: 'border-blue-200 bg-blue-50 text-blue-700', READY_FOR_REVIEW: 'border-amber-200 bg-amber-50 text-amber-700', APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700', REJECTED: 'border-rose-200 bg-rose-50 text-rose-700', ROLLED_BACK: 'border-violet-200 bg-violet-50 text-violet-700' }

function formatPercent(value: number | undefined): string { return value == null ? '—' : `${Math.round(value * 100)}%` }
function formatDate(value?: string): string { return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }

function WeightBars({ weights, compact = false }: { weights: EvolutionRankingWeights; compact?: boolean }) {
  return <div className={compact ? 'space-y-2' : 'space-y-3'}>{WEIGHT_LABELS.map((item) => <div key={item.key}><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{item.label}</span><span className="font-semibold text-slate-800">{Math.round(weights[item.key] * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${weights[item.key] * 100}%` }} /></div></div>)}</div>
}

function EvolutionPipeline({ experiment }: { experiment?: EvolutionExperimentView }) {
  const status = experiment?.status
  const evaluated = Boolean(experiment?.latestRun && experiment.latestRun.status !== 'RUNNING')
  const approved = status === 'APPROVED'
  const steps = [
    { label: '问题信号', detail: experiment?.signalId ? '已关联真实信号' : '人工优化假设', done: Boolean(experiment) },
    { label: '候选策略', detail: experiment?.candidateVersion ?? '等待创建', done: Boolean(experiment) },
    { label: '固定基准评测', detail: evaluated ? `${experiment?.latestRun?.passedCases}/${experiment?.latestRun?.caseCount} 样本通过` : '尚未执行', done: evaluated },
    { label: '安全与质量闸门', detail: evaluated ? `安全 ${formatPercent(experiment?.latestRun?.safetyScore)}` : '等待评测证据', done: experiment?.latestRun?.status === 'PASSED' },
    { label: '人工发布', detail: approved ? '已由运维管理员签发' : status === 'READY_FOR_REVIEW' ? '等待人工裁决' : '不得自动生效', done: approved },
  ]
  return <div className="grid gap-2 lg:grid-cols-5">{steps.map((step, index) => <div key={step.label} className={`relative rounded-2xl border p-3 ${step.done ? 'border-cyan-200 bg-cyan-50/70' : 'border-slate-200 bg-white'}`}><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${step.done ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span><p className="text-xs font-semibold text-slate-800">{step.label}</p></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{step.detail}</p>{index < steps.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 lg:block" />}</div>)}</div>
}

export default function AiLearningPage() {
  const [overview, setOverview] = useState<EvolutionOverview | null>(null)
  const [selectedPreset, setSelectedPreset] = useState('semantic')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch('/api/ai/evolution', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '自进化治理数据加载失败')
      setOverview(json.data)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '自进化治理数据加载失败') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(action: Record<string, unknown>, key: string, successMessage: string) {
    setBusy(key); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/evolution', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '操作未完成')
      setNotice(successMessage)
      await load()
      return json.data
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '操作未完成') }
    finally { setBusy(null) }
  }

  const latestExperiment = overview?.experiments[0]
  const activeRelease = overview?.releases.find((item) => item.status === 'ACTIVE')
  const preset = PRESETS.find((item) => item.id === selectedPreset) ?? PRESETS[0]
  const unresolvedSignal = overview?.signals.find((item) => item.status === 'OPEN')
  const dataset = overview?.datasets.find((item) => item.status === 'ACTIVE')
  const canCreate = Boolean(dataset)
  const qualityDelta = latestExperiment?.latestRun?.candidateScore != null && latestExperiment.latestRun.baselineScore != null ? latestExperiment.latestRun.candidateScore - latestExperiment.latestRun.baselineScore : undefined

  async function createCandidate() {
    await act({ action: 'create', datasetId: dataset?.id, signalId: unresolvedSignal?.id, hypothesis: `${preset.detail}，并且不得降低现有关键业务样本的命中质量与安全边界。`, changeSummary: `采用“${preset.name}”受控策略；所有变化必须先通过固定基准集，再由 AI 运维管理员人工签发。`, candidateWeights: preset.weights }, 'create', '候选策略已创建，尚未影响生产；请继续执行固定基准评测。')
  }

  return <MainLayout><div data-testid="evolution-workbench" className="space-y-6 pb-10">
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#071321] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,47,73,0.25)] md:px-9" style={{ background: 'radial-gradient(circle at 80% 16%, rgba(34,211,238,.17), transparent 30%), radial-gradient(circle at 25% 90%, rgba(139,92,246,.13), transparent 28%), linear-gradient(135deg,#071321,#0a2133 58%,#17152f)' }}>
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" /><div className="absolute bottom-0 left-1/3 h-48 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-7"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><WandSparkles className="mr-1 h-3.5 w-3.5" />治理型自进化中枢</Badge><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[11px] text-emerald-200"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />生产策略受控</span></div><h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">让白泽持续进化，但永远不能越过人类裁决</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">真实运行信号进入样本池，候选策略在固定黄金集上完成回归评测；只有安全满分、质量不退化且经 AI 运维管理员签发的版本，才会进入生产检索链路。</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">当前版本 {overview?.production.version ?? '读取中'}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">基准样本 {overview?.metrics.benchmarkCases ?? 0}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">自动发布权限 0</span></div></div><BaizeAvatar mood={busy ? 'busy' : 'success'} size={184} showThreads threadCount={4} /></div>
    </section>

    {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert className="mt-0.5 h-4 w-4" />{error}</div>}
    {notice && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {([
        ['开放信号', overview?.metrics.openSignals ?? 0, Activity, 'text-rose-600'], ['黄金数据集', overview?.metrics.benchmarkDatasets ?? 0, Database, 'text-blue-600'], ['固定样本', overview?.metrics.benchmarkCases ?? 0, Target, 'text-cyan-600'], ['候选实验', overview?.metrics.experiments ?? 0, Beaker, 'text-violet-600'], ['待人工审批', overview?.metrics.readyForReview ?? 0, LockKeyhole, 'text-amber-600'], ['评测通过率', formatPercent(overview?.metrics.evaluationPassRate), Gauge, 'text-emerald-600'],
      ] as Array<[string, string | number, LucideIcon, string]>).map(([label, value, Icon, color]) => <Card key={String(label)} className="border-slate-200/80"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{String(label)}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-2xl font-bold text-slate-900">{String(value)}</p></CardContent></Card>)}
    </div>

    <Card className="overflow-hidden border-slate-200"><CardHeader className="border-b bg-slate-50/70"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><GitCompareArrows className="h-5 w-5 text-cyan-600" />生产策略与候选对照</CardTitle><p className="mt-1 text-xs text-slate-500">页面只展示业务可理解的贡献比例，不暴露配置代码或底层查询。</p></div><Button variant="outline" size="sm" disabled={busy === 'collect'} onClick={() => void act({ action: 'collect' }, 'collect', '已从反馈、模型网关、知识检索与 Agent 任务中采集最新真实信号。')}><RefreshCw className={`mr-2 h-4 w-4 ${busy === 'collect' ? 'animate-spin' : ''}`} />采集最新运行信号</Button></div></CardHeader><CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"><div className="mb-4 flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-900">线上生产策略</p><p className="mt-1 text-xs text-slate-500">{overview?.production.governedRelease ? '已经人工审批并写入生产检索链路' : '当前使用系统安全基线'}</p></div><Badge className="bg-emerald-100 text-emerald-700">{overview?.production.version ?? '—'}</Badge></div>{overview && <WeightBars weights={overview.production.weights} />}</div>
      <div className="flex items-center justify-center"><GitCompareArrows className="h-7 w-7 text-slate-300" /></div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5"><div className="mb-4 flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-900">最新候选策略</p><p className="mt-1 text-xs text-slate-500">{latestExperiment?.candidateVersion ?? '尚未建立候选'}</p></div>{latestExperiment && <Badge variant="outline" className={STATUS_CLASS[latestExperiment.status]}>{STATUS_LABEL[latestExperiment.status]}</Badge>}</div>{latestExperiment ? <WeightBars weights={latestExperiment.candidateWeights} /> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">选择策略后创建受控候选</div>}</div>
    </CardContent></Card>

    <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-cyan-600" />五道治理闸门</CardTitle></CardHeader><CardContent><EvolutionPipeline experiment={latestExperiment} /></CardContent></Card>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-5 w-5 text-violet-600" />创建下一轮受控候选</CardTitle></CardHeader><CardContent className="space-y-4"><div><p className="text-sm font-medium text-slate-800">选择优化方向</p><Select value={selectedPreset} onValueChange={setSelectedPreset}><SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent>{PRESETS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.detail}</SelectItem>)}</SelectContent></Select></div><div className="rounded-2xl border bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-900">{preset.name}</p><p className="mt-1 text-xs text-slate-500">{preset.detail}</p></div><Badge variant="outline">总贡献 100%</Badge></div><WeightBars weights={preset.weights} compact /></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><LockKeyhole className="mr-1 inline h-4 w-4" />创建候选不会改变线上策略；评测通过后仍必须人工点击“批准发布”。</div><Button className="w-full" disabled={!canCreate || Boolean(busy)} onClick={() => void createCandidate()}>{busy === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Beaker className="mr-2 h-4 w-4" />}创建候选实验</Button></CardContent></Card>

      <Card className="border-slate-200"><CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Target className="h-5 w-5 text-cyan-600" />最新实验裁决台</CardTitle>{latestExperiment && <Badge variant="outline" className={STATUS_CLASS[latestExperiment.status]}>{STATUS_LABEL[latestExperiment.status]}</Badge>}</div></CardHeader><CardContent>{!latestExperiment ? <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-slate-400">暂无候选实验</div> : <div className="space-y-4"><div><p className="text-base font-semibold text-slate-900">{latestExperiment.hypothesis}</p><p className="mt-2 text-sm leading-6 text-slate-500">{latestExperiment.changeSummary}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
        ['样本通过', latestExperiment.latestRun ? `${latestExperiment.latestRun.passedCases}/${latestExperiment.latestRun.caseCount}` : '—'], ['安全得分', formatPercent(latestExperiment.latestRun?.safetyScore)], ['基线质量', formatPercent(latestExperiment.latestRun?.baselineScore)], ['候选质量', formatPercent(latestExperiment.latestRun?.candidateScore)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>)}</div>{qualityDelta != null && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${qualityDelta >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{qualityDelta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}候选相对基线 {qualityDelta >= 0 ? '未退化' : '发生退化'}，差值 {formatPercent(Math.abs(qualityDelta))}</div>}<div className="flex flex-wrap gap-2">{latestExperiment.status === 'DRAFT' && <Button disabled={Boolean(busy)} onClick={() => void act({ action: 'evaluate', experimentId: latestExperiment.id }, `evaluate-${latestExperiment.id}`, '已完成真实检索回归，评测证据与哈希已持久化。')}>{busy?.startsWith('evaluate') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}执行固定基准评测</Button>}{latestExperiment.status === 'READY_FOR_REVIEW' && <><Button disabled={Boolean(busy)} onClick={() => void act({ action: 'approve', experimentId: latestExperiment.id, releaseNotes: 'AI 运维管理员已复核全部基准样本、安全得分、质量差异与证据哈希，批准候选进入受控生产。' }, `approve-${latestExperiment.id}`, '候选已由人工签发并实时接入生产知识检索；可随时一键回滚。')}><ShieldCheck className="mr-2 h-4 w-4" />人工批准发布</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void act({ action: 'reject', experimentId: latestExperiment.id, reason: '需补充更多业务样本后重新评测。' }, `reject-${latestExperiment.id}`, '候选已退回，不会影响生产策略。')}>退回候选</Button></>}{latestExperiment.status === 'APPROVED' && activeRelease && <Button variant="outline" disabled={Boolean(busy)} onClick={() => void act({ action: 'rollback', releaseId: activeRelease.id, reason: '运维管理员执行受控回滚验证。' }, `rollback-${activeRelease.id}`, '生产策略已回滚至系统安全基线，回滚证据已留痕。')}><RotateCcw className="mr-2 h-4 w-4" />一键回滚至安全基线</Button>}</div></div>}</CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-rose-600" />真实运行信号池</CardTitle></CardHeader><CardContent className="space-y-3">{!overview?.signals.length ? <div className="rounded-xl border border-dashed p-9 text-center text-sm text-slate-400">点击“采集最新运行信号”建立可追踪问题池</div> : overview.signals.slice(0, 6).map((signal) => <div key={signal.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${signal.severity === 'critical' ? 'bg-rose-600' : signal.severity === 'high' ? 'bg-orange-500' : signal.severity === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`} /><p className="text-sm font-semibold text-slate-900">{signal.sourceType === 'FEEDBACK' ? '用户反馈' : signal.sourceType === 'MODEL_INVOCATION' ? '模型网关' : signal.sourceType === 'RETRIEVAL' ? '知识检索' : signal.sourceType === 'TASK' ? 'Agent 任务' : '人工观察'}</p></div><Badge variant="outline">{signal.status === 'OPEN' ? '待分析' : signal.status === 'LINKED' ? '已关联实验' : signal.status === 'RESOLVED' ? '已闭环' : '已关闭'}</Badge></div><p className="mt-2 text-xs leading-5 text-slate-600">{signal.summary}</p><p className="mt-2 text-[10px] text-slate-400">证据指纹 {signal.evidenceHash.slice(0, 12)}… · {formatDate(signal.updatedAt)}</p></div>)}</CardContent></Card>
      <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-violet-600" />版本发布与回滚账本</CardTitle></CardHeader><CardContent className="space-y-3">{!overview?.releases.length ? <div className="rounded-xl border border-dashed p-9 text-center text-sm text-slate-400">尚无人工签发版本</div> : overview.releases.slice(0, 6).map((release) => <div key={release.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-900">{release.version}</p><p className="mt-1 text-xs text-slate-500">签发人 {release.activatedByName} · {formatDate(release.activatedAt)}</p></div><Badge className={release.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}>{release.status === 'ACTIVE' ? '生产生效' : '已回滚'}</Badge></div><p className="mt-3 text-xs leading-5 text-slate-600">{release.releaseNotes}</p>{release.rolledBackAt && <p className="mt-2 text-[10px] text-violet-500">回滚于 {formatDate(release.rolledBackAt)}</p>}</div>)}</CardContent></Card>
    </div>

    <Card className="border-cyan-200 bg-cyan-50/40"><CardContent className="grid gap-3 p-5 md:grid-cols-5">{overview?.guardrails.map((guardrail, index) => <div key={guardrail} className="flex items-start gap-2 rounded-xl border border-cyan-100 bg-white p-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold text-white">{index + 1}</span><p className="text-xs leading-5 text-slate-600">{guardrail}</p></div>)}</CardContent></Card>
  </div></MainLayout>
}
