'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wifi,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useHydration, useSessionChecked } from '@/stores'
import { ROLE_LABELS, User } from '@/types'
import { StarMapVisual } from '@/components/auth/star-map-visual'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_GROUPS, type DemoAccount } from '@/lib/demo-accounts'
import styles from './page.module.css'

type LoginMode = 'account' | 'wechat'
type FieldFocus = 'none' | 'userId' | 'password'

const DEMO_PASSWORD = '123456'
const QUICK_DEMO_ACCOUNTS: readonly DemoAccount[] = DEMO_ACCOUNTS.filter((account) =>
  ['admin', 'dept', 'repairman', 'student'].includes(account.identifier)
)

type WeChatQrResponse = {
  sceneId: string
  expiresIn: number
  qrCodeUrl?: string
}

type WeChatStatusResponse = {
  status: string
  user?: User
}

function WeChatIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.046.25.25 0 0 0 .242-.247c0-.06-.025-.12-.04-.178l-.326-1.233a.49.49 0 0 1 .178-.554C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.136-.004-.27-.03-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  )
}

function buildQrPattern(seed: string): boolean[] {
  let value = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }

  const isFinderDark = (row: number, column: number, startRow: number, startColumn: number) => {
    const localRow = row - startRow
    const localColumn = column - startColumn
    if (localRow < 0 || localRow > 6 || localColumn < 0 || localColumn > 6) return null
    const edge = localRow === 0 || localRow === 6 || localColumn === 0 || localColumn === 6
    const core = localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4
    return edge || core
  }

  return Array.from({ length: 21 * 21 }, (_, index) => {
    const row = Math.floor(index / 21)
    const column = index % 21
    const finder =
      isFinderDark(row, column, 1, 1) ??
      isFinderDark(row, column, 1, 13) ??
      isFinderDark(row, column, 13, 1)
    if (finder !== null) return finder

    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return (value >>> 0) % 11 < 5
  })
}

function BrandIdentity({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={styles.brandMark}>
        <Sparkles className="relative z-10 h-5 w-5" />
      </div>
      <div>
        <div className={`text-[15px] font-semibold tracking-[0.08em] ${dark ? 'text-white' : 'text-slate-950'}`}>数智星图</div>
        <div className={`mt-0.5 text-[10px] font-medium tracking-[0.19em] ${dark ? 'text-cyan-200/60' : 'text-slate-400'}`}>CAMPUS AGENT OS</div>
      </div>
    </div>
  )
}

