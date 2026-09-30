import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'

interface MessageDetailRow {
  id: string
  title: string
  content: string
  type: string
  publisherName: string | null
  publishAt: Date | string | null
  created_at: Date | string
  isRead: boolean
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Messages unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  const { id } = await params
  if (!id || id.length > 36) return NextResponse.json({ success: false, error: 'Invalid notification ID', code: 'INVALID_ID' }, { status: 400 })
  try {
    const result = await getPostgresPool().query<MessageDetailRow>(
      `SELECT n.id,n.title,n.content,n.type,p.name AS "publisherName",n.publish_at AS "publishAt",n.created_at,
         bool_and(d.status IN ('READ','ACKNOWLEDGED')) AS "isRead"
       FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id AND n.school_id=d.school_id
       LEFT JOIN users p ON p.id=n.publisher_id AND p.school_id=n.school_id
       WHERE d.school_id=$1::uuid AND d.recipient_user_id=$2 AND d.notification_id=$3
         AND d.channel='platform' AND d.status IN ('DELIVERED','READ','ACKNOWLEDGED') AND upper(n.status)='PUBLISHED'
       GROUP BY n.id,p.name`, [user.school_id, user.id, id],
    )
    if (!result.rows[0]) return NextResponse.json({ success: false, error: 'Message not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Failed to read PG message detail', error)
    return NextResponse.json({ success: false, error: '消息详情暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
