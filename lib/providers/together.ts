import type { ProviderAdapter, ProviderRunInput, ProviderRunOutput } from '@/lib/providers/types'

export const togetherAdapter: ProviderAdapter = {
  id: 'together',
  label: 'Together AI',
  supports: ['image-generation', 'text-generation', 'research', 'inference'],
  async run(input: ProviderRunInput): Promise<ProviderRunOutput> {
    void input
    return {
      ok: false,
      usedRealProvider: false,
      error: 'Together AI execution remains routed through /api/agent/run for policy enforcement.',
    }
  },
}
