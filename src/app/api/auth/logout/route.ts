import { NextRequest, NextResponse } from 'next/server'
import {
  clearSessionCookie,
  readSessionToken,
  verifySessionToken,
} from '@/lib/auth-session'
import { getIdentityRepository } from '@/lib/identity/repository'

export async function POST(request: NextRequest) {
  let status = 200
  let payload: Record<string, unknown> = {
    success: true,
    message: '\u5df2\u5b89\u5168\u9000\u51fa',
  }

  const token = readSessionToken(request)
  const claims = token ? await verifySessionToken(token) : null
  if (claims) {
    try {
      await getIdentityRepository().revokeSession(claims.jti, 'user_logout')
    } catch (error) {
      console.error('Session revocation failed', error)
      status = 503
      payload = {
        success: false,
        error: '\u4f1a\u8bdd\u64a4\u9500\u5931\u8d25\uff0c\u672c\u5730\u767b\u5f55\u72b6\u6001\u5df2\u6e05\u9664',
        code: 'SESSION_REVOCATION_FAILED',
      }
    }
  }

  const response = NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
  clearSessionCookie(response)
  return response
}
