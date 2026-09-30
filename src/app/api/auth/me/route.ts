import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, error: '\u4f1a\u8bdd\u65e0\u6548\u6216\u5df2\u8fc7\u671f', code: 'UNAUTHENTICATED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(
    { success: true, data: user },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
