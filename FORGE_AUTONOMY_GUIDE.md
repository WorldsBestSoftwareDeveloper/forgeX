# Forge Autonomy Guide

## What changed

Forge now has the first full autonomous treasury path:

1. Agent creation calls `/api/treasury/create`.
2. The server generates a Solana treasury wallet.
3. The private key is encrypted with `TREASURY_ENCRYPTION_KEY`.
4. Supabase stores the encrypted treasury wallet when configured.
5. The Agent page shows Zerion treasury intelligence, policy status, simulation logs, and autonomy controls.
6. Autonomous mode creates a 24h devnet-only session.
7. Rebalance runs through `/api/treasury/rebalance`.
8. `/api/treasury/rebalance` now calls the vendored Zerion CLI swap route.
9. MagicBlock remains the private payment and confidential settlement hero in the activity feed.

## PowerShell setup

PowerShell may block `npm` because `npm.ps1` is disabled. Use `npm.cmd`:

```powershell
cd C:\Users\user\Music\agentforge
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:3000/dashboard
```

## Strict TypeScript check

Run:

```powershell
cd C:\Users\user\Music\agentforge
node_modules\.bin\tsc.cmd --noEmit
```

Expected result: no output and exit code `0`.

## Build check

Run:

```powershell
npm.cmd run build
```

In this Codex sandbox, Next compiled successfully but Windows blocked a child worker with `spawn EPERM`. On your normal VS Code terminal this should usually complete. If it does not, run VS Code as your normal user and retry.

## Environment variables

Add these to `.env.local`:

```env
TREASURY_ENCRYPTION_KEY=replace-with-a-long-random-secret
AUTH_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_MAGICBLOCK_PAYMENTS_API=https://payments.magicblock.app
NEXT_PUBLIC_MAGICBLOCK_DEVNET_TEE=https://devnet-tee.magicblock.app
OPENAI_API_KEY=optional-for-llm-parser
OPENAI_INTENT_MODEL=gpt-4o-mini
REPLICATE_API_TOKEN=optional-for-real-image-generation
TOGETHER_API_KEY=optional-for-together-provider
ZERION_SOLANA_NETWORK=devnet
ZERION_API_KEY=zk_your_zerion_key
ZERION_AGENT_TOKEN=your_scoped_zerion_agent_token
ZERION_CLI_PATH=C:\Users\user\Music\agentforge\vendor\zerion-ai\cli\zerion.js
ZERION_HOME=C:\Users\user\Music\agentforge\.zerion
ZERION_SOLANA_RPC_URL=https://api.devnet.solana.com
```

For UI-only demos:

```env
NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=true
NEXT_PUBLIC_FORGE_SIMULATE_INFERENCE=true
```

For real MagicBlock payment testing:

```env
NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=false
```

## Supabase setup

1. Open Supabase.
2. Go to SQL Editor.
3. Paste `supabase-schema.sql`.
4. Run it.
5. Confirm these tables exist:
   `treasury_wallets`, `autonomy_sessions`, `treasury_actions`.

Without Supabase, the UI still works locally, but the server cannot recover encrypted treasury private keys after creation.

## LLM parser checklist

If the parser does not work:

1. Confirm `OPENAI_API_KEY` is in `.env.local`.
2. Restart the dev server after editing `.env.local`.
3. Try a task like:

```text
Research the cheapest image generation provider and keep spend under $0.20
```

4. Check the Agent page intent chips.
5. If OpenAI fails, Forge now falls back to a strict rule parser instead of breaking the flow.

Supported task types now include:
`image-generation`, `upscale`, `inference`, `training`, `compute`, `text-generation`, `research`, `data-fetching`, `treasury-balancing`.

## Zerion CLI setup

The Zerion CLI repo is vendored at:

```text
C:\Users\user\Music\agentforge\vendor\zerion-ai
```

Important: Zerion's current wallet-signing dependency does not publish a Windows native package. In PowerShell on Windows, the CLI may fail with:

```text
Cannot find module '@open-wallet-standard/core-win32-x64-msvc'
```

Use WSL/Linux for actual Zerion CLI signing and swapping until Zerion publishes Windows bindings.

Inside WSL/Linux:

```bash
cd /mnt/c/Users/user/Music/agentforge/vendor/zerion-ai
npm install
export ZERION_API_KEY="zk_..."
export ZERION_SOLANA_NETWORK=devnet
export SOLANA_RPC_URL="https://api.devnet.solana.com"
node cli/zerion.js wallet import --name forge-agent-REPLACE --sol-key
node cli/zerion.js agent create-policy --name forge-devnet --chains solana --expires 24h --deny-transfers
node cli/zerion.js agent create-token --name forge-agent-token --wallet forge-agent-REPLACE --policy forge-devnet --expires 24h
node cli/zerion.js swap solana 1 USDC SOL --wallet forge-agent-REPLACE --slippage 2 --json
```

Forge calls the same swap form from `/api/treasury/rebalance`:

```text
zerion swap solana 1 USDC SOL --wallet forge-agent-id --slippage 2 --json
```

If Zerion's API refuses devnet tokens/routes, the endpoint returns the CLI error instead of faking success.

## Demo flow

1. Connect Phantom on Solana Devnet.
2. Sign in from the Forge banner.
3. Create a new agent.
4. Copy the treasury wallet shown on the agent card or Agent page.
5. Fund it with devnet SOL from `https://faucet.solana.com/`.
6. Fund devnet USDC from `https://faucet.circle.com/`.
7. Open the agent.
8. Click `Enable autonomy`.
9. Click `Rebalance gas`.
10. Forge calls Zerion CLI for `USDC -> SOL`.
11. Run a task.
12. Watch Zerion simulation steps appear before MagicBlock PER execution.
13. Confirm the ZK receipt appears after completion.

## Important implementation note

The rebalance endpoint now uses Zerion CLI, not the old self-transfer placeholder. Zerion CLI itself currently appears mainnet-oriented for Solana quotes, so true Solana devnet swap execution depends on Zerion supporting devnet quote/token routing for `USDC -> SOL`.
