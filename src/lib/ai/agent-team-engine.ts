export interface DeprecatedTeamExecutionResult {
  taskId: string
  status: 'failed'
  chatMessages: []
  steps: []
  requiresHumanConfirmation: false
}

function removed(): never {
  throw Object.assign(
    new Error('LEGACY_AGENT_TEAM_ENGINE_DISABLED: use the durable Agent runtime and enterprise Skill Gateway'),
    { code: 'LEGACY_AGENT_TEAM_ENGINE_DISABLED' }
  )
}

/** @deprecated Replaced by src/lib/ai/runtime/orchestrator.ts. */
export async function executeTeamTask(): Promise<DeprecatedTeamExecutionResult> {
  return removed()
}

/** @deprecated Approval now belongs to the durable task state machine. */
export async function confirmAndContinue(): Promise<DeprecatedTeamExecutionResult> {
  return removed()
}
