import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'

const readSchema = z.object({ notificationId: z.string().trim().min(1).max(36) }).strict()

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Messages unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  const parsed = readSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid notification ID', code: 'INVALID_REQUEST' }, { status: 400 })
  try {
    const result = await getPostgresPool().query<{ id: string }>(
      `UPDATE notification_deliveries SET status='READ',read_at=now(),updated_at=now()
       WHERE school_id=$1::uuid AND recipient_user_id=$2 AND notification_id=$3 AND channel='platform' AND status='DELIVERED'
       RETURNING id::text AS id`, [user.school_id, user.id, parsed.data.notificationId],
    )
    return NextResponse.json({ success: true, data: { updated: result.rowCount ?? 0 } })
  } catch (error) {
    console.error('Failed to mark PG message read', error)
    return NextResponse.json({ success: false, error: '标记已读失败', code: 'MESSAGE_READ_FAILED' }, { status: 503 })
  }
}
