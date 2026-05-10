'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter }         from 'next/navigation'
import { useWallet }                    from '@solana/wallet-adapter-react'
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { motion, AnimatePresence }      from 'framer-motion'
import { Navbar }                       from '@/components/Navbar'
import { Sidebar }                      from '@/components/Sidebar'
import { ActivityFeed }                 from '@/components/ActivityFeed'
import { PaymentModal }                 from '@/components/PaymentModal'
import { ZKReceipt }                    from '@/components/ZKReceipt'
import { SignInBanner }                 from '@/components/SignInBanner'
import { TreasuryIntelligencePanel }     from '@/components/TreasuryIntelligencePanel'
import { useAuthContext }               from '@/lib/AuthContext'
import { Agent, loadAgents, saveAgents, saveTransaction, loadTreasuryActions, saveTreasuryAction, StoredTreasuryAction } from '@/lib/store'
import { buildAgentSteps, AgentStep, STEP_DELAYS } from '@/lib/agentLogic'
import { createERSession }              from '@/lib/ephemeralRollup'
import { buildDefaultPolicy, buildRebalanceSimulation, createLocalTreasuryAction, createTreasurySnapshot } from '@/lib/zerionTreasury'
import { getSolBalance, getUsdcBalance } from '@/lib/payment'
import { SOLANA_RPC, USDC_MINT }          from '@/lib/config'
import type { AutonomyPolicy }           from '@/lib/treasuryTypes'
import type { ParsedIntent }            from '@/app/api/agent/intent/route'
import type { Provider }                from '@/app/api/agent/providers/route'
import type { RunResult }               from '@/app/api/agent/run/route'
import type { AutonomySessionResponse }  from '@/app/api/treasury/session/route'
import type { RebalanceResponse }        from '@/app/api/treasury/rebalance/route'
import type { PauseAutonomyResponse }     from '@/app/api/treasury/pause/route'
import type { TreasuryPaymentResponse }    from '@/app/api/agent/treasury-payment/route'
import type { EnsureTreasuryResponse }      from '@/app/api/treasury/ensure/route'
import type { ZerionMainnetWalletResponse } from '@/app/api/zerion/mainnet-wallet/route'
import type { ZerionProofSwapResponse }     from '@/app/api/zerion/proof-swap/route'
import type { AgentListItem }             from '@/app/api/agents/route'
import type { TreasuryActionItem }        from '@/app/api/treasury/actions/route'
import { apiAgentToStoreAgent }           from '@/lib/agentMapper'

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function buildAutonomyMessage(p: {
  wallet: string
  agentId: string
  treasuryWallet: string
  spendLimitUsdc: number
  expiresAt: string
}): string {
  return [
    'Authorize Forge autonomous agent',
    '',
    `Wallet: ${p.wallet}`,
    `Agent ID: ${p.agentId}`,
    `Treasury Wallet: ${p.treasuryWallet}`,
    'Chain: solana-devnet',
    `Spend Limit USDC: ${p.spendLimitUsdc.toFixed(6)}`,
    'Allowed Tokens: SOL,USDC',
    'Allowed Actions: gas-rebalance,provider-payment,policy-check,simulation',
    `Expires At: ${p.expiresAt}`,
    '',
    'This signature authorizes policy-limited autonomous execution.',
    'It is not a transaction and does not spend funds by itself.',
  ].join('\n')
}

