# Forge — Full Setup, GitHub & Vercel Deploy Guide

## ─── PART 1: Run locally in WSL ────────────────────────────────────────────

### Step 1 — Install Node 20 (if not already)
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell
source ~/.bashrc

# Install + use Node 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version    # should print v20.x.x
```

### Step 2 — Install Yarn
```bash
npm install -g yarn
yarn --version    # should print 1.x.x
```

### Step 3 — Unzip and enter the project
```bash
# If zip is in Windows Downloads (replace YOUR_NAME):
cp /mnt/c/Users/YOUR_NAME/Downloads/agentforge.zip ~/
unzip ~/agentforge.zip -d ~/
cd ~/agentforge
```

### Step 4 — Install dependencies
```bash
yarn install
# Takes 1–3 minutes — installs Next.js, Solana, MagicBlock SDK, Framer Motion
```

### Step 5 — Run the dev server
```bash
yarn dev
# You'll see: ready - started server on localhost:3000
```

### Step 6 — Open in your Windows browser
```
http://localhost:3000
```
It redirects to /dashboard automatically.

---

## ─── PART 2: Phantom Wallet Setup ──────────────────────────────────────────

1. Install **Phantom** extension in Chrome or Edge (on Windows)
2. Open Phantom → **Settings** (gear icon) → **Developer Settings**
3. Turn on **Testnet Mode**
4. At top of Phantom, click the network name → switch to **Devnet**
5. Your address will be the same, just on devnet

### Get devnet funds (both are FREE):
| Fund | Link | What to do |
|------|------|------------|
| SOL  | https://faucet.solana.com/ | Paste address → Request 2 SOL |
| USDC | https://faucet.circle.com/ | Connect Phantom → Mint USDC |

---

## ─── PART 3: Using the app ──────────────────────────────────────────────────

1. Open http://localhost:3000
2. Click **Connect Wallet** (top right) → Phantom opens → Approve
3. Create an agent → give it a name + budget
4. Click the agent → enter a task → click **Run Task**

### What Phantom shows you:

| When | Phantom popup | What it does |
|------|--------------|--------------|
| Payment step triggers | **"Sign Message"** | Free. Signs TEE challenge to get MagicBlock ER auth token |
| Auth token received | **"Approve Transaction"** | ~0.000005 SOL fee. Signs the private USDC transfer |
| Done | — | Payment hidden on-chain via Private Ephemeral Rollup |

The **activity feed pauses** while Phantom is open and resumes the moment you sign — steps stay perfectly in sync with what you see in Phantom.

---

## ─── PART 4: Push to GitHub ─────────────────────────────────────────────────

### Step 1 — Create a GitHub account
Go to https://github.com and sign up if you haven't.

### Step 2 — Create a new repository
1. Click the **+** button (top right) → **New repository**
2. Name it: `forge`
3. Keep it **Public** (needed for free Vercel)
4. **Do NOT** tick "Add README" — we have one already
5. Click **Create repository**

### Step 3 — Install Git in WSL (if needed)
```bash
sudo apt update && sudo apt install git -y
git --version    # should print git version 2.x.x
```

### Step 4 — Configure Git (first time only)
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### Step 5 — Initialise and push
```bash
cd ~/agentforge

# Initialise git
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit: Forge — Private AI Agent Payments"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/forge.git

# Push
git branch -M main
git push -u origin main
```

GitHub will ask for your username + a **Personal Access Token** (not your password).

### Creating a GitHub Token:
1. GitHub → top-right avatar → **Settings**
2. Scroll to bottom → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. Name it "WSL Forge deploy"
6. Tick: **repo** (full control)
7. Click **Generate** → copy the token
8. Use this token as the password when Git asks

---

## ─── PART 5: Deploy to Vercel ───────────────────────────────────────────────

### Step 1 — Sign up for Vercel
Go to https://vercel.com → **Sign up** → choose **Continue with GitHub**
Authorise Vercel to access your GitHub.

### Step 2 — Import your repo
1. Vercel dashboard → **Add New Project**
2. Find `forge` in your repository list → click **Import**

### Step 3 — Configure the project
Vercel auto-detects Next.js. Just check these settings:

| Setting | Value |
|---------|-------|
| Framework Preset | Next.js ✓ (auto) |
| Root Directory | `.` (leave default) |
| Build Command | `yarn build` |
| Output Directory | `.next` |

### Step 4 — Environment variables
Click **Environment Variables** and add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SOLANA_RPC` | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_MAGICBLOCK_PAYMENTS_API` | `https://payments.magicblock.app` |
| `NEXT_PUBLIC_MAGICBLOCK_DEVNET_TEE` | `https://devnet-tee.magicblock.app` |

### Step 5 — Deploy
Click **Deploy**. Vercel builds and deploys in ~2 minutes.

You'll get a URL like: `https://forge-xyz.vercel.app`

### Step 6 — Open in browser
Go to your Vercel URL → connect Phantom → same flow as localhost!

---

## ─── PART 6: Future updates ─────────────────────────────────────────────────

Every time you make changes locally:
```bash
cd ~/agentforge
git add .
git commit -m "Your change description"
git push
```
Vercel automatically re-deploys within 1–2 minutes.

---

## ─── Common errors ───────────────────────────────────────────────────────────

| Error | Fix |
|-------|-----|
| `yarn: command not found` | Run `npm install -g yarn` |
| `node: command not found` | Run `nvm use 20` |
| `ENOENT .env.local` | Normal — .env.local is optional, env vars are hardcoded in lib/constants.ts |
| Phantom shows "Transaction simulation failed" | Make sure you have devnet SOL from faucet.solana.com |
| MagicBlock API returns error | Falls back to simulation automatically — no action needed |
| Vercel build fails | Check Build Logs in Vercel dashboard → most common cause is missing env var |

