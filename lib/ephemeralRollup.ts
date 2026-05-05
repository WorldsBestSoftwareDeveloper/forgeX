// ─── Ephemeral Rollup session manager ────────────────────────────────────────
// Models the full ER lifecycle for Forge agent payments.
// Sessions are in-memory only on client — server-side truth is in Supabase.

export type ERStatus = 'starting' | 'active' | 'settling' | 'settled' | 'failed'

export interface ERSession {
  id:            string
  agentId:       string
  task:          string
  startedAt:     number
  provider?:     string
  totalCost:     number
  settlementTx?: string
  status:        ERStatus
}

// ─── Session factory ──────────────────────────────────────────────────────────
export function createERSession(agentId: string, task: string): ERSession {
  return {
    id:        `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    task,
    startedAt: Date.now(),
    totalCost: 0,
    status:    'starting',
  }
}

// ─── Lifecycle helpers ────────────────────────────────────────────────────────
export function erSessionActivated(
  session: ERSession,
  provider: string
): ERSession {
  return { ...session, provider, status: 'active' }
}

export function erSessionSettling(
  session: ERSession,
  cost: number
): ERSession {
  return { ...session, totalCost: cost, status: 'settling' }
}

export function erSessionSettled(
  session: ERSession,
  settlementTx: string
): ERSession {
  return { ...session, settlementTx, status: 'settled' }
}

export function erSessionFailed(session: ERSession): ERSession {
  return { ...session, status: 'failed' }
}

// ─── Display labels ───────────────────────────────────────────────────────────
export const ER_STATUS_LABELS: Record<ERStatus, string> = {
  starting:  'Initialising TEE…',
  active:    'ER Active',
  settling:  'Settling to Solana…',
  settled:   'Settled',
  failed:    'Failed',
}
