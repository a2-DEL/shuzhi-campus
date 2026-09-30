import './assert-isolated-test-environment.mjs'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import {
  DEVELOPMENT_BUILDING_ID,
  DEVELOPMENT_CLASS_ID,
  DEVELOPMENT_ORGANIZATION_IDS,
  DEVELOPMENT_PASSWORD_HASH,
  DEVELOPMENT_SCHOOL_ID,
  getDevelopmentUser,
} from '@/lib/development-users'

const CAMPUS_ID = '00000000-0000-4000-8000-000000000401'
const SHOWCASE_VERSION = '2026.08-enterprise-v1'
const BUILDINGS = {
  teaching: '00000000-0000-4000-8000-000000000311',
  innovation: '00000000-0000-4000-8000-000000000312',
  dormEast: '00000000-0000-4000-8000-000000000313',
  dormWest: '00000000-0000-4000-8000-000000000314',
  energy: '00000000-0000-4000-8000-000000000315',
} as const

function uuid(group: number, index: number): string {
  return `${String(group).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`
}
function hours(hours: number): string { return new Date(Date.now() + hours * 3_600_000).toISOString() }
function futureDay(days: number, hour = 9): string {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, 0, 0, 0)
  return value.toISOString()
}
function uid(group: string, index: number): string { return `showcase-${group}-${String(index).padStart(3, '0')}` }

async function seedPeopleAndBuildings(client: Client): Promise<void> {
  const buildings = [
    [BUILDINGS.teaching, DEVELOPMENT_ORGANIZATION_IDS.academic, 'SHOWCASE-TEACHING', '星海南区教学楼', 'teaching'],
    [BUILDINGS.innovation, DEVELOPMENT_ORGANIZATION_IDS.academic, 'SHOWCASE-INNOVATION', '未来创新中心', 'teaching'],
    [BUILDINGS.dormEast, DEVELOPMENT_ORGANIZATION_IDS.dormitory, 'SHOWCASE-DORM-EAST', '东区学生公寓', 'dormitory'],
    [BUILDINGS.dormWest, DEVELOPMENT_ORGANIZATION_IDS.dormitory, 'SHOWCASE-DORM-WEST', '西区学生公寓', 'dormitory'],
    [BUILDINGS.energy, DEVELOPMENT_ORGANIZATION_IDS.logistics, 'SHOWCASE-ENERGY', '综合能源站', 'logistics'],
  ] as const
  for (const [id, org, code, name, type] of buildings) {
    await client.query(
      `INSERT INTO buildings(id,school_id,campus_id,organization_id,code,name,type,status)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,'active')
       ON CONFLICT(id) DO UPDATE SET organization_id=EXCLUDED.organization_id,code=EXCLUDED.code,
       name=EXCLUDED.name,type=EXCLUDED.type,status='active',updated_at=now()`,
      [id, DEVELOPMENT_SCHOOL_ID, CAMPUS_ID, org, code, name, type],
    )
  }

  const groups = [
    ['student', 40, 'student', '人工智能学院', DEVELOPMENT_ORGANIZATION_IDS.student, 'class', DEVELOPMENT_CLASS_ID, '星图学员'],
    ['repairman', 6, 'repairman', '后勤维修中心', DEVELOPMENT_ORGANIZATION_IDS.logistics, 'organization', DEVELOPMENT_ORGANIZATION_IDS.logistics, '工程师'],
    ['teacher', 4, 'teacher', '人工智能学院', DEVELOPMENT_ORGANIZATION_IDS.academic, 'organization', DEVELOPMENT_ORGANIZATION_IDS.academic, '教师'],
    ['dorm', 4, 'dorm_keeper', '宿舍管理中心', DEVELOPMENT_ORGANIZATION_IDS.dormitory, 'building', DEVELOPMENT_BUILDING_ID, '宿管员'],
    ['counselor', 2, 'counselor', '学生工作处', DEVELOPMENT_ORGANIZATION_IDS.student, 'organization', DEVELOPMENT_ORGANIZATION_IDS.student, '辅导员'],
  ] as const
  let ordinal = 1
  for (const [key, count, role, department, org, scopeType, scopeId, label] of groups) {
    for (let index = 1; index <= count; index += 1) {
      const id = uid(key, index)
      await client.query(
        `INSERT INTO users(id,user_id,name,password_hash,role,department,class_name,status,school_id,
          primary_organization_id,primary_campus_id,auth_version,is_deleted)
         VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8::uuid,$9::uuid,$10::uuid,1,false)
         ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
          role=EXCLUDED.role,department=EXCLUDED.department,class_name=EXCLUDED.class_name,status='active',
          school_id=EXCLUDED.school_id,primary_organization_id=EXCLUDED.primary_organization_id,
          primary_campus_id=EXCLUDED.primary_campus_id,auth_version=1,is_deleted=false,deleted_at=NULL,updated_at=now()`,
        [id, `demo-${key}-${String(index).padStart(3, '0')}`, `${label}${String(index).padStart(2, '0')}`,
          DEVELOPMENT_PASSWORD_HASH, role, department, role === 'student' ? '智造工程 2026-1 班' : null,
          DEVELOPMENT_SCHOOL_ID, org, CAMPUS_ID],
      )
      await client.query(
        `INSERT INTO user_role_assignments(id,school_id,user_id,role,scope_type,scope_id,is_primary,status,valid_from,reason)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,true,'active','2026-01-01T00:00:00Z','企业演示数据集角色绑定')
         ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,scope_type=EXCLUDED.scope_type,scope_id=EXCLUDED.scope_id,
          is_primary=true,status='active',valid_until=NULL,reason=EXCLUDED.reason,updated_at=now()`,
        [uuid(20, ordinal++), DEVELOPMENT_SCHOOL_ID, id, role, scopeType, scopeId],
      )
    }
  }
}

