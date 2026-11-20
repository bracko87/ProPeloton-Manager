/**
 * SAT-01 scoped persistent Supabase session for full-game test accounts.
 * Never enabled unless VITE_SATURN_TEST_ACCOUNTS_ENABLED is explicitly true.
 * The regular player client is unaffected while the rollout flag is false.
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase'

export const SATURN_TEST_ACCOUNTS_ENABLED =
  import.meta.env.VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'

export const testClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'ppm-saturn-fullgame-test-session-v1',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export async function restoreTestAccountIntoGame(): Promise<void> {
  if (!SATURN_TEST_ACCOUNTS_ENABLED) return
  const { data: current } = await supabase.auth.getUser()
  if (current.user) return

  const { data: testUser, error: testError } = await testClient.auth.getUser()
  if (testError || !testUser.user) return

  const { data: term, error: termError } = await testClient
    .from('saturn_test_accounts_v1')
    .select('user_id')
    .eq('user_id', testUser.user.id)
    .maybeSingle()

  if (termError || term?.user_id !== testUser.user.id) return
  const { data: persisted } = await testClient.auth.getSession()
  if (!persisted.session) return
  await supabase.auth.setSession({
    access_token: persisted.session.access_token,
    refresh_token: persisted.session.refresh_token,
  })
}
