// GET /api/auth/nonce?wallet=<solana-pubkey>
// Returns a one-time nonce for the client to sign with Phantom.
// The nonce expires in 5 minutes and is single-use.

import { NextRequest, NextResponse } from 'next/server'
import { buildSignMessage, generateNonce } from '@/lib/auth'
import { rateLimit, validateWalletAddress } from '@/lib/security'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = req.nextUrl.searchParams.get('wallet') ?? ''

  const limited = rateLimit(`nonce:${wallet}`, 10, 60_000)
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    )
  }

  if (!validateWalletAddress(wallet)) {
    return NextResponse.json(
      { error: 'Invalid wallet address' },
      { status: 400 },
    )
  }

  const nonce = generateNonce(wallet)
  const message = buildSignMessage(wallet, nonce)

  return NextResponse.json({ nonce, message })
}
