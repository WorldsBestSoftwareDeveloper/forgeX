// ─── Provider decision engine ─────────────────────────────────────────────────
// Replaces simple cheapest-sort with weighted multi-factor scoring.
// Weights are dynamically adjusted based on parsed user intent.

import type { ParsedIntent } from '@/app/api/agent/intent/route'

export interface Provider {
  id:              string
  name:            string
  type:            string
  pricePerSec:     number
  latencyMs:       number     // numeric (was string "12ms")
  uptimePct:       number     // numeric (was string "99.8%")
  rating:          number
  logo:            string
  walletAddress:   string
  replicateModel?: string
  togetherModel?:  string
  supportsTypes:   string[]
  // Health tracking (updated at runtime)
  successRate:     number     // 0-1, starts at 1.0
  avgResponseMs:   number     // rolling average
  lastHealthCheck: number     // unix ms
  isHealthy:       boolean
}

export interface ScoredProvider extends Provider {
  score:         number
  scoreBreakdown: {
    cost:       number
    latency:    number
    quality:    number
    reputation: number
  }
}

// ─── Provider registry ────────────────────────────────────────────────────────
// latencyMs and uptimePct are now numeric — converted from the old string format
export const PROVIDER_REGISTRY: Provider[] = [
  {
    id: 'gpu-alpha', name: 'GPU Alpha', type: 'GPU Compute',
    pricePerSec: 0.018, latencyMs: 12, uptimePct: 99.8, rating: 4.9, logo: '⚡',
    walletAddress: '3rXKwQ1kpjBd5tdcco32qsvqUh1BnZjcYnS5kYrP7AYE',
    replicateModel: 'stability-ai/sdxl',
    supportsTypes: ['image-generation', 'upscale', 'compute', 'inference'],
    successRate: 1.0, avgResponseMs: 12, lastHealthCheck: 0, isHealthy: true,
  },
  {
    id: 'gpu-beta', name: 'GPU Beta', type: 'GPU Compute',
    pricePerSec: 0.022, latencyMs: 8, uptimePct: 99.5, rating: 4.7, logo: '🔷',
    walletAddress: 'Bt9oNR5cCtnfuMmXgWELd6q5i974PdEMQDUE55nBC57L',
    replicateModel: 'stability-ai/sdxl',
    supportsTypes: ['image-generation', 'compute', 'inference'],
    successRate: 1.0, avgResponseMs: 8, lastHealthCheck: 0, isHealthy: true,
  },
  {
    id: 'rendernet', name: 'RenderNet', type: 'GPU Render',
    pricePerSec: 0.024, latencyMs: 15, uptimePct: 99.9, rating: 4.8, logo: '🌐',
    walletAddress: 'FtLZJ4ckCT3SkW4PXhBY6dP7pJ7WYc1Q3X4sNNkPqW2v',
    supportsTypes: ['image-generation', 'upscale', 'compute'],
    successRate: 1.0, avgResponseMs: 15, lastHealthCheck: 0, isHealthy: true,
  },
  {
    id: 'fastgpu', name: 'FastGPU', type: 'GPU Compute',
    pricePerSec: 0.031, latencyMs: 6, uptimePct: 99.7, rating: 4.6, logo: '🚀',
    walletAddress: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
    supportsTypes: ['image-generation', 'training', 'compute', 'data-fetching'],
    successRate: 1.0, avgResponseMs: 6, lastHealthCheck: 0, isHealthy: true,
  },
  {
    id: 'cloudai', name: 'CloudAI', type: 'AI Inference',
    pricePerSec: 0.015, latencyMs: 20, uptimePct: 98.9, rating: 4.4, logo: '☁️',
    walletAddress: 'DzHPLnWAoABFQJHGnS7G5bWskyNpNrB9CsH4aF2xrVeM',
    togetherModel: 'stabilityai/stable-diffusion-xl-base-1.0',
    supportsTypes: ['inference', 'image-generation', 'text-generation', 'research', 'data-fetching'],
    successRate: 1.0, avgResponseMs: 20, lastHealthCheck: 0, isHealthy: true,
  },
]

// ─── Scoring weights by intent priority ──────────────────────────────────────
interface Weights { cost: number; latency: number; quality: number; reputation: number }

function getWeights(intent: ParsedIntent | null): Weights {
  const priority = intent?.priority ?? 'cheapest'
  switch (priority) {
    case 'fastest':      return { cost: 0.15, latency: 0.55, quality: 0.15, reputation: 0.15 }
    case 'best-quality': return { cost: 0.10, latency: 0.20, quality: 0.45, reputation: 0.25 }
    default:             return { cost: 0.55, latency: 0.20, quality: 0.15, reputation: 0.10 }
  }
}

