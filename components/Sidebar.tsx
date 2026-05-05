'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/wallet',    label: 'Wallet',    icon: '◈' },
]

export function Sidebar() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard' || pathname.startsWith('/agent')
      : pathname.startsWith(href)

  return (
    <>
      {/* Desktop */}
      <aside className="forge-sidebar lg-sidebar" style={{
        position: 'fixed', left: 0, top: 60, bottom: 0, width: 220,
        padding: '20px 12px', flexDirection: 'column', gap: 3,
        zIndex: 50, overflowY: 'auto',
      }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', padding: '0 12px', marginBottom: 8, marginTop: 4 }}>
          Navigation
        </div>
        {NAV.map(item => (
          <Link key={item.label} href={item.href} className={`lg-nav-item ${isActive(item.href) ? 'active' : ''}`}>
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div style={{ flex: 1 }} />

        {/* Network status card */}
        <div className="lg-card" style={{ margin: '12px 4px', padding: '12px 14px', borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: '#818CF8', fontWeight: 700, marginBottom: 4 }}>Solana Devnet</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>MagicBlock TEE · Private ER</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px rgba(52,211,153,0.7)' }} />
            <span style={{ fontSize: 10, color: '#34D399' }}>Connected</span>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="forge-bottom-nav">
        {NAV.map(item => (
          <Link key={item.label} href={item.href} className={`forge-bottom-nav-item ${isActive(item.href) ? 'active' : ''}`}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
