import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/authorization'
import { getAuthUser } from '@/lib/auth'
import type { AiProductSkill } from '@/lib/ai/product-types'
import { ENTERPRISE_SKILL_ALIASES, listEnterpriseSkillContracts } from '@/lib/ai/skills/registry'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  const query = request.nextUrl.searchParams
  const loop = query.get('business_loop')
  const risk = query.get('risk_level')
  const availableOnly = query.get('available') === 'true'
  const skills: AiProductSkill[] = listEnterpriseSkillContracts().map((contract) => {
    const decision = authorize(user, { permission: contract.requiredPermission, allowedRoles: [...contract.allowedRoles] })
    return {
      key: contract.key,
      id: contract.id,
      version: contract.version,
      businessLoop: contract.businessLoop,
      displayName: contract.displayName,
      description: contract.description,
      owner: contract.owner,
      permission: contract.requiredPermission,
      allowedRoles: contract.allowedRoles,
      riskLevel: contract.riskLevel,
      approvalPolicy: contract.approvalPolicy,
      timeoutMs: contract.timeoutMs,
      retryPolicy: contract.retryPolicy,
      rateLimit: contract.rateLimit,
      auditPolicy: contract.auditPolicy,
      compensation: contract.compensation,
      evalSet: contract.evalSet,
      immutable: true as const,
      published: true as const,
      availableToCurrentUser: decision.allowed,
      authorizationReason: decision.reason,
      runtimeAliases: Object.entries(ENTERPRISE_SKILL_ALIASES).filter(([, key]) => key === contract.key).map(([alias]) => alias),
    }
  }).filter((skill) => !loop || skill.businessLoop === loop)
    .filter((skill) => !risk || skill.riskLevel === risk)
    .filter((skill) => !availableOnly || skill.availableToCurrentUser)

  return NextResponse.json({ success: true, data: { skills, total: skills.length, immutable: true } })
}

export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Published enterprise Skill versions are immutable and can only be introduced through reviewed code and migrations',
    code: 'IMMUTABLE_SKILL_REGISTRY',
  }, { status: 405 })
}
