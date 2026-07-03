/**
 * ContactUs.tsx
 * Public and dashboard contact/support form.
 *
 * Used by:
 * - /contact
 * - /dashboard/contact-us
 *
 * The form is frontend-functional through mailto because no backend
 * contact submission endpoint is currently wired.
 */

import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

type FormErrors = {
  name?: string
  email?: string
  message?: string
}

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export default function ContactUsPage(): JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent('ProPeloton Manager support request')
    const body = encodeURIComponent(
      [
        `Name: ${name.trim()}`,
        `Email: ${email.trim()}`,
        '',
        'Message:',
        message.trim(),
      ].join('\n'),
    )

    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
  }, [name, email, message])

  function validateForm(): boolean {
    const nextErrors: FormErrors = {}

    if (!name.trim()) {
      nextErrors.name = 'Please enter your name.'
    }

    if (!email.trim()) {
      nextErrors.email = 'Please enter your email address.'
    } else if (!isProbablyValidEmail(email)) {
      nextErrors.email = 'Please enter a valid email address.'
    }

    if (!message.trim()) {
      nextErrors.message = 'Please write a message.'
    } else if (message.trim().length < 10) {
      nextErrors.message = 'Please write a little more detail.'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setSent(true)
    window.location.href = mailtoHref
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white"
          >
            ← Back to Home
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            Contact ProPeloton Manager
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Need help or want to report a problem?
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            Use this page for support requests, bug reports, account questions,
            gameplay feedback, AdSense/privacy questions, and general contact about
            ProPeloton Manager.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-12 lg:grid-cols-[0.95fr_1.4fr]">
        <aside className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Support email</h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              You can contact us directly at:
            </p>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-flex font-semibold text-yellow-700 underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Good bug reports include</h2>

            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>The page where the issue happened.</li>
              <li>Your team name, race name, or rider name if relevant.</li>
              <li>What you expected to happen.</li>
              <li>What actually happened.</li>
              <li>Screenshots or copied error messages if available.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
            <h2 className="text-lg font-bold">Privacy and account questions</h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              For privacy, account, payment, or rewarded-ad questions, include the
              email address connected to your game account. Do not send passwords or
              payment card details.
            </p>
          </article>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">Send a message</h2>

          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Fill out the form below. Since the backend contact endpoint is not wired
            yet, submitting this form opens your email app with the message prepared.
          </p>

          {!sent ? (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Name</span>
                <input
                  value={name}
                  onChange={event => {
                    setName(event.target.value)
                    clearFieldError('name')
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder="Your name"
                />
                {errors.name && (
                  <div className="mt-1 text-sm text-red-600">{errors.name}</div>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value)
                    clearFieldError('email')
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <div className="mt-1 text-sm text-red-600">{errors.email}</div>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Message</span>
                <textarea
                  value={message}
                  onChange={event => {
                    setMessage(event.target.value)
                    clearFieldError('message')
                  }}
                  className="mt-1 min-h-[180px] w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                  placeholder="Write your message..."
                />
                {errors.message && (
                  <div className="mt-1 text-sm text-red-600">{errors.message}</div>
                )}
              </label>

              <button
                type="submit"
                className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
              >
                Send message
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
              <div className="font-bold">Your email app should open now.</div>

              <p className="mt-2 text-sm leading-relaxed">
                If it did not open, please send your message manually to{' '}
                <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>

              <a
                href={mailtoHref}
                className="mt-4 inline-flex rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
              >
                Open email again
              </a>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}