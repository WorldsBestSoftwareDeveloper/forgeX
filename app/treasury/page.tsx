'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Navbar } from '@/components/Navbar'
import { Sidebar } from '@/components/Sidebar'
import { Agent, loadAgents, loadTreasuryActions, StoredTreasuryAction } from '@/lib/store'
import { createTreasurySnapshot } from '@/lib/zerionTreasury'

export default function TreasuryPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [actions, setActions] = useState<StoredTreasuryAction[]>([])

  useEffect(() => {
    setAgents(loadAgents())
    setActions(loadTreasuryActions())
  }, [])

  const totals = useMemo(() => {
    const usdc = agents.reduce((sum, agent) => sum + (agent.treasuryUsdc ?? Math.max(0, agent.budget - agent.spent)), 0)
    const sol = agents.reduce((sum, agent) => sum + (agent.treasurySol ?? 0.014), 0)
    const active = agents.filter(agent => agent.autonomyActive).length
    return { usdc, sol, active }
  }, [agents])

  return (
    <>
      <Navbar /><Sidebar />
      <main className="forge-main">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Treasury Command</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Global Zerion wallet intelligence for autonomous Forge agents</div>
            </div>
            <Link href="/dashboard" className="lg-btn-primary" style={{ padding: '10px 16px', textDecoration: 'none' }}>Deploy agent</Link>
          </div>

          <div className="forge-stats-grid">
            {[
              ['Treasury USDC', totals.usdc.toFixed(2), '#67E8F9'],
              ['Gas Reserve', `${totals.sol.toFixed(3)} SOL`, '#A78BFA'],
              ['Autonomous Agents', String(totals.active), '#34D399'],
              ['Treasury Actions', String(actions.length), '#FBBF24'],
            ].map(([label, value, color], i) => (
              <motion.div key={label} className="lg-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color }}>{value}</div>
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14 }}>
            {agents.map(agent => {
              const snapshot = createTreasurySnapshot({
                agentId: agent.id,
                publicKey: agent.treasuryWallet ?? 'unfunded',
                solBalance: agent.treasurySol,
                usdcBalance: agent.treasuryUsdc,
                spentUsdc: agent.spent,
              })
              return (
                <Link key={agent.id} href={`/agent/${agent.id}/analytics`} style={{ textDecoration: 'none' }}>
                  <div className="lg-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 800, color: 'rgba(240,242,255,0.9)' }}>{agent.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono,monospace', marginTop: 4 }}>
                          {agent.treasuryWallet ? `${agent.treasuryWallet.slice(0, 6)}...${agent.treasuryWallet.slice(-6)}` : 'No treasury wallet'}
                        </div>
                      </div>
                      <span className={`lg-pill ${agent.autonomyActive ? 'lg-pill-emerald' : 'lg-pill-amber'}`}>{agent.autonomyActive ? 'Active' : 'Off'}</span>
                    </div>
                    <div className="lg-spend-track" style={{ height: 5, marginBottom: 12 }}>
                      <div className="lg-spend-fill" style={{ width: `${snapshot.healthScore}%`, background: 'linear-gradient(90deg,#67E8F9,#A78BFA)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                      {[
                        ['Health', `${snapshot.healthScore}%`],
                        ['Runway', `${snapshot.gasRunwayHours.toFixed(1)}h`],
                        ['Risk', snapshot.risk],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 9px' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                          <div style={{ fontSize: 12, color: 'rgba(240,242,255,0.75)', marginTop: 4 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </motion.div>
      </main>
    </>
  )
}
