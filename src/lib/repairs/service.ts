import { z } from 'zod'
import type { User } from '@/types'
import { getPostgresPool } from '@/storage/database/postgres'

export const repairCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  damage_type: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  contact_phone: z.string().trim().max(20).optional(),
  priority: z.enum(['1', '2', '3']).default('2'),
  images: z.array(z.string().url().max(1000)).max(8).optional(),
}).strict()

export type RepairCreateInput = z.infer<typeof repairCreateSchema>

export class RepairOwnerConfigurationError extends Error {
  constructor() {
    super('无法确定报修受理组织，请联系管理员配置后勤责任范围')
    this.name = 'RepairOwnerConfigurationError'
  }
}

/** Creates only a student-submitted PENDING work order. Dispatch/status changes stay inside the PG Skill gateway. */
export async function createPgRepair(user: User, data: RepairCreateInput): Promise<Record<string, unknown>> {
  if (!user.school_id) throw new RepairOwnerConfigurationError()
  const pool = getPostgresPool()
  // Find the unique operational owner from active server-side logistics assignments.
  // More than one owner needs an explicit dispatch policy; free-text locations are not reliable scope IDs.
  const owners = await pool.query<{ id: string }>(
    `SELECT DISTINCT o.id::text AS id FROM organizations o JOIN user_role_assignments a
     ON a.scope_id=o.id AND a.school_id=o.school_id AND a.scope_type='organization'
     WHERE o.school_id=$1::uuid AND o.status='active' AND a.status='active'
       AND a.role IN ('logistics_manager','logistics_admin')
       AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())`,
    [user.school_id],
  )
  if (owners.rows.length !== 1) throw new RepairOwnerConfigurationError()

  // The legacy schema has no contact_phone column on repair_orders; preserve the optional form value
  // visibly in the existing description until the business owner confirms a contact-data policy.
  const description = [data.description, data.contact_phone ? `联系电话：${data.contact_phone}` : undefined].filter(Boolean).join('\n')
  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO repair_orders(school_id,organization_id,title,damage_type,location,description,reporter_id,status,priority,images)
     VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'PENDING',$8,$9::jsonb)
     RETURNING id,title,damage_type,location,description,status,priority,reporter_id,organization_id,created_at`,
    [user.school_id, owners.rows[0].id, data.title, data.damage_type, data.location,
      description, user.id, data.priority, data.images ? JSON.stringify(data.images) : null],
  )
  return result.rows[0]
}
