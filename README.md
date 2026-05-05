# Forge 🤖

**Private AI Agent Payments on Solana** — powered by MagicBlock TEE

Agents autonomously discover services, compare prices, select the cheapest provider, and make private micropayments using MagicBlock's Private Ephemeral Rollup on Solana devnet.

## Quick Start (WSL / Linux)

### Prerequisites
- Node.js 20+ (`nvm install 20`)
- Yarn (`npm install -g yarn`)
- Phantom wallet browser extension (Chrome/Edge on Windows)

### Steps

```bash
# 1. Enter project
cd ~/agentforge

# 2. Install dependencies
yarn install

# 3. Run dev server
yarn dev

# 4. Open in Windows browser
# http://localhost:3000
```

### Phantom Setup for Devnet
1. Click Phantom extension in browser
2. Settings (gear icon) → Developer Settings → Testnet Mode ON
3. Or: Switch network → Devnet
4. Get devnet SOL: https://faucet.solana.com/
5. Get devnet USDC: https://faucet.circle.com/

## How It Works

1. Connect Phantom wallet (devnet)
2. Create an agent with a USDC budget
3. Give it a task
4. Agent discovers providers, picks cheapest
5. **Phantom pops up to sign a TEE challenge** (free, no SOL)
6. MagicBlock builds a private transfer (amount hidden)
7. **Phantom pops up to sign the transaction** (costs ~0.000005 SOL)
8. Payment submits through MagicBlock's Private Ephemeral Rollup
9. ZK receipt generated — amount and counterparty hidden on-chain

## Stack
- Next.js 14 (App Router)
- Solana + @solana/wallet-adapter
- MagicBlock @magicblock-labs/ephemeral-rollups-sdk
- Framer Motion
- TypeScript + TailwindCSS
