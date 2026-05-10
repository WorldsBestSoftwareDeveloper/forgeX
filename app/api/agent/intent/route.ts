// POST /api/agent/intent
// Secured: requires valid JWT. Rate limited.
// Parses natural language task into structured intent.
// LLM NEVER controls spending — purely for routing decisions.

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest }     from '@/lib/auth'
import { rateLimit, validateTask }   from '@/lib/security'

export interface ParsedIntent {
  taskType:  'image-generation' | 'upscale' | 'inference' | 'training' | 'compute' | 'text-generation' | 'research' | 'data-fetching' | 'treasury-balancing'
  priority:  'cheapest' | 'fastest' | 'best-quality'
  budgetCap: number | null   // explicit cap from user's task text, null = use agent budget
  keywords:  string[]
  prompt:    string          // cleaned prompt suitable for AI inference
  raw:       string          // original task text
}

// Rule-based fallback (no API key needed)
function fallbackParse(task: string): ParsedIntent {
  const lower = task.toLowerCase()
  return {
    taskType:
      lower.includes('upscale')   ? 'upscale'
      : lower.includes('research') || lower.includes('summary') ? 'research'
      : lower.includes('write') || lower.includes('text') || lower.includes('reason') ? 'text-generation'
      : lower.includes('fetch') || lower.includes('data') ? 'data-fetching'
      : lower.includes('rebalance') || lower.includes('treasury') || lower.includes('gas') ? 'treasury-balancing'
      : lower.includes('train')   ? 'training'
      : lower.includes('infer')   ? 'inference'
      : 'image-generation',
    priority:
      lower.includes('fast') || lower.includes('quick')       ? 'fastest'
      : lower.includes('quality') || lower.includes('best')   ? 'best-quality'
      : 'cheapest',
    budgetCap: null,
    keywords: task.split(/\s+/).filter(w => w.length > 3).slice(0, 6),
    prompt: task.trim(),
    raw:    task.trim(),
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit
  if (rateLimit(`intent:${session.wallet}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let task: string
  let agentBudget: number
  try {
    const body = (await req.json()) as { task?: unknown; agentBudget?: unknown }
    task        = typeof body.task        === 'string' ? body.task        : ''
    agentBudget = typeof body.agentBudget === 'number' ? body.agentBudget : 5
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!validateTask(task)) {
    return NextResponse.json({ error: 'Invalid task text' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      intent: fallbackParse(task),
      source: 'fallback' as const,
    })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       process.env.OPENAI_INTENT_MODEL ?? 'gpt-4o-mini',
        max_tokens:  200,
        temperature: 0,
        messages: [
          {
            role:    'system',
            content: `Parse AI agent task descriptions into JSON only.
Return ONLY valid JSON, no markdown, no explanation.
Schema:
{
  "taskType": "image-generation"|"upscale"|"inference"|"training"|"compute"|"text-generation"|"research"|"data-fetching"|"treasury-balancing",
  "priority": "cheapest"|"fastest"|"best-quality",
  "budgetCap": number|null,
  "keywords": string[],
  "prompt": string
}
Rules:
- taskType: infer from task
- priority: "cheapest" unless user says fast/quick/best/quality
- budgetCap: extract dollar amount if user says "under $X" or "max $X", else null. Never exceed agentBudget=${agentBudget}
- keywords: 4-6 key descriptive words
- prompt: cleaned version suitable as an AI image/inference prompt
- LLM NEVER controls payments`,
          },
          { role: 'user', content: task },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) throw new Error(`OpenAI ${response.status}`)

    const data    = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    const text    = data.choices?.[0]?.message?.content ?? ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed  = normaliseParsedIntent(JSON.parse(cleaned) as Partial<Omit<ParsedIntent, 'raw'>>, task, agentBudget)

    return NextResponse.json({
      intent: parsed,
      source: 'llm' as const,
    })
  } catch (err) {
    console.warn('[intent] LLM failed, using fallback:', err)
    return NextResponse.json({
      intent: fallbackParse(task),
      source: 'fallback' as const,
    })
  }
}

const TASK_TYPES: ParsedIntent['taskType'][] = [
  'image-generation',
  'upscale',
  'inference',
  'training',
  'compute',
  'text-generation',
  'research',
  'data-fetching',
  'treasury-balancing',
]

const PRIORITIES: ParsedIntent['priority'][] = ['cheapest', 'fastest', 'best-quality']

function normaliseParsedIntent(
  parsed: Partial<Omit<ParsedIntent, 'raw'>>,
  raw: string,
  agentBudget: number,
): ParsedIntent {
  const fallback = fallbackParse(raw)
  const taskType = parsed.taskType && TASK_TYPES.includes(parsed.taskType)
    ? parsed.taskType
    : fallback.taskType
  const priority = parsed.priority && PRIORITIES.includes(parsed.priority)
    ? parsed.priority
    : fallback.priority
  const budgetCap = typeof parsed.budgetCap === 'number' && Number.isFinite(parsed.budgetCap)
    ? Math.max(0, Math.min(parsed.budgetCap, agentBudget))
    : null
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k): k is string => typeof k === 'string').map(k => k.trim()).filter(Boolean).slice(0, 6)
    : fallback.keywords
  const prompt = typeof parsed.prompt === 'string' && parsed.prompt.trim().length > 0
    ? parsed.prompt.trim().slice(0, 500)
    : fallback.prompt

  return { taskType, priority, budgetCap, keywords, prompt, raw: raw.trim() }
}
