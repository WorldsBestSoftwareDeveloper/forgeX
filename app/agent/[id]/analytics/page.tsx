'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Navbar } from '@/components/Navbar'
import { Sidebar } from '@/components/Sidebar'
import { Agent, loadAgents, loadTreasuryActions, StoredTreasuryAction } from '@/lib/store'
import { buildDefaultPolicy, buildRebalanceSimulation, createTreasurySnapshot } from '@/lib/zerionTreasury'

export default function AgentAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [actions, setActions] = useState<StoredTreasuryAction[]>([])

  useEffect(() => {
    const found = loadAgents().find(a => a.id === params.id)
    if (!found) router.push('/dashboard')
    else {
      setAgent(found)
      setActions(loadTreasuryActions(found.id))
    }
  }, [params.id, router])

  const snapshot = useMemo(() => createTreasurySnapshot({
    agentId: agent?.id ?? '',
    publicKey: agent?.treasuryWallet ?? 'unfunded',
    solBalance: agent?.treasurySol,
    usdcBalance: agent?.treasuryUsdc,
    spentUsdc: agent?.spent ?? 0,
  }), [agent])

  if (!agent) return null

  const policy = agent.autonomyActive
    ? { ...buildDefaultPolicy(agent.id, agent.budget), expiresAt: agent.autonomyExpiresAt ?? new Date().toISOString() }
    : null
  const logs = buildRebalanceSimulation(snapshot, policy)

  return (
    <>
      <Navbar /><Sidebar />
      <main className="forge-main">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>{agent.name} Analytics</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Detailed treasury analytics, policy status, and simulation logs</div>
            </div>
            <Link href={`/agent/${agent.id}`} className="lg-btn-ghost" style={{ padding: '9px 14px', textDecoration: 'none' }}>Back to agent</Link>
          </div>

          <div className="forge-stats-grid">
            {[
              ['Health Score', `${snapshot.healthScore}%`, '#67E8F9'],
              ['Gas Runway', `${snapshot.gasRunwayHours.toFixed(1)}h`, '#A78BFA'],
              ['Spend Velocity', `${snapshot.spendVelocityUsdcPerHour.toFixed(3)} USDC/h`, '#FBBF24'],
              ['Wallet Risk', snapshot.risk.toUpperCase(), '#34D399'],
            ].map(([label, value, color], i) => (
              <motion.div key={label} className="lg-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color }}>{value}</div>
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
            <div className="lg-card" style={{ padding: 24 }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Treasury Actions</div>
              {actions.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13 }}>No treasury actions yet.</div>
              ) : actions.map(action => (
                <div key={action.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'rgba(240,242,255,0.8)' }}>{action.type}</span>
                    <span className={`lg-pill ${action.status === 'executed' ? 'lg-pill-emerald' : 'lg-pill-cyan'}`}>{action.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginTop: 4 }}>{action.detail}</div>
                </div>
              ))}
            </div>

            <div className="lg-card" style={{ padding: 24 }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Simulation Logs</div>
              {logs.map(log => (
                <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 13, color: 'rgba(240,242,255,0.78)', fontWeight: 700 }}>{log.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginTop: 4 }}>{log.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
    </>
  )
}
