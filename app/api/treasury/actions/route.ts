import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { dbLoadAgent, dbLoadTreasuryActions } from '@/lib/supabase'

export interface TreasuryActionItem {
  id: string
  agentId: string
  type: string
  detail: string
  amount: number
  txSignature?: string
  status: 'simulated' | 'validated' | 'executed' | 'rejected'
  createdAt: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const agentId = req.nextUrl.searchParams.get('agentId') ?? ''
  if (!agentId) return NextResponse.json({ error: 'Missing agentId.' }, { status: 400 })

  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const actions = await dbLoadTreasuryActions(agentId)
  const mapped: TreasuryActionItem[] = actions.map(action => ({
    id: action.id,
    agentId: action.agent_id,
    type: action.type,
    detail: action.tx_signature
      ? `${action.type} executed with tx ${action.tx_signature}`
      : action.type,
    amount: Number(action.amount),
    txSignature: action.tx_signature ?? undefined,
    status: action.tx_signature ? 'executed' : action.type === 'emergency-pause' ? 'executed' : 'validated',
    createdAt: action.created_at,
  }))

  return NextResponse.json({ actions: mapped })
}
