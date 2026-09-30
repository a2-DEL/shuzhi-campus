import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createBaizeConversation, listBaizeConversations } from '@/lib/ai/assistant/memory'
import { enforceBaizeRateLimit, BaizeGuardError } from '@/lib/ai/assistant/guardrails'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await listBaizeConversations(user) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { console.error('Baize conversation list failed', error); return NextResponse.json({ success: false, code: 'UNAVAILABLE' }, { status: 503 }) }
}
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  try { await enforceBaizeRateLimit(user); return NextResponse.json({ success: true, data: await createBaizeConversation(user) }, { status: 201, headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) {
    if (error instanceof BaizeGuardError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 429 })
    console.error('Baize conversation create failed', error)
    return NextResponse.json({ success: false, code: 'UNAVAILABLE' }, { status: 503 })
  }
}
