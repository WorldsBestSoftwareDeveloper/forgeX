'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navbar } from '@/components/Navbar'
import { Sidebar } from '@/components/Sidebar'
import { getUsdcBalance, getSolBalance, getWalletTransactions } from '@/lib/payment'
import { loadTransactions, Transaction, clearTransactions } from '@/lib/store'

function timeAgo(ms: number): string {
  const d = Date.now() - ms
  if (d < 60000)    return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function truncateSig(sig: string) { return sig.slice(0, 8) + '…' + sig.slice(-6) }

export default function WalletPage() {
  const { publicKey, connected } = useWallet()
  const [usdcBal, setUsdcBal]   = useState<number | null>(null)
  const [solBal, setSolBal]     = useState<number | null>(null)
  const [balLoading, setBalLoading] = useState(false)
  const [localTxs, setLocalTxs]   = useState<Transaction[]>([])
  const [chainTxs, setChainTxs]   = useState<{signature:string;time:number;slot:number}[]>([])
  const [chainLoading, setChainLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'agent'|'chain'>('agent')
  const [newFlash, setNewFlash]   = useState<string|null>(null)

  const refreshLocal = useCallback(() => setLocalTxs(loadTransactions()), [])

  useEffect(() => { refreshLocal() }, [refreshLocal])

  // Live event listener — fires when any agent payment completes
  useEffect(() => {
    const handler = (e: Event) => {
      const tx = (e as CustomEvent<Transaction>).detail
      refreshLocal()
      setNewFlash(tx.id)
      setTimeout(() => setNewFlash(null), 3000)
    }
    window.addEventListener('forge-tx-added', handler)
    return () => window.removeEventListener('forge-tx-added', handler)
  }, [refreshLocal])

  // Safety-net poll every 8s
  useEffect(() => {
    const t = setInterval(refreshLocal, 8000)
    return () => clearInterval(t)
  }, [refreshLocal])

  const refreshBalances = useCallback(async () => {
    if (!publicKey) return
    setBalLoading(true)
    try {
      const [usdc, sol] = await Promise.all([getUsdcBalance(publicKey), getSolBalance(publicKey)])
      setUsdcBal(usdc); setSolBal(sol)
    } finally { setBalLoading(false) }
  }, [publicKey])

  useEffect(() => {
    if (publicKey) refreshBalances()
    else { setUsdcBal(null); setSolBal(null) }
  }, [publicKey, refreshBalances])

  useEffect(() => {
    if (!connected) return
    const t = setInterval(refreshBalances, 30000)
    return () => clearInterval(t)
  }, [connected, refreshBalances])

  const loadChainTxs = useCallback(async () => {
    if (!publicKey) return
    setChainLoading(true)
    try { setChainTxs(await getWalletTransactions(publicKey)) }
    finally { setChainLoading(false) }
  }, [publicKey])

  useEffect(() => {
    if (publicKey && activeTab === 'chain') loadChainTxs()
  }, [publicKey, activeTab, loadChainTxs])

  const totalSpent   = localTxs.filter(t => t.type === 'payment').reduce((a, t) => a + Math.abs(t.amount), 0)
  const paymentCount = localTxs.filter(t => t.type === 'payment').length
  const realCount    = localTxs.filter(t => t.usedRealPayment).length

  return (
    <>
      <Navbar /><Sidebar />
      <main className="forge-main">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 5 }}>Wallet</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Solana Devnet · Live balances · Private + on-chain history</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={refreshBalances} className="lg-btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>
                {balLoading ? '…' : '↻'} Refresh
              </button>
              <button onClick={() => { clearTransactions(); refreshLocal() }} className="lg-btn-ghost" style={{ padding: '8px 14px', fontSize: 13, color: 'rgba(248,113,113,0.8)', borderColor: 'rgba(248,113,113,0.2)' }}>
                Clear
              </button>
            </div>
          </div>

          {!connected && (
            <div className="lg-card" style={{ marginBottom: 20, padding: '13px 18px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }}>
              <span style={{ fontSize: 13, color: '#FBBF24' }}>⚠ Connect Phantom (Devnet) to see live balances and on-chain transactions</span>
            </div>
          )}

          {/* Balance cards */}
          <div className="forge-wallet-grid">
            {[
              { label: 'USDC Balance', value: connected ? (usdcBal ?? 0).toFixed(2) : '0.00', sub: 'Devnet USDC', cta: 'Get USDC ↗', href: 'https://faucet.circle.com/' },
              { label: 'SOL Balance',  value: connected ? (solBal ?? 0).toFixed(3) : '0.000', sub: 'For tx fees', cta: 'Airdrop ↗', href: 'https://faucet.solana.com/' },
              { label: 'Agent Spend',  value: totalSpent.toFixed(4), sub: `${paymentCount} payments · ${realCount} real ER`, accent: paymentCount > 0 },
            ].map((b, i) => (
              <motion.div key={b.label} className="lg-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(99,102,241,0.05)' }} />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>{b.label}</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 30, fontWeight: 800, marginBottom: 4, color: balLoading ? 'rgba(255,255,255,0.25)' : b.accent ? '#F87171' : 'rgba(240,242,255,0.92)' }}>
                  {balLoading && i < 2 ? '…' : b.value}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginBottom: b.cta ? 14 : 0 }}>{b.sub}</div>
                {b.cta && (
                  <a href={b.href} target="_blank" rel="noopener noreferrer" className="lg-btn-primary" style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', textDecoration: 'none' }}>{b.cta}</a>
                )}
              </motion.div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="lg-card" style={{ display: 'flex', gap: 3, padding: 4, maxWidth: 320, marginBottom: 18, borderRadius: 12 }}>
            {([
              { id: 'agent', label: '🔒 Agent Payments' },
              { id: 'chain', label: '⛓ On-Chain' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer',
                background: activeTab === t.id ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'transparent',
                color: activeTab === t.id ? 'white' : 'rgba(255,255,255,0.38)',
                boxShadow: activeTab === t.id ? '0 2px 12px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.2s ease',
              }}>
                {t.label}
                {t.id === 'agent' && localTxs.length > 0 && (
                  <span style={{ marginLeft: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 5px', fontSize: 10 }}>{localTxs.length}</span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* AGENT PAYMENTS */}
            {activeTab === 'agent' && (
              <motion.div key="agent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="lg-card" style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 14, background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.12)', fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
                  🛡 Payments via <span style={{ color: '#818CF8' }}>MagicBlock Private ER</span> — amounts & counterparties hidden on-chain ·{' '}
                  <span style={{ color: '#34D399' }}>Updates live</span> when tasks complete
                </div>

                <div className="lg-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(240,242,255,0.95)' }}>Agent Payment History</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#34D399' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', animation: 'pulseDot 2s infinite' }} />
                      Live
                    </div>
                  </div>

                  {localTxs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 0', color: 'rgba(255,255,255,0.2)' }}>
                      <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.25 }}>🔒</div>
                      <div style={{ fontSize: 14 }}>No agent payments yet.</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Run a task from any agent — payments appear here instantly.</div>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {localTxs.map((tx, i) => (
                        <motion.div
                          key={tx.id}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0, backgroundColor: newFlash === tx.id ? 'rgba(99,102,241,0.07)' : 'transparent' }}
                          transition={{ delay: i < 4 ? 0 : 0 }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '13px 0', borderRadius: 6,
                            borderBottom: i < localTxs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, fontSize: 16,
                              background: tx.type === 'payment' ? 'rgba(99,102,241,0.08)' : 'rgba(52,211,153,0.08)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{tx.private ? '🔒' : '📥'}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(240,242,255,0.82)' }}>{tx.desc}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>
                                {tx.type === 'payment' ? 'Private · ER' : 'Deposit'} · {timeAgo(tx.time)}
                                {tx.signature && (
                                  <a href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: '#818CF8', textDecoration: 'none' }}>↗ Explorer</a>
                                )}
                              </div>
                              {tx.erSessionId && (
                                <div style={{ fontSize: 9, color: 'rgba(251,191,36,0.6)', marginTop: 2, fontFamily: 'JetBrains Mono,monospace' }}>ER: {tx.erSessionId.slice(0, 22)}…</div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace', color: tx.amount > 0 ? '#34D399' : 'rgba(240,242,255,0.8)' }}>
                              {tx.amount > 0 ? '+' : ''}{tx.amountStr}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', marginTop: 3, display: 'inline-block', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase',
                              background: tx.usedRealPayment ? 'rgba(129,140,248,0.1)' : 'rgba(245,158,11,0.1)',
                              color: tx.usedRealPayment ? '#818CF8' : '#F59E0B',
                            }}>{tx.usedRealPayment ? '🔒 ER Real' : '🔁 Simulated'}</div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
            )}

            {/* ON-CHAIN */}
            {activeTab === 'chain' && (
              <motion.div key="chain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="lg-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(240,242,255,0.95)' }}>On-Chain Transactions</div>
                    <button onClick={loadChainTxs} className="lg-btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>
                      {chainLoading ? '…' : '↻'} Refresh
                    </button>
                  </div>

                  {!connected ? (
                    <div style={{ textAlign: 'center', padding: '44px 0', color: 'rgba(255,255,255,0.2)' }}>
                      <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.25 }}>⛓</div>
                      <div>Connect wallet to load on-chain history</div>
                    </div>
                  ) : chainLoading ? (
                    <div style={{ textAlign: 'center', padding: '44px 0', color: 'rgba(255,255,255,0.3)' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#818CF8', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                      <div style={{ fontSize: 13 }}>Fetching from Solana devnet...</div>
                    </div>
                  ) : chainTxs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 0', color: 'rgba(255,255,255,0.2)' }}>
                      <div>No on-chain transactions found. Make sure wallet is on Devnet.</div>
                    </div>
                  ) : chainTxs.map((tx, i) => (
                    <div key={tx.signature} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < chainTxs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(52,211,153,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>⛓</div>
                        <div>
                          <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono,monospace', color: 'rgba(240,242,255,0.75)' }}>{truncateSig(tx.signature)}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Slot {tx.slot.toLocaleString()} · {tx.time ? timeAgo(tx.time) : '—'}</div>
                        </div>
                      </div>
                      <a href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="lg-btn-ghost" style={{ fontSize: 11, padding: '5px 10px', textDecoration: 'none' }}>View ↗</a>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.14)', borderRadius: 12, fontSize: 12, color: 'rgba(251,191,36,0.7)', lineHeight: 1.5 }}>
                  ℹ Private ER payments appear as a single compressed settlement tx — individual amounts remain hidden.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Faucet guide */}
          <div className="lg-card" style={{ marginTop: 22, padding: '20px 24px' }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#818CF8' }}>🚰 Getting Devnet Funds</div>
            {[
              { n: '1', t: 'Open Phantom → Settings → Developer Settings → Enable Testnet Mode → Switch to Devnet' },
              { n: '2', t: 'Go to faucet.solana.com → paste your wallet address → receive 2 devnet SOL (for gas)' },
              { n: '3', t: 'Go to faucet.circle.com → connect Phantom → mint devnet USDC' },
              { n: '4', t: 'Return, connect wallet, create an agent, run a task — payments go through MagicBlock ER!' },
            ].map(item => (
              <div key={item.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'rgba(99,102,241,0.12)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{item.n}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>{item.t}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </>
  )
}
