'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useWallet } from '@solana/wallet-adapter-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSolBalance } from '@/lib/payment'

export function Navbar() {
  const { publicKey, connected } = useWallet()
  const [solBal, setSolBal] = useState<number | null>(null)

  useEffect(() => {
    if (publicKey) getSolBalance(publicKey).then(setSolBal)
    else setSolBal(null)
  }, [publicKey])

  return (
    <nav className="lg-nav" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 60, display: 'flex', alignItems: 'center',
      padding: '0 24px', justifyContent: 'space-between',
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          boxShadow: '0 4px 16px rgba(99,102,241,0.45)',
        }}>⚡</div>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: 'rgba(240,242,255,0.95)', letterSpacing: '-0.01em' }}>
          Forge
        </span>
        <span className="lg-pill lg-pill-violet" style={{ marginLeft: 2 }}>DEVNET</span>
      </Link>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {connected && solBal !== null && (
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.55)',
            fontFamily: 'JetBrains Mono,monospace',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '5px 10px',
            backdropFilter: 'blur(12px)',
          }}>{solBal.toFixed(3)} SOL</div>
        )}
        <WalletMultiButton />
      </div>
    </nav>
  )
}
