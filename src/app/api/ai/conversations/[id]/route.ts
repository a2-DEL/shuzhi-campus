import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getBaizeConversation, listBaizeMessages, renameBaizeConversation, deleteBaizeConversation, BaizeMemoryError } from '@/lib/ai/assistant/memory'

const idSchema = z.string().uuid()
type Context = { params: Promise<{ id: string }> }
function failed(error: unknown): NextResponse {
  if (error instanceof BaizeMemoryError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 503 })
  console.error('Baize conversation operation failed', error)
  return NextResponse.json({ success: false, code: 'UNAVAILABLE' }, { status: 503 })
}
export async function GET(request: NextRequest, context: Context) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  const { id } = await context.params
  if (!idSchema.safeParse(id).success) return NextResponse.json({ success: false, code: 'INVALID_ID' }, { status: 400 })
  try {
    const conversation = await getBaizeConversation(user, id)
    const messages = await listBaizeMessages(user, id, 200)
    return NextResponse.json({ success: true, data: { conversation, messages } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failed(error) }
}
export async function PATCH(request: NextRequest, context: Context) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  const { id } = await context.params
  if (!idSchema.safeParse(id).success) return NextResponse.json({ success: false, code: 'INVALID_ID' }, { status: 400 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ success: false, code: 'INVALID_REQUEST' }, { status: 400 }) }
  const parsed = z.object({ title: z.string().trim().min(1).max(120) }).strict().safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, code: 'INVALID_REQUEST' }, { status: 400 })
  try { return NextResponse.json({ success: true, data: await renameBaizeConversation(user, id, parsed.data.title) }) }
  catch (error) { return failed(error) }
}
export async function DELETE(request: NextRequest, context: Context) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  const { id } = await context.params
  if (!idSchema.safeParse(id).success) return NextResponse.json({ success: false, code: 'INVALID_ID' }, { status: 400 })
  try { await deleteBaizeConversation(user, id); return NextResponse.json({ success: true }) }
  catch (error) { return failed(error) }
}
