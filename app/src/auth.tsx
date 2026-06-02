import React, { useEffect, useState } from 'react'
import { Loader2, ShieldAlert, LogOut } from 'lucide-react'

// Keep in sync with api/src/_lib/auth.ts on the server side.
const ALLOWLIST = ['RCDensley', 'tonyhenderson766']

interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

type State =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'denied'; user: string }

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    fetch('/.auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const principal: ClientPrincipal | null = j?.clientPrincipal ?? null
        // No principal returned — running in local dev without SWA Easy Auth.
        // Server still enforces via missing WEBSITE_INSTANCE_ID; allow client through.
        if (!principal) { setState({ status: 'allowed' }); return }
        const userDetails = (principal.userDetails ?? '').toLowerCase()
        const allowed = ALLOWLIST.some(u => u.toLowerCase() === userDetails)
        setState(allowed ? { status: 'allowed' } : { status: 'denied', user: principal.userDetails })
      })
      .catch(() => {
        // Network failure — let through; the server-side check is the real boundary.
        setState({ status: 'allowed' })
      })
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="loading-screen">
        <Loader2 size={28} className="animate-spin text-sky-400" />
        <span>Checking access…</span>
      </div>
    )
  }

  if (state.status === 'denied') {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: 16, textAlign: 'center', padding: 32 }}>
        <ShieldAlert size={48} style={{ color: 'var(--red-bright, #f87171)' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>
            Access denied
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 420, lineHeight: 1.5 }}>
            You're signed in as <strong>{state.user}</strong>, but this GitHub account isn't authorised for the PM Tracker.
            Ask Chris (RCDensley) to add you.
          </div>
        </div>
        <a href="/.auth/logout?post_logout_redirect_uri=/" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={13} /> Sign out
        </a>
      </div>
    )
  }

  return <>{children}</>
}
