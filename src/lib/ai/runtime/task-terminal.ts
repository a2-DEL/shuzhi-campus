// PARTIAL is resumable; an approval rejection is represented as CANCELLED in the current state machine.
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'COMPENSATED'])

export function isTerminalAiTaskState(state: string): boolean {
  return TERMINAL_STATES.has(state)
}
