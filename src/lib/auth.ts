import { NextRequest } from 'next/server'
import { readSessionToken, verifySessionToken } from '@/lib/auth-session'
import { getIdentityRepository, IdentityRepositoryError } from '@/lib/identity/repository'
import { User, UserRole } from '@/types'

export async function getAuthUser(request: NextRequest): Promise<User | null> {
  const token = readSessionToken(request)
  if (!token) return null

  const claims = await verifySessionToken(token)
  if (!claims) return null

  try {
    return await getIdentityRepository().resolveSessionUser(claims.sub, claims.jti)
  } catch (error) {
    if (error instanceof IdentityRepositoryError) {
      console.error('Failed to resolve authenticated identity', error.code, error.message)
    } else {
      console.error('Failed to resolve authenticated identity', error)
    }
    return null
  }
}

export async function requireRole(request: NextRequest, allowedRoles: UserRole[]): Promise<User> {
  const user = await getAuthUser(request)
  if (!user) throw new Error('UNAUTHENTICATED')
  if (!allowedRoles.includes(user.role)) throw new Error('FORBIDDEN')
  return user
}
