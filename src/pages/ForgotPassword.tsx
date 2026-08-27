/**
 * ForgotPassword.tsx
 * Password reset request page for users who forgot their credentials.
 *
 * Purpose:
 * - Collect a user's email address.
 * - Call Supabase Auth to send a password reset link.
 * - Use a neutral success message so we do not reveal whether an email exists.
 * - Use HashRouter-safe redirect URL: /#/reset-password.
 */

import React, { FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * The app uses HashRouter, so the reset page must be opened as:
 * https://domain.com/#/reset-password
 */
function getPasswordResetRedirectUrl(): string {
  return `${window.location.origin}/#/reset-password`
}

/**
 * ForgotPasswordPage
 * Renders a secure password reset request form.
 */
export default function ForgotPasswordPage(): JSX.Element {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /**
   * handleSubmit
   * Sends password reset instructions through Supabase Auth.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const nextEmail = email.trim()

    if (!nextEmail) {
      setErrorMessage(t('forgot.emailRequired'))
      setStatus('error')
      return
    }

    if (!isProbablyValidEmail(nextEmail)) {
      setErrorMessage(t('forgot.validEmail'))
      setStatus('error')
      return
    }

    setStatus('submitting')
    setErrorMessage(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(nextEmail, {
        redirectTo: getPasswordResetRedirectUrl(),
      })

      /**
       * Security rule:
       * Do not reveal whether this email exists.
       * Even if Supabase returns an auth-level error, show the same neutral message.
       */
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Password reset request error:', error)
      }

      setStatus('sent')
    } catch (err) {
      // Network or unexpected client-side failure.
      // eslint-disable-next-line no-console
      console.error('Password reset network error:', err)

      setErrorMessage(t('forgot.networkError'))
      setStatus('error')
    }
  }

  const isSubmitting = status === 'submitting'

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
          <h1 className="text-2xl font-bold text-gray-900">{t('forgot.title')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('forgot.subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4" noValidate>
            <div>
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <input
                id="email"
                name="email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value)
                  if (status === 'error') {
                    setStatus('idle')
                    setErrorMessage(null)
                  }
                }}
                className="mt-1 block w-full border rounded-md px-3 py-2 disabled:bg-gray-100"
                type="email"
                autoComplete="email"
                placeholder={t('register.emailPlaceholder')}
                disabled={isSubmitting}
              />
            </div>

            {status === 'sent' && (
              <div
                className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                role="status"
                aria-live="polite"
              >
                {t('forgot.sent')}
              </div>
            )}

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
              disabled={isSubmitting}
            >
              {isSubmitting ? t('forgot.sending') : t('forgot.send')}
            </button>

            <div className="flex items-center justify-between text-sm">
              <Link to="/login" className="text-gray-600 hover:text-gray-900">
                {t('forgot.backToSignIn')}
              </Link>

              <Link to="/" className="text-gray-600 hover:text-gray-900">
                {t('home')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
