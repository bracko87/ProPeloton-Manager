/**
 * Saturn-only guest Auth client.
 *
 * Uses a distinct storage key and persistent Auth session so an anonymous
 * guest can resume in the same browser after reload. The registered-player
 * application client remains nonpersistent and uses independent Auth state.
 *
 * This file does not enable anonymous sign-in or change the server gate.
 * Never share this client with official club/economy pages.
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

export const SATURN_GUEST_STORAGE_KEY = 'ppm-saturn-guest-auth-v1'

export const guestSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: SATURN_GUEST_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
