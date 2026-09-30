'use client'



import Link from 'next/link'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Activity, ArrowLeft, CheckCircle2, Clock3, Expand, Loader2, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, UserCheck, XCircle } from 'lucide-react'

import { MainLayout } from '@/components/layout'

import { BaizeAvatar, type BaizeMood } from '@/components/ai/baize-avatar'

import { Badge } from '@/components/ui/badge'

import { Button } from '@/components/ui/button'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { AiProductNode, AiProductTask } from '@/lib/ai/product-types'

import { approvalLabel, messageTypeLabel, taskStateLabel } from '@/lib/ai/presentation'



const DEFAULT_POSITIONS = [

  { left: 17, top: 18, x: 170, y: 112 },

  { left: 83, top: 18, x: 830, y: 112 },

  { left: 90, top: 53, x: 900, y: 328 },

  { left: 76, top: 84, x: 760, y: 520 },

  { left: 24, top: 84, x: 240, y: 520 },

  { left: 10, top: 53, x: 100, y: 328 },

  { left: 50, top: 9, x: 500, y: 56 },

  { left: 50, top: 91, x: 500, y: 564 },

]

const THREE_SPIRIT_POSITIONS = [

  { left: 16, top: 26, x: 160, y: 162 },

  { left: 84, top: 26, x: 840, y: 162 },

  { left: 84, top: 74, x: 840, y: 459 },

]

function missionPosition(index: number, total: number) {

  return (total === 3 ? THREE_SPIRIT_POSITIONS : DEFAULT_POSITIONS)[index]

}

const PHASES = ['接令', '分辨意图', '拆解与分发', '真实执行预览', '人工裁决', '分灵体执行', '成果归整', '回读汇报']



function messagePhase(message: AiProductTask['messages'][number] | undefined, cursor: number, total: number): number {

  if (!message) return 0

  if (message.content.includes('下达指令')) return 0

  if (message.content.includes('指令已收')) return 1

  if (message.type === 'approval_request') return 4

  if (message.type === 'approval_decision') return message.content.includes('第一位') ? 4 : 5

  if (message.type === 'result' && message.content.includes('\u5408\u89c4\u8bc1\u636e')) return 5

  if (message.type === 'result') return 6

  if (message.type === 'error') return 7

  if (message.type === 'handover') return message.content.includes('拟将') ? 2 : 5

  if (message.content.includes('执行预览')) return 3

  if (message.content.includes('\u736c\u8c78\u5148\u884c') || message.content.includes('\u8fb9\u754c\u5df2\u9501\u5b9a')) return 5

  if (message.content.includes('令已下')) return 5

  if (message.content.includes('诸事归拢') || cursor === total - 1 && message.content.includes('回读')) return 7

  if (message.content.includes('拆成') || message.content.includes('辨明')) return 2

  return 1

}



function moodFor(task: AiProductTask | null, phase: number, deciding: boolean): BaizeMood {

  if (deciding || phase === 5 || task?.status === 'running') return 'busy'

  if (task?.status === 'failed' || task?.status === 'cancelled') return 'alert'

  if (task?.status === 'verified' && phase >= 7) return 'success'

  if (task?.status === 'awaiting_approval') return 'calm'

  return 'focus'

}



function nodeReplayState(task: AiProductTask, node: AiProductNode, cursor: number): string {

  const messages = task.messages.slice(0, cursor + 1)

  const related = messages.filter((message) => message.agentId === node.agent.id || message.content.includes(node.agent.name) || message.content.includes(node.title))

  const result = related.some((message) => message.type === 'result')

  const failed = related.some((message) => message.type === 'error')

  const started = related.some((message) => message.type === 'handover' && !message.content.includes('拟将'))

  if (failed) return 'FAILED'

  if (result) return 'COMPLETED'

  if (started) return 'RUNNING'

  if (cursor >= task.messages.length - 1) return node.state

  return 'PENDING'

}



