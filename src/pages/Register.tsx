/**
 * Register.tsx
 * Registration page for new managers with a full-bleed background image
 * that fades downward into dark blue.
 *
 * Purpose:
 * - Collect username, email, password, password confirmation, and birthday.
 * - Birthday day/month are required.
 * - Birthday year is optional.
 * - Birthday is sent through Supabase signup metadata.
 * - Backend trigger public.handle_new_user() stores birthday fields in profiles.
 * - Birthday cannot be changed later in the game.
 */

import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'

type StatusType = 'success' | 'error' | 'info' | null

type RegisterForm = {
  username: string
  email: string
  password: string
  confirmPassword: string
  birthdayMonth: string
  birthdayDay: string
  birthdayYear: string
}

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

function getDaysInMonth(month: number, year: number | null): number {
  if (month === 2) {
    if (!year) return 29

    const isLeapYear =
      (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

    return isLeapYear ? 29 : 28
  }

  if ([4, 6, 9, 11].includes(month)) return 30

  return 31
}

function parseOptionalYear(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return null

  return parsed
}

/**
 * RegisterPage
 * Registration form connected to Supabase Auth.
 */
export default function RegisterPage(): JSX.Element {
  const navigate = useNavigate()

  const [form, setForm] = useState<RegisterForm>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    birthdayMonth: '',
    birthdayDay: '',
    birthdayYear: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<StatusType>(null)

  const birthdayYearNumber = useMemo(
    () => parseOptionalYear(form.birthdayYear),
    [form.birthdayYear],
  )

  const selectedBirthdayMonth = Number(form.birthdayMonth)

  const birthdayDayOptions = useMemo(() => {
    if (!selectedBirthdayMonth) return []

    const maxDay = getDaysInMonth(selectedBirthdayMonth, birthdayYearNumber)

    return Array.from({ length: maxDay }, (_, index) => String(index + 1))
  }, [selectedBirthdayMonth, birthdayYearNumber])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ): void {
    const { name, value } = e.target

    setForm(prev => {
      const next = {
        ...prev,
        [name]: value,
      }

      if (name === 'birthdayMonth') {
        next.birthdayDay = ''
      }

      return next
    })
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()

    setMessage(null)
    setMessageType(null)

    const nextErrors: Record<string, string> = {}

    const username = form.username.trim()
    const email = form.email.trim()
    const birthdayMonth = Number(form.birthdayMonth)
    const birthdayDay = Number(form.birthdayDay)
    const birthdayYear = parseOptionalYear(form.birthdayYear)
    const currentYear = new Date().getFullYear()

    if (!username) nextErrors.username = 'Username required'
    if (!email) nextErrors.email = 'Email required'

    if (!form.password || form.password.length < 8) {
      nextErrors.password = 'Password must be 8+ chars'
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password'
    } else if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match'
    }

    if (!birthdayMonth || birthdayMonth < 1 || birthdayMonth > 12) {
      nextErrors.birthdayMonth = 'Birthday month is required'
    }

    if (!birthdayDay) {
      nextErrors.birthdayDay = 'Birthday day is required'
    }

    if (form.birthdayYear.trim()) {
      if (!birthdayYear || birthdayYear < 1900 || birthdayYear > currentYear) {
        nextErrors.birthdayYear = 'Enter a valid year or leave it empty'
      }
    }

    if (birthdayMonth && birthdayDay) {
      const maxDay = getDaysInMonth(birthdayMonth, birthdayYear)

      if (birthdayDay < 1 || birthdayDay > maxDay) {
        nextErrors.birthdayDay = 'Birthday day is not valid for this month'
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: 'https://propelotonmanager.com/create-club',
          data: {
            username,
            birthday_month: birthdayMonth,
            birthday_day: birthdayDay,
            birthday_year: birthdayYear,
          },
        },
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

      if (!data?.session) {
        setMessage('Account created. Please confirm your email before signing in.')
        setMessageType('success')
        return
      }

      const { data: clubData, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (rpcError) {
        setMessage(
          'Your account was created and you are signed in, but we could not check your club status. Please try again shortly.',
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
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
            } as React.CSSProperties
          }
        />

        <div
          className="absolute inset-0"
          style={
            {
              background:
                'linear-gradient(to bottom, rgba(12,38,95,0.50) 0%, rgba(12,38,95,0.50) 38%, rgba(8,18,36,0.72) 74%, rgba(8,18,36,0.96) 100%)',
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder="Repeat password"
                  type="password"
                  disabled={loading}
                />

                {errors.confirmPassword && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.confirmPassword}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Birthday</div>

              <p className="mt-1 text-xs leading-5 text-gray-700">
                Your birthday is used for birthday rewards. We will send you birthday
                congratulations and add 10 coins to your account. Birthday can only be
                entered once during registration and cannot be changed later in the game.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Month</label>
                  <select
                    name="birthdayMonth"
                    value={form.birthdayMonth}
                    onChange={handleChange}
                    className="mt-1 block w-full border rounded-md px-3 py-2 bg-white"
                    disabled={loading}
                  >
                    <option value="">Select month</option>
                    {MONTH_OPTIONS.map(month => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>

                  {errors.birthdayMonth && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.birthdayMonth}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Day</label>
                  <select
                    name="birthdayDay"
                    value={form.birthdayDay}
                    onChange={handleChange}
                    className="mt-1 block w-full border rounded-md px-3 py-2 bg-white"
                    disabled={loading || !form.birthdayMonth}
                  >
                    <option value="">Select day</option>
                    {birthdayDayOptions.map(day => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>

                  {errors.birthdayDay && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.birthdayDay}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Year optional
                  </label>
                  <input
                    name="birthdayYear"
                    value={form.birthdayYear}
                    onChange={handleChange}
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    placeholder="YYYY"
                    inputMode="numeric"
                    disabled={loading}
                  />

                  {errors.birthdayYear && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.birthdayYear}
                    </div>
                  )}
                </div>
              </div>
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