function buildZerionProofMessage(p: {
  wallet: string
  agentId: string
  executionWallet: string
  spendLimitUsdc: number
  expiresAt: string
}): string {
  return [
    'Authorize Forge Zerion mainnet proof',
    '',
    `Wallet: ${p.wallet}`,
    `Agent ID: ${p.agentId}`,
    `Execution Wallet: ${p.executionWallet}`,
    'Chain: solana-mainnet',
    `Spend Limit USDC: ${p.spendLimitUsdc.toFixed(6)}`,
    'Allowed Tokens: SOL,USDC',
    'Allowed Actions: zerion-proof-swap',
    'Allowed Route: USDC->SOL',
    `Expires At: ${p.expiresAt}`,
    '',
    'This signature authorizes one policy-limited Zerion proof execution.',
    'It is not a transaction and does not spend funds by itself.',
  ].join('\n')
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
  const { status: authStatus, apiCall } = useAuthContext()

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
  const [policy,           setPolicy]          = useState<AutonomyPolicy | null>(null)
  const [treasuryActions,  setTreasuryActions] = useState<StoredTreasuryAction[]>([])
  const [treasuryBusy,     setTreasuryBusy]    = useState(false)
  const [zerionMainnet,    setZerionMainnet]   = useState<ZerionMainnetWalletResponse & { lastSignature?: string } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const isRunning  = runStatus !== 'idle' && runStatus !== 'done' && runStatus !== 'error'
  const isWaiting  = runStatus === 'signing-message' || runStatus === 'signing-tx'
  const treasurySnapshot = useMemo(() => {
    if (!agent) {
      return createTreasurySnapshot({ agentId: '', publicKey: '', spentUsdc: 0 })
    }
    return createTreasurySnapshot({
      agentId: agent.id,
      publicKey: agent.treasuryWallet ?? 'unfunded',
      solBalance: agent.treasurySol,
      usdcBalance: agent.treasuryUsdc,
      spentUsdc: agent.spent,
    })
  }, [agent])
  const simulationLogs = useMemo(
    () => buildRebalanceSimulation(treasurySnapshot, policy),
    [treasurySnapshot, policy],
  )

  // ─── Load agent ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const applyAgent = (found: Agent): void => {
      if (cancelled) return
          setAgent(found)
      setTreasuryActions(loadTreasuryActions(found.id))
      if (found.autonomyActive && found.autonomyExpiresAt) {
        setPolicy({
          ...buildDefaultPolicy(found.id, found.budget),
          expiresAt: found.autonomyExpiresAt,
          remainingUsdc: Math.max(0, found.budget - found.spent),
          active: new Date(found.autonomyExpiresAt).getTime() > Date.now(),
          signer: found.autonomySigner,
          message: found.autonomyMessage,
          signature: found.autonomySignature,
        })
      } else {
        setPolicy(null)
      }
    }

    async function loadAgent(): Promise<void> {
      const agentId = String(params.id)
      if (authStatus === 'authenticated') {
        const res = await apiCall<{ agent: AgentListItem }>(`/api/agents/${encodeURIComponent(agentId)}`)
        if (res.data?.agent) {
          let nextAgent = apiAgentToStoreAgent(res.data.agent)
          const ensureRes = await apiCall<EnsureTreasuryResponse>('/api/treasury/ensure', {
            method: 'POST',
            body: { agentId },
          })
          if (ensureRes.data?.success && ensureRes.data.publicKey !== nextAgent.treasuryWallet) {
            nextAgent = { ...nextAgent, treasuryWallet: ensureRes.data.publicKey, treasurySol: 0 }
          }
          applyAgent(nextAgent)
          const actionRes = await apiCall<{ actions: TreasuryActionItem[] }>(`/api/treasury/actions?agentId=${encodeURIComponent(agentId)}`)
          if (!cancelled && actionRes.data?.actions) {
            setTreasuryActions(actionRes.data.actions)
          }
          return
        }
        router.push('/dashboard')
        return
      }
      if (wallet.connected) {
        setAgent(null)
        return
      }
      const found = loadAgents().find(a => a.id === agentId)
      if (!found) router.push('/dashboard')
      else applyAgent(found)
    }

    void loadAgent()
    return () => { cancelled = true }
  }, [apiCall, authStatus, params.id, router, wallet.connected])

  const updateAndSave = useCallback((updates: Partial<Agent>) => {
    setAgent(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      saveAgents(loadAgents().map(a => a.id === updated.id ? updated : a))
      return updated
    })
  }, [])

  const refreshTreasuryBalances = useCallback(async () => {
    if (!agent?.treasuryWallet) return
    try {
      const publicKey = new PublicKey(agent.treasuryWallet)
      const [sol, usdc] = await Promise.all([
        getSolBalance(publicKey),
        getUsdcBalance(publicKey),
      ])
      updateAndSave({ treasurySol: sol, treasuryUsdc: usdc })
    } catch {
      // Treasury is not a valid on-chain pubkey yet; keep the current UI state.
    }
  }, [agent?.treasuryWallet, updateAndSave])

  useEffect(() => {
    void refreshTreasuryBalances()
    const t = setInterval(() => void refreshTreasuryBalances(), 30_000)
    return () => clearInterval(t)
  }, [refreshTreasuryBalances])

  const enableAutonomy = useCallback(async () => {
    if (!agent || treasuryBusy) return
    if (!wallet.connected || !wallet.publicKey || !wallet.signMessage) {
      setErrorMsg('Connect Phantom and sign in before enabling autonomous mode.')
      return
    }
    setTreasuryBusy(true)
    try {
      const fallbackPolicy = buildDefaultPolicy(agent.id, agent.budget)
      const message = buildAutonomyMessage({
        wallet: wallet.publicKey.toBase58(),
        agentId: agent.id,
        treasuryWallet: agent.treasuryWallet ?? 'unfunded',
        spendLimitUsdc: fallbackPolicy.spendLimitUsdc,
        expiresAt: fallbackPolicy.expiresAt,
      })
      const signed = await wallet.signMessage(new TextEncoder().encode(message))
      const signature = bytesToBase64(signed)
      const res = await apiCall<AutonomySessionResponse>('/api/treasury/session', {
        method: 'POST',
        body: {
          agentId: agent.id,
          budget: agent.budget,
          wallet: wallet.publicKey.toBase58(),
          message,
          signature,
          expiresAt: fallbackPolicy.expiresAt,
        },
      })
      if (!res.data?.active) {
        throw new Error(res.error ?? 'Autonomy authorization was rejected.')
      }
      const expiresAt = res.data?.expiresAt ?? fallbackPolicy.expiresAt
      const nextPolicy: AutonomyPolicy = {
        ...fallbackPolicy,
        expiresAt,
        spendLimitUsdc: res.data?.spendLimit ?? fallbackPolicy.spendLimitUsdc,
        remainingUsdc: Math.max(0, agent.budget - agent.spent),
        active: true,
        signer: res.data.signer,
        message: res.data.message,
        signature: res.data.signature,
      }
      setPolicy(nextPolicy)
      updateAndSave({
        autonomyActive: true,
        autonomyExpiresAt: expiresAt,
        autonomySigner: res.data.signer,
        autonomyMessage: res.data.message,
        autonomySignature: res.data.signature,
      })
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'policy-check',
        amount: nextPolicy.spendLimitUsdc,
        status: 'validated',
        detail: '24h autonomous policy session enabled with devnet-only constraints.',
      })
      saveTreasuryAction(action)
      setTreasuryActions(loadTreasuryActions(agent.id))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Autonomy authorization failed.')
    } finally {
      setTreasuryBusy(false)
    }
  }, [agent, apiCall, treasuryBusy, updateAndSave, wallet])

  const rebalanceGas = useCallback(async () => {
    if (!agent || treasuryBusy) return
    setTreasuryBusy(true)
    const simulation = createLocalTreasuryAction({
      agentId: agent.id,
      type: 'simulation',
      amount: 0,
      status: 'simulated',
      detail: 'Zerion engine simulated gas runway, slippage envelope, and policy limits.',
    })
    saveTreasuryAction(simulation)
    try {
      const res = await apiCall<RebalanceResponse>('/api/treasury/rebalance', {
        method: 'POST',
        body: {
          agentId: agent.id,
          targetSol: 0.08,
          amountUsdc: 1,
          walletName: agent.zerionWalletName ?? `forge-${agent.id}`,
          policyMessage: policy?.message ?? agent.autonomyMessage,
          policySignature: policy?.signature ?? agent.autonomySignature,
          policySigner: policy?.signer ?? agent.autonomySigner,
        },
      })
      const rebalanceData = res.data
      if (!rebalanceData?.success) {
        const cliDetail = [
          res.data?.detail ?? res.error ?? 'Zerion CLI did not return a real devnet transaction signature.',
          res.data?.stderr ? `CLI stderr: ${res.data.stderr.slice(0, 280)}` : '',
          res.data?.command ? `Command: ${res.data.command}` : '',
        ].filter(Boolean).join(' ')
        const rejected = createLocalTreasuryAction({
          agentId: agent.id,
          type: 'gas-rebalance',
          amount: 1,
          status: 'rejected',
          detail: cliDetail,
        })
        saveTreasuryAction(rejected)
        setErrorMsg(rejected.detail)
        return
      }
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'gas-rebalance',
        amount: 0.08,
        status: 'executed',
        txSignature: rebalanceData.signature,
        detail: rebalanceData.detail,
      })
      saveTreasuryAction(action)
      updateAndSave({
        treasurySol: Math.max(0.08, agent.treasurySol ?? 0.014),
        treasuryTxCount: (agent.treasuryTxCount ?? agent.taskCount) + 1,
      })
    } finally {
      setTreasuryActions(loadTreasuryActions(agent.id))
      setTreasuryBusy(false)
    }
  }, [agent, apiCall, policy, treasuryBusy, updateAndSave])

  const emergencyPause = useCallback(async () => {
    if (!agent || treasuryBusy) return
    setTreasuryBusy(true)
    try {
      const res = await apiCall<PauseAutonomyResponse>('/api/treasury/pause', {
        method: 'POST',
        body: { agentId: agent.id },
      })
      if (!res.data?.success) {
        throw new Error(res.error ?? 'Emergency pause failed.')
      }
      setPolicy(null)
      updateAndSave({
        autonomyActive: false,
        autonomyExpiresAt: undefined,
        autonomySignature: undefined,
        autonomyMessage: undefined,
        autonomySigner: undefined,
      })
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'emergency-pause',
        amount: 0,
        status: 'executed',
        detail: res.data.detail,
      })
      saveTreasuryAction(action)
      setTreasuryActions(loadTreasuryActions(agent.id))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Emergency pause failed.')
    } finally {
      setTreasuryBusy(false)
    }
  }, [agent, apiCall, treasuryBusy, updateAndSave])

  const fundTreasurySol = useCallback(async () => {
    if (!agent?.treasuryWallet || !wallet.publicKey || !wallet.sendTransaction) {
      setErrorMsg('Connect Phantom before funding the agent treasury.')
      return
    }
    setTreasuryBusy(true)
    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed')
      const to = new PublicKey(agent.treasuryWallet)
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: to,
        lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
      }))
      const sig = await wallet.sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'funding',
        amount: 0.05,
        status: 'executed',
        txSignature: sig,
        detail: 'User funded agent treasury with devnet SOL from Phantom.',
      })
      saveTreasuryAction(action)
      await refreshTreasuryBalances()
      setTreasuryActions(loadTreasuryActions(agent.id))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SOL funding failed.')
    } finally {
      setTreasuryBusy(false)
    }
  }, [agent, refreshTreasuryBalances, wallet.publicKey, wallet.sendTransaction])

  const fundTreasuryUsdc = useCallback(async () => {
    if (!agent?.treasuryWallet || !wallet.publicKey || !wallet.sendTransaction) {
      setErrorMsg('Connect Phantom before funding the agent treasury.')
      return
    }
    setTreasuryBusy(true)
    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed')
      const mint = new PublicKey(USDC_MINT)
      const owner = wallet.publicKey
      const treasury = new PublicKey(agent.treasuryWallet)
      const fromAta = await getAssociatedTokenAddress(mint, owner)
      const toAta = await getAssociatedTokenAddress(mint, treasury)
      const tx = new Transaction()
      try {
        await getAccount(connection, toAta)
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(owner, toAta, treasury, mint))
      }
      tx.add(createTransferInstruction(fromAta, toAta, owner, 2_000_000))
      const sig = await wallet.sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'funding',
        tokenIn: 'USDC',
        amount: 2,
        status: 'executed',
        txSignature: sig,
        detail: 'User funded agent treasury with devnet USDC from Phantom.',
      })
      saveTreasuryAction(action)
      await refreshTreasuryBalances()
      setTreasuryActions(loadTreasuryActions(agent.id))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'USDC funding failed. Make sure your Phantom wallet has devnet USDC for the Forge mint.')
    } finally {
      setTreasuryBusy(false)
    }
  }, [agent, refreshTreasuryBalances, wallet.publicKey, wallet.sendTransaction])

  const loadZerionMainnet = useCallback(async () => {
    if (!agent) return
    try {
      const res = await apiCall<ZerionMainnetWalletResponse>(`/api/zerion/mainnet-wallet?agentId=${encodeURIComponent(agent.id)}`)
      if (res.data) {
        const next = res.data
        setZerionMainnet(prev => ({ ...next, lastSignature: prev?.lastSignature }))
      }
      else if (res.error) setErrorMsg(res.error)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load Zerion mainnet wallet.')
    }
  }, [agent, apiCall])

  const runZerionProofSwap = useCallback(async () => {
    if (!agent || !wallet.publicKey || !wallet.signMessage || treasuryBusy) return
    setTreasuryBusy(true)
    try {
      let proofWallet = zerionMainnet
      if (!proofWallet) {
        const walletRes = await apiCall<ZerionMainnetWalletResponse>(`/api/zerion/mainnet-wallet?agentId=${encodeURIComponent(agent.id)}`)
        if (!walletRes.data) throw new Error(walletRes.error ?? 'Could not create Zerion mainnet wallet.')
        proofWallet = walletRes.data
        setZerionMainnet(proofWallet)
      }
      const expiresAt = policy?.expiresAt ?? buildDefaultPolicy(agent.id, agent.budget).expiresAt
      const message = buildZerionProofMessage({
        wallet: wallet.publicKey.toBase58(),
        agentId: agent.id,
        executionWallet: proofWallet.publicKey,
        spendLimitUsdc: 1,
        expiresAt,
      })
      const signed = await wallet.signMessage(new TextEncoder().encode(message))
      const signature = bytesToBase64(signed)
      const simulation = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'simulation',
        amount: 1,
        status: 'validated',
        detail: 'Zerion proof agent validated solana-mainnet, USDC->SOL route, 1 USDC cap, and expiry window.',
      })
      saveTreasuryAction(simulation)
      const res = await apiCall<ZerionProofSwapResponse>('/api/zerion/proof-swap', {
        method: 'POST',
        body: {
          agentId: agent.id,
          amountUsdc: 1,
          policyMessage: message,
          policySignature: signature,
          policySigner: wallet.publicKey.toBase58(),
        },
      })
      if (!res.data?.success || !res.data.signature) {
        const rejected = createLocalTreasuryAction({
          agentId: agent.id,
          type: 'zerion-proof-swap',
          amount: 1,
          status: 'rejected',
          detail: res.error ?? res.data?.detail ?? 'Zerion proof swap did not execute.',
        })
        saveTreasuryAction(rejected)
        throw new Error(rejected.detail)
      }
      const action = createLocalTreasuryAction({
        agentId: agent.id,
        type: 'zerion-proof-swap',
        amount: 1,
        status: 'executed',
        txSignature: res.data.signature,
        detail: res.data.detail,
      })
      saveTreasuryAction(action)
      const proofSignature = res.data.signature
      setZerionMainnet(prev => prev ? { ...prev, lastSignature: proofSignature } : prev)
      setTreasuryActions(loadTreasuryActions(agent.id))
      await loadZerionMainnet()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Zerion proof swap failed.')
      if (agent) setTreasuryActions(loadTreasuryActions(agent.id))
    } finally {
      setTreasuryBusy(false)
    }
  }, [agent, apiCall, loadZerionMainnet, policy?.expiresAt, treasuryBusy, wallet.publicKey, wallet.signMessage, zerionMainnet])

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

    const autonomyReady =
      !!agent.autonomyActive &&
      !!policy?.active &&
      !!policy.signature &&
      new Date(policy.expiresAt).getTime() > Date.now()
    if (!autonomyReady && (!wallet.connected || !wallet.publicKey || !wallet.signTransaction || !wallet.signMessage)) {
      setErrorMsg('Connect your Phantom wallet (set to Devnet) first.')
      return
    }

    reset()
    setRunStatus('parsing')
    setActiveTab('activity')
    updateAndSave({ status: 'running' })
    for (const log of simulationLogs) {
      addStep({
        id: `zerion-${log.id}-${Date.now()}`,
        phase: 'agent',
        icon: log.status === 'blocked' ? 'shield' : 'activity',
        color: log.status === 'blocked' ? '#F87171' : log.status === 'warning' ? '#FBBF24' : '#67E8F9',
        label: `Zerion: ${log.label}`,
        detail: log.detail,
      })
    }

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
    setRunStatus(autonomyReady ? 'paying' : 'signing-message')

    let payment: PaymentResult

    try {
      const { SIMULATE_PAYMENTS } = await import('@/lib/config')

      // Feature flag: simulation mode for demos without real USDC.
      if (SIMULATE_PAYMENTS) {
        await delay(3000)
        payment = { success: true, usedRealPayment: false, erSessionId: erSession.id }
      } else if (autonomyReady) {
        setRunStatus('paying')
        const treasuryPayment = await apiCall<TreasuryPaymentResponse>('/api/agent/treasury-payment', {
          method: 'POST',
          body: {
            agentId: agent.id,
            providerId: provider.id,
            toAddress: provider.wallet,
            amountUsdc: cost,
            erSessionId: erSession.id,
            policyMessage: policy?.message ?? agent.autonomyMessage,
            policySignature: policy?.signature ?? agent.autonomySignature,
            policySigner: policy?.signer ?? agent.autonomySigner,
          },
        })
        if (!treasuryPayment.data?.success) {
          throw new Error(treasuryPayment.error ?? 'Treasury-signed MagicBlock payment failed.')
        }
        payment = {
          success: true,
          signature: treasuryPayment.data.signature,
          usedRealPayment: treasuryPayment.data.usedRealPayment,
          erSessionId: treasuryPayment.data.erSessionId,
        }
      } else {
        if (!wallet.publicKey || !wallet.signTransaction || !wallet.signMessage) {
          throw new Error('Wallet signatures unavailable for real MagicBlock payment.')
        }
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
    updateAndSave({
      status:      'idle',
      spent:       agent.spent + cost,
      taskCount:   agent.taskCount + 1,
      lastTask:    task,
      successRate: Math.min(100, Math.round((agent.successRate * agent.taskCount + 100) / (agent.taskCount + 1))),
      treasuryUsdc: Math.max(0, (agent.treasuryUsdc ?? agent.budget) - cost),
      treasuryTxCount: (agent.treasuryTxCount ?? agent.taskCount) + 1,
    })
  }, [task, isRunning, agent, policy, simulationLogs, wallet, apiCall, reset, updateAndSave, addStep, delay])

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
                    {taskOutput && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 18 }}>
                        <div className="lg-card" style={{ overflow: 'hidden' }}>
                          <div style={{ position: 'relative', height: 180 }}>
                            <img src={taskOutput.image} alt="Task output" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(6,8,15,0.85) 0%,transparent 60%)' }} />
                            <div style={{ position: 'absolute', bottom: 12, left: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span className="lg-pill lg-pill-emerald">Output Ready</span>
                              {paymentResult?.usedRealPayment && <span className="lg-pill lg-pill-violet">ER Real</span>}
                              {taskOutput.usedRealInference
                                ? <span className="lg-pill lg-pill-cyan">AI Image</span>
                                : <span className="lg-pill lg-pill-amber">Placeholder</span>}
                            </div>
                          </div>
                          <div style={{ padding: '14px 18px' }}>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 10 }}>{taskOutput.text}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button onClick={() => setActiveTab('task')} className="lg-btn-primary" style={{ fontSize: 11, padding: '7px 11px' }}>Open result</button>
                              <button onClick={() => setShowPreview(true)} className="lg-btn-ghost" style={{ fontSize: 11, padding: '7px 11px' }}>Preview</button>
                              <button onClick={() => void downloadOutput()} className="lg-btn-ghost" style={{ fontSize: 11, padding: '7px 11px' }}>Download</button>
                            </div>
                          </div>
                        </div>
                        {showReceipt && (
                          <div style={{ marginTop: 14 }}>
                            <ZKReceipt task={task} providerName={selectedProvider?.name ?? 'GPU Alpha'}
                              amount={amountSpent} signature={paymentResult?.signature}
                              usedRealPayment={paymentResult?.usedRealPayment} />
                          </div>
                        )}
                      </motion.div>
                    )}
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
              <TreasuryIntelligencePanel
                agent={agent}
                snapshot={treasurySnapshot}
                policy={policy}
                simulationLogs={simulationLogs}
                actions={treasuryActions}
                onEnableAutonomy={() => void enableAutonomy()}
                onRebalance={() => void rebalanceGas()}
                onEmergencyPause={() => void emergencyPause()}
                onFundSol={() => void fundTreasurySol()}
                onFundUsdc={() => void fundTreasuryUsdc()}
                onLoadZerionMainnet={() => void loadZerionMainnet()}
                onRunZerionProof={() => void runZerionProofSwap()}
                zerionMainnet={zerionMainnet}
                isBusy={treasuryBusy}
              />

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
            mode={policy?.active ? 'treasury' : 'wallet'}
            treasuryWallet={agent?.treasuryWallet}
            signature={paymentResult?.signature}
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
