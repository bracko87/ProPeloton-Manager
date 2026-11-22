/**
 * Login.tsx
 * Login page for existing managers with a full-bleed background image
 * that fades downward into dark blue.
 *
 * Purpose:
 * - Authenticate users with Supabase auth.signInWithPassword.
 * - After successful login, call rpc('get_my_club_id') to route to /create-club or /dashboard/overview.
 * - Show an inline error if the get_my_club_id RPC fails instead of misrouting.
 * - Provide a Forgot password link connected to the password reset flow.
 */

import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { SATURN_TEST_ACCOUNTS_ENABLED } from '../lib/guestSession'
import { useAuthCaptcha, AuthCaptcha } from '../components/auth/AuthCaptcha'
import PreReleaseNotice, { PROPELOTON_OFFICIAL_LAUNCH_AT_UTC } from '../components/PreReleaseNotice'

type LoginLocationState = {
  passwordResetSuccess?: boolean
} | null

/**
 * LoginPage
 * Sign-in form connected to Supabase Auth.
 */
export default function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('auth')

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useAuthCaptcha()

  useEffect(() => {
    const state = location.state as LoginLocationState

    if (state?.passwordResetSuccess) {
      setInfo(t('info.passwordResetSuccess'))
    }
  }, [location.state, t])

  /**
   * handleChange
   * Update form state when inputs change.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const { name, value } = e.target

    setForm(prev => ({
      ...prev,
      [name]: value,
    }))

    if (error) setError(null)
  }

  /**
   * handleSubmit
   * Validates and calls Supabase auth.signInWithPassword, then routes using get_my_club_id.
   * On RPC failure, shows an error instead of redirecting blindly.
   */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const email = form.email.trim()
    const password = form.password

    if (!email || !password) {
      setError(t('errors.missingCredentials'))
      return
    }

    if (loading || !captcha.ready) return
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: captcha.consume() },
      })

      if (signInError) {
        const msg = (signInError as any).message ?? t('errors.signInFailed')
        setError(msg)
        return
      }

      // If no session is returned, likely email not confirmed.
      if (!data?.session) {
        setInfo(t('info.accountUnconfirmed'))
        return
      }

      // Only route based on RPC result when RPC succeeds.
      const { data: clubData, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (rpcError) {
        setError(t('errors.clubStatus'))
        return
      }

      if (!clubData) {
        navigate('/create-club')
      } else {
        navigate('/dashboard/overview')
      }
    } catch (err: any) {
      setError(err?.message ?? t('errors.signInFailed'))
    } finally {
      captcha.reset()
      setLoading(false)
    }
  }

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/New%20image%20sign%20up.png"
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

        {/* Blue tint over image, fading into dark blue at the bottom */}
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

      {/* Card sits above background */}
      <div className="relative z-10 max-w-md w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {t('signInTitle')}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {t('signInSubtitle')}
          </p>


          {Date.now() < Date.parse(PROPELOTON_OFFICIAL_LAUNCH_AT_UTC) ? (
            <div className="mt-5"><PreReleaseNotice /></div>
          ) : null}

          {SATURN_TEST_ACCOUNTS_ENABLED && <Link to="/test-the-game?resume=1" className="mt-5 block rounded-md border border-red-600 px-4 py-3 text-center font-semibold text-red-700 hover:bg-red-50">Continue Test Game</Link>}
          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t('email')}
              </label>

              <input
                id="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2 disabled:bg-gray-100"
                type="email"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-gray-700"
                >
                  {t('password')}
                </label>

                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  {t('forgotPassword')}
                </Link>
              </div>

              <input
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2 disabled:bg-gray-100"
                type="password"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <AuthCaptcha captcha={captcha} />
            {error && <div className="text-sm text-red-600">{error}</div>}
            {info && <div className="text-sm text-gray-700">{info}</div>}

            <div className="flex items-center gap-4 mt-4">
              <button
                type="submit"
                className="bg-yellow-400 px-6 py-2 rounded-md font-semibold disabled:opacity-70"
                disabled={loading || !captcha.ready}
              >
                {loading ? t('signingIn') : t('signIn')}
              </button>

              <Link
                to="/register"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {t('createAccount')}
              </Link>

              <Link
                to="/"
                className="ml-auto text-sm text-gray-600 hover:text-gray-900"
              >
                {t('home')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