// ─── Normalise a value to 0–1 where higher = better ─────────────────────────
function normaliseCost(price: number, allPrices: number[]): number {
  const min = Math.min(...allPrices)
  const max = Math.max(...allPrices)
  if (max === min) return 1
  return 1 - (price - min) / (max - min)   // lower cost = higher score
}

function normaliseLatency(ms: number, allMs: number[]): number {
  const min = Math.min(...allMs)
  const max = Math.max(...allMs)
  if (max === min) return 1
  return 1 - (ms - min) / (max - min)      // lower latency = higher score
}

function normaliseRating(rating: number): number {
  return (rating - 1) / 4                   // 1–5 → 0–1
}

function normaliseSuccessRate(rate: number): number {
  return rate                               // already 0–1
}

// ─── Main scoring function ────────────────────────────────────────────────────
export function rankProviders(
  providers: Provider[],
  intent:    ParsedIntent | null,
  remaining: number              // remaining USDC budget
): ScoredProvider[] {
  const taskType = intent?.taskType ?? 'image-generation'
  const needsImageBackend = taskType === 'image-generation' || taskType === 'upscale'

  // Filter: must support task type and be within budget
  const eligible = providers.filter(p =>
    p.isHealthy &&
    p.supportsTypes.includes(taskType) &&
    (!needsImageBackend || !!(p.replicateModel || p.togetherModel)) &&
    p.pricePerSec * 3 <= remaining        // 3s compute minimum
  )

  // Fall back to all healthy providers if none match type
  const candidates = eligible.length > 0
    ? eligible
    : providers.filter(p => p.isHealthy)

  const allPrices  = candidates.map(p => p.pricePerSec)
  const allLatency = candidates.map(p => p.latencyMs)
  const weights    = getWeights(intent)

  const scored: ScoredProvider[] = candidates.map(p => {
    const costScore       = normaliseCost(p.pricePerSec, allPrices)
    const latencyScore    = normaliseLatency(p.latencyMs, allLatency)
    const qualityScore    = normaliseRating(p.rating)
    const reputationScore = normaliseSuccessRate(p.successRate)

    const score =
      weights.cost       * costScore       +
      weights.latency    * latencyScore    +
      weights.quality    * qualityScore    +
      weights.reputation * reputationScore

    return {
      ...p,
      score: parseFloat(score.toFixed(4)),
      scoreBreakdown: {
        cost:       parseFloat((weights.cost       * costScore      ).toFixed(3)),
        latency:    parseFloat((weights.latency    * latencyScore   ).toFixed(3)),
        quality:    parseFloat((weights.quality    * qualityScore   ).toFixed(3)),
        reputation: parseFloat((weights.reputation * reputationScore).toFixed(3)),
      },
    }
  })

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score)
}

// ─── Health tracking ──────────────────────────────────────────────────────────
export function recordProviderSuccess(providerId: string, responseMs: number): void {
  const p = PROVIDER_REGISTRY.find(x => x.id === providerId)
  if (!p) return
  // Exponential moving average for response time
  p.avgResponseMs  = Math.round(p.avgResponseMs * 0.8 + responseMs * 0.2)
  // Keep success rate near 1 on success (small nudge up)
  p.successRate    = Math.min(1, p.successRate * 0.95 + 0.05)
  p.lastHealthCheck = Date.now()
  p.isHealthy      = true
}

export function recordProviderFailure(providerId: string): void {
  const p = PROVIDER_REGISTRY.find(x => x.id === providerId)
  if (!p) return
  // Penalise success rate
  p.successRate  = Math.max(0, p.successRate * 0.7)
  p.isHealthy    = p.successRate > 0.3
  p.lastHealthCheck = Date.now()
}

// ─── Serialise for API responses (strip runtime-only fields) ─────────────────
export function serialiseProvider(p: ScoredProvider | Provider) {
  return {
    id:            p.id,
    name:          p.name,
    type:          p.type,
    pricePerSec:   p.pricePerSec,
    latency:       `${p.latencyMs}ms`,
    uptime:        `${p.uptimePct}%`,
    rating:        p.rating,
    logo:          p.logo,
    wallet:        p.walletAddress,
    replicateModel: p.replicateModel,
    togetherModel:  p.togetherModel,
    supportsTypes:  p.supportsTypes,
    successRate:    p.successRate,
    isHealthy:      p.isHealthy,
    score:          'score' in p ? p.score : undefined,
    scoreBreakdown: 'scoreBreakdown' in p ? p.scoreBreakdown : undefined,
  }
}
