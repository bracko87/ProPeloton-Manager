/**
 * Register.tsx
 * Registration page for new managers with a full-bleed background image
 * that fades downward into dark blue.
 *
 * Purpose:
 * - Collect email, password and confirmation; username and birthday are optional.
 * - Birthday is entirely optional; providing it grants birthday-reward eligibility.
 * - If any birthday field is provided, month and day are required together.
 * - Birthday is sent through Supabase signup metadata.
 * - Backend trigger public.handle_new_user() stores birthday fields in profiles.
 * - Birthday cannot be changed later in the game.
 * - Users can resend the signup activation email from the registration page.
 * - First-send and resent activation links both use one canonical /create-club redirect.
 */

import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuthCaptcha, AuthCaptcha } from '../components/auth/AuthCaptcha'
import PreReleaseNotice, { PROPELOTON_OFFICIAL_LAUNCH_AT_UTC } from '../components/PreReleaseNotice'

type StatusType = 'success' | 'error' | 'info' | null

const EMAIL_CONFIRMATION_REDIRECT_URL =
  'https://propelotonmanager.com/create-club'

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
  { value: '1', labelKey: 'months.january' },
  { value: '2', labelKey: 'months.february' },
  { value: '3', labelKey: 'months.march' },
  { value: '4', labelKey: 'months.april' },
  { value: '5', labelKey: 'months.may' },
  { value: '6', labelKey: 'months.june' },
  { value: '7', labelKey: 'months.july' },
  { value: '8', labelKey: 'months.august' },
  { value: '9', labelKey: 'months.september' },
  { value: '10', labelKey: 'months.october' },
  { value: '11', labelKey: 'months.november' },
  { value: '12', labelKey: 'months.december' },
] as const

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

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * RegisterPage
 * Registration form connected to Supabase Auth.
 */
