import React from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import { hasSavedGuestSession } from '../../lib/guestSession'
import {
  clearGoogleOAuthIntent, googleOAuthRedirect, saveGoogleOAuthIntent,
} from '../../lib/googleOAuth'

/**
 * One Google entry point for both new and existing permanent managers.
 * Supabase uses the Google identity to sign in or register; the club is
 * discovered server-side on return, never created from an OAuth callback.
 *
 * If a guest session exists, do NOT call signInWithOAuth: that could replace
 * the guest identity and strand its club. Use linkIdentity in the protected
 * guest-conversion screen instead.
 */
export default function GoogleAuthEntry({ purpose }: { purpose: 'login' | 'register' }): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const { user, loading: authLoading } = useAuth()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  async function start(): Promise<void> {
    if (busy || authLoading) return
    setError('')
    setBusy(true)
    try {
      const { data, error: sessionError } = await supabase.auth.getUser()
      if (sessionError && !/session missing|auth session missing/i.test(sessionError.message)) {
        setError(t('google.sessionError'))
        return
      }
      const current = data.user ?? user
      if (hasSavedGuestSession()) {
        // A user may have reached the ordinary sign-in page using
        // ?saturn_regular=1. Its in-memory Auth client does NOT load the
        // saved anonymous session. Switch to guest mode before linking so
        // that the original UUID/team cannot be silently abandoned.
        const destination = new URL(window.location.href)
        destination.searchParams.delete('saturn_regular')
        destination.searchParams.set('saturn_guest', '1')
        destination.hash = '#/test-account-register'
        window.location.replace(destination.toString())
        return
      }
      if (current?.is_anonymous === true) {
        navigate('/test-account-register')
        return
      }
      if (current && current.is_anonymous === false) {
        navigate('/dashboard/overview')
        return
      }
      if (!saveGoogleOAuthIntent({ kind: 'regular' })) {
        setError(t('google.storageRequired'))
        return
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: googleOAuthRedirect() },
      })
      if (oauthError) {
        clearGoogleOAuthIntent()
        setError(t('google.providerError'))
      }
    } catch {
      clearGoogleOAuthIntent()
      setError(t('google.providerError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 space-y-2 border-t border-slate-200 pt-5">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy || authLoading}
        className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-yellow-500 hover:bg-yellow-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-white text-lg font-bold text-blue-700">G</span>
        {t(purpose === 'register' ? 'google.createOrSignIn' : 'google.continue')}
      </button>
      <p className="text-center text-xs leading-5 text-slate-600">{t('google.existingTeamReminder')}</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  )
}
