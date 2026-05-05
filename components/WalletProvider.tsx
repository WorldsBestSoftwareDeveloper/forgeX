'use client'

import type { ComponentType }             from 'react'
import { useMemo }                        from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider }            from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter }           from '@solana/wallet-adapter-phantom'
import { SOLANA_RPC }                     from '@/lib/config'
import '@solana/wallet-adapter-react-ui/styles.css'

const SafeConnectionProvider = ConnectionProvider as ComponentType<{
  endpoint: string
  children?: React.ReactNode
}>

const SafeWalletProvider = WalletProvider as ComponentType<{
  wallets: ReturnType<typeof useMemo>
  autoConnect?: boolean
  children?: React.ReactNode
}>

const SafeWalletModalProvider = WalletModalProvider as ComponentType<{
  children?: React.ReactNode
}>

export function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <SafeConnectionProvider endpoint={SOLANA_RPC}>
      <SafeWalletProvider wallets={wallets} autoConnect>
        <SafeWalletModalProvider>
          {children}
        </SafeWalletModalProvider>
      </SafeWalletProvider>
    </SafeConnectionProvider>
  )
}
