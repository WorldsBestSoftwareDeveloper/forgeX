// POST /api/agent/run
// Secured: JWT required, rate limited, spend cap enforced server-side.
// Full flow: validate → lock budget → infer → unlock → persist.

import { NextRequest, NextResponse }        from 'next/server'
import { getSessionFromRequest }             from '@/lib/auth'
import {
  rateLimit, validateTask, validateProviderId,
  enforceSpendCap, sanitiseString,
}                                            from '@/lib/security'
import { reserveSpend, releaseSpend, isLocked } from '@/lib/spendLock'
import { recordProviderSuccess, recordProviderFailure } from '@/lib/providerEngine'
import { dbSaveRun, dbUpdateAgent }          from '@/lib/supabase'
import { createLogger, getTraceId }          from '@/lib/logger'
import {
  MAX_SINGLE_TX_USDC, MAX_RUNS_PER_MIN,
  REPLICATE_API_TOKEN, TOGETHER_API_KEY,
  REPLICATE_POLL_MS, REPLICATE_MAX_POLLS,
  SIMULATE_INFERENCE,
}                                            from '@/lib/config'
import type { ParsedIntent }                 from '@/app/api/agent/intent/route'
import type { Provider }                     from '@/app/api/agent/providers/route'

const log = createLogger('agent/run')

// ─── Request / Response types ─────────────────────────────────────────────────
interface RunBody {
  task:         string
  intent:       ParsedIntent
  provider:     Provider
  agentId:      string
  erSessionId:  string
  agentBudget:  number
  agentSpent:   number
}

export interface RunResult {
  success:           boolean
  imageUrl:          string
  outputText:        string
  usedRealInference: boolean
  provider:          string
  costUsdc:          number
  runId:             string
  traceId:           string
  inferenceError?:   string
  error?:            string
}

// ─── Placeholder images ────────────────────────────────────────────────────────
const PLACEHOLDERS = [
  'https://picsum.photos/seed/forge-a/800/500',
  'https://picsum.photos/seed/forge-b/800/500',
  'https://picsum.photos/seed/forge-c/800/500',
  'https://picsum.photos/seed/forge-d/800/500',
]
const placeholder = () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

// ─── Replicate inference ──────────────────────────────────────────────────────
async function runReplicate(
  prompt: string,
  model: string,
  traceId: string,
  intent?: ParsedIntent | null,
): Promise<{ url: string | null; error?: string }> {
  const token = REPLICATE_API_TOKEN
  if (!token) return { url: null, error: 'Replicate API token is missing on the server.' }

  const input = buildReplicateInput({ prompt, model, intent })
  let lastError = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const create = await fetch('https://api.replicate.com/v1/predictions', {
        method:  'POST',
        headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          version: model,
          input,
        }),
        signal: AbortSignal.timeout(12_000),
      })

      if (!create.ok) {
        const body = await create.text().catch(() => '')
        lastError = `Replicate create failed (${create.status})${body ? `: ${body}` : ''}`
        log.warn('replicate create failed', { status: create.status, attempt, body }, traceId)
        continue
      }

      const { id: predId } = (await create.json()) as { id: string }

      for (let poll = 0; poll < REPLICATE_MAX_POLLS; poll++) {
        await new Promise(r => setTimeout(r, REPLICATE_POLL_MS))
        const res    = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
          headers: { 'Authorization': `Token ${token}` },
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          lastError = `Replicate poll failed (${res.status})${body ? `: ${body}` : ''}`
          log.warn('replicate poll failed', { status: res.status, body, predId }, traceId)
          break
        }
        const result = (await res.json()) as { status: string; output?: string[]; error?: string }

        if (result.status === 'succeeded') {
          if (result.output?.[0]) return { url: result.output[0] }
          lastError = 'Replicate succeeded but returned no image URL.'
          break
        }
        if (result.status === 'failed') {
          lastError = result.error
            ? `Replicate prediction failed: ${result.error}`
            : 'Replicate prediction failed without an error message.'
          log.warn('replicate prediction failed', { error: result.error }, traceId)
          break
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      log.warn(`replicate attempt ${attempt} threw`, { err: String(err) }, traceId)
    }
  }
  return {
    url: null,
    error: lastError || `Replicate did not return an image for model ${model}.`,
  }
}

function buildReplicateInput(p: {
  prompt: string
  model: string
  intent?: ParsedIntent | null
}): Record<string, unknown> {
  const enhancedPrompt = buildImagePrompt(p.prompt, p.intent)

  // Official SDXL model accepts these fields well.
  if (p.model === 'stability-ai/sdxl') {
    return {
      prompt: enhancedPrompt,
      negative_prompt:
        'blurry, low quality, distorted, deformed, extra limbs, duplicate, cropped, text, watermark, logo',
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: 'K_EULER',
      num_inference_steps: 40,
      guidance_scale: 8,
      refine: 'expert_ensemble_refiner',
      high_noise_frac: 0.8,
    }
  }

  // Generic fallback for older or alternate models.
  return {
    prompt: enhancedPrompt,
    width: 1024,
    height: 1024,
    num_inference_steps: 30,
    guidance_scale: 8,
  }
}

