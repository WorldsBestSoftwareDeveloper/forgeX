'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Agent, StoredTreasuryAction } from '@/lib/store'
import type { AutonomyPolicy, TreasurySnapshot, ZerionSimulationLog } from '@/lib/treasuryTypes'

function shortKey(key?: string): string {
  if (!key) return 'No treasury'
  return `${key.slice(0, 5)}...${key.slice(-5)}`
}

function countdown(expiresAt?: string): string {
  if (!expiresAt) return 'Inactive'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function Donut({ snapshot }: { snapshot: TreasurySnapshot }) {
  const total = snapshot.allocation.reduce((sum, item) => sum + item.value, 0) || 1
  const usdc = snapshot.allocation.find(a => a.token === 'USDC')?.value ?? 0
  const pct = Math.max(8, Math.min(92, Math.round((usdc / total) * 100)))
  return (
    <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `conic-gradient(#67E8F9 0 ${pct}%, #A78BFA ${pct}% 100%)`,
        filter: 'drop-shadow(0 0 22px rgba(103,232,249,0.16))',
      }} />
      <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'rgba(6,8,15,0.92)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: '#E8EAFF' }}>{snapshot.healthScore}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Health</div>
      </div>
    </div>
  )
}

interface Props {
  agent: Agent
  snapshot: TreasurySnapshot
  policy: AutonomyPolicy | null
  simulationLogs: ZerionSimulationLog[]
  actions: StoredTreasuryAction[]
  onEnableAutonomy: () => void
  onRebalance: () => void
  onEmergencyPause: () => void
  onFundSol: () => void
  onFundUsdc: () => void
  onLoadZerionMainnet: () => void
  onRunZerionProof: () => void
  zerionMainnet?: {
    publicKey: string
    walletName: string
    solBalance: number
    usdcBalance: number
    lastSignature?: string
  } | null
  isBusy: boolean
}

