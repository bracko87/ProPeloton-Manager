/**
 * Register.tsx
 * Registration page for new managers with a full-bleed background image
 * that fades downward into dark blue.
 *
 * Purpose:
 * - Collect username, email, and password.
 * - Call Supabase auth.signUp with username in metadata so backend triggers
 *   can create a matching public.profiles row.
 * - Handle flows with and without email confirmation.
 * - After sign-up with active session, call get_my_club_id and route accordingly.
 *   On RPC failure, show an error message instead of misrouting.
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'

type StatusType = 'success' | 'error' | 'info' | null

/**
 * RegisterPage
 * Registration form connected to Supabase Auth.
 */
export default function RegisterPage(): JSX.Element {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<StatusType>(null)

  /**
   * handleChange
   * Controlled form updates.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  /**
   * handleSubmit
   * Validates input, calls Supabase auth.signUp, then:
   * - If email confirmation is required: show confirmation message.
   * - If a session is returned: call rpc('get_my_club_id') and route accordingly.
   *   On RPC failure, show an error instead of redirecting.
   */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setMessage(null)
    setMessageType(null)

    const nextErrors: Record<string, string> = {}
    if (!form.username) nextErrors.username = 'Username required'
    if (!form.email) nextErrors.email = 'Email required'
    if (!form.password || form.password.length < 8) {
      nextErrors.password = 'Password must be 8+ chars'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          // Send users to the production create-club flow after email confirmation.
          // Replace this domain if you deploy under a different production URL.
          emailRedirectTo: 'https://propelotonmanager.com/create-club',
          data: {
            username: form.username
          }
        }
      })

      if (error) {
        const msg = (error as any).message ?? 'Signup failed'

        if (/already registered|duplicate|exists/i.test(msg)) {
          setErrors(prev => ({ ...prev, email: 'Email is already registered' }))
        } else if (/username/i.test(msg)) {
          setErrors(prev => ({ ...prev, username: 'Username is already taken' }))
        } else {
          setMessage(msg)
          setMessageType('error')
        }
        return
      }

      // If no active session is returned, assume email confirmation is required.
      if (!data?.session) {
        setMessage('Account created. Please confirm your email before signing in.')
        setMessageType('success')
        return
      }

      // Session exists: check for existing club via RPC.
      const { data: clubData, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (rpcError) {
        setMessage(
          'Your account was created and you are signed in, but we could not check your club status. Please try again shortly.'
        )
        setMessageType('info')
        return
      }

      if (!clubData) {
        navigate('/create-club')
      } else {
        navigate('/dashboard/overview')
      }
    } catch (err: any) {
      setMessage(err?.message ?? 'Signup failed')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  const messageStyles =
    messageType === 'success'
      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
      : messageType === 'error'
        ? 'bg-red-50 border border-red-200 text-red-700'
        : 'bg-blue-50 border border-blue-200 text-blue-800'

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2010_14_29%20PM.png"
          alt="background"
          className="object-cover w-full h-full"
          style={
            {
              opacity: 0.92,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)'
            } as React.CSSProperties
          }
        />

        {/* Stronger blue overlay (~50% at top), fading into dark blue at bottom */}
        <div
          className="absolute inset-0"
          style={
            {
              background:
                'linear-gradient(to bottom, rgba(12,38,95,0.50) 0%, rgba(12,38,95,0.50) 38%, rgba(8,18,36,0.72) 74%, rgba(8,18,36,0.96) 100%)'
            } as React.CSSProperties
          }
        />
      </div>

      {/* Registration card */}
      <div className="relative z-10 max-w-2xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900">Create your Manager Account</h2>
          <p className="mt-2 text-sm text-gray-600">
            Join the multiplayer world of ProPeloton Manager.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="Manager handle"
                disabled={loading}
              />
              {errors.username && (
                <div className="text-sm text-red-600 mt-1">{errors.username}</div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Email address</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="you@example.com"
                type="email"
                disabled={loading}
              />
              {errors.email && (
                <div className="text-sm text-red-600 mt-1">{errors.email}</div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input
                name="password"
                value={form.password}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="Choose a strong password"
                type="password"
                disabled={loading}
              />
              {errors.password && (
                <div className="text-sm text-red-600 mt-1">{errors.password}</div>
              )}
            </div>

            {message && (
              <div
                className={`rounded-md px-4 py-3 text-sm font-medium ${messageStyles}`}
                role={messageType === 'error' ? 'alert' : 'status'}
              >
                {message}
              </div>
            )}

            <div className="flex items-center gap-4 mt-4">
              <button
                type="submit"
                className="bg-yellow-400 px-6 py-2 rounded-md font-semibold disabled:opacity-70"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>

              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">
                Already have an account? Sign in
              </Link>

              <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 ml-auto">
                Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}