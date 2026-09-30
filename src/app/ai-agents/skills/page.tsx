'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, Boxes, CheckCircle2, CloudCog, Database,
  Fingerprint, Gauge, Globe2, KeyRound, Loader2, LockKeyhole, Network, PackageCheck, Play,
  PlugZap, Plus, RefreshCw, Search, ShieldCheck, TerminalSquare, TriangleAlert, Zap,
} from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar } from '@/components/ai/baize-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ExtensionOverview, ExtensionSkillView, McpServerView, PluginView } from '@/lib/ai/platform/extension-types'

const LOOP_LABEL: Record<string, string> = { repair_policy: '\u5408\u89c4\u6838\u9a8c', repair: '报修派单', notification: '通知触达', classroom_booking: '教学空间', lost_found: '失物认领', hygiene_rectification: '卫生整改', dorm_safety: '宿舍安全', visitor: '访客准入', energy_maintenance: '能源维护' }
const RISK_STYLE: Record<string, string> = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-orange-100 text-orange-700', critical: 'bg-rose-100 text-rose-700' }
const STATUS_STYLE: Record<string, string> = { PUBLISHED: 'bg-emerald-100 text-emerald-700', DRAFT: 'bg-amber-100 text-amber-700', ACTIVE: 'bg-emerald-100 text-emerald-700', DEGRADED: 'bg-rose-100 text-rose-700', DISABLED: 'bg-slate-100 text-slate-600', AVAILABLE: 'bg-cyan-100 text-cyan-700', REVIEW_REQUIRED: 'bg-amber-100 text-amber-700' }
const FACT_LABEL: Record<string, string> = { repairs: '报修总量', active_repairs: '活跃报修', classrooms: '教学空间', published_notifications: '已发通知', pending_safety: '安全待确认', agent_tasks: 'Agent 任务', documents: '知识文档', chunks: '知识分块', entities: '图谱实体', relations: '图谱关系', retrievals: '检索审计', workflows: '工作流', runs: '运行批次', awaiting_approval: '等待裁决', completed: '已完成' }

function pluginDefaults(skillId: string): Record<string, unknown> {
  if (skillId === 'repair_policy_guard') return { count: 1, operation: 'sla_dispatch', reason: '\u901a\u8fc7\u53d7\u6cbb\u7406\u63d2\u4ef6\u6838\u9a8c\u62a5\u4fee\u6267\u884c\u8fb9\u754c' }
  if (skillId === 'repair_dispatch') return { count: 1, reason: '通过受治理插件形成派单预览' }
  if (skillId === 'notification_publish') return { title: '白泽协同事项通知', content: '此通知由受治理插件形成，需人工审批后才会发布。', type: 'SYSTEM', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false }
  return {}
}

