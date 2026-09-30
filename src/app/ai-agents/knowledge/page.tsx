'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Binary, BookOpen, BrainCircuit, CheckCircle2, Clock3, Database, FileText, GitBranch, Loader2, Network, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Upload, XCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { KnowledgeVectorWorkbench } from '@/components/ai/knowledge-vector-workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { KnowledgeDocumentView, KnowledgeGraphView, KnowledgeOverview, KnowledgeSearchResponse } from '@/lib/ai/knowledge/types'
import { useAuthStore } from '@/stores'

const T = {
  badge: 'AI-5 · 企业知识中枢',
  title: '白泽知藏 · 每一个结论都能回到原始依据',
  subtitle: '制度、运行手册、业务事实与Agent经验在同一权限边界下受治理。白泽只使用已发布知识和可验证引用，证据不足时会明确拒答。',
  ask: '向白泽求证', busy: '白泽正在追溯…', refresh: '刷新知藏',
  searchPlaceholder: '例如：大型活动场地申请需要哪些材料和审批？',
  answer: '白泽可核验答复', refused: '证据不足·已安全拒答',
  citations: '原始引用', route: '检索路由', documents: '知识资产', graph: '知识图谱', pipeline: '摄取流水线', qa: '可信问答',
  ingest: '导入知识', ingestTitle: '发布可追溯知识版本', ingestDesc: '文档会经过分块、特征向量、全文索引和权限固化。相同稳定编号再次导入时自动生成新版本。',
  docTitle: '文档名称', docKey: '稳定文档编号', docDesc: '业务说明', docContent: '正文内容', sourceKind: '知识类型', visibility: '可见范围', sensitivity: '敏感级别', roleGrant: '授权角色',
  chooseFile: '选择 TXT/MD 文件', publish: '建立索引并发布', cancel: '取消',
  emptyDocs: '尚无可读知识文档', emptyGraph: '图谱尚无已审核关系', emptyJobs: '尚无文档摄取任务',
  version: '版本', chunks: '知识块', entities: '实体', relations: '关系', archive: '归档', restore: '恢复发布',
  sourceBacked: '引用已通过权限裁剪与版本核验', vectorNotice: '当前知识向量后端',
  businessBoundary: '业务事实不被文档覆盖', businessBoundaryDesc: '实时数量、状态和业务写入仍从PostgreSQL业务表回读；知识库只负责解释制度、流程和依据。',
}

const STATUS: Record<string, string> = { PUBLISHED: '已发布', PROCESSING: '建索中', DRAFT: '草稿', ARCHIVED: '已归档', FAILED: '失败', COMPLETED: '已完成', INDEXED: '索引已就绪' }
const SOURCE: Record<string, string> = { TEXT: '文本资料', MARKDOWN: '结构化文档', POLICY: '制度规程', RUNBOOK: '运行手册', FAQ: '常见问题', BUSINESS_EVENT: '业务经验' }
const ROLE_OPTIONS = [
  ['student', '学生'], ['teacher', '任课教师'], ['counselor', '辅导员'], ['dept_admin', '院系管理'],
  ['logistics_manager', '后勤负责人'], ['dorm_manager', '宿管负责人'], ['ai_ops_admin', 'AI运维管理员'],
] as const

interface IngestForm { title: string; externalKey: string; description: string; content: string; sourceKind: string; visibility: string; sensitivity: string; role: string }
interface RelationCandidate { id: string; subject: string; predicate: string; object: string; evidence: string; confidence: number; documentTitle: string; status: string }
const INITIAL_FORM: IngestForm = { title: '', externalKey: '', description: '', content: '', sourceKind: 'POLICY', visibility: 'TENANT', sensitivity: 'INTERNAL', role: 'student' }

