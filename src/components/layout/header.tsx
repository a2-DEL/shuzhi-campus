'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ChevronRight, Command, LogOut, Settings, ShieldCheck, Sparkles, User } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { ROLE_LABELS } from '@/types'
import { findMenuItem, MENU_SECTION_LABELS } from '@/lib/menu-config'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Header() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [currentTime, setCurrentTime] = useState('')
  const [executionReady, setExecutionReady] = useState<boolean | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const currentItem = useMemo(() => findMenuItem(pathname), [pathname])

  useEffect(() => {
    const update = () => setCurrentTime(new Date().toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }))
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    async function loadRuntimeState() {
      try {
        const [systemResponse, taskResponse] = await Promise.all([
          fetch('/api/ai/system', { cache: 'no-store' }),
          fetch('/api/ai/tasks?status=awaiting_confirmation&page_size=1', { cache: 'no-store' }),
        ])
        const [system, tasks] = await Promise.all([systemResponse.json(), taskResponse.json()])
        if (!active) return
        setExecutionReady(Boolean(systemResponse.ok && system.success && system.data?.executionReady))
        setPendingApprovals(taskResponse.ok && tasks.success ? Number(tasks.data?.pagination?.total ?? 0) : 0)
      } catch {
        if (active) setExecutionReady(false)
      }
    }
    void loadRuntimeState()
    const timer = window.setInterval(loadRuntimeState, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [pathname])

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-slate-200/70 bg-white/88 px-4 backdrop-blur-xl md:px-6">
      <div className="min-w-0 pl-10 lg:pl-0">
        <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.08em] text-slate-400">
          <span>数智星图</span><ChevronRight className="h-3 w-3" />
          <span>{currentItem ? MENU_SECTION_LABELS[currentItem.section] : '企业工作区'}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-slate-950">{currentItem?.title ?? '企业工作区'}</h1>
          {currentItem?.badge && <Badge variant="outline" className="h-5 border-cyan-200 bg-cyan-50 px-1.5 text-[9px] font-semibold text-cyan-700">{currentItem.badge}</Badge>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 xl:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${executionReady === null ? 'bg-slate-300' : executionReady ? 'bg-emerald-500 shadow-[0_0_7px_rgba(16,185,129,0.55)]' : 'bg-rose-500'}`} />
          <span className="text-[11px] font-medium text-slate-600">{executionReady === null ? '核验执行链' : executionReady ? '业务执行链在线' : '执行链需检查'}</span>
        </div>
        <span className="hidden text-[11px] text-slate-400 2xl:inline">{currentTime}</span>

        <Button asChild size="sm" className="hidden h-9 rounded-xl bg-slate-950 text-white shadow-sm hover:bg-slate-800 lg:flex">
          <Link href="/ai-agents/conversation"><Command className="mr-2 h-3.5 w-3.5" />白泽指令</Link>
        </Button>

        <Button asChild variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <Link href="/ai-agents/execution" aria-label={`待人工裁决 ${pendingApprovals} 项`}>
            <Bell className="h-[18px] w-[18px]" />
            {pendingApprovals > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">{pendingApprovals > 9 ? '9+' : pendingApprovals}</span>}
          </Link>
        </Button>

        <div className="mx-0.5 hidden h-7 w-px bg-slate-200 md:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 gap-2 rounded-xl px-1.5 hover:bg-slate-100 md:px-2">
              <Avatar className="h-8 w-8 border border-cyan-100 shadow-sm">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="bg-gradient-to-br from-slate-900 to-blue-900 text-xs font-semibold text-cyan-100">{user?.name?.slice(0, 1) ?? '智'}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 text-left xl:block"><span className="block max-w-32 truncate text-xs font-semibold text-slate-800">{user?.name}</span><span className="mt-0.5 block max-w-36 truncate text-[10px] text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</span></span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
            <DropdownMenuLabel className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900"><Sparkles className="h-3.5 w-3.5 text-cyan-600" />{user?.name}</div>
              <p className="mt-1 text-[11px] font-normal text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</p>
              <p className="mt-0.5 text-[10px] font-normal text-slate-400">{user?.department || '数智星图企业租户'} · {user?.user_id}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/profile')} className="rounded-lg"><User className="mr-2 h-4 w-4" />个人中心</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/ai-agents/my-team')} className="rounded-lg"><ShieldCheck className="mr-2 h-4 w-4" />我的 Agent 编队</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')} className="rounded-lg"><Settings className="mr-2 h-4 w-4" />平台设置</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="rounded-lg text-rose-600 focus:text-rose-700"><LogOut className="mr-2 h-4 w-4" />安全退出</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
