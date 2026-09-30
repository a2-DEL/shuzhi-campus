'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, Download, Eye, FileCheck2, Fingerprint, Loader2, RefreshCw, ScrollText, Send, ShieldCheck, Wrench, XCircle } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { backendLabel, nodeStateLabel, skillDisplayName, taskStateLabel } from '@/lib/ai/presentation'

interface GovernanceReport {
  backend: 'development_memory' | 'supabase' | 'postgres'
  persistent: boolean
  taskCount: number
  summary: { effects: number; verifiedEffects: number; auditEvents: number; outboxPending: number; toolFailures: number }
  effects: Array<{ id: string; taskId: string; nodeId: string; effectType: string; targetType?: string; targetId?: string | null; status: string; verification: Record<string, unknown>; createdAt: string; verifiedAt?: string }>
  auditEvents: Array<{ id: string; taskId?: string; nodeId?: string; actorType: string; actorId: string; eventType: string; beforeState?: string; afterState?: string; metadata: Record<string, unknown>; createdAt: string }>
  outboxEvents: Array<{ id: string; taskId: string; eventType: string; status: string; attemptCount: number; lastError?: string; createdAt: string; publishedAt?: string }>
  toolInvocations: Array<{ id: string; taskId: string; nodeId: string; skillId: string; status: string; attempt: number; error?: string; createdAt: string; completedAt?: string }>
}
type GovernanceTab = 'effects' | 'audit' | 'outbox' | 'tools'

type GovernanceRow = GovernanceReport['effects'][number] | GovernanceReport['auditEvents'][number] | GovernanceReport['outboxEvents'][number] | GovernanceReport['toolInvocations'][number]

function statusLabel(status: string): string {
  if (['VERIFIED', 'SUCCEEDED', 'PUBLISHED', 'RECORDED_LOCAL', 'COMPLETED'].includes(status)) return '已完成'
  if (['FAILED', 'DEAD_LETTER'].includes(status)) return '处理失败'
  if (['PENDING', 'PREPARED', 'PUBLISHING', 'RUNNING'].includes(status)) return '处理中'
  return nodeStateLabel(status)
}
function statusStyle(status: string): string {
  if (['VERIFIED', 'SUCCEEDED', 'PUBLISHED', 'RECORDED_LOCAL', 'COMPLETED'].includes(status)) return 'bg-emerald-100 text-emerald-700'
  if (['FAILED', 'DEAD_LETTER'].includes(status)) return 'bg-red-100 text-red-700'
  if (['PENDING', 'PREPARED', 'PUBLISHING', 'RUNNING'].includes(status)) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}
function rowTitle(row: GovernanceRow, tab: GovernanceTab): string {
  if (tab === 'effects' && 'effectType' in row) return skillDisplayName(row.effectType)
  if (tab === 'tools' && 'skillId' in row) return skillDisplayName(row.skillId)
  if (tab === 'outbox') return '业务消息投递'
  if ('afterState' in row && row.afterState) return taskStateLabel(row.afterState)
  return '运行治理记录'
}
function rowStatus(row: GovernanceRow): string {
  if ('status' in row && typeof row.status === 'string') return row.status
  if ('afterState' in row && row.afterState) return row.afterState
  return 'EVENT'
}
function detailFacts(row: GovernanceRow, tab: GovernanceTab): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []
  facts.push({ label: '记录类型', value: tab === 'effects' ? '真实业务效果' : tab === 'audit' ? '任务状态审计' : tab === 'outbox' ? '可靠消息投递' : '受控工具调用' })
  facts.push({ label: '处理状态', value: statusLabel(rowStatus(row)) })
  if ('attempt' in row) facts.push({ label: '执行尝试', value: `第 ${row.attempt} 次` })
  if ('attemptCount' in row) facts.push({ label: '重试次数', value: `${row.attemptCount} 次` })
  if ('verifiedAt' in row && row.verifiedAt) facts.push({ label: '完成验证', value: new Date(row.verifiedAt).toLocaleString('zh-CN') })
  if ('publishedAt' in row && row.publishedAt) facts.push({ label: '消息送达', value: new Date(row.publishedAt).toLocaleString('zh-CN') })
  if ('beforeState' in row && row.beforeState) facts.push({ label: '流转之前', value: taskStateLabel(row.beforeState) })
  if ('afterState' in row && row.afterState) facts.push({ label: '流转之后', value: taskStateLabel(row.afterState) })
  return facts
}

