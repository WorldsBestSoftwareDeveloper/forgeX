import type { Agent } from '@/lib/store'
import type { DbAgent } from '@/lib/supabase'

export interface AgentListItem {
  id: string
  name: string
  budget: number
  spent: number
  status: 'idle' | 'running' | 'error'
  lastTask: string
  successRate: number
  taskCount: number
  created: string
  treasuryWallet?: string
  autonomyActive?: boolean
  autonomyExpiresAt?: string
  autonomySignature?: string
  autonomyMessage?: string
  autonomySigner?: string
  treasurySol?: number
  treasuryUsdc?: number
  treasuryTxCount?: number
  zerionWalletName?: string
}

export function dbAgentToAgent(agent: DbAgent): AgentListItem {
  return {
    id: agent.id,
    name: agent.name,
    budget: Number(agent.budget),
    spent: Number(agent.spent),
    status: agent.status,
    lastTask: agent.last_task,
    successRate: agent.success_rate,
    taskCount: agent.task_count,
    created: agent.created_at.split('T')[0],
    treasuryWallet: agent.treasury_wallet ?? undefined,
    autonomyActive: agent.autonomy_active ?? false,
    autonomyExpiresAt: agent.autonomy_expires_at ?? undefined,
    autonomySignature: agent.autonomy_signature ?? undefined,
    autonomyMessage: agent.autonomy_message ?? undefined,
    autonomySigner: agent.autonomy_signer ?? undefined,
    treasurySol: agent.treasury_sol == null ? undefined : Number(agent.treasury_sol),
    treasuryUsdc: agent.treasury_usdc == null ? undefined : Number(agent.treasury_usdc),
    treasuryTxCount: agent.treasury_tx_count ?? undefined,
    zerionWalletName: agent.zerion_wallet_name ?? undefined,
  }
}

export function apiAgentToStoreAgent(agent: AgentListItem): Agent {
  return {
    id: agent.id,
    name: agent.name,
    budget: agent.budget,
    spent: agent.spent,
    status: agent.status,
    lastTask: agent.lastTask,
    successRate: agent.successRate,
    taskCount: agent.taskCount,
    created: agent.created,
    treasuryWallet: agent.treasuryWallet,
    autonomyActive: agent.autonomyActive,
    autonomyExpiresAt: agent.autonomyExpiresAt,
    autonomySignature: agent.autonomySignature,
    autonomyMessage: agent.autonomyMessage,
    autonomySigner: agent.autonomySigner,
    treasurySol: agent.treasurySol,
    treasuryUsdc: agent.treasuryUsdc,
    treasuryTxCount: agent.treasuryTxCount,
    zerionWalletName: agent.zerionWalletName,
  }
}
