import type {
  AutonomyPolicy,
  TreasuryAction,
  TreasurySnapshot,
  ZerionSimulationLog,
} from '@/lib/treasuryTypes'

export const LOW_SOL_THRESHOLD = 0.025
export const TARGET_SOL_RESERVE = 0.08

export function buildDefaultPolicy(agentId: string, budgetUsdc: number): AutonomyPolicy {
  void agentId
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const spendLimitUsdc = Math.max(0.5, Math.min(budgetUsdc, 25))
  return {
    spendLimitUsdc,
    remainingUsdc: spendLimitUsdc,
    allowedTokens: ['SOL', 'USDC'],
    allowedProviders: ['gpu-alpha', 'gpu-beta', 'rendernet', 'fastgpu', 'cloudai'],
    allowedActions: ['gas-rebalance', 'provider-payment', 'policy-check', 'simulation'],
    chain: 'devnet',
    expiresAt,
    active: true,
  }
}

export function createTreasurySnapshot(input: {
  agentId: string
  publicKey: string
  solBalance?: number
  usdcBalance?: number
  spentUsdc: number
  createdAt?: string
}): TreasurySnapshot {
  const solBalance = input.solBalance ?? 0.014
  const usdcBalance = input.usdcBalance ?? Math.max(0, 10 - input.spentUsdc)
  const gasRunwayHours = Math.max(0, Math.round((solBalance / 0.004) * 10) / 10)
  const spendVelocityUsdcPerHour = Math.max(0.02, Math.round((input.spentUsdc / 24) * 1000) / 1000)
  const healthScore = Math.max(
    18,
    Math.min(98, Math.round(solBalance * 520 + usdcBalance * 3 + (gasRunwayHours > 6 ? 18 : 4))),
  )
  const risk = healthScore > 78 ? 'low' : healthScore > 48 ? 'medium' : 'high'

  return {
    agentId: input.agentId,
    publicKey: input.publicKey,
    solBalance,
    usdcBalance,
    gasRunwayHours,
    healthScore,
    spendVelocityUsdcPerHour,
    allocation: [
      { token: 'USDC', value: usdcBalance, color: '#67E8F9' },
      { token: 'SOL', value: solBalance, color: '#A78BFA' },
    ],
    risk,
  }
}

export function buildRebalanceSimulation(snapshot: TreasurySnapshot, policy: AutonomyPolicy | null): ZerionSimulationLog[] {
  const policyActive = !!policy?.active && new Date(policy.expiresAt).getTime() > Date.now()
  return [
    {
      id: 'route',
      label: 'Estimating route',
      detail: snapshot.solBalance < LOW_SOL_THRESHOLD
        ? 'Low gas reserve detected; preparing devnet gas rebalance.'
        : 'Gas reserve is above the autonomous threshold.',
      status: snapshot.solBalance < LOW_SOL_THRESHOLD ? 'warning' : 'ok',
    },
    {
      id: 'simulate',
      label: 'Simulating treasury action',
      detail: `Runway ${snapshot.gasRunwayHours.toFixed(1)}h; target reserve ${TARGET_SOL_RESERVE.toFixed(3)} SOL.`,
      status: 'ok',
    },
    {
      id: 'policy',
      label: 'Validating policy',
      detail: policyActive
        ? `24h session active; ${policy.remainingUsdc.toFixed(2)} USDC policy budget remains.`
        : 'Autonomous session is inactive or expired.',
      status: policyActive ? 'ok' : 'blocked',
    },
    {
      id: 'gas',
      label: 'Estimating gas',
      detail: 'Solana devnet fee envelope checked before execution.',
      status: policyActive ? 'ok' : 'pending',
    },
  ]
}

export function shouldRebalanceGas(snapshot: TreasurySnapshot, policy: AutonomyPolicy | null): boolean {
  if (!policy?.active) return false
  if (!policy.allowedActions.includes('gas-rebalance')) return false
  return snapshot.solBalance < LOW_SOL_THRESHOLD
}

export function createLocalTreasuryAction(input: {
  agentId: string
  type: TreasuryAction['type']
  amount: number
  detail: string
  status?: TreasuryAction['status']
  txSignature?: string
  tokenIn?: TreasuryAction['tokenIn']
  tokenOut?: TreasuryAction['tokenOut']
}): TreasuryAction {
  return {
    id: `treasury-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agentId: input.agentId,
    type: input.type,
    tokenIn: input.tokenIn ?? (input.type === 'gas-rebalance' ? 'USDC' : null),
    tokenOut: input.tokenOut ?? (input.type === 'gas-rebalance' ? 'SOL' : null),
    amount: input.amount,
    txSignature: input.txSignature,
    status: input.status ?? 'simulated',
    detail: input.detail,
    createdAt: new Date().toISOString(),
  }
}
