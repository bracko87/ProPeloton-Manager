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
      setErrorMessage('Please enter your email address.')
      setStatus('error')
      return
    }

    if (!isProbablyValidEmail(nextEmail)) {
      setErrorMessage('Please enter a valid email address.')
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

      setErrorMessage('We could not reach the server. Please check your connection and try again.')
      setStatus('error')
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_31_42%20PM.png"
          alt="background"
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
          <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter your account email and we will send instructions to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4" noValidate>
            <div>
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
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
                placeholder="you@example.com"
                disabled={isSubmitting}
              />
            </div>

            {status === 'sent' && (
              <div
                className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                role="status"
                aria-live="polite"
              >
                If an account exists for this email, we have sent password reset instructions.
                Please check your inbox and spam folder.
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
              {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
            </button>

            <div className="flex items-center justify-between text-sm">
              <Link to="/login" className="text-gray-600 hover:text-gray-900">
                Back to sign in
              </Link>

              <Link to="/" className="text-gray-600 hover:text-gray-900">
                Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}