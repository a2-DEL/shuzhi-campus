const API_BASE_URL = ''

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: string
}

class ApiClient {
  constructor(private readonly baseUrl: string = API_BASE_URL) {}

  private async request<T>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', headers = {}, body } = options
    const defaultHeaders: Record<string, string> = { ...headers }
    if (body !== undefined) defaultHeaders['Content-Type'] = 'application/json'

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method,
        headers: defaultHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
      })

      if (response.status === 204) return { success: true }

      const text = await response.text()
      let payload: ApiResponse<T> | null = null
      if (text) {
        try {
          payload = JSON.parse(text) as ApiResponse<T>
        } catch {
          payload = null
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: payload?.error || payload?.message || `请求失败 (${response.status})`,
          code: payload?.code,
        }
      }

      return payload ?? { success: true }
    } catch (error) {
      console.error('API request failed', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络请求失败',
      }
    }
  }

  get<T>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' })
  }

  post<T>(url: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: 'POST', body })
  }

  put<T>(url: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PUT', body })
  }

  delete<T>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' })
  }

  patch<T>(url: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PATCH', body })
  }
}

export const api = new ApiClient()

function readPersistedAuthState(): { user?: unknown; isAuthenticated?: boolean } | null {
  if (typeof window === 'undefined') return null
  try {
    const persisted = JSON.parse(window.localStorage.getItem('auth-storage') || 'null') as {
      state?: { user?: unknown; isAuthenticated?: boolean }
    } | null
    return persisted?.state ?? null
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return readPersistedAuthState()?.isAuthenticated === true
}

export function getCurrentUser(): unknown {
  return readPersistedAuthState()?.user ?? null
}

export async function logout(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } finally {
    window.localStorage.removeItem('auth-storage')
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('user')
    window.location.href = '/login'
  }
}
