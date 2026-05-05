// ─── Client-side localStorage store ───────────────────────────────────────────
// Agents and transactions are persisted here as the local fallback.
// When Supabase is configured, server-side DB is the source of truth.
// The store dispatches CustomEvents so the Wallet page updates live.

export interface Agent {
  id:          string
  name:        string
  budget:      number
  spent:       number
  status:      'idle' | 'running' | 'error'
  lastTask:    string
  successRate: number
  taskCount:   number
  created:     string
}

export interface Transaction {
  id:              string
  type:            'payment' | 'deposit'
  desc:            string
  amount:          number       // negative = outgoing
  amountStr:       string       // e.g. "0.0540 USDC"
  time:            number       // unix ms
  private:         boolean
  signature?:      string       // real Solana tx sig if available
  provider?:       string
  usedRealPayment?: boolean
  erSessionId?:    string
}

// ─── Default demo agents ──────────────────────────────────────────────────────
const DEFAULT_AGENTS: Agent[] = [
  { id: 'agent-1', name: 'Nexus-7', budget: 5.0,  spent: 1.24, status: 'idle', lastTask: 'Generated Neo-Tokyo skyline render',  successRate: 98,  taskCount: 12, created: '2025-04-18' },
  { id: 'agent-2', name: 'Prism-X', budget: 10.0, spent: 3.87, status: 'idle', lastTask: 'Processed 120 image upscales via GPU Beta', successRate: 100, taskCount: 28, created: '2025-04-15' },
  { id: 'agent-3', name: 'Sigma-3', budget: 2.5,  spent: 0.41, status: 'idle', lastTask: 'Rendered architectural visualization', successRate: 95,  taskCount: 7,  created: '2025-04-20' },
]

// ─── Agents ───────────────────────────────────────────────────────────────────
export function loadAgents(): Agent[] {
  if (typeof window === 'undefined') return DEFAULT_AGENTS
  try {
    const s = localStorage.getItem('forge-agents')
    return s ? (JSON.parse(s) as Agent[]) : DEFAULT_AGENTS
  } catch { return DEFAULT_AGENTS }
}

export function saveAgents(agents: Agent[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('forge-agents', JSON.stringify(agents)) } catch {}
}

// ─── Transactions — live updates via CustomEvent ──────────────────────────────
export function loadTransactions(): Transaction[] {
  if (typeof window === 'undefined') return []
  try {
    const s = localStorage.getItem('forge-transactions')
    const txs: Transaction[] = s ? (JSON.parse(s) as Transaction[]) : []
    return txs.sort((a, b) => b.time - a.time)
  } catch { return [] }
}

export function saveTransaction(tx: Transaction): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadTransactions()
    const updated  = [tx, ...existing.filter(t => t.id !== tx.id)]
    localStorage.setItem('forge-transactions', JSON.stringify(updated))
    // Notify Wallet page without a page refresh
    window.dispatchEvent(new CustomEvent('forge-tx-added', { detail: tx }))
  } catch {}
}

export function clearTransactions(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem('forge-transactions') } catch {}
}
