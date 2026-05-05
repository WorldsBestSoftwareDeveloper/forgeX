// ─── Wallet-based authentication ──────────────────────────────────────────────
import * as jose from 'jose'
import { AUTH_SECRET, JWT_DURATION, NONCE_TTL_MS } from './config'

// ─── Nonce store (in-memory, single-use, TTL enforced) ────────────────────────
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>()

export function generateNonce(wallet: string): string {
  nonceStore.delete(wallet)
  const nonce = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('')
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + NONCE_TTL_MS })
  return nonce
}

export function consumeNonce(wallet: string, nonce: string): boolean {
  const stored = nonceStore.get(wallet)
  if (!stored || Date.now() > stored.expiresAt || stored.nonce !== nonce) {
    nonceStore.delete(wallet)
    return false
  }
  nonceStore.delete(wallet)
  return true
}

export function buildSignMessage(wallet: string, nonce: string): string {
  return [
    'Sign in to Forge',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    '',
    'This signature proves wallet ownership.',
    'No transaction is made and no gas is consumed.',
  ].join('\n')
}

// ─── Ed25519 signature verification ──────────────────────────────────────────
export async function verifyWalletSignature(
  walletAddress: string,
  message:       string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const { PublicKey }   = await import('@solana/web3.js')
    const nacl            = await import('tweetnacl')
    const pubkey          = new PublicKey(walletAddress)
    const msgBytes        = new TextEncoder().encode(message)
    const sigBytes        = Buffer.from(signatureBase64, 'base64')
    return nacl.default.sign.detached.verify(msgBytes, sigBytes, pubkey.toBytes())
  } catch { return false }
}

// ─── JWT session token ────────────────────────────────────────────────────────
export interface SessionPayload {
  wallet: string
  iat:    number
  exp:    number
}

export async function createSessionToken(wallet: string): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_SECRET)
  return new jose.SignJWT({ wallet })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_DURATION)
    .sign(secret)
}

export async function validateSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(AUTH_SECRET)
    const { payload } = await jose.jwtVerify(token, secret)
    return payload as unknown as SessionPayload
  } catch { return null }
}

export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  return validateSessionToken(token)
}