async function seedRepairs(client: Client): Promise<void> {
  const titles = [
    ['创新中心报告厅空调制冷异常', 'AIR_CONDITIONER', '未来创新中心 A101'],
    ['东区公寓公共照明闪烁', 'ELECTRIC', '东区学生公寓 3F'],
    ['教学楼智慧门锁离线', 'ACCESS_CONTROL', '星海南区教学楼 B208'],
    ['实验室网络面板无信号', 'NETWORK', '未来创新中心 C306'],
    ['西区公寓热水供应不稳定', 'HOT_WATER', '西区学生公寓 5F'],
    ['卫生间感应水龙头故障', 'PLUMBING', '星海南区教学楼 2F'],
    ['能源站水泵振动偏高', 'EQUIPMENT', '综合能源站泵房'],
    ['报告厅投影画面偏色', 'MULTIMEDIA', '未来创新中心 A201'],
    ['公寓消防门闭门器松动', 'SAFETY', '东区学生公寓 6F'],
    ['教室桌椅连接件松动', 'FURNITURE', '教学楼 B405'],
    ['走廊应急指示灯电量低', 'ELECTRIC', '未来创新中心 2F'],
    ['公寓洗衣机排水异常', 'APPLIANCE', '西区学生公寓 1F'],
    ['新风机组噪音偏高', 'AIR_CONDITIONER', '未来创新中心屋面'],
    ['教学楼电梯按钮响应迟缓', 'ELEVATOR', '星海南区教学楼'],
    ['公寓门禁读卡器识别缓慢', 'ACCESS_CONTROL', '东区学生公寓 1F'],
    ['实验室 UPS 电池告警', 'ELECTRIC', '未来创新中心 C401'],
    ['公寓自习室照度不足', 'LIGHTING', '西区学生公寓 2F'],
    ['雨水口落叶淤积', 'ENVIRONMENT', '未来创新中心东侧'],
  ] as const
  const states = ['PENDING','PENDING','PENDING','PENDING','DISPATCHED','DISPATCHED','DISPATCHED','PROCESSING','PROCESSING','PROCESSING','COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED']
  const priorities = ['urgent','high','high','normal','urgent','high','high','normal','normal','low','high','normal','normal','high','normal','urgent','normal','low']
  const buildingIds = [BUILDINGS.innovation, BUILDINGS.dormEast, BUILDINGS.teaching, BUILDINGS.innovation, BUILDINGS.dormWest, BUILDINGS.teaching, BUILDINGS.energy]
  for (let i = 0; i < titles.length; i += 1) {
    const state = states[i]
    const assignee = state === 'PENDING' ? null : uid('repairman', (i % 6) + 1)
    await client.query(
      `INSERT INTO repair_orders(id,title,damage_type,location,description,images,reporter_id,assignee_id,status,priority,
        completed_at,school_id,organization_id,building_id,assigned_at,sla_due_at,version,is_deleted,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::timestamptz,$12::uuid,$13::uuid,$14::uuid,
        $15::timestamptz,$16::timestamptz,1,false,$17::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,damage_type=EXCLUDED.damage_type,location=EXCLUDED.location,
        description=EXCLUDED.description,images=EXCLUDED.images,reporter_id=EXCLUDED.reporter_id,
        assignee_id=EXCLUDED.assignee_id,status=EXCLUDED.status,priority=EXCLUDED.priority,completed_at=EXCLUDED.completed_at,
        school_id=EXCLUDED.school_id,organization_id=EXCLUDED.organization_id,building_id=EXCLUDED.building_id,
        assigned_at=EXCLUDED.assigned_at,sla_due_at=EXCLUDED.sla_due_at,version=1,is_deleted=false,
        created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-repair-${String(i + 1).padStart(2, '0')}`, ...titles[i],
       '企业演示数据：按正式工单字段和 SLA 规则运行。', JSON.stringify([{ label: '现场证据已脱敏', demo: true }]),
       uid('student', (i % 40) + 1), assignee, state, priorities[i], state === 'COMPLETED' ? hours(-18 + (i - 10) * 1.4) : null,
       DEVELOPMENT_SCHOOL_ID, DEVELOPMENT_ORGANIZATION_IDS.logistics, buildingIds[i % buildingIds.length],
       assignee ? hours(-40 + i * 1.7) : null, state === 'PENDING' && i === 0 ? hours(-2) : hours(8 + i * 1.5), hours(-54 + i * 2.4)],
    )
  }
}

async function seedClassrooms(client: Client): Promise<void> {
  const rooms = [
    ['未来创新中心',1,'A101','未来创新中心·星云报告厅',320,'available',['4K 激光投影','全景录播','同声传译'],BUILDINGS.innovation],
    ['未来创新中心',2,'A201','未来创新中心·协同路演厅',180,'available',['LED 大屏','直播导播'],BUILDINGS.innovation],
    ['未来创新中心',3,'C301','未来创新中心·智能研讨室 1',48,'occupied',['智慧黑板','视频会议'],BUILDINGS.innovation],
    ['未来创新中心',3,'C302','未来创新中心·智能研讨室 2',48,'available',['智慧黑板','视频会议'],BUILDINGS.innovation],
    ['星海南区教学楼',1,'B101','教学楼·阶梯教室 B101',160,'available',['投影','扩声'],BUILDINGS.teaching],
    ['星海南区教学楼',2,'B208','教学楼·智慧教室 B208',72,'available',['智慧黑板','录播'],BUILDINGS.teaching],
    ['星海南区教学楼',3,'B308','教学楼·研讨教室 B308',36,'occupied',['分组屏','移动桌椅'],BUILDINGS.teaching],
    ['星海南区教学楼',4,'B405','教学楼·标准教室 B405',80,'available',['投影','扩声'],BUILDINGS.teaching],
    ['星海南区教学楼',5,'B501','教学楼·计算实验室 B501',64,'maintenance',['云桌面','门禁'],BUILDINGS.teaching],
    ['未来创新中心',4,'C401','未来创新中心·AI 实验室',56,'available',['GPU 云桌面','多模态采集'],BUILDINGS.innovation],
  ] as const
  for (let i = 0; i < rooms.length; i += 1) {
    const [building,floor,number,name,capacity,status,facilities,buildingId] = rooms[i]
    await client.query(
      `INSERT INTO classrooms(id,campus,building,floor,room_number,full_name,capacity,status,facilities,
        school_id,campus_id,organization_id,building_id,version,created_at,updated_at)
       VALUES($1,'星海南校区',$2,$3,$4,$5,$6,$7,$8::jsonb,$9::uuid,$10::uuid,$11::uuid,$12::uuid,1,now()-interval '90 days',now())
       ON CONFLICT(id) DO UPDATE SET building=EXCLUDED.building,floor=EXCLUDED.floor,room_number=EXCLUDED.room_number,
        full_name=EXCLUDED.full_name,capacity=EXCLUDED.capacity,status=EXCLUDED.status,facilities=EXCLUDED.facilities,
        school_id=EXCLUDED.school_id,campus_id=EXCLUDED.campus_id,organization_id=EXCLUDED.organization_id,
        building_id=EXCLUDED.building_id,version=1,updated_at=now()`,
      [`showcase-classroom-${String(i + 1).padStart(2, '0')}`,building,floor,number,name,capacity,status,
       JSON.stringify(facilities),DEVELOPMENT_SCHOOL_ID,CAMPUS_ID,DEVELOPMENT_ORGANIZATION_IDS.academic,buildingId],
    )
  }
}