function metric(value: number | undefined): string { return new Intl.NumberFormat('zh-CN').format(value ?? 0) }
function time(value: string): string { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

function GraphCanvas({ graph }: { graph: KnowledgeGraphView | null }) {
  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? []
    const centerX = 450; const centerY = 250; const innerCount = Math.ceil(nodes.length / 2)
    return new Map(nodes.map((node, index) => { const outer = index >= innerCount; const ringIndex = outer ? index - innerCount : index; const count = outer ? Math.max(1, nodes.length - innerCount) : Math.max(1, innerCount); const radius = outer ? 205 : 125; const angle = (ringIndex / count) * Math.PI * 2 - Math.PI / 2; return [node.id, { ...node, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }] }))
  }, [graph])
  if (!graph || graph.nodes.length === 0) return <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-cyan-900/50 bg-slate-950/60 text-sm text-slate-500">{T.emptyGraph}</div>
  return <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(34,211,238,.16), transparent 48%), radial-gradient(circle at 15% 20%, rgba(139,92,246,.12), transparent 30%), linear-gradient(135deg,#020617,#071b2a)' }}><svg viewBox="0 0 900 500" className="h-[500px] w-full" role="img" aria-label={T.graph}><defs><filter id="knowledgeGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>{graph.edges.map((edge) => { const source = layout.get(edge.source); const target = layout.get(edge.target); if (!source || !target) return null; return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="rgba(34,211,238,.36)" strokeWidth="1.4" strokeDasharray="5 5" /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 5} fill="rgba(165,243,252,.72)" fontSize="9" textAnchor="middle">{edge.label}</text></g> })}{[...layout.values()].map((node, index) => <g key={node.id} transform={`translate(${node.x},${node.y})`} filter="url(#knowledgeGlow)"><circle r={14 + Math.min(node.degree, 6)} fill={index % 3 === 0 ? '#22d3ee' : index % 3 === 1 ? '#a78bfa' : '#34d399'} opacity=".2" /><circle r="7" fill={index % 3 === 0 ? '#67e8f9' : index % 3 === 1 ? '#c4b5fd' : '#6ee7b7'} /><text y="27" fill="#dff8ff" fontSize="10" textAnchor="middle">{node.label.slice(0, 12)}</text></g>)}</svg><div className="absolute left-4 top-4 flex gap-2"><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100">{graph.nodes.length} {T.entities}</Badge><Badge className="border-violet-300/20 bg-violet-300/10 text-violet-100">{graph.edges.length} {T.relations}</Badge></div></div>
}

