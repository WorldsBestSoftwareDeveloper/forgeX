// ─── Server-side security utilities ──────────────────────────────────────────
// Rate limiting, input validation, spend cap enforcement.
// NEVER import this in client components — server only.

// ─── Rate limiter (in-memory) ─────────────────────────────────────────────────
const _store = new Map<string, number[]>()

export function rateLimit(key: string, maxReqs: number, windowMs: number): boolean {
  const now  = Date.now()
  const hits = (_store.get(key) ?? []).filter((t: number) => now - t < windowMs)
  hits.push(now)
  _store.set(key, hits)
  // Periodic cleanup
  if (_store.size > 2000) {
    for (const [k, times] of _store) {
      if (times.every(t => now - t > windowMs)) _store.delete(k)
    }
  }
  return hits.length > maxReqs
}

// ─── Input validation ─────────────────────────────────────────────────────────
export function validateWalletAddress(addr: unknown): addr is string {
  if (typeof addr !== 'string') return false
  if (addr.length < 32 || addr.length > 44) return false
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)
}

export function validateTask(task: unknown): task is string {
  if (typeof task !== 'string') return false
  const t = task.trim()
  if (t.length < 3 || t.length > 500) return false
  if (/<script|javascript:|on\w+=/i.test(t)) return false
  return true
}

export function validateBudget(budget: unknown): budget is number {
  if (typeof budget !== 'number' || !isFinite(budget) || isNaN(budget)) return false
  return budget > 0 && budget <= 1000
}

export function validateAgentName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const t = name.trim()
  if (t.length < 1 || t.length > 32) return false
  return /^[a-zA-Z0-9\-_ ]+$/.test(t)
}

// ─── Provider allowlist ───────────────────────────────────────────────────────
const ALLOWED_PROVIDERS = new Set(['gpu-alpha','gpu-beta','rendernet','fastgpu','cloudai'])

export function validateProviderId(id: unknown): id is string {
  return typeof id === 'string' && ALLOWED_PROVIDERS.has(id)
}

// ─── Spend cap ────────────────────────────────────────────────────────────────
export interface SpendCapResult {
  allowed:  boolean
  reason?:  string
  maxCost:  number
}

export function enforceSpendCap(p: {
  agentBudget:   number
  agentSpent:    number
  requestedCost: number
  maxSingleTx:   number
}): SpendCapResult {
  const remaining = p.agentBudget - p.agentSpent

  if (!isFinite(remaining) || remaining <= 0)
    return { allowed: false, reason: 'Agent budget exhausted', maxCost: 0 }

  if (p.requestedCost > p.maxSingleTx)
    return { allowed: false, reason: `Single tx cap is $${p.maxSingleTx} USDC`, maxCost: p.maxSingleTx }

  if (p.requestedCost > remaining)
    return { allowed: false, reason: `Insufficient budget ($${remaining.toFixed(4)} remaining)`, maxCost: remaining }

  if (p.requestedCost <= 0)
    return { allowed: false, reason: 'Cost must be positive', maxCost: remaining }

  return { allowed: true, maxCost: remaining }
}

// ─── Sanitise ─────────────────────────────────────────────────────────────────
export function sanitiseString(s: string, maxLen = 1000): string {
  return s.trim().slice(0, maxLen).replace(/<[^>]*>/g, '')
}
