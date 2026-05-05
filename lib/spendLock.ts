// ─── Spend reservation locking ────────────────────────────────────────────────
// Prevents race conditions where two simultaneous runs could both pass the
// spend cap check before either one has updated the "spent" counter.
//
// Pattern: reserve → execute payment → confirm or release
// In production: replace with Redis SETNX or Supabase advisory lock.
// For MVP: in-memory lock (fine for single-server deployment).

interface Lock {
  wallet:    string
  agentId:   string
  amount:    number
  reservedAt: number
}

// Map key: `${wallet}:${agentId}`
const locks = new Map<string, Lock>()
const LOCK_TTL_MS = 5 * 60 * 1000 // 5 minutes — auto-expire stale locks

function lockKey(wallet: string, agentId: string): string {
  return `${wallet}:${agentId}`
}

function evictExpired(): void {
  const now = Date.now()
  for (const [key, lock] of Array.from(locks.entries())) {
    if (now - lock.reservedAt > LOCK_TTL_MS) locks.delete(key)
  }
}

/**
 * Reserve budget for a pending payment.
 * Returns false if the agent already has an active spend lock.
 */
export function reserveSpend(wallet: string, agentId: string, amount: number): boolean {
  evictExpired()
  const key = lockKey(wallet, agentId)
  if (locks.has(key)) return false   // already locked — reject concurrent run
  locks.set(key, { wallet, agentId, amount, reservedAt: Date.now() })
  return true
}

/** Release the lock after payment completes or fails. */
export function releaseSpend(wallet: string, agentId: string): void {
  locks.delete(lockKey(wallet, agentId))
}

/** Check if an agent is currently locked (has an active run). */
export function isLocked(wallet: string, agentId: string): boolean {
  evictExpired()
  return locks.has(lockKey(wallet, agentId))
}

/** Get the reserved amount for a wallet+agent pair. */
export function getReservedAmount(wallet: string, agentId: string): number {
  return locks.get(lockKey(wallet, agentId))?.amount ?? 0
}
