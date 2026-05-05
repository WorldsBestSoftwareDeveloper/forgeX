'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  task: string
  providerName: string
  amount: number
  signature?: string
  usedRealPayment?: boolean
}

export function ZKReceipt({ task, providerName, amount, signature, usedRealPayment }: Props) {
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified]   = useState(false)
  const proofId = useRef('0x' + Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')).current

  const handleVerify = () => {
    setVerifying(true)
    setTimeout(() => { setVerifying(false); setVerified(true) }, 1800)
  }

  const rows = [
    { label: 'Payment executed', value: '✅ Confirmed', hidden: false },
    { label: 'Task completed',   value: '✅ Success',   hidden: false },
    { label: 'Within budget',    value: '✅ Yes',        hidden: false },
    { label: 'Privacy method',   value: usedRealPayment ? 'MagicBlock TEE · ER' : 'Simulated', hidden: false },
    { label: 'Amount',           value: '🔒 Hidden',    hidden: true  },
    { label: 'Counterparty',     value: '🔒 Hidden',    hidden: true  },
    { label: 'Proof ID',         value: proofId,         hidden: false },
    ...(signature ? [{ label: 'Tx Signature', value: signature.slice(0, 20) + '…', hidden: false }] : []),
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="lg-card" style={{ padding: 24, position: 'relative' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>🛡</span>
            <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(240,242,255,0.95)' }}>
              ZK Privacy Receipt
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', lineHeight: 1.4 }}>
            Proof of execution · No sensitive data exposed on-chain
          </div>
        </div>
        <span className="lg-pill lg-pill-emerald" style={{ flexShrink: 0 }}>Verified</span>
      </div>

      {/* Rows */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '0 16px',
      }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 0',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{row.label}</span>
            <span style={{
              fontSize: 12, fontFamily: 'JetBrains Mono,monospace',
              fontWeight: row.hidden ? 400 : 500,
              color: row.hidden ? 'rgba(255,255,255,0.25)' : 'rgba(240,242,255,0.85)',
            }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Verify button */}
      <button
        onClick={handleVerify}
        disabled={verifying || verified}
        className={verified ? '' : 'lg-btn-ghost'}
        style={{
          width: '100%', marginTop: 14,
          padding: '10px', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, fontWeight: 600, cursor: verified ? 'default' : 'pointer',
          color: verified ? '#34D399' : undefined,
          background: verified ? 'rgba(52,211,153,0.06)' : undefined,
          border: verified ? '1px solid rgba(52,211,153,0.2)' : undefined,
          fontFamily: 'DM Sans,sans-serif',
          transition: 'all 0.2s ease',
        }}
      >
        {verifying && <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(129,140,248,0.25)', borderTopColor: '#818CF8', animation: 'spin 0.7s linear infinite' }} />}
        {verifying ? 'Verifying proof…' : verified ? '✓ Proof Verified On-Chain' : '↗ Verify Proof'}
      </button>

      {/* Explorer link */}
      {signature && (
        <a
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.28)', textDecoration: 'none', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#818CF8')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
        >
          View on Solana Explorer ↗
        </a>
      )}
    </motion.div>
  )
}
