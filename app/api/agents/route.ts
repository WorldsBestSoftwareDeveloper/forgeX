import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { dbLoadAgents } from '@/lib/supabase'
import { dbAgentToAgent, type AgentListItem } from '@/lib/agentMapper'

export type { AgentListItem }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const agents = await dbLoadAgents(session.wallet)
  return NextResponse.json({ agents: agents.map(dbAgentToAgent) })
}