async function seedNotifications(client: Client): Promise<void> {
  const rows = [
    ['迎新联合保障行动安排','SYSTEM','PUBLISHED',52,true,-28],
    ['东区公寓热水设备维护提醒','REPAIR','PUBLISHED',41,false,-20],
    ['创新论坛入场与访客核验须知','ACTIVITY','PUBLISHED',46,true,-12],
    ['极端天气校园安全提示','SYSTEM','PUBLISHED',70,true,-8],
    ['教学楼智慧门锁检修完成','REPAIR','PUBLISHED',45,false,-4],
    ['人工智能学院期中考试安排','EXAM','SCHEDULED',45,true,16],
    ['西区草坪音乐节交通组织方案','ACTIVITY','DRAFT',0,false,36],
    ['宿舍消防演练预告','SYSTEM','SCHEDULED',45,true,48],
  ] as const
  for (let i = 0; i < rows.length; i += 1) {
    const [title,type,status,audienceCount,ack,offset] = rows[i]
    await client.query(
      `INSERT INTO notifications(id,title,content,type,publisher_id,target_roles,target_departments,publish_at,expire_at,
        status,views,school_id,audience,channels,audience_count,require_acknowledgement,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,'dev-admin',$5::jsonb,$6::jsonb,$7::timestamptz,$8::timestamptz,$9,$10,$11::uuid,
        $12::jsonb,$13::jsonb,$14,$15,1,$16::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,type=EXCLUDED.type,
        publisher_id=EXCLUDED.publisher_id,target_roles=EXCLUDED.target_roles,target_departments=EXCLUDED.target_departments,
        publish_at=EXCLUDED.publish_at,expire_at=EXCLUDED.expire_at,status=EXCLUDED.status,views=EXCLUDED.views,
        school_id=EXCLUDED.school_id,audience=EXCLUDED.audience,channels=EXCLUDED.channels,
        audience_count=EXCLUDED.audience_count,require_acknowledgement=EXCLUDED.require_acknowledgement,
        version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-notice-${String(i + 1).padStart(2, '0')}`,title,
       `企业演示数据：${title}。使用正式受众解析、投递回执与确认机制。`,type,
       JSON.stringify(['student','teacher']),JSON.stringify(['人工智能学院']),hours(offset),hours(offset + 96),status,
       status === 'PUBLISHED' ? Math.max(1, audienceCount - 7) : 0,DEVELOPMENT_SCHOOL_ID,
       JSON.stringify({ roles: ['student','teacher'], dataset: 'enterprise_showcase' }),JSON.stringify(['platform']),
       audienceCount,ack,hours(offset - 1)],
    )
  }
  for (let n = 1; n <= 5; n += 1) {
    for (let recipient = 1; recipient <= 32; recipient += 1) {
      const mod = (recipient + n) % 10
      const status = mod <= 4 ? 'ACKNOWLEDGED' : mod <= 7 ? 'READ' : mod === 8 ? 'DELIVERED' : 'FAILED'
      const deliveredAt = status === 'FAILED' ? null : hours(-30 + n * 4 + recipient * 0.04)
      await client.query(
        `INSERT INTO notification_deliveries(id,school_id,notification_id,recipient_user_id,channel,status,attempt_count,
          delivered_at,read_at,acknowledged_at,last_error,created_at,updated_at)
         VALUES($1::uuid,$2::uuid,$3,$4,'platform',$5,$6,$7::timestamptz,$8::timestamptz,$9::timestamptz,$10,now()-interval '1 day',now())
         ON CONFLICT(notification_id,recipient_user_id,channel) DO UPDATE SET status=EXCLUDED.status,
          attempt_count=EXCLUDED.attempt_count,delivered_at=EXCLUDED.delivered_at,read_at=EXCLUDED.read_at,
          acknowledged_at=EXCLUDED.acknowledged_at,last_error=EXCLUDED.last_error,updated_at=now()`,
        [uuid(30 + n, recipient),DEVELOPMENT_SCHOOL_ID,`showcase-notice-${String(n).padStart(2,'0')}`,
         uid('student',recipient),status,status === 'FAILED' ? 3 : 1,deliveredAt,
         ['READ','ACKNOWLEDGED'].includes(status) ? deliveredAt : null,status === 'ACKNOWLEDGED' ? deliveredAt : null,
         status === 'FAILED' ? '演示：终端暂不可达，已进入重试队列' : null],
      )
    }
  }
}

async function seedLostFound(client: Client): Promise<void> {
  const rows = [
    ['校园卡','证件','found','未来创新中心服务台','open'],['黑色降噪耳机','数码产品','lost','教学楼 B208','matched'],
    ['银色保温杯','生活用品','found','东区公寓自习室','open'],['实验记录本','学习用品','lost','创新中心 C401','claimed'],
    ['蓝色雨伞','生活用品','found','教学楼南门','returned'],['运动手环','数码产品','lost','东区操场','open'],
    ['钥匙串','生活用品','found','西区食堂','matched'],['学生证','证件','lost','校车 2 号线','returned'],
    ['白色移动电源','数码产品','found','创新中心 A201','claimed'],['高等数学教材','学习用品','lost','教学楼 B405','open'],
    ['眼镜盒','生活用品','found','图书馆连廊','open'],['社团活动工作证','证件','lost','东区草坪','matched'],
  ] as const
  for (let i = 0; i < rows.length; i += 1) {
    const [name,type,kind,location,status] = rows[i]
    const claimed = ['claimed','returned'].includes(status)
    await client.query(
      `INSERT INTO lost_found(id,type,item_type,item_name,description,location,images,reporter_id,status,claimer_id,claimed_at,
        school_id,organization_id,claim_evidence_hash,claim_confirmed_by,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::timestamptz,$12::uuid,$13::uuid,$14,$15,1,$16::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET type=EXCLUDED.type,item_type=EXCLUDED.item_type,item_name=EXCLUDED.item_name,
        description=EXCLUDED.description,location=EXCLUDED.location,images=EXCLUDED.images,reporter_id=EXCLUDED.reporter_id,
        status=EXCLUDED.status,claimer_id=EXCLUDED.claimer_id,claimed_at=EXCLUDED.claimed_at,school_id=EXCLUDED.school_id,
        organization_id=EXCLUDED.organization_id,claim_evidence_hash=EXCLUDED.claim_evidence_hash,
        claim_confirmed_by=EXCLUDED.claim_confirmed_by,version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-lost-${String(i + 1).padStart(2,'0')}`,kind,type,name,
       '企业演示数据：已按隐私最小化原则隐藏识别细节。',location,JSON.stringify([{label:'脱敏图片',demo:true}]),
       uid('student',(i % 40) + 1),status,claimed ? uid('student',((i + 7) % 40) + 1) : null,
       claimed ? hours(-10 + i * 0.3) : null,DEVELOPMENT_SCHOOL_ID,DEVELOPMENT_ORGANIZATION_IDS.student,
       claimed ? `demo-evidence-${i + 1}` : null,claimed ? 'dev-admin' : null,hours(-72 + i * 4)],
    )
  }
}

