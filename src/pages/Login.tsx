/**
 * Login.tsx
 * Login page for existing managers with a full-bleed background image
 * that fades downward into dark blue.
 *
 * Purpose:
 * - Authenticate users with Supabase auth.signInWithPassword.
 * - After successful login, call rpc('get_my_club_id') to route to /create-club or /dashboard/overview.
 * - Show an inline error if the get_my_club_id RPC fails instead of misrouting.
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'

/**
 * LoginPage
 * Sign-in form connected to Supabase Auth.
 */
export default function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * handleChange
   * Update form state when inputs change.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm({ ...form, [e.target.name]: e.target.value })
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

    if (!form.email || !form.password) {
      setError('Please provide both email and password')
      return
    }

    setLoading(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password
      })

      if (signInError) {
        const msg = (signInError as any).message ?? 'Sign-in failed'
        setError(msg)
        return
      }

      // If no session is returned, likely email not confirmed
      if (!data?.session) {
        setInfo('Account exists but is not confirmed. Please check your email.')
        return
      }

      // Only route based on RPC result when RPC succeeds.
      const { data: clubData, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (rpcError) {
        setError(
          'You are signed in, but we could not check your club status. Please try again in a moment.'
        )
        return
      }

      if (!clubData) {
        navigate('/create-club')
      } else {
        navigate('/dashboard/overview')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

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
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)'
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
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)'
            } as React.CSSProperties
          }
        />
      </div>

      {/* Card sits above background */}
      <div className="relative z-10 max-w-md w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900">Sign in to ProPeloton Manager</h2>
          <p className="mt-2 text-sm text-gray-600">Enter your credentials to continue.</p>

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                type="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input
                name="password"
                value={form.password}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                type="password"
                disabled={loading}
              />
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {info && <div className="text-sm text-gray-700">{info}</div>}

            <div className="flex items-center gap-4 mt-4">
              <button
                type="submit"
                className="bg-yellow-400 px-6 py-2 rounded-md font-semibold disabled:opacity-70"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <Link to="/register" className="text-sm text-gray-600 hover:text-gray-900">
                Create account
              </Link>

              <Link to="/" className="ml-auto text-sm text-gray-600 hover:text-gray-900">
                Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}