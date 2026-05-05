// ─── Supabase client + typed CRUD ─────────────────────────────────────────────
// Falls back gracefully to localStorage when not configured.
// Add keys to .env.local to enable persistent DB.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnon
    ? createClient(supabaseUrl, supabaseAnon)
    : null

export const isSupabaseEnabled = supabase !== null

// ─── Database types (mirror supabase-schema.sql exactly) ─────────────────────

export interface DbUser {
  wallet_address: string
  created_at:     string
  last_seen_at:   string
}

export interface DbAgent {
  id:             string
  wallet_address: string
  name:           string
  budget:         number
  spent:          number
  status:         'idle' | 'running' | 'error'
  last_task:      string
  success_rate:   number
  task_count:     number
  created_at:     string
}

export interface DbRun {
  id:                string
  agent_id:          string
  wallet_address:    string
  task:              string
  parsed_intent:     Record<string, unknown>
  provider_id:       string
  provider_name:     string
  cost_usdc:         number
  tx_signature:      string | null
  used_real_payment: boolean
  er_session_id:     string
  output_url:        string | null
  output_text:       string | null
  status:            string
  created_at:        string
}

export interface DbTransaction {
  id:                string
  wallet_address:    string
  agent_id:          string
  description:       string
  amount_usdc:       number
  tx_signature:      string | null
  provider:          string
  used_real_payment: boolean
  er_session_id:     string
  created_at:        string
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function dbUpsertUser(walletAddress: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('users')
    .upsert(
      { wallet_address: walletAddress, last_seen_at: new Date().toISOString() },
      { onConflict: 'wallet_address' }
    )
  if (error) { console.error('[db] upsertUser:', error.message); return false }
  return true
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function dbLoadAgents(walletAddress: string): Promise<DbAgent[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false })
  if (error) { console.error('[db] loadAgents:', error.message); return [] }
  return (data ?? []) as DbAgent[]
}

export async function dbSaveAgent(
  agent: Omit<DbAgent, 'created_at'>
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('agents')
    .upsert(agent, { onConflict: 'id' })
  if (error) { console.error('[db] saveAgent:', error.message); return false }
  return true
}

export async function dbUpdateAgent(
  id: string,
  walletAddress: string,
  updates: Partial<Omit<DbAgent, 'id' | 'wallet_address' | 'created_at'>>
): Promise<boolean> {
  if (!supabase) return false
  // wallet_address match prevents cross-user updates
  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id)
    .eq('wallet_address', walletAddress)
  if (error) { console.error('[db] updateAgent:', error.message); return false }
  return true
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function dbLoadTransactions(
  walletAddress: string
): Promise<DbTransaction[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error('[db] loadTransactions:', error.message); return [] }
  return (data ?? []) as DbTransaction[]
}

export async function dbSaveTransaction(
  tx: Omit<DbTransaction, 'created_at'>
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('transactions').insert(tx)
  if (error) { console.error('[db] saveTransaction:', error.message); return false }
  return true
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function dbSaveRun(
  run: Omit<DbRun, 'created_at'>
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('agent_runs').insert(run)
  if (error) { console.error('[db] saveRun:', error.message); return false }
  return true
}
