import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbDeleteAgent, dbLoadAgent } from '@/lib/supabase'
import { dbAgentToAgent } from '@/lib/agentMapper'

interface RouteContext {
  params: {
    id: string
  }
}

export interface DeleteAgentResponse {
  success: boolean
  agentId: string
  detail: string
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const agentId = ctx.params.id
  if (!agentId) return NextResponse.json({ error: 'Missing agent id.' }, { status: 400 })

  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  return NextResponse.json({ agent: dbAgentToAgent(agent) })
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`agent-delete:${session.wallet}`, 8, 60_000)) {
    return NextResponse.json({ error: 'Too many delete requests.' }, { status: 429 })
  }

  const agentId = ctx.params.id
  if (!agentId) return NextResponse.json({ error: 'Missing agent id.' }, { status: 400 })

  const deleted = await dbDeleteAgent(agentId, session.wallet)
  if (!deleted) {
    return NextResponse.json({ error: 'Agent not found for this wallet, so nothing was deleted.' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    agentId,
    detail: 'Agent retired and related Supabase rows removed by cascade.',
  } satisfies DeleteAgentResponse)
}
