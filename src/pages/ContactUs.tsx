/**
 * ContactUs.tsx
 * Public and dashboard contact/support form.
 *
 * Used by:
 * - /contact
 * - /dashboard/contact-us
 *
 * UPDATE:
 * - Sends contact messages automatically through Supabase Edge Function:
 *   send-contact-message
 * - No longer opens the user's email app through mailto on submit.
 * - Hides the large public black hero/header when opened inside dashboard.
 */

import React, { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

type FormErrors = {
  name?: string
  email?: string
  message?: string
}

type SubmitStatus = 'idle' | 'sending' | 'success' | 'error'

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function getContactSource(): string {
  if (typeof window === 'undefined') {
    return 'contact-page'
  }

  return window.location.hash || window.location.pathname || 'contact-page'
}

export default function ContactUsPage(): JSX.Element {
  const location = useLocation()
  const { t } = useTranslation('publicInfo')
  const isDashboardContact = location.pathname.startsWith('/dashboard')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [website, setWebsite] = useState('')

  function validateForm(): boolean {
    const nextErrors: FormErrors = {}

    if (!name.trim()) {
      nextErrors.name = t('contactPage.nameRequired')
    }

    if (!email.trim()) {
      nextErrors.email = t('contactPage.emailRequired')
    } else if (!isProbablyValidEmail(email)) {
      nextErrors.email = t('contactPage.emailInvalid')
    }

    if (!message.trim()) {
      nextErrors.message = t('contactPage.messageRequired')
    } else if (message.trim().length < 10) {
      nextErrors.message = t('contactPage.messageDetail')
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()

    if (status === 'sending') {
      return
    }

    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    setStatus('sending')

    const { data, error } = await supabase.functions.invoke('send-contact-message', {
      body: {
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        source: getContactSource(),
        website,
      },
    })

    if (error) {
      console.error('Contact form Edge Function error:', error)

      setSubmitError(error.message || t('contactPage.connectFailed'))
      setStatus('error')
      return
    }

    if (!data?.ok) {
      setSubmitError(
        typeof data?.error === 'string'
          ? data.error
          : t('contactPage.sendFailed'),
      )
      setStatus('error')
      return
    }

    setStatus('success')
    setName('')
    setEmail('')
    setMessage('')
    setWebsite('')
    setErrors({})
  }

  function clearFieldError(field: keyof FormErrors): void {
    setErrors(current => {
      if (!current[field]) return current

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  return (
    <main className={isDashboardContact ? 'bg-slate-50 text-slate-900' : 'min-h-screen bg-slate-50 text-slate-900'}>
      {!isDashboardContact && (
        <section className="bg-slate-950 px-6 py-14 text-white">
          <div className="mx-auto max-w-5xl">
            <Link
              to="/"
              className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white"
            >
              {t('common.backHome')}
            </Link>

            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
              {t('contactPage.eyebrow')}
            </p>

            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              {t('contactPage.title')}
            </h1>

            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
              {t('contactPage.publicIntro')}
            </p>
          </div>
        </section>
      )}

      {isDashboardContact && (
        <section className="mx-auto max-w-5xl px-6 pt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-yellow-700">
            {t('contactPage.eyebrow')}
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {t('contactPage.title')}
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
            {t('contactPage.dashboardIntro')}
          </p>
        </section>
      )}

      <section
        className={
          isDashboardContact
            ? 'mx-auto grid max-w-5xl gap-6 px-6 py-6 lg:grid-cols-[0.95fr_1.4fr]'
            : 'mx-auto grid max-w-5xl gap-6 px-6 py-12 lg:grid-cols-[0.95fr_1.4fr]'
        }
      >
        <aside className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('contactPage.supportEmail')}</h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {t('contactPage.supportEmailText')}
            </p>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-flex font-semibold text-yellow-700 underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('contactPage.bugTitle')}</h2>

            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>{t('contactPage.bug1')}</li>
              <li>{t('contactPage.bug2')}</li>
              <li>{t('contactPage.bug3')}</li>
              <li>{t('contactPage.bug4')}</li>
              <li>{t('contactPage.bug5')}</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('contactPage.privacyTitle')}</h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {t('contactPage.privacyText')}
            </p>
          </article>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t('contactPage.formTitle')}</h2>

          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {t('contactPage.formText')}
          </p>

          {status === 'success' ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
              <div className="font-bold">{t('contactPage.successTitle')}</div>

              <p className="mt-2 text-sm leading-relaxed">
                {t('contactPage.successText')}
              </p>

              <button
                type="button"
                onClick={() => {
                  setStatus('idle')
                  setSubmitError(null)
                }}
                className="mt-4 inline-flex rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
              >
                {t('contactPage.another')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="hidden">
                {t('contactPage.website')}
                <input
                  value={website}
                  onChange={event => setWebsite(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t('contactPage.name')}</span>
                <input
                  value={name}
                  onChange={event => {
                    setName(event.target.value)
                    clearFieldError('name')
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder={t('contactPage.namePlaceholder')}
                  disabled={status === 'sending'}
                />
                {errors.name && (
                  <div className="mt-1 text-sm text-red-600">{errors.name}</div>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t('contactPage.email')}</span>
                <input
                  type="email"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value)
                    clearFieldError('email')
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder={t('contactPage.emailPlaceholder')}
                  disabled={status === 'sending'}
                />
                {errors.email && (
                  <div className="mt-1 text-sm text-red-600">{errors.email}</div>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t('contactPage.message')}</span>
                <textarea
                  value={message}
                  onChange={event => {
                    setMessage(event.target.value)
                    clearFieldError('message')
                  }}
                  className="mt-1 min-h-[180px] w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder={t('contactPage.messagePlaceholder')}
                  disabled={status === 'sending'}
                />
                {errors.message && (
                  <div className="mt-1 text-sm text-red-600">{errors.message}</div>
                )}
              </label>

              {submitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'sending' ? t('contactPage.sending') : t('contactPage.send')}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  )
}
