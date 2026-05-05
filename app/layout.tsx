import type { Metadata } from 'next'
import './globals.css'
import { WalletProviderWrapper } from '@/components/WalletProvider'
import { AuthProvider }           from '@/lib/AuthContext'

export const metadata: Metadata = {
  title:       'Forge — Private AI Agent Payments on Solana',
  description: 'Autonomous AI agents that discover services and make private micropayments via MagicBlock Ephemeral Rollup on Solana',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <WalletProviderWrapper>
          <AuthProvider>
            {children}
          </AuthProvider>
        </WalletProviderWrapper>
      </body>
    </html>
  )
}
