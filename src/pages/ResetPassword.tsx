/**
 * ResetPassword.tsx
 * Page where users arrive after clicking the password reset email link.
 *
 * Purpose:
 * - Recover/exchange the Supabase reset session.
 * - Let the user choose a new password.
 * - Update the authenticated user's password through Supabase Auth.
 * - Sign the user out after success and send them back to login.
 *
 * HashRouter note:
 * - The app uses /#/reset-password.
 * - This page includes extra URL parsing for recovery links where Supabase puts
 *   code/access_token parameters inside the hash route.
 */

import React, { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

type AuthUrlParams = {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  type: string | null
}

function readAuthParamsFromUrl(): AuthUrlParams {
  const searchParams = new URLSearchParams(window.location.search)

  let code = searchParams.get('code')
  let accessToken = searchParams.get('access_token')
  let refreshToken = searchParams.get('refresh_token')
  let type = searchParams.get('type')

  const rawHash = window.location.hash || ''
  const hashCandidates: string[] = []

  if (rawHash.startsWith('#')) {
    hashCandidates.push(rawHash.slice(1))
  }

  const questionIndex = rawHash.indexOf('?')
  if (questionIndex >= 0) {
    hashCandidates.push(rawHash.slice(questionIndex + 1))
  }

  const secondHashIndex = rawHash.indexOf('#', 1)
  if (secondHashIndex >= 0) {
    hashCandidates.push(rawHash.slice(secondHashIndex + 1))
  }

  hashCandidates.forEach(candidate => {
    const cleaned = candidate.startsWith('/') ? candidate.split('?')[1] || '' : candidate
    if (!cleaned) return

    const params = new URLSearchParams(cleaned)

    code = code || params.get('code')
    accessToken = accessToken || params.get('access_token')
    refreshToken = refreshToken || params.get('refresh_token')
    type = type || params.get('type')
  })

  return {
    code,
    accessToken,
    refreshToken,
    type,
  }
}

function cleanResetPasswordUrl(): void {
  window.history.replaceState({}, document.title, `${window.location.origin}/#/reset-password`)
}

/**
 * ResetPasswordPage
 * Renders a form to set a new password after email verification.
 */
export default function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')

  const [initializing, setInitializing] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function initializeRecoverySession(): Promise<void> {
      setInitializing(true)
      setErrorMessage(null)

      try {
        const params = readAuthParamsFromUrl()

        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code)

          if (error) {
            throw error
          }

          cleanResetPasswordUrl()
        } else if (params.accessToken && params.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          })

          if (error) {
            throw error
          }

          cleanResetPasswordUrl()
        }

        const { data, error } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!mounted) return

        setSessionReady(Boolean(data.session))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Password recovery session error:', err)

        if (!mounted) return

        setSessionReady(false)
        setStatus('error')
        setErrorMessage(t('reset.invalidLink'))
      } finally {
        if (mounted) {
          setInitializing(false)
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(Boolean(session))
      }
    })

    void initializeRecoverySession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [t])

  /**
   * handleSubmit
   * Validates input and calls Supabase to update the user's password.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!password || !confirmPassword) {
      setErrorMessage(t('reset.bothRequired'))
      setStatus('error')
      return
    }

    if (password.length < 8) {
      setErrorMessage(t('reset.minLength'))
      setStatus('error')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage(t('reset.mismatch'))
      setStatus('error')
      return
    }

    setStatus('submitting')
    setErrorMessage(null)

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!sessionData.session && !sessionReady) {
        throw new Error(t('reset.missingSession'))
      }

      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        throw error
      }

      setStatus('success')
      setPassword('')
      setConfirmPassword('')

      await supabase.auth.signOut()

      navigate('/login', {
        replace: true,
        state: {
          passwordResetSuccess: true,
        },
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Password update error:', err)

      setErrorMessage(t('reset.updateFailed'))
      setStatus('error')
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_31_42%20PM.png"
          alt=""
          className="object-cover w-full h-full"
          style={
            {
              opacity: 0.9,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
            } as React.CSSProperties
          }
        />

        <div
          className="absolute inset-0"
          style={
            {
              background:
                'linear-gradient(to bottom, rgba(30,58,138,0.30) 0%, rgba(30,58,138,0.20) 40%, rgba(8,18,36,0.45) 72%, rgba(8,18,36,0.88) 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
            } as React.CSSProperties
          }
        />
      </div>

      <div className="relative z-10 max-w-md w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('reset.title')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('reset.subtitle')}
          </p>

          {initializing && (
            <div className="mt-5 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {t('reset.verifying')}
            </div>
          )}

          {!initializing && !sessionReady && (
            <div className="mt-5 rounded border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              {t('reset.inactiveSession')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4" noValidate>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                {t('reset.newPassword')}
              </label>
              <input
                id="password"
                name="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 disabled:bg-gray-100"
                type="password"
                autoComplete="new-password"
                disabled={isSubmitting || initializing}
                placeholder={t('reset.newPasswordPlaceholder')}
              />
              <p className="mt-1 text-xs text-gray-500">
                {t('reset.passwordHelp')}
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                {t('reset.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 disabled:bg-gray-100"
                type="password"
                autoComplete="new-password"
                disabled={isSubmitting || initializing}
                placeholder={t('reset.confirmPlaceholder')}
              />
            </div>

            {status === 'error' && errorMessage && (
              <div
                className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
                aria-live="polite"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              className="bg-yellow-400 px-6 py-2 rounded-md font-semibold disabled:opacity-70"
              disabled={isSubmitting || initializing}
            >
              {isSubmitting ? t('reset.updating') : t('reset.update')}
            </button>

            <div className="flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-gray-600 hover:text-gray-900">
                {t('reset.requestNew')}
              </Link>

              <Link to="/login" className="text-gray-600 hover:text-gray-900">
                {t('reset.backToSignIn')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