export default function AiGovernancePage() {
  const [report, setReport] = useState<GovernanceReport | null>(null)
  const [tab, setTab] = useState<GovernanceTab>('effects')
  const [selected, setSelected] = useState<GovernanceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/ai/governance', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? '治理账本加载失败')
      setReport(json.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '治理账本加载失败')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const rows: GovernanceRow[] = useMemo(() => {
    if (!report) return []
    if (tab === 'effects') return report.effects
    if (tab === 'audit') return report.auditEvents
    if (tab === 'outbox') return report.outboxEvents
    return report.toolInvocations
  }, [report, tab])

  function exportReport() {
    if (!report) return
    const header = ['记录类型', '处理状态', '记录时间']
    const data = rows.map((row) => [rowTitle(row, tab), statusLabel(rowStatus(row)), new Date(row.createdAt).toLocaleString('zh-CN')])
    const csv = [header, ...data].map((columns) => columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `白泽治理记录-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <MainLayout>
      <div className="space-y-6 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-950"><ShieldCheck className="h-6 w-6 text-indigo-600" />AI 治理与效果账本</h1><p className="mt-1 text-sm text-gray-500">查看真实业务效果、回读证据、状态审计、可靠消息和工具调用；页面不展示内部代码或模型私有思维链。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download className="mr-2 h-4 w-4" />导出治理清单</Button></div></div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {report && <div className={`rounded-xl border p-4 ${report.persistent ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3"><Database className={`mt-0.5 h-5 w-5 ${report.persistent ? 'text-emerald-700' : 'text-amber-700'}`} /><div><p className="font-semibold">{report.persistent ? '持久治理账本已连接' : '当前为本地临时账本'}</p><p className="mt-1 text-sm opacity-80">数据来源：{backendLabel(report.backend)}。{report.persistent ? '以下记录来自真实数据库，并按租户与任务权限过滤。' : '重启后记录不会保留，业务写入仍保持失败关闭。'}</p></div></div></div>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Fingerprint className="h-4 w-4 text-indigo-600" />业务效果</div><p className="mt-1 text-3xl font-bold">{report?.summary.effects ?? 0}</p><p className="text-xs text-gray-400">幂等留痕</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />回读通过</div><p className="mt-1 text-3xl font-bold text-emerald-700">{report?.summary.verifiedEffects ?? 0}</p><p className="text-xs text-gray-400">写后核验</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><ScrollText className="h-4 w-4 text-blue-600" />审计事件</div><p className="mt-1 text-3xl font-bold text-blue-700">{report?.summary.auditEvents ?? 0}</p><p className="text-xs text-gray-400">状态与操作者留痕</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Send className="h-4 w-4 text-amber-600" />待投递消息</div><p className="mt-1 text-3xl font-bold text-amber-700">{report?.summary.outboxPending ?? 0}</p><p className="text-xs text-gray-400">含失败与死信</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><XCircle className="h-4 w-4 text-red-600" />工具失败</div><p className="mt-1 text-3xl font-bold text-red-700">{report?.summary.toolFailures ?? 0}</p><p className="text-xs text-gray-400">保留重试证据</p></CardContent></Card></div>

        <Card><CardHeader className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5 text-indigo-600" />治理记录</CardTitle><Badge variant="outline">覆盖 {report?.taskCount ?? 0} 个任务</Badge></div><div className="flex flex-wrap gap-2">{([['effects','效果与回读',Fingerprint],['audit','状态审计',ScrollText],['outbox','可靠消息',Send],['tools','工具调用',Wrench]] as const).map(([value,label,Icon]) => <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}><Icon className="mr-1 h-4 w-4" />{label}</Button>)}</div></CardHeader><CardContent>{loading && !report ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">当前作用域暂无此类真实记录</div> : <div className="space-y-2">{rows.map((row) => { const status = rowStatus(row); return <button key={row.id} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/30" onClick={() => setSelected(row)}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-gray-900">{rowTitle(row, tab)}</p><Badge className={statusStyle(status)}>{statusLabel(status)}</Badge></div><p className="mt-1 text-xs text-gray-400">记录已纳入租户治理账本</p></div><div className="flex items-center gap-2 text-xs text-gray-400"><span>{new Date(row.createdAt).toLocaleString('zh-CN')}</span><Eye className="h-4 w-4" /></div></button> })}</div>}</CardContent></Card>

        <Card className="border-blue-200 bg-blue-50/50"><CardContent className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 text-blue-700" /><div><p className="font-semibold text-blue-900">审计边界</p><p className="mt-1 text-sm text-blue-800">记录任务目标、业务输入输出摘要、策略判定、状态迁移、工具结果和业务回读；敏感字段按契约脱敏，不存储或展示模型内部思维链。</p></div></CardContent></Card>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>治理记录详情</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="rounded-2xl border bg-slate-50 p-4"><p className="text-lg font-semibold text-slate-900">{rowTitle(selected, tab)}</p><p className="mt-1 text-sm text-slate-500">记录于 {new Date(selected.createdAt).toLocaleString('zh-CN')}</p></div><div className="grid gap-3 sm:grid-cols-2">{detailFacts(selected, tab).map((fact) => <div key={fact.label} className="rounded-xl border p-3"><p className="text-xs text-gray-400">{fact.label}</p><p className="mt-1 text-sm font-medium text-gray-800">{fact.value}</p></div>)}</div>{'error' in selected && selected.error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{selected.error}</div>}{'lastError' in selected && selected.lastError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{selected.lastError}</div>}<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />记录已通过当前租户权限过滤，内部标识和敏感指纹未在页面展示。</div></div>}</DialogContent></Dialog>
      </div>
    </MainLayout>
  )
}
