import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, verifyWalletSignature } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbLoadAgent, dbLoadTreasuryWallet, dbSaveTreasuryAction } from '@/lib/supabase'
import { decryptSecretKey } from '@/lib/treasuryCrypto'
import { executeZerionSolanaUsdcToSolSwap } from '@/lib/zerionCli'

interface RebalanceBody {
  agentId?: unknown
  targetSol?: unknown
  walletName?: unknown
  amountUsdc?: unknown
  policyMessage?: unknown
  policySignature?: unknown
  policySigner?: unknown
}

export interface RebalanceResponse {
  success: boolean
  signature?: string
  mode: 'zerion-cli-swap' | 'unavailable'
  detail: string
  command?: string
  stdout?: string
  stderr?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`treasury-rebalance:${session.wallet}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many rebalance requests.' }, { status: 429 })
  }

  let body: RebalanceBody
  try {
    body = (await req.json()) as RebalanceBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  const walletName = typeof body.walletName === 'string' ? body.walletName : `forge-${agentId}`
  const targetSol = typeof body.targetSol === 'number' ? body.targetSol : 0.08
  const amountUsdc = typeof body.amountUsdc === 'number' ? body.amountUsdc : 1
  const policyMessage = typeof body.policyMessage === 'string' ? body.policyMessage : ''
  const policySignature = typeof body.policySignature === 'string' ? body.policySignature : ''
  const policySigner = typeof body.policySigner === 'string' ? body.policySigner : ''
  if (!agentId || !Number.isFinite(targetSol) || targetSol <= 0 || targetSol > 0.2) {
    return NextResponse.json({ error: 'Invalid rebalance request.' }, { status: 400 })
  }
  if (policySigner !== session.wallet || !policyMessage || !policySignature) {
    return NextResponse.json({ error: 'Missing signed autonomy policy proof.' }, { status: 401 })
  }
  if (!policyMessage.includes(`Agent ID: ${agentId}`) ||
      !policyMessage.includes('Chain: solana-devnet') ||
      !policyMessage.includes('gas-rebalance')) {
    return NextResponse.json({ error: 'Autonomy policy does not allow gas rebalance.' }, { status: 403 })
  }
  const expiryMatch = policyMessage.match(/^Expires At: (.+)$/m)
  const expiresAt = expiryMatch?.[1] ? Date.parse(expiryMatch[1]) : Number.NaN
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ error: 'Autonomy policy is expired.' }, { status: 403 })
  }
  const policyValid = await verifyWalletSignature(policySigner, policyMessage, policySignature)
  if (!policyValid) {
    return NextResponse.json({ error: 'Invalid autonomy policy signature.' }, { status: 401 })
  }

  if (process.env.ZERION_SOLANA_NETWORK !== 'devnet') {
    return NextResponse.json({
      success: false,
      mode: 'unavailable',
      detail: 'Set ZERION_SOLANA_NETWORK=devnet before allowing treasury rebalances from Forge.',
    } satisfies RebalanceResponse, { status: 409 })
  }

  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent?.autonomy_active) {
    return NextResponse.json({ error: 'Autonomy is not active for this agent.' }, { status: 403 })
  }
  const treasury = await dbLoadTreasuryWallet(agentId)
  if (!treasury) {
    return NextResponse.json({ error: 'No encrypted treasury wallet found for this agent.' }, { status: 409 })
  }

  const result = await executeZerionSolanaUsdcToSolSwap({
    agentId,
    walletName,
    amountUsdc,
    slippagePercent: 2,
    solanaSecretKey: decryptSecretKey(treasury.encrypted_private_key),
  })

  if (!result.ok || !result.hash) {
    const detail = `Zerion CLI swap did not execute. ${result.error ?? 'Unknown CLI error'}`
    return NextResponse.json({
      success: false,
      mode: 'unavailable',
      error: detail,
      detail,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
    }, { status: 502 })
  }

  await dbSaveTreasuryAction({
    id: `ta-${Date.now()}`,
    agent_id: agentId,
    type: 'gas-rebalance',
    token_in: 'USDC',
    token_out: 'SOL',
    amount: amountUsdc,
    tx_signature: result.hash,
  })

  return NextResponse.json({
    success: true,
    signature: result.hash,
    mode: 'zerion-cli-swap',
    detail: `Zerion CLI executed USDC to SOL swap for wallet ${walletName}.`,
    command: result.command,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies RebalanceResponse)
}
