import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = 'campus_session'
const SESSION_ISSUER = 'campus-agent-os'
const SESSION_AUDIENCE = 'campus-web'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const DEVELOPMENT_AUTH_SECRET = 'campus-agent-os-local-development-secret-change-before-production'
const MIN_AUTH_SECRET_LENGTH = 32

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD'
}

export interface SessionClaims {
  iss: typeof SESSION_ISSUER
  aud: typeof SESSION_AUDIENCE
  sub: string
  iat: number
  exp: number
  jti: string
  version: 1
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigurationError'
  }
}

function getAuthSecret(): string {
  const configuredSecret = process.env.AUTH_SECRET?.trim()

  if (!configuredSecret) {
    if (!isProductionRuntime()) return DEVELOPMENT_AUTH_SECRET
    throw new AuthConfigurationError('AUTH_SECRET is required in production')
  }

  if (configuredSecret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new AuthConfigurationError(`AUTH_SECRET must contain at least ${MIN_AUTH_SECRET_LENGTH} characters`)
  }

  return configuredSecret
}

export function assertAuthConfiguration(): void {
  // Force validation at process startup and at login boundaries. Development keeps the existing local fallback.
  getAuthSecret()
}

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(value, 'base64url')).buffer
}

async function importSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createSessionToken(userId: string, sessionId = crypto.randomUUID()): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims: SessionClaims = {
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    sub: userId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: sessionId,
    version: 1,
  }
  const payload = encodeBase64Url(JSON.stringify(claims))
  const message = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importSigningKey(),
    new TextEncoder().encode(message)
  )

  return `${message}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.')
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return null

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
      alg?: string
      typ?: string
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null

    const message = `${encodedHeader}.${encodedPayload}`
    const signatureValid = await crypto.subtle.verify(
      'HMAC',
      await importSigningKey(),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(message)
    )
    if (!signatureValid) return null

    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SessionClaims>
    const now = Math.floor(Date.now() / 1000)

    if (
      claims.iss !== SESSION_ISSUER ||
      claims.aud !== SESSION_AUDIENCE ||
      claims.version !== 1 ||
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      typeof claims.iat !== 'number' ||
      typeof claims.exp !== 'number' ||
      claims.iat > now + 60 ||
      claims.exp <= now ||
      claims.exp - claims.iat > SESSION_TTL_SECONDS
    ) {
      return null
    }

    return claims as SessionClaims
  } catch {
    return null
  }
}

export function readSessionToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookieToken) return cookieToken

  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

export function attachSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  response.headers.set('Cache-Control', 'no-store')
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  response.headers.set('Cache-Control', 'no-store')
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS }
