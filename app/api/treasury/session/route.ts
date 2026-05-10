import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, verifyWalletSignature } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { buildDefaultPolicy } from '@/lib/zerionTreasury'
import { dbSaveAutonomySession, dbUpdateAgent } from '@/lib/supabase'

interface SessionBody {
  agentId?: unknown
  budget?: unknown
  wallet?: unknown
  message?: unknown
  signature?: unknown
  expiresAt?: unknown
}

export interface AutonomySessionResponse {
  id: string
  expiresAt: string
  spendLimit: number
  allowedTokens: string[]
  allowedActions: string[]
  active: boolean
  persisted: boolean
  message: string
  signature: string
  signer: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`autonomy-session:${session.wallet}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many autonomy requests.' }, { status: 429 })
  }

  let body: SessionBody
  try {
    body = (await req.json()) as SessionBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : ''
  const budget = typeof body.budget === 'number' ? body.budget : Number.NaN
  const wallet = typeof body.wallet === 'string' ? body.wallet : ''
  const message = typeof body.message === 'string' ? body.message : ''
  const signature = typeof body.signature === 'string' ? body.signature : ''
  const requestedExpiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : ''
  if (!agentId || !Number.isFinite(budget) || budget <= 0) {
    return NextResponse.json({ error: 'Invalid autonomy session request.' }, { status: 400 })
  }
  if (wallet !== session.wallet || !message || !signature) {
    return NextResponse.json({ error: 'Missing signed autonomy authorization.' }, { status: 400 })
  }

  const policy = buildDefaultPolicy(agentId, budget)
  const expiresMs = Date.parse(requestedExpiresAt)
  const maxExpiresMs = Date.now() + 24 * 60 * 60 * 1000 + 60_000
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() || expiresMs > maxExpiresMs) {
    return NextResponse.json({ error: 'Autonomy expiry must be within the next 24 hours.' }, { status: 400 })
  }
  policy.expiresAt = requestedExpiresAt
  if (!message.includes('Authorize Forge autonomous agent') ||
      !message.includes(`Agent ID: ${agentId}`) ||
      !message.includes('Chain: solana-devnet') ||
      !message.includes(`Expires At: ${policy.expiresAt}`)) {
    return NextResponse.json({ error: 'Autonomy message does not match required policy.' }, { status: 400 })
  }
  const sigValid = await verifyWalletSignature(wallet, message, signature)
  if (!sigValid) {
    return NextResponse.json({ error: 'Autonomy signature verification failed.' }, { status: 401 })
  }

  const id = `as-${agentId}-${Date.now()}`
  const persisted = await dbSaveAutonomySession({
    id,
    agent_id: agentId,
    expires_at: policy.expiresAt,
    spend_limit: policy.spendLimitUsdc,
    allowed_tokens: policy.allowedTokens,
    allowed_actions: policy.allowedActions,
    signer: wallet,
    signed_message: message,
    signature,
    active: policy.active,
  })
  await dbUpdateAgent(agentId, session.wallet, {
    autonomy_active: true,
    autonomy_expires_at: policy.expiresAt,
    autonomy_signature: signature,
    autonomy_message: message,
    autonomy_signer: wallet,
  })

  return NextResponse.json({
    id,
    expiresAt: policy.expiresAt,
    spendLimit: policy.spendLimitUsdc,
    allowedTokens: policy.allowedTokens,
    allowedActions: policy.allowedActions,
    active: policy.active,
    persisted,
    message,
    signature,
    signer: wallet,
  } satisfies AutonomySessionResponse)
}
