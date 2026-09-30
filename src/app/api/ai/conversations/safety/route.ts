import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { listBaizeSafetyEvents } from '@/lib/ai/assistant/safety-audit'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  const since = request.nextUrl.searchParams.get('since') ?? undefined
  if (since && (Number.isNaN(Date.parse(since)) || since.length > 40)) {
    return NextResponse.json({ success: false, code: 'INVALID_DATE' }, { status: 400 })
  }
  try {
    return NextResponse.json({ success: true, data: await listBaizeSafetyEvents(user, since) },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Baize safety audit query failed', error)
    return NextResponse.json({ success: false, code: 'UNAVAILABLE' }, { status: 503 })
  }
}
