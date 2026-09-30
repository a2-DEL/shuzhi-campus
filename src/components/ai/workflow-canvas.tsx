'use client'

import { useEffect, useState } from 'react'
import type { Connection, Edge, Node, NodeProps } from '@xyflow/react'

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string
  description?: string
  kind?: 'trigger' | 'knowledge' | 'agent' | 'skill' | 'approval' | 'aggregate'
  skillId?: string
  agentLabel?: string
  params?: Record<string, unknown>
  stateLabel?: string
}

export type WorkflowNode = Node<WorkflowNodeData>
export type WorkflowEdge = Edge
export type WorkflowConnection = Connection

export interface WorkflowCanvasProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  onNodesChange: (nodes: WorkflowNode[]) => void
  onEdgesChange: (edges: WorkflowEdge[]) => void
  onConnect: (connection: WorkflowConnection) => void
  onNodeClick: (event: React.MouseEvent, node: WorkflowNode) => void
  isRunning: boolean
  runStep: number
}

const STYLE = {
  trigger: { icon: '启', eyebrow: 'EVENT TRIGGER', border: 'border-cyan-300/35', glow: 'shadow-[0_0_30px_rgba(34,211,238,0.14)]', iconStyle: 'bg-cyan-300/15 text-cyan-100', line: 'from-cyan-300 to-blue-500' },
  knowledge: { icon: '知', eyebrow: 'TRUSTED CONTEXT', border: 'border-violet-300/35', glow: 'shadow-[0_0_30px_rgba(167,139,250,0.14)]', iconStyle: 'bg-violet-300/15 text-violet-100', line: 'from-violet-300 to-fuchsia-500' },
  agent: { icon: '灵', eyebrow: 'AGENT WORKER', border: 'border-emerald-300/35', glow: 'shadow-[0_0_30px_rgba(52,211,153,0.14)]', iconStyle: 'bg-emerald-300/15 text-emerald-100', line: 'from-emerald-300 to-cyan-500' },
  skill: { icon: '技', eyebrow: 'GOVERNED SKILL', border: 'border-blue-300/35', glow: 'shadow-[0_0_30px_rgba(96,165,250,0.14)]', iconStyle: 'bg-blue-300/15 text-blue-100', line: 'from-blue-300 to-indigo-500' },
  approval: { icon: '审', eyebrow: 'HUMAN GATE', border: 'border-amber-300/40', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.14)]', iconStyle: 'bg-amber-300/15 text-amber-100', line: 'from-amber-300 to-orange-500' },
  aggregate: { icon: '泽', eyebrow: 'BAIZE AGGREGATE', border: 'border-fuchsia-300/35', glow: 'shadow-[0_0_30px_rgba(232,121,249,0.14)]', iconStyle: 'bg-fuchsia-300/15 text-fuchsia-100', line: 'from-fuchsia-300 to-violet-500' },
} as const

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  const [Canvas, setCanvas] = useState<React.ComponentType<WorkflowCanvasProps> | null>(null)

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[data-xyflow-styles]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/xyflow.css'
      link.dataset.xyflowStyles = 'true'
      document.head.appendChild(link)
    }

    import('@xyflow/react').then((mod) => {
      const { ReactFlow, Controls, Background, MiniMap, BackgroundVariant, Handle, Position, applyNodeChanges, applyEdgeChanges } = mod

      const PlatformNode = ({ data, selected }: NodeProps<WorkflowNode>) => {
        const kind = data.kind ?? 'agent'
        const style = STYLE[kind]
        return (
          <div className={`relative w-[230px] overflow-hidden rounded-2xl border bg-[#0a1424]/95 p-3.5 text-white backdrop-blur ${style.border} ${style.glow} ${selected ? 'ring-2 ring-white/60' : ''}`}>
            {kind !== 'trigger' && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-[#07111f] !bg-cyan-200" />}
            {kind !== 'aggregate' && <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-[#07111f] !bg-fuchsia-200" />}
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${style.line}`} />
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold ${style.iconStyle}`}>{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold tracking-[0.16em] text-slate-500">{style.eyebrow}</p>
                <p className="mt-1 truncate text-[13px] font-semibold text-slate-100">{data.label}</p>
              </div>
            </div>
            {data.description && <p className="mt-3 line-clamp-2 text-[10px] leading-5 text-slate-400">{data.description}</p>}
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2 text-[9px] text-slate-500">
              <span className="max-w-[150px] truncate">{data.agentLabel || (data.skillId ? `受控能力 · ${data.skillId}` : '白泽编排中枢')}</span>
              <span className="flex items-center gap-1 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{data.stateLabel || '已配置'}</span>
            </div>
          </div>
        )
      }

      const nodeTypes = { trigger: PlatformNode, knowledge: PlatformNode, agent: PlatformNode, skill: PlatformNode, approval: PlatformNode, aggregate: PlatformNode }
      const CanvasComponent = (canvasProps: WorkflowCanvasProps) => (
        <div className="h-full min-h-[620px] overflow-hidden rounded-2xl border border-slate-700/70 bg-[#050b16]">
          <ReactFlow
            nodes={canvasProps.nodes}
            edges={canvasProps.edges}
            onNodesChange={(changes) => canvasProps.onNodesChange(applyNodeChanges(changes, canvasProps.nodes))}
            onEdgesChange={(changes) => canvasProps.onEdgesChange(applyEdgeChanges(changes, canvasProps.edges))}
            onConnect={canvasProps.onConnect}
            onNodeClick={canvasProps.onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.35}
            maxZoom={1.7}
            defaultEdgeOptions={{ animated: true, style: { strokeWidth: 2, stroke: '#67e8f9' }, labelStyle: { fill: '#94a3b8', fontSize: 10 }, labelBgStyle: { fill: '#07111f', fillOpacity: 0.9 }, labelBgPadding: [6, 3], labelBgBorderRadius: 6 }}
          >
            <Controls className="!overflow-hidden !rounded-xl !border !border-white/10 !bg-[#0b1525] !fill-slate-300 !shadow-2xl" />
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#24354f" />
            <MiniMap nodeStrokeWidth={2} nodeColor={(node: WorkflowNode) => ({ trigger: '#22d3ee', knowledge: '#a78bfa', agent: '#34d399', skill: '#60a5fa', approval: '#fbbf24', aggregate: '#e879f9' }[String(node.type)] ?? '#64748b')} maskColor="rgba(3,7,18,0.72)" className="!rounded-xl !border !border-white/10 !bg-[#0b1525]" />
          </ReactFlow>
        </div>
      )
      setCanvas(() => CanvasComponent)
    }).catch((error) => console.error('Failed to load workflow canvas', error))
  }, [])

  if (!Canvas) return <div className="flex min-h-[620px] items-center justify-center rounded-2xl border border-slate-700/70 bg-[#050b16]"><div className="text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" /><p className="mt-3 text-xs tracking-[0.14em] text-slate-500">正在唤醒星图画布</p></div></div>
  return <Canvas {...props} />
}
