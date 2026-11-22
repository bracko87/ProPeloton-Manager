/** One Auth client per page. Guest mode uses the dedicated persisted storage;
 * regular players keep the original memory-only client. No token handoffs. */
import { supabase } from './supabase'
import { SATURN_GUEST_AUTH_MODE, SATURN_TEST_ACCOUNTS_ENABLED, guestSessionStorage, hasSavedGuestSession } from './guestSession'
export { SATURN_TEST_ACCOUNTS_ENABLED }
export const testClient = supabase

export async function restoreTestAccountIntoGame(): Promise<void> {
  if (!SATURN_GUEST_AUTH_MODE) return
  const { data: verified, error } = await supabase.auth.getUser()
  if (error || !verified.user || verified.user.is_anonymous) return
  const { data: term } = await supabase.from('saturn_test_accounts_v1')
    .select('user_id,converted_at').eq('user_id', verified.user.id).maybeSingle()
  if (term?.user_id === verified.user.id && term.converted_at) guestSessionStorage.finishConversion(verified.user.id)
}

export function finishTestSessionPersistence(userId: string): void {
  if (SATURN_GUEST_AUTH_MODE) guestSessionStorage.finishConversion(userId)
}

/** Leaving a trial is not a real logout: anonymous credentials cannot be recreated.
 * Regular or fully converted accounts still revoke their ordinary session. */
export async function leaveGameSession(): Promise<void> {
  if (SATURN_GUEST_AUTH_MODE) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user.is_anonymous || hasSavedGuestSession()) return
  }
  await supabase.auth.signOut()
}
