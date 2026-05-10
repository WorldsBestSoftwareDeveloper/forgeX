import { NextRequest, NextResponse } from 'next/server'
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { getSessionFromRequest, verifyWalletSignature } from '@/lib/auth'
import { rateLimit, validateProviderId } from '@/lib/security'
import { dbLoadAgent, dbLoadTreasuryWallet } from '@/lib/supabase'
import { decryptSecretKey } from '@/lib/treasuryCrypto'
import { executeMagicBlockTransfer } from '@/lib/magicblock'
import { MAX_SINGLE_TX_USDC } from '@/lib/config'

interface TreasuryPaymentBody {
  agentId?: unknown
  providerId?: unknown
  toAddress?: unknown
  amountUsdc?: unknown
  erSessionId?: unknown
  policyMessage?: unknown
  policySignature?: unknown
  policySigner?: unknown
}

export interface TreasuryPaymentResponse {
  success: boolean
  signature: string
  usedRealPayment: true
  erSessionId: string
  treasuryWallet: string
}

function signMessage(keypair: Keypair, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, keypair.secretKey)
}

function signTransaction<T extends Transaction | VersionedTransaction>(keypair: Keypair, tx: T): T {
  if (tx instanceof VersionedTransaction) {
    tx.sign([keypair])
    return tx
  }
  tx.partialSign(keypair)
  return tx
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`treasury-payment:${session.wallet}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many treasury payment requests.' }, { status: 429 })
  }

  let body: TreasuryPaymentBody
  try {
    body = (await req.json()) as TreasuryPaymentBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  const providerId = typeof body.providerId === 'string' ? body.providerId : ''
  const toAddress = typeof body.toAddress === 'string' ? body.toAddress : ''
  const amountUsdc = typeof body.amountUsdc === 'number' ? body.amountUsdc : Number.NaN
  const erSessionId = typeof body.erSessionId === 'string' ? body.erSessionId : ''
  const policyMessage = typeof body.policyMessage === 'string' ? body.policyMessage : ''
  const policySignature = typeof body.policySignature === 'string' ? body.policySignature : ''
  const policySigner = typeof body.policySigner === 'string' ? body.policySigner : ''

  if (!agentId || !validateProviderId(providerId) || !toAddress || !erSessionId) {
    return NextResponse.json({ error: 'Invalid treasury payment request.' }, { status: 400 })
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0 || amountUsdc > MAX_SINGLE_TX_USDC) {
    return NextResponse.json({ error: 'Treasury payment exceeds single-transaction policy.' }, { status: 403 })
  }
  if (policySigner !== session.wallet || !policyMessage || !policySignature) {
    return NextResponse.json({ error: 'Missing signed autonomy policy proof.' }, { status: 401 })
  }
  if (!policyMessage.includes(`Agent ID: ${agentId}`) ||
      !policyMessage.includes('provider-payment') ||
      !policyMessage.includes('Chain: solana-devnet')) {
    return NextResponse.json({ error: 'Autonomy policy does not allow provider payment.' }, { status: 403 })
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

  const treasury = await dbLoadTreasuryWallet(agentId)
  if (!treasury) {
    return NextResponse.json({ error: 'No encrypted treasury wallet found for this agent.' }, { status: 409 })
  }

  const keypair = Keypair.fromSecretKey(decryptSecretKey(treasury.encrypted_private_key))
  if (keypair.publicKey.toBase58() !== treasury.public_key) {
    return NextResponse.json({ error: 'Treasury key does not match stored public key.' }, { status: 409 })
  }

  let result: { signature: string }
  try {
    result = await executeMagicBlockTransfer({
      wallet: {
        publicKey: keypair.publicKey,
        signMessage: (msg) => Promise.resolve(signMessage(keypair, msg)),
        signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) =>
          Promise.resolve(signTransaction(keypair, tx)),
      },
      toAddress,
      amountUsdc,
      erSessionId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MagicBlock treasury payment failed.'
    const detail = /fetch failed|recent blockhash/i.test(message)
      ? `${message}. Check that the server can reach Solana devnet RPC and MagicBlock devnet endpoints.`
      : message
    return NextResponse.json({
      error: detail,
    }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    signature: result.signature,
    usedRealPayment: true,
    erSessionId,
    treasuryWallet: treasury.public_key,
  } satisfies TreasuryPaymentResponse)
}
