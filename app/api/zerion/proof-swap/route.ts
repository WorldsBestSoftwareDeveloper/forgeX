import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, verifyWalletSignature } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbLoadAgent, dbLoadZerionExecutionWallet, dbSaveTreasuryAction } from '@/lib/supabase'
import { decryptSecretKey } from '@/lib/treasuryCrypto'
import { executeZerionSolanaUsdcToSolSwap } from '@/lib/zerionCli'

const MAINNET_RPC = process.env.ZERION_MAINNET_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'

interface ProofSwapBody {
  agentId?: unknown
  amountUsdc?: unknown
  policyMessage?: unknown
  policySignature?: unknown
  policySigner?: unknown
}

export interface ZerionProofSwapResponse {
  success: boolean
  signature?: string
  walletName?: string
  walletAddress?: string
  amountUsdc: number
  network: 'solana-mainnet'
  detail: string
  command?: string
  stdout?: string
  stderr?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`zerion-proof-swap:${session.wallet}`, 4, 60_000)) {
    return NextResponse.json({ error: 'Too many Zerion proof swap requests.' }, { status: 429 })
  }

  let body: ProofSwapBody
  try {
    body = (await req.json()) as ProofSwapBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  const amountUsdc = typeof body.amountUsdc === 'number' ? body.amountUsdc : 1
  const policyMessage = typeof body.policyMessage === 'string' ? body.policyMessage : ''
  const policySignature = typeof body.policySignature === 'string' ? body.policySignature : ''
  const policySigner = typeof body.policySigner === 'string' ? body.policySigner : ''

  if (!agentId || !Number.isFinite(amountUsdc) || amountUsdc <= 0 || amountUsdc > 1) {
    return NextResponse.json({ error: 'Invalid proof swap request. Max is 1 USDC.' }, { status: 400 })
  }
  if (policySigner !== session.wallet || !policyMessage || !policySignature) {
    return NextResponse.json({ error: 'Missing signed autonomy policy proof.' }, { status: 401 })
  }
  if (!policyMessage.includes(`Agent ID: ${agentId}`) ||
      !policyMessage.includes('zerion-proof-swap') ||
      !policyMessage.includes('Chain: solana-mainnet')) {
    return NextResponse.json({ error: 'Autonomy policy does not allow Zerion mainnet proof swap.' }, { status: 403 })
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

  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent?.autonomy_active) {
    return NextResponse.json({ error: 'Autonomy is not active for this agent.' }, { status: 403 })
  }
  const wallet = await dbLoadZerionExecutionWallet(agentId)
  if (!wallet) {
    return NextResponse.json({ error: 'Create the Zerion mainnet execution wallet first.' }, { status: 409 })
  }

  const result = await executeZerionSolanaUsdcToSolSwap({
    agentId,
    walletName: wallet.wallet_name,
    amountUsdc,
    slippagePercent: 2,
    solanaSecretKey: decryptSecretKey(wallet.encrypted_private_key),
    solanaRpcUrl: MAINNET_RPC,
  })

  if (!result.ok || !result.hash) {
    const detail = `Zerion mainnet proof swap did not execute. ${result.error ?? 'Unknown CLI error'}`
    await dbSaveTreasuryAction({
      id: `ta-${Date.now()}`,
      agent_id: agentId,
      type: 'zerion-proof-swap',
      token_in: 'USDC',
      token_out: 'SOL',
      amount: amountUsdc,
      tx_signature: null,
    })
    return NextResponse.json({
      success: false,
      amountUsdc,
      network: 'solana-mainnet',
      detail,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
    } satisfies ZerionProofSwapResponse, { status: 502 })
  }

  await dbSaveTreasuryAction({
    id: `ta-${Date.now()}`,
    agent_id: agentId,
    type: 'zerion-proof-swap',
    token_in: 'USDC',
    token_out: 'SOL',
    amount: amountUsdc,
    tx_signature: result.hash,
  })

  return NextResponse.json({
    success: true,
    signature: result.hash,
    walletName: wallet.wallet_name,
    walletAddress: wallet.public_key,
    amountUsdc,
    network: 'solana-mainnet',
    detail: `Zerion CLI executed real Solana mainnet proof swap for ${amountUsdc} USDC.`,
    command: result.command,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies ZerionProofSwapResponse)
}
