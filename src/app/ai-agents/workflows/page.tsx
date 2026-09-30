'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, Bot, Box, CheckCircle2, CircleDot, Clock3, Database, Expand,
  GitBranch, GitMerge, Loader2, LockKeyhole, Network, Play, Plus, RefreshCw, Save,
  ShieldCheck, Sparkles, Trash2, TriangleAlert, Workflow, Zap,
} from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import WorkflowCanvas, { type WorkflowConnection, type WorkflowEdge, type WorkflowNode, type WorkflowNodeData } from '@/components/ai/workflow-canvas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowDefinition, WorkflowNodeKind, WorkflowOverview, WorkflowRunView, WorkflowView } from '@/lib/ai/platform/types'

const KIND_LABEL: Record<WorkflowNodeKind, string> = { trigger: '事件触发', knowledge: '知识校验', agent: 'Agent 分灵', skill: '受控 Skill', approval: '人工裁决', aggregate: '白泽归整' }
const STATUS_STYLE: Record<string, string> = { PUBLISHED: 'bg-emerald-100 text-emerald-700', DRAFT: 'bg-amber-100 text-amber-700', ARCHIVED: 'bg-slate-100 text-slate-600', COMPLETED: 'bg-emerald-100 text-emerald-700', AWAITING_APPROVAL: 'bg-amber-100 text-amber-700', RUNNING: 'bg-cyan-100 text-cyan-700', FAILED: 'bg-rose-100 text-rose-700' }

const PALETTE: Array<{ kind: WorkflowNodeKind; label: string; description: string; skillId?: string; agentLabel?: string; icon: typeof Bot }> = [
  { kind: 'trigger', label: '业务事件进入', description: '接收人工、定时或业务事件', icon: Zap },
  { kind: 'knowledge', label: '獬豸校验规则', description: '检索权限内知识和政策证据', icon: Database },
  { kind: 'agent', label: '玄龟执行派单', description: '绑定真实报修派单 Skill', skillId: 'repair_dispatch', agentLabel: '玄龟·后勤调度分灵', icon: Bot },
  { kind: 'skill', label: '灵鹊发布通知', description: '绑定真实消息触达 Skill', skillId: 'notification_publish', agentLabel: '灵鹊·消息触达分灵', icon: Box },
  { kind: 'approval', label: '主管人工裁决', description: '批准前不触碰真实业务数据', icon: ShieldCheck },
  { kind: 'aggregate', label: '白泽归整汇报', description: '核验写回证据并汇报成果', icon: GitMerge },
]

function toCanvas(definition: WorkflowDefinition): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    nodes: definition.nodes.map((node) => ({ id: node.id, type: node.kind, position: node.position, data: { label: node.label, description: node.description, kind: node.kind, skillId: node.skillId, agentLabel: node.agentLabel, params: node.params } })),
    edges: definition.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label, animated: true })),
  }
}

function fromCanvas(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowDefinition {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: (node.data.kind ?? node.type ?? 'agent') as WorkflowNodeKind,
      label: node.data.label,
      ...(node.data.description ? { description: node.data.description } : {}),
      ...(node.data.skillId ? { skillId: node.data.skillId } : {}),
      ...(node.data.agentLabel ? { agentLabel: node.data.agentLabel } : {}),
      ...(node.data.params ? { params: node.data.params } : {}),
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    })),
    edges: edges.filter((edge) => edge.source && edge.target).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, ...(typeof edge.label === 'string' && edge.label ? { label: edge.label } : {}) })),
  }
}

