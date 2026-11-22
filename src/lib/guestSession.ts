import { GUEST_SESSION_KEY, parseStoredSession, createGuestSessionStorage, shouldUseGuestAuth } from './guestSessionStorage.mjs'

export const SATURN_TEST_ACCOUNTS_ENABLED = import.meta.env.VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'
function browserStorage(): Storage | null { try { return window.localStorage } catch { return null } }
export function hasSavedGuestSession(): boolean {
  try { return Boolean(parseStoredSession(browserStorage()?.getItem(GUEST_SESSION_KEY))) } catch { return false }
}
export const guestSessionStorage = createGuestSessionStorage(browserStorage())
export const SATURN_GUEST_AUTH_MODE = typeof window !== 'undefined' && shouldUseGuestAuth(window.location.href, hasSavedGuestSession(), SATURN_TEST_ACCOUNTS_ENABLED)

export function canPersistGuestSession(): boolean {
  const storage = browserStorage()
  if (!storage) return false
  const key = GUEST_SESSION_KEY + '-storage-check'
  try { storage.setItem(key, '1'); storage.removeItem(key); return true } catch { return false }
}

/** A hard navigation selects the correct single Auth client before React boots. */
export function openGuestAuth(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('saturn_regular')
  url.searchParams.set('saturn_guest', '1')
  window.location.replace(url.toString())
}
export function openRegularAuth(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('saturn_guest')
  url.searchParams.delete('saturn_google_link')
  url.searchParams.set('saturn_regular', '1')
  window.location.replace(url.toString())
}
export { GUEST_SESSION_KEY }
