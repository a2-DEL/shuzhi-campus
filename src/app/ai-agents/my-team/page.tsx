'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, Eye, Loader2, RefreshCw, ShieldCheck, Users, Workflow, XCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AiProductTask } from '@/lib/ai/product-types'
import { capabilityLabel, nodeStateLabel, skillDisplayName } from '@/lib/ai/presentation'

interface AgentCard {
  id: string
  name: string
  role: string
  avatar: string
  description: string
  capabilities: string[]
  skills: string[]
}

interface AgentTeam {
  role: string
  roleLabel: string
  coordinator: AgentCard
  members: AgentCard[]
}

interface AgentMetric {
  assigned: number
  completed: number
  failed: number
  active: number
}

const EMPTY_METRIC: AgentMetric = { assigned: 0, completed: 0, failed: 0, active: 0 }

function buildMetrics(tasks: AiProductTask[]): Map<string, AgentMetric> {
  const metrics = new Map<string, AgentMetric>()
  for (const task of tasks) {
    for (const node of task.nodes) {
      const current = metrics.get(node.agent.id) ?? { ...EMPTY_METRIC }
      current.assigned += 1
      if (node.state === 'COMPLETED') current.completed += 1
      if (node.state === 'FAILED') current.failed += 1
      if (node.state === 'RUNNING' || node.state === 'PENDING') current.active += 1
      metrics.set(node.agent.id, current)
    }
  }
  return metrics
}

