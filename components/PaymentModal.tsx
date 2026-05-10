'use client'

import { motion, AnimatePresence } from 'framer-motion'

type WalletGate = 'sign-message' | 'sign-tx' | null
type PaymentMode = 'wallet' | 'treasury'

interface ErStep {
  id: string
  label: string
  sublabel: string
  color: string
  walletGate: WalletGate
}

const WALLET_ER_STEPS: ErStep[] = [
  { id: 'challenge', label: 'Phantom signing TEE challenge...',          sublabel: 'Wallet auth',        color: '#818CF8', walletGate: 'sign-message' },
  { id: 'token',     label: 'MagicBlock issuing ER auth token',          sublabel: 'Private TEE',        color: '#818CF8', walletGate: null },
  { id: 'build',     label: 'Building private transfer',                 sublabel: 'visibility: private', color: '#FBBF24', walletGate: null },
  { id: 'route',     label: 'Routing through Private Ephemeral Rollup',  sublabel: 'Ephemeral Rollup',   color: '#FBBF24', walletGate: null },
  { id: 'batch',     label: 'Batching provider micropayment',            sublabel: 'Private commerce',   color: '#FBBF24', walletGate: null },
  { id: 'sign-tx',   label: 'Phantom signing settlement transaction...', sublabel: 'ER to Solana',       color: '#34D399', walletGate: 'sign-tx' },
  { id: 'settle',    label: 'Compressed settlement posted to Solana',    sublabel: 'Solana devnet',      color: '#34D399', walletGate: null },
]

const TREASURY_ER_STEPS: ErStep[] = [
  { id: 'policy',    label: 'Verifying signed autonomy policy',          sublabel: 'Policy engine',      color: '#818CF8', walletGate: null },
  { id: 'treasury',  label: 'Unlocking encrypted treasury signer',       sublabel: 'Server enclave',     color: '#818CF8', walletGate: null },
  { id: 'build',     label: 'Building MagicBlock private transfer',      sublabel: 'visibility: private', color: '#FBBF24', walletGate: null },
  { id: 'route',     label: 'Routing through Private Ephemeral Rollup',  sublabel: 'Ephemeral Rollup',   color: '#FBBF24', walletGate: null },
  { id: 'batch',     label: 'Batching provider micropayment',            sublabel: 'Private commerce',   color: '#FBBF24', walletGate: null },
  { id: 'sign-tx',   label: 'Treasury wallet signing settlement',        sublabel: 'Autonomous signer',  color: '#34D399', walletGate: null },
  { id: 'settle',    label: 'Compressed settlement posted to Solana',    sublabel: 'Solana devnet',      color: '#34D399', walletGate: null },
]

interface Props {
  provider: { name: string; wallet?: string }
  amount: number
  walletAction: WalletGate
  paymentDone: boolean
  usedRealPayment?: boolean
  mode?: PaymentMode
  treasuryWallet?: string
  signature?: string
  onComplete: () => void
}

function shortAddress(address?: string): string {
  if (!address) return 'Not available'
  return `${address.slice(0, 5)}...${address.slice(-5)}`
}

export function PaymentModal({
  provider,
  amount,
  walletAction,
  paymentDone,
  usedRealPayment,
  mode = 'wallet',
  treasuryWallet,
  signature,
  onComplete,
}: Props) {
  const steps = mode === 'treasury' ? TREASURY_ER_STEPS : WALLET_ER_STEPS

  const getStepState = (i: number): 'done' | 'active' | 'pending' => {
    if (paymentDone) return 'done'
    if (mode === 'treasury') {
      if (i < 2) return 'done'
      if (i === 2 || i === 5) return 'active'
      return i < 5 ? 'done' : 'pending'
    }
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
        style={{ padding: 32, maxWidth: 500, width: '100%', position: 'relative' }}
      >
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)', borderRadius: '22px 22px 0 0' }} />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <motion.div
            animate={paymentDone ? {} : { boxShadow: ['0 0 24px rgba(99,102,241,0.3)', '0 0 52px rgba(99,102,241,0.55)', '0 0 24px rgba(99,102,241,0.3)'] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              width: 60, height: 60, borderRadius: '50%', margin: '0 auto 16px',
              background: paymentDone ? 'rgba(52,211,153,0.12)' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              border: paymentDone ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
            }}
          >{paymentDone ? '✓' : '🔒'}</motion.div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 19, fontWeight: 700, marginBottom: 5, color: 'rgba(240,242,255,0.95)' }}>
            {paymentDone ? 'Settlement Complete' : mode === 'treasury' ? 'Autonomous Private Payment' : 'Private Payment via ER'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
            {paymentDone
              ? usedRealPayment ? 'Real MagicBlock ER - confirmed on Solana devnet' : 'Simulated fallback'
              : mode === 'treasury'
                ? 'Treasury wallet signer - MagicBlock private settlement'
                : 'MagicBlock Ephemeral Rollup - Private TEE - Solana Devnet'}
          </div>
        </div>

        <AnimatePresence>
          {walletAction && !paymentDone && mode === 'wallet' && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                marginBottom: 18, padding: '11px 15px', borderRadius: 10,
                background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.25)', borderTopColor: '#FBBF24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FBBF24' }}>
                  {walletAction === 'sign-message' ? 'Phantom open - click "Sign Message" to authorize TEE access' : 'Phantom open - click "Approve" to confirm private payment'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {walletAction === 'sign-message' ? 'Free - no SOL - grants ER session access' : '~0.000005 SOL - private settlement transaction'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Sending', value: `${amount.toFixed(4)} USDC` },
            { label: 'Provider', value: provider.name },
            { label: mode === 'treasury' ? 'Signer' : 'Payee', value: mode === 'treasury' ? shortAddress(treasuryWallet) : shortAddress(provider.wallet) },
          ].map(item => (
            <div key={item.label} style={{
              minWidth: 0, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace', color: 'rgba(240,242,255,0.86)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16, padding: '9px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.055)', border: '1px solid rgba(99,102,241,0.14)', fontSize: 11, color: 'rgba(255,255,255,0.44)', lineHeight: 1.5 }}>
          User-visible values are shown here for audit. MagicBlock still builds the provider payment with private settlement metadata.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {steps.map((s, i) => {
            const state = getStepState(i)
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0',
                opacity: state === 'pending' ? 0.22 : 1,
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
                      : s.label.replace('...', '')}
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
              Settlement sealed. ZK receipt generated below.
              {signature && (
                <div style={{ marginTop: 5, fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'rgba(52,211,153,0.72)', overflowWrap: 'anywhere' }}>
                  tx {shortAddress(signature)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {paymentDone && (
          <button onClick={onComplete} className="lg-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '9px 12px', fontSize: 12 }}>
            Continue
          </button>
        )}
      </motion.div>
    </div>
  )
}
