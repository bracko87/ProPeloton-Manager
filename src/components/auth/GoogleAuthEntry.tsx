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
        destination.pathname = '/'
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
        <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.28 5.48-4.83 7.18l7.73 6C44.35 38.03 46.98 31.88 46.98 24.55z" />
          <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.92 23.92 0 0 0 0 24c0 3.87.93 7.51 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {t(purpose === 'register' ? 'google.createOrSignIn' : 'google.continue')}
      </button>
      <p className="text-center text-xs leading-5 text-slate-600">{t('google.existingTeamReminder')}</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  )
}
