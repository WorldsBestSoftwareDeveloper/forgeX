// Shown when wallet is connected but not authenticated.
// One-click sign-in — Phantom shows the readable message then returns.

'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useAuthContext }           from '@/lib/AuthContext'

export function SignInBanner() {
  const { status, wallet, error, signIn, signOut } = useAuthContext()

  const show =
    status === 'unauthenticated' ||
    status === 'signing'         ||
    status === 'error'

  if (!wallet || !show) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="lg-card"
        style={{
          marginBottom: 20,
          padding: '14px 20px',
          borderRadius: 12,
          background: 'rgba(99,102,241,0.06)',
          borderColor: 'rgba(99,102,241,0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status === 'signing' && (
            <div style={{
              width: 15, height: 15, borderRadius: '50%',
              border: '2px solid rgba(99,102,241,0.25)',
              borderTopColor: '#818CF8',
              animation: 'spin 0.7s linear infinite',
              flexShrink: 0,
            }} />
          )}
          {status !== 'signing' && (
            <span style={{ fontSize: 16 }}>🔑</span>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(240,242,255,0.9)' }}>
              {status === 'signing'
                ? '👻 Phantom open — click "Sign Message" to authenticate'
                : status === 'error'
                ? `Sign-in failed: ${error ?? 'Unknown error'}`
                : 'Sign in to save agents + transactions across sessions'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {status === 'signing'
                ? 'Free · no gas · proves wallet ownership'
                : 'One Phantom signature · no gas · 24h session'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {status !== 'signing' && (
            <button
              onClick={() => void signIn()}
              className="lg-btn-primary"
              style={{ padding: '8px 18px', fontSize: 13 }}
            >
              {status === 'error' ? 'Retry' : 'Sign In'}
            </button>
          )}
          <button
            onClick={signOut}
            className="lg-btn-ghost"
            style={{ padding: '8px 14px', fontSize: 12 }}
          >
            Disconnect
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
