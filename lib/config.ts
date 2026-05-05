// ─── Centralised config + feature flags ──────────────────────────────────────
// Single source of truth for all environment-dependent values.
// Import from here — never use process.env directly in components or lib files.

const env = (key: string, fallback = ''): string =>
  (typeof process !== 'undefined' ? process.env[key] : undefined) ?? fallback

// ─── Network ──────────────────────────────────────────────────────────────────
export const IS_MAINNET = env('NEXT_PUBLIC_NETWORK') === 'mainnet'
export const IS_DEVNET  = !IS_MAINNET

export const SOLANA_RPC = IS_MAINNET
  ? env('NEXT_PUBLIC_MAINNET_RPC', 'https://api.mainnet-beta.solana.com')
  : env('NEXT_PUBLIC_SOLANA_RPC',  'https://api.devnet.solana.com')

export const SOLANA_CLUSTER = IS_MAINNET ? 'mainnet-beta' : 'devnet'

// ─── USDC mints ───────────────────────────────────────────────────────────────
export const USDC_MINT = IS_MAINNET
  ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // mainnet USDC
  : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'  // devnet USDC

// ─── MagicBlock endpoints ─────────────────────────────────────────────────────
export const MB_PAYMENTS_API = IS_MAINNET
  ? env('NEXT_PUBLIC_MB_MAINNET_API',   'https://payments.magicblock.app')
  : env('NEXT_PUBLIC_MAGICBLOCK_PAYMENTS_API', 'https://payments.magicblock.app')

export const MB_TEE_RPC = IS_MAINNET
  ? env('NEXT_PUBLIC_MB_MAINNET_TEE',   'https://mainnet-tee.magicblock.app')
  : env('NEXT_PUBLIC_MAGICBLOCK_DEVNET_TEE', 'https://devnet-tee.magicblock.app')

// ─── Feature flags ────────────────────────────────────────────────────────────
// FORGE_SIMULATE_PAYMENTS=true  → skip real MagicBlock, use simulation
// Useful for UI demos without wallet. Default: false in production.
export const SIMULATE_PAYMENTS =
  env('NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS') === 'true'

// FORGE_SIMULATE_INFERENCE=true → skip Replicate, use placeholder images
export const SIMULATE_INFERENCE =
  env('NEXT_PUBLIC_FORGE_SIMULATE_INFERENCE') === 'true'

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const AUTH_SECRET  = env('AUTH_SECRET', 'forge-dev-secret-change-in-production')
export const JWT_DURATION = '24h'
export const NONCE_TTL_MS = 5 * 60 * 1000    // 5 minutes

// ─── Spend limits ─────────────────────────────────────────────────────────────
export const MAX_AGENT_BUDGET_USDC = 1000
export const MAX_SINGLE_TX_USDC    = 1.00
export const MAX_RUNS_PER_MIN      = 5

// ─── Inference ────────────────────────────────────────────────────────────────
export const REPLICATE_API_TOKEN  = env('REPLICATE_API_TOKEN')
export const TOGETHER_API_KEY     = env('TOGETHER_API_KEY')
export const OPENAI_API_KEY       = env('OPENAI_API_KEY')

export const REPLICATE_POLL_MS   = 2000
export const REPLICATE_MAX_POLLS = 30     // 60 second max
export const INFERENCE_TIMEOUT   = 90_000 // 90 seconds total

// ─── Health check cache ───────────────────────────────────────────────────────
export const MB_HEALTH_CACHE_MS = 30_000  // recheck MagicBlock health every 30s
