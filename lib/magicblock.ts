// MagicBlock payment helpers
// All transaction building, signing, and submission lives here.
// We do not use the MagicBlock SDK auth helper because some challenge payloads
// can be versioned, which breaks legacy-only transaction parsing paths.

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { MB_PAYMENTS_API, MB_TEE_RPC, SOLANA_RPC, USDC_MINT } from './config'

type SignableWallet = {
  publicKey: PublicKey | null
  signTransaction:
    | (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>)
    | undefined
  signMessage: ((msg: Uint8Array) => Promise<Uint8Array>) | undefined
}

export interface MagicBlockResult {
  signature: string
  usedRealPayment: true
}

interface MagicBlockTransferResponse {
  transactionBase64?: string
  transactions?: string[]
  sendTo: 'ephemeral' | 'base'
  version?: 'legacy' | 'v0'
  recentBlockhash?: string
  lastValidBlockHeight?: number
}

type ParsedTx =
  | { kind: 'versioned-tx'; tx: VersionedTransaction }
  | { kind: 'legacy-tx'; tx: Transaction }
  | { kind: 'versioned-message'; tx: VersionedTransaction }

async function getMBAuthToken(
  wallet: SignableWallet,
  teeRpc: string,
): Promise<string | null> {
  if (!wallet.publicKey || !wallet.signMessage) return null

  try {
    const walletB58 = wallet.publicKey.toBase58()

    const nonceRes = await fetch(
      `${teeRpc}/auth/challenge?wallet=${encodeURIComponent(walletB58)}`,
      { signal: AbortSignal.timeout(8_000) },
    )

    if (!nonceRes.ok) {
      console.warn('[forge/mb] challenge endpoint returned', nonceRes.status)
      return null
    }

    const { nonce } = (await nonceRes.json()) as { nonce: string }
    if (!nonce) return null

    const msgBytes = new TextEncoder().encode(nonce)
    const sigBytes = await wallet.signMessage(msgBytes)
    const sigB64 = Buffer.from(sigBytes).toString('base64')

    const tokenRes = await fetch(`${teeRpc}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletB58,
        nonce,
        signature: sigB64,
      }),
      signal: AbortSignal.timeout(8_000),
    })

    if (!tokenRes.ok) {
      console.warn('[forge/mb] token endpoint returned', tokenRes.status)
      return null
    }

    const { token } = (await tokenRes.json()) as { token: string }
    return token ?? null
  } catch (err) {
    console.warn('[forge/mb] auth token fetch failed, continuing without token:', err)
    return null
  }
}

export async function ensureUsdcAta(
  owner: PublicKey,
  wallet: SignableWallet,
): Promise<void> {
  if (!wallet.signTransaction) return

  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed')
    const mint = new PublicKey(USDC_MINT)
    const ata = await getAssociatedTokenAddress(mint, owner)

    try {
      await getAccount(connection, ata)
      return
    } catch {
      // ATA does not exist; create it below.
    }

    const ix = createAssociatedTokenAccountInstruction(owner, ata, owner, mint)
    const tx = new Transaction().add(ix)
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.feePayer = owner

    const signed = await wallet.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })

    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    )
  } catch (err) {
    console.warn('[forge/mb] ensureUsdcAta:', err)
  }
}

// MagicBlock may return:
// 1. a full VersionedTransaction
// 2. a full legacy Transaction
// 3. a raw VersionedMessage that still needs wrapping in VersionedTransaction
//
// We try them in that order. A serialized Solana transaction starts with the
// signature count, not the message version byte, so checking txBytes[0] is not
// a reliable way to classify the payload.
function parseTxBytes(txBytes: Uint8Array): ParsedTx {
  try {
    return {
      kind: 'versioned-tx',
      tx: VersionedTransaction.deserialize(txBytes),
    }
  } catch {
    // Not a full versioned transaction.
  }

  try {
    return {
      kind: 'legacy-tx',
      tx: Transaction.from(txBytes),
    }
  } catch {
    // Not a legacy transaction.
  }

  try {
    return {
      kind: 'versioned-message',
      tx: new VersionedTransaction(VersionedMessage.deserialize(txBytes)),
    }
  } catch (err) {
    throw new Error(
      `Unsupported MagicBlock transaction format: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

async function signTxBytes(
  txBytes: Uint8Array,
  wallet: SignableWallet,
  connection: Connection,
): Promise<{
  signedBytes: Uint8Array
  recentBlockhash: string
  lastValidBlockHeight: number
}> {
  if (!wallet.signTransaction) throw new Error('Wallet cannot sign transactions')

  const parsed = parseTxBytes(txBytes)
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed')

  if (parsed.kind === 'legacy-tx') {
    parsed.tx.recentBlockhash = blockhash
    const signed = await wallet.signTransaction(parsed.tx)
    if (!signed.recentBlockhash) {
      throw new Error('Legacy transaction missing recentBlockhash')
    }
    return {
      signedBytes: signed.serialize(),
      recentBlockhash: signed.recentBlockhash,
      lastValidBlockHeight,
    }
  }

  parsed.tx.message.recentBlockhash = blockhash
  const signed = await wallet.signTransaction(parsed.tx)
  return {
    signedBytes: signed.serialize(),
    recentBlockhash: signed.message.recentBlockhash,
    lastValidBlockHeight,
  }
}

export async function executeMagicBlockTransfer(params: {
  wallet: SignableWallet
  toAddress: string
  amountUsdc: number
  erSessionId: string
  onStatusChange?: (status: 'signing-message' | 'signing-tx') => void
}): Promise<MagicBlockResult> {
  const { wallet, toAddress, amountUsdc, onStatusChange } = params

  if (!wallet.publicKey) throw new Error('Wallet not connected')
  if (!wallet.signMessage) throw new Error('Wallet cannot sign messages')
  if (!wallet.signTransaction) throw new Error('Wallet cannot sign transactions')

  const useGasless = amountUsdc >= 5

  onStatusChange?.('signing-message')
  const token = await getMBAuthToken(wallet, MB_TEE_RPC)

  await ensureUsdcAta(wallet.publicKey, wallet)

  async function buildTransfer(): Promise<MagicBlockTransferResponse> {
    const res = await fetch(`${MB_PAYMENTS_API}/v1/spl/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        from: wallet.publicKey!.toBase58(),
        to: toAddress,
        mint: USDC_MINT,
        amount: Math.round(amountUsdc * 1_000_000),
        visibility: 'private',
        fromBalance: 'base',
        toBalance: 'base',
        cluster: 'devnet',
        initIfMissing: true,
        initAtasIfMissing: true,
        initVaultIfMissing: false,
        gasless: useGasless,
        legacy: true,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`)
      throw new Error(`MagicBlock API (${res.status}): ${body}`)
    }

    return (await res.json()) as MagicBlockTransferResponse
  }

  async function attemptTransfer(mbBody: MagicBlockTransferResponse): Promise<string> {
    const rpcUrl = mbBody.sendTo === 'ephemeral'
      ? (token ? `${MB_TEE_RPC}?token=${token}` : MB_TEE_RPC)
      : SOLANA_RPC

    const connection = new Connection(rpcUrl, 'confirmed')
    const txList: string[] =
      mbBody.transactions ??
      (mbBody.transactionBase64 ? [mbBody.transactionBase64] : [])

    if (txList.length === 0) throw new Error('MagicBlock returned no transactions')

    let lastSig = ''
    for (let i = 0; i < txList.length; i++) {
      const txBytes = Buffer.from(txList[i], 'base64')

      if (txBytes.length > 1232) {
        throw new Error(
          `Tx ${i + 1}/${txList.length} is ${txBytes.length} bytes (limit 1232). ` +
            'Try setting NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=true to use simulation mode.'
        )
      }

      onStatusChange?.('signing-tx')
      const { signedBytes, recentBlockhash, lastValidBlockHeight } =
        await signTxBytes(txBytes, wallet, connection)

      const sig = await connection.sendRawTransaction(signedBytes, {
        skipPreflight: false,
        maxRetries: 3,
      })

      await connection.confirmTransaction({
        signature: sig,
        blockhash: mbBody.recentBlockhash ?? recentBlockhash,
        lastValidBlockHeight: mbBody.lastValidBlockHeight ?? lastValidBlockHeight,
      }, 'confirmed')

      lastSig = sig
    }

    return lastSig
  }

  try {
    return {
      signature: await attemptTransfer(await buildTransfer()),
      usedRealPayment: true,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/blockhash not found/i.test(msg)) throw err

    console.warn('[forge/mb] stale blockhash from transfer build, retrying once')

    return {
      signature: await attemptTransfer(await buildTransfer()),
      usedRealPayment: true,
    }
  }
}
