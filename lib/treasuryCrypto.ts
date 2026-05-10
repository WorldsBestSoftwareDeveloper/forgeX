import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { Keypair } from '@solana/web3.js'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.TREASURY_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? 'forge-dev-secret-change-in-production'
  return createHash('sha256').update(secret).digest()
}

export function generateTreasuryKeypair(): Keypair {
  return Keypair.generate()
}

export function encryptSecretKey(secretKey: Uint8Array): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const plaintext = Buffer.from(secretKey).toString('base64')
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
}

export function decryptSecretKey(payload: string): Uint8Array {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.')
  if (!ivRaw || !tagRaw || !dataRaw) {
    throw new Error('Invalid encrypted treasury key payload.')
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, 'base64'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return Uint8Array.from(Buffer.from(decrypted, 'base64'))
}
