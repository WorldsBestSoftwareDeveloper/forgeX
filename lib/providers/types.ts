import type { ParsedIntent } from '@/app/api/agent/intent/route'

export interface ProviderRunInput {
  prompt: string
  intent: ParsedIntent
  model?: string
}

export interface ProviderRunOutput {
  ok: boolean
  outputUrl?: string
  outputText?: string
  usedRealProvider: boolean
  error?: string
}

export interface ProviderAdapter {
  id: string
  label: string
  supports: ParsedIntent['taskType'][]
  run(input: ProviderRunInput): Promise<ProviderRunOutput>
}