export default function WorkflowComposerPage() {
  const [overview, setOverview] = useState<WorkflowOverview | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<WorkflowEdge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const [activeRun, setActiveRun] = useState<WorkflowRunView | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [draftName, setDraftName] = useState('跨部门业务协同编排')
  const [draftDescription, setDraftDescription] = useState('由白泽调度知识、Agent、Skill 和人工裁决形成的可审计业务闭环。')
  const canvasRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => overview?.workflows.find((item) => item.id === selectedId) ?? null, [overview, selectedId])
  const runs = overview?.recentRuns ?? []

  const load = useCallback(async (keepSelection = true) => {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/ai/workflows', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '工作流中枢加载失败')
      const data = json.data as WorkflowOverview
      setOverview(data)
      const id = keepSelection && selectedId && data.workflows.some((item) => item.id === selectedId) ? selectedId : data.workflows[0]?.id ?? ''
      setSelectedId(id)
      const workflow = data.workflows.find((item) => item.id === id)
      if (workflow?.version) { const canvas = toCanvas(workflow.version.definition); setNodes(canvas.nodes); setEdges(canvas.edges) }
      if (!activeRun && data.recentRuns[0]) setActiveRun(data.recentRuns[0])
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '工作流中枢加载失败') } finally { setLoading(false) }
  }, [activeRun, selectedId])

  useEffect(() => { void load(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectWorkflow(workflow: WorkflowView) {
    setSelectedId(workflow.id); setSelectedNodeId(''); setError(null); setNotice(null)
    if (workflow.version) { const canvas = toCanvas(workflow.version.definition); setNodes(canvas.nodes); setEdges(canvas.edges) }
    setActiveRun(runs.find((run) => run.workflowId === workflow.id) ?? null)
  }

  function addPaletteNode(item: (typeof PALETTE)[number]) {
    const id = `${item.kind}-${Date.now().toString(36)}`
    const data: WorkflowNodeData = { label: item.label, description: item.description, kind: item.kind, skillId: item.skillId, agentLabel: item.agentLabel }
    setNodes((current) => [...current, { id, type: item.kind, position: { x: 160 + (current.length % 4) * 280, y: 120 + Math.floor(current.length / 4) * 190 }, data }])
    setSelectedNodeId(id); setNotice('节点已加入画布，请拖动定位并连接光路。')
  }

  function connect(connection: WorkflowConnection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    setEdges((current) => [...current, { id: `edge-${connection.source}-${connection.target}-${Date.now().toString(36)}`, source: connection.source!, target: connection.target!, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle, animated: true }])
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId))
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId))
    setSelectedNodeId('')
  }

  async function saveDraft() {
    setWorking('save'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', name: draftName, description: draftDescription, triggerKind: 'MANUAL', tags: ['可视化编排', '白泽调度'], definition: fromCanvas(nodes, edges) }) })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '保存工作流失败')
      setSaveOpen(false); setNotice('新版本已持久化为草稿，可继续检查后发布。'); await load(false); setSelectedId(json.data.id)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '保存工作流失败') } finally { setWorking('') }
  }

  async function publish() {
    if (!selected) return
    setWorking('publish'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/workflows', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'publish', workflowId: selected.id }) })
      const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.error ?? '发布失败')
      setNotice('工作流已发布；运行时将固定使用当前不可变版本。'); await load()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '发布失败') } finally { setWorking('') }
  }

  async function run() {
    if (!selected) return
    setWorking('run'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run', workflowId: selected.id, command: `白泽，请按受治理编排执行：${selected.name}` }) })
      const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.error ?? '工作流运行失败')
      setActiveRun(json.data.run); setNotice(json.data.run.status === 'AWAITING_APPROVAL' ? '真实执行预览已生成，现处于人工裁决门前。' : '工作流已进入持久化运行链。'); await load()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '工作流运行失败') } finally { setWorking('') }
  }

  const graphQuality = useMemo(() => {
    const executable = nodes.filter((node) => node.data.skillId).length
    return { executable, gates: nodes.filter((node) => node.data.kind === 'approval').length, complete: nodes.length >= 3 && edges.length >= 2 && executable > 0 }
  }, [edges.length, nodes])

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1880px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_18%_88%,rgba(168,85,247,0.18),transparent_30%),linear-gradient(132deg,#030712,#07182b_54%,#121026)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(2,6,23,0.28)] md:px-9" style={{ background: 'radial-gradient(circle at 78% 18%, rgba(34,211,238,.18), transparent 31%), linear-gradient(135deg,#07111f,#0b1f35 58%,#17152f)' }}>
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(103,232,249,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.07)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="relative grid items-center gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div><div className="flex flex-wrap gap-2"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><Workflow className="mr-1 h-3 w-3" />白泽天工 · Visual Orchestration</Badge><Badge className="border border-emerald-200/20 bg-emerald-200/10 text-emerald-100"><CircleDot className="mr-1 h-3 w-3" />持久化运行引擎在线</Badge></div><p className="mt-5 text-xs font-medium tracking-[0.26em] text-cyan-200/60">ENTERPRISE WORKFLOW CONTROL PLANE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-[40px]">把业务意图画成可审批、可执行、可回读的 Agent 光路</h1><p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">画布不是流程图摆设。每个执行节点必须绑定受治理 Skill；发布后版本不可变；运行会创建正式 Agent 任务、交接消息、人工裁决和业务回读证据。白泽只编排被允许的能力，不执行任意代码。</p><div className="mt-5 flex flex-wrap gap-2 text-[11px] text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">租户隔离</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">DAG 循环检测</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">版本指纹</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">人工裁决门</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">正式任务关联</span></div></div>
            <div className="relative mx-auto"><div className="absolute inset-4 rounded-full bg-cyan-300/10 blur-3xl" /><BaizeAvatar mood={working === 'run' ? 'busy' : activeRun?.status === 'COMPLETED' ? 'success' : 'calm'} size={200} showThreads threadCount={Math.max(2, graphQuality.executable)} /></div>
          </div>
        </section>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{([
          { label: '已治理工作流', value: overview?.metrics.workflows ?? 0, icon: GitBranch, note: '草稿与发布版本' }, { label: '已发布', value: overview?.metrics.published ?? 0, icon: ShieldCheck, note: '不可变运行版本' }, { label: '运行批次', value: overview?.metrics.runs ?? 0, icon: Activity, note: '当前租户真实记录' }, { label: '等待裁决', value: overview?.metrics.awaitingApproval ?? 0, icon: Clock3, note: '未授权不写业务' }, { label: '已完成', value: overview?.metrics.completed ?? 0, icon: CheckCircle2, note: '已归整运行批次' },
        ] as Array<{ label: string; value: number; icon: typeof GitBranch; note: string }>).map(({ label, value, icon: Icon, note }) => <Card key={label} className="border-slate-200/80"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><Icon className="h-4 w-4 text-cyan-600" /></div><p className="mt-2 text-3xl font-semibold text-slate-950">{loading ? '?' : value}</p><p className="mt-1 text-[10px] text-slate-400">{note}</p></CardContent></Card>)}</section>

        <section className="grid min-h-[760px] gap-4 2xl:grid-cols-[280px_minmax(720px,1fr)_360px]">
          <Card className="overflow-hidden border-slate-200/80 bg-white/95"><div className="border-b px-4 py-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-slate-950">编排资产</p><p className="mt-1 text-[10px] text-slate-400">正式数据 · 非页面常量</p></div><Button size="icon" variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></div></div><CardContent className="space-y-4 p-3"><div className="space-y-2">{overview?.workflows.map((workflow) => <button key={workflow.id} onClick={() => selectWorkflow(workflow)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === workflow.id ? 'border-cyan-300 bg-cyan-50/70 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-5 text-slate-900">{workflow.name}</p><Badge className={STATUS_STYLE[workflow.status]}>{workflow.status === 'PUBLISHED' ? '已发布' : workflow.status === 'DRAFT' ? '草稿' : '已归档'}</Badge></div><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-slate-500">{workflow.description}</p><div className="mt-2 flex items-center justify-between text-[9px] text-slate-400"><span>版本 V{workflow.currentVersion}</span><span>{workflow.version?.definition.nodes.length ?? 0} 节点</span></div></button>)}{loading && !overview && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-cyan-600" /></div>}</div><div className="border-t pt-4"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">NODE PALETTE</p><span className="text-[9px] text-slate-400">点击加入</span></div><div className="grid grid-cols-2 gap-2">{PALETTE.map((item) => { const Icon = item.icon; return <button key={item.kind + item.label} onClick={() => addPaletteNode(item)} className="rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-cyan-200 hover:bg-cyan-50"><Icon className="h-4 w-4 text-cyan-600" /><p className="mt-2 text-[10px] font-medium text-slate-700">{KIND_LABEL[item.kind]}</p></button> })}</div></div></CardContent></Card>

          <div ref={canvasRef} className="space-y-3 rounded-2xl bg-[#050b16] p-3 shadow-2xl"><div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1 text-white"><div><div className="flex items-center gap-2"><Network className="h-4 w-4 text-cyan-300" /><p className="font-semibold">{selected?.name ?? '新编排画布'}</p><Badge className="border border-white/10 bg-white/5 text-slate-300">V{selected?.currentVersion ?? 0}</Badge></div><p className="mt-1 text-[10px] text-slate-500">拖动节点 · 从右侧端点连接光路 · 选中节点可删除</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={deleteSelectedNode} disabled={!selectedNodeId}><Trash2 className="mr-1 h-3.5 w-3.5" />删除节点</Button><Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => canvasRef.current?.requestFullscreen()}><Expand className="mr-1 h-3.5 w-3.5" />全屏</Button></div></div><WorkflowCanvas nodes={nodes} edges={edges} onNodesChange={setNodes} onEdgesChange={setEdges} onConnect={connect} onNodeClick={(_, node) => setSelectedNodeId(node.id)} isRunning={working === 'run'} runStep={activeRun?.events.length ?? 0} /><div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 text-white"><div className="flex flex-wrap gap-2 text-[10px]"><span className={`rounded-full border px-2.5 py-1 ${graphQuality.complete ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{graphQuality.complete ? '图结构可保存' : '至少 3 节点 / 2 连线 / 1 Skill'}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">{graphQuality.executable} 个执行节点</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">{graphQuality.gates} 道裁决门</span></div><div className="flex flex-wrap gap-2">{overview?.manager && <Button size="sm" variant="outline" className="border-cyan-200/20 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200/20" onClick={() => setSaveOpen(true)} disabled={!graphQuality.complete}><Save className="mr-1 h-3.5 w-3.5" />另存草稿</Button>}{overview?.manager && selected?.status === 'DRAFT' && <Button size="sm" onClick={() => void publish()} disabled={Boolean(working)}>{working === 'publish' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <LockKeyhole className="mr-1 h-3.5 w-3.5" />}发布版本</Button>}<Button size="sm" onClick={() => void run()} disabled={!selected || selected.status !== 'PUBLISHED' || Boolean(working)}>{working === 'run' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}运行正式编排</Button></div></div></div>

          <Card className="overflow-hidden border-slate-200/80"><div className="border-b bg-slate-950 px-4 py-4 text-white"><div className="flex items-center justify-between"><div><p className="font-semibold">白泽运行交接台</p><p className="mt-1 text-[10px] text-slate-400">持久化事件 · 可关联正式任务</p></div>{activeRun && <Badge className={STATUS_STYLE[activeRun.status] ?? 'bg-slate-100 text-slate-700'}>{activeRun.status === 'AWAITING_APPROVAL' ? '等待裁决' : activeRun.status}</Badge>}</div></div><CardContent className="p-4"><div className="space-y-3">{activeRun?.events.map((event, index) => <div key={event.id} className="relative pl-7"><span className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[9px] ${index === activeRun.events.length - 1 ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-500'}`}>{event.seq}</span>{index < activeRun.events.length - 1 && <span className="absolute bottom-[-14px] left-[9px] top-5 w-px bg-slate-200" />}<div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-900">{event.title}</p><span className="text-[9px] text-slate-400">{new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div><p className="mt-1 text-[10px] leading-5 text-slate-600">{event.message}</p></div></div>)}{!activeRun && <div className="rounded-xl border border-dashed p-8 text-center"><Sparkles className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs text-slate-400">运行一次已发布编排后，这里会出现真实交接记录。</p></div>}</div>{activeRun?.taskId && <Button asChild className="mt-4 w-full"><Link href={`/ai-agents/runtime?task=${activeRun.taskId}`}><Expand className="mr-2 h-4 w-4" />进入全屏 Agent 星图<ArrowRight className="ml-auto h-4 w-4" /></Link></Button>}<div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" /><div><p className="text-xs font-semibold text-cyan-950">执行证明</p><p className="mt-1 text-[10px] leading-5 text-cyan-900/75">画布只保存受限结构；运行输入仅在工作流账本保留指纹。真实写入仍由既有 Skill Gateway、审批、幂等和回读机制接管。</p></div></div></div></CardContent></Card>
        </section>

        <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-cyan-600" />保存受治理工作流草稿</DialogTitle></DialogHeader><div className="space-y-4"><div><label className="mb-1.5 block text-xs font-medium text-slate-600">工作流名称</label><Input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></div><div><label className="mb-1.5 block text-xs font-medium text-slate-600">解决的业务问题</label><Textarea rows={4} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} /></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-semibold text-slate-900">{nodes.length}</p><p className="text-slate-400">节点</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-semibold text-slate-900">{edges.length}</p><p className="text-slate-400">光路</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-semibold text-slate-900">{graphQuality.executable}</p><p className="text-slate-400">真实 Skill</p></div></div><Button className="w-full" onClick={() => void saveDraft()} disabled={!draftName.trim() || !graphQuality.complete || Boolean(working)}>{working === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}持久化为新草稿</Button></div></DialogContent></Dialog>
      </div>
    </MainLayout>
  )
}
