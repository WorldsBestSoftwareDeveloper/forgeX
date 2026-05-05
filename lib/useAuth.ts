// ─── Client-side auth hook ────────────────────────────────────────────────────
// Manages wallet-based sign-in flow:
//   connect wallet → request nonce → sign message → verify → store JWT
//
// Token is stored in memory (React state) only — NOT localStorage.
// localStorage is vulnerable to XSS. Memory token is cleared on page refresh
// (user must sign in again, which is just one Phantom click).

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useWallet }                          from '@solana/wallet-adapter-react'

export type AuthStatus = 'unauthenticated' | 'signing' | 'authenticated' | 'error'

export interface AuthState {
  status:      AuthStatus
  token:       string | null    // JWT — in memory only
  wallet:      string | null    // pubkey string
  error:       string | null
  signIn:      () => Promise<void>
  signOut:     () => void
}

export function useAuth(): AuthState {
  const { publicKey, signMessage, connected, disconnect } = useWallet()

  const [status, setStatus] = useState<AuthStatus>('unauthenticated')
  const [token,  setToken]  = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  // Reset when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setStatus('unauthenticated')
      setToken(null)
      setError(null)
    }
  }, [connected])

  const signIn = useCallback(async (): Promise<void> => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected')
      return
    }

    setStatus('signing')
    setError(null)

    try {
      const walletAddress = publicKey.toBase58()

      // Step 1: Get nonce from server
      const nonceRes = await fetch(
        `/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`
      )
      if (!nonceRes.ok) {
        const err = (await nonceRes.json()) as { error?: string }
        throw new Error(err.error ?? 'Failed to get nonce')
      }
      const { nonce, message } = (await nonceRes.json()) as {
        nonce:   string
        message: string
      }

      // Step 2: Sign the message with Phantom
      // This shows the human-readable message in Phantom — no gas, free
      const msgBytes   = new TextEncoder().encode(message)
      const sigBytes   = await signMessage(msgBytes)
      const sigBase64  = Buffer.from(sigBytes).toString('base64')

      // Step 3: Verify signature on server, get JWT
      const verifyRes = await fetch('/api/auth/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet: walletAddress, nonce, signature: sigBase64 }),
      })

      if (!verifyRes.ok) {
        const err = (await verifyRes.json()) as { error?: string }
        throw new Error(err.error ?? 'Verification failed')
      }

      const { token: jwt } = (await verifyRes.json()) as { token: string }

      setToken(jwt)
      setStatus('authenticated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      setError(message)
      setStatus('error')
    }
  }, [publicKey, signMessage])

  const signOut = useCallback((): void => {
    setToken(null)
    setStatus('unauthenticated')
    setError(null)
    disconnect()
  }, [disconnect])

  return {
    status,
    token,
    wallet:  publicKey?.toBase58() ?? null,
    error,
    signIn,
    signOut,
  }
}
