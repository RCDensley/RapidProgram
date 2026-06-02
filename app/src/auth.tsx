import React, { useEffect, useState } from 'react'
import { Loader2, ShieldAlert, LogOut, Copy, Check } from 'lucide-react'

// Keep in sync with api/src/_lib/auth.ts on the server side.
// userDetails check is case-insensitive. Useful for stable GitHub logins.
const ALLOWLIST_USERNAMES = ['RCDensley', 'tonyhenderson766']
// userId check uses the SWA-stable identifier. Required when userDetails is
// returned censored by SWA (e.g. GitHub user has email set to private).
const ALLOWLIST_USER_IDS: string[] = []

interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

type State =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'denied'; principal: ClientPrincipal }

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
        const byName = ALLOWLIST_USERNAMES.some(u => u.toLowerCase() === userDetails)
        const byId   = ALLOWLIST_USER_IDS.includes(principal.userId)
        setState((byName || byId) ? { status: 'allowed' } : { status: 'denied', principal })
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
    return <DeniedScreen principal={state.principal} />
  }

  return <>{children}</>
}

function DeniedScreen({ principal }: { principal: ClientPrincipal }) {
  const [copied, setCopied] = useState(false)
  const diagnostic = `identityProvider: ${principal.identityProvider}\nuserId: ${principal.userId}\nuserDetails: ${principal.userDetails}`

  function copy() {
    navigator.clipboard.writeText(diagnostic).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 16, textAlign: 'center', padding: 32 }}>
      <ShieldAlert size={48} style={{ color: 'var(--red-bright, #f87171)' }} />
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>
          Access denied
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 460, lineHeight: 1.5 }}>
          You're signed in as <strong>{principal.userDetails}</strong>, but this account isn't authorised for the PM Tracker.
          Send the diagnostic details below to Chris (RCDensley) so he can add you.
        </div>
      </div>

      <div style={{
        background: 'var(--card, #0d1526)', border: '1px solid var(--border, #1e2d45)',
        borderRadius: 'var(--radius-sm, 6px)', padding: '12px 14px',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-2, #94a3b8)',
        textAlign: 'left', whiteSpace: 'pre', maxWidth: 460, width: '100%',
      }}>
        {diagnostic}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={copy} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <a href="/.auth/logout?post_logout_redirect_uri=/" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={13} /> Sign out
        </a>
      </div>
    </div>
  )
}
