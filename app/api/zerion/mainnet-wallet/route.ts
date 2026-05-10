import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { getSessionFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { dbLoadAgent, dbLoadZerionExecutionWallet, dbSaveZerionExecutionWallet } from '@/lib/supabase'
import { encryptSecretKey, generateTreasuryKeypair } from '@/lib/treasuryCrypto'

const MAINNET_RPC = process.env.ZERION_MAINNET_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export interface ZerionMainnetWalletResponse {
  publicKey: string
  walletName: string
  network: 'solana-mainnet'
  solBalance: number
  usdcBalance: number
  created: boolean
}

async function getBalances(publicKey: string): Promise<{ solBalance: number; usdcBalance: number }> {
  const connection = new Connection(MAINNET_RPC, 'confirmed')
  const owner = new PublicKey(publicKey)
  const solBalance = await connection.getBalance(owner).then(v => v / 1e9).catch(() => 0)
  const usdcAta = await getAssociatedTokenAddress(new PublicKey(MAINNET_USDC_MINT), owner)
  const usdcBalance = await connection
    .getTokenAccountBalance(usdcAta)
    .then(v => v.value.uiAmount ?? 0)
    .catch(() => 0)
  return { solBalance, usdcBalance }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (rateLimit(`zerion-mainnet-wallet:${session.wallet}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many Zerion wallet requests.' }, { status: 429 })
  }

  const agentId = req.nextUrl.searchParams.get('agentId') ?? ''
  if (!agentId) return NextResponse.json({ error: 'Missing agent id.' }, { status: 400 })
  const agent = await dbLoadAgent(agentId, session.wallet)
  if (!agent) return NextResponse.json({ error: 'Agent not found for this wallet.' }, { status: 404 })

  let wallet = await dbLoadZerionExecutionWallet(agentId)
  let created = false
  if (!wallet) {
    const keypair = generateTreasuryKeypair()
    wallet = {
      id: `zew-${agentId}`,
      agent_id: agentId,
      public_key: keypair.publicKey.toBase58(),
      wallet_name: `zerion-mainnet-${agentId}`,
      encrypted_private_key: encryptSecretKey(keypair.secretKey),
      network: 'solana-mainnet',
      created_at: new Date().toISOString(),
    }
    const saved = await dbSaveZerionExecutionWallet(wallet)
    if (!saved) return NextResponse.json({ error: 'Could not create Zerion execution wallet.' }, { status: 500 })
    created = true
  }

  const balances = await getBalances(wallet.public_key)
  return NextResponse.json({
    publicKey: wallet.public_key,
    walletName: wallet.wallet_name,
    network: 'solana-mainnet',
    solBalance: balances.solBalance,
    usdcBalance: balances.usdcBalance,
    created,
  } satisfies ZerionMainnetWalletResponse)
}