function nodePhrase(state: string, skillId: string): string {

  if (skillId === 'repair_policy_guard' && state === 'RUNNING') return '\u6b63\u5728\u6838\u9a8c\u79df\u6237\u3001\u72b6\u6001\u4e0e\u5ba1\u6279\u8fb9\u754c'

  if (skillId === 'repair_policy_guard' && state === 'COMPLETED') return '\u5408\u89c4\u8bc1\u636e\u5df2\u5c01\u5b58\uff0c\u4e1a\u52a1\u5199\u5165\u4e3a\u96f6'

  if (state === 'RUNNING') return '\u5df2\u63a5\u4ee4\uff0c\u6b63\u5728\u529e\u7406\u771f\u5b9e\u4e1a\u52a1'

  if (state === 'COMPLETED') return '\u6210\u679c\u5df2\u6cbf\u5149\u8def\u56de\u4f20\u767d\u6cfd'

  if (state === 'FAILED' || state === 'BLOCKED') return '\u5f02\u5e38\u5df2\u4e0a\u62a5\uff0c\u7b49\u5f85\u4eba\u5de5\u5904\u7f6e'

  if (state === 'CANCELLED') return '\u5149\u8def\u5df2\u5b89\u5168\u6536\u56de'

  return '\u9759\u5019\u767d\u6cfd\u5206\u4ee4'

}


function taskLabel(task: AiProductTask): string {

  const command = task.command.replace(/^\u767d\u6cfd[\uFF0C,]\s*/u, '').trim()

  const sentence = command.split(/[\u3002\uFF01\uFF1F!?]/u)[0].trim()

  if (!sentence) return task.title.replace(/\s+task$/i, '')

  return sentence.length > 28 ? `${sentence.slice(0, 28)}\u2026` : sentence

}


function runtimeEventLabel(value: string): string {
  if (value.includes('policy_guard.started')) return '\u736c\u8c78\u6b63\u5728\u6838\u9a8c\u6267\u884c\u8fb9\u754c'
  if (value.includes('policy_guard.completed')) return '\u5408\u89c4\u8bc1\u636e\u5df2\u5b8c\u6210\u56de\u8bfb'
  if (value.includes('policy_guard.passed')) return '\u5408\u89c4\u8fb9\u754c\u5df2\u9501\u5b9a\uff0c\u6267\u884c\u5206\u7075\u653e\u884c'
  if (value.includes('model')) return '\u0044\u0065\u0065\u0070\u0053\u0065\u0065\u006b\u0020\u8bed\u4e49\u7814\u5224\u5df2\u843d\u8d26'
  if (value.includes('approval') || value.includes('approved')) return '\u4eba\u5de5\u88c1\u51b3\u5df2\u843d\u5370'
  if (value.includes('nodes.started')) return '\u5206\u7075\u4f53\u5e76\u884c\u51fa\u9635'
  if (value.includes('node.started') || value.includes('worker_dispatch')) return '\u5206\u7075\u4f53\u6b63\u5728\u6267\u884c'
  if (value.includes('nodes.completed') || value.includes('node.completed')) return '\u5206\u7075\u6210\u679c\u6b63\u5728\u56de\u4f20'
  if (value.includes('verification') || value.includes('readback')) return '\u4e1a\u52a1\u56de\u8bfb\u6b63\u5728\u9a8c\u6536'
  if (value.includes('completed') || value.includes('verified')) return '\u767d\u6cfd\u5f52\u6574\u5df2\u7ecf\u5b8c\u6210'
  if (value.includes('awaiting')) return '\u7b49\u5f85\u4eba\u5de5\u88c1\u51b3'
  if (value.includes('policy')) return '\u6743\u9650\u4e0e\u7b56\u7565\u6838\u9a8c\u901a\u8fc7'
  return '\u6301\u4e45\u4efb\u52a1\u72b6\u6001\u5df2\u540c\u6b65'
}


type RuntimeStreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'settled' | 'error'

interface RuntimeStreamPayload {
  sequence: number
  emittedAt: string
  eventType: string
  task: AiProductTask
  delta?: { messages?: AiProductTask['messages']; nodes?: Array<{ id: string; state: string; effectStatus?: string }> }
}

