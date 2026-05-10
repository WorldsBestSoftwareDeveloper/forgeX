import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { validateAgentName, validateBudget, rateLimit, sanitiseString } from '@/lib/security'
import { generateTreasuryKeypair, encryptSecretKey } from '@/lib/treasuryCrypto'
import { dbSaveAgent, dbSaveTreasuryWallet } from '@/lib/supabase'

interface CreateTreasuryBody {
  agentId?: unknown
  name?: unknown
  budget?: unknown
}

export interface CreateTreasuryResponse {
  agentId: string
  publicKey: string
  persisted: boolean
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Sign in first.' }, { status: 401 })
  }
  if (rateLimit(`treasury-create:${session.wallet}`, 12, 60_000)) {
    return NextResponse.json({ error: 'Too many treasury requests.' }, { status: 429 })
  }

  let body: CreateTreasuryBody
  try {
    body = (await req.json()) as CreateTreasuryBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? sanitiseString(body.agentId, 80) : ''
  const name = typeof body.name === 'string' ? sanitiseString(body.name, 32) : ''
  const budget = typeof body.budget === 'number' ? body.budget : Number.NaN

  if (!agentId || !validateAgentName(name) || !validateBudget(budget)) {
    return NextResponse.json({ error: 'Invalid agent treasury request.' }, { status: 400 })
  }

  const keypair = generateTreasuryKeypair()
  const publicKey = keypair.publicKey.toBase58()
  const encryptedPrivateKey = encryptSecretKey(keypair.secretKey)

  const agentSaved = await dbSaveAgent({
    id: agentId,
    wallet_address: session.wallet,
    name,
    budget,
    spent: 0,
    status: 'idle',
    last_task: 'No tasks yet',
    success_rate: 100,
    task_count: 0,
    treasury_wallet: publicKey,
    autonomy_active: false,
    autonomy_expires_at: null,
    autonomy_signature: null,
    autonomy_message: null,
    autonomy_signer: null,
    treasury_sol: 0,
    treasury_usdc: budget,
    treasury_tx_count: 0,
    zerion_wallet_name: `forge-${agentId}`,
  })

  const walletSaved = await dbSaveTreasuryWallet({
    id: `tw-${agentId}`,
    agent_id: agentId,
    public_key: publicKey,
    encrypted_private_key: encryptedPrivateKey,
  })

  return NextResponse.json({
    agentId,
    publicKey,
    persisted: agentSaved && walletSaved,
  } satisfies CreateTreasuryResponse)
}
