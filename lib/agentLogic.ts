// ─── Agent step builder ───────────────────────────────────────────────────────
// Builds the 4-phase ER activity feed steps.
// Uses the Provider type from providerEngine (not old mockProviders).

import type { Provider } from '@/app/api/agent/providers/route'

export interface AgentStep {
  id:     string
  label:  string
  detail: string
  icon:   string
  color:  string
  phase:  'agent' | 'ephemeral' | 'settlement' | 'solana'
}

// ─── Step sequence — 13 steps across 4 phases ─────────────────────────────────
export function buildAgentSteps(provider: Provider, cost: number): AgentStep[] {
  const providerName = provider.name
  const priceStr     = `$${provider.pricePerSec}/sec`
  const costStr      = `$${cost.toFixed(4)} USDC`

  return [
    // ── PHASE 1: Agent Activity ──────────────────────────────────────────────
    {
      id: 'session-start', phase: 'agent', icon: 'bolt', color: '#818CF8',
      label: 'Agent session started',
      detail: 'Forge agent initialised · task parsed · budget verified',
    },
    {
      id: 'discover', phase: 'agent', icon: 'search', color: '#818CF8',
      label: 'Discovering service providers',
      detail: 'Broadcasting to 5 registered providers on the network…',
    },
    {
      id: 'negotiate', phase: 'agent', icon: 'activity', color: '#FBBF24',
      label: 'Agent negotiates with providers',
      detail: 'Weighted scoring: cost · latency · quality · reputation',
    },
    {
      id: 'select', phase: 'agent', icon: 'check', color: '#34D399',
      label: `Selected ${providerName} — ${priceStr}`,
      detail: `Highest score for intent · ${provider.uptime} uptime · ${provider.latency} latency`,
    },

    // ── PHASE 2: Ephemeral Execution Environment ──────────────────────────────
    {
      id: 'er-create', phase: 'ephemeral', icon: 'lock', color: '#A78BFA',
      label: 'Private Ephemeral Rollup environment created',
      detail: 'MagicBlock TEE spun up · isolated execution context · challenge signed',
    },
    {
      id: 'er-auth', phase: 'ephemeral', icon: 'shield', color: '#A78BFA',
      label: 'TEE auth token obtained from MagicBlock',
      detail: 'Phantom signed challenge · ER session active · payment channel open',
    },
    // Payment gate — feed pauses here until Phantom approves
    {
      id: 'er-payment', phase: 'ephemeral', icon: 'zap', color: '#A78BFA',
      label: `Micropayment processed — ${costStr} USDC`,
      detail: 'visibility: private · amount + counterparty encrypted in TEE',
    },
    {
      id: 'er-execute', phase: 'ephemeral', icon: 'cpu', color: '#FBBF24',
      label: `Task executing on ${providerName} inside ER`,
      detail: 'Inference running in isolated GPU environment · results streaming…',
    },
    {
      id: 'er-result', phase: 'ephemeral', icon: 'check', color: '#34D399',
      label: 'Task results finalised inside Ephemeral Rollup',
      detail: 'Output verified · ZK proof generated · ready for settlement',
    },

    // ── PHASE 3: Batch / Private Settlement ──────────────────────────────────
    {
      id: 'settle-batch', phase: 'settlement', icon: 'layers', color: '#F59E0B',
      label: 'Batching transactions for compressed settlement',
      detail: 'Micropayments aggregated · state diff computed · calldata minimised',
    },
    {
      id: 'settle-compress', phase: 'settlement', icon: 'shield', color: '#F59E0B',
      label: 'Compressing settlement data',
      detail: 'ZK state proof generated · on-chain footprint reduced ~95%',
    },

    // ── PHASE 4: Final Settlement to Solana ──────────────────────────────────
    {
      id: 'solana-submit', phase: 'solana', icon: 'chain', color: '#34D399',
      label: 'Compressed settlement posted to Solana devnet',
      detail: 'Single settlement tx · all individual amounts remain private on-chain',
    },
    {
      id: 'solana-confirm', phase: 'solana', icon: 'done', color: '#34D399',
      label: 'Settlement confirmed on Solana · ZK receipt ready',
      detail: `${costStr} spent · task complete · reputation updated`,
    },
  ]
}

// ─── Step delays (ms from t=0) ────────────────────────────────────────────────
// paymentIdx = 6 (er-payment). Pre-steps are indices 0-5, post-steps 7-12.
export const STEP_DELAYS = [
  0,     // session-start
  900,   // discover
  1900,  // negotiate
  3100,  // select
  4400,  // er-create
  5300,  // er-auth
  5300,  // er-payment (payment gate — pauses here, no timer)
  7800,  // er-execute  (post-payment)
  9400,  // er-result
  10600, // settle-batch
  11400, // settle-compress
  12300, // solana-submit
  13500, // solana-confirm
]

// ─── Task output generator ────────────────────────────────────────────────────
const PLACEHOLDER_IMAGES = [
  'https://picsum.photos/seed/forge-a/800/500',
  'https://picsum.photos/seed/forge-b/800/500',
  'https://picsum.photos/seed/forge-c/800/500',
  'https://picsum.photos/seed/forge-d/800/500',
]

export function generateTaskOutput(task: string): { image: string; text: string } {
  const lower = task.toLowerCase()
  const image = PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)]
  const text  = lower.includes('upscale')
    ? `Upscaling complete for: "${task}". Enhanced to 4K using AI super-resolution.`
    : lower.includes('train')
    ? `Training run complete for: "${task}". Processed in Ephemeral Rollup.`
    : `Generated output for: "${task}". Rendered via isolated GPU in Ephemeral Rollup. Settlement compressed to Solana.`
  return { image, text }
}
