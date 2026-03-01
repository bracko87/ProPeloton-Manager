/**
 * Register.tsx
 * Registration page for new managers.
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'

/**
 * RegisterPage
 * Registration form with validation placeholders and premium styling.
 *
 * Note: Submission should call Supabase auth API (not implemented here).
 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  /**
   * handleChange
   * Simple controlled form update.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  /**
   * handleSubmit
   * Validate locally and navigate to create club (placeholder).
   * In production: call Supabase register endpoint and handle session.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.username) errs.username = 'Username required'
    if (!form.email) errs.email = 'Email required'
    if (!form.password || form.password.length < 8) errs.password = 'Password must be 8+ chars'
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      // Placeholder navigation flow after successful registration
      navigate('/create-club')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900">Create your Manager Account</h2>
          <p className="mt-2 text-sm text-gray-600">Join the multiplayer world of ProPeloton Manager.</p>

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="Manager handle"
              />
              {errors.username && <div className="text-sm text-red-600 mt-1">{errors.username}</div>}
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
              />
              {errors.email && <div className="text-sm text-red-600 mt-1">{errors.email}</div>}
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
              />
              {errors.password && <div className="text-sm text-red-600 mt-1">{errors.password}</div>}
            </div>

            <div className="flex items-center gap-4 mt-4">
              <button type="submit" className="bg-yellow-400 px-6 py-2 rounded-md font-semibold">
                Create Account
              </button>
              <Link to="/login" className="text-sm text-gray-600">Already have an account? Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
