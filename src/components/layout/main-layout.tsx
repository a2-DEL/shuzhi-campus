'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Menu, Sparkles, X } from 'lucide-react'
import { useAuthStore, useHydration, useSessionChecked } from '@/stores'
import { Sidebar } from './sidebar'
import { Header } from './header'

const AIAssistant = dynamic(
  () => import('@/components/ai/ai-assistant').then((mod) => ({ default: mod.AIAssistant })),
  { ssr: false },
)

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, validateSession } = useAuthStore()
  const hasHydrated = useHydration()
  const sessionChecked = useSessionChecked()
  const router = useRouter()
  const pathname = usePathname()
  const hasRedirected = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (mounted && hasHydrated) void validateSession() }, [hasHydrated, mounted, validateSession])
  useEffect(() => { if (pathname) { hasRedirected.current = false; setMobileNavigationOpen(false) } }, [pathname])
  useEffect(() => {
    if (mounted && hasHydrated && sessionChecked && !hasRedirected.current && !isAuthenticated && pathname !== '/login') {
      hasRedirected.current = true
      router.push('/login')
    }
  }, [mounted, hasHydrated, sessionChecked, isAuthenticated, pathname, router])

  if (!mounted || !hasHydrated || !sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111f] text-white">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 shadow-[0_0_36px_rgba(34,211,238,0.16)]">
            <Sparkles className="h-6 w-6 animate-pulse text-cyan-200" />
          </div>
          <p className="mt-4 text-sm font-medium tracking-[0.18em] text-cyan-100">白泽正在校验工作区</p>
          <p className="mt-1 text-[10px] tracking-[0.12em] text-slate-500">IDENTITY · TENANT · RUNTIME</p>
        </div>
      </div>
    )
  }
  if (!isAuthenticated) return null

  const immersive = pathname.startsWith('/ai-agents/runtime')
  if (immersive) return <div className="h-screen overflow-hidden bg-[#030712]">{children}</div>

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f7fb]">
      {mobileNavigationOpen && <button type="button" aria-label="关闭导航" className="fixed inset-y-0 left-[284px] right-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileNavigationOpen(false)} />}
      <div className={`${mobileNavigationOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden'} lg:relative lg:z-auto lg:block`}>
        <Sidebar />
        {mobileNavigationOpen && <button type="button" aria-label="关闭导航菜单" className="absolute right-3 top-5 z-[60] rounded-lg border border-white/20 bg-slate-800 p-1 text-white lg:hidden" onClick={() => setMobileNavigationOpen(false)}><X className="h-5 w-5" /></button>}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <button type="button" aria-label="打开导航" className="absolute left-3 top-5 z-40 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 lg:hidden" onClick={() => setMobileNavigationOpen(true)}><Menu className="h-5 w-5" /></button>
        <Header />
        <main className="relative flex-1 overflow-auto bg-[radial-gradient(circle_at_88%_0%,rgba(14,165,233,0.055),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] p-4 md:p-6">
          <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(15,23,42,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.022)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative min-h-full">{children}</div>
        </main>
      </div>
      <AIAssistant />
    </div>
  )
}
