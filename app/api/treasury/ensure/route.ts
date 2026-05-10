import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbLoadAgent, dbLoadTreasuryWallet, dbSaveTreasuryWallet, dbUpdateAgent } from '@/lib/supabase'
import { encryptSecretKey, generateTreasuryKeypair } from '@/lib/treasuryCrypto'

interface EnsureTreasuryBody {
  agentId?: unknown
}

export interface EnsureTreasuryResponse {
  success: boolean
  agentId: string
  publicKey: string
  created: boolean
  detail: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`treasury-ensure:${session.wallet}`, 12, 60_000)) {
    return NextResponse.json({ error: 'Too many treasury repair requests.' }, { status: 429 })
  }

  let body: EnsureTreasuryBody
  try {
    body = (await req.json()) as EnsureTreasuryBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  if (!agentId) return NextResponse.json({ error: 'Missing agent id.' }, { status: 400 })

  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent) return NextResponse.json({ error: 'Agent not found for this wallet.' }, { status: 404 })

  const existing = await dbLoadTreasuryWallet(agentId)
  if (existing) {
    if (agent.treasury_wallet !== existing.public_key) {
      await dbUpdateAgent(agentId, session.wallet, { treasury_wallet: existing.public_key })
    }
    return NextResponse.json({
      success: true,
      agentId,
      publicKey: existing.public_key,
      created: false,
      detail: 'Encrypted treasury wallet already exists.',
    } satisfies EnsureTreasuryResponse)
  }

  const keypair = generateTreasuryKeypair()
  const publicKey = keypair.publicKey.toBase58()
  const walletSaved = await dbSaveTreasuryWallet({
    id: `tw-${agentId}`,
    agent_id: agentId,
    public_key: publicKey,
    encrypted_private_key: encryptSecretKey(keypair.secretKey),
  })
  const agentUpdated = await dbUpdateAgent(agentId, session.wallet, {
    treasury_wallet: publicKey,
    treasury_sol: 0,
    treasury_usdc: Number(agent.budget) - Number(agent.spent),
    treasury_tx_count: agent.treasury_tx_count ?? 0,
    zerion_wallet_name: agent.zerion_wallet_name ?? `forge-${agentId}`,
  })

  if (!walletSaved || !agentUpdated) {
    return NextResponse.json({ error: 'Could not create encrypted treasury wallet for this agent.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    agentId,
    publicKey,
    created: true,
    detail: 'Created a real encrypted devnet treasury wallet for this existing agent.',
  } satisfies EnsureTreasuryResponse)
}
