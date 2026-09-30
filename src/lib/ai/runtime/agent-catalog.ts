import { ROLE_LABELS, UserRole } from '@/types'
import { AiAgentCard, AiAgentTeamCard } from './types'

interface TeamConfig {
  avatar: string
  capabilities: string[]
  skills: string[]
  memberCapabilities: string[][]
  memberSkills: string[][]
}

const CONFIGS: Record<UserRole, TeamConfig> = {
  [UserRole.AI_OPS_ADMIN]: { avatar: '\u{1f6e1}', capabilities: ['ai.observe', 'ai.recover', 'ai.debug', 'ai.governance', 'ai.configure'], skills: ['data_report', 'knowledge_search'], memberCapabilities: [['ai.observe', 'ai.governance'], ['ai.recover', 'ai.debug'], ['ai.configure', 'ai.evaluate']], memberSkills: [['data_report', 'knowledge_search'], ['data_report'], ['knowledge_search']] },
  [UserRole.SUPER_ADMIN]: { avatar: '\u{1f451}', capabilities: ['system.coordinate', 'analytics.report', 'permission.govern', 'repair.query', 'repair.dispatch', 'notification.send'], skills: ['data_report', 'permission_change', 'query_repairs', 'smart_dispatch', 'batch_dispatch', 'send_notification', 'repair_policy_guard', 'repair_dispatch', 'notification_publish', 'classroom_book', 'lost_found_claim', 'hygiene_rectification_create', 'dorm_safety_confirm', 'visitor_approve', 'maintenance_recommendation_create'], memberCapabilities: [['permission.govern', 'policy.review'], ['analytics.report', 'repair.query', 'inventory.query'], ['system.coordinate', 'repair.dispatch', 'notification.send']], memberSkills: [['permission_change', 'repair_policy_guard'], ['data_report', 'query_repairs', 'query_materials'], ['smart_dispatch', 'batch_dispatch', 'send_notification', 'repair_dispatch', 'notification_publish', 'classroom_book', 'lost_found_claim', 'hygiene_rectification_create', 'dorm_safety_confirm', 'visitor_approve', 'maintenance_recommendation_create']] },
  [UserRole.DEPT_ADMIN]: { avatar: '\u{1f3db}', capabilities: ['department.coordinate', 'classroom.query', 'notification.send', 'duty.plan'], skills: ['query_classrooms', 'send_notification', 'generate_duty', 'data_report', 'classroom_book', 'notification_publish'], memberCapabilities: [['department.coordinate', 'analytics.report'], ['classroom.query', 'notification.send']], memberSkills: [['data_report'], ['query_classrooms', 'send_notification', 'classroom_book', 'notification_publish']] },
  [UserRole.DEPT_HYGIENE_MANAGER]: { avatar: '\u{1f9f9}', capabilities: ['hygiene.coordinate', 'duty.plan', 'analytics.report'], skills: ['generate_duty', 'data_report', 'hygiene_rectification_create'], memberCapabilities: [['analytics.report', 'hygiene.analyze'], ['hygiene.coordinate', 'duty.plan']], memberSkills: [['data_report'], ['generate_duty', 'hygiene_rectification_create']] },
  [UserRole.DEPT_HYGIENE_ADMIN]: { avatar: '\u{1f9fd}', capabilities: ['hygiene.inspect', 'duty.plan'], skills: ['generate_duty', 'data_report', 'hygiene_rectification_create'], memberCapabilities: [['hygiene.inspect'], ['duty.plan']], memberSkills: [['data_report'], ['generate_duty', 'hygiene_rectification_create']] },
  [UserRole.COUNSELOR]: { avatar: '\u{1f9d1}\u{200d}\u{1f3eb}', capabilities: ['student.coordinate', 'duty.query', 'notification.query', 'analytics.report'], skills: ['data_report', 'knowledge_search'], memberCapabilities: [['student.coordinate', 'knowledge.search'], ['analytics.report', 'duty.query']], memberSkills: [['knowledge_search'], ['data_report']] },
  [UserRole.TEACHER]: { avatar: '\u{1f4da}', capabilities: ['classroom.query', 'knowledge.search', 'notification.query'], skills: ['query_classrooms', 'knowledge_search', 'classroom_book'], memberCapabilities: [['classroom.query'], ['knowledge.search']], memberSkills: [['query_classrooms', 'classroom_book'], ['knowledge_search']] },
  [UserRole.LOGISTICS_MANAGER]: { avatar: '\u{1f69a}', capabilities: ['repair.query', 'repair.dispatch', 'inventory.query', 'inventory.approve', 'notification.send', 'analytics.report'], skills: ['query_repairs', 'smart_dispatch', 'batch_dispatch', 'query_materials', 'approve_material', 'send_notification', 'data_report', 'repair_policy_guard', 'repair_dispatch', 'notification_publish'], memberCapabilities: [['repair.query', 'repair.dispatch'], ['inventory.query', 'inventory.approve'], ['analytics.report']], memberSkills: [['query_repairs', 'smart_dispatch', 'batch_dispatch', 'repair_dispatch', 'repair_policy_guard'], ['query_materials', 'approve_material'], ['data_report', 'notification_publish', 'repair_policy_guard']] },
  [UserRole.LOGISTICS_ADMIN]: { avatar: '\u{1f6e0}', capabilities: ['repair.query', 'repair.dispatch', 'inventory.query', 'inventory.approve'], skills: ['query_repairs', 'smart_dispatch', 'batch_dispatch', 'query_materials', 'approve_material', 'repair_policy_guard', 'repair_dispatch'], memberCapabilities: [['repair.query', 'repair.dispatch'], ['inventory.query', 'inventory.approve']], memberSkills: [['query_repairs', 'smart_dispatch', 'batch_dispatch', 'repair_dispatch', 'repair_policy_guard'], ['query_materials', 'approve_material']] },
  [UserRole.REPAIRMAN]: { avatar: '\u{1f528}', capabilities: ['repair.query', 'repair.process', 'inventory.query'], skills: ['query_repairs', 'query_materials', 'knowledge_search'], memberCapabilities: [['repair.query', 'repair.process'], ['knowledge.search', 'inventory.query']], memberSkills: [['query_repairs'], ['knowledge_search', 'query_materials']] },
  [UserRole.DORM_MANAGER]: { avatar: '\u{1f3e2}', capabilities: ['dorm.query', 'dorm.coordinate', 'notification.send', 'analytics.report'], skills: ['dorm_inspection', 'send_notification', 'data_report', 'notification_publish', 'dorm_safety_confirm', 'visitor_approve', 'maintenance_recommendation_create'], memberCapabilities: [['dorm.query', 'analytics.report'], ['dorm.coordinate', 'notification.send']], memberSkills: [['dorm_inspection', 'data_report', 'dorm_safety_confirm', 'maintenance_recommendation_create'], ['send_notification', 'notification_publish', 'visitor_approve']] },
  [UserRole.DORM_KEEPER]: { avatar: '\u{1f3e0}', capabilities: ['dorm.query', 'dorm.inspect', 'visitor.check'], skills: ['dorm_inspection', 'knowledge_search', 'dorm_safety_confirm', 'visitor_approve'], memberCapabilities: [['dorm.query', 'dorm.inspect'], ['knowledge.search', 'visitor.check']], memberSkills: [['dorm_inspection', 'dorm_safety_confirm'], ['knowledge_search', 'visitor_approve']] },
  [UserRole.CLASS_COMMITTEE]: { avatar: '\u{1f393}', capabilities: ['duty.plan', 'repair.create', 'repair.query', 'classroom.query', 'knowledge.search'], skills: ['generate_duty', 'query_repairs', 'query_classrooms', 'knowledge_search', 'classroom_book', 'lost_found_claim'], memberCapabilities: [['duty.plan'], ['repair.query', 'classroom.query', 'knowledge.search']], memberSkills: [['generate_duty'], ['query_repairs', 'query_classrooms', 'knowledge_search', 'classroom_book', 'lost_found_claim']] },
  [UserRole.STUDENT]: { avatar: '\u{1f31f}', capabilities: ['repair.create', 'repair.query', 'classroom.query', 'knowledge.search'], skills: ['query_repairs', 'query_classrooms', 'knowledge_search', 'lost_found_claim'], memberCapabilities: [['classroom.query', 'knowledge.search'], ['repair.create', 'repair.query']], memberSkills: [['query_classrooms', 'knowledge_search'], ['query_repairs', 'lost_found_claim']] },
}

