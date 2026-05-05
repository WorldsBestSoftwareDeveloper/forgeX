// POST /api/auth/verify
// Body: { wallet: string, nonce: string, signature: string (base64) }
// Verifies ed25519 signature, returns JWT session token on success.

import { NextRequest, NextResponse } from 'next/server'
import {
  buildSignMessage,
  consumeNonce,
  createSessionToken,
  verifyWalletSignature,
} from '@/lib/auth'
import { validateWalletAddress, rateLimit } from '@/lib/security'
import { dbUpsertUser } from '@/lib/supabase'

interface VerifyBody {
  wallet:    string
  nonce:     string
  signature: string  // base64-encoded ed25519 signature from Phantom
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit: max 5 verify attempts per wallet per minute (brute force guard)
  let body: VerifyBody
  try {
    body = (await req.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { wallet, nonce, signature } = body

  const limited = rateLimit(`verify:${wallet}`, 5, 60_000)
  if (limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait 1 minute.' },
      { status: 429 }
    )
  }

  // Validate inputs
  if (!validateWalletAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }
  if (!nonce || typeof nonce !== 'string' || nonce.length !== 64) {
    return NextResponse.json({ error: 'Invalid nonce' }, { status: 400 })
  }
  if (!signature || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Verify nonce is valid and unconsumed
  const nonceValid = consumeNonce(wallet, nonce)
  if (!nonceValid) {
    return NextResponse.json(
      { error: 'Invalid or expired nonce. Request a new one.' },
      { status: 401 }
    )
  }

  // Reconstruct the exact message that was signed
  const message = buildSignMessage(wallet, nonce)

  // Verify ed25519 signature against the wallet pubkey
  const sigValid = await verifyWalletSignature(wallet, message, signature)
  if (!sigValid) {
    return NextResponse.json(
      { error: 'Signature verification failed' },
      { status: 401 }
    )
  }

  // Create session token (JWT signed server-side)
  const token = await createSessionToken(wallet)

  // Upsert user record in Supabase (creates on first login)
  await dbUpsertUser(wallet)

  return NextResponse.json({
    token,
    wallet,
    message: 'Authenticated successfully',
  })
}
