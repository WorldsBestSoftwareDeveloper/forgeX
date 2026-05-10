export type TreasuryToken = 'SOL' | 'USDC'

export type TreasuryActionType =
  | 'gas-rebalance'
  | 'provider-payment'
  | 'policy-check'
  | 'simulation'
  | 'funding'
  | 'zerion-proof-swap'
  | 'emergency-pause'

export interface TreasuryWallet {
  agentId: string
  publicKey: string
  encryptedPrivateKey?: string
  createdAt: string
}

export interface AutonomyPolicy {
  spendLimitUsdc: number
  remainingUsdc: number
  allowedTokens: TreasuryToken[]
  allowedProviders: string[]
  allowedActions: TreasuryActionType[]
  chain: 'devnet'
  expiresAt: string
  active: boolean
  signer?: string
  message?: string
  signature?: string
}

export interface TreasuryAction {
  id: string
  agentId: string
  type: TreasuryActionType
  tokenIn: TreasuryToken | null
  tokenOut: TreasuryToken | null
  amount: number
  txSignature?: string
  status: 'simulated' | 'validated' | 'executed' | 'rejected'
  detail: string
  createdAt: string
}

export interface TreasurySnapshot {
  agentId: string
  publicKey: string
  solBalance: number
  usdcBalance: number
  gasRunwayHours: number
  healthScore: number
  spendVelocityUsdcPerHour: number
  allocation: Array<{
    token: TreasuryToken
    value: number
    color: string
  }>
  risk: 'low' | 'medium' | 'high'
}

export interface ZerionSimulationLog {
  id: string
  label: string
  detail: string
  status: 'pending' | 'ok' | 'warning' | 'blocked'
}
