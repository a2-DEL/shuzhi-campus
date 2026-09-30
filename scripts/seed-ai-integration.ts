import './assert-isolated-test-environment.mjs'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import {
  DEVELOPMENT_BUILDING_ID,
  DEVELOPMENT_CLASS_ID,
  DEVELOPMENT_ORGANIZATION_IDS,
  DEVELOPMENT_PASSWORD_HASH,
  DEVELOPMENT_SCHOOL_ID,
  getDevelopmentUsers,
} from '@/lib/development-users'
import { listEnterpriseSkillContracts } from '@/lib/ai/skills/registry'

export const INTEGRATION_FIXTURES = {
  campusId: '00000000-0000-4000-8000-000000000401',
  repairId: 'fixture-repair-1',
  classroomId: 'fixture-classroom-1',
  lostItemId: 'fixture-lost-1',
  dormitoryId: 'fixture-dorm-1',
  hygieneInspectionId: 'fixture-hygiene-1',
  dormSafetyEventId: 'fixture-safety-1',
  visitorId: 'fixture-visitor-1',
  energyAssetId: 'fixture-energy-1',
  energyReadingIds: [
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000503',
  ],
} as const

async function seed(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true })
  loadDotEnv({ quiet: true })
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  const users = getDevelopmentUsers()
  const now = new Date()
  const readingTimes = [3, 2, 1].map((hours) => new Date(now.getTime() - hours * 3_600_000).toISOString())

  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO schools(id, code, name, status, timezone, settings)
       VALUES($1::uuid, 'dev-school', '数智星图本地集成学校', 'active', 'Asia/Shanghai', '{"integration":true}'::jsonb)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, status='active', settings=EXCLUDED.settings, updated_at=now()`,
      [DEVELOPMENT_SCHOOL_ID]
    )
    await client.query(
      `INSERT INTO campuses(id, school_id, code, name, status)
       VALUES($1::uuid,$2::uuid,'dev-campus','本地集成校区','active')
       ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,name=EXCLUDED.name,status='active',updated_at=now()`,
      [INTEGRATION_FIXTURES.campusId, DEVELOPMENT_SCHOOL_ID]
    )

    const organizations = [
      [DEVELOPMENT_ORGANIZATION_IDS.platform, null, 'platform', '平台治理中心', 'school'],
      [DEVELOPMENT_ORGANIZATION_IDS.academic, DEVELOPMENT_ORGANIZATION_IDS.platform, 'academic', '教学组织', 'college'],
      [DEVELOPMENT_ORGANIZATION_IDS.logistics, DEVELOPMENT_ORGANIZATION_IDS.platform, 'logistics', '后勤基建处', 'service_center'],
      [DEVELOPMENT_ORGANIZATION_IDS.dormitory, DEVELOPMENT_ORGANIZATION_IDS.platform, 'dormitory', '宿舍管理中心', 'service_center'],
      [DEVELOPMENT_ORGANIZATION_IDS.student, DEVELOPMENT_ORGANIZATION_IDS.platform, 'student', '学生服务组织', 'department'],
    ] as const
    for (const [id, parentId, code, name, type] of organizations) {
      await client.query(
        `INSERT INTO organizations(id,school_id,campus_id,parent_id,code,name,type,status)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,'active')
         ON CONFLICT(id) DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,type=EXCLUDED.type,status='active',updated_at=now()`,
        [id, DEVELOPMENT_SCHOOL_ID, INTEGRATION_FIXTURES.campusId, parentId, code, name, type]
      )
    }
    for (const [id] of organizations) {
      await client.query(
        `INSERT INTO organization_closure(school_id,ancestor_id,descendant_id,depth) VALUES($1::uuid,$2::uuid,$2::uuid,0)
         ON CONFLICT(ancestor_id,descendant_id) DO UPDATE SET school_id=EXCLUDED.school_id,depth=0`,
        [DEVELOPMENT_SCHOOL_ID, id]
      )
      if (id !== DEVELOPMENT_ORGANIZATION_IDS.platform) {
        await client.query(
          `INSERT INTO organization_closure(school_id,ancestor_id,descendant_id,depth) VALUES($1::uuid,$2::uuid,$3::uuid,1)
           ON CONFLICT(ancestor_id,descendant_id) DO UPDATE SET school_id=EXCLUDED.school_id,depth=1`,
          [DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.platform, id]
        )
      }
    }

    await client.query(
      `INSERT INTO academic_classes(id,school_id,organization_id,code,name,grade_year,status)
       VALUES($1::uuid,$2::uuid,$3::uuid,'DEV-CLASS','本地集成班级',2026,'active')
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status='active',updated_at=now()`,
      [DEVELOPMENT_CLASS_ID, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.academic]
    )
    await client.query(
      `INSERT INTO buildings(id,school_id,campus_id,organization_id,code,name,type,status)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'DEV-BUILDING','本地集成楼栋','dormitory','active')
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status='active',updated_at=now()`,
      [DEVELOPMENT_BUILDING_ID, DEVELOPMENT_SCHOOL_ID, INTEGRATION_FIXTURES.campusId, DEVELOPMENT_ORGANIZATION_IDS.dormitory]
    )

    for (const user of users) {
      await client.query(
        `INSERT INTO users(id,user_id,name,password_hash,role,department,status,school_id,primary_organization_id,primary_campus_id,auth_version,is_deleted)
         VALUES($1,$2,$3,$4,$5,$6,'active',$7::uuid,$8::uuid,$9::uuid,1,false)
         ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,name=EXCLUDED.name,role=EXCLUDED.role,department=EXCLUDED.department,status='active',school_id=EXCLUDED.school_id,primary_organization_id=EXCLUDED.primary_organization_id,primary_campus_id=EXCLUDED.primary_campus_id,auth_version=1,is_deleted=false,deleted_at=NULL,updated_at=now()`,
        [user.id, user.user_id, user.name, DEVELOPMENT_PASSWORD_HASH, user.role, user.department, DEVELOPMENT_SCHOOL_ID, user.primary_organization_id, INTEGRATION_FIXTURES.campusId]
      )
      const assignment = user.role_assignments?.[0]
      if (!assignment) throw new Error(`Missing role assignment for ${user.id}`)
      await client.query(
        `INSERT INTO user_role_assignments(id,school_id,user_id,role,scope_type,scope_id,is_primary,status,valid_from,reason)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,true,'active',$7::timestamptz,'local integration fixture')
         ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,scope_type=EXCLUDED.scope_type,scope_id=EXCLUDED.scope_id,is_primary=true,status='active',valid_from=EXCLUDED.valid_from,valid_until=NULL,updated_at=now()`,
        [assignment.id, DEVELOPMENT_SCHOOL_ID, user.id, user.role, assignment.scope_type, assignment.scope_id ?? null, assignment.valid_from]
      )
    }

    for (const contract of listEnterpriseSkillContracts()) {
      for (const role of contract.allowedRoles) {
        await client.query(
          `INSERT INTO skill_bindings(school_id,skill_key,role,enabled,scope_policy,bound_by)
           VALUES($1::uuid,$2,$3,true,'{"source":"server_resource"}'::jsonb,'dev-admin')
           ON CONFLICT(school_id,skill_key,role) DO UPDATE SET enabled=true,bound_by='dev-admin',updated_at=now()`,
          [DEVELOPMENT_SCHOOL_ID, contract.key, role]
        )
      }
    }

    await client.query('DELETE FROM ai_skill_rate_limit_counters WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM ai_outbox_events WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM ai_audit_events WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM ai_task_runs WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM notification_deliveries WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM notifications WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM classroom_bookings WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM hygiene_rectifications WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])
    await client.query('DELETE FROM maintenance_recommendations WHERE school_id=$1::uuid', [DEVELOPMENT_SCHOOL_ID])

    // Keep the compact integration fixture deterministic after an enterprise showcase run.
    // Only records carrying the dedicated showcase prefix/source are removed.
    await client.query("DELETE FROM dorm_safety_events WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM iot_readings WHERE school_id=$1::uuid AND source_message_id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM visitors WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM dorm_inspections WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM lost_found WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM repair_orders WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM hygiene_inspections WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM energy_readings WHERE school_id=$1::uuid AND source='showcase_meter'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM energy_assets WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM classrooms WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM dormitories WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM material_requests WHERE id LIKE 'showcase-%'")
    await client.query("DELETE FROM materials WHERE id LIKE 'showcase-%'")
    await client.query("DELETE FROM duty_schedules WHERE id LIKE 'showcase-%'")
    await client.query("DELETE FROM buildings WHERE school_id=$1::uuid AND code LIKE 'SHOWCASE-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("UPDATE repair_orders SET assignee_id=NULL,assigned_at=NULL,status='PENDING',sla_due_at=NULL,version=version+1,updated_at=now() WHERE school_id=$1::uuid AND assignee_id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM user_role_assignments WHERE school_id=$1::uuid AND user_id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])
    await client.query("DELETE FROM users WHERE school_id=$1::uuid AND id LIKE 'showcase-%'", [DEVELOPMENT_SCHOOL_ID])

    await client.query(
      `INSERT INTO repair_orders(id,title,damage_type,location,description,reporter_id,status,priority,school_id,organization_id,building_id,version,is_deleted,assignee_id,assigned_at,sla_due_at)
       VALUES($1,'实验室空调异常','AIR_CONDITIONER','本地集成楼栋 101','真实派单验收工单','dev-student','PENDING','urgent',$2::uuid,$3::uuid,$4::uuid,1,false,NULL,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,status='PENDING',priority='urgent',school_id=EXCLUDED.school_id,organization_id=EXCLUDED.organization_id,building_id=EXCLUDED.building_id,version=1,is_deleted=false,assignee_id=NULL,assigned_at=NULL,sla_due_at=NULL,updated_at=now()`,
      [INTEGRATION_FIXTURES.repairId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.logistics, DEVELOPMENT_BUILDING_ID]
    )
    await client.query(
      `INSERT INTO classrooms(id,campus,building,floor,room_number,full_name,capacity,status,facilities,school_id,campus_id,organization_id,building_id,version)
       VALUES($1,'本地集成校区','DEV',1,'201','DEV-201',60,'available','["projector","network"]'::jsonb,$2::uuid,$3::uuid,$4::uuid,$5::uuid,1)
       ON CONFLICT(id) DO UPDATE SET status='available',capacity=60,facilities=EXCLUDED.facilities,school_id=EXCLUDED.school_id,version=1,updated_at=now()`,
      [INTEGRATION_FIXTURES.classroomId, DEVELOPMENT_SCHOOL_ID, INTEGRATION_FIXTURES.campusId, DEVELOPMENT_ORGANIZATION_IDS.academic, DEVELOPMENT_BUILDING_ID]
    )
    await client.query(
      `INSERT INTO lost_found(id,type,item_type,item_name,description,location,reporter_id,status,school_id,organization_id,version,claimer_id,claimed_at,claim_evidence_hash,claim_confirmed_by)
       VALUES($1,'found','证件','校园卡','本地集成验收物品','DEV-201','dev-student','open',$2::uuid,$3::uuid,1,NULL,NULL,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET status='open',school_id=EXCLUDED.school_id,organization_id=EXCLUDED.organization_id,version=1,claimer_id=NULL,claimed_at=NULL,claim_evidence_hash=NULL,claim_confirmed_by=NULL,updated_at=now()`,
      [INTEGRATION_FIXTURES.lostItemId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.student]
    )
    await client.query(
      `INSERT INTO dormitories(id,building_name,total_rooms,occupied_rooms,manager_id,status,school_id,building_id,version)
       VALUES($1,'本地集成楼栋',100,80,'dev-dorm','normal',$2::uuid,$3::uuid,1)
       ON CONFLICT(id) DO UPDATE SET status='normal',school_id=EXCLUDED.school_id,building_id=EXCLUDED.building_id,version=1,updated_at=now()`,
      [INTEGRATION_FIXTURES.dormitoryId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_BUILDING_ID]
    )
    await client.query(
      `INSERT INTO hygiene_inspections(id,school_id,organization_id,building_id,class_id,location,inspector_id,inspected_at,deterministic_score,ai_advisory_score,evidence,status,version)
       VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'DEV-201','dev-hygiene',now(),72,75,'[{"type":"photo","hash":"fixture-evidence"}]'::jsonb,'COMPLETED',1)
       ON CONFLICT(id) DO UPDATE SET status='COMPLETED',evidence=EXCLUDED.evidence,version=1,updated_at=now()`,
      [INTEGRATION_FIXTURES.hygieneInspectionId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.academic, DEVELOPMENT_BUILDING_ID, DEVELOPMENT_CLASS_ID]
    )
    await client.query(
      `INSERT INTO dorm_safety_events(id,school_id,building_id,dormitory_id,room_number,event_type,source,severity,observed_value,rule_evidence,status,version,confirmed_by,confirmed_at,confirmation_note)
       VALUES($1,$2::uuid,$3::uuid,$4,'301','electrical_load','RULE','high','{"amps":32}'::jsonb,'{"threshold":25}'::jsonb,'PENDING_CONFIRMATION',1,NULL,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET status='PENDING_CONFIRMATION',observed_value=EXCLUDED.observed_value,rule_evidence=EXCLUDED.rule_evidence,version=1,confirmed_by=NULL,confirmed_at=NULL,confirmation_note=NULL,updated_at=now()`,
      [INTEGRATION_FIXTURES.dormSafetyEventId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_BUILDING_ID, INTEGRATION_FIXTURES.dormitoryId]
    )
    await client.query(
      `INSERT INTO visitors(id,dormitory_id,room_number,visitor_name,visitor_phone,purpose,visit_time,school_id,building_id,host_id,applicant_id,status,version,decision_by,decision_at,decision_rationale,qr_token_hash,qr_valid_from,qr_valid_until,qr_used_at,qr_revoked_at)
       VALUES($1,$2,'301','张访客','13800000000','本地集成验收',now()+interval '1 day',$3::uuid,$4::uuid,'dev-student','dev-admin','PENDING',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET status='PENDING',version=1,decision_by=NULL,decision_at=NULL,decision_rationale=NULL,qr_token_hash=NULL,qr_valid_from=NULL,qr_valid_until=NULL,qr_used_at=NULL,qr_revoked_at=NULL,updated_at=now()`,
      [INTEGRATION_FIXTURES.visitorId, INTEGRATION_FIXTURES.dormitoryId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_BUILDING_ID]
    )
    await client.query(
      `INSERT INTO energy_assets(id,school_id,building_id,asset_code,name,asset_type,status,rated_capacity,metadata,version)
       VALUES($1,$2::uuid,$3::uuid,'HVAC-DEV-001','本地集成空调机组','hvac','active',100,'{"integration":true}'::jsonb,1)
       ON CONFLICT(id) DO UPDATE SET status='active',version=1,updated_at=now()`,
      [INTEGRATION_FIXTURES.energyAssetId, DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_BUILDING_ID]
    )
    for (let index = 0; index < INTEGRATION_FIXTURES.energyReadingIds.length; index += 1) {
      await client.query(
        `INSERT INTO energy_readings(id,school_id,asset_id,metric,value,unit,quality,observed_at,source,source_record_id)
         VALUES($1::uuid,$2::uuid,$3,'electricity_load',$4,'kW','valid',$5::timestamptz,'local_meter',$6)
         ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,quality='valid',observed_at=EXCLUDED.observed_at`,
        [INTEGRATION_FIXTURES.energyReadingIds[index], DEVELOPMENT_SCHOOL_ID, INTEGRATION_FIXTURES.energyAssetId, 70 + index * 8, readingTimes[index], `fixture-reading-${index + 1}`]
      )
    }

    await client.query('COMMIT')
    const counts = await client.query(`SELECT
      (SELECT count(*) FROM users WHERE school_id=$1::uuid)::int AS users,
      (SELECT count(*) FROM skill_bindings WHERE school_id=$1::uuid AND enabled)::int AS bindings,
      (SELECT count(*) FROM energy_readings WHERE school_id=$1::uuid)::int AS readings`, [DEVELOPMENT_SCHOOL_ID])
    console.log(`SEEDED local integration tenant: users=${counts.rows[0].users} bindings=${counts.rows[0].bindings} readings=${counts.rows[0].readings}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
