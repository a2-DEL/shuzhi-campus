'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  Home,
  LayoutDashboard,
  LucideIcon,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Puzzle,
  Search,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  ThumbsUp,
  UserPlus,
  Users,
  Wrench,
  Zap,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, useSidebarStore } from '@/stores'
import {
  filterMenuByRole,
  isMenuItemActive,
  menuItems,
  MENU_SECTION_LABELS,
  type MenuItem,
  type MenuSection,
} from '@/lib/menu-config'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const iconMap: Record<string, LucideIcon> = {
  BarChart3, Bell, Bot, BrainCircuit, Building, Calendar, Cpu, FileText, GitBranch,
  Globe, GraduationCap, Home, LayoutDashboard, MessageSquare, Monitor, Network,
  Package, Puzzle, Search, Settings, Shield, Sparkles, Terminal, ThumbsUp,
  UserPlus, Users, Wrench, Zap, BookOpen,
}
const SECTION_ORDER: MenuSection[] = ['baize', 'business', 'intelligence', 'platform']

function NavItem({ item, collapsed, pathname }: { item: MenuItem; collapsed: boolean; pathname: string }) {
  const active = isMenuItemActive(item, pathname)
  const Icon = iconMap[item.icon] ?? LayoutDashboard
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-11 items-center rounded-xl border px-2.5 py-2 transition-all duration-200',
        collapsed ? 'justify-center' : 'gap-3',
        active
          ? 'border-cyan-300/25 bg-gradient-to-r from-cyan-300/14 via-blue-400/10 to-violet-400/8 text-white shadow-[0_8px_26px_rgba(6,182,212,0.08)]'
          : 'border-transparent text-slate-400 hover:border-white/[0.06] hover:bg-white/[0.045] hover:text-slate-100',
      )}
    >
      {active && <span className="absolute -left-0.5 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-cyan-300 to-blue-500 shadow-[0_0_10px_rgba(103,232,249,0.75)]" />}
      <span className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition',
        active
          ? 'border-cyan-200/20 bg-cyan-200/10 text-cyan-200'
          : 'border-white/[0.05] bg-white/[0.025] text-slate-500 group-hover:border-white/10 group-hover:text-slate-300',
      )}>
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium tracking-[0.01em]">{item.title}</span>
            {item.badge && (
              <span className={cn(
                'ml-auto rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em]',
                item.badge === 'LIVE'
                  ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-300'
                  : 'border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200',
              )}>{item.badge}</span>
            )}
          </span>
          {active && item.description && <span className="mt-0.5 block truncate text-[10px] text-cyan-100/45">{item.description}</span>}
        </span>
      )}
      {collapsed && item.badge === 'LIVE' && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />}
    </Link>
  )

  if (!collapsed) return link
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right" className="max-w-64"><p className="font-medium">{item.title}</p>{item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}</TooltipContent></Tooltip>
}

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebarStore()
  const user = useAuthStore((state) => state.user)
  const visibleItems = useMemo(() => user ? filterMenuByRole(menuItems, user.role) : [], [user])
  const sections = useMemo(() => SECTION_ORDER.map((section) => ({
    section,
    items: visibleItems.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0), [visibleItems])

  return (
    <TooltipProvider delayDuration={80}>
      <aside className={cn(
        'relative z-40 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#07111f] text-white transition-[width] duration-300',
        collapsed ? 'w-[76px]' : 'w-[284px]',
      )}>
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_15%_8%,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_85%_32%,rgba(99,102,241,0.1),transparent_26%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(125,211,252,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />

        <div className={cn('relative flex h-[78px] shrink-0 items-center border-b border-white/[0.07]', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/ai-agents" className="flex min-w-0 items-center gap-3" aria-label="进入数智星图白泽智能体中枢">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-gradient-to-br from-cyan-200/20 via-blue-500/15 to-violet-500/20 shadow-[0_0_28px_rgba(34,211,238,0.13)]">
              <Sparkles className="h-5 w-5 text-cyan-100" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#07111f] bg-emerald-400" />
            </span>
            {!collapsed && <span className="min-w-0"><span className="block truncate text-[15px] font-semibold tracking-[0.12em] text-white">数智星图</span><span className="mt-0.5 block text-[9px] font-medium tracking-[0.2em] text-cyan-200/55">BAIZE AGENT OS</span></span>}
          </Link>
        </div>

        <div className={cn('relative shrink-0 border-b border-white/[0.06]', collapsed ? 'p-2.5' : 'p-3')}>
          <Button asChild className={cn(
            'h-10 border border-cyan-200/20 bg-gradient-to-r from-cyan-400/20 to-blue-500/20 text-cyan-50 shadow-none hover:from-cyan-400/30 hover:to-blue-500/30',
            collapsed ? 'w-full px-0' : 'w-full justify-start rounded-xl',
          )}>
            <Link href="/ai-agents/conversation"><Sparkles className={cn('h-4 w-4', !collapsed && 'mr-2')} />{!collapsed && <span>向白泽下达指令</span>}</Link>
          </Button>
        </div>

        <nav className="relative min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-color:rgba(148,163,184,0.25)_transparent]" aria-label="企业功能导航">
          <div className="space-y-5">
            {sections.map(({ section, items }) => (
              <section key={section} aria-label={MENU_SECTION_LABELS[section]}>
                {collapsed ? <div className="mx-2 mb-2 h-px bg-white/[0.07]" /> : <div className="mb-2 flex items-center gap-2 px-2"><span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{MENU_SECTION_LABELS[section]}</span><span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" /></div>}
                <div className="space-y-1">{items.map((item) => <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />)}</div>
              </section>
            ))}
          </div>
        </nav>

        <div className="relative shrink-0 border-t border-white/[0.07] p-2.5">
          {!collapsed && <div className="mb-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.035] px-3 py-2.5"><div className="flex items-center justify-between"><span className="text-[10px] font-medium text-slate-400">受控执行链</span><span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />运行中</span></div><p className="mt-1 text-[9px] tracking-[0.08em] text-slate-600">ENTERPRISE PROFESSIONAL</p></div>}
          <Button variant="ghost" size="sm" onClick={toggle} className="w-full justify-center text-slate-500 hover:bg-white/[0.05] hover:text-slate-200" aria-label={collapsed ? '展开导航' : '收起导航'}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="mr-2 h-4 w-4" /><span className="text-xs">收起工作区</span></>}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
