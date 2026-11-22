/** Persistent browser credential for the temporary team, never a recovery code. */
export const GUEST_SESSION_KEY = 'ppm-saturn-fullgame-test-session-v1'

export function parseStoredSession(raw) {
  try {
    const session = JSON.parse(raw || 'null')
    return session?.user?.id && session.access_token && session.refresh_token ? session : null
  } catch { return null }
}

/** Only this dedicated client uses disk. Converted sessions switch to RAM. */
export function createGuestSessionStorage(disk) {
  const memory = new Map()
  let memoryOnly = false
  const readDisk = key => { try { return disk?.getItem(key) ?? null } catch { return null } }
  const removeDisk = key => { try { disk?.removeItem(key) } catch {} }
  return {
    getItem(key) {
      if (memoryOnly) return memory.get(key) ?? null
      return readDisk(key) ?? memory.get(key) ?? null
    },
    setItem(key, value) {
      if (key === GUEST_SESSION_KEY && !memoryOnly) {
        const stored = parseStoredSession(readDisk(key) ?? memory.get(key))
        const next = parseStoredSession(value)
        // A verified email/Google link may change the anonymous claim before
        // conversion is finalized. Retain ONLY that same original identity.
        if (!next || (!next.user.is_anonymous && stored?.user.id !== next.user.id)) {
          memoryOnly = true
        }
      }
      memory.set(key, value)
      if (!memoryOnly) { try { disk?.setItem(key, value) } catch {} }
    },
    removeItem(key) {
      memory.delete(key)
      if (!memoryOnly) removeDisk(key)
    },
    finishConversion(userId) {
      if (memoryOnly) return
      const stored = readDisk(GUEST_SESSION_KEY) ?? memory.get(GUEST_SESSION_KEY)
      const session = parseStoredSession(stored)
      if (!session || session.user.id !== userId) return
      if (stored) memory.set(GUEST_SESSION_KEY, stored)
      memoryOnly = true
      removeDisk(GUEST_SESSION_KEY)
      removeDisk(GUEST_SESSION_KEY + '-code-verifier')
    },
  }
}

export function shouldUseGuestAuth(href, hasSavedSession, enabled) {
  if (!enabled) return false
  const url = new URL(href)
  if (url.searchParams.has('saturn_regular')) return false
  return url.searchParams.has('saturn_guest') ||
    url.searchParams.has('saturn_google_link') ||
    /^#\/(test-the-game|test-account-register)(\?|$)/.test(url.hash) ||
    hasSavedSession
}
