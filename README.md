# Forge
url: https://forge-xx.vercel.app/

Privacy-first AI agent payments on Solana.

Forge lets users create autonomous AI agents that can choose a service provider, make a private payment, run a task, and return a receipt. The project is built around the idea that AI agents should be able to spend from a controlled budget without exposing every payment amount and provider relationship on-chain.

## What Forge Does

Forge turns a plain-English task into an agent workflow:

1. The user connects a Phantom wallet on Solana devnet.
2. The user creates an agent with a USDC budget.
3. Forge creates a treasury wallet for that agent.
4. The user enters a task, such as generating an image or running inference.
5. Forge parses the task and ranks available providers.
6. The agent selects the best provider based on price, latency, quality, and health.
7. Payment is routed through MagicBlock with private settlement metadata.
8. The selected provider runs the task through Replicate, Together, or a fallback mode.
9. Forge returns the output and a privacy receipt.

## Core Workflow

### 1. Connect Wallet

The app uses Phantom through the Solana wallet adapter. For local testing, Phantom should be set to devnet and funded with devnet SOL and devnet USDC.

### 2. Sign In

Forge uses wallet-based authentication. The user signs a message, the server verifies the signature, and the app receives a short-lived JWT for API calls.

### 3. Create an Agent

Creating an agent also creates a treasury wallet. The treasury wallet is used for agent-controlled payments and autonomy features. When Supabase is configured, the treasury private key is encrypted before it is stored.

### 4. Run a Task

The agent page accepts a task in natural language. Forge parses the task into a structured intent, finds eligible providers, ranks them, and selects the best match.

### 5. Private Payment

Forge uses MagicBlock's payment flow to build a private SPL transfer. The payment is signed by Phantom or, when autonomy is enabled, by the agent treasury wallet.

### 6. Output and Receipt

After payment, Forge runs the task through a configured AI provider. The result appears in the UI with a receipt showing that the task completed, payment was handled, and the agent stayed within budget.

## Tech Used

- **Next.js 14**: App Router, frontend pages, and API routes.
- **TypeScript**: typed application logic across the app.
- **TailwindCSS**: styling and responsive layout.
- **Framer Motion**: UI transitions and activity animations.
- **Solana Web3.js**: wallet addresses, transactions, balances, and devnet RPC calls.
- **Solana Wallet Adapter**: Phantom wallet connection and signing.
- **SPL Token**: USDC token account handling.
- **MagicBlock**: private payment and ephemeral rollup-style settlement flow.
- **Supabase**: optional persistence for users, agents, runs, transactions, treasury wallets, and autonomy sessions.
- **OpenAI**: optional natural-language task parsing.
- **Replicate**: optional image/inference provider.
- **Together AI**: optional image/inference provider.
- **Zerion CLI**: treasury rebalance and proof-swap experiment path.

## Project Structure

```text
app/
  dashboard/          Main agent dashboard
  agent/[id]/         Agent task, activity, providers, treasury controls
  wallet/             Wallet balances and payment history
  treasury/           Treasury overview
  api/                Auth, agents, payments, treasury, provider, and run APIs

components/
  ActivityFeed.tsx    Agent execution timeline
  PaymentModal.tsx    Payment status UI
  ZKReceipt.tsx       Privacy receipt UI
  WalletProvider.tsx  Solana wallet provider wrapper

lib/
  auth.ts             Wallet auth and JWT helpers
  config.ts           Environment config and feature flags
  magicblock.ts       MagicBlock payment helpers
  providerEngine.ts   Provider registry and ranking logic
  store.ts            localStorage fallback store
  supabase.ts         Supabase CRUD helpers
  treasuryCrypto.ts   Treasury key generation and encryption
  zerionCli.ts        Zerion CLI wrapper
```

## Local Setup

Install dependencies:

```powershell
npm.cmd install
```

Run the development server:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000/dashboard
```

Run a TypeScript check:

```powershell
node_modules\.bin\tsc.cmd --noEmit
```

Build for production:

```powershell
npm.cmd run build
```

## Environment Variables

The app can run in demo mode with minimal configuration, but real payments, persistence, and inference need API keys.

```env
AUTH_SECRET=replace-with-a-long-random-secret
TREASURY_ENCRYPTION_KEY=replace-with-a-long-random-secret

NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_MAGICBLOCK_PAYMENTS_API=https://payments.magicblock.app
NEXT_PUBLIC_MAGICBLOCK_DEVNET_TEE=https://devnet-tee.magicblock.app

NEXT_PUBLIC_SUPABASE_URL=optional
NEXT_PUBLIC_SUPABASE_ANON_KEY=optional

OPENAI_API_KEY=optional
OPENAI_INTENT_MODEL=gpt-4o-mini

REPLICATE_API_TOKEN=optional
TOGETHER_API_KEY=optional

NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=true
NEXT_PUBLIC_FORGE_SIMULATE_INFERENCE=true
```

For real MagicBlock payment testing, set:

```env
NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=false
```

## Supabase

Supabase is optional for local UI demos. When configured, it stores:

- users
- agents
- agent runs
- transactions
- encrypted treasury wallets
- autonomy sessions
- treasury actions

Run the schema in:

```text
supabase-schema.sql
```

## Demo Mode vs Real Mode

Forge supports fallback modes so the app remains usable during demos.

- **Simulated payments** skip real MagicBlock transfers.
- **Simulated inference** uses placeholder images instead of Replicate or Together.
- **Supabase disabled** falls back to browser localStorage for basic agent state.

For the full flow, use Phantom on devnet, fund the wallet with devnet SOL/USDC, configure Supabase, and disable payment simulation.

## Notes

- This project is currently focused on Solana devnet.
- Real inference requires provider API keys.
- Real private payments require MagicBlock endpoints to be reachable.
- Zerion CLI functionality may work better in WSL/Linux than native Windows because of current wallet-signing dependency limitations.
