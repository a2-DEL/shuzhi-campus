import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getPostgresPool } from '@/storage/database/postgres'

/** Model gateway audit ledger is the only authoritative source for usage; never trust browser-supplied user IDs. */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, code: 'TENANT_REQUIRED' }, { status: 409 })
  try {
    const result = await getPostgresPool().query<{ day: string; calls: number; input_tokens: number; output_tokens: number }>(
      `SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date::text AS day,count(*)::int AS calls,
       coalesce(sum(prompt_tokens),0)::int AS input_tokens,coalesce(sum(completion_tokens),0)::int AS output_tokens
       FROM ai_model_invocations WHERE school_id=$1::uuid AND user_id=$2
       AND purpose LIKE 'assistant.%' AND created_at>=now()-interval '30 days'
       GROUP BY day ORDER BY day DESC`, [user.school_id, user.id],
    )
    return NextResponse.json({ success: true, data: result.rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Baize usage query failed', error)
    return NextResponse.json({ success: false, code: 'UNAVAILABLE' }, { status: 503 })
  }
}
