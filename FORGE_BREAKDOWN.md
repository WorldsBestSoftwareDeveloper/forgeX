# Forge — Full Technical & Product Breakdown

---

## What is Forge?

Forge is a **privacy-first AI agent payment platform built on Solana**.

It lets you deploy autonomous AI agents that can:
- Receive a task from you in plain English
- Automatically discover available compute service providers
- Compare their prices, latency and uptime
- Select the cheapest option within your budget
- Make a **private payment** — where the amount and who you paid are hidden on the blockchain
- Execute the task and return a result
- Generate a **ZK receipt** proving the task was done without revealing any sensitive data

The core innovation is that **the payment is private by default**. On a normal blockchain, every transaction is public — anyone can see how much you paid and to whom. Forge uses MagicBlock's Ephemeral Rollup and TEE technology to make all of that invisible on-chain, while still being fully verifiable.

---

## Technologies Used

### Frontend
| Technology | What it does in Forge |
|---|---|
| **Next.js 14** (App Router) | The React framework the entire app is built on. Handles routing between Dashboard, Agent, and Wallet pages |
| **TypeScript** | Every file is fully typed — catches bugs before they happen |
| **TailwindCSS** | Utility CSS for spacing, colors, and responsive layout |
| **Framer Motion** | All animations — page transitions, step reveals, modal entrances, wallet banners |

### Blockchain — Solana
| Technology | What it does in Forge |
|---|---|
| **@solana/web3.js** | Core library for building transactions, connecting to devnet RPC, checking balances, confirming txs |
| **@solana/wallet-adapter-react** | The system that lets Phantom inject into the app and give us access to the user's wallet |
| **@solana/wallet-adapter-phantom** | Specifically loads the Phantom wallet adapter |
| **@solana/spl-token** | Used to read the user's devnet USDC token account balance |
| **SPL Token (USDC devnet)** | The token used for all payments — mint address `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

### Privacy Infrastructure — MagicBlock
| Technology | What it does in Forge |
|---|---|
| **@magicblock-labs/ephemeral-rollups-sdk** | The official MagicBlock SDK — specifically `getAuthToken()` which makes Phantom sign a TEE challenge to grant the agent access to the private rollup session |
| **MagicBlock Payments REST API** (`payments.magicblock.app`) | The API that builds the private USDC transfer transaction with `visibility: "private"` |
| **MagicBlock Devnet TEE** (`devnet-tee.magicblock.app`) | The Trusted Execution Environment endpoint — an encrypted compute environment where the agent's payment is routed if the API decides it should go through the Ephemeral Rollup |

---

## How MagicBlock and the Ephemeral Rollup Are Used

This is the core technical heart of Forge. Here is exactly what happens:

### What is a TEE?
A **Trusted Execution Environment** is a special secure enclave inside a processor that is physically isolated from the rest of the computer. Code running inside it cannot be tampered with, and its data cannot be read from outside — not even by the server operator. MagicBlock runs their rollup infrastructure inside a TEE so that payment amounts and counterparties are encrypted at the hardware level.

### What is an Ephemeral Rollup?
A **rollup** is a layer that sits on top of a blockchain (Solana in this case) and processes transactions much faster and cheaper than the main chain. It then periodically "settles" — posting a compressed summary back to the main chain. **Ephemeral** means the rollup session is temporary — it spins up for one agent session and then closes, posting its final compressed state to Solana.

The key advantage: **inside the rollup, dozens of micropayments can happen in milliseconds**. When it settles, only one compressed transaction appears on Solana — and the individual amounts are hidden.

### The Exact MagicBlock Flow in Forge

**Step 1 — Agent triggers payment**

When you click "Run Task" and the agent reaches the payment step, the code in `lib/payment.ts` starts the real MagicBlock flow.

**Step 2 — Phantom signs a TEE challenge (Sign Message)**

```
getAuthToken(MAGICBLOCK_DEVNET_TEE, wallet.publicKey, msg => wallet.signMessage(msg))
```

Phantom pops up asking you to "Sign Message". This is **free — no SOL cost**. You are signing a cryptographic challenge that proves to MagicBlock's TEE that you are the owner of this wallet. In return, MagicBlock issues an **authorization token** that grants this agent session access to the Ephemeral Rollup.

**Step 3 — Build the private transfer**

The app calls `POST https://payments.magicblock.app/v1/spl/transfer` with:

```json
{
  "from": "your wallet address",
  "to": "GPU Alpha's wallet address",
  "mint": "devnet USDC mint",
  "amount": 54000,
  "visibility": "private",
  "cluster": "devnet",
  "sessionId": "er-session-id"
}
```