function StatusMessage({ kind, message }: { kind: 'success' | 'error'; message: string }) {
  const success = kind === 'success'
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      role={success ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="leading-5">{message}</span>
    </motion.div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { login, logout, validateSession, user, isAuthenticated } = useAuthStore()
  const hasHydrated = useHydration()
  const sessionChecked = useSessionChecked()
  const [loginMode, setLoginMode] = useState<LoginMode>('account')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [demoAccountsOpen, setDemoAccountsOpen] = useState(false)
  const [rememberAccount, setRememberAccount] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [focusField, setFocusField] = useState<FieldFocus>('none')
  const [qrSceneId, setQrSceneId] = useState('')
  const [qrCountdown, setQrCountdown] = useState(0)
  const [qrState, setQrState] = useState<'idle' | 'loading' | 'waiting' | 'expired' | 'error'>('idle')
  const qrCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const wechatEnabled = process.env.NEXT_PUBLIC_WECHAT_LOGIN_ENABLED === 'true'
  // Production builds only expose demonstration credentials when explicitly enabled for isolated preview.
  const showDemoAccounts = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === 'true'
  const qrPattern = useMemo(() => buildQrPattern(qrSceneId || 'campus-agent-os'), [qrSceneId])

  useEffect(() => {
    const rememberedUser = window.localStorage.getItem('remembered-user-id')
    if (rememberedUser) setUserId(rememberedUser)
  }, [])

  useEffect(() => {
    if (hasHydrated) void validateSession()
  }, [hasHydrated, validateSession])

  useEffect(() => {
    if (qrCountdown <= 0) {
      if (qrSceneId && qrState === 'waiting') setQrState('expired')
      return
    }
    const timer = window.setTimeout(() => setQrCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [qrCountdown, qrSceneId, qrState])

  useEffect(() => () => {
    if (qrCheckInterval.current) clearInterval(qrCheckInterval.current)
  }, [])

  const finishLogin = useCallback((nextUser: User) => {
    login(nextUser)
    setShowSuccess(true)
    setError('')
    window.setTimeout(() => router.push('/dashboard'), reduceMotion ? 250 : 1100)
  }, [login, reduceMotion, router])

  const generateWeChatQR = useCallback(async () => {
    if (!wechatEnabled) return
    setQrState('loading')
    setError('')

    const response = await api.get<WeChatQrResponse>('/api/auth/wechat/qrcode')
    if (!response.success || !response.data) {
      setQrState('error')
      setError(response.error || '微信身份码获取失败，请稍后重试')
      return
    }

    setQrSceneId(response.data.sceneId)
    setQrCountdown(response.data.expiresIn)
    setQrState('waiting')

    if (qrCheckInterval.current) clearInterval(qrCheckInterval.current)
    qrCheckInterval.current = setInterval(async () => {
      const statusResponse = await api.get<WeChatStatusResponse>(
        `/api/auth/wechat/status?sceneId=${encodeURIComponent(response.data!.sceneId)}`
      )
      if (statusResponse.success && statusResponse.data?.status === 'confirmed' && statusResponse.data.user) {
        if (qrCheckInterval.current) clearInterval(qrCheckInterval.current)
        finishLogin(statusResponse.data.user)
      }
    }, 2000)
  }, [finishLogin, wechatEnabled])

  useEffect(() => {
    if (loginMode === 'wechat' && wechatEnabled && qrState === 'idle') void generateWeChatQR()
    if (loginMode !== 'wechat' && qrCheckInterval.current) clearInterval(qrCheckInterval.current)
  }, [generateWeChatQR, loginMode, qrState, wechatEnabled])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!userId.trim()) {
      setError('请输入学号或工号')
      return
    }
    if (!password) {
      setError('请输入账户密码')
      return
    }

    setIsLoading(true)
    const response = await api.post<{ user: User }>('/api/auth/login', {
      userId: userId.trim(),
      password,
    })

    if (response.success && response.data) {
      if (rememberAccount) window.localStorage.setItem('remembered-user-id', userId.trim())
      else window.localStorage.removeItem('remembered-user-id')
      finishLogin(response.data.user)
    } else {
      setError(response.error || '身份验证失败，请检查账号和密码')
    }
    setIsLoading(false)
  }

  const selectDemoAccount = (account: DemoAccount) => {
    setUserId(account.identifier)
    setPassword(DEMO_PASSWORD)
    setShowPassword(false)
    setError('')
    setDemoAccountsOpen(false)
  }

  const currentRole = user ? ROLE_LABELS[user.role] || user.role : ''

  return (
    <main className={styles.page}>
      <div className={styles.aurora} />
      <div className={styles.auroraSecondary} />
      <div className={styles.scanBeam} />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1680px] grid-cols-1 items-stretch gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.28fr)_minmax(420px,0.72fr)] lg:px-8 lg:py-8 2xl:gap-8 2xl:px-10">
        <section className="hidden min-h-0 lg:block" aria-label="数智星图平台能力展示">
          <StarMapVisual />
        </section>

        <section className="flex min-h-[calc(100vh-2rem)] items-center justify-center lg:min-h-0">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            className={`w-full max-w-[500px] rounded-[32px] border border-white/70 p-6 sm:p-8 xl:p-9 ${styles.loginCard}`}
          >
            <div className="mb-8 flex items-center justify-between gap-4">
              <BrandIdentity />
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/72 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.1)]" />
                统一身份入口
              </div>
            </div>

            <div className="mb-7">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                <Fingerprint className="h-4 w-4" />
                Identity Access
              </div>
              <h2 className="text-[30px] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[34px]">
                欢迎进入数智星图
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                使用校内身份进入您的角色工作台与 Agent 团队。
              </p>
            </div>

            <div className={`mb-6 grid ${wechatEnabled ? 'grid-cols-2' : 'grid-cols-1'} rounded-2xl bg-slate-100/80 p-1.5`} role="tablist" aria-label="登录方式">
              <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'account'}
                onClick={() => { setLoginMode('account'); setError('') }}
                className={`relative rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${loginMode === 'account' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {loginMode === 'account' && <motion.span layoutId="login-mode" className="absolute inset-0 rounded-xl border border-slate-200/80 bg-white shadow-sm" />}
                <span className="relative inline-flex items-center gap-2"><KeyRound className="h-4 w-4" />账号登录</span>
              </button>
              {wechatEnabled && <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'wechat'}
                onClick={() => { setLoginMode('wechat'); setError('') }}
                className={`relative rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${loginMode === 'wechat' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {loginMode === 'wechat' && <motion.span layoutId="login-mode" className="absolute inset-0 rounded-xl border border-slate-200/80 bg-white shadow-sm" />}
                <span className="relative inline-flex items-center gap-2"><WeChatIcon className="h-4 w-4 text-emerald-600" />微信身份</span>
              </button>}
            </div>

            <div className="mb-5 min-h-[52px]" aria-live="polite">
              <AnimatePresence mode="wait">
                {showSuccess ? (
                  <StatusMessage key="success" kind="success" message="身份验证通过，正在进入角色工作台…" />
                ) : error ? (
                  <StatusMessage key="error" kind="error" message={error} />
                ) : (
                  <motion.div key="secure" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-1 pt-2 text-xs text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    请使用本人校内统一身份完成验证
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {loginMode === 'account' ? (
                <motion.form
                  key="account"
                  initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: 12 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="user-id" className="mb-2 block text-sm font-semibold text-slate-700">学号 / 工号</label>
                    <div className={`flex h-[54px] items-center rounded-2xl border bg-slate-50/80 px-4 ${focusField === 'userId' ? 'border-sky-400' : 'border-slate-200'} ${styles.fieldShell}`}>
                      <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
                      <input
                        id="user-id"
                        type="text"
                        autoComplete="username"
                        value={userId}
                        onChange={(event) => { setUserId(event.target.value); setError('') }}
                        onFocus={() => setFocusField('userId')}
                        onBlur={() => setFocusField('none')}
                        disabled={isLoading || showSuccess}
                        placeholder="请输入校内统一身份账号"
                        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                      />
                      {userId && <Check className="h-4 w-4 text-emerald-500" />}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">账户密码</label>
                    <div className={`flex h-[54px] items-center rounded-2xl border bg-slate-50/80 px-4 ${focusField === 'password' ? 'border-sky-400' : 'border-slate-200'} ${styles.fieldShell}`}>
                      <LockKeyhole className="h-5 w-5 shrink-0 text-slate-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => { setPassword(event.target.value); setError('') }}
                        onFocus={() => setFocusField('password')}
                        onBlur={() => setFocusField('none')}
                        disabled={isLoading || showSuccess}
                        placeholder="请输入账户密码"
                        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                      />
                      <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-1 text-xs">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-slate-600">
                      <input type="checkbox" checked={rememberAccount} onChange={(event) => setRememberAccount(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-700 accent-sky-700" />
                      记住账号
                    </label>
                    <span className="inline-flex items-center gap-1.5 text-slate-400"><Wifi className="h-3.5 w-3.5" />校内身份服务</span>
                  </div>

                  <button type="submit" disabled={isLoading || showSuccess} className={`group flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0 ${styles.submitButton}`}>
                    {isLoading ? <><LoaderCircle className="h-5 w-5 animate-spin" />正在验证身份</> : showSuccess ? <><CheckCircle2 className="h-5 w-5" />验证通过</> : <>安全登录<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
                  </button>

                  {showDemoAccounts && (
                    <section aria-labelledby="demo-quick-title" className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50/70 p-4 shadow-sm sm:p-5">
                      <div className="mb-3 flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm"><UsersRound className="h-4 w-4" /></span>
                        <div>
                          <h3 id="demo-quick-title" className="text-sm font-semibold text-slate-900">演示账号快速选择</h3>
                          <p className="mt-0.5 text-xs leading-5 text-slate-500">点击账号自动填充，再使用上方按钮登录。</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {QUICK_DEMO_ACCOUNTS.map((account) => {
                          const selected = userId === account.identifier && password === DEMO_PASSWORD
                          return (
                            <button
                              key={account.identifier}
                              type="button"
                              disabled={isLoading || showSuccess}
                              aria-label={'选择演示账号 ' + account.identifier + '，' + (ROLE_LABELS[account.role] || account.name)}
                              aria-pressed={selected}
                              onClick={() => selectDemoAccount(account)}
                              className={'flex min-h-[64px] min-w-0 items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60 ' + (selected ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200')}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-slate-900">{account.identifier}</span>
                                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{account.name} · {ROLE_LABELS[account.role] || account.role}</span>
                              </span>
                              {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-[11px] leading-5 text-slate-500" role="status">
                        {QUICK_DEMO_ACCOUNTS.some((account) => account.identifier === userId) && password === DEMO_PASSWORD
                          ? '演示账号已填充，请点击“安全登录”；也可以自行修改凭据。'
                          : '仅供隔离演示环境使用；正常登录仍可在上方手动输入。'}
                      </p>
                    </section>
                  )}

                  {showDemoAccounts && (
                    <Dialog open={demoAccountsOpen} onOpenChange={setDemoAccountsOpen}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          disabled={isLoading || showSuccess}
                          className="group flex w-full items-center justify-between rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-3 text-left transition-colors hover:border-sky-400 hover:bg-sky-50"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                              <UsersRound className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-slate-800">{'\u5168\u89d2\u8272\u6f14\u793a\u5165\u53e3'}</span>
                              <span className="mt-0.5 block text-[10px] text-slate-500">
                                {`${DEMO_ACCOUNTS.length} \u4e2a\u7cfb\u7edf\u89d2\u8272 \u00b7 \u4e00\u952e\u586b\u5145\u767b\u5f55\u8eab\u4efd`}
                              </span>
                            </span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-sky-700 shadow-sm">
                            {DEMO_ACCOUNTS.length} / {DEMO_ACCOUNTS.length}
                            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </button>
                      </DialogTrigger>

                      <DialogContent
                        className="flex flex-col gap-0 overflow-hidden rounded-[28px] border-slate-200 bg-slate-50 p-0 shadow-2xl"
                        style={{ width: 'calc(100% - 2rem)', maxWidth: 760, maxHeight: 'min(88vh, 800px)', backgroundColor: 'rgb(248 250 252)' }}
                      >
                        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 py-5 pr-14 sm:px-7">
                          <div className="flex items-center gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-lg shadow-sky-900/15">
                              <UsersRound className="h-5 w-5" />
                            </span>
                            <div>
                              <DialogTitle className="text-lg text-slate-950">{'\u9009\u62e9\u7cfb\u7edf\u89d2\u8272\u6f14\u793a\u8d26\u53f7'}</DialogTitle>
                              <DialogDescription className="mt-1 text-xs leading-5 text-slate-500">
                                {`\u5f53\u524d\u89d2\u8272\u6a21\u578b\u5168\u91cf\u8986\u76d6 ${DEMO_ACCOUNTS.length} / ${DEMO_ACCOUNTS.length}\uff0c\u9009\u62e9\u540e\u81ea\u52a8\u586b\u5145\u8d26\u53f7\u4e0e\u7edf\u4e00\u6f14\u793a\u5bc6\u7801\u3002`}
                              </DialogDescription>
                            </div>
                          </div>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
                          <div className="space-y-5">
                            {DEMO_ACCOUNT_GROUPS.map((group) => {
                              const accounts = DEMO_ACCOUNTS.filter((account) => account.groupId === group.id)
                              return (
                                <section key={group.id} aria-labelledby={`demo-group-${group.id}`}>
                                  <div className="mb-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
                                    <h3 id={`demo-group-${group.id}`} className="text-xs font-semibold text-slate-800">
                                      {group.label}
                                      <span className="ml-2 font-normal text-slate-400">{`${accounts.length} \u4e2a\u89d2\u8272`}</span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400">{group.description}</p>
                                  </div>
                                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                    {accounts.map((account) => {
                                      const selected = userId === account.identifier
                                      return (
                                        <button
                                          key={account.identifier}
                                          type="button"
                                          aria-label={`\u4f7f\u7528${account.name}\u6f14\u793a\u8d26\u53f7`}
                                          aria-pressed={selected}
                                          disabled={isLoading || showSuccess}
                                          onClick={() => {
                                            selectDemoAccount(account)
                                          }}
                                          className={`group/account flex min-h-[70px] items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md ${
                                            selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'
                                          }`}
                                        >
                                          <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-slate-900">{account.name}</span>
                                            <span className="mt-1 block truncate text-[10px] text-slate-400">{account.department}</span>
                                          </span>
                                          <span className={`shrink-0 rounded-lg px-2 py-1 font-medium text-[10px] font-semibold ${selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 group-hover/account:bg-sky-50 group-hover/account:text-sky-700'}`}>
                                            {account.identifier}
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </section>
                              )
                            })}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-500 sm:px-7">
                          <span>仅隔离演示环境可用</span>
                          <span>{'\u7edf\u4e00\u6f14\u793a\u5bc6\u7801\uff1a'}<strong className="font-medium text-slate-800">{DEMO_PASSWORD}</strong></span>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </motion.form>
              ) : (
                <motion.div
                  key="wechat"
                  initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="min-h-[322px]"
                >
                  {!wechatEnabled ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-8 text-center">
                      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><WeChatIcon className="h-7 w-7" /></div>
                      <h3 className="font-semibold text-slate-900">微信身份通道尚未启用</h3>
                      <p className="mt-2 max-w-[290px] text-xs leading-5 text-slate-500">当前环境未配置微信开放平台凭证。启用正式通道后，将在此生成可验证的动态身份码。</p>
                      <button type="button" onClick={() => setLoginMode('account')} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">返回账号登录<ChevronRight className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="relative mb-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,.08)]">
                        {qrState === 'loading' ? (
                          <div className="grid h-[210px] w-[210px] place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-sky-700" /></div>
                        ) : (
                          <div className={`h-[210px] w-[210px] gap-[1px] bg-white p-1 ${styles.qrGrid}`} aria-label="微信动态身份码">
                            {qrPattern.map((dark, index) => <span key={index} className={dark ? 'bg-slate-950' : 'bg-white'} />)}
                          </div>
                        )}
                        <div className="absolute inset-0 grid place-items-center pointer-events-none">
                          <div className="grid h-11 w-11 place-items-center rounded-xl border-4 border-white bg-emerald-500 text-white shadow-md"><WeChatIcon className="h-6 w-6" /></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><QrCode className="h-4 w-4 text-emerald-600" />使用微信扫描动态身份码</div>
                      <p className="mt-2 text-xs text-slate-400">{qrState === 'expired' ? '身份码已过期，请刷新' : qrCountdown > 0 ? `剩余 ${Math.floor(qrCountdown / 60)}:${String(qrCountdown % 60).padStart(2, '0')}` : '正在建立安全会话'}</p>
                      {(qrState === 'expired' || qrState === 'error') && <button type="button" onClick={() => void generateWeChatQR()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700"><RefreshCw className="h-3.5 w-3.5" />刷新身份码</button>}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-7 border-t border-slate-200/80 pt-5">
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />权限边界</span>
                <span className="inline-flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5 text-sky-600" />身份验证</span>
                <span className="inline-flex items-center gap-1.5"><CircleUserRound className="h-3.5 w-3.5 text-indigo-600" />角色工作台</span>
              </div>
            </div>

            {hasHydrated && sessionChecked && isAuthenticated && user && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-20 flex items-center justify-center bg-white/96 p-7 backdrop-blur-xl">
                <div className="w-full text-center">
                  <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-xl"><CircleUserRound className="h-8 w-8" /></div>
                  <h3 className="text-xl font-semibold text-slate-950">身份会话仍然有效</h3>
                  <p className="mt-2 text-sm text-slate-500">{user.name} · {currentRole}</p>
                  <button onClick={() => router.push('/dashboard')} className={`mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white ${styles.submitButton}`}>继续进入工作台<ArrowRight className="h-4 w-4" /></button>
                  <button onClick={async () => { await logout(); setShowSuccess(false) }} className="mt-3 text-xs font-medium text-slate-400 hover:text-slate-700">切换其他账户</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </section>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-0 right-0 hidden items-center justify-between px-10 text-[10px] tracking-[0.08em] text-slate-500 2xl:flex">
        <span>© 2026 数智星图 · Campus Agent OS</span>
        <span>Enterprise Preview</span>
      </div>
    </main>
  )
}