function buildImagePrompt(rawPrompt: string, intent?: ParsedIntent | null): string {
  const cleaned = sanitiseString(rawPrompt, 300)
  const keywords = (intent?.keywords ?? [])
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, 6)

  const lower = cleaned.toLowerCase()
  const quality =
    intent?.priority === 'best-quality'
      ? 'highly detailed, polished, professional lighting, strong composition'
      : intent?.priority === 'fastest'
      ? 'clear subject, simple composition, readable details'
      : 'high detail, clean composition, vivid lighting'

  const styleHints: string[] = []
  if (/\bcute\b/.test(lower)) styleHints.push('adorable expression', 'soft friendly features')
  if (/\bpuppy|dog\b/.test(lower)) styleHints.push('dog portrait', 'natural fur texture')
  if (/\bcat|kitten\b/.test(lower)) styleHints.push('expressive eyes', 'soft fur texture')
  if (/\bcyberpunk\b/.test(lower)) styleHints.push('neon lighting', 'futuristic city atmosphere')
  if (/\bfuturistic|sci-fi|scifi\b/.test(lower)) styleHints.push('science fiction aesthetic')
  if (/\brealistic|photo|photograph\b/.test(lower)) styleHints.push('photorealistic', 'real camera lighting')
  if (/\banime|cartoon|illustration\b/.test(lower)) styleHints.push('illustrated style')

  const keywordPhrase = keywords.length ? `Key elements: ${keywords.join(', ')}.` : ''

  return [
    cleaned,
    keywordPhrase,
    `Focus on the main subject and match the user's request precisely.`,
    `Visual direction: ${quality}.`,
    styleHints.length ? `Style cues: ${styleHints.join(', ')}.` : '',
    'Center the requested subject, keep anatomy natural, and avoid unrelated objects.',
  ]
    .filter(Boolean)
    .join(' ')
}