export default function AiKnowledgePage() {
  const user = useAuthStore((state) => state.user)
  const manager = user?.role === 'super_admin' || user?.role === 'ai_ops_admin'
  const [overview, setOverview] = useState<KnowledgeOverview | null>(null)
  const [documents, setDocuments] = useState<KnowledgeDocumentView[]>([])
  const [graph, setGraph] = useState<KnowledgeGraphView | null>(null)
  const [relationCandidates, setRelationCandidates] = useState<RelationCandidate[]>([])
  const [question, setQuestion] = useState('大型活动场地申请需要哪些材料和审批？')
  const [answer, setAnswer] = useState<KnowledgeSearchResponse | null>(null)
  const [form, setForm] = useState<IngestForm>(INITIAL_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [overviewResponse, documentsResponse, graphResponse] = await Promise.all([
        fetch('/api/ai/knowledge', { cache: 'no-store' }),
        fetch('/api/ai/knowledge?scope=documents', { cache: 'no-store' }),
        fetch('/api/ai/knowledge/graph', { cache: 'no-store' }),
      ])
      const [overviewJson, documentsJson, graphJson] = await Promise.all([overviewResponse.json(), documentsResponse.json(), graphResponse.json()])
      if (!overviewResponse.ok) throw new Error(overviewJson.error ?? '知识中枢加载失败')
      if (!documentsResponse.ok) throw new Error(documentsJson.error ?? '知识文档加载失败')
      setOverview(overviewJson.data); setDocuments(documentsJson.data ?? []); setGraph(graphResponse.ok ? graphJson.data : null)
      if (manager) { const relationResponse = await fetch('/api/ai/knowledge/relations', { cache: 'no-store' }); const relationJson = await relationResponse.json(); setRelationCandidates(relationResponse.ok ? relationJson.data ?? [] : []) } else { setRelationCandidates([]) }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '知识中枢加载失败') }
    finally { setLoading(false) }
  }, [manager])
  useEffect(() => { void load() }, [load])

  async function ask() {
    const value = question.trim(); if (!value) return
    setAsking(true); setError(null)
    try {
      const response = await fetch('/api/ai/knowledge/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: value }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '白泽检索失败')
      setAnswer(json.data); void load()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '白泽检索失败') }
    finally { setAsking(false) }
  }

  async function ingest() {
    setSaving(true); setError(null)
    try {
      const grants = form.visibility === 'ROLE' ? [{ principalType: 'ROLE', principalId: form.role }] : undefined
      const response = await fetch('/api/ai/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, externalKey: form.externalKey || undefined, grants }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '知识导入失败')
      setDialogOpen(false); setForm(INITIAL_FORM); await load()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '知识导入失败') }
    finally { setSaving(false) }
  }

  async function changeStatus(document: KnowledgeDocumentView) {
    const action = document.status === 'ARCHIVED' ? 'restore' : 'archive'
    const response = await fetch(`/api/ai/knowledge/${document.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
    const json = await response.json()
    if (!response.ok) { setError(json.error ?? '文档状态更新失败'); return }
    await load()
  }

  async function extractGraph(documentId: string) {
    setSaving(true); setError(null)
    try {
      const response = await fetch('/api/ai/knowledge/relations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'extract', documentId }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '\u56fe\u8c31\u5019\u9009\u63d0\u53d6\u5931\u8d25')
      await load()
    } catch (extractError) { setError(extractError instanceof Error ? extractError.message : '\u56fe\u8c31\u5019\u9009\u63d0\u53d6\u5931\u8d25') }
    finally { setSaving(false) }
  }

  async function reviewRelation(relationId: string, decision: 'approve' | 'reject') {
    setSaving(true); setError(null)
    try {
      const response = await fetch('/api/ai/knowledge/relations', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ relationId, decision }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '\u56fe\u8c31\u5ba1\u6838\u5931\u8d25')
      await load()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : '\u56fe\u8c31\u5ba1\u6838\u5931\u8d25') }
    finally { setSaving(false) }
  }

  const metrics = overview?.metrics
  return <MainLayout><div className="space-y-6 pb-10">
    <section className="relative overflow-hidden rounded-[30px] border border-cyan-500/20 bg-slate-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(2,12,27,.4)] md:px-9" style={{ backgroundImage: 'radial-gradient(circle at 82% 18%, rgba(34,211,238,.24), transparent 27%), radial-gradient(circle at 8% 90%, rgba(139,92,246,.22), transparent 30%), linear-gradient(135deg,#020617,#082332 55%,#11132a)' }}><div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(103,232,249,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,.08)_1px,transparent_1px)] [background-size:34px_34px]" /><div className="relative flex flex-wrap items-center justify-between gap-8"><div className="max-w-3xl"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><BookOpen className="mr-1.5 h-3.5 w-3.5" />{T.badge}</Badge><h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{T.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{T.subtitle}</p><div className="mt-6 flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/5 text-slate-200">{overview?.persistence === 'postgres' ? 'PostgreSQL' : '未就绪'}</Badge><Badge className="border-white/10 bg-white/5 text-slate-200">{'PostgreSQL 本地向量检索'}</Badge><Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><ShieldCheck className="mr-1 h-3 w-3" />RLS · ACL · Hash Lineage</Badge></div></div><div className="flex items-center gap-6"><div className="hidden grid-cols-2 gap-2 lg:grid"><div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><p className="text-2xl font-semibold text-cyan-100">{metric(metrics?.publishedDocuments)}</p><p className="mt-1 text-[11px] text-slate-400">{T.documents}</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><p className="text-2xl font-semibold text-violet-100">{metric(metrics?.chunks)}</p><p className="mt-1 text-[11px] text-slate-400">{T.chunks}</p></div></div><BaizeAvatar mood={asking || saving ? 'busy' : 'calm'} size={180} showThreads threadCount={3} /></div></div></section>

    {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><XCircle className="mt-0.5 h-4 w-4" />{error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      [Database, T.documents, metrics?.publishedDocuments, '已通过版本治理'], [FileText, T.chunks, metrics?.chunks, '全文+特征向量'], [Network, T.relations, metrics?.publishedRelations, '已审核图谱边'], [CheckCircle2, '今日有引用答复', metrics?.answeredToday, `${Math.round((metrics?.citationRateToday ?? 0) * 100)}% 引用覆盖`],
    ].map(([Icon, label, value, note]) => { const MetricIcon = Icon as typeof Database; return <Card key={String(label)} className="overflow-hidden border-slate-200"><CardContent className="flex items-center gap-4 p-5"><span className="rounded-2xl bg-slate-950 p-3 text-cyan-200"><MetricIcon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold text-slate-950">{metric(value as number)}</p><p className="text-sm font-medium text-slate-700">{String(label)}</p><p className="mt-1 text-[11px] text-slate-400">{String(note)}</p></div></CardContent></Card> })}</div>

    <Tabs defaultValue="qa" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-auto flex-wrap rounded-xl bg-slate-100 p-1"><TabsTrigger value="qa"><BrainCircuit className="mr-1.5 h-4 w-4" />{T.qa}</TabsTrigger><TabsTrigger value="vector"><Binary className="mr-1.5 h-4 w-4" />向量检索</TabsTrigger><TabsTrigger value="documents"><FileText className="mr-1.5 h-4 w-4" />{T.documents}</TabsTrigger><TabsTrigger value="graph"><GitBranch className="mr-1.5 h-4 w-4" />{T.graph}</TabsTrigger><TabsTrigger value="pipeline"><Clock3 className="mr-1.5 h-4 w-4" />{T.pipeline}</TabsTrigger></TabsList><div className="flex gap-2">{manager && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button><Upload className="mr-1.5 h-4 w-4" />{T.ingest}</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{T.ingestTitle}</DialogTitle><DialogDescription>{T.ingestDesc}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="font-medium">{T.docTitle}</span><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="space-y-1.5 text-sm"><span className="font-medium">{T.docKey}</span><Input value={form.externalKey} onChange={(event) => setForm({ ...form, externalKey: event.target.value })} placeholder="policy-event-venue" /></label><label className="space-y-1.5 text-sm"><span className="font-medium">{T.sourceKind}</span><Select value={form.sourceKind} onValueChange={(value) => setForm({ ...form, sourceKind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SOURCE).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-sm"><span className="font-medium">{T.sensitivity}</span><Select value={form.sensitivity} onValueChange={(value) => setForm({ ...form, sensitivity: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUBLIC">公开</SelectItem><SelectItem value="INTERNAL">校内</SelectItem><SelectItem value="RESTRICTED">受限</SelectItem><SelectItem value="CONFIDENTIAL">机密</SelectItem></SelectContent></Select></label><label className="space-y-1.5 text-sm"><span className="font-medium">{T.visibility}</span><Select value={form.visibility} onValueChange={(value) => setForm({ ...form, visibility: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TENANT">全校可读</SelectItem><SelectItem value="ROLE">指定角色</SelectItem><SelectItem value="PRIVATE">仅管理员</SelectItem></SelectContent></Select></label>{form.visibility === 'ROLE' && <label className="space-y-1.5 text-sm"><span className="font-medium">{T.roleGrant}</span><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>}<label className="space-y-1.5 text-sm sm:col-span-2"><span className="font-medium">{T.docDesc}</span><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="space-y-2 text-sm sm:col-span-2"><span className="font-medium">{T.docContent}</span><Textarea className="min-h-52" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /><span className="flex items-center justify-between text-xs text-slate-400"><label className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-slate-50"><Upload className="mr-1 inline h-3.5 w-3.5" />{T.chooseFile}<input className="hidden" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const content = await file.text(); setForm((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ''), content, sourceKind: file.name.endsWith('.md') ? 'MARKDOWN' : current.sourceKind })) }} /></label><span>{form.content.length.toLocaleString('zh-CN')} 字</span></span></label></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{T.cancel}</Button><Button onClick={() => void ingest()} disabled={saving || !form.title.trim() || form.content.trim().length < 40}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{T.publish}</Button></DialogFooter></DialogContent></Dialog>}<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{T.refresh}</Button></div></div>

      <TabsContent value="qa" className="space-y-4"><Card className="border-cyan-100 shadow-sm"><CardContent className="p-5"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-12 pl-10" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask() }} placeholder={T.searchPlaceholder} /></div><Button className="h-12 bg-slate-950 px-6 text-cyan-100 hover:bg-slate-900" onClick={() => void ask()} disabled={asking || !question.trim()}>{asking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{asking ? T.busy : T.ask}</Button></div><p className="mt-3 text-xs text-slate-500">意图识别 → 租户与角色裁剪 → 全文/向量并行召回 → 图谱扩展 → 引用核验</p></CardContent></Card>{answer && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]"><Card className={answer.status === 'ANSWERED' ? 'border-emerald-200' : 'border-amber-200'}><CardHeader><CardTitle className="flex flex-wrap items-center gap-3 text-base"><BaizeAvatar mood={answer.status === 'ANSWERED' ? 'success' : 'alert'} size={52} />{answer.status === 'ANSWERED' ? T.answer : T.refused}<Badge variant="outline">{Math.round(answer.confidence * 100)}% 可信度</Badge>{answer.retrieval.model && <Badge className="border-violet-200 bg-violet-50 text-violet-700">DeepSeek {'\u5b9e\u65f6\u5f52\u6574'} ? {answer.retrieval.model.latencyMs}ms ? {answer.retrieval.model.totalTokens} Token</Badge>}</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-8 text-slate-700">{answer.answer}</p><div className="mt-5 flex flex-wrap gap-2">{answer.route.stages.map((stage, index) => <span key={stage} className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">{index + 1}. {stage}</span>)}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">{T.citations}</CardTitle></CardHeader><CardContent className="space-y-3">{answer.citations.length === 0 ? <p className="text-sm text-slate-400">{T.refused}</p> : answer.citations.map((citation) => <div key={citation.chunkId} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-900">[{citation.label}] {citation.documentTitle}</p><Badge className="bg-emerald-100 text-emerald-700">{'\u6df7\u5408\u53ec\u56de'}</Badge></div><p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">{citation.excerpt}</p><p className="mt-2 text-[11px] text-slate-400">v{citation.version} · {citation.section || '正文'} · {T.sourceBacked}</p></div>)}</CardContent></Card></div>}<Card className="border-indigo-100 bg-indigo-50/50"><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" /><div><p className="font-medium text-indigo-950">{T.businessBoundary}</p><p className="mt-1 text-xs leading-6 text-indigo-800/75">{T.businessBoundaryDesc}</p></div></CardContent></Card></TabsContent>

      <TabsContent value="vector"><KnowledgeVectorWorkbench /></TabsContent>

      <TabsContent value="documents"><div className="grid gap-4 lg:grid-cols-2">{documents.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed p-12 text-center text-sm text-slate-400">{T.emptyDocs}</div> : documents.map((document) => <Card key={document.id} className="overflow-hidden"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-base">{document.title}</CardTitle><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{document.description || SOURCE[document.sourceKind]}</p></div><Badge className={document.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : document.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}>{STATUS[document.status] ?? document.status}</Badge></div></CardHeader><CardContent><div className="grid grid-cols-4 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><p className="font-semibold">v{document.currentVersion}</p><p className="text-[10px] text-slate-400">{T.version}</p></div><div className="rounded-xl bg-cyan-50 p-2"><p className="font-semibold text-cyan-800">{document.chunkCount}</p><p className="text-[10px] text-cyan-600">{T.chunks}</p></div><div className="rounded-xl bg-violet-50 p-2"><p className="font-semibold text-violet-800">{document.entityCount}</p><p className="text-[10px] text-violet-600">{T.entities}</p></div><div className="rounded-xl bg-emerald-50 p-2"><p className="font-semibold text-emerald-800">{document.relationCount}</p><p className="text-[10px] text-emerald-600">{T.relations}</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{SOURCE[document.sourceKind]} · {document.visibility} · {document.sensitivity}</span><span>{time(document.updatedAt)}</span></div>{manager && <div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={saving || document.status !== 'PUBLISHED'} onClick={() => void extractGraph(document.id)}><Network className="mr-1.5 h-3.5 w-3.5" />{'\u63d0\u53d6\u56fe\u8c31\u5019\u9009'}</Button><Button size="sm" variant="outline" onClick={() => void changeStatus(document)}>{document.status === 'ARCHIVED' ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}{document.status === 'ARCHIVED' ? T.restore : T.archive}</Button></div>}</CardContent></Card>)}</div></TabsContent>

      <TabsContent value="graph"><GraphCanvas graph={graph} /><div className="mt-4 grid gap-3 md:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm font-medium">候选—审核—发布</p><p className="mt-1 text-xs leading-5 text-slate-500">模型只能提交图谱候选，不能直接修改正式知识关系。</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm font-medium">关系必须有原文证据</p><p className="mt-1 text-xs leading-5 text-slate-500">每条边都保留来源知识块、文档版本与证据引文。</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm font-medium">当前待审核 {graph?.candidateRelations ?? metrics?.candidateRelations ?? 0}</p><p className="mt-1 text-xs leading-5 text-slate-500">只有已审核关系会参与 GraphRAG 扩展。</p></CardContent></Card></div>{manager && <Card className="mt-4"><CardHeader><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-600" />{'\u56fe\u8c31\u4eba\u5de5\u5ba1\u6838\u961f\u5217'}</span><Badge variant="outline">{relationCandidates.length} {'\u6761\u5f85\u88c1\u51b3'}</Badge></CardTitle></CardHeader><CardContent className="space-y-3">{relationCandidates.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">{'\u5f53\u524d\u6ca1\u6709\u5f85\u5ba1\u6838\u5173\u7cfb'}</div> : relationCandidates.map((relation) => <div key={relation.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-cyan-100 text-cyan-800">{relation.subject}</Badge><span className="text-xs font-medium text-violet-700">{relation.predicate}</span><Badge className="bg-emerald-100 text-emerald-800">{relation.object}</Badge><span className="ml-auto text-xs text-slate-400">{Math.round(relation.confidence * 100)}%</span></div><p className="mt-3 text-xs leading-6 text-slate-600">?{relation.evidence}?</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-slate-400">{relation.documentTitle}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={() => void reviewRelation(relation.id, 'reject')}><XCircle className="mr-1 h-3.5 w-3.5" />{'\u9a73\u56de'}</Button><Button size="sm" disabled={saving} onClick={() => void reviewRelation(relation.id, 'approve')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{'\u53d1\u5e03\u5173\u7cfb'}</Button></div></div></div>)}</CardContent></Card>}</TabsContent>

      <TabsContent value="pipeline"><div className="space-y-3">{overview?.recentJobs.length ? overview.recentJobs.map((job, index) => <Card key={job.id}><CardContent className="flex flex-wrap items-center gap-4 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-cyan-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-900">{job.title}</p><p className="mt-1 text-xs text-slate-500">{STATUS[job.stage] ?? job.stage} · {job.chunksCreated} {T.chunks} · {job.relationCandidates} 候选关系</p></div><div className="text-right"><Badge className={job.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{STATUS[job.status] ?? job.status}</Badge><p className="mt-1 text-[11px] text-slate-400">{time(job.createdAt)}</p></div></CardContent></Card>) : <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-slate-400">{T.emptyJobs}</div>}</div><Card className="mt-4 border-cyan-100 bg-cyan-50/40"><CardContent className="flex items-start gap-3 p-4"><BrainCircuit className="mt-0.5 h-5 w-5 text-cyan-700" /><div><p className="font-medium text-cyan-950">{T.vectorNotice}: {'PostgreSQL 本地向量检索'}</p><p className="mt-1 text-xs leading-6 text-cyan-800/75">{overview?.vector.note}</p></div></CardContent></Card></TabsContent>
    </Tabs>
  </div></MainLayout>
}
