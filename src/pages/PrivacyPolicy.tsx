/**
 * PrivacyPolicy.tsx
 * Public privacy policy page.
 *
 * IMPORTANT:
 * This is a practical starter privacy page for the game.
 * Review it before production and adjust company/contact details.
 */

import React from 'react'
import { Link } from 'react-router'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

export default function PrivacyPolicyPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 px-6 py-14 text-white md:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-400">
            Privacy Policy
          </p>

          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
            Your privacy matters.
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-200 md:text-lg">
            Learn what information ProPeloton Manager may collect, how it is
            used, and how your account and game data are handled.
          </p>
        </div>
      </header>

      <div className="px-6 py-12">
        <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-3xl font-bold md:text-4xl">
            Privacy Policy for ProPeloton Manager
          </h2>

          <p className="mt-4 text-sm text-slate-500">
            Last updated: July 2026
          </p>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              1. Overview
            </h3>

            <p className="leading-relaxed text-slate-700">
              ProPeloton Manager is an online cycling management game. This
              Privacy Policy explains what information may be collected, how it
              is used, and how players can contact us about privacy questions.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              2. Information we collect
            </h3>

            <p className="leading-relaxed text-slate-700">
              We may collect account information such as email address,
              username, profile details, authentication data, team information,
              game progress, in-game actions, support messages, and technical
              information needed to operate the game safely.
            </p>

            <p className="leading-relaxed text-slate-700">
              Game data can include club details, riders, finances, race
              preparation, notifications, rankings, purchases, coin balance,
              and other gameplay records connected to the account.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              3. Payments and coins
            </h3>

            <p className="leading-relaxed text-slate-700">
              ProPeloton Manager may offer coin packages or paid features.
              Payment processing is handled by external payment providers such
              as Stripe. We do not store full payment card details on our own
              servers.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              4. Third-party advertising
            </h3>

            <p className="leading-relaxed text-slate-700">
              ProPeloton Manager does not currently use third-party advertising.
              If this changes in the future, this Privacy Policy will be
              updated before those services are used.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              5. Cookies and local storage
            </h3>

            <p className="leading-relaxed text-slate-700">
              We may use cookies, browser storage, and similar technologies for
              login, session handling, preferences, security, analytics, and
              game functionality.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              6. How we use information
            </h3>

            <p className="leading-relaxed text-slate-700">
              We use information to operate the game, maintain player accounts,
              process gameplay actions, show rankings and race results, provide
              support, prevent abuse, improve performance, handle payments, and
              comply with legal or platform requirements.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              7. Sharing information
            </h3>

            <p className="leading-relaxed text-slate-700">
              We may share limited information with service providers that help
              operate the game, including hosting, database, authentication,
              payment processing, analytics, and support tools. We do not sell
              player account information as a standalone product.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              8. Data security
            </h3>

            <p className="leading-relaxed text-slate-700">
              We use technical and organizational measures to protect account
              and game data. No online service can guarantee perfect security,
              but we work to keep the game reliable and safe.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">
              9. Contact
            </h3>

            <p className="leading-relaxed text-slate-700">
              For privacy questions, contact us at{' '}
              <a
                className="font-semibold text-yellow-700 underline"
                href={`mailto:${CONTACT_EMAIL}`}
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/terms"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
            >
              Terms
            </Link>

            <Link
              to="/contact"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50"
            >
              Contact
            </Link>
          </div>
        </article>
      </div>
    </main>
  )
}
