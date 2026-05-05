'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet }              from '@solana/wallet-adapter-react'
import Link                        from 'next/link'
import { Navbar }                  from '@/components/Navbar'
import { Sidebar }                 from '@/components/Sidebar'
import { SignInBanner }            from '@/components/SignInBanner'
import { useAuthContext }          from '@/lib/AuthContext'
import { Agent, loadAgents, saveAgents } from '@/lib/store'
import { motion, AnimatePresence } from 'framer-motion'
import { validateAgentName, validateBudget } from '@/lib/security'

const AGENT_EMOJIS: Record<string, string> = {
  'Nexus-7': '🔮', 'Prism-X': '💎', 'Sigma-3': '⚡',
}
const agentEmoji = (name: string): string => AGENT_EMOJIS[name] ?? '🤖'

function SpendBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min((spent / budget) * 100, 100)
  return (
    <div className="lg-spend-track">
      <div className="lg-spend-fill" style={{
        width: `${pct}%`,
        background:
          pct > 80 ? 'linear-gradient(90deg,#F87171,#EF4444)'
          : pct > 60 ? 'linear-gradient(90deg,#FBBF24,#F59E0B)'
          : undefined,
      }} />
    </div>
  )
}

interface CreateModalProps {
  onClose:  () => void
  onCreate: (name: string, budget: number) => void
}

function CreateModal({ onClose, onCreate }: CreateModalProps) {
  const [name,        setName]        = useState('')
  const [budget,      setBudget]      = useState('5.00')
  const [nameError,   setNameError]   = useState('')
  const [budgetError, setBudgetError] = useState('')

  const suggested =
    ['Nexus','Prism','Sigma','Omega','Delta','Apex','Vega','Echo'][
      Math.floor(Math.random() * 8)
    ] + '-' + (Math.floor(Math.random() * 9) + 1)

  const handleCreate = () => {
    const finalName   = name.trim() || suggested
    const finalBudget = parseFloat(budget)

    if (!validateAgentName(finalName)) {
      setNameError('Name must be 1-32 chars, letters/numbers/hyphens only')
      return
    }
    if (!validateBudget(finalBudget)) {
      setBudgetError('Budget must be between $0.50 and $1,000 USDC')
      return
    }

    onCreate(finalName, finalBudget)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="lg-modal"
        style={{ padding: 32, maxWidth: 440, width: '100%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)' }} />

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Deploy New Agent</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>Configure your autonomous payment agent</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Agent Name</label>
          <input
            className="lg-input"
            style={{ padding: '11px 14px' }}
            placeholder={suggested}
            value={name}
            onChange={e => { setName(e.target.value); setNameError('') }}
          />
          {nameError && <div style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>{nameError}</div>}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 5 }}>Suggested: {suggested}</div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Budget (USDC)</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            max="1000"
            className="lg-input"
            style={{ padding: '11px 14px', fontFamily: 'JetBrains Mono,monospace' }}
            value={budget}
            onChange={e => { setBudget(e.target.value); setBudgetError('') }}
          />
          {budgetError && <div style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>{budgetError}</div>}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 5 }}>Max $1,000 · Enforced server-side</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="lg-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '11px' }}>Cancel</button>
          <button onClick={handleCreate} className="lg-btn-primary" style={{ flex: 2, padding: '11px' }}>⚡ Deploy Agent</button>
        </div>
      </motion.div>
    </div>
  )
}

