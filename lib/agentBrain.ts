import type { ParsedIntent } from '@/app/api/agent/intent/route'
import type { Provider } from '@/app/api/agent/providers/route'
import type { AutonomyPolicy, TreasurySnapshot } from '@/lib/treasuryTypes'

export interface AgentExecutionPlan {
  intent: ParsedIntent
  providerStrategy: 'lowest-cost' | 'fastest-healthy' | 'quality-weighted'
  estimatedCostUsdc: number
  confidence: number
  requiresTreasuryRebalance: boolean
  canExecute: boolean
  reasons: string[]
}

export function buildAgentExecutionPlan(input: {
  intent: ParsedIntent
  provider: Provider
  remainingBudgetUsdc: number
  treasury: TreasurySnapshot
  policy: AutonomyPolicy | null
}): AgentExecutionPlan {
  const estimatedCostUsdc = Number((input.provider.pricePerSec * 3).toFixed(6))
  const providerStrategy =
    input.intent.priority === 'fastest'
      ? 'fastest-healthy'
      : input.intent.priority === 'best-quality'
      ? 'quality-weighted'
      : 'lowest-cost'
  const requiresTreasuryRebalance = input.treasury.solBalance < 0.025
  const policyActive = !!input.policy?.active && new Date(input.policy.expiresAt).getTime() > Date.now()
  const budgetOk = estimatedCostUsdc <= input.remainingBudgetUsdc
  const policyOk = !input.policy || (policyActive && estimatedCostUsdc <= input.policy.remainingUsdc)
  const canExecute = budgetOk && policyOk
  const reasons = [
    `strategy:${providerStrategy}`,
    budgetOk ? 'budget:ok' : 'budget:blocked',
    policyOk ? 'policy:ok' : 'policy:blocked',
    requiresTreasuryRebalance ? 'gas:rebalance-needed' : 'gas:ok',
  ]

  return {
    intent: input.intent,
    providerStrategy,
    estimatedCostUsdc,
    confidence: canExecute ? 0.91 : 0.42,
    requiresTreasuryRebalance,
    canExecute,
    reasons,
  }
}
