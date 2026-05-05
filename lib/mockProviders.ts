export interface ServiceProvider {
  id: string
  name: string
  type: string
  pricePerSec: number
  latency: string
  uptime: string
  rating: number
  logo: string
  wallet: string // devnet wallet address to receive payment
}

export const SERVICE_PROVIDERS: ServiceProvider[] = [
  {
    id: 'gpu-alpha',
    name: 'GPU Alpha',
    type: 'GPU Compute',
    pricePerSec: 0.018,
    latency: '12ms',
    uptime: '99.8%',
    rating: 4.9,
    logo: '⚡',
    wallet: '3rXKwQ1kpjBd5tdcco32qsvqUh1BnZjcYnS5kYrP7AYE',
  },
  {
    id: 'gpu-beta',
    name: 'GPU Beta',
    type: 'GPU Compute',
    pricePerSec: 0.022,
    latency: '8ms',
    uptime: '99.5%',
    rating: 4.7,
    logo: '🔷',
    wallet: 'Bt9oNR5cCtnfuMmXgWELd6q5i974PdEMQDUE55nBC57L',
  },
  {
    id: 'rendernet',
    name: 'RenderNet',
    type: 'GPU Render',
    pricePerSec: 0.024,
    latency: '15ms',
    uptime: '99.9%',
    rating: 4.8,
    logo: '🌐',
    wallet: 'FtLZJ4ckCT3SkW4PXhBY6dP7pJ7WYc1Q3X4sNNkPqW2v',
  },
  {
    id: 'fastgpu',
    name: 'FastGPU',
    type: 'GPU Compute',
    pricePerSec: 0.031,
    latency: '6ms',
    uptime: '99.7%',
    rating: 4.6,
    logo: '🚀',
    wallet: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
  },
  {
    id: 'cloudai',
    name: 'CloudAI',
    type: 'AI Inference',
    pricePerSec: 0.015,
    latency: '20ms',
    uptime: '98.9%',
    rating: 4.4,
    logo: '☁️',
    wallet: 'DzHPLnWAoABFQJHGnS7G5bWskyNpNrB9CsH4aF2xrVeM',
  },
]

export function selectCheapestProvider(budget: number): ServiceProvider | null {
  const affordable = SERVICE_PROVIDERS.filter(
    (p) => p.pricePerSec * 3 < budget // assume 3 seconds of compute
  )
  if (!affordable.length) return null
  return affordable.reduce((a, b) => (a.pricePerSec < b.pricePerSec ? a : b))
}

export function estimateCost(provider: ServiceProvider, seconds = 3): number {
  return parseFloat((provider.pricePerSec * seconds).toFixed(6))
}
