import { createHash } from 'node:crypto'
import { getPostgresPool } from '@/storage/database/postgres'
import type { User } from '@/types'
import { BAIZE_SAFETY_PATTERNS } from './safety-policy'

export class BaizeGuardError extends Error {
  constructor(readonly code: 'RATE_LIMITED' | 'BUSY' | 'CONTENT_BLOCKED', message: string, readonly reason?: string) {
    super(message)
    this.name = 'BaizeGuardError'
  }
}

function boundedEnv(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name])
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback
}

/** PostgreSQL counters, not process memory, so users cannot evade limits by choosing another app instance. */
export async function enforceBaizeRateLimit(user: User): Promise<void> {
  if (!user.school_id) throw new BaizeGuardError('BUSY', '当前身份未绑定学校')
  const perUser = boundedEnv('BAIZE_USER_RPM', 10, 100)
  const globalQps = boundedEnv('BAIZE_GLOBAL_QPS', 20, 200)
  const userKey = createHash('sha256').update(`${user.school_id}:${user.id}`).digest('hex').slice(0, 56)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    for (const [bucket, granularity, limit] of [
      [`user:${userKey}`, 'minute', perUser], ['global', 'second', globalQps],
    ] as const) {
      const result = await client.query(
        `INSERT INTO baize_request_windows(bucket,window_start,request_count)
         VALUES($1,date_trunc($2,clock_timestamp()),1)
         ON CONFLICT(bucket,window_start) DO UPDATE SET request_count=baize_request_windows.request_count+1
         WHERE baize_request_windows.request_count<$3 RETURNING request_count`,
        [bucket, granularity, limit],
      )
      if (!result.rowCount) throw new BaizeGuardError('RATE_LIMITED', bucket === 'global' ? '当前访问较多，请稍后再试' : '提问有点频繁，请稍等一分钟再继续')
    }
    await client.query('COMMIT')
    // Bounded, best-effort expiry prevents an unbounded per-second counter table in long-lived deployments.
    if (Math.random() < 0.001) await client.query(
      `DELETE FROM baize_request_windows WHERE ctid IN (
         SELECT ctid FROM baize_request_windows WHERE window_start<now()-interval '1 day' LIMIT 5000
       )`,
    ).catch(() => undefined)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/** Conservative local precheck; formal safety review still requires independent human evaluation. */
export function assertBaizeInputSafe(text: string): void {
  for (const item of BAIZE_SAFETY_PATTERNS) {
    if (item.pattern.test(text)) throw new BaizeGuardError('CONTENT_BLOCKED', item.reply, item.reason)
  }
}

export function sanitizeBaizeAnswer(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gi, '[已隐藏密钥]')
    .replace(/(?:authorization\s*:\s*bearer)\s+[^\s]+/gi, 'Authorization: [已隐藏]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[已隐藏手机号]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[已隐藏证件号]')
    .replace(/(学号\s*[：:]\s*)[A-Za-z0-9]{6,20}/gi, '$1[已隐藏学号]')
    .replace(/(?<![\w.-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w.-])/g, '[已隐藏邮箱]')
    .replace(/(姓名\s*[：:]\s*)[\u4e00-\u9fa5]{2,4}/g, '$1[已隐藏姓名]')
}

export function reviewBaizeOutput(text: string, hasVerifiedSource: boolean): { text: string; reason?: string } {
  const safe = sanitizeBaizeAnswer(text)
  if (!hasVerifiedSource && /(?:我已经查询到|全校共有|系统显示).{0,24}\d+\s*(?:条|个|件).{0,12}(?:报修|工单|访客)/.test(safe)) {
    return { text: '这项校园业务数据需要通过授权接口实时核对；请提供查询范围后重试。', reason: 'UNVERIFIED_BUSINESS_FACT' }
  }
  return { text: safe, reason: safe !== text ? 'PII_REDACTED' : undefined }
}

export async function isBaizeModelCircuitOpen(schoolId: string): Promise<boolean> {
  const result = await getPostgresPool().query<{ open: boolean }>(
    `SELECT COALESCE(open_until>now(),false) AS open FROM baize_model_circuits WHERE school_id=$1::uuid`, [schoolId],
  )
  return result.rows[0]?.open ?? false
}

export async function recordBaizeModelOutcome(schoolId: string, success: boolean): Promise<void> {
  if (success) {
    await getPostgresPool().query(
      `INSERT INTO baize_model_circuits(school_id,consecutive_failures,open_until) VALUES($1::uuid,0,NULL)
       ON CONFLICT(school_id) DO UPDATE SET consecutive_failures=0,open_until=NULL,updated_at=now()`, [schoolId],
    )
  } else {
    await getPostgresPool().query(
      `INSERT INTO baize_model_circuits(school_id,consecutive_failures) VALUES($1::uuid,1)
       ON CONFLICT(school_id) DO UPDATE SET
       consecutive_failures=CASE WHEN baize_model_circuits.open_until<now() THEN 1 ELSE baize_model_circuits.consecutive_failures+1 END,
       open_until=CASE WHEN (CASE WHEN baize_model_circuits.open_until<now() THEN 1 ELSE baize_model_circuits.consecutive_failures+1 END)>=10 THEN now()+interval '5 minutes' ELSE NULL END,
       updated_at=now()`, [schoolId],
    )
  }
}