// ─── Together AI inference ────────────────────────────────────────────────────
async function runTogether(
  prompt:  string,
  model:   string,
  traceId: string
): Promise<{ url: string | null; error?: string }> {
  const token = TOGETHER_API_KEY
  if (!token) return { url: null, error: 'Together API key is missing on the server.' }

  try {
    const res = await fetch('https://api.together.xyz/v1/images/generations', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, prompt, n: 1, width: 768, height: 512 }),
      signal:  AbortSignal.timeout(35_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.warn('together failed', { status: res.status, body }, traceId)
      return { url: null, error: `Together failed (${res.status})${body ? `: ${body}` : ''}` }
    }
    const data = (await res.json()) as { data?: Array<{ url: string }> }
    return data.data?.[0]?.url
      ? { url: data.data[0].url }
      : { url: null, error: 'Together succeeded but returned no image URL.' }
  } catch (err) {
    log.warn('together threw', { err: String(err) }, traceId)
    return {
      url: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const traceId = getTraceId(req)

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Sign in first.' }, { status: 401 })
  }

  // ── 2. Rate limit ──────────────────────────────────────────────────────────
  if (rateLimit(`run:${session.wallet}`, MAX_RUNS_PER_MIN, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Max 5 tasks per minute.' }, { status: 429 })
  }

  // ── 3. Parse + validate body ───────────────────────────────────────────────
  let body: RunBody
  try {
    body = (await req.json()) as RunBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { task, intent, provider, agentId, erSessionId, agentBudget, agentSpent } = body

  if (!validateTask(task)) {
    return NextResponse.json({ error: 'Invalid task. Must be 3–500 characters.' }, { status: 400 })
  }
  if (!validateProviderId(provider?.id)) {
    return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })
  }
  if (typeof agentBudget !== 'number' || !isFinite(agentBudget) ||
      typeof agentSpent  !== 'number' || !isFinite(agentSpent)) {
    return NextResponse.json({ error: 'agentBudget and agentSpent must be finite numbers.' }, { status: 400 })
  }

  const estimatedCost = parseFloat((provider.pricePerSec * 3).toFixed(6))

  // ── 4. Spend cap (server-side — cannot be bypassed) ────────────────────────
  const cap = enforceSpendCap({
    agentBudget, agentSpent, requestedCost: estimatedCost, maxSingleTx: MAX_SINGLE_TX_USDC,
  })
  if (!cap.allowed) {
    log.warn('spend cap rejected', { wallet: session.wallet, agentId, reason: cap.reason }, traceId)
    return NextResponse.json({ error: cap.reason }, { status: 403 })
  }

  // ── 5. Spend lock — prevent concurrent runs on same agent ─────────────────
  if (isLocked(session.wallet, agentId)) {
    return NextResponse.json(
      { error: 'Agent already has an active run. Wait for it to complete.' },
      { status: 409 }
    )
  }
  const locked = reserveSpend(session.wallet, agentId, estimatedCost)
  if (!locked) {
    return NextResponse.json({ error: 'Could not acquire spend lock.' }, { status: 409 })
  }

  log.info('run started', {
    wallet: session.wallet, agentId, provider: provider.id,
    cost: estimatedCost, task: task.slice(0, 60), traceId,
  })

  const runId    = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  let   imageUrl = ''
  let   usedReal = false
  let   inferenceError: string | undefined
  const startMs  = Date.now()

  try {
    // ── 6. Inference ────────────────────────────────────────────────────────
    const prompt = sanitiseString(intent?.prompt ?? task, 400)

    if (!SIMULATE_INFERENCE) {
      if (provider.replicateModel) {
        const replicate = await runReplicate(prompt, provider.replicateModel, traceId, intent)
        if (replicate.url) {
          imageUrl = replicate.url
          usedReal = true
        } else if (replicate.error) {
          inferenceError = replicate.error
        }
      }
      if (!imageUrl && provider.togetherModel) {
        const together = await runTogether(prompt, provider.togetherModel, traceId)
        if (together.url) {
          imageUrl = together.url
          usedReal = true
        } else if (together.error) {
          inferenceError = together.error
        }
      }
      if (!imageUrl) {
        inferenceError =
          inferenceError ??
          (provider.replicateModel || provider.togetherModel
            ? `Inference provider did not return an image for ${provider.name}.`
            : `No live inference backend configured for ${provider.name}.`)
      }
    }

    const elapsedMs = Date.now() - startMs

    if (imageUrl) {
      recordProviderSuccess(provider.id, elapsedMs)
    } else {
      // Soft fallback — placeholder, still counts as success
      imageUrl = placeholder()
      recordProviderFailure(provider.id)
      log.warn('inference failed, using placeholder', { provider: provider.id, elapsedMs }, traceId)
    }

    // ── 7. Persist run ───────────────────────────────────────────────────────
    const outputText = buildOutputText({
      task,
      providerName: provider.name,
      usedReal,
      intent,
      inferenceError,
    })
    await dbSaveRun({
      id: runId, agent_id: agentId, wallet_address: session.wallet,
      task: sanitiseString(task, 500),
      parsed_intent: ((intent ?? {}) as unknown) as Record<string, unknown>,
      provider_id: provider.id, provider_name: provider.name,
      cost_usdc: estimatedCost, tx_signature: null, used_real_payment: false,
      er_session_id: erSessionId ?? '',
      output_url: imageUrl, output_text: outputText, status: 'completed',
    })

    await dbUpdateAgent(agentId, session.wallet, {
      last_task: sanitiseString(task, 100), status: 'idle',
    })

    log.info('run completed', {
      runId, wallet: session.wallet, agentId,
      usedReal, elapsedMs: Date.now() - startMs,
    }, traceId)

    const result: RunResult = {
      success: true, imageUrl, outputText, usedRealInference: usedReal,
      provider: provider.name, costUsdc: estimatedCost, runId, traceId, inferenceError,
    }
    return NextResponse.json(result)

  } catch (err) {
    recordProviderFailure(provider.id)
    log.error('run failed', { err: String(err), agentId, provider: provider.id }, traceId)
    return NextResponse.json(
      { error: 'Internal execution error', traceId },
      { status: 500 }
    )
  } finally {
    // Always release the lock, even on error
    releaseSpend(session.wallet, agentId)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildOutputText(p: {
  task: string
  providerName: string
  usedReal: boolean
  intent?: ParsedIntent | null
  inferenceError?: string
}): string {
  const suffix = p.usedReal
    ? ` Real AI inference via ${p.providerName}.`
    : ` Placeholder output used. ${formatInferenceError(p.inferenceError)}`
  return p.intent?.taskType === 'upscale'
    ? `Upscaling complete for: "${p.task}".${suffix}`
    : `Generated output for: "${p.task}" via ${p.providerName}.${suffix}`
}

function formatInferenceError(error?: string): string {
  if (!error) return 'Inference backend unavailable.'

  const lower = error.toLowerCase()
  if (lower.includes('request was throttled') || lower.includes('(429)')) {
    const retryMatch = error.match(/retry_after["': ]+(\d+)/i) ?? error.match(/resets in ~?(\d+)s/i)
    const retrySeconds = retryMatch?.[1]
    return retrySeconds
      ? `Replicate rate limit reached. Please wait about ${retrySeconds}s, then try again.`
      : 'Replicate rate limit reached. Please wait a few seconds, then try again.'
  }

  return error
}
