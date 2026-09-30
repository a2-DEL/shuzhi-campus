'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Expand, Loader2, MessageCircle, Mic, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { BaizeAvatar, type BaizeMood } from '@/components/ai/baize-avatar'
import { BaizeConstellation } from '@/components/ai/baize-constellation'
import { ReadinessBanner } from '@/components/ai/product/readiness-banner'
import { TaskDetail, TaskStatusBadge } from '@/components/ai/product/task-detail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { AiProductSkill, AiProductTask, AiSystemReadiness } from '@/lib/ai/product-types'
import type { BaizeResponseKind, BaizeRouting, BaizeSource } from '@/lib/ai/assistant/engine'
import type { BaizeConversationTurn } from '@/lib/ai/assistant/conversation'
import { readBaizeStream } from '@/lib/ai/assistant/client-stream'
import type { BaizeConversation, BaizeMessage } from '@/lib/ai/assistant/memory'
import { skillDisplayName } from '@/lib/ai/presentation'
import { useAuthStore } from '@/stores'

interface TemplateField { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'datetime' | 'boolean' | 'list' | 'select' | 'multi-select'; placeholder?: string; options?: Array<{ value: string; label: string }> }
interface ResourceOption { value: string; label: string; description?: string }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface Template { skillId: string; title: string; description: string; params: Record<string, unknown>; fields: TemplateField[] }
interface BaizePayload { conversationId?: string; application?: { type: 'repair'; description?: string; location?: string; missing: string[]; href: string }; kind: BaizeResponseKind; message: string; routing: BaizeRouting; sources: BaizeSource[]; suggestions: string[]; task?: AiProductTask; model?: { provider: 'deepseek'; model: string; invocationId: string; latencyMs: number; totalTokens: number }; answer?: { domain: string; total: number; pending: number; completed: number; latestAt?: string; metrics?: Record<string, number> } }

interface ApiEnvelope<T> { success?: boolean; data?: T }
type ResourcePayloadKey = 'classrooms' | 'lostItems' | 'hygiene' | 'safety' | 'visitors' | 'energy'
type ResourceListPayload = { data?: Record<string, unknown>[] }
interface ConversationLoadPayloads {
  system?: ApiEnvelope<AiSystemReadiness>
  skills?: ApiEnvelope<{ skills?: AiProductSkill[] }>
  tasks?: ApiEnvelope<{ data?: AiProductTask[] }>
  classrooms?: ApiEnvelope<ResourceListPayload>
  lostItems?: ApiEnvelope<ResourceListPayload>
  hygiene?: ApiEnvelope<ResourceListPayload>
  safety?: ApiEnvelope<ResourceListPayload>
  visitors?: ApiEnvelope<ResourceListPayload>
  energy?: ApiEnvelope<ResourceListPayload>
}

function future(hours: number): string { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() }
function localDateTime(value: unknown): string { if (typeof value !== 'string') return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return value; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16) }

