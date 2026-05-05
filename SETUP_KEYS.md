# Forge — Complete Beginner Setup Guide
**33 files · Solana Devnet · MagicBlock Private ER · Production-grade**

---

## PART 1 — Run locally in WSL

### Step 1 — Open WSL terminal
Press `Windows + R` → type `wsl` → Enter. A terminal opens.

### Step 2 — Install Node 20
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20
node --version   # should print v20.x.x
```

### Step 3 — Install Yarn
```bash
npm install -g yarn
yarn --version   # should print 1.x.x
```

### Step 4 — Extract the project
```bash
# Replace YOUR_NAME with your Windows username
cp /mnt/c/Users/YOUR_NAME/Downloads/agentforge.zip ~/
unzip ~/agentforge.zip -d ~/
cd ~/agentforge
```

### Step 5 — Install all dependencies
```bash
yarn install
# Takes 2-4 minutes. You will see a lot of text — this is normal.
```

### Step 6 — Generate your AUTH_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output — you need it in the next step
```

### Step 7 — Edit .env.local
```bash
nano .env.local
# Find the line: AUTH_SECRET=forge-change-this-secret...
# Replace the value with the hex string you just generated
# Press Ctrl+X → Y → Enter to save
```

### Step 8 — Start the app
```bash
yarn dev
# You will see: ready - started server on http://localhost:3000
```

### Step 9 — Open in your Windows browser
Go to: **http://localhost:3000**

---

## PART 2 — Phantom Wallet Setup

### Step 1 — Install Phantom
Go to **https://phantom.app** → Download for Chrome or Edge → Install.
Create a wallet and save your seed phrase.

### Step 2 — Switch to Devnet
1. Click Phantom icon in browser toolbar
2. Click **Settings** (gear icon, bottom right)
3. Click **Developer Settings**
4. Turn on **Testnet Mode**
5. At the top of Phantom → click the network name → choose **Devnet**

### Step 3 — Get free devnet funds

**Devnet SOL** (for gas fees — free):
1. Go to **https://faucet.solana.com**
2. Copy your wallet address from Phantom
3. Paste it → click **Confirm Airdrop** → receive 2 SOL

**Devnet USDC** (for agent payments — free):
1. Go to **https://faucet.circle.com**
2. Click **Connect Wallet** → Phantom → Approve
3. Click **Mint** → receive devnet USDC

---

## PART 3 — Sign In Flow

When you connect Phantom you will see a yellow **Sign In** banner.

1. Click **Sign In**
2. Phantom shows a readable message:
   ```
   Sign in to Forge
   Wallet: 7xKa...3fPq
   Nonce: af3d9b2c...
   This proves wallet ownership. No transaction is made.
   ```
3. Click **Sign** — **free, no gas, no SOL spent**
4. Banner disappears → green "Signed in" indicator appears ✅

Your session lasts 24 hours. On next visit just click Sign In again (one click).

---

## PART 4 — Run Your First Task

1. Open http://localhost:3000
2. Click **Connect Wallet** → Phantom → Approve
3. Click **Sign In** → Phantom → Sign (free)
4. Click any agent card (e.g. Nexus-7)
5. Type: `Find cheapest GPU and generate a futuristic city at night`
6. Click **Run Task**

**What happens in Phantom:**

| Timing | Phantom shows | Cost |
|--------|--------------|------|
| ~5s into flow | "Sign Message" | Free — proves TEE access |
| ~2s later | "Approve Transaction" | ~0.000005 SOL — the private USDC payment |

7. Wait ~15 seconds total
8. Task output image appears + ZK receipt
9. Go to **Wallet** page — payment appears instantly

---

## PART 5 — API Keys (all optional)

Every key adds a real feature. App works without any of them.

Open `.env.local`:
```bash
nano ~/agentforge/.env.local
```

After editing, restart the server:
```bash
# Press Ctrl+C in the terminal running yarn dev, then:
yarn dev
```

Verify keys loaded:
```bash
curl http://localhost:3000/api/health
```
Each `true` = key is working.

---

### A — Supabase (persistent database across sessions)
**Without it:** Data lives in browser localStorage only.
**With it:** Agents + transactions saved to Postgres, work from any browser.

