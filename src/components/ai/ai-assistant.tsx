'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Command, Mic, Moon, Radio, Volume2, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { BaizeAvatar, type BaizeMood } from './baize-avatar'
import { backendLabel } from '@/lib/ai/presentation'

interface ReadinessSnapshot {
  executionReady?: boolean
  businessPort?: string
  runtimeRepository?: string
  message?: string
}

interface MonitorSnapshot {
  activeCount: number
  totalCount: number
}

interface RecognitionResultLike { [index: number]: { transcript?: string } }
interface RecognitionEventLike { results: { [index: number]: RecognitionResultLike } }
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
}
type RecognitionConstructor = new () => RecognitionLike
type VoiceWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }

/** White Ze: the global coordinator entry and a low-noise desktop companion. */
export function AIAssistant() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [readiness, setReadiness] = useState<ReadinessSnapshot | null>(null)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null)
  const [monitor, setMonitor] = useState<MonitorSnapshot>({ activeCount: 0, totalCount: 0 })

  useEffect(() => {
    let cancelled = false
    fetch('/api/ai/system', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { success?: boolean; data?: ReadinessSnapshot }) => {
        if (!cancelled && payload.success) setReadiness(payload.data ?? null)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [pathname])

  useEffect(() => {
    const browserWindow = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    setVoiceSupported(Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition))
  }, [])

  useEffect(() => {
    let cancelled = false
    const monitorTasks = () => {
      fetch('/api/ai/assistant', { cache: 'no-store' })
        .then((response) => response.json())
        .then((payload: { success?: boolean; data?: { routing?: { shards?: Array<{ state?: string }> }; sources?: Array<{ recordCount?: number }> } }) => {
          if (cancelled || !payload.success) return
          const shards = payload.data?.routing?.shards ?? []
          setMonitor({ activeCount: shards.filter((shard) => ['RUNNING', 'WAITING'].includes(shard.state ?? '')).length, totalCount: payload.data?.sources?.[0]?.recordCount ?? 0 })
        })
        .catch(() => undefined)
    }
    monitorTasks()
    const timer = window.setInterval(monitorTasks, 15_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [pathname])

  const mood = useMemo<BaizeMood>(() => {
    if (focusMode) return 'focus'
    if (listening) return 'alert'
    if (monitor.activeCount > 0 || pathname.startsWith('/ai-agents/execution')) return 'busy'
    if (readiness && !readiness.executionReady) return 'offline'
    return 'calm'
  }, [focusMode, listening, monitor.activeCount, pathname, readiness])

  const startVoice = () => {
    const browserWindow = window as VoiceWindow
    const Constructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition
    if (!Constructor) {
      setVoiceMessage('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3\u8bc6\u522b\uff0c\u672a\u4f1a\u865a\u6784\u5df2\u542c\u5230\u6307\u4ee4')
      return
    }
    const recognition = new Constructor()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      setListening(false)
      if (!transcript) {
        setVoiceMessage('\u6ca1\u6709\u8bc6\u522b\u5230\u6e05\u6670\u6307\u4ee4')
        return
      }
      if (!transcript.includes('\u767d\u6cfd')) {
        setVoiceMessage('\u8bf7\u5148\u547c\u5524\u767d\u6cfd\uff0c\u4f8b\u5982\u201c\u767d\u6cfd\uff0c\u67e5\u8be2\u5f85\u5904\u7406\u62a5\u4fee\u201d')
        return
      }
      const command = transcript.replace(/^.*?\u767d\u6cfd[\uff0c,\u3001 ]*/, '').trim() || transcript
      setVoiceMessage(`\u5df2\u542c\u4ee4\uff1a${command}`)
      setOpen(true)
      router.push(`/ai-agents/conversation?voice=${encodeURIComponent(command)}`)
    }
    recognition.onerror = () => {
      setListening(false)
      setVoiceMessage('\u8bed\u97f3\u8bc6\u522b\u672a\u83b7\u5f97\u6388\u6743\u6216\u5df2\u4e2d\u65ad\uff0c\u8bf7\u91cd\u8bd5')
    }
    recognition.onend = () => setListening(false)
    setVoiceMessage('\u767d\u6cfd\u6b63\u5728\u503e\u542c\uff0c\u8bf7\u8bf4\u51fa\u6307\u4ee4')
    setListening(true)
    try { recognition.start() } catch { setListening(false); setVoiceMessage('\u8bed\u97f3\u8bbe\u5907\u5df2\u88ab\u5360\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5') }
  }

  const openWorkspace = () => {
    setOpen(false)
    router.push('/ai-agents/conversation')
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <section
          className="baize-companion-panel w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/60 bg-slate-950/95 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl"
          role="dialog"
          aria-label={'\u767d\u6cfd\u684c\u9762\u7075\u5ba0'}
        >
          <div className="relative overflow-hidden border-b border-white/10 px-4 pb-4 pt-3">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(101,224,255,0.24),transparent_44%)]" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <BaizeAvatar mood={mood} size={70} showThreads={mood === 'busy'} />
                <div>
                  <p className="text-sm font-semibold tracking-[0.18em] text-cyan-100">{'\u767d\u6cfd'}</p>
                  <p className="mt-1 text-xs text-slate-300">{'\u603b\u8c03\u5ea6\u5b98 \u00b7 \u684c\u9762\u7075\u5ba0'}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{readiness?.businessPort ? backendLabel(readiness.businessPort) : '\u68c0\u6d4b\u4e2d'}</span>
                    <span className="text-slate-600">/</span>
                    <span>{mood === 'focus' ? '\u4e13\u6ce8\u6a21\u5f0f' : '\u4f4e\u6253\u6270\u966a\u4f34'}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label={'\u5173\u95ed\u767d\u6cfd\u9762\u677f'}><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs leading-5 text-slate-300">
              <div className="mb-1 flex items-center gap-2 font-medium text-cyan-100"><Radio className="h-3.5 w-3.5" />{'\u767d\u6cfd\u661f\u7cfb'}</div>
              {readiness?.executionReady ? '\u5df2\u8fde\u63a5\u53d7\u63a7\u4e1a\u52a1\u7f51\u5173\uff0c\u4efb\u52a1\u4f1a\u5148\u9884\u89c8\u3001\u540e\u5ba1\u6279\u3001\u518d\u843d\u5e93\u3002' : (readiness?.message ?? '\u540e\u7aef\u6b63\u5728\u68c0\u6d4b\uff0c\u672a\u5c31\u7eea\u524d\u4e0d\u4f1a\u4f2a\u9020\u4e1a\u52a1\u7ed3\u679c\u3002')}
            </div>
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs leading-5 text-slate-300">
              <div className="flex items-center gap-2 font-medium text-cyan-100"><Activity className="h-3.5 w-3.5" />{monitor.activeCount > 0 ? `\u6b63\u5728\u76d1\u63a7 ${monitor.activeCount} \u4e2a\u4efb\u52a1` : '\u5f53\u524d\u6ca1\u6709\u8fd0\u884c\u4e2d\u4efb\u52a1'}</div>
              <p className="mt-1 text-slate-400">{monitor.totalCount > 0 ? `\u4efb\u52a1\u53f0\u8d26\u5171 ${monitor.totalCount} \u6761\u8bb0\u5f55` : '\u4efb\u52a1\u53f0\u8d26\u6682\u65e0\u8bb0\u5f55'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={openWorkspace} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"><Command className="h-3.5 w-3.5" />{'\u8fdb\u5165\u603b\u8c03\u5ea6'}</button>
              <button type="button" onClick={() => setFocusMode((value) => !value)} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-slate-200 transition hover:bg-white/10"><Moon className="h-3.5 w-3.5" />{focusMode ? '\u6062\u590d\u5b81\u9759' : '\u4e13\u6ce8\u6a21\u5f0f'}</button>
            </div>
            <button type="button" onClick={startVoice} disabled={listening} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-70">
              <span className="flex items-center gap-2">{listening ? <Volume2 className="h-3.5 w-3.5 animate-pulse text-rose-300" /> : <Mic className="h-3.5 w-3.5" />}{listening ? '\u6b63\u5728\u503e\u542c' : '\u58f0\u7eb9\u5524\u9192'}</span>
              <span className={voiceSupported ? 'text-emerald-300' : 'text-slate-500'}>{voiceSupported ? '\u70b9\u51fb\u5524\u9192' : '\u6d4f\u89c8\u5668\u4e0d\u652f\u6301'}</span>
            </button>
            {voiceMessage && <p className="rounded-lg bg-white/5 p-2 text-[11px] leading-4 text-slate-400" aria-live="polite">{voiceMessage}</p>}
            <p className="text-[10px] leading-4 text-slate-500">{'\u767d\u6cfd\u4e0d\u4f1a\u8d8a\u8fc7\u4f60\u7684\u89d2\u8272\u6743\u9650\u3002\u9ad8\u98ce\u9669\u64cd\u4f5c\u5fc5\u987b\u4f60\u5ba1\u6279\uff0c\u6240\u6709\u7ed3\u679c\u90fd\u53ef\u8ffd\u6eaf\u3002'}</p>
          </div>
        </section>
      )}
      <div className="relative">
        <BaizeAvatar mood={mood} size={76} showThreads={mood === 'busy'} interactive onClick={() => setOpen((value) => !value)} />
        {monitor.activeCount > 0 && <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-50 bg-rose-500 px-1 text-[10px] font-bold text-white shadow-lg" aria-label={`${monitor.activeCount} active tasks`}>{monitor.activeCount}</span>}
      </div>
    </div>
  )
}
