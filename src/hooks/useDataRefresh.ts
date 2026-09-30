import { useCallback, useRef, useState, useEffect } from 'react'
import { useRefreshStore } from '@/stores'

interface UseDataRefreshOptions {
  key: string // 数据标识
  fetchFn: () => Promise<void> // 数据获取函数
  interval?: number // 自动刷新间隔（毫秒），默认不自动刷新
  immediate?: boolean // 是否立即执行，默认 true
}

// 数据刷新 Hook
export function useDataRefresh({
  key,
  fetchFn,
  interval,
  immediate = true,
}: UseDataRefreshOptions) {
  const { refreshing, setRefreshing, markRefreshed, shouldRefresh } = useRefreshStore()
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // 刷新数据
  const refresh = useCallback(async (force = false) => {
    // 如果正在刷新且不是强制刷新，则跳过
    if (refreshing[key] && !force) return

    // 如果不需要刷新且不是强制刷新，则跳过
    if (!force && interval && !shouldRefresh(key, interval)) return

    setRefreshing(key, true)
    setError(null)

    try {
      await fetchFn()
      markRefreshed(key)
    } catch (err) {
      console.error(`刷新数据失败 (${key}):`, err)
      setError(err instanceof Error ? err.message : '刷新失败')
      setRefreshing(key, false)
    }
  }, [key, fetchFn, interval, refreshing, setRefreshing, markRefreshed, shouldRefresh])

  // 初始加载
  useEffect(() => {
    if (immediate) {
      refresh(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动刷新
  useEffect(() => {
    if (interval && interval > 0) {
      intervalRef.current = setInterval(() => {
        refresh(false)
      }, interval)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [interval, refresh])

  return {
    refreshing: refreshing[key] || false,
    error,
    refresh: () => refresh(true),
  }
}

// 手动刷新 Hook（不自动执行）
export function useManualRefresh(key: string) {
  const { lastRefreshTime, refreshing } = useRefreshStore()

  return {
    lastRefresh: lastRefreshTime[key] || 0,
    refreshing: refreshing[key] || false,
  }
}