const TERMINAL_TASK_STATES = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'COMPENSATED'])


export default function BaizeRuntimePage() {

  const [tasks, setTasks] = useState<AiProductTask[]>([])

  const [selectedId, setSelectedId] = useState('')

  const [cursor, setCursor] = useState(0)

  const [playing, setPlaying] = useState(true)

  const [liveCatchup, setLiveCatchup] = useState(false)

  const streamMessageCountRef = useRef(0)

  const [loading, setLoading] = useState(true)

  const [deciding, setDeciding] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [streamState, setStreamState] = useState<RuntimeStreamState>('idle')

  const [streamEventCount, setStreamEventCount] = useState(0)

  const [lastStreamEventAt, setLastStreamEventAt] = useState<string | null>(null)

  const [lastStreamEventLabel, setLastStreamEventLabel] = useState('\u7b49\u5f85\u4efb\u52a1\u4e8b\u4ef6')



  const load = useCallback(async (quiet = false) => {

    if (!quiet) setLoading(true)

    try {

      const response = await fetch('/api/ai/tasks?page_size=100', { cache: 'no-store' })

      const json = await response.json()

      if (!response.ok || !json.success) throw new Error(json.error ?? '白泽运行星图加载失败')

      const next: AiProductTask[] = json.data?.data ?? []

      setTasks(next)

      setSelectedId((current) => {

        if (current && next.some((task) => task.id === current)) return current

        const requested = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('task') : null

        const preferred = next.find((task) => task.plan.executionMode === 'fan_out' && task.nodes.length >= 3) ?? next.find((task) => task.status === 'awaiting_approval') ?? next[0]
        return (requested && next.some((task) => task.id === requested) ? requested : preferred?.id) ?? ''

      })

      setError(null)

    } catch (loadError) {

      setError(loadError instanceof Error ? loadError.message : '白泽运行星图加载失败')

    } finally { if (!quiet) setLoading(false) }

  }, [])



  useEffect(() => { void load() }, [load])

  useEffect(() => { if (streamState === 'live') return; const timer = window.setInterval(() => void load(true), 5_000); return () => window.clearInterval(timer) }, [load, streamState])



  const task = useMemo(() => tasks.find((item) => item.id === selectedId) ?? null, [selectedId, tasks])

  useEffect(() => { setCursor(0); setPlaying(true); setLiveCatchup(false); streamMessageCountRef.current = 0 }, [selectedId])

  useEffect(() => {
    if (!selectedId) { setStreamState('idle'); return }
    let disposed = false
    let terminal = false
    let receivedSnapshots = 0
    const source = new EventSource(`/api/ai/tasks/${selectedId}/events`)
    setStreamState('connecting')
    setStreamEventCount(0)
    setLastStreamEventAt(null)

    source.onopen = () => { if (!disposed) setStreamState('live') }
    const onSnapshot = (event: Event) => {
      if (disposed) return
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as RuntimeStreamPayload
        if (!payload.task || payload.task.id !== selectedId) return
        receivedSnapshots += 1
        setTasks((current) => current.some((item) => item.id === payload.task.id)
          ? current.map((item) => item.id === payload.task.id ? payload.task : item)
          : [payload.task, ...current])
        setStreamState('live')
        setStreamEventCount((count) => count + 1)
        setLastStreamEventAt(payload.emittedAt)
        setLastStreamEventLabel(runtimeEventLabel(payload.eventType))
        const isTerminal = TERMINAL_TASK_STATES.has(payload.task.state)
        const nextMessageCount = payload.task.messages.length
        const previousMessageCount = streamMessageCountRef.current
        streamMessageCountRef.current = nextMessageCount
        if (receivedSnapshots === 1) {
          if (!isTerminal) {
            setCursor(Math.max(0, nextMessageCount - 1))
            setPlaying(false)
          }
        } else if (nextMessageCount > previousMessageCount) {
          setCursor((current) => Math.min(Math.max(current, Math.max(0, previousMessageCount - 1)), Math.max(0, nextMessageCount - 1)))
          setLiveCatchup(true)
          setPlaying(true)
        }
      } catch {
        setStreamState('error')
      }
    }
    const onTerminal = () => {
      terminal = true
      setStreamState('settled')
      source.close()
    }
    source.addEventListener('task.snapshot', onSnapshot)
    source.addEventListener('task.terminal', onTerminal)
    source.addEventListener('task.error', () => setStreamState('error'))
    source.onerror = () => { if (!disposed && !terminal) setStreamState('reconnecting') }
    return () => { disposed = true; source.close() }
  }, [selectedId])

  useEffect(() => {

    if (!playing || !task || task.messages.length <= 1) return

    const timer = window.setInterval(() => setCursor((current) => {

      if (current < task.messages.length - 1) return current + 1

      setPlaying(false)
      setLiveCatchup(false)

      return current

    }), liveCatchup ? 700 : 2_300)

    return () => window.clearInterval(timer)

  }, [liveCatchup, playing, task])



  const message = task?.messages[Math.min(cursor, Math.max(0, task.messages.length - 1))]

  const phase = messagePhase(message, cursor, task?.messages.length ?? 0)

  const mood = moodFor(task, phase, deciding)

  const replayStates = useMemo(() => new Map<string, string>(

    task?.nodes.map((node) => [node.id, nodeReplayState(task, node, cursor)]) ?? [],

  ), [cursor, task])

  const completed = [...replayStates.values()].filter((state) => state === 'COMPLETED').length

  const verified = task?.nodes.filter((node) => replayStates.get(node.id) === 'COMPLETED' && node.effect?.status === 'VERIFIED').length ?? 0

  const finalReportVisible = Boolean(task && cursor >= task.messages.length - 1 && phase >= 7)

  const modelEvidenceCount = task?.messages.filter((item) => Boolean(item.data?.model)).length ?? 0

  const streamLabel = liveCatchup && streamState === 'settled'
    ? '\u4e1a\u52a1\u5df2\u843d\u8d26 \u00b7 \u6b63\u5728\u5448\u73b0\u6267\u884c\u8f68\u8ff9'
    : streamState === 'live' ? '\u5b9e\u65f6\u6267\u884c\u5df2\u8fde\u63a5'
    : streamState === 'connecting' ? '\u6b63\u5728\u8fde\u63a5\u6267\u884c\u73b0\u573a'
      : streamState === 'reconnecting' ? '\u6b63\u5728\u6062\u590d\u4e8b\u4ef6\u8fde\u63a5'
        : streamState === 'settled' ? '\u5168\u90e8\u4e8b\u4ef6\u5df2\u6301\u4e45\u5316'
          : streamState === 'error' ? '\u4e8b\u4ef6\u8fde\u63a5\u9700\u5173\u6ce8' : '\u7b49\u5f85\u771f\u5b9e\u4efb\u52a1'

  const streamTimeLabel = lastStreamEventAt ? new Date(lastStreamEventAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'



  async function decide(action: 'confirm' | 'reject') {

    if (!task) return

    setDeciding(true); setError(null)

    const previousCount = task.messages.length

    try {

      const response = await fetch(`/api/ai/tasks/${task.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'confirm' ? '在白泽全屏运行星图中核对预览后确认' : '在白泽全屏运行星图中拒绝执行' }) })

      const json = await response.json()

      if (!response.ok || !json.success) throw new Error(json.error ?? '人工裁决失败')

      setTasks((current) => current.map((item) => item.id === task.id ? json.data : item))

      setCursor(Math.max(0, previousCount - 1)); setPlaying(true)

    } catch (decisionError) {

      setError(decisionError instanceof Error ? decisionError.message : '人工裁决失败')

    } finally { setDeciding(false) }

  }



  return (

    <MainLayout>

      <div className="baize-mission fixed inset-0 z-[120] overflow-hidden text-white">

        <div className="baize-mission__aurora" aria-hidden="true" />

        <header className="relative z-20 flex h-16 items-center justify-between gap-4 border-b border-white/10 bg-slate-950/55 px-4 backdrop-blur-xl md:px-6">

          <div className="flex min-w-0 items-center gap-3"><Button size="icon" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" asChild><Link href="/ai-agents/execution" aria-label="退出全屏运行星图"><ArrowLeft className="h-5 w-5" /></Link></Button><div className="h-8 w-px bg-white/10" /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold tracking-[0.16em] text-cyan-100">白泽 · 全域协同运行星图</p><Badge className={`border ${streamState === 'error' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : streamState === 'settled' ? 'border-violet-300/20 bg-violet-300/10 text-violet-200' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}`} title={`${lastStreamEventLabel} \u00b7 ${streamTimeLabel}`}><span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${streamState === 'error' ? 'bg-rose-300' : streamState === 'settled' ? 'bg-violet-300' : 'bg-emerald-300 animate-pulse'}`} />{streamLabel}</Badge></div><p className="mt-0.5 truncate text-[11px] text-slate-500">分发、交接、执行、回传、归整与验证的完整工作现场</p></div></div>

          <div className="flex items-center gap-2"><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger className="hidden w-[260px] border-white/10 bg-white/5 text-slate-200 lg:flex"><SelectValue placeholder="选择真实任务" /></SelectTrigger><SelectContent>{tasks.map((item) => <SelectItem key={item.id} value={item.id}>{taskLabel(item)}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => { setCursor(0); setLiveCatchup(false); setPlaying(true) }} disabled={!task}><RotateCcw className="mr-1.5 h-4 w-4" />回放</Button><Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setPlaying((value) => !value)} disabled={!task}>{playing ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}{playing ? '暂停' : '继续'}</Button><Button size="icon" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></div>

        </header>



        {error && <div className="absolute left-1/2 top-20 z-40 w-[min(620px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-950/90 p-3 text-sm text-rose-100 shadow-2xl backdrop-blur"><XCircle className="mr-2 inline h-4 w-4" />{error}</div>}



        {!task && !loading ? <div className="relative z-10 flex h-[calc(100vh-4rem)] flex-col items-center justify-center text-center"><BaizeAvatar mood="calm" size={220} /><h1 className="mt-4 text-2xl font-semibold">星图宁静，尚无真实任务</h1><p className="mt-2 text-sm text-slate-400">先向白泽下达一条指令，任务形成后即可进入这里观察完整协同。</p><Button asChild className="mt-5"><Link href="/ai-agents/conversation"><Sparkles className="mr-2 h-4 w-4" />向白泽下令</Link></Button></div> : task && <main className="relative z-10 grid h-[calc(100vh-4rem)] grid-cols-1 grid-rows-[minmax(0,1fr)_auto] xl:grid-cols-[280px_minmax(0,1fr)_330px] xl:grid-rows-[minmax(0,1fr)_118px]">

          <aside className="hidden min-h-0 border-r border-white/10 bg-slate-950/36 p-4 backdrop-blur-sm xl:block"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.14em] text-cyan-200">任务脉络</p><p className="mt-1 text-[11px] text-slate-500">来自持久状态迁移</p></div><Activity className="h-4 w-4 text-cyan-300" /></div><div className="baize-mission__timeline max-h-[calc(100vh-9rem)] space-y-1 overflow-y-auto pr-1">{task.timeline.map((item, index) => { const active = index <= Math.round((phase / Math.max(1, PHASES.length - 1)) * Math.max(0, task.timeline.length - 1)); return <div key={`${item.state}-${item.at}-${index}`} className={`relative flex gap-3 rounded-xl p-2.5 ${active ? 'bg-cyan-300/5' : ''}`}><div className="flex flex-col items-center"><span className={`mt-1 h-2.5 w-2.5 rounded-full border ${active ? 'border-cyan-200 bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]' : 'border-slate-600 bg-slate-800'}`} />{index < task.timeline.length - 1 && <span className={`mt-1 h-full min-h-5 w-px ${active ? 'bg-cyan-300/40' : 'bg-slate-800'}`} />}</div><div className="min-w-0"><p className={`text-xs font-medium ${active ? 'text-cyan-100' : 'text-slate-500'}`}>{item.label}</p><p className="mt-1 text-[10px] text-slate-600">{new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div></div> })}</div></aside>



          <section className="relative min-h-0 overflow-hidden">

            <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2"><Badge className="border border-cyan-300/20 bg-slate-950/60 text-cyan-100">{`第 ${phase + 1} 幕 · ${PHASES[phase]}`}</Badge><Badge variant="outline" className="border-white/10 bg-slate-950/50 text-slate-300">{finalReportVisible ? taskStateLabel(task.state) : '持久现场回放'}</Badge><Badge variant="outline" className="border-white/10 bg-slate-950/50 text-slate-300">{task.plan.executionMode === 'fan_out' ? '多 Agent 并行' : '受控顺序执行'}</Badge><Badge variant="outline" className="border-emerald-300/15 bg-slate-950/50 text-emerald-200">{'\u5b9e\u65f6\u4e8b\u4ef6'} {streamEventCount} {'\u00b7'} {lastStreamEventLabel}</Badge>{modelEvidenceCount > 0 && <Badge variant="outline" className="border-violet-300/15 bg-violet-300/5 text-violet-200">DeepSeek {'\u63a8\u7406\u8bc1\u636e'} {modelEvidenceCount}</Badge>}</div>

            <div className="baize-mission__canvas absolute inset-0">

              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="mission-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>{task.nodes.slice(0, DEFAULT_POSITIONS.length).map((node, index) => { const position = missionPosition(index, task.nodes.length); const replayState = replayStates.get(node.id) ?? 'PENDING'; const path = `M 500 310 Q ${(500 + position.x) / 2} ${position.y < 310 ? 210 : 410} ${position.x} ${position.y}`; const active = replayState === 'RUNNING'; const complete = replayState === 'COMPLETED'; return <g key={node.id}><path d={path} className={`baize-mission__beam ${active ? 'baize-mission__beam--active' : complete ? 'baize-mission__beam--complete' : ''}`} />{(active || complete) && <circle r={active ? 4 : 3} fill={active ? '#67e8f9' : '#6ee7b7'} filter="url(#mission-glow)"><animateMotion dur={active ? '1.5s' : '2.4s'} repeatCount="indefinite" path={path} /></circle>}</g> })}</svg>

              <div className="baize-mission__core"><div className="baize-mission__rings" aria-hidden="true"><span /><span /><span /></div><BaizeAvatar mood={mood} size={240} showThreads={phase >= 2 && phase <= 6} threadCount={Math.min(3, task.nodes.length)} /><div className="baize-mission__core-title"><Sparkles className="h-3.5 w-3.5" />白泽总调度官</div></div>

              {task.nodes.slice(0, DEFAULT_POSITIONS.length).map((node, index) => { const position = missionPosition(index, task.nodes.length); const replayState = replayStates.get(node.id) ?? 'PENDING'; const speaking = message?.agentId === node.agent.id || Boolean(message?.content.includes(node.agent.name)); return <div key={node.id} className={`baize-mission__node baize-mission__node--${replayState.toLowerCase()} ${speaking ? 'baize-mission__node--speaking' : ''}`} style={{ left: `${position.left}%`, top: `${position.top}%` }}><div className="baize-mission__node-orb"><span>{node.agent.avatar}</span></div><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold text-white">{node.agent.name}</p>{replayState === 'RUNNING' ? <Activity className="h-3.5 w-3.5 animate-pulse text-cyan-300" /> : replayState === 'COMPLETED' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : replayState === 'FAILED' || replayState === 'BLOCKED' ? <XCircle className="h-3.5 w-3.5 text-rose-300" /> : <Clock3 className="h-3.5 w-3.5 text-amber-300" />}</div><p className="mt-1 truncate text-[10px] text-slate-400">{node.title}</p><p className="mt-1 text-[10px] text-cyan-200/80">{nodePhrase(replayState, node.skillId)}</p></div></div> })}

              {message && <div className="baize-mission__speech"><div className="flex items-center gap-2"><span className="text-lg">{message.agentAvatar}</span><p className="text-xs font-semibold text-cyan-100">{message.agentName}</p><Badge variant="outline" className="border-cyan-300/20 text-[10px] text-cyan-200">{messageTypeLabel(message.type)}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-200">{message.content}</p></div>}

            </div>

          </section>



          <aside className="hidden min-h-0 border-l border-white/10 bg-slate-950/36 p-4 backdrop-blur-sm xl:flex xl:flex-col"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.14em] text-cyan-200">工作交接</p><p className="mt-1 text-[11px] text-slate-500">{liveCatchup ? '\u771f\u5b9e\u4e8b\u4ef6\u8ffd\u5e27 \u00b7 \u4e1a\u52a1\u7ed3\u679c\u5df2\u843d\u8d26' : streamState === 'live' ? `\u5b9e\u65f6\u6267\u884c\u4e8b\u4ef6 \u00b7 ${streamTimeLabel}` : '\u6301\u4e45\u534f\u4f5c\u6d88\u606f\u56de\u653e'}</p></div><Badge variant="outline" className="border-white/10 text-slate-400">{Math.min(cursor + 1, task.messages.length)}/{task.messages.length}</Badge></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{task.messages.map((item, index) => <button key={item.id} type="button" onClick={() => { setCursor(index); setLiveCatchup(false); setPlaying(false) }} className={`w-full rounded-xl border p-3 text-left transition ${index === cursor ? 'border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.08)]' : index < cursor ? 'border-white/8 bg-white/[0.025]' : 'border-white/5 bg-transparent opacity-45'}`}><div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span>{item.agentAvatar}</span><span className="truncate text-xs font-medium text-slate-200">{item.agentName}</span></span><span className="text-[10px] text-slate-600">{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div><p className="mt-2 line-clamp-3 text-[11px] leading-5 text-slate-400">{item.content}</p></button>)}</div></aside>



          <footer className="col-span-1 border-t border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl xl:col-span-3"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 flex-1 items-center gap-4"><div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 sm:flex"><ShieldCheck className="h-6 w-6 text-cyan-200" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold tracking-[0.12em] text-cyan-100">白泽归整汇报</p><Badge className={finalReportVisible && task.status === 'verified' ? 'bg-emerald-400/15 text-emerald-200' : task.status === 'failed' ? 'bg-rose-400/15 text-rose-200' : 'bg-amber-400/15 text-amber-200'}>{finalReportVisible && task.status === 'verified' ? '已验收' : task.status === 'failed' ? '受阻' : '进行中'}</Badge></div><p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-5 text-slate-300">{finalReportVisible && task.summary ? task.summary : task.status === 'awaiting_approval' && phase >= 3 ? '真实执行预览已经铺开，白泽正等待你的裁决。' : `当前来到「${PHASES[phase]}」，所有进展都来自持久任务记录。`}</p></div></div><div className="flex items-center gap-5 text-center text-xs"><div><p className="text-lg font-semibold text-white">{completed}/{task.nodes.length}</p><p className="text-slate-500">分灵归位</p></div><div><p className="text-lg font-semibold text-emerald-300">{verified}</p><p className="text-slate-500">业务回读</p></div><div><p className="text-lg font-semibold text-amber-200">{phase < 4 ? '尚未裁决' : approvalLabel(task.approval.status)}</p><p className="text-slate-500">人工裁决</p></div>{task.state === 'AWAITING_APPROVAL' && <div className="flex gap-2"><Button size="sm" variant="outline" className="border-rose-300/20 bg-rose-300/5 text-rose-200 hover:bg-rose-300/10" disabled={deciding} onClick={() => void decide('reject')}>收回光路</Button><Button size="sm" className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={deciding || !task.nodes.every((node) => Boolean(node.preview))} onClick={() => void decide('confirm')}>{deciding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserCheck className="mr-1.5 h-4 w-4" />}批准执行</Button></div>}<Button size="sm" variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" asChild><Link href={`/ai-agents/execution?task=${task.id}`}><Expand className="mr-1.5 h-4 w-4" />任务详情</Link></Button></div></div></footer>

        </main>}

      </div>

    </MainLayout>

  )

}



