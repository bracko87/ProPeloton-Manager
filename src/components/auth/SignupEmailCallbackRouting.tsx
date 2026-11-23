/**
 * Supabase's signup emailRedirectTo is an ordinary pathname (/create-club).
 * This application uses HashRouter, so that pathname alone loads the root
 * route after confirmation. Reconcile the confirmed Auth session and move to
 * the actual hash route without changing the production Auth allowlist.
 *
 * Google OAuth returns through this same known-allowlisted /create-club
 * callback. For a guest link we verify the ORIGINAL UUID and route to the
 * in-place conversion finalizer; for regular Google sign-in we lookup the
 * existing manager club, never create a duplicate one.
 */
import React from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import { clearGoogleOAuthIntent, readGoogleOAuthIntent } from '../../lib/googleOAuth'

export default function SignupEmailCallbackRouting(): JSX.Element | null {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = React.useState(false)

  // The OAuth/email callback is a *pathname* but game navigation uses hashes.
  // If it remains /create-club, this callback effect can run again when the
  // router navigates and bounce every side-menu click back to Overview.
  // Change only browser history (NO hard reload: normal login is memory-only)
  // once a verified user/club route is known, then navigate via HashRouter.
  const normalizeVerifiedCallbackPath = () => {
    if (window.location.pathname.replace(/\\/+$/, '') !== '/create-club') return
    window.history.replaceState(
      window.history.state,
      '',
      window.location.origin + '/' + window.location.hash,
    )
  }

  React.useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, '') !== '/create-club') return
    if (loading) return

    const googleIntent = readGoogleOAuthIntent()
    if (googleIntent?.kind === 'guest_link') {
      // Supabase must link Google to the SAME original guest UUID. Never let
      // an OAuth return switch identities or create a second team.
      if (!user || user.id !== googleIntent.userId ||
          !user.identities?.some(identity => identity.provider === 'google')) {
        setError(true)
        return
      }
      normalizeVerifiedCallbackPath()
      navigate('/test-account-register', { replace: true })
      return
    }

    // If the browser kept a matching unfinished guest-conversion marker but
    // its short-lived OAuth intent expired, still route the SAME verified
    // Google-linked UUID to the protected conversion screen. Never silently
    // treat a half-converted guest as an ordinary new manager.
    if (!googleIntent && user?.is_anonymous === false &&
        user.identities?.some(identity => identity.provider === 'google')) {
      let originalGuestId: string | null = null
      try { originalGuestId = window.localStorage.getItem('saturn-fullgame-conversion-uuid') }
      catch { /* restricted browser storage */ }
      if (originalGuestId && originalGuestId === user.id) {
        normalizeVerifiedCallbackPath()
      navigate('/test-account-register', { replace: true })
        return
      }
    }

    // Email verification and permanent Google sign-in return through the
    // existing /create-club allowlisted URL. Supabase validates the session
    // before any team route is selected.
    if (!user || user.is_anonymous === true || !user.email_confirmed_at) {
      if (googleIntent?.kind === 'regular') {
        setError(true)
      } else {
        navigate('/login', { replace: true })
      }
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
      if (googleIntent?.kind === 'regular') clearGoogleOAuthIntent()
      setError(false)
      normalizeVerifiedCallbackPath()
      navigate(data ? '/dashboard/overview' : '/create-club', { replace: true })
    })()

    return () => { active = false }
  }, [loading, user?.id, user?.is_anonymous, user?.email_confirmed_at, navigate])

  if (!error || window.location.pathname.replace(/\/+$/, '') !== '/create-club') return null

  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-[200] mx-auto max-w-lg rounded-lg border border-amber-300 bg-white p-4 text-sm text-slate-900 shadow-lg">
      Authentication returned, but we could not safely verify your manager
      identity or team status. Your existing team has not been changed.
      Return to the same browser session and retry, or contact support
      before creating another team.
      <div className="mt-3 flex flex-wrap gap-3">
        <Link to="/login" className="rounded-lg bg-yellow-400 px-3 py-2 font-semibold text-slate-950">Return to sign in</Link>
        <Link to="/test-account-register" className="rounded-lg border border-slate-300 px-3 py-2">Recover my guest team</Link>
      </div>
    </div>
  )
}