The critical field is `"visibility": "private"`. This tells MagicBlock to route the payment through the Private Ephemeral Rollup instead of posting it directly to Solana. The API returns an unsigned transaction.

**Step 4 — Phantom signs the transaction (Approve)**

Phantom pops up a second time — this time it is a real transaction approval. This costs a tiny SOL fee (~0.000005 SOL for network fees). The payment amount and recipient are encrypted inside the TEE — Phantom shows you the transaction but the sensitive details are hidden in the encrypted payload.

**Step 5 — Submit to TEE or Solana RPC**

The API tells us whether to send the signed transaction to the TEE endpoint (`devnet-tee.magicblock.app?token=your_token`) or to regular Solana devnet. If it goes to the TEE, the payment is processed inside the Ephemeral Rollup session.

**Step 6 — Compressed settlement**

When the ER session closes, all the micropayments that happened inside it are compressed into a single settlement transaction and posted to Solana devnet. The individual payment amounts and counterparties remain hidden on-chain.

**Step 7 — ZK Receipt**

Forge generates a receipt that proves:
- ✅ Payment was executed
- ✅ Task was completed
- ✅ Stayed within budget

But deliberately hides:
- 🔒 The exact amount
- 🔒 Who was paid

This is the "zero-knowledge" property — you can prove something happened without revealing the sensitive details.

### Why this matters

In a world where AI agents are making payments autonomously on your behalf, **you do not want every competitor to see exactly which GPU provider you use, how much you pay, and how often**. Private payments protect your strategy the same way a business keeps its vendor contracts confidential.

---

## Full Architecture Breakdown

```
┌─────────────────────────────────────────────────────────────────┐
│                         FORGE APP                               │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐  │
│  │  Dashboard   │   │  Agent Page  │   │   Wallet Page     │  │
│  │              │   │              │   │                   │  │
│  │ - List agents│   │ - Task input │   │ - Live USDC bal   │  │
│  │ - Stats      │   │ - Activity   │   │ - Live SOL bal    │  │
│  │ - Create btn │   │   feed       │   │ - Live agent      │  │
│  └──────────────┘   │ - Provider   │   │   payment history │  │
│                     │   comparison │   │ - On-chain txs    │  │
│                     │ - ZK Receipt │   └───────────────────┘  │
│                     └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Phantom Wallet Adapter
                              │
              ┌───────────────┼───────────────┐
              │               │               │
   ┌──────────▼───┐  ┌────────▼──────┐  ┌───▼──────────────┐
   │   Solana     │  │  MagicBlock   │  │   MagicBlock     │
   │   Devnet     │  │  Payments API │  │   TEE / ER       │
   │              │  │               │  │                  │
   │ - USDC token │  │ POST /v1/spl/ │  │ - Phantom signs  │
   │   accounts   │  │   transfer    │  │   challenge      │
   │ - Settlement │  │   visibility: │  │ - Auth token     │
   │   tx landing │  │   "private"   │  │ - Processes      │
   │ - Explorer   │  │               │  │   payment        │
   └──────────────┘  └───────────────┘  └──────────────────┘
```

---

## File Structure

```
agentforge/
├── app/
│   ├── dashboard/page.tsx     — Dashboard: list agents, stats, create modal
│   ├── agent/[id]/page.tsx    — Main experience: task → ER flow → receipt
│   ├── wallet/page.tsx        — Live balances + transaction history
│   ├── layout.tsx             — Root layout, wraps wallet provider
│   └── globals.css            — All styles + responsive breakpoints
│
├── components/
│   ├── Navbar.tsx             — Top bar: logo, wallet connect button, SOL balance
│   ├── Sidebar.tsx            — Left nav (desktop) + bottom nav (mobile)
│   ├── ActivityFeed.tsx       — 4-phase ER flow visualisation (the live feed)
│   ├── PaymentModal.tsx       — Payment overlay: wallet-state driven, not timer-driven
│   ├── ZKReceipt.tsx          — ZK receipt card with verify button
│   └── WalletProvider.tsx     — Wraps entire app with Solana wallet context
│
├── lib/
│   ├── payment.ts             — Real MagicBlock payment + SOL/USDC balance fetchers
│   ├── agentLogic.ts          — 13-step ER flow definition, output generator
│   ├── ephemeralRollup.ts     — ER session manager, flow definitions
│   ├── mockProviders.ts       — 5 service providers with real wallet addresses
│   ├── store.ts               — localStorage agent + transaction store w/ live events
│   └── constants.ts           — All endpoint URLs, USDC mint address
```

---

## User Workflow — Step by Step