export function TreasuryIntelligencePanel({
  agent,
  snapshot,
  policy,
  simulationLogs,
  actions,
  onEnableAutonomy,
  onRebalance,
  onEmergencyPause,
  onFundSol,
  onFundUsdc,
  onLoadZerionMainnet,
  onRunZerionProof,
  zerionMainnet,
  isBusy,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [copiedMainnet, setCopiedMainnet] = useState(false)
  const [view, setView] = useState<'devnet' | 'mainnet'>('devnet')
  const velocity = useMemo(() => [18, 32, 24, 48, 38, 52, 44, 68, 56, 72], [])
  const policyActive = !!policy?.active && new Date(policy.expiresAt).getTime() > Date.now()
  const canRebalance = policyActive && snapshot.usdcBalance >= 1
  const copyTreasury = async (): Promise<void> => {
    if (!agent.treasuryWallet) return
    await navigator.clipboard.writeText(agent.treasuryWallet)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const copyMainnet = async (): Promise<void> => {
    if (!zerionMainnet?.publicKey) return
    await navigator.clipboard.writeText(zerionMainnet.publicKey)
    setCopiedMainnet(true)
    window.setTimeout(() => setCopiedMainnet(false), 1400)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="lg-card" style={{ padding: 20, background: 'linear-gradient(135deg,rgba(34,211,238,0.055),rgba(99,102,241,0.045))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 800, color: '#67E8F9' }}>Zerion Treasury Engine</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.34)', marginTop: 3 }}>Autonomous wallet intelligence</div>
          </div>
          <span className={`lg-pill ${policyActive ? 'lg-pill-emerald' : 'lg-pill-amber'}`}>{policyActive ? 'Active' : 'Locked'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16, padding: 3, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            ['devnet', 'Devnet Treasury'],
            ['mainnet', 'Mainnet Proof'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setView(id as 'devnet' | 'mainnet')
                if (id === 'mainnet') onLoadZerionMainnet()
              }}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '7px 8px',
                cursor: 'pointer',
                background: view === id ? 'rgba(103,232,249,0.14)' : 'transparent',
                color: view === id ? '#67E8F9' : 'rgba(255,255,255,0.42)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'mainnet' ? (
          <>
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(251,191,36,0.055)', border: '1px solid rgba(251,191,36,0.16)' }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 800, color: '#FBBF24', marginBottom: 4 }}>Solana Mainnet Proof</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
                Real Zerion CLI execution wallet. Fund this wallet with small mainnet SOL and USDC, then trigger the agent proof cycle.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {[
                ['Network', 'Solana mainnet'],
                ['Zerion wallet', zerionMainnet?.walletName ?? 'Create on open'],
                ['USDC', `${(zerionMainnet?.usdcBalance ?? 0).toFixed(2)} USDC`],
                ['SOL', `${(zerionMainnet?.solBalance ?? 0).toFixed(4)} SOL`],
                ['Policy', policyActive ? 'swap only · max 1 USDC · 24h session' : 'Enable autonomy first'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(240,242,255,0.68)', textAlign: 'right', fontFamily: label === 'Zerion wallet' ? 'JetBrains Mono,monospace' : undefined }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14, padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mainnet execution wallet</span>
                <button onClick={() => void copyMainnet()} disabled={!zerionMainnet?.publicKey} className="lg-btn-ghost" style={{ padding: '4px 8px', fontSize: 10, borderRadius: 7 }}>
                  {copiedMainnet ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'rgba(240,242,255,0.72)', overflowWrap: 'anywhere', lineHeight: 1.45 }}>
                {zerionMainnet?.publicKey ?? 'Open this tab to create the wallet'}
              </div>
            </div>

            <button
              onClick={onRunZerionProof}
              disabled={isBusy || !policyActive || !zerionMainnet || zerionMainnet.usdcBalance < 1 || zerionMainnet.solBalance <= 0}
              className="lg-btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '9px 10px', fontSize: 12 }}
            >
              {isBusy ? 'Agent executing...' : !policyActive ? 'Enable autonomy first' : !zerionMainnet ? 'Create mainnet wallet' : zerionMainnet.usdcBalance < 1 ? 'Fund 1 USDC first' : 'Trigger autonomous proof'}
            </button>
            {zerionMainnet?.lastSignature && (
              <a href={`https://explorer.solana.com/tx/${zerionMainnet.lastSignature}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, color: '#818CF8', textDecoration: 'none', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}>
                View mainnet proof tx
              </a>
            )}
          </>
        ) : (
          <>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <Donut snapshot={snapshot} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {[
              ['Treasury wallet', shortKey(agent.treasuryWallet)],
              ['Zerion wallet', agent.zerionWalletName ?? `forge-${agent.id}`],
              ['USDC reserve', `${snapshot.usdcBalance.toFixed(2)} USDC`],
              ['SOL gas', `${snapshot.solBalance.toFixed(4)} SOL`],
              ['Risk', snapshot.risk.toUpperCase()],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>{label}</span>
                <span style={{ fontSize: 11, color: 'rgba(240,242,255,0.75)', fontFamily: 'JetBrains Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14, padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Full treasury address</span>
            <button onClick={() => void copyTreasury()} disabled={!agent.treasuryWallet} className="lg-btn-ghost" style={{ padding: '4px 8px', fontSize: 10, borderRadius: 7 }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'rgba(240,242,255,0.72)', overflowWrap: 'anywhere', lineHeight: 1.45 }}>
            {agent.treasuryWallet ?? 'No treasury wallet yet'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button onClick={onFundSol} disabled={isBusy || !agent.treasuryWallet} className="lg-btn-ghost" style={{ padding: '8px 10px', fontSize: 12, justifyContent: 'center' }}>
            Fund 0.05 SOL
          </button>
          <button onClick={onFundUsdc} disabled={isBusy || !agent.treasuryWallet} className="lg-btn-ghost" style={{ padding: '8px 10px', fontSize: 12, justifyContent: 'center' }}>
            Fund 2 USDC
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SOL gas runway</span>
            <span style={{ fontSize: 10, color: '#67E8F9', fontFamily: 'JetBrains Mono,monospace' }}>{snapshot.gasRunwayHours.toFixed(1)}h</span>
          </div>
          <div className="lg-spend-track" style={{ height: 5 }}>
            <div className="lg-spend-fill" style={{ width: `${Math.min(100, snapshot.gasRunwayHours * 8)}%`, background: 'linear-gradient(90deg,#67E8F9,#A78BFA)' }} />
          </div>
        </div>

        <div style={{ height: 54, display: 'flex', alignItems: 'end', gap: 5, marginBottom: 16 }}>
          {velocity.map((v, i) => (
            <motion.div
              key={i}
              initial={{ height: 8, opacity: 0.4 }}
              animate={{ height: v, opacity: 0.85 }}
              transition={{ delay: i * 0.04 }}
              style={{ flex: 1, borderRadius: 4, background: 'linear-gradient(180deg,rgba(103,232,249,0.7),rgba(99,102,241,0.28))' }}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={onEnableAutonomy} disabled={isBusy || policyActive} className="lg-btn-primary" style={{ padding: '9px 10px', fontSize: 12 }}>
            {policyActive ? countdown(policy?.expiresAt) : 'Enable autonomy'}
          </button>
          <button onClick={onRebalance} disabled={isBusy || !canRebalance} className="lg-btn-ghost" style={{ padding: '9px 10px', fontSize: 12, justifyContent: 'center' }}>
              {isBusy ? 'Working...' : canRebalance ? 'Test devnet rebalance' : 'Fund USDC first'}
          </button>
        </div>
        {policyActive && (
          <button
            onClick={onEmergencyPause}
            disabled={isBusy}
            className="lg-btn-ghost"
            style={{
              width: '100%',
              marginTop: 8,
              padding: '9px 10px',
              fontSize: 12,
              justifyContent: 'center',
              color: '#FCA5A5',
              borderColor: 'rgba(248,113,113,0.24)',
              background: 'rgba(248,113,113,0.06)',
            }}
          >
            Emergency pause
          </button>
        )}
          </>
        )}
      </div>

      <div className="lg-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Policy Engine</div>
        {[
          ['Session', policyActive ? `Expires in ${countdown(policy?.expiresAt)}` : 'Inactive'],
          ['Spend cap', policy ? `${policy.remainingUsdc.toFixed(2)} / ${policy.spendLimitUsdc.toFixed(2)} USDC` : 'Needs authorization'],
          ['Proof', policy?.signature ? `Signed by ${policy.signer?.slice(0, 4)}...${policy.signer?.slice(-4)}` : 'Unsigned'],
          ['Chain', 'Solana devnet only'],
          ['Actions', policy?.allowedActions.join(', ') ?? 'Locked'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>{label}</span>
            <span style={{ fontSize: 11, color: 'rgba(240,242,255,0.62)', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="lg-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Zerion Simulation Feed</div>
        {simulationLogs.map(log => (
          <div key={log.id} style={{ display: 'flex', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, background: log.status === 'blocked' ? '#F87171' : log.status === 'warning' ? '#FBBF24' : '#34D399', boxShadow: '0 0 10px rgba(255,255,255,0.18)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: 'rgba(240,242,255,0.78)', fontWeight: 600 }}>{log.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.34)', lineHeight: 1.45 }}>{log.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="lg-card" style={{ padding: 20 }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Recent Treasury Actions</div>
        {actions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', padding: '10px 0' }}>No autonomous treasury actions yet.</div>
        ) : actions.slice(0, 4).map(action => (
          <div key={action.id} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(240,242,255,0.76)' }}>{action.type}</span>
              <span className={`lg-pill ${action.status === 'executed' ? 'lg-pill-emerald' : 'lg-pill-cyan'}`}>{action.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.34)', lineHeight: 1.45, marginTop: 3 }}>{action.detail}</div>
            {action.txSignature && (
              <a
                href={`https://explorer.solana.com/tx/${action.txSignature}${action.type === 'zerion-proof-swap' ? '' : '?cluster=devnet'}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 5, color: '#818CF8', textDecoration: 'none', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}
              >
                {action.type === 'zerion-proof-swap' ? 'View mainnet tx' : 'View devnet tx'}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