export default function AiAgentTeamsPage() {
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [tasks, setTasks] = useState<AiProductTask[]>([])
  const [selected, setSelected] = useState<AgentCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [agentResponse, taskResponse] = await Promise.all([
        fetch('/api/ai/agents', { cache: 'no-store' }),
        fetch('/api/ai/tasks?page_size=200', { cache: 'no-store' }),
      ])
      const [agentJson, taskJson] = await Promise.all([agentResponse.json(), taskResponse.json()])
      if (!agentResponse.ok) throw new Error(agentJson.error ?? 'Agent 目录加载失败')
      if (!taskResponse.ok) throw new Error(taskJson.error ?? '任务记录加载失败')
      setTeams(Object.values(agentJson.data?.teams ?? {}))
      setTasks(taskJson.data?.data ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Agent 团队加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const metrics = useMemo(() => buildMetrics(tasks), [tasks])
  const allAgents = useMemo(() => teams.flatMap((team) => [team.coordinator, ...team.members]), [teams])
  const totals = useMemo(() => ({
    assigned: allAgents.reduce((sum, agent) => sum + (metrics.get(agent.id)?.assigned ?? 0), 0),
    completed: allAgents.reduce((sum, agent) => sum + (metrics.get(agent.id)?.completed ?? 0), 0),
    failed: allAgents.reduce((sum, agent) => sum + (metrics.get(agent.id)?.failed ?? 0), 0),
  }), [allAgents, metrics])

  const selectedMetric = selected ? metrics.get(selected.id) ?? EMPTY_METRIC : EMPTY_METRIC
  const selectedTasks = selected
    ? tasks.filter((task) => task.nodes.some((node) => node.agent.id === selected.id)).slice(0, 8)
    : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-950"><Users className="h-6 w-6 text-indigo-600" />角色 Agent 团队</h1>
            <p className="mt-1 text-sm text-gray-500">每个系统角色配置一名总调度 Agent 和专业成员；运行统计仅来自已创建的真实任务节点。</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新</Button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card><CardContent className="p-4"><p className="text-sm text-gray-500">角色团队</p><p className="mt-1 text-2xl font-bold">{teams.length}</p><p className="text-xs text-gray-400">来自系统角色目录</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-gray-500">已配置 Agent</p><p className="mt-1 text-2xl font-bold">{allAgents.length}</p><p className="text-xs text-gray-400">不等同于在线心跳</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-gray-500">任务节点分配</p><p className="mt-1 text-2xl font-bold text-indigo-700">{totals.assigned}</p><p className="text-xs text-gray-400">按持久任务节点统计</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-gray-500">节点已完成</p><p className="mt-1 text-2xl font-bold text-emerald-700">{totals.completed}</p><p className="text-xs text-gray-400">来自真实完成状态</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-gray-500">节点失败</p><p className="mt-1 text-2xl font-bold text-red-700">{totals.failed}</p><p className="text-xs text-gray-400">保留错误与重试证据</p></CardContent></Card>
        </div>

        {loading && teams.length === 0 ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : (
          <div className="grid gap-5 xl:grid-cols-2">
            {teams.map((team) => {
              const members = [team.coordinator, ...team.members]
              const teamAssigned = members.reduce((sum, agent) => sum + (metrics.get(agent.id)?.assigned ?? 0), 0)
              return (
                <Card key={team.role} className="overflow-hidden">
                  <CardHeader className="border-b bg-gray-50/70 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base"><span className="text-xl">{team.coordinator.avatar}</span>{team.roleLabel}</CardTitle>
                      <div className="flex gap-2"><Badge variant="outline">{members.length} Agent</Badge><Badge className="bg-indigo-100 text-indigo-700">{teamAssigned} 个任务节点</Badge></div>
                    </div>

                  </CardHeader>
                  <CardContent className="divide-y p-0">
                    {members.map((agent) => {
                      const metric = metrics.get(agent.id) ?? EMPTY_METRIC
                      return (
                        <button key={agent.id} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-indigo-50/40" onClick={() => setSelected(agent)}>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">{agent.avatar}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-gray-900">{agent.name}</p><Badge variant="outline">{agent.role === 'coordinator' ? '总调度' : '专业成员'}</Badge><Badge className="bg-slate-100 text-slate-600">已配置</Badge></div>
                            <p className="mt-1 truncate text-xs text-gray-500">{agent.description}</p>
                          </div>
                          <div className="hidden grid-cols-3 gap-4 text-center text-xs sm:grid">
                            <div><p className="font-semibold text-gray-900">{metric.assigned}</p><p className="text-gray-400">分配</p></div>
                            <div><p className="font-semibold text-emerald-700">{metric.completed}</p><p className="text-gray-400">完成</p></div>
                            <div><p className="font-semibold text-red-700">{metric.failed}</p><p className="text-gray-400">失败</p></div>
                          </div>
                          <Eye className="h-4 w-4 shrink-0 text-gray-400" />
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><span className="text-2xl">{selected?.avatar}</span>{selected?.name}</DialogTitle></DialogHeader>
            {selected && <div className="space-y-5">
              <div className="rounded-xl border bg-gray-50 p-4"><div className="flex flex-wrap gap-2"><Badge>{selected.role === 'coordinator' ? '总调度 Agent' : '专业 Agent'}</Badge><Badge variant="outline">已配置</Badge></div><p className="mt-2 text-sm text-gray-600">{selected.description}</p></div>

              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3"><Workflow className="mx-auto h-4 w-4 text-indigo-600" /><p className="mt-1 text-xl font-bold">{selectedMetric.assigned}</p><p className="text-xs text-gray-400">已分配</p></div>
                <div className="rounded-lg bg-emerald-50 p-3"><CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /><p className="mt-1 text-xl font-bold">{selectedMetric.completed}</p><p className="text-xs text-gray-400">已完成</p></div>
                <div className="rounded-lg bg-blue-50 p-3"><Bot className="mx-auto h-4 w-4 text-blue-600" /><p className="mt-1 text-xl font-bold">{selectedMetric.active}</p><p className="text-xs text-gray-400">待办/执行</p></div>
                <div className="rounded-lg bg-red-50 p-3"><XCircle className="mx-auto h-4 w-4 text-red-600" /><p className="mt-1 text-xl font-bold">{selectedMetric.failed}</p><p className="text-xs text-gray-400">失败</p></div>
              </div>

              <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-indigo-600" />专业能力与业务分工</p><div className="flex flex-wrap gap-2">{[...new Set(selected.capabilities.map(capabilityLabel))].map((capability) => <Badge key={capability} variant="outline">{capability}</Badge>)}</div><div className="mt-2 flex flex-wrap gap-2">{[...new Set(selected.skills.map(skillDisplayName))].map((skill) => <Badge key={skill} className="bg-indigo-100 text-indigo-700">{skill}</Badge>)}</div></div>

              <div><p className="mb-2 text-sm font-semibold">最近任务分工</p><div className="space-y-2">{selectedTasks.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">暂无真实任务分配记录</p> : selectedTasks.map((task) => { const node = task.nodes.find((item) => item.agent.id === selected.id); return <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{task.title.replace(/\s+task$/i, '')}</p><p className="truncate text-xs text-gray-400">{node?.title} · {skillDisplayName(task.skill.key ?? task.skill.id)}</p></div><Badge variant="outline">{node ? nodeStateLabel(node.state) : '未开始'}</Badge></div> })}</div></div>
            </div>}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}



