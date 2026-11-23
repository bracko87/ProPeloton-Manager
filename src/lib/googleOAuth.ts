/**
 * Google OAuth returns to /create-club because that existing production
 * Supabase Auth redirect URL is also used by email confirmation. HashRouter
 * navigation happens only after Supabase has verified the returned session.
 *
 * Keep the intent only in tab-scoped sessionStorage; NEVER keep OAuth tokens,
 * user identities, provider credentials or refresh tokens here.
 */
export const GOOGLE_OAUTH_INTENT_KEY = 'ppm-google-oauth-intent-v1'
export type GoogleOAuthIntent = { kind: 'regular' } | { kind: 'guest_link'; userId: string }

export function googleOAuthRedirect(): string {
  return window.location.origin + '/create-club'
}

export function saveGoogleOAuthIntent(intent: GoogleOAuthIntent): boolean {
  try {
    window.sessionStorage.setItem(GOOGLE_OAUTH_INTENT_KEY, JSON.stringify({
      ...intent, startedAt: Date.now(),
    }))
    return true
  } catch { return false }
}

export function readGoogleOAuthIntent(): GoogleOAuthIntent | null {
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_OAUTH_INTENT_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    if (typeof v.startedAt !== 'number' ||
        Date.now() - v.startedAt < 0 ||
        Date.now() - v.startedAt > 10 * 60 * 1000) return null
    if (v.kind === 'regular') return { kind: 'regular' }
    if (v.kind === 'guest_link' &&
        typeof v.userId === 'string' &&
        /^[a-f0-9-]{36}$/i.test(v.userId)) return { kind: 'guest_link', userId: v.userId }
    return null
  } catch { return null }
}

export function clearGoogleOAuthIntent(): void {
  try { window.sessionStorage.removeItem(GOOGLE_OAUTH_INTENT_KEY) } catch { /* no storage */ }
}
