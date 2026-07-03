/**
 * Support.tsx
 * Public support information page for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

const supportTopics = [
  {
    title: 'Account and login help',
    text:
      'Use support if you cannot sign in, cannot access your club, have trouble with password reset, or believe your account data is not loading correctly.',
  },
  {
    title: 'Bug reports',
    text:
      'Report bugs with clear steps. Include the page name, expected behavior, actual behavior, team name, rider name, race name, and screenshots when possible.',
  },
  {
    title: 'Payments and coins',
    text:
      'For coin package, Stripe checkout, rewarded-ad, or balance questions, include your account email and the approximate time of the issue.',
  },
  {
    title: 'Gameplay questions',
    text:
      'Ask about race preparation, stage plans, transfers, sponsors, finances, rankings, training, fatigue, or any system that is unclear.',
  },
]

export default function SupportPage(): JSX.Element {
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
            Support
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Help for players and visitors.
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            This page explains how to contact ProPeloton Manager support, what details
            to include in a report, and where to go for account, gameplay, payment,
            coin, or technical questions.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
            >
              Contact Support
            </Link>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              Email Us
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-5 md:grid-cols-2">
          {supportTopics.map(topic => (
            <article
              key={topic.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold">{topic.title}</h2>
              <p className="mt-3 leading-relaxed text-slate-700">{topic.text}</p>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">How to get faster help</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            A good support request should explain the problem clearly. For bugs, tell
            us what you clicked, what page you were on, what you expected, and what
            actually happened. For account or coin issues, include your account email
            and the approximate date/time of the problem.
          </p>

          <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
            <h3 className="font-bold">Do not send sensitive information</h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Never send your password, full payment card information, or private
              authentication codes. Support does not need those details.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              Open Contact Page
            </Link>

            <Link
              to="/privacy-policy"
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              Privacy Policy
            </Link>
          </div>
        </section>
      </section>
    </main>
  )
}