async function seedDormitorySafety(client: Client): Promise<void> {
  const dorms = [
    ['东区学生公寓 1 号楼',168,156,uid('dorm',1),'normal',BUILDINGS.dormEast],
    ['东区学生公寓 2 号楼',176,169,uid('dorm',2),'attention',BUILDINGS.dormEast],
    ['西区学生公寓 3 号楼',152,141,uid('dorm',3),'normal',BUILDINGS.dormWest],
    ['西区学生公寓 4 号楼',160,148,uid('dorm',4),'maintenance',BUILDINGS.dormWest],
  ] as const
  for (let i = 0; i < dorms.length; i += 1) {
    const [name,total,occupied,manager,status,buildingId] = dorms[i]
    await client.query(
      `INSERT INTO dormitories(id,building_name,total_rooms,occupied_rooms,manager_id,status,school_id,building_id,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,1,now()-interval '180 days',now())
       ON CONFLICT(id) DO UPDATE SET building_name=EXCLUDED.building_name,total_rooms=EXCLUDED.total_rooms,
        occupied_rooms=EXCLUDED.occupied_rooms,manager_id=EXCLUDED.manager_id,status=EXCLUDED.status,
        school_id=EXCLUDED.school_id,building_id=EXCLUDED.building_id,version=1,updated_at=now()`,
      [`showcase-dorm-${String(i + 1).padStart(2,'0')}`,name,total,occupied,manager,status,DEVELOPMENT_SCHOOL_ID,buildingId],
    )
  }
  for (let i = 1; i <= 12; i += 1) {
    const score = 78 + (i * 7) % 21
    await client.query(
      `INSERT INTO dorm_inspections(id,dormitory_id,room_number,inspector_id,inspection_date,score,issues,images,notes,
        school_id,status,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'企业演示巡检记录',$9::uuid,'COMPLETED',1,$10::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET dormitory_id=EXCLUDED.dormitory_id,room_number=EXCLUDED.room_number,
        inspector_id=EXCLUDED.inspector_id,inspection_date=EXCLUDED.inspection_date,score=EXCLUDED.score,
        issues=EXCLUDED.issues,images=EXCLUDED.images,notes=EXCLUDED.notes,school_id=EXCLUDED.school_id,
        status='COMPLETED',version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-dorm-check-${String(i).padStart(2,'0')}`,`showcase-dorm-${String(((i - 1) % 4) + 1).padStart(2,'0')}`,
       `${3 + i}0${(i % 6) + 1}`,uid('dorm',((i - 1) % 4) + 1),new Date(hours(-i * 8)).toISOString().slice(0,10),score,
       JSON.stringify(score < 85 ? ['插线板需规范收纳','消防通道物品待移除'] : []),JSON.stringify([{label:'巡检证据',demo:true}]),
       DEVELOPMENT_SCHOOL_ID,hours(-i * 8)],
    )
  }
  const types = ['electrical_load','smoke_sensor','water_leak','door_open_timeout','temperature_anomaly','electrical_load','water_leak','smoke_sensor']
  const severity = ['critical','high','medium','low','medium','high','high','low']
  const states = ['PENDING_CONFIRMATION','RECTIFICATION_REQUIRED','RESOLVED','FALSE_ALARM','PENDING_CONFIRMATION','ESCALATED','RECTIFICATION_REQUIRED','RESOLVED']
  for (let i = 0; i < types.length; i += 1) {
    const pending = states[i] === 'PENDING_CONFIRMATION'
    await client.query(
      `INSERT INTO dorm_safety_events(id,school_id,building_id,dormitory_id,room_number,event_type,source,severity,
        observed_value,rule_evidence,status,confirmed_by,confirmed_at,confirmation_note,version,created_at,updated_at)
       VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::timestamptz,$14,1,$15::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET building_id=EXCLUDED.building_id,dormitory_id=EXCLUDED.dormitory_id,
        room_number=EXCLUDED.room_number,event_type=EXCLUDED.event_type,source=EXCLUDED.source,severity=EXCLUDED.severity,
        observed_value=EXCLUDED.observed_value,rule_evidence=EXCLUDED.rule_evidence,status=EXCLUDED.status,
        confirmed_by=EXCLUDED.confirmed_by,confirmed_at=EXCLUDED.confirmed_at,confirmation_note=EXCLUDED.confirmation_note,
        version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-safety-${String(i + 1).padStart(2,'0')}`,DEVELOPMENT_SCHOOL_ID,i % 2 ? BUILDINGS.dormWest : BUILDINGS.dormEast,
       `showcase-dorm-${String((i % 4) + 1).padStart(2,'0')}`,`${3 + i}0${(i % 6) + 1}`,types[i],i % 3 === 0 ? 'ANOMALY_MODEL' : 'RULE',severity[i],
       JSON.stringify({value:28 + i * 3,unit:types[i] === 'electrical_load' ? 'A' : 'score'}),
       JSON.stringify({threshold:25,ruleVersion:'campus-safety-2026.3',demo:true}),states[i],
       pending ? null : uid('dorm',(i % 4) + 1),pending ? null : hours(-12 + i),
       pending ? null : '现场复核结论已记录，AI 未代替人工作出处罚判断。',hours(-18 + i * 1.5)],
    )
  }
  for (let i = 1; i <= 24; i += 1) {
    await client.query(
      `INSERT INTO iot_readings(id,school_id,building_id,dormitory_id,room_number,device_id,metric,value,unit,quality,
        observed_at,source_message_id,raw_hash,created_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12,$13,now())
       ON CONFLICT(school_id,source_message_id) DO UPDATE SET value=EXCLUDED.value,quality=EXCLUDED.quality,observed_at=EXCLUDED.observed_at`,
      [uuid(45,i),DEVELOPMENT_SCHOOL_ID,i % 2 ? BUILDINGS.dormEast : BUILDINGS.dormWest,
       `showcase-dorm-${String(((i - 1) % 4) + 1).padStart(2,'0')}`,`${3 + (i % 5)}0${(i % 6) + 1}`,
       `showcase-device-${String(i).padStart(3,'0')}`,i % 3 === 0 ? 'electric_current' : i % 3 === 1 ? 'temperature' : 'humidity',
       20 + (i * 7) % 39,i % 3 === 0 ? 'A' : i % 3 === 1 ? '°C' : '%',i % 11 === 0 ? 'suspect' : 'valid',
       hours(-i * 0.5),`showcase-iot-${String(i).padStart(4,'0')}`,`showcase-raw-hash-${i}`],
    )
  }
}

