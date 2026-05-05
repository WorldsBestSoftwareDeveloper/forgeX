'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter }         from 'next/navigation'
import { useWallet }                    from '@solana/wallet-adapter-react'
import { motion, AnimatePresence }      from 'framer-motion'
import { Navbar }                       from '@/components/Navbar'
import { Sidebar }                      from '@/components/Sidebar'
import { ActivityFeed }                 from '@/components/ActivityFeed'
import { PaymentModal }                 from '@/components/PaymentModal'
import { ZKReceipt }                    from '@/components/ZKReceipt'
import { SignInBanner }                 from '@/components/SignInBanner'
import { useAuthContext }               from '@/lib/AuthContext'
import { Agent, loadAgents, saveAgents, saveTransaction } from '@/lib/store'
import { buildAgentSteps, AgentStep, STEP_DELAYS } from '@/lib/agentLogic'
import { createERSession }              from '@/lib/ephemeralRollup'
import type { ParsedIntent }            from '@/app/api/agent/intent/route'
import type { Provider }                from '@/app/api/agent/providers/route'
import type { RunResult }               from '@/app/api/agent/run/route'

// ─── MagicBlock helpers imported from lib/magicblock.ts ─────────────────────
import { executeMagicBlockTransfer, ensureUsdcAta } from '@/lib/magicblock'


// ─── Types ────────────────────────────────────────────────────────────────────
interface PaymentResult {
  success:          boolean
  signature?:       string
  usedRealPayment:  boolean
  erSessionId?:     string
  error?:           string
}

type RunStatus =
  | 'idle'
  | 'parsing'
  | 'selecting'
  | 'signing-message'
  | 'signing-tx'
  | 'paying'
  | 'executing'
  | 'done'
  | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────
const TASK_PRESETS = [
  'Find cheapest GPU and generate a futuristic city at night',
  'Upscale this image to 4K resolution using AI',
  'Render a 3D sci-fi spacecraft in deep space',
  'Generate a batch of cyberpunk character portraits',
]

const STATUS_LABELS: Record<RunStatus, string> = {
  idle:             'Idle',
  parsing:          'Parsing intent…',
  selecting:        'Selecting provider…',
  'signing-message':'⏳ Sign Message in Phantom (free)',
  'signing-tx':     '⏳ Approve Transaction in Phantom',
  paying:           'Processing payment via ER…',
  executing:        'Running inference…',
  done:             'Complete',
  error:            'Error',
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SpendBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min((spent / budget) * 100, 100)
  return (
    <div className="lg-spend-track">
      <div className="lg-spend-fill" style={{
        width: `${pct}%`,
        background: pct > 80 ? 'linear-gradient(90deg,#F87171,#EF4444)' : undefined,
      }} />
    </div>
  )
}

function ErrorCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="lg-card"
      style={{
        padding: '14px 18px', borderRadius: 12, marginBottom: 16,
        background: 'rgba(248,113,113,0.07)', borderColor: 'rgba(248,113,113,0.25)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F87171', marginBottom: 2 }}>Task failed</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{message}</div>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
      >×</button>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const params = useParams()
  const router = useRouter()
  const wallet = useWallet()
  const { apiCall } = useAuthContext()

  const [agent,            setAgent]           = useState<Agent | null>(null)
  const [task,             setTask]            = useState('')
  const [activeTab,        setActiveTab]       = useState<'task'|'activity'|'providers'>('task')
  const [runStatus,        setRunStatus]       = useState<RunStatus>('idle')
  const [errorMsg,         setErrorMsg]        = useState<string | null>(null)
  const [steps,            setSteps]           = useState<AgentStep[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [allProviders,     setAllProviders]    = useState<Provider[]>([])
  const [showPayment,      setShowPayment]     = useState(false)
  const [paymentResult,    setPaymentResult]   = useState<PaymentResult | null>(null)
  const [taskOutput,       setTaskOutput]      = useState<{
    image: string
    text: string
    usedRealInference?: boolean
  } | null>(null)
  const [showReceipt,      setShowReceipt]     = useState(false)
  const [showPreview,      setShowPreview]     = useState(false)
  const [amountSpent,      setAmountSpent]     = useState(0)
  const [parsedIntent,     setParsedIntent]    = useState<ParsedIntent | null>(null)
  const [intentSource,     setIntentSource]    = useState<'llm'|'fallback'|null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const isRunning  = runStatus !== 'idle' && runStatus !== 'done' && runStatus !== 'error'
  const isWaiting  = runStatus === 'signing-message' || runStatus === 'signing-tx'

  // ─── Load agent ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const found = loadAgents().find(a => a.id === params.id)
    if (!found) router.push('/dashboard')
    else setAgent(found)
  }, [params.id, router])

  const updateAndSave = useCallback((updates: Partial<Agent>) => {
    setAgent(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      saveAgents(loadAgents().map(a => a.id === updated.id ? updated : a))
      return updated
    })
  }, [])

  const addStep  = useCallback((step: AgentStep) => setSteps(p => [...p, step]), [])
  const delay    = (ms: number) => new Promise<void>(r => {
    const t = setTimeout(r, ms)
    timers.current.push(t)
  })

  const downloadOutput = useCallback(async () => {
    if (!taskOutput?.image) return
    try {
      const res = await fetch(taskOutput.image)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `forge-output-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      window.open(taskOutput.image, '_blank', 'noopener,noreferrer')
    }
  }, [taskOutput])

  // ─── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setRunStatus('idle')
    setErrorMsg(null)
    setSteps([])
    setSelectedProvider(null)
    setAllProviders([])
    setPaymentResult(null)
    setTaskOutput(null)
    setShowReceipt(false)
    setShowPreview(false)
    setShowPayment(false)
    setParsedIntent(null)
    setIntentSource(null)
  }, [])

  // ─── Main run function ───────────────────────────────────────────────────────
  const runTask = useCallback(async () => {
    if (!task.trim() || isRunning || !agent) return

    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction || !wallet.signMessage) {
      setErrorMsg('Connect your Phantom wallet (set to Devnet) first.')
      return
    }

    reset()
    setRunStatus('parsing')
    setActiveTab('activity')
    updateAndSave({ status: 'running' })

    // ── 1. Parse intent ───────────────────────────────────────────────────────
    let intent: ParsedIntent = {
      taskType: 'image-generation', priority: 'cheapest',
      budgetCap: null, keywords: [], prompt: task, raw: task,
    }
    try {
      const ir = await apiCall<{ intent: ParsedIntent; source: 'llm'|'fallback' }>('/api/agent/intent', {
        method: 'POST',
        body: { task, agentBudget: agent.budget - agent.spent },
      })
      if (ir.data) {
        intent = ir.data.intent
        setIntentSource(ir.data.source)
        setParsedIntent(ir.data.intent)
      }
    } catch {
      // rule-based fallback is fine
    }

    // ── 2. Get weighted providers ─────────────────────────────────────────────
    setRunStatus('selecting')
    let provider: Provider
    try {
      const pr = await apiCall<{ providers: Provider[]; selected: Provider }>(
        '/api/agent/providers',
        { method: 'POST', body: { intent, budget: agent.budget - agent.spent } }
      )
      if (!pr.data?.selected) throw new Error(pr.error ?? 'No providers available')
      setAllProviders(pr.data.providers)
      provider = pr.data.selected
    } catch (err) {
      setRunStatus('error')
      setErrorMsg(String(err))
      updateAndSave({ status: 'idle' })
      return
    }

    const cost      = parseFloat((provider.pricePerSec * 3).toFixed(6))
    const erSession = createERSession(agent.id, task)
    setAmountSpent(cost)

    const allSteps    = buildAgentSteps(provider, cost)
    const paymentIdx  = allSteps.findIndex(s => s.id === 'er-payment')
    const preSteps    = allSteps.slice(0, paymentIdx)
    const paymentStep = allSteps[paymentIdx]
    const postSteps   = allSteps.slice(paymentIdx + 1)

    // ── 3. Pre-payment steps (timed) ──────────────────────────────────────────
    for (let i = 0; i < preSteps.length; i++) {
      await delay(i === 0 ? 0 : STEP_DELAYS[i] - STEP_DELAYS[i - 1])
      addStep(preSteps[i])
      if (preSteps[i].id === 'select') setSelectedProvider(provider)
    }

    // ── 4. Payment gate ───────────────────────────────────────────────────────
    addStep(paymentStep)
    setShowPayment(true)
    setRunStatus('signing-message')

    let payment: PaymentResult

    try {
      const { SIMULATE_PAYMENTS } = await import('@/lib/config')

      // Feature flag: simulation mode for demos without real USDC
      if (SIMULATE_PAYMENTS) {
        await delay(3000)
        payment = { success: true, usedRealPayment: false, erSessionId: erSession.id }
      } else {
        // Real MagicBlock flow — all tx logic in lib/magicblock.ts
        // Step A: getMBAuthToken() via signMessage → Phantom "Sign Message" (free)
        // Step B: ensureUsdcAta() pre-creates ATA in separate tx if needed
        // Step C: POST /v1/spl/transfer → MagicBlock builds private tx
        // Step D: signTxBytes() handles legacy + versioned tx → Phantom "Approve"
        // Step E: submit each tx, confirm on-chain
        const result = await executeMagicBlockTransfer({
          wallet: {
            publicKey:       wallet.publicKey,
            signTransaction: wallet.signTransaction,
            signMessage:     wallet.signMessage,
          },
          toAddress:      provider.wallet,
          amountUsdc:     cost,
          erSessionId:    erSession.id,
          // Real-time status → drives the Phantom banner + payment modal
          onStatusChange: (s) => setRunStatus(s),
        })
        payment = { ...result, success: true, erSessionId: erSession.id }
      }
    } catch (err) {
      // Payment failed — surface real error, do NOT silently succeed
      const msg = err instanceof Error ? err.message : String(err)
      setRunStatus('error')
      setErrorMsg(`Payment failed: ${msg}`)
      setShowPayment(false)
      updateAndSave({ status: 'idle' })
      return
    }

    setPaymentResult(payment)
    setRunStatus('paying')

    // Persist transaction immediately on payment success
    saveTransaction({
      id:              `tx-${Date.now()}`,
      type:            'payment',
      desc:            `${provider.name} — ${task.slice(0, 40)}`,
      amount:          -cost,
      amountStr:       `${cost.toFixed(4)} USDC`,
      time:            Date.now(),
      private:         true,
      signature:       payment.signature,
      provider:        provider.name,
      usedRealPayment: payment.usedRealPayment,
      erSessionId:     erSession.id,
    })

    await delay(1400)
    setShowPayment(false)

    // ── 5. Post-payment steps ─────────────────────────────────────────────────
    for (let i = 0; i < postSteps.length; i++) {
      await delay(i === 0 ? 400 : 900)
      addStep(postSteps[i])
    }

    // ── 6. Run inference via backend ──────────────────────────────────────────
    setRunStatus('executing')
    await delay(400)

    try {
      const runRes = await apiCall<RunResult>('/api/agent/run', {
        method: 'POST',
        body: {
          task, intent, provider,
          agentId:     agent.id,
          erSessionId: erSession.id,
          agentBudget: agent.budget,
          agentSpent:  agent.spent,
        },
      })

      if (runRes.data?.success) {
        setTaskOutput({
          image: runRes.data.imageUrl,
          text: runRes.data.outputText,
          usedRealInference: runRes.data.usedRealInference,
        })
      } else {
        // Inference failed — still show a result but flag it
        setTaskOutput({
          image: 'https://picsum.photos/seed/forge-err/800/500',
          text:  `Task completed with placeholder output. Error: ${runRes.error ?? 'Inference unavailable'}.`,
          usedRealInference: false,
        })
      }
    } catch {
      setTaskOutput({
        image: 'https://picsum.photos/seed/forge-fallback/800/500',
        text:  `Task queued. The inference request did not complete successfully.`,
        usedRealInference: false,
      })
    }

    // ── 7. Finalise ────────────────────────────────────────────────────────────
    setShowReceipt(true)
    setRunStatus('done')
    setActiveTab('task')
    updateAndSave({
      status:      'idle',
      spent:       agent.spent + cost,
      taskCount:   agent.taskCount + 1,
      lastTask:    task,
      successRate: Math.min(100, Math.round((agent.successRate * agent.taskCount + 100) / (agent.taskCount + 1))),
    })
  }, [task, isRunning, agent, wallet, apiCall, reset, updateAndSave, addStep, delay])

  // ─── Loading state ────────────────────────────────────────────────────────────
  if (!agent) {
    return (
      <><Navbar /><Sidebar />
        <main className="forge-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.25)', borderTopColor: '#818CF8', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13 }}>Loading agent…</div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <Sidebar />
      <main className="forge-main">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          {/* Agent header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/dashboard')} className="lg-btn-ghost" style={{ padding: '8px 10px', fontSize: 15 }}>←</button>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg,rgba(99,102,241,0.28),rgba(139,92,246,0.18))', border: '1px solid rgba(99,102,241,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔮</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{agent.name}</span>
                <div className={`status-dot status-${isRunning ? 'running' : 'idle'}`} />
                <span style={{ fontSize: 12, color: isWaiting ? '#FBBF24' : 'rgba(255,255,255,0.38)', fontWeight: isWaiting ? 600 : 400 }}>
                  {STATUS_LABELS[runStatus]}
                </span>
                {intentSource === 'llm' && <span className="lg-pill lg-pill-cyan" style={{ fontSize: 9 }}>GPT parsed</span>}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 3, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono,monospace' }}>Budget: ${agent.budget.toFixed(2)}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono,monospace' }}>Spent: ${agent.spent.toFixed(4)}</span>
                <span style={{ fontSize: 11, color: '#34D399' }}>✓ {agent.successRate}%</span>
              </div>
            </div>
            <div className="forge-spend-bar-header">
              <SpendBar spent={agent.spent} budget={agent.budget} />
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 4, textAlign: 'right', fontFamily: 'JetBrains Mono,monospace' }}>
                ${(agent.budget - agent.spent).toFixed(4)} remaining
              </div>
            </div>
          </div>

          <SignInBanner />

          {/* Error card */}
          <AnimatePresence>
            {errorMsg && <ErrorCard message={errorMsg} onDismiss={() => setErrorMsg(null)} />}
          </AnimatePresence>

          {/* Phantom waiting banner */}
          <AnimatePresence>
            {isWaiting && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="lg-card"
                style={{ marginBottom: 16, padding: '13px 18px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.22)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.25)', borderTopColor: '#FBBF24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24' }}>
                    {runStatus === 'signing-message'
                      ? '👻 Phantom open — click "Sign Message" to authorise TEE access'
                      : '👻 Phantom open — click "Approve" to confirm private payment'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                    {runStatus === 'signing-message'
                      ? 'Free · no SOL · proves wallet ownership to MagicBlock TEE'
                      : '~0.000005 SOL fee · payment amount hidden via Private Ephemeral Rollup'}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tabs */}
          <div className="lg-card" style={{ display: 'flex', gap: 3, padding: 4, maxWidth: 400, marginBottom: 20, borderRadius: 12 }}>
            {(['task','activity','providers'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: 'none', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer',
                background: activeTab === t ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'transparent',
                color: activeTab === t ? 'white' : 'rgba(255,255,255,0.4)',
                boxShadow: activeTab === t ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
                transition: 'all 0.2s ease',
              }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'activity' && steps.length > 0 && (
                  <span style={{ marginLeft: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 5px', fontSize: 10 }}>{steps.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Content grid */}
          <div className="forge-agent-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* TASK TAB */}
              {activeTab === 'task' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="lg-card" style={{ padding: 24 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Task Input</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14, lineHeight: 1.5 }}>
                      Agent parses intent → weighted provider selection → MagicBlock Private ER payment → inference → Solana settlement
                    </div>
                    <textarea
                      className="lg-input"
                      style={{ resize: 'none', height: 86, padding: '11px 14px', lineHeight: 1.6 }}
                      placeholder='"Find cheapest GPU and generate a futuristic city at night"'
                      value={task}
                      onChange={e => setTask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void runTask() }}
                      disabled={isRunning}
                    />

                    {parsedIntent && (
                      <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 9, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Intent:</span>
                        <span className="lg-pill lg-pill-violet">{parsedIntent.taskType}</span>
                        <span className="lg-pill lg-pill-cyan">{parsedIntent.priority}</span>
                        {parsedIntent.budgetCap != null && <span className="lg-pill lg-pill-amber">cap ${parsedIntent.budgetCap}</span>}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 14 }}>
                      {TASK_PRESETS.map(p => (
                        <button key={p} onClick={() => setTask(p)} className="lg-btn-ghost"
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7 }} disabled={isRunning}>
                          {p.slice(0, 36)}…
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => void runTask()}
                      disabled={!task.trim() || isRunning}
                      className="lg-btn-primary"
                      style={{ width: '100%', padding: '13px', fontSize: 14 }}
                    >
                      {isRunning ? (
                        <><div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} />
                          {isWaiting ? 'Waiting for Phantom…' : STATUS_LABELS[runStatus]}</>
                      ) : '⚡ Run Task'}
                    </button>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', textAlign: 'center', marginTop: 8 }}>
                      ⌘+Enter · MagicBlock Private Ephemeral Rollup · Solana Devnet
                    </div>
                  </div>

                  <AnimatePresence>
                    {taskOutput && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg-card" style={{ overflow: 'hidden' }}>
                        <div style={{ position: 'relative', height: 200 }}>
                          <img src={taskOutput.image} alt="Task output" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(6,8,15,0.85) 0%,transparent 60%)' }} />
                          <div style={{ position: 'absolute', bottom: 12, left: 16, display: 'flex', gap: 8 }}>
                            <span className="lg-pill lg-pill-emerald">✅ Output Ready</span>
                            {paymentResult?.usedRealPayment && <span className="lg-pill lg-pill-violet">🔒 ER Real</span>}
                            {taskOutput.usedRealInference
                              ? <span className="lg-pill lg-pill-cyan">AI Image</span>
                              : <span className="lg-pill lg-pill-amber">Placeholder</span>}
                          </div>
                        </div>
                        <div style={{ padding: '14px 18px' }}>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 5 }}>{taskOutput.text}</div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setShowPreview(true)}
                              className="lg-btn-ghost"
                              style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8 }}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => void downloadOutput()}
                              className="lg-btn-ghost"
                              style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8 }}
                            >
                              Download
                            </button>
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{new Date().toLocaleTimeString()}</div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {showReceipt && taskOutput && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <ZKReceipt task={task} providerName={selectedProvider?.name ?? 'GPU Alpha'}
                          amount={amountSpent} signature={paymentResult?.signature}
                          usedRealPayment={paymentResult?.usedRealPayment} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* ACTIVITY TAB */}
              {activeTab === 'activity' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="lg-card" style={{ padding: 24 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Ephemeral Rollup Activity</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 18 }}>
                      Agent → ER Environment → Private Micropayments → Batch Settlement → Solana
                    </div>
                    <ActivityFeed steps={steps} isRunning={isRunning}
                      waitingForWallet={isWaiting}
                      walletAction={
                        runStatus === 'signing-message' ? 'sign-message'
                        : runStatus === 'signing-tx'    ? 'sign-tx'
                        : null
                      } />
                  </div>
                </motion.div>
              )}

              {/* PROVIDERS TAB */}
              {activeTab === 'providers' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="lg-card" style={{ padding: 24 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Service Registry</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 18 }}>
                      Weighted scoring: cost · latency · quality · reputation · intent-matched
                    </div>
                    {(allProviders.length ? allProviders : []).length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                        Run a task to see provider selection
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {allProviders.map((p, i) => {
                          const isSel  = selectedProvider?.id === p.id
                          const isBest = i === 0
                          return (
                            <div key={p.id} className="lg-card" style={{ padding: '12px 16px', borderRadius: 12, background: isSel ? 'rgba(99,102,241,0.09)' : 'rgba(255,255,255,0.03)', borderColor: isSel ? 'rgba(99,102,241,0.35)' : isBest ? 'rgba(52,211,153,0.22)' : undefined }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{p.logo}</div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {p.name}
                                      {isBest && <span className="lg-pill lg-pill-emerald" style={{ fontSize: 8 }}>BEST</span>}
                                      {isSel  && <span className="lg-pill lg-pill-violet" style={{ fontSize: 8 }}>SELECTED</span>}
                                      {p.backendAvailable
                                        ? <span className="lg-pill lg-pill-cyan" style={{ fontSize: 8 }}>{p.backendLabel}</span>
                                        : <span className="lg-pill lg-pill-amber" style={{ fontSize: 8 }}>UNAVAILABLE</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)' }}>
                                      {p.type} · {p.latency} · {p.uptime}
                                      {p.score != null && <span style={{ marginLeft: 8, color: '#818CF8' }}>score: {p.score.toFixed(3)}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono,monospace', color: isBest ? '#34D399' : 'rgba(240,242,255,0.8)' }}>${p.pricePerSec}/s</div>
                                  <div style={{ fontSize: 10, color: '#FBBF24' }}>★ {p.rating}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lg-card" style={{ padding: 20 }}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Agent Stats</div>
                {[
                  ['Tasks',     String(agent.taskCount)],
                  ['Success',   `${agent.successRate}%`],
                  ['Remaining', `$${(agent.budget - agent.spent).toFixed(4)}`],
                  ['Spent',     `$${agent.spent.toFixed(4)} USDC`],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono,monospace' }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>Budget used</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>{Math.round((agent.spent / agent.budget) * 100)}%</span>
                  </div>
                  <SpendBar spent={agent.spent} budget={agent.budget} />
                </div>
              </div>

              <div className="lg-card" style={{ padding: 20, background: 'rgba(99,102,241,0.04)' }}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, color: '#818CF8', marginBottom: 14 }}>MagicBlock ER Flow</div>
                {[
                  ['Agent session starts',              '#818CF8'],
                  ['Private ER environment created',    '#818CF8'],
                  ['Agent negotiates with providers',   '#FBBF24'],
                  ['Micropayments processed rapidly',   '#FBBF24'],
                  ['Results finalised',                 '#FBBF24'],
                  ['Compressed settlement → Solana',   '#34D399'],
                ].map(([label, color], i, arr) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)' }}>{label}</span>
                    </div>
                    {i < arr.length - 1 && <div style={{ marginLeft: 3, fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>↓</div>}
                  </div>
                ))}
              </div>

              <div className="lg-card" style={{ padding: 20 }}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🛡 Privacy</div>
                {[
                  'Phantom signs TEE challenge (free)',
                  'ER session isolates execution',
                  'Amount hidden on-chain',
                  'Counterparty hidden on-chain',
                  'ZK receipt for private audit',
                  'Compressed Solana settlement',
                ].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 7 }}>
                    <span style={{ color: '#34D399', fontSize: 11, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>

              {steps.length > 0 && (
                <div className="lg-card" style={{ padding: 20 }}>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Latest Steps</div>
                  {steps.slice(-4).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: s.color, flexShrink: 0, marginTop: 2 }}>✓</div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{s.label}</span>
                    </div>
                  ))}
                  <button onClick={() => setActiveTab('activity')} className="lg-btn-ghost" style={{ width: '100%', marginTop: 10, justifyContent: 'center', fontSize: 12, padding: '7px' }}>Full feed →</button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {showPayment && (
          <PaymentModal
            provider={selectedProvider ?? { name: 'GPU Alpha' }}
            amount={amountSpent}
            walletAction={
              runStatus === 'signing-message' ? 'sign-message'
              : runStatus === 'signing-tx'    ? 'sign-tx'
              : null
            }
            paymentDone={!!paymentResult}
            usedRealPayment={paymentResult?.usedRealPayment}
            onComplete={() => setShowPayment(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreview && taskOutput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPreview(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5,7,14,0.82)',
              backdropFilter: 'blur(10px)',
              zIndex: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="lg-card"
              style={{
                width: 'min(100%, 980px)',
                maxHeight: '92vh',
                overflow: 'hidden',
                borderRadius: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne,sans-serif' }}>Output Preview</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => void downloadOutput()} className="lg-btn-ghost" style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8 }}>
                    Download
                  </button>
                  <button onClick={() => setShowPreview(false)} className="lg-btn-ghost" style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8 }}>
                    Close
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 'calc(92vh - 58px)', overflow: 'auto', background: 'rgba(255,255,255,0.02)' }}>
                <img
                  src={taskOutput.image}
                  alt="Task output preview"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
