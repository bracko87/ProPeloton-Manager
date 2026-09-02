/**
 * src/context/AuthProvider.tsx
 * Provides in-memory auth state for the app using Supabase auth.
 *
 * Purpose:
 * - Track the current authenticated user in memory (no local/session storage).
 * - Subscribe to Supabase auth state changes and update context.
 * - Expose helper methods (refreshUser) used by route guards and pages.
 * - Record the canonical authenticated-user activity heartbeat used by inactivity
 *   handling and the two-stage referral program.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { changeApplicationLanguage, getApplicationLanguage } from '../i18n'
import { isSupportedLanguage } from '../i18n/languages'

const LANGUAGE_HANDOFF_KEY = 'ppm_language_handoff'

interface AuthContextValue {
  user: any | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => {}
})

interface AuthProviderProps {
  children: ReactNode
}

function getPendingLanguageHandoff(): string | null {
  if (typeof window === 'undefined') return null

  const language = window.sessionStorage.getItem(LANGUAGE_HANDOFF_KEY)
  return isSupportedLanguage(language) ? language : null
}

function clearPendingLanguageHandoff(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(LANGUAGE_HANDOFF_KEY)
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  async function applyPreferredLanguage(userId: string | null | undefined) {
    if (!userId) return

    /*
     * If the player explicitly chose a language on the public/login surface,
     * that choice wins for this sign-in. Save it to the authenticated profile
     * before consulting the account's older preference, otherwise the auth
     * callback can visibly switch the freshly selected language back.
     */
    const handoffLanguage = getPendingLanguageHandoff()
    if (handoffLanguage) {
      if (handoffLanguage !== getApplicationLanguage()) {
        await changeApplicationLanguage(handoffLanguage)
      }

      const { error: handoffError } = await supabase
        .from('profiles')
        .update({ preferred_language: handoffLanguage })
        .eq('id', userId)

      if (handoffError) {
        // Keep the marker so a later auth refresh can retry the account sync.
        // eslint-disable-next-line no-console
        console.warn('Could not save selected login language:', handoffError.message)
        return
      }

      clearPendingLanguageHandoff()
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      // Language preference is non-blocking for authentication.
      // eslint-disable-next-line no-console
      console.warn('Could not load preferred language:', error.message)
      return
    }

    const preferredLanguage = data?.preferred_language
    if (
      isSupportedLanguage(preferredLanguage) &&
      preferredLanguage !== getApplicationLanguage()
    ) {
      await changeApplicationLanguage(preferredLanguage)
    }
  }

  /**
   * Activity is intentionally non-blocking. The backend de-duplicates referral
   * activity to one UTC calendar day, so repeated session events are harmless.
   */
  async function recordUserActivity(userId: string | null | undefined) {
    if (!userId) return

    const { error } = await supabase.rpc('mark_user_activity_v1', {
      p_user_id: userId
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not record user activity:', error.message)
    }
  }

  async function refreshUser() {
    const { data } = await supabase.auth.getUser()
    setUser(data.user ?? null)
    await applyPreferredLanguage(data.user?.id)
    await recordUserActivity(data.user?.id)
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return

      setUser(data.user ?? null)
      await applyPreferredLanguage(data.user?.id)
      await recordUserActivity(data.user?.id)

      if (!mounted) return
      setLoading(false)
    })()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      void applyPreferredLanguage(sessionUser?.id)
      void recordUserActivity(sessionUser?.id)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
