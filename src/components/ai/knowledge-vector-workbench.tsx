'use client'

import { useCallback, useEffect, useState } from 'react'
import { Binary, CheckCircle2, Database, Gauge, Layers3, Loader2, Route, Search, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { KnowledgeVectorDiagnostics, KnowledgeVectorSearchResponse } from '@/lib/ai/knowledge/types'

const ROUTE_LABEL: Record<string, string> = { HYBRID: '全文 + 向量', HYBRID_GRAPH: '全文 + 向量 + 图谱', REFUSED: '无授权证据' }
function percent(value: number): string { return `${Math.round(value * 100)}%` }
function scoreBar(label: string, value: number, color: string) {
  return <div><div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-700">{value.toFixed(3)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></div></div>
}

export function KnowledgeVectorWorkbench() {
  const [diagnostics, setDiagnostics] = useState<KnowledgeVectorDiagnostics | null>(null)
  const [query, setQuery] = useState('大型活动场地申请材料和审批流程')
  const [result, setResult] = useState<KnowledgeVectorSearchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const response = await fetch('/api/ai/knowledge/vector', { cache: 'no-store' }); const json = await response.json(); if (!response.ok) throw new Error(json.error ?? '向量诊断加载失败'); setDiagnostics(json.data) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '向量诊断加载失败') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function inspect() {
    if (query.trim().length < 2) return
    setSearching(true); setError(null)
    try {
      const response = await fetch('/api/ai/knowledge/vector', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) }); const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '向量检索失败')
      setResult(json.data); await load()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '向量检索失败') } finally { setSearching(false) }
  }

  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_80%_20%,rgba(34,211,238,.16),transparent_28%),radial-gradient(circle_at_10%_90%,rgba(99,102,241,.18),transparent_32%),linear-gradient(135deg,#020617,#07182b)] p-6 text-white"><div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(103,232,249,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,.08)_1px,transparent_1px)] [background-size:30px_30px]" /><div className="relative flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><Binary className="mr-1 h-3 w-3" />VECTOR RETRIEVAL LAB</Badge><h2 className="mt-3 text-2xl font-semibold">向量检索不是黑盒：每一分召回贡献都可查看</h2><p className="mt-2 text-xs leading-6 text-slate-300">当前真实后端使用 PostgreSQL `real[]` 余弦相似度与 128 维中文 n-gram 特征，并与全文、图谱、来源权威度融合。它不是伪装成 pgvector 的神经向量；后续可无损替换为神经 Embedding 与 ANN。</p></div><div className="flex flex-wrap gap-2"><Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><ShieldCheck className="mr-1 h-3 w-3" />先权限裁剪再召回</Badge><Badge className="border-white/10 bg-white/5 text-slate-300">不保存原始查询</Badge></div></div></section>

    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert className="mt-0.5 h-4 w-4" />{error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      { label: '向量维度', value: diagnostics?.dimensions ?? 0, note: diagnostics?.model ?? '检测中', icon: Binary },
      { label: '索引知识块', value: diagnostics?.coverage.indexedChunks ?? 0, note: `${diagnostics?.coverage.accessibleDocuments ?? 0} 份可访问文档`, icon: Layers3 },
      { label: '有效向量', value: diagnostics?.coverage.validVectors ?? 0, note: `${percent(diagnostics?.coverage.coverageRate ?? 0)} 覆盖`, icon: CheckCircle2 },
      { label: '平均召回延迟', value: `${diagnostics?.retrievals.averageLatencyMs ?? 0} ms`, note: `${diagnostics?.retrievals.total ?? 0} 次审计检索`, icon: Gauge },
      { label: '平均最高分', value: (diagnostics?.retrievals.averageTopScore ?? 0).toFixed(3), note: `${diagnostics?.retrievals.refused ?? 0} 次安全拒答`, icon: Route },
    ].map(({ label, value, note, icon: Icon }) => <Card key={label} className="border-slate-200/80"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><Icon className="h-4 w-4 text-cyan-600" /></div><p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? '—' : value}</p><p className="mt-1 truncate text-[10px] text-slate-400">{note}</p></CardContent></Card>)}</div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]"><div className="space-y-4"><Card className="border-cyan-100"><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void inspect() }} placeholder="输入业务问题，观察各通道召回贡献" /></div><Button className="h-11 bg-slate-950 text-cyan-100" onClick={() => void inspect()} disabled={searching || query.trim().length < 2}>{searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{searching ? '正在计算召回…' : '执行真实检索'}</Button></div></CardContent></Card>

      {result ? <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge className={result.routeMode === 'REFUSED' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>{ROUTE_LABEL[result.routeMode]}</Badge><span className="text-xs text-slate-500">{result.results.length} 个授权结果 · {result.latencyMs} ms</span></div><span className="text-xs text-slate-400">最高融合分 {result.topScore.toFixed(3)}</span></div>{result.results.map((item, index) => <Card key={item.chunkId} className="overflow-hidden border-slate-200/80"><div className="h-0.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" /><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-950">{index + 1}. [{item.label}] {item.documentTitle}</p><p className="mt-1 text-[10px] text-slate-400">版本 V{item.version} · {item.section || '正文'} · {item.sourceKind}</p></div><Badge className="bg-slate-950 text-cyan-100">融合 {item.score.toFixed(3)}</Badge></div><p className="mt-3 line-clamp-3 text-xs leading-6 text-slate-600">{item.excerpt}</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{scoreBar('全文相关度', item.lexicalScore, 'bg-cyan-500')}{scoreBar('向量相似度', item.vectorScore, 'bg-indigo-500')}{scoreBar('图谱扩展', item.graphScore, 'bg-violet-500')}</div></CardContent></Card>)}</div> : <Card className="border-dashed"><CardContent className="flex min-h-52 flex-col items-center justify-center text-center"><Database className="h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-500">执行一次检索后展示真实分数与授权来源</p><p className="mt-1 text-xs text-slate-400">页面不生成随机相似度，也不显示原始向量数组。</p></CardContent></Card>}</div>

      <div className="space-y-4"><Card className="border-slate-200/80"><CardContent className="p-5"><div className="flex items-center gap-2"><Route className="h-5 w-5 text-indigo-600" /><h3 className="font-semibold text-slate-950">融合召回权重</h3></div><p className="mt-1 text-xs text-slate-500">用于当前本地可信检索，可通过评测后版本化调整。</p><div className="mt-5 space-y-4">{diagnostics && Object.entries(diagnostics.weights).map(([key, value]) => <div key={key}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-slate-600">{{ lexical: '全文相关度', vector: '向量相似度', graph: '知识图谱扩展', authority: '来源权威度' }[key]}</span><span className="font-semibold text-slate-900">{percent(value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: percent(value) }} /></div></div>)}</div><div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-[10px] leading-5 text-indigo-900">分数只负责召回排序，不直接生成业务结论。白泽仍需完成引用核验，证据不足会拒答。</div></CardContent></Card>

        <Card className="border-slate-200/80"><CardContent className="p-5"><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">最近检索审计</h3><Badge variant="outline">仅元数据</Badge></div><div className="mt-4 space-y-2">{diagnostics?.recent.slice(0, 7).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-medium text-slate-800">{ROUTE_LABEL[item.routeMode] ?? item.routeMode}</p><p className="mt-1 text-[10px] text-slate-400">{item.resultCount} 结果 · 最高 {item.topScore.toFixed(3)}</p></div><div className="text-right"><Badge className={item.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{item.status === 'ANSWERED' ? '已完成' : '已拒答'}</Badge><p className="mt-1 text-[9px] text-slate-400">{item.latencyMs} ms</p></div></div>)}{!diagnostics?.recent.length && <p className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-400">尚无检索审计记录</p>}</div></CardContent></Card></div></div>
  </div>
}