export default function DashboardPage() {
  const { connected }          = useWallet()
  const { status: authStatus } = useAuthContext()
  const [agents,      setAgents]      = useState<Agent[]>([])
  const [showCreate,  setShowCreate]  = useState(false)

  useEffect(() => { setAgents(loadAgents()) }, [])

  const createAgent = useCallback((name: string, budget: number) => {
    const newAgent: Agent = {
      id:          `agent-${Date.now()}`,
      name,
      budget,
      spent:       0,
      status:      'idle',
      lastTask:    'No tasks yet',
      successRate: 100,
      taskCount:   0,
      created:     new Date().toISOString().split('T')[0],
    }
    const updated = [...agents, newAgent]
    setAgents(updated)
    saveAgents(updated)
  }, [agents])

  const totalBudget = agents.reduce((a, b) => a + b.budget, 0)
  const totalTasks  = agents.reduce((a, b) => a + b.taskCount, 0)
  const avgSuccess  = agents.length
    ? Math.round(agents.reduce((a, b) => a + b.successRate, 0) / agents.length)
    : 0

  return (
    <>
      <Navbar />
      <Sidebar />
      <main className="forge-main">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginBottom: 6, letterSpacing: '-0.02em' }}>
                <span className="grad-text">Agent</span> Dashboard
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                Autonomous AI agents · MagicBlock Private ER · Solana Devnet
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="lg-btn-primary"
              style={{ padding: '10px 20px' }}
            >
              + New Agent
            </button>
          </div>

          {/* Auth + wallet banners */}
          {!connected && (
            <div className="lg-card" style={{ marginBottom: 16, padding: '13px 18px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }}>
              <span style={{ fontSize: 13, color: '#FBBF24' }}>⚠ Connect Phantom (set to Devnet) to make real private payments via MagicBlock</span>
            </div>
          )}

          {/* Sign-in banner — shows when wallet connected but not signed in */}
          <SignInBanner />

          {/* Auth status pill */}
          {authStatus === 'authenticated' && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px rgba(52,211,153,0.7)' }} />
              <span style={{ fontSize: 12, color: '#34D399' }}>Signed in · agents + transactions synced to Supabase</span>
            </div>
          )}

          {/* Stats */}
          <div className="forge-stats-grid">
            {[
              { label: 'Active Agents', value: agents.length,                icon: '◎', color: '#818CF8' },
              { label: 'Total Budget',  value: `$${totalBudget.toFixed(2)}`, icon: '◈', color: '#34D399' },
              { label: 'Tasks Run',     value: totalTasks,                   icon: '⚡', color: '#FBBF24' },
              { label: 'Avg Success',   value: `${avgSuccess}%`,             icon: '🏆', color: '#34D399' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="lg-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                style={{ padding: '18px 20px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</span>
                  <span style={{ fontSize: 15, opacity: 0.7 }}>{stat.icon}</span>
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </motion.div>
            ))}
          </div>

          {/* Agent cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14 }}>
            <AnimatePresence>
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/agent/${agent.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div className="lg-card" style={{ padding: 20, cursor: 'pointer' }}>
                      {agent.status === 'running' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '18px 18px 0 0', background: 'linear-gradient(90deg,#6366F1,#8B5CF6,#A78BFA)' }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 11, fontSize: 19, background: 'linear-gradient(135deg,rgba(99,102,241,0.28),rgba(139,92,246,0.18))', border: '1px solid rgba(99,102,241,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                            {agentEmoji(agent.name)}
                          </div>
                          <div>
                            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(240,242,255,0.95)', marginBottom: 4 }}>{agent.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className={`status-dot status-${agent.status}`} />
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize' }}>{agent.status}</span>
                            </div>
                          </div>
                        </div>
                        <span className={`lg-pill ${agent.successRate >= 98 ? 'lg-pill-emerald' : 'lg-pill-amber'}`}>{agent.successRate}%</span>
                      </div>

                      <div style={{ marginBottom: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>Budget used</span>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono,monospace', color: 'rgba(255,255,255,0.6)' }}>${agent.spent.toFixed(2)} / ${agent.budget.toFixed(2)}</span>
                        </div>
                        <SpendBar spent={agent.spent} budget={agent.budget} />
                      </div>

                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'flex-start', gap: 5, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 11 }}>
                        <span style={{ color: '#818CF8', flexShrink: 0, marginTop: 1 }}>▸</span>
                        <span style={{ lineHeight: 1.4 }}>{agent.lastTask}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600 }}>Open agent →</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add card */}
            <motion.div
              onClick={() => setShowCreate(true)}
              whileHover={{ scale: 1.01 }}
              style={{ background: 'transparent', border: '1.5px dashed rgba(255,255,255,0.09)', borderRadius: 18, padding: 20, cursor: 'pointer', minHeight: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s ease' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 11, border: '1.5px dashed rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'rgba(255,255,255,0.22)' }}>+</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>Deploy new agent</div>
            </motion.div>
          </div>

        </motion.div>
      </main>

      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onCreate={createAgent} />
        )}
      </AnimatePresence>
    </>
  )
}
