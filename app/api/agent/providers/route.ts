// POST /api/agent/providers
// Secured: requires valid JWT session token.
// Returns weighted-scored provider list based on parsed intent.

import { NextRequest, NextResponse }           from 'next/server'
import { getSessionFromRequest }                from '@/lib/auth'
import { rateLimit }                            from '@/lib/security'
import { PROVIDER_REGISTRY, rankProviders, serialiseProvider } from '@/lib/providerEngine'
import { createLogger, getTraceId }             from '@/lib/logger'
import { REPLICATE_API_TOKEN, TOGETHER_API_KEY } from '@/lib/config'
import type { ParsedIntent }                    from '@/app/api/agent/intent/route'

const log = createLogger('providers')

// ─── Re-export Provider type for client imports ───────────────────────────────
export interface Provider {
  id:             string
  name:           string
  type:           string
  pricePerSec:    number
  latency:        string
  uptime:         string
  rating:         number
  logo:           string
  wallet:         string
  replicateModel?: string
  togetherModel?:  string
  supportsTypes:  string[]
  successRate:    number
  isHealthy:      boolean
  backendAvailable?: boolean
  backendLabel?:   string
  score?:         number
  scoreBreakdown?: {
    cost:       number
    latency:    number
    quality:    number
    reputation: number
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const traceId = getTraceId(req)

  // Auth required
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit
  if (rateLimit(`providers:${session.wallet}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let intent: ParsedIntent | null = null
  let budget = 999

  try {
    const body = (await req.json()) as { intent?: ParsedIntent; budget?: number }
    intent = body.intent ?? null
    budget = typeof body.budget === 'number' && isFinite(body.budget) ? body.budget : 999
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  log.info('provider ranking', { wallet: session.wallet, budget, priority: intent?.priority }, traceId)

  const taskType = intent?.taskType ?? 'image-generation'
  const needsLiveImageBackend =
    taskType === 'image-generation' || taskType === 'upscale' || taskType === 'inference'

  const availableProviders = needsLiveImageBackend
    ? PROVIDER_REGISTRY.filter((provider) =>
        (provider.replicateModel && !!REPLICATE_API_TOKEN) ||
        (provider.togetherModel && !!TOGETHER_API_KEY)
      )
    : PROVIDER_REGISTRY

  const ranked = rankProviders(availableProviders, intent, budget)

  if (!ranked.length) {
    log.warn('no providers available', { budget, intent, needsLiveImageBackend }, traceId)
    return NextResponse.json({
      error: needsLiveImageBackend
        ? 'No live inference providers are available with the currently configured API keys.'
        : 'No providers available within budget',
    }, { status: 404 })
  }

  const withBackendMeta = ranked.map((provider) => {
    const backendAvailable =
      (!!provider.replicateModel && !!REPLICATE_API_TOKEN) ||
      (!!provider.togetherModel && !!TOGETHER_API_KEY)

    const backendLabel =
      provider.replicateModel ? 'Replicate'
      : provider.togetherModel ? 'Together'
      : 'Unavailable'

    return {
      ...serialiseProvider(provider),
      backendAvailable,
      backendLabel,
    }
  })

  return NextResponse.json({
    providers: withBackendMeta,
    selected:  withBackendMeta[0],
    weights:   intent?.priority,
    traceId,
  })
}