function slug(role: UserRole): string {
  return role.replaceAll('_', '-')
}

function buildTeam(role: UserRole): AiAgentTeamCard {
  const config = CONFIGS[role]
  const prefix = slug(role)
  const roleLabel = ROLE_LABELS[role]
  const coordinator: AiAgentCard = {
    id: `${prefix}-coordinator`,
    name: `\u767d\u6cfd\u00b7${roleLabel}\u603b\u8c03\u5ea6`,
    role: 'coordinator',
    avatar: config.avatar,
    description: `${roleLabel}\u7684\u4e13\u5c5e\u767d\u6cfd\u603b\u8c03\u5ea6\u5b98\uff0c\u8d1f\u8d23\u62c6\u89e3\u3001\u5206\u53d1\u3001\u76d1\u63a7\u4e0e\u5f52\u6574\u6c47\u62a5`,
    capabilities: config.capabilities,
    skills: config.skills,
  }
  return {
    role,
    roleLabel,
    coordinator,
    members: config.memberSkills.map((skills, index) => {
      const persona = getSpiritPersonaForSkill(skills[0] ?? '')
      return {
        id: `${prefix}-member-${index + 1}`,
        name: `${persona.name}\u00b7${index + 1}\u5e2d`,
        role: index === 0 ? 'planner' : 'specialist',
        avatar: persona.avatar,
        description: `${persona.calling}\uff0c\u670d\u52a1\u4e8e${roleLabel}\u4e1a\u52a1\u95ed\u73af`,
        capabilities: config.memberCapabilities[index],
        skills,
      }
    }),
  }
}

