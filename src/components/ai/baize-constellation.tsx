import { Activity, CheckCircle2, Clock3, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { BaizeAvatar, type BaizeMood } from './baize-avatar'
import type { AiProductTask } from '@/lib/ai/product-types'
import type { BaizeRouting, BaizeShardPlan } from '@/lib/ai/assistant/engine'
import { approvalLabel, nodeStateLabel, skillDisplayName, taskStateLabel } from '@/lib/ai/presentation'

interface BaizeConstellationProps {
  task?: AiProductTask | null
  routing?: BaizeRouting | null
  compact?: boolean
  className?: string
}
interface ConstellationNode { id: string; name: string; avatar: string; state: string; purpose: string; skillId?: string; kind: 'coordinator' | 'member' }

const POSITIONS = [
  { left: '8%', top: '18%' }, { left: '72%', top: '12%' }, { left: '80%', top: '62%' },
  { left: '12%', top: '68%' }, { left: '43%', top: '4%' }, { left: '42%', top: '78%' },
]

function moodForTask(task?: AiProductTask | null): BaizeMood {
  if (!task) return 'busy'
  if (task.status === 'verified') return 'success'
  if (task.status === 'failed' || task.status === 'cancelled') return 'alert'
  if (task.status === 'awaiting_approval') return 'calm'
  return 'busy'
}

function stateIcon(state: string) {
  if (state === 'COMPLETED' || state === 'VERIFIED') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (state === 'FAILED' || state === 'BLOCKED' || state === 'CANCELLED') return <XCircle className="h-3.5 w-3.5 text-rose-400" />
  if (state === 'RUNNING') return <Activity className="h-3.5 w-3.5 animate-pulse text-cyan-300" />
  if (state === 'WAITING' || state === 'PENDING') return <Clock3 className="h-3.5 w-3.5 text-amber-300" />
  return <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
}

function nodesFromProps(task?: AiProductTask | null, routing?: BaizeRouting | null): ConstellationNode[] {
  if (task) return [
    { id: `${task.id}-coordinator`, name: '白泽主脑', avatar: '🧠', state: task.state, purpose: '总调度、审批守门与成果归整', kind: 'coordinator' },
    ...task.nodes.map((node) => ({ id: node.id, name: node.agent.name, avatar: node.agent.avatar, state: node.state, purpose: node.title, skillId: node.skillKey ?? node.skillId, kind: 'member' as const })),
  ]
  if (routing) return routing.shards.map((shard: BaizeShardPlan) => ({ id: shard.id, name: shard.name, avatar: shard.avatar, state: shard.state, purpose: shard.purpose, skillId: shard.skillId, kind: shard.role === 'coordinator' ? 'coordinator' : 'member' }))
  return []
}

export function BaizeConstellation({ task, routing, compact = false, className = '' }: BaizeConstellationProps) {
  const nodes = nodesFromProps(task, routing)
  const completed = task?.nodes.filter((node) => node.state === 'COMPLETED').length ?? nodes.filter((node) => node.state === 'COMPLETED').length
  const total = task?.nodes.length ?? Math.max(0, nodes.length - 1)
  const mood = moodForTask(task)
  const label = task ? `${task.title.replace(/\s+task$/i, '')} · ${taskStateLabel(task.state)}` : routing ? `${routing.intent} · 已完成安全分诊` : '白泽 Agent 星系'
  const policy = task ? approvalLabel(task.approval.status) : routing?.policy === 'READ_ONLY' ? '只读求证' : routing?.policy === 'CLARIFICATION_REQUIRED' ? '等待补充' : '受控执行'

  return (
    <section className={`baize-constellation ${compact ? 'baize-constellation--compact' : ''} ${className}`} aria-label="白泽 Agent 运行星系">
      <div className="baize-constellation__header"><div><p className="baize-constellation__eyebrow"><Sparkles className="h-3.5 w-3.5" />分形协同运行图</p><p className="baize-constellation__title">{label}</p></div><div className="baize-constellation__metrics"><span>{completed}/{total || 0} 节点已完成</span>{task?.plan.executionMode === 'fan_out' && <span className="rounded-full border border-cyan-300/30 px-2 py-0.5 text-cyan-200">多 Agent 并行</span>}<span className="baize-constellation__policy"><ShieldAlert className="h-3.5 w-3.5" />{policy}</span></div></div>
      <div className="baize-constellation__canvas">
        <svg className="baize-constellation__lines" viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden="true">{nodes.slice(1).map((node, index) => { const position = POSITIONS[index % POSITIONS.length]; const x = Number.parseFloat(position.left) * 6; const y = Number.parseFloat(position.top) * 3.2; const active = ['RUNNING', 'COMPLETED', 'VERIFIED'].includes(node.state); return <line key={node.id} x1="300" y1="160" x2={x} y2={y} className={active ? 'baize-constellation__line baize-constellation__line--active' : 'baize-constellation__line'} /> })}</svg>
        <div className="baize-constellation__core"><BaizeAvatar mood={mood} size={compact ? 92 : 126} showThreads={nodes.length > 1} threadCount={Math.min(3, Math.max(0, nodes.length - 1))} /><span className="baize-constellation__core-label">白泽主脑</span></div>
        {nodes.slice(1).map((node, index) => <div key={node.id} className="baize-constellation__node" style={POSITIONS[index % POSITIONS.length]}><div className={`baize-constellation__node-card baize-constellation__node-card--${node.state.toLowerCase()}`}><div className="flex items-center gap-2"><span className="text-base">{node.avatar}</span><span className="min-w-0 truncate text-xs font-semibold">{node.name}</span>{stateIcon(node.state)}</div><p className="mt-1 truncate text-[10px] text-slate-400">{node.purpose}</p><p className="mt-1 truncate text-[9px] text-cyan-300/70">{node.skillId ? skillDisplayName(node.skillId) : nodeStateLabel(node.state)}</p></div></div>)}
      </div>
      <div className="baize-constellation__legend"><span><i className="bg-cyan-300" />运行光路</span><span><i className="bg-emerald-400" />验证完成</span><span><i className="bg-amber-300" />等待人工</span><span><i className="bg-rose-400" />阻断或失败</span></div>
    </section>
  )
}
