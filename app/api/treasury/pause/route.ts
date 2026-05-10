import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbDeactivateAutonomySessions, dbSaveTreasuryAction, dbUpdateAgent } from '@/lib/supabase'

interface PauseBody {
  agentId?: unknown
}

export interface PauseAutonomyResponse {
  success: boolean
  agentId: string
  detail: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`treasury-pause:${session.wallet}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many pause requests.' }, { status: 429 })
  }

  let body: PauseBody
  try {
    body = (await req.json()) as PauseBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  if (!agentId) return NextResponse.json({ error: 'Missing agentId.' }, { status: 400 })

  await dbDeactivateAutonomySessions(agentId)
  await dbUpdateAgent(agentId, session.wallet, {
    autonomy_active: false,
    autonomy_expires_at: null,
    autonomy_signature: null,
    autonomy_message: null,
    autonomy_signer: null,
  })
  await dbSaveTreasuryAction({
    id: `pause-${Date.now()}`,
    agent_id: agentId,
    type: 'emergency-pause',
    token_in: null,
    token_out: null,
    amount: 0,
    tx_signature: null,
  })

  return NextResponse.json({
    success: true,
    agentId,
    detail: 'Autonomous execution paused. Rebalance and autonomous spending now require a new authorization signature.',
  } satisfies PauseAutonomyResponse)
}