1. Go to **https://supabase.com** → Sign up with GitHub
2. **New project** → name: `forge` → choose region → set a DB password → Create
3. Wait ~2 minutes
4. Left sidebar → **Settings** → **API**
5. Copy **Project URL** → paste as `NEXT_PUBLIC_SUPABASE_URL=`
6. Copy **anon / public key** → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY=`

**Run the database schema:**
1. In Supabase → left sidebar → **SQL Editor** → **New query**
2. Open `~/agentforge/supabase-schema.sql` → copy all contents
3. Paste into SQL Editor → click **Run**
4. You should see: "Success. No rows returned" ✅

---

### B — OpenAI (smarter task parsing)
**Without it:** Rule-based parser (works great).
**With it:** GPT-4o-mini reads your task and extracts intent precisely.

1. Go to **https://platform.openai.com** → Sign up
2. Click your avatar → **API keys** → **Create new secret key** → copy
3. Paste as `OPENAI_API_KEY=sk-...`
4. Go to **Billing** → add $5 credit
Cost: ~$0.0001 per parse (= 50,000 parses per $5)

---

### C — Replicate (real AI image generation)
**Without it:** Placeholder images from picsum.photos.
**With it:** Real SDXL image generation — actual AI output.

1. Go to **https://replicate.com** → Sign up with GitHub
2. Click avatar → **API tokens** → **Create token** → copy
3. Paste as `REPLICATE_API_TOKEN=r8_...`
4. Go to **Billing** → add $5 credit
Cost: ~$0.0023 per image (= ~2,100 images per $5)

---

### D — Demo / presentation mode (no wallet needed)

To run Forge as a live demo without needing real USDC:
```bash
# In .env.local:
NEXT_PUBLIC_FORGE_SIMULATE_PAYMENTS=true
NEXT_PUBLIC_FORGE_SIMULATE_INFERENCE=true
```
The full UI flow runs with simulated payments and placeholder images.
Output shows "🔁 Simulated" badges so it's clear what's real vs demo.

---

## PART 6 — Push to GitHub

```bash
cd ~/agentforge
git config --global user.name "Your Name"
git config --global user.email "you@email.com"

git init
git add .
git commit -m "Forge v0.3 — Private AI Agent Payments on Solana"

# Create repo on github.com first (New repo → name: forge → no README)
git remote add origin https://github.com/YOUR_USERNAME/forge.git
git branch -M main
git push -u origin main
```

GitHub will ask for a **Personal Access Token** (not password):
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → check **repo** → Generate → copy
3. Use this as the password when Git prompts

---

## PART 7 — Deploy to Vercel

1. Go to **https://vercel.com** → Sign up with GitHub
2. **Add New Project** → find `forge` → Import
3. Framework: **Next.js** (auto-detected) ✓
4. Click **Environment Variables** → add these:

| Key | Value |
|-----|-------|
| `AUTH_SECRET` | Your 64-char hex string from Step 6 |
| `NEXT_PUBLIC_NETWORK` | `devnet` |
| `NEXT_PUBLIC_SOLANA_RPC` | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_MAGICBLOCK_PAYMENTS_API` | `https://payments.magicblock.app` |
| `NEXT_PUBLIC_MAGICBLOCK_DEVNET_TEE` | `https://devnet-tee.magicblock.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | *(if you set up Supabase)* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(if you set up Supabase)* |
| `OPENAI_API_KEY` | *(if you set up OpenAI)* |
| `REPLICATE_API_TOKEN` | *(if you set up Replicate)* |

5. Click **Deploy** → wait ~2 minutes
6. Your app is live at `https://forge-xyz.vercel.app`

**Future deploys — automatic:**
```bash
git add . && git commit -m "your change" && git push
# Vercel auto-redeploys in ~90 seconds
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Module not found: jose` | Run `yarn install` |
| `node: command not found` | Run `nvm use 20` |
| Phantom: "Transaction simulation failed" | Get devnet SOL from faucet.solana.com |
| "Sign-in failed: Signature verification failed" | Try again — nonce expires in 5 min |
| Health shows `"supabase": false` | Check .env.local keys, restart yarn dev |
| Health shows `"magicblock": false` | MagicBlock devnet down — set SIMULATE_PAYMENTS=true for demo |
| Vercel build fails | Check Build Logs → usually a missing env var |
| Images not showing | Add REPLICATE_API_TOKEN or set SIMULATE_INFERENCE=true |