const TEMPLATES: Template[] = [
  { skillId: 'repair_dispatch', title: '报修智能派单', description: '从真实待派工单和维修人员负载中生成派单预览', params: { count: 1, reason: '由白泽根据待处理工单生成受控派单方案' }, fields: [{ key: 'count', label: '计划派单数量', type: 'number' }, { key: 'reason', label: '派单说明', type: 'textarea', placeholder: '说明本次派单目标' }] },
  { skillId: 'notification_publish', title: '通知发布', description: '由服务端解析真实受众并生成触达任务', params: { title: '', content: '', type: 'SYSTEM', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false }, fields: [{ key: 'title', label: '通知主题', type: 'text' }, { key: 'content', label: '通知内容', type: 'textarea' }, { key: 'type', label: '通知类型', type: 'select', options: [{ value: 'SYSTEM', label: '系统通知' }, { value: 'REPAIR', label: '报修通知' }, { value: 'ACTIVITY', label: '活动通知' }, { value: 'EXAM', label: '考试通知' }] }, { key: 'requireAcknowledgement', label: '要求接收人确认查收', type: 'boolean' }] },
  { skillId: 'classroom_book', title: '教室预约', description: '校验真实课表、冲突、容量与设施', params: { classroomId: '', startsAt: future(24), endsAt: future(26), purpose: '', attendeeCount: 1 }, fields: [{ key: 'classroomId', label: '选择可用教室', type: 'select' }, { key: 'startsAt', label: '开始时间', type: 'datetime' }, { key: 'endsAt', label: '结束时间', type: 'datetime' }, { key: 'purpose', label: '使用目的', type: 'textarea' }, { key: 'attendeeCount', label: '预计人数', type: 'number' }] },
  { skillId: 'lost_found_claim', title: '失物认领', description: '隐私核验后由人工确认认领', params: { itemId: '', claimerId: '', humanConfirmed: true, verificationEvidence: '' }, fields: [{ key: 'itemId', label: '物品记录编号', type: 'text' }, { key: 'claimerId', label: '选择认领人', type: 'select' }, { key: 'verificationEvidence', label: '人工核验说明', type: 'textarea', placeholder: '请说明已核验的身份与物品特征' }] },
  { skillId: 'hygiene_rectification_create', title: '卫生整改', description: '从真实检查证据创建确定性整改任务', params: { inspectionId: '', assigneeId: '', dueAt: future(48), requirements: ['完成现场整改并上传复核证据'], severity: 'medium' }, fields: [{ key: 'inspectionId', label: '检查记录编号', type: 'text' }, { key: 'assigneeId', label: '选择整改负责人', type: 'select' }, { key: 'dueAt', label: '要求完成时间', type: 'datetime' }, { key: 'requirements', label: '整改要求', type: 'list', placeholder: '每行填写一项要求' }, { key: 'severity', label: '重要程度', type: 'select', options: [{ value: 'low', label: '一般' }, { value: 'medium', label: '重要' }, { value: 'high', label: '紧急' }, { value: 'critical', label: '关键' }] }] },
  { skillId: 'dorm_safety_confirm', title: '宿舍安全复核', description: '宿管现场复核设备或规则异常', params: { eventId: '', onsiteConfirmed: true, outcome: 'rectification_required', note: '' }, fields: [{ key: 'eventId', label: '选择待确认安全事件', type: 'select' }, { key: 'outcome', label: '现场结论', type: 'select', options: [{ value: 'false_alarm', label: '确认误报' }, { value: 'rectification_required', label: '需要整改' }, { value: 'escalated', label: '升级处置' }] }, { key: 'note', label: '现场确认说明', type: 'textarea' }] },
  { skillId: 'visitor_approve', title: '访客准入', description: '人工审核后签发一次性短效准入凭证', params: { visitorApplicationId: '', decision: 'approve', rationale: '', validFrom: future(1), validUntil: future(3) }, fields: [{ key: 'visitorApplicationId', label: '选择待核验访客申请', type: 'select' }, { key: 'decision', label: '准入决定', type: 'select', options: [{ value: 'approve', label: '同意准入' }, { value: 'reject', label: '拒绝准入' }] }, { key: 'rationale', label: '审核依据', type: 'textarea' }, { key: 'validFrom', label: '有效开始时间', type: 'datetime' }, { key: 'validUntil', label: '有效结束时间', type: 'datetime' }] },
  { skillId: 'maintenance_recommendation_create', title: '预测性维护', description: '只使用通过质量检查的真实能耗读数', params: { assetId: '', readingIds: [], recommendedAction: '', rationale: '', confidence: 0.8, dueAt: future(72) }, fields: [{ key: 'assetId', label: '设备编号', type: 'text' }, { key: 'readingIds', label: '选择质量合格读数（至少三条）', type: 'multi-select' }, { key: 'recommendedAction', label: '维护建议', type: 'textarea' }, { key: 'rationale', label: '建议依据', type: 'textarea' }, { key: 'confidence', label: '建议可信度（0 到 1）', type: 'number' }, { key: 'dueAt', label: '建议完成时间', type: 'datetime' }] },
]
const QUICK_QUESTIONS = ['您好', '你是谁', '查询待处理报修工单', '查询访客审批情况', '查看能耗读数和预警', '我想了解 Agent 任务进展']

