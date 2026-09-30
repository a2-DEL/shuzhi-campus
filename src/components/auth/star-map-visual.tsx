'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Bot, BrainCircuit, Network, ShieldCheck, Sparkles, Workflow } from 'lucide-react'

const nodes = [
  { id: 'core', x: 380, y: 286, r: 34, label: '小星', detail: '总调度 Agent', tone: '#67e8f9' },
  { id: 'knowledge', x: 150, y: 138, r: 16, label: '知识中枢', detail: 'RAG · 图谱', tone: '#a78bfa' },
  { id: 'workflow', x: 610, y: 126, r: 16, label: '编排引擎', detail: 'Workflow', tone: '#22d3ee' },
  { id: 'security', x: 655, y: 405, r: 16, label: '安全护栏', detail: 'Policy · Audit', tone: '#34d399' },
  { id: 'business', x: 128, y: 430, r: 16, label: '业务域', detail: '8 大闭环', tone: '#f59e0b' },
  { id: 'data', x: 380, y: 526, r: 13, label: '数据管道', detail: 'ETL · OCR', tone: '#60a5fa' },
] as const

const edges = [
  ['core', 'knowledge'],
  ['core', 'workflow'],
  ['core', 'security'],
  ['core', 'business'],
  ['core', 'data'],
  ['knowledge', 'workflow'],
  ['workflow', 'security'],
  ['security', 'data'],
  ['data', 'business'],
  ['business', 'knowledge'],
] as const

const stars = [
  [52, 66, 1.2], [116, 245, 1.5], [204, 74, 1], [278, 172, 1.3], [328, 58, 1.4],
  [452, 78, 1], [520, 220, 1.2], [702, 214, 1.4], [728, 510, 1], [560, 566, 1.5],
  [282, 552, 1.2], [54, 522, 1.3], [228, 358, 1], [510, 458, 1.2], [718, 72, 1.1],
] as const

const getNode = (id: string) => nodes.find((node) => node.id === id)!

const capabilityCards = [
  { icon: Network, title: '多 Agent 协作', description: '目标拆解与团队调度' },
  { icon: BrainCircuit, title: '知识与记忆', description: '有据可依的校园认知' },
  { icon: Workflow, title: '真实业务执行', description: '工作流贯穿业务闭环' },
  { icon: ShieldCheck, title: '安全与审计', description: '人在回环与全程留痕' },
] as const

