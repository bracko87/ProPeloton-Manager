/**
 * src/context/AuthProvider.tsx
 * Provides in-memory auth state for the app using Supabase auth.
 *
 * Purpose:
 * - Track the current authenticated user in memory (no local/session storage).
 * - Subscribe to Supabase auth state changes and update context.
 * - Expose helper methods (refreshUser) used by route guards and pages.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { changeApplicationLanguage, getApplicationLanguage } from '../i18n'
import { isSupportedLanguage } from '../i18n/languages'

/**
 * AuthContextValue
 * Context interface providing user and helpers.
 */
interface AuthContextValue {
  user: any | null
  loading: boolean
  refreshUser: () => Promise<void>
}

/**
 * Create context with defaults.
 */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => {}
})

/**
 * AuthProviderProps
 */
interface AuthProviderProps {
  children: ReactNode
}

/**
 * AuthProvider
 * Wraps the app and provides current Supabase user in memory.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  async function applyPreferredLanguage(userId: string | null | undefined) {
    if (!userId) return

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
   * refreshUser
   * Fetches the current logged-in user from Supabase and updates state.
   */
  async function refreshUser() {
    const { data } = await supabase.auth.getUser()
    setUser(data.user ?? null)
    await applyPreferredLanguage(data.user?.id)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
      await applyPreferredLanguage(data.user?.id)
      if (!mounted) return
      setLoading(false)
    })()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // session may be null when signed out, user inside session may be undefined
      setUser(session?.user ?? null)
      void applyPreferredLanguage(session?.user?.id)
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

/**
 * useAuth
 * Hook to access auth context.
 */
export function useAuth() {
  return useContext(AuthContext)
}