/** Render only the small, server-generated table subset; React escapes all cell text. */
function BaizeText({ text }: { text: string }) {
  const lines = text.split('\n')
  const header = lines.findIndex((line) => /^\|\s*序号\s*\|/.test(line))
  if (header < 0 || !/^\|\s*:?-{2,}/.test(lines[header + 1] ?? '')) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{text}</p>
  }
  const rows = lines.slice(header + 2).filter((line) => line.startsWith('|')).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
  return <div className="space-y-2 text-sm leading-6 text-gray-700">
    <p className="whitespace-pre-wrap">{lines.slice(0, header).join('\n')}</p>
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-xs sm:text-sm">
      <thead className="bg-slate-50"><tr>{['序号', '记录', '状态'].map((column) => <th key={column} className="whitespace-nowrap px-3 py-2">{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-slate-100">{row.slice(0, 3).map((cell, column) => <td key={column} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </div>
}


export default function AiConversationPage() {
  const [readiness, setReadiness] = useState<AiSystemReadiness | null>(null)
  const [skills, setSkills] = useState<AiProductSkill[]>([])
  const [tasks, setTasks] = useState<AiProductTask[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0])
  const [command, setCommand] = useState('请分析待处理报修并生成受控派单方案')
  const [params, setParams] = useState<Record<string, unknown>>({ ...TEMPLATES[0].params })
  const [activeTask, setActiveTask] = useState<AiProductTask | null>(null)
  const [assistantReply, setAssistantReply] = useState<BaizePayload | null>(null)
  const [conversationHistory, setConversationHistory] = useState<BaizeConversationTurn[]>([])
  const [conversations, setConversations] = useState<BaizeConversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [failedMessage, setFailedMessage] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [streamPhase, setStreamPhase] = useState('')
  const [streamInterrupted, setStreamInterrupted] = useState(false)
  const activeConversationId = useRef<string | null>(null)
  const lastLoadedUser = useRef<string | null>(null)
  const refreshConversations = useCallback(async () => {
    const response = await fetch('/api/ai/conversations', { cache: 'no-store' })
    if (!response.ok) throw new Error('暂时无法获取历史会话')
    const payload = await response.json() as { data: BaizeConversation[] }
    setConversations(payload.data ?? [])
    return payload.data ?? []
  }, [])

  const openConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/ai/conversations/${id}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('这段会话无法访问，请刷新后重试')
    const payload = await response.json() as { data: { messages: BaizeMessage[] } }
    activeConversationId.current = id
    setConversationId(id)
    setHistoryOpen(false)
    setConversationHistory(payload.data.messages.map(({ role, content }) => ({ role, content })))
    setAssistantReply(null); setSources([]); setRouting(null); setError(null)
  }, [])

  const newConversation = useCallback(async () => {
    const response = await fetch('/api/ai/conversations', { method: 'POST' })
    if (!response.ok) throw new Error('新会话创建失败，请稍后重试')
    const payload = await response.json() as { data: BaizeConversation }
    activeConversationId.current = payload.data.id
    setConversationId(payload.data.id); setHistoryOpen(false); setConversationHistory([]); setAssistantReply(null)
    setSources([]); setRouting(null); setCommand(''); setFailedMessage(null)
    await refreshConversations()
  }, [refreshConversations])

  const renameConversation = useCallback(async (item: BaizeConversation) => {
    const title = window.prompt('重命名会话', item.title)?.trim()
    if (!title || title === item.title) return
    const response = await fetch(`/api/ai/conversations/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) })
    if (!response.ok) throw new Error('会话重命名失败')
    await refreshConversations()
  }, [refreshConversations])

  const deleteConversation = useCallback(async (item: BaizeConversation) => {
    if (!window.confirm(`确定删除“${item.title}”及其消息吗？`)) return
    const response = await fetch(`/api/ai/conversations/${item.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('会话删除失败')
    if (activeConversationId.current === item.id) {
      activeConversationId.current = null; setConversationId(null); setConversationHistory([]); setAssistantReply(null)
    }
    await refreshConversations()
  }, [refreshConversations])

  const requestInFlight = useRef(false)
  const conversationLogRef = useRef<HTMLDivElement | null>(null)
  const [routing, setRouting] = useState<BaizeRouting | null>(null)
  useEffect(() => {
    if (conversationLogRef.current) conversationLogRef.current.scrollTop = conversationLogRef.current.scrollHeight
  }, [conversationHistory])
  const [sources, setSources] = useState<BaizeSource[]>([])
  const [resourceOptions, setResourceOptions] = useState<Record<string, ResourceOption[]>>({})
  const user = useAuthStore((state) => state.user)
  useEffect(() => {
    if (!user?.id || lastLoadedUser.current === user.id) return
    lastLoadedUser.current = user.id
    void refreshConversations().then((items) => {
      if (items[0] && !activeConversationId.current) return openConversation(items[0].id)
    }).catch(() => setError('历史会话暂时无法加载，可以刷新后重试。'))
  }, [user?.id, refreshConversations, openConversation])
  const [loading, setLoading] = useState(true)
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const load = useCallback(async () => {
    try {
      const requests: Record<string, Promise<Response>> = {
        system: fetch('/api/ai/system', { cache: 'no-store' }),
        skills: fetch('/api/ai/skills', { cache: 'no-store' }),
        tasks: fetch('/api/ai/tasks?page_size=20', { cache: 'no-store' }),
        classrooms: fetch('/api/ai/business-records?domain=classroom&pageSize=100', { cache: 'no-store' }),
        lostItems: fetch('/api/ai/business-records?domain=lost_found&pageSize=100', { cache: 'no-store' }),
        hygiene: fetch('/api/ai/business-records?domain=hygiene&pageSize=100', { cache: 'no-store' }),
        safety: fetch('/api/ai/business-records?domain=dorm_safety&pageSize=100', { cache: 'no-store' }),
        visitors: fetch('/api/ai/business-records?domain=visitor&pageSize=100', { cache: 'no-store' }),
        energy: fetch('/api/ai/business-records?domain=energy&pageSize=100', { cache: 'no-store' }),
      }
      const entries = await Promise.all(Object.entries(requests).map(async ([key, request]) => [key, await request, await request.then((response) => response.json())] as const))
      const payloads = Object.fromEntries(entries.map(([key, , payload]) => [key, payload])) as ConversationLoadPayloads
      if (payloads.system?.success && payloads.system.data) setReadiness(payloads.system.data)
      if (payloads.skills?.success) setSkills(payloads.skills.data?.skills ?? [])
      if (payloads.tasks?.success) {
        const nextTasks = payloads.tasks.data?.data ?? []
        setTasks(nextTasks)
        setActiveTask((current) => current ? nextTasks.find((item: AiProductTask) => item.id === current.id) ?? current : null)
      }
      const nextOptions: Record<string, ResourceOption[]> = {}
      const records = (key: ResourcePayloadKey): Record<string, unknown>[] => payloads[key]?.data?.data ?? []
      nextOptions.classroomId = records('classrooms').filter((item) => String(item.status).toLowerCase() === 'available').map((item) => ({ value: String(item.id), label: `${item.full_name ?? '未命名空间'} · ${item.capacity ?? 0} 人`, description: '可预约空间' }))
      nextOptions.itemId = records('lostItems').filter((item) => ['open', 'matched'].includes(String(item.status).toLowerCase())).map((item) => ({ value: String(item.id), label: `${item.item_name ?? '未命名物品'} · ${item.location ?? '地点待补'}`, description: '可进入人工核验' }))
      nextOptions.inspectionId = [...new Map(records('hygiene').map((item) => [String(item.inspection_id), { value: String(item.inspection_id), label: `${item.location ?? '检查位置'} · 规则分 ${item.deterministic_score ?? '—'}`, description: '来自正式检查证据' }])).values()]
      nextOptions.assigneeId = [...new Map(records('hygiene').filter((item) => item.assignee_id).map((item) => [String(item.assignee_id), { value: String(item.assignee_id), label: String(item.assignee_name ?? '整改责任人'), description: '当前租户责任人' }])).values()]
      nextOptions.eventId = records('safety').filter((item) => String(item.status).toUpperCase() === 'PENDING_CONFIRMATION').map((item) => ({ value: String(item.id), label: `${item.building_name ?? '宿舍楼'} · ${item.room_number ?? '公共区'} · ${item.event_type ?? '安全事件'}`, description: '等待现场确认' }))
      nextOptions.visitorApplicationId = records('visitors').filter((item) => String(item.status).toUpperCase() === 'PENDING').map((item) => ({ value: String(item.id), label: `${item.visitor_name ?? '访客'} · ${item.purpose ?? '来访申请'}`, description: '等待人工核验' }))
      const assetOptions = new Map<string, ResourceOption>()
      const readingOptions: ResourceOption[] = []
      for (const item of records('energy').filter((row) => String(row.quality).toLowerCase() === 'valid')) {
        const assetId = String(item.asset_id)
        if (!assetOptions.has(assetId)) assetOptions.set(assetId, { value: assetId, label: `${item.asset_name ?? '设备资产'} · ${item.asset_code ?? ''}`, description: '有质量合格读数' })
        readingOptions.push({ value: String(item.id), label: `${item.asset_name ?? '设备'} · ${item.value ?? '—'} ${item.unit ?? ''} · ${localDateTime(item.observed_at).replace('T', ' ')}`, description: '质量合格计量记录' })
      }
      nextOptions.assetId = [...assetOptions.values()]
      nextOptions.readingIds = readingOptions
      if (user?.id) nextOptions.claimerId = [{ value: user.id, label: `${user.name}（当前登录人）`, description: '使用当前身份发起人工核验' }]
      setResourceOptions(nextOptions)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '白泽工作台加载失败')
    } finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const requested = searchParams.get('skill')
    const template = TEMPLATES.find((item) => item.skillId === requested)
    const voiceCommand = searchParams.get('voice')
    if (template) {
      const nextParams = { ...template.params }
      const encodedParams = searchParams.get('params')
      if (encodedParams) {
        try {
          const candidate = JSON.parse(encodedParams) as Record<string, unknown>
          for (const field of template.fields) {
            if (Object.prototype.hasOwnProperty.call(candidate, field.key)) nextParams[field.key] = candidate[field.key]
          }
        } catch {
          // Ignore malformed page prefill and retain the safe business template defaults.
        }
      }
      setSelectedTemplate(template)
      setParams(nextParams)
      setCommand(voiceCommand || `请执行：${template.title}`)
    } else if (voiceCommand) {
      setCommand(voiceCommand)
    }
  }, [])

  useEffect(() => {
    setParams((current) => {
      const next = { ...current }
      let changed = false
      for (const field of selectedTemplate.fields) {
        const options = resourceOptions[field.key] ?? field.options ?? []
        if (field.type === 'select' && !next[field.key] && options[0]) { next[field.key] = options[0].value; changed = true }
        if (field.type === 'multi-select' && (!Array.isArray(next[field.key]) || (next[field.key] as unknown[]).length === 0) && options.length >= 3) { next[field.key] = options.slice(0, 3).map((option) => option.value); changed = true }
      }
      if (selectedTemplate.skillId === 'lost_found_claim' && !next.claimerId && user?.id) { next.claimerId = user.id; changed = true }
      return changed ? next : current
    })
  }, [resourceOptions, selectedTemplate, user?.id])

  function fieldOptions(field: TemplateField): ResourceOption[] {
    return resourceOptions[field.key] ?? field.options ?? []
  }
  const selectedSkill = useMemo(() => skills.find((item) => item.id === selectedTemplate.skillId || item.runtimeAliases.includes(selectedTemplate.skillId)), [selectedTemplate, skills])
  const avatarMood: BaizeMood = assistantLoading ? 'busy' : activeTask?.status === 'verified' ? 'success' : readiness?.executionReady ? 'calm' : 'offline'
  const replyBorder = assistantReply?.kind === 'answer' ? 'border-emerald-200' : assistantReply?.kind === 'dispatch' ? 'border-indigo-200' : 'border-amber-200'

  function wakeBaize() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setError('当前浏览器未开放语音唤醒能力；可以继续使用文字指令。'); return }
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) { setCommand(transcript); setError(null) }
    }
    recognition.onerror = () => { setListening(false); setError('语音没有被清晰识别，请再说一次。') }
    recognition.onend = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  function normalizedParams(): Record<string, unknown> {
    const output = { ...params }
    for (const field of selectedTemplate.fields) {
      const value = output[field.key]
      if (field.type === 'list' && typeof value === 'string') output[field.key] = value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)
      if (field.type === 'datetime' && typeof value === 'string' && value) output[field.key] = new Date(value).toISOString()
      if (field.type === 'number' && typeof value === 'string') output[field.key] = Number(value)
    }
    return output
  }

  async function askBaize(mode: 'auto' | 'ask' | 'dispatch' = 'auto', messageOverride?: string, skillId?: string, businessParams?: Record<string, unknown>) {
    const message = (messageOverride ?? command).trim(); if (!message || requestInFlight.current) return
    requestInFlight.current = true
    setAssistantLoading(true); setError(null); setFailedMessage(null); setStreamInterrupted(false); setStreamingText(''); setStreamPhase('规划中')
    let partial = ''
    let optimistic = false
    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: mode === 'dispatch' ? 'application/json' : 'text/event-stream' },
        body: JSON.stringify({ message, mode, skillId, params: businessParams, conversationId: activeConversationId.current ?? undefined }),
      })
      if (!response.ok) { const json = await response.json(); throw new Error(json.error ?? '白泽分辨失败') }
      let data: BaizePayload
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        optimistic = true
        setConversationHistory((current) => [...current, { role: 'user', content: message }])
        let received: BaizePayload | null = null
        await readBaizeStream(response, ({ event, data: frame }) => {
          if (event === 'conversation' && typeof frame.conversationId === 'string') { activeConversationId.current = frame.conversationId; setConversationId(frame.conversationId) }
          if (event === 'phase') setStreamPhase(String(frame.state ?? '处理中'))
          if (event === 'delta') { partial += String(frame.text ?? ''); setStreamingText(partial); setStreamPhase('输入中') }
          if (event === 'done') received = frame.data as unknown as BaizePayload
        })
        if (!received) throw new Error('回复中断，请重试')
        data = received
        setStreamingText(''); setStreamPhase('')
      } else {
        const json = await response.json(); if (!json.success) throw new Error(json.error ?? '白泽分辨失败')
        data = json.data as BaizePayload
      }
      setAssistantReply(data); setRouting(data.routing ?? null); setSources(data.sources ?? []); if (data.task) setActiveTask(data.task)
      if (data.conversationId) { activeConversationId.current = data.conversationId; setConversationId(data.conversationId) }
      if (data.kind !== 'dispatch') {
        setConversationHistory((current) => [...current, ...(!optimistic ? [{ role: 'user' as const, content: message }] : []), { role: 'assistant' as const, content: data.message }])
        setCommand((current) => current.trim() === message ? '' : current)
      }
      await refreshConversations()
      if (data.task) await load()
    } catch (requestError) {
      if (partial) { setStreamingText(partial); setStreamInterrupted(true) }
      setStreamPhase(''); setFailedMessage(message)
      setError(requestError instanceof Error ? requestError.message : '白泽请求失败')
    } finally { requestInFlight.current = false; setAssistantLoading(false) }
  }

  async function decide(action: 'confirm' | 'reject') {
    if (!activeTask) return
    setDeciding(true); setError(null)
    try {
      const response = await fetch(`/api/ai/tasks/${activeTask.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'confirm' ? '用户已核对真实执行预览并确认' : '用户拒绝执行' }) })
      const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.error ?? '审批失败')
      setActiveTask(json.data); setAssistantReply({ kind: 'dispatch', message: action === 'confirm' ? '缰绳已交，分灵体完成真实业务执行后，我会把结果逐一收回并向你汇报。' : '我已收回所有光路，没有发生业务写入。', routing: routing ?? { intent: '人机协同裁决', confidence: 1, priority: 'normal', coordinator: { id: 'human', name: '人工裁决', avatar: '👤' }, shards: [], policy: action === 'confirm' ? 'APPROVAL_REQUIRED' : 'CLARIFICATION_REQUIRED' }, sources: [], suggestions: [] }); await load()
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : '审批失败') } finally { setDeciding(false) }
  }

  function chooseTemplate(template: Template) { setSelectedTemplate(template); setCommand(`请执行：${template.title}`); setParams({ ...template.params }); setError(null) }
  function updateField(field: TemplateField, value: unknown) { setParams((current) => ({ ...current, [field.key]: value })) }

  return (
    <MainLayout>
      <div className="space-y-5 pb-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_72%_18%,rgba(89,211,255,0.18),transparent_30%),linear-gradient(135deg,#07111f,#101a31_62%,#121827)] px-5 py-6 text-white shadow-2xl shadow-slate-900/15 md:px-8"><div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(94,234,212,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(94,234,212,0.08)_1px,transparent_1px)] [background-size:32px_32px]" /><div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_230px]"><div><div className="mb-3 flex flex-wrap items-center gap-2"><Badge className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">白泽总调度</Badge><Badge variant="outline" className="border-white/15 text-slate-300"><ShieldCheck className="mr-1 h-3 w-3" />权限和审计已接管</Badge></div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">通天理，晓人事，知冷热</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">白泽会先读取真实租户数据，再分诊、分发、审批、执行和归整汇报。页面只需要自然语言与业务表单，不要求用户填写代码。</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">主脑 {routing?.coordinator.name ?? '等待指令'}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">状态 {assistantLoading ? '正在分辨' : avatarMood === 'offline' ? '后端未就绪' : '宁静待命'}</span></div></div><div className="flex justify-center lg:justify-end"><BaizeAvatar mood={avatarMood} size={210} showThreads={Boolean(routing?.shards.length && routing.shards.length > 1)} threadCount={Math.min(3, routing?.shards.length ?? 0)} /></div></div></section>

        <ReadinessBanner readiness={readiness} />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-4"><Card className="border-cyan-100 shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-5 w-5 text-cyan-600" />和白泽说话</CardTitle><p className="text-xs text-gray-500">可以问实时业务情况，也可以交给它生成受控执行方案。</p></CardHeader><CardContent className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3" aria-label="历史会话">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium text-slate-700">历史会话<button type="button" className="rounded border border-sky-200 px-2 py-1 text-xs text-sky-700 sm:hidden" aria-expanded={historyOpen} aria-controls="mobile-conversations" onClick={() => setHistoryOpen(true)}>查看历史</button></span><button type="button" disabled={assistantLoading} onClick={() => { void newConversation().catch((error: Error) => setError(error.message)) }} className="text-xs text-sky-700 hover:underline disabled:opacity-50">＋ 新建会话</button></div>
                {historyOpen && <button type="button" aria-label="关闭历史会话" className="fixed inset-0 z-40 bg-slate-950/40 sm:hidden" onClick={() => setHistoryOpen(false)} />}
                <div id="mobile-conversations" className={`${historyOpen ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl bg-white p-4 shadow-2xl' : 'hidden'} mt-2 gap-2 overflow-auto pb-1 sm:static sm:flex sm:max-h-40 sm:flex-row sm:rounded-none sm:p-0 sm:shadow-none xl:flex-col`} role="list">
                  <button type="button" className="mb-2 self-end text-sm text-sky-700 sm:hidden" onClick={() => setHistoryOpen(false)}>关闭</button>
                  {conversations.length === 0 && <span className="text-xs text-slate-500">还没有保存的会话。发送消息即可自动创建。</span>}
                  {conversations.map((item) => <div key={item.id} role="listitem" className={`flex min-w-40 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${conversationId === item.id ? 'border-sky-300 bg-sky-50' : 'border-slate-100'}`}>
                    <button type="button" disabled={assistantLoading} onClick={() => { void openConversation(item.id).catch((error: Error) => setError(error.message)) }} className="min-w-0 flex-1 truncate text-left text-slate-700">{item.title}</button>
                    <button type="button" title="重命名会话" aria-label={`重命名${item.title}`} onClick={() => { void renameConversation(item).catch((error: Error) => setError(error.message)) }} className="text-sky-700">编辑</button>
                    <button type="button" title="删除会话" aria-label={`删除${item.title}`} onClick={() => { void deleteConversation(item).catch((error: Error) => setError(error.message)) }} className="text-rose-600">删除</button>
                  </div>)}
                </div>
              </div>
              {conversationHistory.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-600">本次对话</span>
                    <button type="button" disabled={assistantLoading} onClick={() => { void newConversation().catch((error: Error) => setError(error.message)) }} className="text-xs text-sky-700 hover:underline disabled:opacity-50">开启新对话</button>
                  </div>
                  <div ref={conversationLogRef} role="log" aria-label="对白泽的对话记录" className="max-h-52 space-y-2 overflow-y-auto">
                    {conversationHistory.map((turn, index) => (
                      <div key={index} className={turn.role === 'user' ? 'ml-2 break-words rounded-xl bg-sky-100 px-3 py-2 text-sm text-sky-950 sm:ml-8' : 'mr-2 break-words rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm sm:mr-8'}>
                        <span className="mr-2 font-semibold">{turn.role === 'user' ? '我' : '白泽'}</span><BaizeText text={turn.content} />
                      </div>
                    ))}
                  </div>
                  {(streamingText || streamPhase) && <div className="mr-2 break-words rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm sm:mr-8" aria-live="polite">白泽 · {streamPhase && <span className="text-sky-700">{streamPhase}… </span>}<BaizeText text={streamingText} />{streamInterrupted && <span className="text-rose-700">回复中断，请重试。</span>}</div>}
                </div>
              )}
              <Textarea value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void askBaize('ask') } }} rows={3} placeholder="例如：查询待处理报修，或报修派单并通知学生" /><div className="flex flex-wrap gap-2">{QUICK_QUESTIONS.map((question) => <button key={question} type="button" onClick={() => { setCommand(question); void askBaize('ask', question) }} disabled={assistantLoading} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800">{question}</button>)}</div>{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{failedMessage && <button type="button" className="ml-2 underline" onClick={() => { void askBaize('ask', failedMessage) }}>重试</button>}</div>}<div className="flex flex-wrap gap-2"><Button onClick={() => void askBaize('ask')} disabled={assistantLoading || !command.trim()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />{assistantLoading ? '白泽正在思考…' : '向白泽求证'}</Button><Button onClick={wakeBaize} disabled={assistantLoading} variant="outline" className={listening ? 'border-rose-300 bg-rose-50 text-rose-700' : ''}><Mic className="mr-2 h-4 w-4" />{listening ? '正在聆听…' : '语音唤醒白泽'}</Button><Button onClick={() => void askBaize('dispatch', undefined, selectedTemplate.skillId, normalizedParams())} disabled={assistantLoading || !selectedSkill?.availableToCurrentUser}><Send className="mr-2 h-4 w-4" />生成受控调度方案</Button><Button variant="ghost" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>{activeTask && <Button asChild variant="outline"><Link href={`/ai-agents/runtime?task=${activeTask.id}`}><Expand className="mr-2 h-4 w-4" />全屏运行星图</Link></Button>}</div></CardContent></Card>

          {assistantReply && <Card className={replyBorder}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BaizeAvatar mood={assistantReply.kind === 'dispatch' ? 'busy' : assistantReply.kind === 'answer' ? 'success' : 'calm'} size={42} />白泽汇报<Badge variant="outline">{assistantReply.kind === 'answer' ? assistantReply.sources.length > 0 ? '有据可查' : '自然对话' : assistantReply.kind === 'dispatch' ? '已形成方案' : '需要补充'}</Badge>{assistantReply.model && <Badge className="border border-violet-200 bg-violet-50 text-violet-700">DeepSeek 实时生成 · {assistantReply.model.latencyMs}ms · {assistantReply.model.totalTokens} Token</Badge> }</CardTitle></CardHeader><CardContent><BaizeText text={assistantReply.message} />{assistantReply.answer && <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-gray-50 p-2"><p className="text-[11px] text-gray-500">总记录</p><p className="mt-1 text-lg font-semibold">{assistantReply.answer.total}</p></div><div className="rounded-lg bg-amber-50 p-2"><p className="text-[11px] text-amber-700">待处理</p><p className="mt-1 text-lg font-semibold text-amber-800">{assistantReply.answer.pending}</p></div><div className="rounded-lg bg-emerald-50 p-2"><p className="text-[11px] text-emerald-700">已完成或可用</p><p className="mt-1 text-lg font-semibold text-emerald-800">{assistantReply.answer.completed}</p></div></div>}<button type="button" onClick={() => { void navigator.clipboard.writeText(assistantReply.message).catch(() => setError('复制失败，请手动选择文本。')) }} className="mt-3 text-xs text-sky-700 hover:underline">复制回复</button>{assistantReply.application && <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-slate-700"><strong>报修申请草稿</strong><div>故障：{assistantReply.application.description ?? '待补充'}</div><div>地点：{assistantReply.application.location ?? '待补充'}</div><Link className="mt-2 inline-block text-sky-700 underline" href={assistantReply.application.href}>前往表单核对（不会自动提交）</Link></div>}{assistantReply.suggestions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{assistantReply.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setCommand(suggestion)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-cyan-300 hover:text-cyan-700">{suggestion}</button>)}</div>}{sources.length > 0 && <div className="mt-3 space-y-2">{sources.map((source) => <div key={source.label} className="flex items-center gap-2 rounded-lg border bg-gray-50 p-2 text-xs text-gray-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{source.label} · 已核对 {source.recordCount ?? 0} 条真实记录</div>)}</div>}</CardContent></Card>}

          {activeTask || routing ? <BaizeConstellation task={activeTask} routing={routing} /> : <Card className="border-dashed border-slate-300 bg-slate-50"><CardContent className="flex min-h-36 items-center justify-center gap-3 text-sm text-slate-500"><BaizeAvatar mood="calm" size={54} />白泽星系已就绪，等待你的第一条指令</CardContent></Card>}
          {activeTask ? <TaskDetail task={activeTask} deciding={deciding} onDecision={(action) => void decide(action)} /> : <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center text-gray-400"><Sparkles className="mb-3 h-10 w-10 text-cyan-300" /><p>提出问题或下达指令后，白泽会在这里展示分诊、分灵体和完成证据。</p></CardContent></Card>}
        </div>

        <div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">八大业务能力</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{TEMPLATES.map((template) => <button key={template.skillId} type="button" onClick={() => chooseTemplate(template)} className={`rounded-xl border p-3 text-left transition ${selectedTemplate.skillId === template.skillId ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-cyan-200 hover:bg-gray-50'}`}><div className="flex items-center justify-between gap-2"><p className="font-medium text-gray-900">{template.title}</p><Badge variant="outline">受控</Badge></div><p className="mt-1 text-xs leading-5 text-gray-500">{template.description}</p></button>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">{selectedTemplate.title} · 业务信息</CardTitle><p className="text-xs text-gray-500">只选择业务记录和填写业务意图，白泽负责内部校验、拆解与执行治理。</p></CardHeader><CardContent className="space-y-4">{selectedTemplate.fields.map((field) => { const options = fieldOptions(field); const selectedValues = Array.isArray(params[field.key]) ? params[field.key] as unknown[] : []; return <div key={field.key} className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-800">{field.label}</p>{field.type === 'boolean' && <Switch checked={params[field.key] === true} onCheckedChange={(checked) => updateField(field, checked)} />}</div>{field.type === 'textarea' && <Textarea rows={3} value={String(params[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} placeholder={field.placeholder} />}{field.type === 'list' && <Textarea rows={3} value={Array.isArray(params[field.key]) ? (params[field.key] as unknown[]).join('\n') : String(params[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} placeholder={field.placeholder} />}{field.type === 'multi-select' && <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2">{options.length === 0 ? <p className="p-2 text-xs text-slate-400">暂未找到满足质量要求的读数</p> : options.map((option) => { const checked = selectedValues.includes(option.value); return <button key={option.value} type="button" onClick={() => updateField(field, checked ? selectedValues.filter((value) => value !== option.value) : [...selectedValues, option.value])} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${checked ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-transparent bg-white text-slate-600 hover:border-slate-200'}`}><span className="min-w-0 truncate">{option.label}</span><span className={`ml-2 h-3.5 w-3.5 shrink-0 rounded-full border ${checked ? 'border-cyan-600 bg-cyan-500 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300'}`} /></button> })}</div>}{field.type === 'select' && <Select value={String(params[field.key] ?? options[0]?.value ?? '')} onValueChange={(value) => updateField(field, value)}><SelectTrigger className="w-full"><SelectValue placeholder="请选择业务记录" /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}><span>{option.label}</span></SelectItem>)}</SelectContent></Select>}{field.type === 'text' && options.length === 0 && <Input value={String(params[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} placeholder={field.placeholder} />}{field.type === 'number' && <Input type="number" step={field.key === 'confidence' ? '0.1' : '1'} value={String(params[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} />}{field.type === 'datetime' && <Input type="datetime-local" value={localDateTime(params[field.key])} onChange={(event) => updateField(field, event.target.value)} />}</div> })}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">最近任务</CardTitle></CardHeader><CardContent className="space-y-2">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : tasks.length === 0 ? <p className="text-sm text-gray-400">暂无任务</p> : tasks.slice(0, 8).map((task) => <button key={task.id} type="button" onClick={() => setActiveTask(task)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 p-2 text-left hover:bg-gray-50"><div className="min-w-0"><p className="truncate text-sm font-medium">{task.title.replace(/\s+task$/i, '')}</p><p className="truncate text-xs text-gray-400">{skillDisplayName(task.skill.key ?? task.skill.id)}</p></div><TaskStatusBadge task={task} /></button>)}</CardContent></Card>
        </div></div>
      </div>
    </MainLayout>
  )
}