export function StarMapVisual() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative flex h-full min-h-[620px] flex-col justify-between overflow-hidden rounded-[34px] border border-white/10 bg-[#071426]/72 p-8 shadow-[0_32px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl xl:p-10">
      <div className="relative z-10 flex items-start justify-between gap-6">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-xs font-medium tracking-[0.18em] text-cyan-100">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            CAMPUS AGENT OS
          </div>
          <h1 className="max-w-[660px] text-4xl font-semibold leading-[1.15] tracking-[-0.04em] text-white xl:text-5xl 2xl:text-[58px]">
            让校园每一件事
            <span className="mt-2 block bg-gradient-to-r from-cyan-200 via-blue-300 to-violet-300 bg-clip-text text-transparent">
              都找到正确的协作路径
            </span>
          </h1>
          <p className="mt-5 max-w-[590px] text-sm leading-7 text-slate-300 xl:text-base">
            数智星图连接人员、空间、设备、知识与 Agent 团队，形成可调度、可执行、可追溯的高校空间微治理智能中枢。
          </p>
        </div>

        <motion.div
          className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-200 xl:flex"
          animate={reduceMotion ? undefined : { boxShadow: ['0 0 0 rgba(34,211,238,0)', '0 0 34px rgba(34,211,238,.28)', '0 0 0 rgba(34,211,238,0)'] }}
          transition={{ duration: 3.5, repeat: Infinity }}
        >
          <Bot className="h-7 w-7" />
        </motion.div>
      </div>

      <div className="relative z-0 my-2 min-h-[360px] flex-1">
        <svg viewBox="0 0 760 600" className="absolute inset-0 h-full w-full" role="img" aria-label="数智星图多智能体协作网络示意图">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="edgeGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.18" />
            </linearGradient>
            <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {stars.map(([x, y, radius], index) => (
            <motion.circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={radius}
              fill="#dbeafe"
              animate={reduceMotion ? undefined : { opacity: [0.18, 0.88, 0.18] }}
              transition={{ duration: 2.8 + (index % 4), repeat: Infinity, delay: index * 0.13 }}
            />
          ))}

          <g opacity="0.3">
            {[120, 220, 320, 420, 520, 620].map((x) => <line key={`v-${x}`} x1={x} y1="35" x2={x} y2="570" stroke="#38bdf8" strokeOpacity="0.07" />)}
            {[100, 200, 300, 400, 500].map((y) => <line key={`h-${y}`} x1="30" y1={y} x2="730" y2={y} stroke="#38bdf8" strokeOpacity="0.07" />)}
          </g>

          <circle cx="380" cy="286" r="132" fill="url(#coreGlow)" />
          <motion.circle
            cx="380"
            cy="286"
            r="86"
            fill="none"
            stroke="#67e8f9"
            strokeWidth="1"
            strokeDasharray="5 10"
            strokeOpacity="0.35"
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '380px 286px' }}
          />
          <motion.circle
            cx="380"
            cy="286"
            r="113"
            fill="none"
            stroke="#818cf8"
            strokeWidth="1"
            strokeDasharray="2 13"
            strokeOpacity="0.24"
            animate={reduceMotion ? undefined : { rotate: -360 }}
            transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '380px 286px' }}
          />

          {edges.map(([fromId, toId], index) => {
            const from = getNode(fromId)
            const to = getNode(toId)
            return (
              <motion.line
                key={`${fromId}-${toId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="url(#edgeGradient)"
                strokeWidth={fromId === 'core' ? 1.8 : 1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: fromId === 'core' ? 0.8 : 0.35 }}
                transition={{ duration: 1.2, delay: 0.35 + index * 0.08 }}
              />
            )
          })}

          {!reduceMotion && edges.slice(0, 5).map(([fromId, toId], index) => {
            const from = getNode(fromId)
            const to = getNode(toId)
            return (
              <motion.circle
                key={`signal-${fromId}-${toId}`}
                cx={from.x}
                cy={from.y}
                r="3.2"
                fill="#a5f3fc"
                filter="url(#softGlow)"
                animate={{ x: [0, to.x - from.x, 0], y: [0, to.y - from.y, 0], opacity: [0, 1, 0.2] }}
                transition={{ duration: 3.4 + index * 0.45, repeat: Infinity, delay: index * 0.7, ease: 'easeInOut' }}
              />
            )
          })}

          {nodes.map((node, index) => (
            <g key={node.id}>
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={node.r + 11}
                fill={node.tone}
                opacity="0.06"
                animate={reduceMotion ? undefined : { scale: [0.9, 1.22, 0.9], opacity: [0.04, 0.12, 0.04] }}
                transition={{ duration: 3 + index * 0.24, repeat: Infinity }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
              <circle cx={node.x} cy={node.y} r={node.r} fill="#071426" stroke={node.tone} strokeWidth={node.id === 'core' ? 2 : 1.4} filter="url(#softGlow)" />
              {node.id === 'core' && <circle cx={node.x} cy={node.y} r="10" fill={node.tone} opacity="0.9" />}
              <text x={node.x} y={node.y + node.r + 25} textAnchor="middle" fill="#f8fafc" fontSize={node.id === 'core' ? 15 : 13} fontWeight="600">{node.label}</text>
              <text x={node.x} y={node.y + node.r + 43} textAnchor="middle" fill="#94a3b8" fontSize="10.5">{node.detail}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {capabilityCards.map(({ icon: Icon, title, description }, index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 + index * 0.08 }}
            className="rounded-2xl border border-white/8 bg-white/[0.045] p-3.5 backdrop-blur-md"
          >
            <Icon className="mb-2 h-4 w-4 text-cyan-300" />
            <div className="text-xs font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-[11px] leading-4 text-slate-400">{description}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
