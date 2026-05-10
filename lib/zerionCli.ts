import { execFile } from 'child_process'
import { access } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { SOLANA_RPC } from '@/lib/config'

const execFileAsync = promisify(execFile)

export interface ZerionSwapRequest {
  agentId: string
  walletName: string
  amountUsdc: number
  slippagePercent: number
  solanaSecretKey?: Uint8Array
  solanaRpcUrl?: string
}

export interface ZerionSwapResult {
  ok: boolean
  hash?: string
  status?: string
  stdout: string
  stderr: string
  command: string
  error?: string
}

function workspaceRoot(): string {
  return process.cwd()
}

function zerionCliPath(): string {
  return process.env.ZERION_CLI_PATH
    ? path.resolve(process.env.ZERION_CLI_PATH)
    : path.join(workspaceRoot(), 'vendor', 'zerion-ai', 'cli', 'zerion.js')
}

function zerionHome(): string {
  return process.env.ZERION_HOME
    ? path.resolve(process.env.ZERION_HOME)
    : path.join(workspaceRoot(), '.zerion')
}

function zerionPassphrase(): string {
  return process.env.ZERION_AGENT_TOKEN || process.env.ZERION_WALLET_PASSPHRASE || ''
}

function parseHash(stdout: string): { hash?: string; status?: string } {
  try {
    const parsed = JSON.parse(stdout) as {
      tx?: { hash?: unknown; status?: unknown }
      hash?: unknown
      status?: unknown
    }
    const hash = typeof parsed.tx?.hash === 'string'
      ? parsed.tx.hash
      : typeof parsed.hash === 'string'
      ? parsed.hash
      : undefined
    const status = typeof parsed.tx?.status === 'string'
      ? parsed.tx.status
      : typeof parsed.status === 'string'
      ? parsed.status
      : undefined
    return { hash, status }
  } catch {
    const match = stdout.match(/[1-9A-HJ-NP-Za-km-z]{64,}/)
    return { hash: match?.[0] }
  }
}

export async function assertZerionCliAvailable(): Promise<void> {
  await access(zerionCliPath())
}

export async function executeZerionSolanaUsdcToSolSwap(req: ZerionSwapRequest): Promise<ZerionSwapResult> {
  const cli = zerionCliPath()
  const amount = req.amountUsdc.toFixed(6).replace(/\.?0+$/, '')
  const args = [
    cli,
    'swap',
    'solana',
    amount,
    'USDC',
    'SOL',
    '--wallet',
    req.walletName,
    '--slippage',
    String(req.slippagePercent),
    '--json',
  ]
  const command = `node ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`

  try {
    await assertZerionCliAvailable()
    if (req.solanaSecretKey) {
      const passphrase = zerionPassphrase()
      if (!passphrase) {
        return {
          ok: false,
          stdout: '',
          stderr: '',
          command,
          error: 'Zerion wallet import needs ZERION_AGENT_TOKEN or ZERION_WALLET_PASSPHRASE in .env.local.',
        }
      }
      const importScript = [
        'import { listWallets, importFromKey } from "./cli/utils/wallet/keystore.js";',
        'import { setWalletOrigin, getConfigValue, setConfigValue } from "./cli/utils/config.js";',
        'import { WALLET_ORIGIN } from "./cli/utils/common/constants.js";',
        'const name = process.env.FORGE_ZERION_WALLET_NAME;',
        'const key = process.env.FORGE_ZERION_SOLANA_KEY;',
        'const passphrase = process.env.FORGE_ZERION_PASSPHRASE;',
        'if (!name || !key || !passphrase) throw new Error("missing forge zerion import env");',
        'const exists = listWallets().some((w) => w.name === name);',
        'if (!exists) { importFromKey(name, key, passphrase, "solana"); setWalletOrigin(name, WALLET_ORIGIN.SOL_KEY); }',
        'if (!getConfigValue("defaultWallet")) setConfigValue("defaultWallet", name);',
      ].join('\n')
      await execFileAsync(process.execPath, ['--input-type=module', '-e', importScript], {
        cwd: path.dirname(path.dirname(cli)),
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          HOME: zerionHome(),
          USERPROFILE: zerionHome(),
          FORGE_ZERION_WALLET_NAME: req.walletName,
          FORGE_ZERION_SOLANA_KEY: JSON.stringify(Array.from(req.solanaSecretKey)),
          FORGE_ZERION_PASSPHRASE: passphrase,
        },
      })
    }
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: path.dirname(path.dirname(cli)),
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        HOME: zerionHome(),
        USERPROFILE: zerionHome(),
        SOLANA_RPC_URL: req.solanaRpcUrl ?? process.env.ZERION_SOLANA_RPC_URL ?? SOLANA_RPC,
        ZERION_API_KEY: process.env.ZERION_API_KEY ?? '',
        ZERION_AGENT_TOKEN: process.env.ZERION_AGENT_TOKEN ?? '',
      },
    })
    const parsed = parseHash(stdout)
    return {
      ok: !!parsed.hash,
      hash: parsed.hash,
      status: parsed.status,
      stdout,
      stderr,
      command,
      error: parsed.hash ? undefined : 'Zerion CLI completed but did not return a transaction hash.',
    }
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      command,
      error: e.message,
    }
  }
}
