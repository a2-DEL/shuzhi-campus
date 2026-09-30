import { parseCommandToSkill } from '@/lib/ai/runtime/command-parser'

export { parseCommandToSkill }

export interface LegacySkillExecutionResult {
  success: false
  data: { error: string }
  message: string
  requiresConfirmation: false
  auditLog: {
    operation: string
    input: Record<string, unknown>
    output: { error: string }
    agentId: string
    riskLevel: 'high'
  }
}

/**
 * Removed execution boundary. Business writes must use the versioned enterprise
 * Skill Gateway; this compatibility symbol fails closed for any stale caller.
 */
export async function executeSkill(
  skillName: string,
  params: Record<string, unknown>,
  context: { taskId: string; agentId: string; userId?: string; userRole: string }
): Promise<LegacySkillExecutionResult> {
  const error = 'LEGACY_SKILL_EXECUTOR_DISABLED: use Prepare/Preview/Approve/Revalidate/Commit/Verify through the enterprise Skill Gateway'
  throw Object.assign(new Error(error), {
    code: 'LEGACY_SKILL_EXECUTOR_DISABLED',
    skillName,
    taskId: context.taskId,
    agentId: context.agentId,
    inputKeys: Object.keys(params),
  })
}
