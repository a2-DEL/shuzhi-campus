'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useHydration, useSessionChecked } from '@/stores'

export default function HomePage() {
  const router = useRouter()
  const { isAuthenticated, validateSession } = useAuthStore()
  const hasHydrated = useHydration()
  const sessionChecked = useSessionChecked()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && hasHydrated) void validateSession()
  }, [hasHydrated, mounted, validateSession])

  useEffect(() => {
    // 只在水合完成后且组件已挂载时跳转一次
    if (mounted && hasHydrated && sessionChecked) {
      if (isAuthenticated) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }
  }, [mounted, hasHydrated, sessionChecked, isAuthenticated, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-500">加载中...</p>
      </div>
    </div>
  )
}
