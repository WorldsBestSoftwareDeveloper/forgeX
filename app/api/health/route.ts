import { NextResponse } from 'next/server'
import { MB_PAYMENTS_API, MB_TEE_RPC, SOLANA_RPC, IS_MAINNET, SIMULATE_PAYMENTS, SIMULATE_INFERENCE } from '@/lib/config'

export async function GET(): Promise<NextResponse> {
  // Non-blocking health checks
  const [mbOk, solanaOk] = await Promise.allSettled([
    fetch(`${MB_PAYMENTS_API}/health`, { signal: AbortSignal.timeout(4000) })
      .then(r => r.ok).catch(() => false),
    fetch(`${SOLANA_RPC}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(4000),
    }).then(r => r.ok).catch(() => false),
  ])

  return NextResponse.json({
    status:             'ok',
    version:            '0.3.0',
    network:            IS_MAINNET ? 'mainnet' : 'devnet',
    supabase:           !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    openai:             !!process.env.OPENAI_API_KEY,
    replicate:          !!process.env.REPLICATE_API_TOKEN,
    together:           !!process.env.TOGETHER_API_KEY,
    magicblock:         mbOk.status  === 'fulfilled' ? mbOk.value  : false,
    solana:             solanaOk.status === 'fulfilled' ? solanaOk.value : false,
    simulatePayments:   SIMULATE_PAYMENTS,
    simulateInference:  SIMULATE_INFERENCE,
    ts:                 new Date().toISOString(),
  })
}
