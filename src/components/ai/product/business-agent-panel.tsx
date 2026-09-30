'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Database, Expand, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { BaizeConstellation } from '@/components/ai/baize-constellation'
import { TaskStatusBadge } from '@/components/ai/product/task-detail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { AiProductSkill, AiProductTask, AiSystemReadiness } from '@/lib/ai/product-types'
import { backendLabel } from '@/lib/ai/presentation'

export function BusinessAgentPanel({
  skillId,
  title,
  description,
  params = {},
}: {
  skillId: string
  title: string
  description: string
  params?: Record<string, unknown>
}) {
  const [tasks, setTasks] = useState<AiProductTask[]>([])
  const [skill, setSkill] = useState<AiProductSkill | null>(null)
  const [readiness, setReadiness] = useState<AiSystemReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [taskResponse, skillResponse, systemResponse] = await Promise.all([
        fetch('/api/ai/tasks?page_size=100', { cache: 'no-store' }),
        fetch('/api/ai/skills', { cache: 'no-store' }),
        fetch('/api/ai/system', { cache: 'no-store' }),
      ])
      const [taskJson, skillJson, systemJson] = await Promise.all([
        taskResponse.json(),
        skillResponse.json(),
        systemResponse.json(),
      ])
      if (!taskResponse.ok || !skillResponse.ok || !systemResponse.ok) {
        throw new Error(taskJson.error ?? skillJson.error ?? systemJson.error ?? 'Agent 协同闭环加载失败')
      }
      setTasks((taskJson.data?.data ?? []).filter((task: AiProductTask) => task.skill.id === skillId || task.skill.key === skillId))
      setSkill((skillJson.data?.skills ?? []).find((item: AiProductSkill) => item.id === skillId || item.runtimeAliases.includes(skillId)) ?? null)
      setReadiness(systemJson.data)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Agent 协同闭环加载失败')
    } finally {
      setLoading(false)
    }
  }, [skillId])

  useEffect(() => { void load() }, [load])

  const recent = useMemo(
    () => [...tasks].sort((a, b) => b.timestamps.updatedAt.localeCompare(a.timestamps.updatedAt)).slice(0, 3),
    [tasks],
  )
  const verifiedEffects = tasks.flatMap((task) => task.nodes).filter((node) => node.effect?.status === 'VERIFIED').length
  const activeTask = recent.find((task) => ['awaiting_approval', 'queued', 'running'].includes(task.status))
  const baizeMood = activeTask ? 'busy' : verifiedEffects > 0 ? 'success' : readiness?.executionReady ? 'calm' : 'offline'
  const href = `/ai-agents/conversation?skill=${encodeURIComponent(skillId)}&params=${encodeURIComponent(JSON.stringify(params))}`

  return (
    <Card className="overflow-hidden border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/70">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <BaizeAvatar mood={baizeMood} size={58} showThreads={Boolean(activeTask)} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-gray-950">{title} · 白泽 Agent 团队</p>
                <Badge variant="outline">受控业务能力</Badge>
                {skill && <Badge className={skill.availableToCurrentUser ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>{skill.availableToCurrentUser ? '当前角色可用' : '当前角色无权限'}</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-600">{description}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><Database className="h-3.5 w-3.5" />{readiness?.executionReady ? `真实业务库：${backendLabel(readiness.businessPort)}` : '业务库未就绪，提交将安全停止'}</span>
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />执行预览后审批</span>
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />已验证业务成果 {verifiedEffects}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="刷新 Agent 团队">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {activeTask && <Button size="sm" variant="outline" asChild><Link href={`/ai-agents/runtime?task=${activeTask.id}`}><Expand className="mr-1 h-4 w-4" />观察协同</Link></Button>}
            {skill?.availableToCurrentUser === false
              ? <Button size="sm" disabled>无执行权限</Button>
              : <Button size="sm" asChild><Link href={href}><Sparkles className="mr-1 h-4 w-4" />交给 Agent 团队</Link></Button>}
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        {recent.length > 0 && <div className="mt-4"><BaizeConstellation task={recent[0]} compact /></div>}
        {recent.length > 0 && <div className="mt-4 grid gap-2 lg:grid-cols-3">{recent.map((task) => {
          const effect = task.nodes.find((node) => node.effect)?.effect
          return <Link key={task.id} href={`/ai-agents/execution?task=${task.id}`} className="rounded-lg border bg-white/80 p-3 transition hover:border-indigo-300">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{task.title.replace(/\s+task$/i, '')}</p><TaskStatusBadge task={task} /></div>
            <p className="mt-1 truncate text-xs text-gray-400">{task.nodes.map((node) => node.agent.name).join('、')}</p>
            <p className="mt-2 flex items-center gap-1 text-xs text-gray-600">{effect ? '真实业务成果已完成回读验证' : task.blocker ? `执行已被安全拦截：${task.blocker.message}` : '等待业务成果回传'}<ArrowRight className="ml-auto h-3.5 w-3.5" /></p>
          </Link>
        })}</div>}
      </CardContent>
    </Card>
  )
}