async function seedHygiene(client: Client): Promise<void> {
  const locations = ['教学楼 B101','教学楼 B208','创新中心 A101','创新中心 C401','东区公寓公共区','西区公寓公共区','教学楼 B405','创新中心 A201','东区草坪','综合能源站值班室']
  const scores = [96,91,87,72,68,83,89,76,94,81]
  for (let i = 0; i < locations.length; i += 1) {
    await client.query(
      `INSERT INTO hygiene_inspections(id,school_id,organization_id,building_id,class_id,location,inspector_id,inspected_at,
        deterministic_score,ai_advisory_score,evidence,status,version,created_at,updated_at)
       VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'dev-hygiene',$7::timestamptz,$8,$9,$10::jsonb,'COMPLETED',1,$11::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET organization_id=EXCLUDED.organization_id,building_id=EXCLUDED.building_id,
        class_id=EXCLUDED.class_id,location=EXCLUDED.location,inspector_id=EXCLUDED.inspector_id,inspected_at=EXCLUDED.inspected_at,
        deterministic_score=EXCLUDED.deterministic_score,ai_advisory_score=EXCLUDED.ai_advisory_score,evidence=EXCLUDED.evidence,
        status='COMPLETED',version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-hygiene-${String(i + 1).padStart(2,'0')}`,DEVELOPMENT_SCHOOL_ID,DEVELOPMENT_ORGANIZATION_IDS.academic,
       i < 4 ? BUILDINGS.teaching : i < 8 ? BUILDINGS.innovation : DEVELOPMENT_BUILDING_ID,DEVELOPMENT_CLASS_ID,locations[i],
       hours(-42 + i * 3),scores[i],Math.min(99,scores[i] + (i % 2 ? 2 : -1)),
       JSON.stringify([{type:'photo',label:'现场照片已脱敏',hash:`showcase-hygiene-${i + 1}`,demo:true}]),hours(-42 + i * 3)],
    )
  }
  const states = ['OPEN','IN_PROGRESS','SUBMITTED','VERIFIED','ESCALATED','OPEN','VERIFIED']
  const severity = ['medium','high','medium','low','critical','high','medium']
  for (let i = 0; i < 7; i += 1) {
    await client.query(
      `INSERT INTO hygiene_rectifications(id,school_id,inspection_id,assignee_id,created_by,requirements,severity,due_at,
        status,evidence,version,created_at,updated_at)
       VALUES($1::uuid,$2::uuid,$3,$4,'dev-hygiene',$5::jsonb,$6,$7::timestamptz,$8,$9::jsonb,1,$10::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET inspection_id=EXCLUDED.inspection_id,assignee_id=EXCLUDED.assignee_id,
        requirements=EXCLUDED.requirements,severity=EXCLUDED.severity,due_at=EXCLUDED.due_at,status=EXCLUDED.status,
        evidence=EXCLUDED.evidence,version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [uuid(41,i + 1),DEVELOPMENT_SCHOOL_ID,`showcase-hygiene-${String(i + 3).padStart(2,'0')}`,uid('student',i + 1),
       JSON.stringify(['清理责任区域','上传整改后现场证据','由检查员复核']),severity[i],i === 4 ? hours(-3) : hours(18 + i * 5),
       states[i],JSON.stringify(states[i] === 'VERIFIED' ? [{label:'整改复核证据',demo:true}] : []),hours(-30 + i * 2)],
    )
  }
}

async function seedVisitors(client: Client): Promise<void> {
  const names = ['林嘉诚','周雨桐','陈工','王老师','许文博','赵琳','孙师傅','郑可欣','郭明远','吴晓舟','何静','蒋宁']
  const states = ['PENDING','PENDING','PENDING','APPROVED','APPROVED','REJECTED','ADMITTED','COMPLETED','PENDING','APPROVED','REJECTED','COMPLETED']
  const purposes = ['参加创新论坛','探访学生','设备维保','学术交流','家长来访','资料不完整','空调巡检','毕业材料交接','社团活动保障','导师会面','预约时段冲突','后勤项目验收']
  for (let i = 0; i < names.length; i += 1) {
    const state = states[i]
    const approved = ['APPROVED','ADMITTED','COMPLETED'].includes(state)
    const decided = state !== 'PENDING'
    const visitAt = futureDay((i % 5) + 1,9 + (i % 6))
    const until = approved ? new Date(Date.parse(visitAt) + 3 * 3_600_000).toISOString() : null
    await client.query(
      `INSERT INTO visitors(id,dormitory_id,room_number,visitor_name,visitor_phone,purpose,visit_time,leave_time,
        school_id,building_id,host_id,applicant_id,status,decision_by,decision_at,decision_rationale,qr_token_hash,
        qr_valid_from,qr_valid_until,qr_used_at,qr_revoked_at,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9::uuid,$10::uuid,$11,$12,$13,$14,
        $15::timestamptz,$16,$17,$18::timestamptz,$19::timestamptz,$20::timestamptz,NULL,1,$21::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET dormitory_id=EXCLUDED.dormitory_id,room_number=EXCLUDED.room_number,
        visitor_name=EXCLUDED.visitor_name,visitor_phone=EXCLUDED.visitor_phone,purpose=EXCLUDED.purpose,
        visit_time=EXCLUDED.visit_time,leave_time=EXCLUDED.leave_time,school_id=EXCLUDED.school_id,
        building_id=EXCLUDED.building_id,host_id=EXCLUDED.host_id,applicant_id=EXCLUDED.applicant_id,status=EXCLUDED.status,
        decision_by=EXCLUDED.decision_by,decision_at=EXCLUDED.decision_at,decision_rationale=EXCLUDED.decision_rationale,
        qr_token_hash=EXCLUDED.qr_token_hash,qr_valid_from=EXCLUDED.qr_valid_from,qr_valid_until=EXCLUDED.qr_valid_until,
        qr_used_at=EXCLUDED.qr_used_at,qr_revoked_at=NULL,version=1,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-visitor-${String(i + 1).padStart(2,'0')}`,`showcase-dorm-${String((i % 4) + 1).padStart(2,'0')}`,
       `${3 + (i % 5)}0${(i % 6) + 1}`,names[i],`1380000${1000 + i}`,purposes[i],visitAt,
       state === 'COMPLETED' ? new Date(Date.parse(visitAt) + 2 * 3_600_000).toISOString() : null,
       DEVELOPMENT_SCHOOL_ID,i % 2 ? BUILDINGS.dormWest : BUILDINGS.dormEast,uid('student',(i % 40) + 1),
       uid('student',(i % 40) + 1),state,decided ? 'dev-dorm' : null,decided ? hours(-8 + i * 0.3) : null,
       decided ? (state === 'REJECTED' ? '预约信息不完整，已通知补充材料' : '身份与被访人预约已人工核验') : null,
       approved ? `showcase-qr-${i + 1}` : null,approved ? visitAt : null,until,
       ['ADMITTED','COMPLETED'].includes(state) ? visitAt : null,hours(-16 + i * 0.6)],
    )
  }
}

async function seedEnergy(client: Client): Promise<string[]> {
  const assets = [
    ['HVAC-SOUTH-01','创新中心中央空调 1 号机组','hvac','active',420,BUILDINGS.innovation],
    ['PUMP-ENERGY-02','综合能源站循环水泵 2 号','pump','maintenance',180,BUILDINGS.energy],
    ['LIGHT-TEACH-01','教学楼智能照明回路','lighting','active',95,BUILDINGS.teaching],
    ['HOTWATER-DORM-E','东区公寓空气源热泵','heat_pump','active',260,BUILDINGS.dormEast],
    ['SOLAR-WEST-01','西区公寓屋顶光伏阵列','photovoltaic','active',150,BUILDINGS.dormWest],
  ] as const
  const primary: string[] = []
  let ordinal = 1
  for (let a = 0; a < assets.length; a += 1) {
    const [code,name,type,state,capacity,buildingId] = assets[a]
    const assetId = `showcase-energy-${String(a + 1).padStart(2,'0')}`
    await client.query(
      `INSERT INTO energy_assets(id,school_id,building_id,asset_code,name,asset_type,status,rated_capacity,metadata,version,created_at,updated_at)
       VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,1,now()-interval '240 days',now())
       ON CONFLICT(id) DO UPDATE SET building_id=EXCLUDED.building_id,asset_code=EXCLUDED.asset_code,name=EXCLUDED.name,
        asset_type=EXCLUDED.asset_type,status=EXCLUDED.status,rated_capacity=EXCLUDED.rated_capacity,
        metadata=EXCLUDED.metadata,version=1,updated_at=now()`,
      [assetId,DEVELOPMENT_SCHOOL_ID,buildingId,code,name,type,state,capacity,
       JSON.stringify({dataset:'enterprise_showcase',simulated:true,telemetryContract:'meter.v2'})],
    )
    for (let r = 0; r < 12; r += 1) {
      const readingId = uuid(50 + a,r + 1)
      if (a === 0) primary.push(readingId)
      const base = [278,116,62,188,92][a]
      await client.query(
        `INSERT INTO energy_readings(id,school_id,asset_id,metric,value,unit,quality,observed_at,source,source_record_id,created_at)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,'kW',$6,$7::timestamptz,'showcase_meter',$8,now())
         ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,quality=EXCLUDED.quality,observed_at=EXCLUDED.observed_at,
          source=EXCLUDED.source,source_record_id=EXCLUDED.source_record_id`,
        [readingId,DEVELOPMENT_SCHOOL_ID,assetId,a === 4 ? 'generated_power' : 'electricity_load',
         base + r * (a === 0 ? 4.2 : 1.7) + ((r * 7) % 11),r === 10 && a === 1 ? 'suspect' : 'valid',
         hours(-(12 - r)),`showcase-reading-${String(ordinal++).padStart(4,'0')}`],
      )
    }
  }
  return primary
}

async function seedMaterialsDuties(client: Client): Promise<void> {
  const materials = [
    ['应急照明灯','安全保障',86,'套',30,'normal','综合仓 A-01'],
    ['智能门锁控制器','智能设备',12,'台',8,'normal','综合仓 B-03'],
    ['空气过滤器滤芯','设备耗材',18,'件',20,'warning','能源仓 C-02'],
    ['消防门闭门器','安全保障',9,'套',12,'warning','综合仓 A-05'],
    ['网络信息面板','网络设备',44,'个',15,'normal','信息仓 D-01'],
    ['水龙头感应模块','维修备件',6,'个',10,'warning','维修仓 B-08'],
    ['环保垃圾袋','保洁耗材',320,'卷',100,'normal','保洁仓 E-01'],
    ['消毒清洁剂','保洁耗材',74,'桶',40,'normal','保洁仓 E-03'],
    ['投影机激光模组','教学设备',3,'件',4,'warning','教学仓 F-02'],
    ['UPS 电池组','电气设备',0,'组',3,'out_of_stock','能源仓 C-06'],
    ['防水密封组件','维修备件',27,'套',12,'normal','维修仓 B-10'],
    ['一次性访客证卡','通行耗材',480,'张',200,'normal','安保仓 G-01'],
  ] as const
  for (let i = 0; i < materials.length; i += 1) {
    await client.query(
      `INSERT INTO materials(id,school_id,organization_id,name,category,quantity,unit,threshold,status,location,created_at,updated_at)
       VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,now()-interval '120 days',now())
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,quantity=EXCLUDED.quantity,
        unit=EXCLUDED.unit,threshold=EXCLUDED.threshold,status=EXCLUDED.status,location=EXCLUDED.location,updated_at=now()`,
      [`showcase-material-${String(i + 1).padStart(2,'0')}`,DEVELOPMENT_SCHOOL_ID,DEVELOPMENT_ORGANIZATION_IDS.logistics,...materials[i]],
    )
  }
  const requestStates = ['pending','approved','issued','rejected','approved','pending']
  for (let i = 0; i < 6; i += 1) {
    await client.query(
      `INSERT INTO material_requests(id,school_id,material_id,quantity,requester_id,reason,status,reviewer_id,review_note,created_at,updated_at)
       VALUES($1,$2::uuid,$3,$4,$5,'企业演示：关联真实维修工单的备件领用申请',$6,$7,$8,$9::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET material_id=EXCLUDED.material_id,quantity=EXCLUDED.quantity,
        requester_id=EXCLUDED.requester_id,reason=EXCLUDED.reason,status=EXCLUDED.status,reviewer_id=EXCLUDED.reviewer_id,
        review_note=EXCLUDED.review_note,created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-material-request-${String(i + 1).padStart(2,'0')}`,DEVELOPMENT_SCHOOL_ID,`showcase-material-${String(i + 1).padStart(2,'0')}`,
       2 + i * 3,uid('repairman',(i % 6) + 1),requestStates[i],requestStates[i] === 'pending' ? null : 'dev-logistics',
       requestStates[i] === 'rejected' ? '库存不足，建议替代件' : requestStates[i] === 'pending' ? null : '已核对工单与库存',hours(-20 + i * 2)],
    )
  }
  const dutyStates = ['PENDING','IN_PROGRESS','COMPLETED','CHECKED']
  for (let i = 0; i < 14; i += 1) {
    const day = new Date()
    day.setDate(day.getDate() + i - 5)
    await client.query(
      `INSERT INTO duty_schedules(id,school_id,organization_id,class_id,duty_date,class_name,location,students,duty_type,status,notes,created_at,updated_at)
       VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5,'智造工程 2026-1 班',$6,$7::jsonb,$8,$9,'企业演示排班：与卫生检查和整改闭环关联。',$10::timestamptz,now())
       ON CONFLICT(id) DO UPDATE SET duty_date=EXCLUDED.duty_date,class_name=EXCLUDED.class_name,location=EXCLUDED.location,
        students=EXCLUDED.students,duty_type=EXCLUDED.duty_type,status=EXCLUDED.status,notes=EXCLUDED.notes,
        created_at=EXCLUDED.created_at,updated_at=now()`,
      [`showcase-duty-${String(i + 1).padStart(2,'0')}`,DEVELOPMENT_SCHOOL_ID,DEVELOPMENT_ORGANIZATION_IDS.academic,DEVELOPMENT_CLASS_ID,day.toISOString().slice(0,10),
       i % 2 ? '星海南区教学楼 B208' : '未来创新中心公共区',
       JSON.stringify([uid('student',(i % 40) + 1),uid('student',((i + 1) % 40) + 1),uid('student',((i + 2) % 40) + 1)]),
       i % 3 === 0 ? '公共区域巡检' : '班级卫生',dutyStates[i % dutyStates.length],hours(-60 + i * 2)],
    )
  }
}

interface TaskRef { id: string; state: string }

async function seedAgentHistory(client: Client, readingIds: string[]): Promise<TaskRef[]> {
  const { createAndPlanAiTask, decideAiTask } = await import('@/lib/ai/runtime/orchestrator')
  const admin = getDevelopmentUser('admin')
  if (!admin) throw new Error('Development super administrator is unavailable')
  const tasks: TaskRef[] = []

  const repair = await createAndPlanAiTask(admin, {
    command: '白泽，启动报修 SLA 压降行动：将三项高优先级工单分派给合适工程师，并把处置进度通知相关师生。',
    skillId: 'repair_dispatch',
    params: { count: 3, reason: '企业演示：高优先级工单 SLA 压降行动' },
    workflow: [{
      skillId: 'notification_publish', title: '灵鹊同步报修处置进展',
      params: {
        title: '高优先级报修已进入联合处置',
        content: '白泽已完成责任分配，工程师正在按 SLA 推进；后续进度将持续回传。',
        type: 'REPAIR', audience: { roles: ['student'], userIds: [], organizationIds: [] },
        channels: ['platform'], requireAcknowledgement: false,
      },
    }],
    idempotencyKey: 'showcase.enterprise.repair-sla.v1',
  })
  const completedRepair = repair.state === 'AWAITING_APPROVAL'
    ? await decideAiTask(admin, repair.id, 'approve', '人工核对工单、责任人和通知受众后批准') : repair
  tasks.push({ id: completedRepair.id, state: completedRepair.state })
  console.log(`  Agent 场景：报修 SLA 联合处置 -> ${completedRepair.state}`)

  const maintenance = await createAndPlanAiTask(admin, {
    command: '白泽，研判创新中心中央空调负荷走势，生成预测性维护建议；先停在人工裁决台。',
    skillId: 'maintenance_recommendation_create',
    params: {
      assetId: 'showcase-energy-01', readingIds: readingIds.slice(0, 8),
      recommendedAction: '检查冷凝器换热效率、压缩机轴承与制冷剂压力，并安排低峰时段维护',
      rationale: '连续八个质量合格的计量周期呈现负荷抬升，且未发现采集质量异常，需要人工确认维护窗口',
      confidence: 0.88, dueAt: futureDay(5, 18), estimatedSavingsKwh: 286,
    },
    idempotencyKey: 'showcase.enterprise.energy-review.v1',
  })
  tasks.push({ id: maintenance.id, state: maintenance.state })
  console.log(`  Agent 场景：预测性维护人工裁决 -> ${maintenance.state}`)

  const visitorPreview = await createAndPlanAiTask(admin, {
    command: '白泽，对第二项访客申请生成准入拒绝预览，我要先核对理由，不得自动落库。',
    skillId: 'visitor_approve',
    params: { visitorApplicationId: 'showcase-visitor-02', decision: 'reject', rationale: '来访材料缺少被访人二次确认，建议补齐后重新提交' },
    idempotencyKey: 'showcase.enterprise.visitor-safe-reject.v1',
  })
  const cancelled = visitorPreview.state === 'AWAITING_APPROVAL'
    ? await decideAiTask(admin, visitorPreview.id, 'reject', '人工决定暂不执行，先联系被访人补充确认；业务数据未改变') : visitorPreview
  tasks.push({ id: cancelled.id, state: cancelled.state })
  console.log(`  Agent 场景：访客准入安全阻断 -> ${cancelled.state}`)

  const eventStart = futureDay(4, 14)
  const eventEnd = new Date(Date.parse(eventStart) + 3 * 3_600_000).toISOString()
  const visitorFrom = new Date(Date.parse(eventStart) - 30 * 60_000).toISOString()
  const visitorUntil = new Date(Date.parse(eventEnd) + 30 * 60_000).toISOString()
  const flagship = await createAndPlanAiTask(admin, {
    command: '周六举办数智校园创新论坛。白泽，请统筹锁定星云报告厅、完成嘉宾准入，并向师生发布活动通知。',
    skillId: 'classroom_book',
    params: { classroomId: 'showcase-classroom-01', startsAt: eventStart, endsAt: eventEnd, purpose: '数智校园创新论坛与企业级 Agent 成果展示', attendeeCount: 260 },
    workflow: [
      {
        skillId: 'visitor_approve', title: '獬豸核验论坛嘉宾准入',
        params: { visitorApplicationId: 'showcase-visitor-01', decision: 'approve', rationale: '会务负责人已完成人工身份与邀请函核验', validFrom: visitorFrom, validUntil: visitorUntil },
      },
      {
        skillId: 'notification_publish', title: '灵鹊发布论坛协同通知',
        params: {
          title: '数智校园创新论坛会务通知',
          content: '论坛场地与嘉宾通行已确认。请参会师生按电子通知中的时段和入口有序签到。',
          type: 'ACTIVITY', audience: { roles: ['student','teacher'], userIds: [], organizationIds: [] },
          channels: ['platform'], requireAcknowledgement: true,
        },
      },
    ],
    idempotencyKey: 'showcase.enterprise.flagship-forum.v1',
  })
  const completedFlagship = flagship.state === 'AWAITING_APPROVAL'
    ? await decideAiTask(admin, flagship.id, 'approve', '会务负责人已核对场地、访客与通知预览，同意三支分灵体并行执行') : flagship
  tasks.push({ id: completedFlagship.id, state: completedFlagship.state })
  console.log(`  Agent 场景：创新论坛三 Agent 联合保障 -> ${completedFlagship.state}`)

  const feedback = [
    [uuid(61,1),completedFlagship.id,5,'三支分灵体交接清楚，场地、访客、通知均完成回读。','applied'],
    [uuid(61,2),completedRepair.id,4,'派单和通知闭环有效，后续可增加工程师位置和备件权重。','reviewed'],
    [uuid(61,3),cancelled.id,5,'系统正确停在人工裁决点，拒绝后没有发生访客业务写入。','applied'],
  ] as const
  for (const [id,taskId,rating,comment,status] of feedback) {
    await client.query(
      `INSERT INTO ai_feedback_events(id,school_id,task_id,user_id,rating,outcome,comment,status,reviewed_by,reviewed_at,created_at,updated_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,'dev-admin',$4,'helpful',$5,$6,'dev-ai_ops',now(),now(),now())
       ON CONFLICT(school_id,task_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,outcome=EXCLUDED.outcome,
        comment=EXCLUDED.comment,status=EXCLUDED.status,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now(),updated_at=now()`,
      [id,DEVELOPMENT_SCHOOL_ID,taskId,rating,comment,status],
    )
  }
  return tasks
}

async function seed(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true })
  loadDotEnv({ quiet: true })
  if (process.env.NODE_ENV === 'production') throw new Error('Enterprise showcase data cannot be seeded in production')
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  let committed = false
  try {
    console.log('SEED enterprise showcase: domain records')
    await client.query('BEGIN')
    await client.query(
      `UPDATE schools SET settings=COALESCE(settings,'{}'::jsonb) || $2::jsonb,updated_at=now() WHERE id=$1::uuid`,
      [DEVELOPMENT_SCHOOL_ID,JSON.stringify({showcase:{kind:'simulated',label:'企业演示数据集',version:SHOWCASE_VERSION,executionMode:'real_governed_runtime'}})],
    )
    await seedPeopleAndBuildings(client)
    console.log('  人员与组织：56 名演示人员、5 栋业务楼宇')
    await seedRepairs(client)
    await seedClassrooms(client)
    await seedNotifications(client)
    await seedLostFound(client)
    console.log('  服务运营：18 工单、10 教室、8 通知、12 失物记录')
    await seedDormitorySafety(client)
    await seedHygiene(client)
    await seedVisitors(client)
    console.log('  校园安全：4 宿舍、8 安全事件、10 卫生检查、12 访客申请')
    const readingIds = await seedEnergy(client)
    await seedMaterialsDuties(client)
    console.log('  资源保障：5 资产/60 读数、12 类物资、14 项值日安排')
    await client.query('COMMIT')
    committed = true

    console.log('SEED enterprise showcase: governed Agent task history')
    const tasks = await seedAgentHistory(client, readingIds)
    const result = await client.query(
      `SELECT
        (SELECT count(*) FROM users WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS people,
        (SELECT count(*) FROM repair_orders WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS repairs,
        (SELECT count(*) FROM notification_deliveries WHERE school_id=$1::uuid)::int AS deliveries,
        (SELECT count(*) FROM energy_readings WHERE school_id=$1::uuid AND source='showcase_meter')::int AS readings,
        (SELECT count(*) FROM ai_business_effects WHERE school_id=$1::uuid AND status='VERIFIED')::int AS verified_effects,
        (SELECT count(*) FROM ai_feedback_events WHERE school_id=$1::uuid)::int AS feedback`,
      [DEVELOPMENT_SCHOOL_ID],
    )
    const c = result.rows[0]
    console.log(`SEEDED enterprise showcase ${SHOWCASE_VERSION}: people=${c.people} repairs=${c.repairs} deliveries=${c.deliveries} readings=${c.readings} tasks=${tasks.length} verifiedEffects=${c.verified_effects} feedback=${c.feedback}`)
  } catch (error) {
    if (!committed) await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
    try {
      const { getPostgresPool } = await import('@/storage/database/postgres')
      await getPostgresPool().end()
    } catch { /* runtime pool was not created */ }
  }
}

seed().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
