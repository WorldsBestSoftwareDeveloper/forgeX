'use client'

import { useEffect, useRef } from 'react'
import { AgentStep } from '@/lib/agentLogic'
import { motion, AnimatePresence } from 'framer-motion'

const PHASES = {
  agent:      { label: 'Agent Activity',                   color: '#818CF8', bg: 'rgba(129,140,248,0.06)', border: 'rgba(129,140,248,0.18)' },
  ephemeral:  { label: 'Ephemeral Execution Environment',  color: '#A78BFA', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.18)' },
  settlement: { label: 'Batch / Private Settlement',       color: '#F59E0B', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.18)'  },
  solana:     { label: 'Final Settlement → Solana',        color: '#34D399', bg: 'rgba(52,211,153,0.06)',  border: 'rgba(52,211,153,0.18)'  },
} as const

const PHASE_ORDER = ['agent', 'ephemeral', 'settlement', 'solana'] as const

const ICONS: Record<string, string> = {
  bolt: '⚡', search: '🔍', activity: '📊', check: '✓',
  lock: '🔒', shield: '🛡', zap: '⚡', cpu: '💻',
  layers: '◫', chain: '⛓', done: '✅', negotiate: '⇄',
}

interface Props {
  steps: AgentStep[]
  isRunning: boolean
  waitingForWallet?: boolean
  walletAction?: 'sign-message' | 'sign-tx' | null
}

export function ActivityFeed({ steps, isRunning, waitingForWallet, walletAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [steps.length, waitingForWallet])

  if (steps.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280' }}>
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>⚡</div>
        <div style={{ fontSize: 14, marginBottom: 4 }}>No tasks run yet.</div>
        <div style={{ fontSize: 13 }}>Start a task to see the live Ephemeral Rollup flow.</div>
      </div>
    )
  }

  // Group received steps by phase
  const byPhase: Partial<Record<typeof PHASE_ORDER[number], AgentStep[]>> = {}
  for (const s of steps) {
    const p = s.phase as typeof PHASE_ORDER[number]
    if (!byPhase[p]) byPhase[p] = []
    byPhase[p]!.push(s)
  }

  return (
    <div
      ref={feedRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: 'min(68vh, 760px)',
        overflowY: 'auto',
        paddingRight: 4,
        overscrollBehavior: 'contain',
      }}
    >

      {/* Pipeline overview bar */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
        padding: '12px 16px',
        background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)',
        borderRadius: 12,
      }}>
        {PHASE_ORDER.map((phase, i) => {
          const ph = PHASES[phase]
          const reached = !!byPhase[phase]
          return (
            <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap', transition: 'all 0.5s ease',
                background: reached ? ph.bg : 'transparent',
                border: `1px solid ${reached ? ph.border : 'rgba(99,102,241,0.08)'}`,
                color: reached ? ph.color : '#374151',
              }}>{ph.label}</div>
              {i < PHASE_ORDER.length - 1 && (
                <span style={{ color: '#2D3748', fontSize: 13 }}>→</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Phases */}
      {PHASE_ORDER.map((phase, phaseIdx) => {
        const phaseSteps = byPhase[phase]
        if (!phaseSteps?.length) return null
        const ph = PHASES[phase]
        const nextPhase = PHASE_ORDER[phaseIdx + 1]
        const nextReached = nextPhase && !!byPhase[nextPhase]

        return (
          <motion.div key={phase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ height: 1, flex: 1, background: ph.border }} />
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: ph.color, padding: '3px 11px',
                background: ph.bg, border: `1px solid ${ph.border}`, borderRadius: 20,
                whiteSpace: 'nowrap',
              }}>{ph.label}</div>
              <div style={{ height: 1, flex: 1, background: ph.border }} />
            </div>

            {/* Steps within phase */}
            <div style={{
              background: ph.bg, border: `1px solid ${ph.border}`,
              borderRadius: 12, padding: '2px 16px',
            }}>
              <AnimatePresence>
                {phaseSteps.map((step, i) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '11px 0',
                      borderBottom: i < phaseSteps.length - 1 ? `1px solid ${ph.border}` : 'none',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: `${step.color}18`,
                      border: `1.5px solid ${step.color}45`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: step.color, marginTop: 2,
                    }}>
                      {ICONS[step.icon] ?? '✓'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EAFF', marginBottom: 2, lineHeight: 1.3 }}>
                        {step.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5 }}>
                        {step.detail}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Arrow to next phase */}
            {(nextReached || (isRunning && !nextReached)) && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', color: '#374151', fontSize: 16 }}>↓</div>
            )}
          </motion.div>
        )
      })}

      {/* Wallet waiting state — shown mid-flow when Phantom is open */}
      <AnimatePresence>
        {waitingForWallet && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 12,
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.2)', borderTopColor: '#FBBF24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24' }}>
                {walletAction === 'sign-message'
                  ? '👻 Waiting for Phantom — Sign Message to authorise TEE'
                  : '👻 Waiting for Phantom — Approve transaction'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                {walletAction === 'sign-message'
                  ? 'Activity feed paused · will resume automatically after you sign'
                  : 'Final step · payment submits to Solana after approval'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generic in-progress spinner (non-wallet) */}
      {isRunning && !waitingForWallet && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '1.5px solid rgba(99,102,241,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#818CF8', animation: 'spin 0.7s linear infinite' }} />
          </div>
          <span style={{ fontSize: 13, color: '#6B7280', animation: 'ticker 1.2s ease-in-out infinite' }}>
            Processing in Ephemeral Rollup...
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
