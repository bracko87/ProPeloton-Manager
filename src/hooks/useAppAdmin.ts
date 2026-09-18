import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

export function useAppAdmin() {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    async function checkAdmin() {
      if (authLoading) return

      if (!user?.id) {
        if (alive) {
          setIsAdmin(false)
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        const { data, error } = await supabase.rpc('is_app_admin_v1')

        if (error) throw error
        if (!alive) return

        setIsAdmin(data === true)
      } catch (error) {
        if (!alive) return
        console.warn('Could not verify administrator access:', error)
        setIsAdmin(false)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void checkAdmin()

    return () => {
      alive = false
    }
  }, [authLoading, user?.id])

  return {
    isAdmin,
    loading: authLoading || loading,
  }
}
