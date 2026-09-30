import './assert-isolated-test-environment.mjs'
import { getDevelopmentUser } from '@/lib/development-users'
import { listAgentTeamCards } from '@/lib/ai/runtime/agent-catalog'
import { buildAiPlan, classifyAiCommand, listAiSkills } from '@/lib/ai/runtime/planner'
import { createAndPlanAiTask, decideAiTask } from '@/lib/ai/runtime/orchestrator'
import { canTransitionAiTask } from '@/lib/ai/runtime/state-machine'
import { clearAiRuntimeForTests } from '@/lib/ai/runtime/store'

// This verifier targets deterministic runtime state; production uses the PostgreSQL adapter.
process.env.AI_DATABASE_MODE = 'memory'

async function main() {
  let assertions = 0
  function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
    assertions += 1
  }

  const dispatchCommand = '\u8bf7\u4e3a\u5f85\u5904\u7406\u62a5\u4fee\u5de5\u5355\u6267\u884c\u667a\u80fd\u6d3e\u5355'
  const teams = listAgentTeamCards()
  expect(teams.length === 14, `expected 14 role teams, got ${teams.length}`)
  for (const team of teams) {
    expect(Boolean(team.coordinator.id && team.coordinator.name), `${team.role} coordinator missing`)
    expect(team.members.length >= 2, `${team.role} team has fewer than two members`)
    expect(team.members.every((member) => member.id && member.skills.length > 0), `${team.role} member card incomplete`)
  }

  const skills = listAiSkills()
  expect(skills.length >= 12, 'governed AI skill catalog incomplete')
  expect(new Set(skills.map((skill) => skill.id)).size === skills.length, 'skill ids must be unique')

  const admin = getDevelopmentUser('admin')
  const student = getDevelopmentUser('student')
  expect(Boolean(admin && student), 'development identities unavailable')

  const intent = classifyAiCommand(dispatchCommand)
  expect(intent.skillId === 'smart_dispatch' && intent.mode === 'execute', 'dispatch intent classification failed')
  const plan = buildAiPlan(admin!, dispatchCommand, intent)
  expect(plan.plan.subtasks.length === 1, 'governed dispatch must contain one atomic business-effect node')
  expect(plan.skill.gatewaySkillKey === 'repair.dispatch.commit.v1', 'dispatch must bind the immutable enterprise adapter')
  expect(plan.plan.completionCriteria.some((item) => item.verifier === 'skill_gateway_verify'), 'Skill Gateway verification criterion missing')
  expect(plan.approvalPolicy === 'single_approval', 'single dispatch must require single approval policy')
  expect(plan.policyAllowed, 'super admin dispatch should pass policy check')

  const studentCommand = '\u8bf7\u6267\u884c\u667a\u80fd\u6d3e\u5355'
  const studentPlan = buildAiPlan(student!, studentCommand, classifyAiCommand(studentCommand))
  expect(!studentPlan.policyAllowed && studentPlan.policyReason === 'permission_denied', 'student must not be allowed to dispatch repairs')
  expect(!canTransitionAiTask('COMPLETED', 'RUNNING'), 'completed task must not return to running')
  expect(canTransitionAiTask('AWAITING_APPROVAL', 'QUEUED'), 'approved task must be able to enter queue')

  clearAiRuntimeForTests()
  const task = await createAndPlanAiTask(admin!, { command: dispatchCommand })
  expect(task.state === 'AWAITING_APPROVAL', `write task must await approval, got ${task.state}`)
  expect(task.nodes.every((node) => node.state === 'PENDING'), 'approval preview must not execute member nodes')
  expect(task.messages.some((item) => item.type === 'approval_request'), 'approval request message missing')
  expect(task.summary === undefined, 'approval preview must not claim a completion summary')

  const rejected = await decideAiTask(admin!, task.id, 'reject', 'approval rejected in verifier')
  expect(rejected.state === 'CANCELLED', 'rejected task must be cancelled')
  expect(rejected.nodes.every((node) => node.state === 'CANCELLED'), 'rejected nodes must be cancelled')
  expect(rejected.approval?.status === 'REJECTED', 'approval decision must be recorded')

  console.log(`PASS AI runtime verifier: roles=${teams.length}/14 skills=${skills.length} assertions=${assertions}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
