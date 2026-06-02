import { HttpRequest } from '@azure/functions'

// Keep in sync with app/src/auth.tsx on the client side.
// userDetails check is case-insensitive. Useful for stable GitHub logins.
const ALLOWLIST_USERNAMES = ['RCDensley', 'tonyhenderson766']
// userId check uses the SWA-stable identifier. Required when userDetails is
// returned censored by SWA (e.g. GitHub user has email set to private).
const ALLOWLIST_USER_IDS: string[] = []

export interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

function parsePrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get('x-ms-client-principal')
  if (!header) return null
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as ClientPrincipal
  } catch {
    return null
  }
}

// Returns true if the request is from an allowlisted user OR running in local dev
// (where the SWA Easy Auth header is absent). In production on Azure SWA, the
// header is always injected for authenticated requests.
export function isAllowedUser(req: HttpRequest): boolean {
  const principal = parsePrincipal(req)
  if (!principal) {
    // No SWA header — local dev. WEBSITE_INSTANCE_ID is set in Azure but not locally.
    return !process.env.WEBSITE_INSTANCE_ID
  }
  const userDetails = (principal.userDetails ?? '').toLowerCase()
  const byName = ALLOWLIST_USERNAMES.some(u => u.toLowerCase() === userDetails)
  const byId   = ALLOWLIST_USER_IDS.includes(principal.userId)
  return byName || byId
}
