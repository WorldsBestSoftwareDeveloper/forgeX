'use client'

import { motion, AnimatePresence } from 'framer-motion'

const ER_STEPS = [
  { id: 'challenge', label: 'Phantom signing TEE challenge…',            sublabel: 'Agent · Auth',         color: '#818CF8', walletGate: 'sign-message' },
  { id: 'token',     label: 'MagicBlock issuing ER auth token',          sublabel: 'Agent · Auth',         color: '#818CF8', walletGate: null },
  { id: 'build',     label: 'Building private transfer (visibility: private)', sublabel: 'Ephemeral Rollup', color: '#FBBF24', walletGate: null },
  { id: 'route',     label: 'Routing through Private Ephemeral Rollup',  sublabel: 'Ephemeral Rollup',     color: '#FBBF24', walletGate: null },
  { id: 'batch',     label: 'Micropayments batched inside ER',           sublabel: 'Ephemeral Rollup',     color: '#FBBF24', walletGate: null },
  { id: 'sign-tx',   label: 'Phantom signing settlement transaction…',   sublabel: 'ER → Solana',          color: '#34D399', walletGate: 'sign-tx' },
  { id: 'settle',    label: 'Compressed settlement posted to Solana',    sublabel: 'Solana devnet',        color: '#34D399', walletGate: null },
]

interface Props {
  provider: { name: string }
  amount: number
  walletAction: 'sign-message' | 'sign-tx' | null
  paymentDone: boolean
  usedRealPayment?: boolean
  onComplete: () => void
}

export function PaymentModal({ provider, amount, walletAction, paymentDone, usedRealPayment, onComplete }: Props) {
  const getStepState = (i: number): 'done' | 'active' | 'pending' => {
    if (paymentDone) return 'done'
    if (walletAction === 'sign-message') return i === 0 ? 'active' : 'pending'
    if (walletAction === 'sign-tx') {
      if (i < 5) return 'done'
      if (i === 5) return 'active'
      return 'pending'
    }
    return i === 0 ? 'active' : 'pending'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="lg-modal"
        style={{ padding: 32, maxWidth: 480, width: '100%', position: 'relative' }}
      >
        {/* Top refraction */}
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)', borderRadius: '22px 22px 0 0' }} />

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <motion.div
            animate={paymentDone ? {} : { boxShadow: ['0 0 24px rgba(99,102,241,0.3)', '0 0 52px rgba(99,102,241,0.55)', '0 0 24px rgba(99,102,241,0.3)'] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              width: 60, height: 60, borderRadius: '50%', margin: '0 auto 16px',
              background: paymentDone ? 'rgba(52,211,153,0.12)' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              border: paymentDone ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
            }}
          >{paymentDone ? '✅' : '🔒'}</motion.div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 19, fontWeight: 700, marginBottom: 5, color: 'rgba(240,242,255,0.95)' }}>
            {paymentDone ? 'Settlement Complete' : 'Private Payment via ER'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
            {paymentDone
              ? usedRealPayment ? '✓ Real MagicBlock ER · Confirmed on Solana devnet' : '✓ Simulated fallback (MagicBlock devnet unreachable)'
              : 'MagicBlock Ephemeral Rollup · Private TEE · Solana Devnet'}
          </div>
        </div>

        {/* Phantom banner */}
        <AnimatePresence>
          {walletAction && !paymentDone && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                marginBottom: 18, padding: '11px 15px', borderRadius: 10,
                background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.25)', borderTopColor: '#FBBF24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FBBF24' }}>
                  {walletAction === 'sign-message' ? '👻 Phantom open — click "Sign Message" to authorise TEE access' : '👻 Phantom open — click "Approve" to confirm private payment'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {walletAction === 'sign-message' ? 'Free · no SOL · grants ER session access' : '~0.000005 SOL · amount hidden via Private Ephemeral Rollup'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Obfuscated amounts */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Sending', value: paymentDone ? `${amount.toFixed(4)} USDC` : '??? USDC' },
            { label: 'To',      value: paymentDone ? provider.name : '???' },
            { label: 'Via',     value: 'ER · Private' },
          ].map(item => (
            <div key={item.label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace', color: paymentDone ? 'rgba(240,242,255,0.9)' : 'rgba(255,255,255,0.22)', transition: 'color 0.4s' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* ER Steps — wallet-state driven */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ER_STEPS.map((s, i) => {
            const state = getStepState(i)
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0',
                opacity: state === 'pending' ? 0.2 : 1,
                transition: 'opacity 0.4s ease',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: state === 'done' ? 'rgba(52,211,153,0.14)' : `${s.color}10`,
                  border: `1px solid ${state === 'done' ? 'rgba(52,211,153,0.38)' : s.color + '28'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.4s ease',
                }}>
                  {state === 'done' ? <span style={{ color: '#34D399', fontSize: 11 }}>✓</span>
                   : state === 'active' ? <div style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${s.color}35`, borderTopColor: s.color, animation: 'spin 0.7s linear infinite' }} />
                   : null}
                </div>
                <div>
                  <div style={{
                    fontSize: 12, lineHeight: 1.35, fontWeight: state === 'done' ? 500 : 400,
                    color: state === 'done' ? 'rgba(240,242,255,0.88)' : state === 'active' ? '#FBBF24' : 'rgba(255,255,255,0.38)',
                    transition: 'color 0.4s',
                  }}>
                    {state === 'active' && s.walletGate
                      ? <span style={{ animation: 'ticker 1.2s ease-in-out infinite' }}>{s.label}</span>
                      : s.label.replace('…', '')}
                  </div>
                  <div style={{ fontSize: 10, color: s.color, opacity: 0.6, marginTop: 1 }}>{s.sublabel}</div>
                </div>
              </div>
            )
          })}
        </div>

        <AnimatePresence>
          {paymentDone && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 16, padding: '11px 15px', borderRadius: 10,
                background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)',
                fontSize: 12, color: '#34D399', lineHeight: 1.5,
              }}>
              🔒 Amount and counterparty hidden on Solana · ZK receipt generated below
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
