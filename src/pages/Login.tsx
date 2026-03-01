/**
 * Login.tsx
 * Login page for existing managers.
 */

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'

/**
 * LoginPage
 * Login form with premium styling and submission placeholder.
 *
 * Production: connect to Supabase auth to sign in and redirect to dashboard.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) {
      setError('Please provide both email and password')
      return
    }
    // Placeholder: authenticate via Supabase and then navigate to dashboard
    navigate('/dashboard/overview')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl overflow-hidden">
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
              />
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex items-center gap-4 mt-4">
              <button type="submit" className="bg-yellow-400 px-6 py-2 rounded-md font-semibold">
                Sign In
              </button>
              <Link to="/register" className="text-sm text-gray-600">Create account</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
