/**
 * Ordinary login remains memory-only, including Google sessions.
 * OAuth PKCE has to survive a full-page redirect; persist ONLY the
 * short-lived code verifier in tab-scoped sessionStorage, never the session,
 * access token or refresh token. Guests use their separate protected storage.
 */
const pending = new Map<string, string>()

function verifierKey(key: string): boolean {
  return key.endsWith('-code-verifier')
}

function verifierStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

export const regularAuthStorage = {
  getItem(key: string): string | null {
    if (verifierKey(key)) {
      try { return verifierStorage()?.getItem(key) ?? pending.get(key) ?? null } catch { /* use memory */ }
    }
    return pending.get(key) ?? null
  },
  setItem(key: string, value: string): void {
    pending.set(key, value)
    if (verifierKey(key)) {
      try { verifierStorage()?.setItem(key, value) } catch { /* still memory-only */ }
    }
  },
  removeItem(key: string): void {
    pending.delete(key)
    if (verifierKey(key)) {
      try { verifierStorage()?.removeItem(key) } catch { /* no persistent verifier */ }
    }
  },
}