const AGENT_TEAM_CATALOG = Object.fromEntries(
  Object.values(UserRole).map((role) => [role, buildTeam(role)])
) as Record<UserRole, AiAgentTeamCard>

export function getRoleAgentTeam(role: UserRole): AiAgentTeamCard {
  return AGENT_TEAM_CATALOG[role]
}

export function listAgentTeamCards(): AiAgentTeamCard[] {
  return Object.values(UserRole).map((role) => AGENT_TEAM_CATALOG[role])
}

export function selectAgentForSkill(role: UserRole, skillId: string): AiAgentCard {
  const team = getRoleAgentTeam(role)
  return team.members.find((member) => member.skills.includes(skillId)) ?? team.coordinator
}

export interface AiSpiritPersona {
  name: string
  avatar: string
  calling: string
}

export function getSpiritPersonaForSkill(skillId: string): AiSpiritPersona {
  if (['notification_publish', 'send_notification'].includes(skillId)) {
    return { name: '\u7075\u9e4a\u00b7\u6d88\u606f\u5206\u7075', avatar: '\u{1f54a}\ufe0f', calling: '\u8854\u4fe1\u7a7f\u4e91\uff0c\u8d1f\u8d23\u6d88\u606f\u89e6\u8fbe\u3001\u56de\u6267\u4e0e\u4e3b\u52a8\u63d0\u9192' }
  }
  if (['repair_policy_guard', 'visitor_approve', 'lost_found_claim', 'permission_change'].includes(skillId)) {
    return { name: '\u736c\u8c78\u00b7\u5408\u89c4\u5206\u7075', avatar: '\u2696\ufe0f', calling: '\u8fa8\u662f\u975e\u3001\u5b88\u8fb9\u754c\uff0c\u8d1f\u8d23\u5408\u89c4\u6838\u9a8c\u3001\u98ce\u9669\u62e6\u622a\u4e0e\u4eba\u5de5\u88c1\u51b3' }
  }
  if (['classroom_book', 'query_classrooms'].includes(skillId)) {
    return { name: '\u9752\u9e3e\u00b7\u7a7a\u95f4\u5206\u7075', avatar: '\u{1f426}', calling: '\u5de1\u6e38\u7a7a\u95f4\u661f\u56fe\uff0c\u8d1f\u8d23\u573a\u5730\u5339\u914d\u3001\u5bb9\u91cf\u5224\u65ad\u4e0e\u51b2\u7a81\u6821\u9a8c' }
  }
  if (['data_report', 'knowledge_search', 'maintenance_recommendation_create'].includes(skillId)) {
    return { name: '\u70db\u7167\u00b7\u6d1e\u5bdf\u5206\u7075', avatar: '\u{1f50e}', calling: '\u7167\u89c1\u6570\u636e\u8109\u7edc\uff0c\u8d1f\u8d23\u7814\u5224\u3001\u6eaf\u6e90\u4e0e\u56de\u8bfb\u6c42\u8bc1' }
  }
  return { name: '\u58a8\u9f9f\u00b7\u540e\u52e4\u5206\u7075', avatar: '\u{1f422}', calling: '\u8d1f\u7532\u7a33\u884c\uff0c\u8d1f\u8d23\u540e\u52e4\u3001\u5de5\u5355\u3001\u8d44\u6e90\u4e0e\u73b0\u573a\u95ed\u73af' }
}