### 1. Open the app
You land on the Dashboard. You see three pre-loaded demo agents (Nexus-7, Prism-X, Sigma-3) with their budgets, success rates, and last tasks. A yellow banner tells you to connect Phantom if you haven't.

### 2. Connect Phantom wallet
Click "Connect Wallet" in the top right. Phantom opens. You approve. Your truncated wallet address appears, along with your live SOL balance fetched from Solana devnet.

### 3. Create an agent (optional)
Click "New Agent". A modal appears — give it a name (or use the suggested one like "Vega-7") and set a USDC budget. Click "Deploy Agent". It appears on the dashboard instantly, saved to localStorage.

### 4. Open an agent
Click any agent card. You land on the Agent Detail page with three tabs: Task, Activity, Providers.

### 5. Enter a task
Type something like:

> "Find cheapest GPU and generate a futuristic city at night"

Or click one of the preset suggestions. Hit "Run Task".

### 6. Watch the Ephemeral Rollup flow begin
The app switches to the Activity tab automatically. The feed starts populating in phases:

**Phase 1 — Agent Activity (purple)**
- Agent session started
- Discovering 5 service providers
- Agent negotiates with providers
- Selects GPU Alpha at $0.018/sec (cheapest)

**Phase 2 — Ephemeral Execution Environment (violet)**
- Private Ephemeral Rollup environment created
- TEE auth token obtained...

### 7. Phantom opens — Sign Message
The activity feed **pauses**. A yellow banner appears:

> "👻 Phantom is open — click Sign Message to authorise TEE access"

This is **free**. You are proving to MagicBlock's TEE that you own this wallet. Click Sign in Phantom.

### 8. Phantom opens again — Approve Transaction
The banner updates:

> "👻 Phantom is open — click Approve to confirm the private payment"

This is the real USDC transfer transaction, built by MagicBlock's API with `visibility: "private"`. It costs a tiny SOL fee. You click Approve.

### 9. Activity feed resumes
The moment you approve, the feed continues automatically:

**Phase 2 continued**
- Micropayment processed inside Ephemeral Rollup (amount hidden)
- Task executing on GPU Alpha inside ER
- Results finalised inside ER

**Phase 3 — Batch / Private Settlement (amber)**
- Batching transactions for compressed settlement
- Compressing settlement data (ZK state proof)

**Phase 4 — Final Settlement → Solana (green)**
- Compressed settlement posted to Solana devnet
- Confirmed on Solana · ZK receipt ready

### 10. Results appear
The page switches back to the Task tab. You see:
- A generated image output
- A description of what was done
- How much was spent

### 11. ZK Receipt
Below the output, a ZK Privacy Receipt appears showing:
- ✅ Payment executed · Confirmed
- ✅ Task completed · Success
- ✅ Within budget · Yes
- 🔒 Amount · Hidden
- 🔒 Counterparty · Hidden
- Proof ID and optional Solana Explorer link

Click "Verify Proof" and it simulates on-chain verification.

### 12. Wallet page updates live
Navigate to Wallet. The payment appears **instantly** in the Agent Payment History — no page refresh needed. It shows:
- The agent that paid
- The task description
- The time
- A "🔒 ER Real" badge if the real MagicBlock API was used
- A link to Solana Explorer if a real signature was returned

The USDC and SOL balances are fetched live from Solana devnet and refresh every 30 seconds.

---

## What Makes This Different from Normal Payments

| Feature | Normal Solana tx | Forge + MagicBlock ER |
|---|---|---|
| Amount visible on-chain | ✅ Public | 🔒 Hidden |
| Counterparty visible | ✅ Public | 🔒 Hidden |
| Speed | ~400ms finality | Sub-second inside ER |
| Cost | Per tx | Batch compressed |
| Auditability | Anyone can see | Only you via ZK receipt |
| Agent automation | Manual | Fully autonomous |

---

## The Fallback System

If MagicBlock's devnet TEE is temporarily unreachable (it is beta infrastructure), Forge automatically falls back to a clean simulation:

- The UI flow looks identical
- The activity feed runs the same phases
- A "🔁 Simulated" badge appears instead of "🔒 ER Real"
- The wallet page records it as simulated

This means the app **never breaks** — it degrades gracefully. For mainnet production, the real ER would always be used.

---

## Summary

Forge proves that AI agents can operate as **autonomous economic actors** — discovering services, negotiating, and making private payments without human intervention at each step. The combination of Solana's speed, MagicBlock's privacy infrastructure, and Phantom's wallet UX creates a user experience where you can literally type a sentence and watch your agent spend money privately on your behalf, with full cryptographic proof that it did the right thing.