export default function RegisterPage(): JSX.Element {
  const { t } = useTranslation('auth')
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
  const captcha = useAuthCaptcha()
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<StatusType>(null)
  const [resendingActivation, setResendingActivation] = useState(false)
  const [showBirthdayFields, setShowBirthdayFields] = useState(false)

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

    setErrors(prev => {
      if (!prev[name]) return prev

      const nextErrors = { ...prev }
      delete nextErrors[name]
      return nextErrors
    })
  }

  // No public account-existence checks. Supabase Auth owns duplicate handling;
  // callers should not be able to discover who has registered.

  async function handleResendActivationEmail(): Promise<void> {
    const email = form.email.trim()

    setMessage(null)
    setMessageType(null)

    if (!email) {
      setErrors(prev => ({
        ...prev,
        email: t('register.enterEmailFirst'),
      }))
      return
    }

    if (!isProbablyValidEmail(email)) {
      setErrors(prev => ({
        ...prev,
        email: t('register.validEmail'),
      }))
      return
    }

    setErrors(prev => {
      if (!prev.email) return prev
      const nextErrors = { ...prev }
      delete nextErrors.email
      return nextErrors
    })

    if (loading || resendingActivation || !captcha.ready) return
    setResendingActivation(true)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
          captchaToken: captcha.consume(),
        },
      })

      if (error) {
        const msg = error.message || ''
        // Account-specific Auth responses must not reveal whether this email
        // already belongs to a verified, pending or missing user.
        if (/already confirmed|email.*confirmed|user.*confirmed|not found|no user|not registered|unknown user/i.test(msg)) {
          setMessage(t('register.activationSent'))
          setMessageType('info')
        } else if (/rate limit|too many requests|security purposes/i.test(msg)) {
          setMessage(t('register.rateLimit'))
          setMessageType('info')
        } else {
          setMessage(t('register.activationFailed'))
          setMessageType('error')
        }
        return
      }

      setMessage(t('register.activationSent'))
      setMessageType('success')
    } catch (err: any) {
      setMessage(err?.message ?? t('register.activationFailed'))
      setMessageType('error')
    } finally {
      captcha.reset()
      setResendingActivation(false)
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()

    setMessage(null)
    setMessageType(null)

    const nextErrors: Record<string, string> = {}

    const username = form.username.trim()
    const email = form.email.trim()
    const birthdayProvided = Boolean(
      form.birthdayMonth || form.birthdayDay || form.birthdayYear.trim(),
    )
    const birthdayMonth = Number(form.birthdayMonth)
    const birthdayDay = Number(form.birthdayDay)
    const birthdayYear = parseOptionalYear(form.birthdayYear)
    const currentYear = new Date().getFullYear()

    if (!email) {
      nextErrors.email = t('register.emailRequired')
    } else if (!isProbablyValidEmail(email)) {
      nextErrors.email = t('register.validEmail')
    }

    if (!form.password || form.password.length < 8) {
      nextErrors.password = t('register.passwordLength')
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = t('register.confirmRequired')
    } else if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = t('register.passwordMismatch')
    }

    if (birthdayProvided && (!birthdayMonth || birthdayMonth < 1 || birthdayMonth > 12)) {
      nextErrors.birthdayMonth = t('register.birthdayMonthRequired')
    }

    if (birthdayProvided && !birthdayDay) {
      nextErrors.birthdayDay = t('register.birthdayDayRequired')
    }

    if (form.birthdayYear.trim()) {
      if (!birthdayYear || birthdayYear < 1900 || birthdayYear > currentYear) {
        nextErrors.birthdayYear = t('register.validYear')
      }
    }

    if (birthdayMonth && birthdayDay) {
      const maxDay = getDaysInMonth(birthdayMonth, birthdayYear)

      if (birthdayDay < 1 || birthdayDay > maxDay) {
        nextErrors.birthdayDay = t('register.invalidBirthdayDay')
      }
    }

    setErrors(nextErrors)
    if (['birthdayMonth', 'birthdayDay', 'birthdayYear'].some(field => nextErrors[field])) setShowBirthdayFields(true)
    if (Object.keys(nextErrors).length > 0) return

    if (loading || resendingActivation || !captcha.ready) return
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
          captchaToken: captcha.consume(),
          data: {
            username: username || undefined,
            birthday_month: birthdayProvided ? birthdayMonth : null,
            birthday_day: birthdayProvided ? birthdayDay : null,
            birthday_year: birthdayProvided ? birthdayYear : null,
          },
        },
      })

      if (error) {
        const msg = error.message || ''
        if (/already registered|duplicate|already exists|user.*exists/i.test(msg) ||
            error.code === 'user_already_exists') {
          // Identical response to a successful pending email confirmation.
          // Never disclose whether the supplied address already has an account.
          setMessage(t('register.accountCreatedConfirm'))
          setMessageType('success')
        } else if (/username/i.test(msg)) {
          setErrors(prev => ({ ...prev, username: t('register.usernameTaken') }))
        } else {
          // Avoid exposing raw account state or database details in the UI.
          setMessage(/captcha|rate limit|too many requests/i.test(msg) ? msg : t('register.signupFailed'))
          setMessageType('error')
        }
        return
      }

      if (!data?.session) {
        setMessage(t('register.accountCreatedConfirm'))
        setMessageType('success')
        return
      }

      const { data: clubData, error: rpcError } =
        await supabase.rpc('get_my_club_id')

      if (rpcError) {
        setMessage(t('register.clubStatusFailed'))
        setMessageType('info')
        return
      }

      if (!clubData) {
        navigate('/create-club')
      } else {
        navigate('/dashboard/overview')
      }
    } catch (err: any) {
      setMessage(err?.message ?? t('register.signupFailed'))
      setMessageType('error')
    } finally {
      captcha.reset()
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
      <div className="relative z-10 max-w-xl w-full rounded-2xl bg-white shadow-2xl overflow-hidden ring-1 ring-white/20">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {t('register.title')}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {t('register.subtitle')}
          </p>
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{t('register.accountBenefits')}</p>


          {Date.now() < Date.parse(PROPELOTON_OFFICIAL_LAUNCH_AT_UTC) ? (
            <div className="mt-5"><PreReleaseNotice /></div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                {t('register.username')} <span className="ml-2 text-xs font-medium text-slate-500">{t('register.birthdayOptional')}</span>
              </label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder={t('register.managerHandle')}
                  autoComplete="nickname"
                disabled={loading}
              />

              <p className="mt-1 text-xs text-slate-500">{t('register.usernameHelp')}</p>
              {errors.username && (
                <div className="text-sm text-red-600 mt-1">
                  {errors.username}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                {t('register.emailAddress')}
              </label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder={t('register.emailPlaceholder')}
                type="email"
                disabled={loading}
              />

              {errors.email && (
                <div className="text-sm text-red-600 mt-1">{errors.email}</div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleResendActivationEmail()
                  }}
                  disabled={
                    loading ||
                    resendingActivation ||
                    !captcha.ready ||
                    !form.email.trim()
                  }
                  className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {resendingActivation
                    ? t('register.resendingActivation')
                    : t('register.resendActivation')}
                </button>

                <span className="text-xs text-gray-500">
                  {t('register.resendHelp')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  {t('register.password')}
                </label>
                <input
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder={t('register.strongPassword')}
                  type="password"
                  disabled={loading}
                />

                {errors.password && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.password}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  {t('register.confirmPassword')}
                </label>
                <input
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder={t('register.repeatPassword')}
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <button type="button"
                aria-expanded={showBirthdayFields}
                aria-controls="register-birthday-fields"
                onClick={() => setShowBirthdayFields(previous => !previous)}
                className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
                disabled={loading}
              >
                <span>{t('register.birthday')} <span className="text-xs font-medium text-slate-600">· {t('register.birthdayOptional')}</span></span>
                <span className="text-xs font-semibold text-blue-700">{showBirthdayFields ? t('register.hideOptional') : t('register.showOptional')}</span>
              </button>
              {showBirthdayFields ? (
                <div id="register-birthday-fields">
                  <p className="mt-3 text-xs leading-5 text-gray-700">
                {t('register.birthdayHelp')}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    {t('register.month')}
                  </label>
                  <select
                    name="birthdayMonth"
                    value={form.birthdayMonth}
                    onChange={handleChange}
                    className="mt-1 block w-full border rounded-md px-3 py-2 bg-white"
                    disabled={loading}
                  >
                    <option value="">{t('register.selectMonth')}</option>
                    {MONTH_OPTIONS.map(month => (
                      <option key={month.value} value={month.value}>
                        {t(month.labelKey)}
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
                  <label className="text-sm font-medium text-gray-700">
                    {t('register.day')}
                  </label>
                  <select
                    name="birthdayDay"
                    value={form.birthdayDay}
                    onChange={handleChange}
                    className="mt-1 block w-full border rounded-md px-3 py-2 bg-white"
                    disabled={loading || !form.birthdayMonth}
                  >
                    <option value="">{t('register.selectDay')}</option>
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
                    {t('register.yearOptional')}
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
              ) : null}
            </div>

            <AuthCaptcha captcha={captcha} />
            {message && (
              <div
                className={`rounded-md px-4 py-3 text-sm font-medium ${messageStyles}`}
                role={messageType === 'error' ? 'alert' : 'status'}
              >
                {message}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4 sm:gap-5">
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 disabled:opacity-70"
                disabled={loading || resendingActivation || !captcha.ready}
              >
                {loading
                  ? t('register.creating')
                  : resendingActivation
                    ? t('register.pleaseWait')
                    : t('register.createAccount')}
              </button>

              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">
                {t('register.alreadyHave')}
              </Link>

              <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 ml-auto">
                {t('home')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
