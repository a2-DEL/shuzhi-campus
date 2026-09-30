'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Bot, CheckCircle2, Clock3, Filter, Loader2, RefreshCw, ShieldCheck, Terminal, XCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { ReadinessBanner } from '@/components/ai/product/readiness-banner'
import { BaizeConstellation } from '@/components/ai/baize-constellation'
import { TaskDetail, TaskStatusBadge } from '@/components/ai/product/task-detail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AiProductStatus, AiProductTask, AiSystemReadiness } from '@/lib/ai/product-types'
import { approvalLabel, riskLevelLabel, skillDisplayName } from '@/lib/ai/presentation'

const FILTERS: Array<{ value: 'all' | AiProductStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'awaiting_approval', label: '待审批' },
  { value: 'queued', label: '已入队' },
  { value: 'running', label: '执行中' },
  { value: 'verified', label: '已验证' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
]

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

export default function AiExecutionPage() {
  const [tasks, setTasks] = useState<AiProductTask[]>([])
  const [readiness, setReadiness] = useState<AiSystemReadiness | null>(null)
  const [selected, setSelected] = useState<AiProductTask | null>(null)
  const [filter, setFilter] = useState<'all' | AiProductStatus>('all')
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [taskResponse, systemResponse] = await Promise.all([
        fetch('/api/ai/tasks?page_size=200', { cache: 'no-store' }),
        fetch('/api/ai/system', { cache: 'no-store' }),
      ])
      const [taskJson, systemJson] = await Promise.all([taskResponse.json(), systemResponse.json()])
      if (!taskResponse.ok) throw new Error(taskJson.error ?? '任务加载失败')
      if (!systemResponse.ok) throw new Error(systemJson.error ?? '系统状态加载失败')
      const nextTasks: AiProductTask[] = taskJson.data?.data ?? []
      setTasks(nextTasks)
      setReadiness(systemJson.data)
      setSelected((current) => {
        if (current) return nextTasks.find((task) => task.id === current.id) ?? current
        if (typeof window === 'undefined') return null
        const requested = new URLSearchParams(window.location.search).get('task')
        return requested ? nextTasks.find((task) => task.id === requested) ?? null : null
      })
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '执行中心加载失败')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 10000)
    return () => window.clearInterval(timer)
  }, [load])

  const filtered = useMemo(
    () => filter === 'all' ? tasks : tasks.filter((task) => task.status === filter),
    [filter, tasks],
  )

  const metrics = useMemo(() => ({
    awaiting: tasks.filter((task) => task.status === 'awaiting_approval').length,
    active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    verified: tasks.filter((task) => task.status === 'verified').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }), [tasks])

  async function decide(action: 'confirm' | 'reject') {
    if (!selected) return
    setDeciding(true)
    setError(null)
    try {
      const response = await fetch(`/api/ai/tasks/${selected.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'confirm' ? '执行中心人工核对真实执行预览后确认' : '执行中心人工拒绝' }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '审批失败')
      setSelected(json.data)
      await load(true)
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : '审批失败')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-950"><Terminal className="h-6 w-6 text-indigo-600" />Agent 执行与审批中心</h1>
            <p className="mt-1 text-sm text-gray-500">每 10 秒回读持久任务；展示真实节点、执行预览、审批、业务效果和回读证据。</p>
          </div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新</Button><Button asChild><Link href="/ai-agents/conversation"><Bot className="mr-2 h-4 w-4" />新建任务</Link></Button></div>
        </div>

        <ReadinessBanner readiness={readiness} />
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-amber-400"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Clock3 className="h-4 w-4 text-amber-600" />待人工审批</div><p className="mt-1 text-3xl font-bold text-amber-700">{metrics.awaiting}</p></CardContent></Card>
          <Card className="border-l-4 border-l-indigo-500"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Activity className="h-4 w-4 text-indigo-600" />队列/执行中</div><p className="mt-1 text-3xl font-bold text-indigo-700">{metrics.active}</p></CardContent></Card>
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />已回读验证</div><p className="mt-1 text-3xl font-bold text-emerald-700">{metrics.verified}</p></CardContent></Card>
          <Card className="border-l-4 border-l-red-500"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><XCircle className="h-4 w-4 text-red-600" />失败</div><p className="mt-1 text-3xl font-bold text-red-700">{metrics.failed}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-indigo-600" />受控任务台账</CardTitle><Badge variant="outline">{filtered.length}/{tasks.length}</Badge></div>
            <div className="flex flex-wrap gap-2"><Filter className="mt-1.5 h-4 w-4 text-gray-400" />{FILTERS.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? 'default' : 'outline'} onClick={() => setFilter(item.value)}>{item.label}{item.value !== 'all' && <span className="ml-1 text-xs opacity-70">{tasks.filter((task) => task.status === item.value).length}</span>}</Button>)}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && tasks.length === 0 ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">当前筛选条件下没有任务</div> : filtered.map((task) => {
              const completedNodes = task.nodes.filter((node) => node.state === 'COMPLETED').length
              return <button key={task.id} className="w-full rounded-xl border p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/30" onClick={() => setSelected(task)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900">{task.title}</p><TaskStatusBadge task={task} /><Badge variant="outline">{riskLevelLabel(task.riskLevel)}</Badge></div><p className="mt-1 truncate text-sm text-gray-500">{task.command}</p></div>
                  <div className="text-right text-xs text-gray-400"><p>更新于 {formatTime(task.timestamps.updatedAt)}</p><p className="mt-1">持久任务记录</p></div>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded bg-gray-50 p-2"><span className="text-gray-400">业务能力</span><p className="mt-0.5 truncate font-medium">{skillDisplayName(task.skill.key ?? task.skill.id)}</p></div>
                  <div className="rounded bg-gray-50 p-2"><span className="text-gray-400">Agent 分工</span><p className="mt-0.5 truncate font-medium">{task.nodes.map((node) => node.agent.name).join('、') || '-'}</p></div>
                  <div className="rounded bg-gray-50 p-2"><span className="text-gray-400">节点完成</span><p className="mt-0.5 font-medium">{completedNodes}/{task.nodes.length}</p></div>
                  <div className="rounded bg-gray-50 p-2"><span className="text-gray-400">审批</span><p className="mt-0.5 font-medium">{approvalLabel(task.approval.status)} · {task.approval.approvedCount}/{task.approval.requiredCount}</p></div>
                </div>
                {task.blocker && <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">执行被安全阻断：{task.blocker.message}</div>}
              </button>
            })}
          </CardContent>
        </Card>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader><DialogTitle>任务执行证据</DialogTitle></DialogHeader>
            {selected && <div className="space-y-4"><BaizeConstellation task={selected} /><TaskDetail task={selected} deciding={deciding} onDecision={(action) => void decide(action)} /></div>}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