export default function ExtensionGovernancePage() {
  const [overview, setOverview] = useState<ExtensionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pluginOpen, setPluginOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [pluginName, setPluginName] = useState('校园业务协同插件')
  const [pluginDescription, setPluginDescription] = useState('将已发布 Skill 封装成面向业务人员的受治理入口。')
  const [pluginSkill, setPluginSkill] = useState('repair_dispatch')
  const [mcpName, setMcpName] = useState('校内业务数据 MCP')
  const [mcpEndpoint, setMcpEndpoint] = useState('http://localhost:3100/api/ai/mcp/internal')
  const [mcpResult, setMcpResult] = useState<{ text: string; facts: Record<string, unknown>; latencyMs: number } | null>(null)
  const [taskId, setTaskId] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/ai/extensions', { cache: 'no-store' }); const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '扩展治理平台加载失败')
      setOverview(json.data)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '扩展治理平台加载失败') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const filteredSkills = useMemo(() => {
    const key = search.trim().toLowerCase(); if (!key) return overview?.skills ?? []
    return (overview?.skills ?? []).filter((skill) => [skill.displayName, skill.description, LOOP_LABEL[skill.businessLoop] ?? '', skill.owner].some((value) => value.toLowerCase().includes(key)))
  }, [overview, search])

  async function action(body: Record<string, unknown>, key: string): Promise<unknown> {
    setWorking(key); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/ai/extensions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '扩展操作失败')
      return json.data
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '扩展操作失败'); return null } finally { setWorking('') }
  }

  async function createPlugin() {
    const skill = overview?.skills.find((item) => item.id === pluginSkill)
    if (!skill) return
    const data = await action({ action: 'createPlugin', name: pluginName, description: pluginDescription, publisher: '数智星图内部业务团队', trustLevel: 'INTERNAL', manifest: { summary: pluginDescription, capabilities: [{ id: `capability-${skill.id}`, name: LOOP_LABEL[skill.businessLoop] ?? skill.displayName, description: skill.description, skillId: skill.id }], allowedRoles: ['super_admin', 'logistics_manager', 'logistics_admin', 'dept_admin', 'dorm_manager'] } }, 'create-plugin')
    if (data) { setPluginOpen(false); setNotice('插件草稿已持久化，只包含声明式 Skill 绑定，不含可执行脚本。'); await load() }
  }
  async function publishPlugin(plugin: PluginView) {
    const data = await action({ action: 'publishPlugin', pluginId: plugin.id }, `publish-${plugin.id}`)
    if (data) { setNotice('插件版本已冻结发布，后续调用仍接受原 Skill 权限与审批约束。'); await load() }
  }
  async function runCapability(plugin: PluginView, capabilityId: string, skillId: string) {
    const data = await action({ action: 'invokePlugin', pluginId: plugin.id, capabilityId, params: pluginDefaults(skillId) }, `invoke-${plugin.id}-${capabilityId}`) as { id?: string; state?: string } | null
    if (data?.id) { setTaskId(data.id); setNotice(data.state === 'AWAITING_APPROVAL' ? '插件已创建正式 Agent 执行预览，正在等待人工裁决。' : '插件已经进入受治理 Agent 运行链。') }
  }
  async function createMcp() {
    const data = await action({ action: 'createMcp', name: mcpName, description: '通过标准 MCP 协议接入受控业务数据和工具。', endpoint: mcpEndpoint, transport: 'STREAMABLE_HTTP', authMode: 'NONE', trustLevel: mcpEndpoint.includes('/api/ai/mcp/internal') ? 'VERIFIED' : 'INTERNAL' }, 'create-mcp')
    if (data) { setMcpOpen(false); setNotice('MCP 节点已登记为草稿；必须完成真实握手后才能调用工具。'); await load() }
  }
  async function probeMcp(server: McpServerView) {
    const data = await action({ action: 'probeMcp', serverId: server.id }, `probe-${server.id}`) as McpServerView | null
    if (data) { setNotice(`MCP 握手成功：协议 ${data.protocolVersion ?? '已协商'}，发现 ${data.tools.length} 个工具。`); await load() }
  }
  async function callMcp(server: McpServerView, toolId: string) {
    const data = await action({ action: 'callMcp', serverId: server.id, toolId, arguments: {} }, `call-${toolId}`) as { text: string; facts: Record<string, unknown>; latencyMs: number } | null
    if (data) { setMcpResult(data); setNotice('MCP 工具已真实调用，返回内容已转换为业务语言并记录审计指纹。'); await load() }
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1780px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_20%_85%,rgba(99,102,241,0.2),transparent_30%),linear-gradient(132deg,#030712,#07182b_52%,#11162f)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(2,6,23,0.28)] md:px-9">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(103,232,249,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.07)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="relative grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_300px]"><div><div className="flex flex-wrap gap-2"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><PlugZap className="mr-1 h-3 w-3" />白泽万象 · Extension Fabric</Badge><Badge className="border border-emerald-200/20 bg-emerald-200/10 text-emerald-100"><ShieldCheck className="mr-1 h-3 w-3" />声明式扩展 · 零任意代码</Badge></div><p className="mt-5 text-xs font-medium tracking-[0.26em] text-cyan-200/60">SKILLS · PLUGINS · MODEL CONTEXT PROTOCOL</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-[40px]">把能力做成可治理、可组合、可验证的企业扩展生态</h1><p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">Skills 是不可变业务契约；插件只能声明式组合已发布 Skill；MCP 节点必须通过地址安全检查、标准握手、工具发现和风险审核。凭据不入库，调用不绕过租户与审计。</p><div className="mt-5 flex flex-wrap gap-2 text-[11px] text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">版本冻结</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">权限继承</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">SSRF 防护</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">凭据引用</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">JSON-RPC 审计</span></div></div><div className="relative mx-auto"><div className="absolute inset-4 rounded-full bg-cyan-300/10 blur-3xl" /><BaizeAvatar mood={working ? 'busy' : 'calm'} size={200} showThreads threadCount={3} /></div></div>
        </section>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert className="mt-0.5 h-4 w-4" />{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}{taskId && <Link className="ml-auto font-medium underline" href={`/ai-agents/runtime?task=${taskId}`}>打开 Agent 星图</Link>}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
          { label: '受治理 Skills', value: overview?.metrics.skills ?? 0, icon: Zap, note: '不可变业务契约' }, { label: '已登记插件', value: overview?.metrics.plugins ?? 0, icon: Boxes, note: '声明式能力组合' }, { label: '在线 MCP', value: overview?.metrics.activeMcpServers ?? 0, icon: Network, note: '真实握手通过' }, { label: '发现工具', value: overview?.metrics.mcpTools ?? 0, icon: TerminalSquare, note: '服务端动态发现' }, { label: '成功探测', value: overview?.metrics.successfulProbes ?? 0, icon: Activity, note: '协议与能力证据' }, { label: '工具调用', value: overview?.metrics.invocations ?? 0, icon: Gauge, note: '哈希审计记录' },
        ].map(({ label, value, icon: Icon, note }) => <Card key={label} className="border-slate-200/80"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><Icon className="h-4 w-4 text-cyan-600" /></div><p className="mt-2 text-3xl font-semibold text-slate-950">{loading ? '—' : value}</p><p className="mt-1 text-[10px] text-slate-400">{note}</p></CardContent></Card>)}</section>

        <Tabs defaultValue="skills" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-11 bg-white shadow-sm"><TabsTrigger value="skills" className="gap-2"><Zap className="h-4 w-4" />Skills 能力契约</TabsTrigger><TabsTrigger value="plugins" className="gap-2"><Boxes className="h-4 w-4" />插件工坊</TabsTrigger><TabsTrigger value="mcp" className="gap-2"><Network className="h-4 w-4" />MCP 控制面</TabsTrigger></TabsList><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新证据</Button></div>

          <TabsContent value="skills" className="space-y-4"><Card className="border-slate-200/80"><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="搜索业务能力、责任中心或业务闭环" /></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">{filteredSkills.map((skill: ExtensionSkillView) => <Card key={skill.key} className="group overflow-hidden border-slate-200/80 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg"><div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" /><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Fingerprint className="h-5 w-5" /></span><div className="flex gap-1"><Badge className={RISK_STYLE[skill.riskLevel]}>{skill.riskLevel === 'critical' ? '关键风险' : skill.riskLevel === 'high' ? '高风险' : skill.riskLevel === 'medium' ? '中风险' : '低风险'}</Badge><Badge className={skill.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{skill.available ? '当前角色可用' : '只读查看'}</Badge></div></div><p className="mt-4 text-[10px] font-semibold tracking-[0.14em] text-cyan-700">{LOOP_LABEL[skill.businessLoop] ?? skill.businessLoop}</p><h3 className="mt-1 font-semibold text-slate-950">{skill.displayName}</h3><p className="mt-2 line-clamp-3 text-xs leading-6 text-slate-500">{skill.description}</p><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]"><div className="rounded-lg bg-slate-50 p-2"><p className="font-semibold text-slate-900">V{skill.version}</p><p className="text-slate-400">不可变版本</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="font-semibold text-slate-900">{skill.approvalPolicy === 'single_approval' ? '单人裁决' : '双人裁决'}</p><p className="text-slate-400">审批边界</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="truncate font-semibold text-slate-900">{skill.owner}</p><p className="text-slate-400">责任中心</p></div></div><div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-slate-400"><span><LockKeyhole className="mr-1 inline h-3 w-3" />发布后只读</span><span><PackageCheck className="mr-1 inline h-3 w-3" />评测集已绑定</span></div></CardContent></Card>)}</div></TabsContent>

          <TabsContent value="plugins" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4"><div className="flex items-start gap-3"><Boxes className="mt-0.5 h-5 w-5 text-indigo-700" /><div><p className="font-semibold text-indigo-950">插件不是上传 JavaScript</p><p className="mt-1 text-xs leading-5 text-indigo-800/75">企业插件只声明业务能力、角色范围和展示语义；真正执行仍进入正式 Agent 任务与 Skill Gateway。</p></div></div>{overview?.manager && <Button onClick={() => setPluginOpen(true)}><Plus className="mr-2 h-4 w-4" />创建插件</Button>}</div><div className="grid gap-4 xl:grid-cols-2">{overview?.plugins.map((plugin) => <Card key={plugin.id} className="overflow-hidden border-slate-200/80"><div className="flex items-center justify-between border-b bg-slate-950 px-5 py-4 text-white"><div><p className="text-[9px] tracking-[0.15em] text-cyan-300/70">DECLARATIVE PLUGIN · V{plugin.currentVersion}</p><h3 className="mt-1 font-semibold">{plugin.name}</h3></div><Badge className={STATUS_STYLE[plugin.status]}>{plugin.status === 'PUBLISHED' ? '已发布' : '草稿'}</Badge></div><CardContent className="p-5"><p className="text-xs leading-6 text-slate-500">{plugin.description}</p><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span className="text-slate-500">发布方</span><span className="font-medium text-slate-900">{plugin.publisher}</span></div><div className="mt-4 space-y-2">{plugin.version?.manifest.capabilities.map((capability) => <div key={capability.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-900">{capability.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">绑定受治理能力 · {capability.skillId}</p></div><Button size="sm" variant="outline" onClick={() => void runCapability(plugin, capability.id, capability.skillId)} disabled={plugin.status !== 'PUBLISHED' || Boolean(working)}>{working === `invoke-${plugin.id}-${capability.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}</Button></div>)}</div>{overview.manager && plugin.status === 'DRAFT' && <Button className="mt-4 w-full" onClick={() => void publishPlugin(plugin)} disabled={Boolean(working)}><PackageCheck className="mr-2 h-4 w-4" />审核并冻结发布</Button>}<div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-slate-400"><span>{plugin.version?.manifest.allowedRoles.length ?? 0} 个允许角色</span><span className="text-emerald-600"><ShieldCheck className="mr-1 inline h-3 w-3" />{plugin.trustLevel === 'VERIFIED' ? '平台已验证' : '内部资产'}</span></div></CardContent></Card>)}</div></TabsContent>

          <TabsContent value="mcp" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4"><div className="flex items-start gap-3"><CloudCog className="mt-0.5 h-5 w-5 text-cyan-700" /><div><p className="font-semibold text-cyan-950">标准 MCP 控制平面</p><p className="mt-1 text-xs leading-5 text-cyan-900/70">创建节点后先执行真实 initialize 和 tools/list；只有低/中风险且已验证的工具可调用。</p></div></div>{overview?.manager && <Button onClick={() => setMcpOpen(true)}><Plus className="mr-2 h-4 w-4" />登记 MCP</Button>}</div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]"><div className="space-y-4">{overview?.mcpServers.map((server) => <Card key={server.id} className="overflow-hidden border-slate-200/80"><div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"><div><div className="flex items-center gap-2"><Network className="h-5 w-5 text-cyan-600" /><h3 className="font-semibold text-slate-950">{server.name}</h3><Badge className={STATUS_STYLE[server.status]}>{server.status === 'ACTIVE' ? '在线' : server.status === 'DEGRADED' ? '异常' : '待握手'}</Badge></div><p className="mt-2 text-[10px] text-slate-400">{server.endpointLabel}</p></div><Button size="sm" variant="outline" onClick={() => void probeMcp(server)} disabled={Boolean(working)}>{working === `probe-${server.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}握手与发现</Button></div><CardContent className="p-5"><div className="grid grid-cols-4 gap-2 text-center text-[10px]"><div className="rounded-xl bg-slate-50 p-2"><p className="font-semibold text-slate-900">{server.protocolVersion ?? '待协商'}</p><p className="text-slate-400">协议</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="font-semibold text-slate-900">{server.tools.length}</p><p className="text-slate-400">工具</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="font-semibold text-slate-900">{server.lastLatencyMs ?? '—'} ms</p><p className="text-slate-400">延迟</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="font-semibold text-slate-900">{server.credentialConfigured ? '就绪' : '缺失'}</p><p className="text-slate-400">凭据</p></div></div><div className="mt-4 space-y-2">{server.tools.map((tool) => <div key={tool.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold text-slate-900">{tool.title}</p><Badge className={STATUS_STYLE[tool.status]}>{tool.status === 'AVAILABLE' ? '可调用' : '待审核'}</Badge></div><p className="mt-1 line-clamp-1 text-[10px] text-slate-400">{tool.description}</p></div><Button size="sm" onClick={() => void callMcp(server, tool.id)} disabled={tool.status !== 'AVAILABLE' || server.status !== 'ACTIVE' || Boolean(working)}>{working === `call-${tool.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}</Button></div>)}</div></CardContent></Card>)}</div><div className="space-y-4"><Card className="border-slate-200/80"><CardContent className="p-5"><div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-indigo-600" /><h3 className="font-semibold text-slate-950">最近一次工具成果</h3></div>{mcpResult ? <><p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-6 text-indigo-950">{mcpResult.text}</p><div className="mt-4 grid grid-cols-2 gap-2">{Object.entries(mcpResult.facts).map(([key, value]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{FACT_LABEL[key] ?? key}</p><p className="mt-1 text-xl font-semibold text-slate-950">{String(value)}</p></div>)}</div><p className="mt-3 text-[10px] text-slate-400">调用延迟 {mcpResult.latencyMs} ms · 数据来自当前租户业务库</p></> : <div className="mt-4 rounded-xl border border-dashed p-8 text-center"><Database className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs text-slate-400">调用一个已审核工具后，这里展示业务化成果。</p></div>}</CardContent></Card><Card className="border-amber-200 bg-amber-50/60"><CardContent className="p-4"><div className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 text-amber-700" /><div><p className="text-xs font-semibold text-amber-950">凭据与网络边界</p><p className="mt-1 text-[10px] leading-5 text-amber-900/75">数据库只保存环境变量名，不保存令牌；外部节点强制 HTTPS，并拒绝私网、回环、保留地址和 URL 内嵌凭据。</p></div></div></CardContent></Card></div></div></TabsContent>
        </Tabs>

        <Dialog open={pluginOpen} onOpenChange={setPluginOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-indigo-600" />创建声明式插件</DialogTitle></DialogHeader><div className="space-y-4"><div><label className="mb-1.5 block text-xs font-medium">插件名称</label><Input value={pluginName} onChange={(event) => setPluginName(event.target.value)} /></div><div><label className="mb-1.5 block text-xs font-medium">解决的业务问题</label><Textarea rows={3} value={pluginDescription} onChange={(event) => setPluginDescription(event.target.value)} /></div><div><label className="mb-1.5 block text-xs font-medium">绑定正式 Skill</label><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={pluginSkill} onChange={(event) => setPluginSkill(event.target.value)}>{overview?.skills.map((skill) => <option key={skill.id} value={skill.id}>{LOOP_LABEL[skill.businessLoop] ?? skill.displayName} · V{skill.version}</option>)}</select></div><div className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" />不会上传或执行插件代码；所有调用继续经过原 Skill 的权限、审批、频控、审计与补偿策略。</div><Button className="w-full" onClick={() => void createPlugin()} disabled={!pluginName.trim() || Boolean(working)}>{working === 'create-plugin' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}保存插件草稿</Button></div></DialogContent></Dialog>

        <Dialog open={mcpOpen} onOpenChange={setMcpOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-cyan-600" />登记 MCP 服务节点</DialogTitle></DialogHeader><div className="space-y-4"><div><label className="mb-1.5 block text-xs font-medium">节点名称</label><Input value={mcpName} onChange={(event) => setMcpName(event.target.value)} /></div><div><label className="mb-1.5 block text-xs font-medium">Streamable HTTP 地址</label><Input value={mcpEndpoint} onChange={(event) => setMcpEndpoint(event.target.value)} placeholder="https://mcp.example.edu/mcp" /></div><div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-6 text-cyan-950"><ShieldCheck className="mr-1 inline h-4 w-4" />登记时执行 URL 安全校验；只有完成标准握手并通过工具风险审核后才可调用。</div><Button className="w-full" onClick={() => void createMcp()} disabled={!mcpName.trim() || !mcpEndpoint.trim() || Boolean(working)}>{working === 'create-mcp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}登记并等待握手</Button></div></DialogContent></Dialog>
      </div>
    </MainLayout>
  )
}
