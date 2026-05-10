import type { ProviderAdapter } from '@/lib/providers/types'
import { replicateAdapter } from '@/lib/providers/replicate'
import { togetherAdapter } from '@/lib/providers/together'

export const PROVIDER_ADAPTERS: ProviderAdapter[] = [
  replicateAdapter,
  togetherAdapter,
]

export function getProviderAdapter(id: string): ProviderAdapter | null {
  return PROVIDER_ADAPTERS.find(adapter => adapter.id === id) ?? null
}
