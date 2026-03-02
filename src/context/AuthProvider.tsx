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

  /**
   * refreshUser
   * Fetches the current logged-in user from Supabase and updates state.
   */
  async function refreshUser() {
    const { data } = await supabase.auth.getUser()
    setUser(data.user ?? null)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
      setLoading(false)
    })()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // session may be null when signed out, user inside session may be undefined
      setUser(session?.user ?? null)
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