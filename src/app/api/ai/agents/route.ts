import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { listAgentTeamCards } from '@/lib/ai/runtime/agent-catalog'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  const teams = listAgentTeamCards()
  const agents = teams.flatMap((team) => [team.coordinator, ...team.members].map((agent) => ({
    ...agent,
    teamRole: team.role,
    teamRoleLabel: team.roleLabel,
  })))
  return NextResponse.json({
    success: true,
    data: {
      totalRoles: teams.length,
      totalTeams: teams.length,
      totalAgents: agents.length,
      teams: Object.fromEntries(teams.map((team) => [team.role, team])),
      agents,
    },
  })
}
