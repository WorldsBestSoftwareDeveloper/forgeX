import type { ProviderAdapter, ProviderRunInput, ProviderRunOutput } from '@/lib/providers/types'

export const replicateAdapter: ProviderAdapter = {
  id: 'replicate',
  label: 'Replicate',
  supports: ['image-generation', 'upscale', 'inference'],
  async run(input: ProviderRunInput): Promise<ProviderRunOutput> {
    void input
    return {
      ok: false,
      usedRealProvider: false,
      error: 'Replicate execution remains routed through /api/agent/run for spend locking and logging.',
    }
  },
}
