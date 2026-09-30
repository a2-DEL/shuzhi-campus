import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  attachSessionCookie,
  assertAuthConfiguration,
  AuthConfigurationError,
  createSessionToken,
  SESSION_TTL_SECONDS,
} from '@/lib/auth-session'
import {
  getIdentityRepository,
  IdentityRepositoryError,
} from '@/lib/identity/repository'
import { hashPassword, verifyPassword } from '@/lib/password'
import { UserStatus } from '@/types'

const loginSchema = z.object({
  userId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(1).max(128),
})

function jsonError(error: string, status: number, code: string): NextResponse {
  return NextResponse.json(
    { success: false, error, code },
    { status, headers: { 'Cache-Control': 'no-store' } }
  )
}

async function hashMetadata(value: string | null): Promise<string | undefined> {
  if (!value) return undefined
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    assertAuthConfiguration()
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error('Authentication configuration error', error.message)
      return jsonError('身份服务配置错误', 503, 'AUTH_CONFIGURATION_ERROR')
    }
    throw error
  }

  let parsedBody: z.infer<typeof loginSchema>

  try {
    const result = loginSchema.safeParse(await request.json())
    if (!result.success) {
      return jsonError('\u8d26\u53f7\u6216\u5bc6\u7801\u683c\u5f0f\u4e0d\u6b63\u786e', 400, 'INVALID_CREDENTIAL_FORMAT')
    }
    parsedBody = result.data
  } catch {
    return jsonError('\u8bf7\u6c42\u6570\u636e\u683c\u5f0f\u9519\u8bef', 400, 'INVALID_REQUEST_BODY')
  }

  try {
    const repository = getIdentityRepository()
    const credential = await repository.findCredentialByIdentifier(parsedBody.userId)

    if (!credential?.passwordHash) {
      return jsonError('\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef', 401, 'INVALID_CREDENTIALS')
    }

    const passwordResult = await verifyPassword(parsedBody.password, credential.passwordHash)
    if (!passwordResult.valid) {
      return jsonError('\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef', 401, 'INVALID_CREDENTIALS')
    }

    const user = credential.user
    if (user.status === UserStatus.DISABLED || user.is_deleted) {
      return jsonError('\u8d26\u53f7\u5df2\u505c\u7528\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458', 403, 'ACCOUNT_DISABLED')
    }
    if (!user.school_id) {
      throw new IdentityRepositoryError('INVALID_IDENTITY_RECORD', 'User is not bound to a school')
    }

    const upgradedPasswordHash = passwordResult.needsRehash
      ? await hashPassword(parsedBody.password)
      : undefined
    await repository.recordSuccessfulLogin(user.id, upgradedPasswordHash)

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await repository.createSession({
      id: sessionId,
      userId: user.id,
      schoolId: user.school_id,
      authVersion: user.auth_version ?? 1,
      expiresAt,
      ipHash: await hashMetadata(forwardedFor),
      userAgentHash: await hashMetadata(request.headers.get('user-agent')),
    })

    const token = await createSessionToken(user.id, sessionId)
    const response = NextResponse.json(
      { success: true, data: { user: { ...user, last_login_at: new Date().toISOString() } } },
      { headers: { 'Cache-Control': 'no-store' } }
    )
    attachSessionCookie(response, token)
    return response
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error('Authentication configuration error', error.message)
      return jsonError('\u8eab\u4efd\u670d\u52a1\u914d\u7f6e\u9519\u8bef', 503, 'AUTH_CONFIGURATION_ERROR')
    }
    if (error instanceof IdentityRepositoryError) {
      console.error('Identity repository error', error.code, error.message)
      const code = error.code === 'IDENTITY_CONFIGURATION_ERROR'
        ? 'IDENTITY_SOURCE_UNAVAILABLE'
        : error.code
      return jsonError('\u8eab\u4efd\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528', 503, code)
    }

    console.error('Login failed unexpectedly', error)
    return jsonError('\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', 500, 'LOGIN_FAILED')
  }
}
