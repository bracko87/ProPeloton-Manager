/**
 * Supabase's signup emailRedirectTo is an ordinary pathname (/create-club).
 * This application uses HashRouter, so that pathname alone loads the root
 * route after confirmation. Reconcile the confirmed Auth session and move to
 * the actual hash route without changing the production Auth allowlist.
 *
 * Conversion callbacks use separate tagged URLs; never handle them here.
 */
import React from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'

export default function SignupEmailCallbackRouting(): JSX.Element | null {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, '') !== '/create-club') return
    if (loading) return

    // Confirmation from another browser may not restore a session. Let the
    // player sign in normally; never create a new account or club here.
    if (!user || user.is_anonymous === true || !user.email_confirmed_at) {
      navigate('/login', { replace: true })
      return
    }

    let active = true
    void (async () => {
      const { data, error: clubError } = await supabase.rpc('get_my_club_id')
      if (!active) return
      if (clubError) {
        // Do not guess whether the user already has a club on an RPC error.
        setError(true)
        return
      }
      navigate(data ? '/dashboard/overview' : '/create-club', { replace: true })
    })()

    return () => { active = false }
  }, [loading, user?.id, user?.is_anonymous, user?.email_confirmed_at, navigate])

  if (!error || window.location.pathname.replace(/\/+$/, '') !== '/create-club') return null

  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-[200] mx-auto max-w-lg rounded-lg border border-amber-300 bg-white p-4 text-sm text-slate-900 shadow-lg">
      Your email is confirmed, but we could not check your team status.
      Please reload the page or contact support before creating another team.
    </div>
  )
}
