// ─── Client-side balance helpers ─────────────────────────────────────────────
// Payment execution has moved to the agent page directly (wallet signing
// requires browser context). This file now only exports balance readers.

import { Connection, PublicKey } from '@solana/web3.js'
import { SOLANA_RPC, USDC_MINT } from './config'

// ─── USDC balance ─────────────────────────────────────────────────────────────
export async function getUsdcBalance(publicKey: PublicKey): Promise<number> {
  try {
    const { getAssociatedTokenAddress } = await import('@solana/spl-token')
    const connection = new Connection(SOLANA_RPC, 'confirmed')
    const mint       = new PublicKey(USDC_MINT)
    const ata        = await getAssociatedTokenAddress(mint, publicKey)
    const info       = await connection.getTokenAccountBalance(ata)
    return info.value.uiAmount ?? 0
  } catch {
    return 0
  }
}

// ─── SOL balance ──────────────────────────────────────────────────────────────
export async function getSolBalance(publicKey: PublicKey): Promise<number> {
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed')
    const lamports   = await connection.getBalance(publicKey)
    return lamports / 1e9
  } catch {
    return 0
  }
}

// ─── Recent on-chain transactions ────────────────────────────────────────────
export async function getWalletTransactions(
  publicKey: PublicKey
): Promise<Array<{ signature: string; time: number; slot: number }>> {
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed')
    const sigs       = await connection.getSignaturesForAddress(publicKey, { limit: 20 })
    return sigs.map(s => ({
      signature: s.signature,
      time:      (s.blockTime ?? 0) * 1000,
      slot:      s.slot,
    }))
  } catch {
    return []
  }
}
