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
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-600">
          Privacy Policy
        </p>

        <h1 className="mt-3 text-3xl font-bold md:text-4xl">
          Privacy Policy for ProPeloton Manager
        </h1>

        <p className="mt-4 text-sm text-slate-500">
          Last updated: July 2026
        </p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">1. Overview</h2>
          <p className="leading-relaxed text-slate-700">
            ProPeloton Manager is an online cycling management game. This Privacy
            Policy explains what information may be collected, how it is used, and how
            players can contact us about privacy questions.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">2. Information we collect</h2>
          <p className="leading-relaxed text-slate-700">
            We may collect account information such as email address, username, profile
            details, authentication data, team information, game progress, in-game
            actions, support messages, and technical information needed to operate the
            game safely.
          </p>
          <p className="leading-relaxed text-slate-700">
            Game data can include club details, riders, finances, race preparation,
            notifications, rankings, purchases, coin balance, and other gameplay
            records connected to the account.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">3. Payments and coins</h2>
          <p className="leading-relaxed text-slate-700">
            ProPeloton Manager may offer coin packages or paid features. Payment
            processing is handled by external payment providers such as Stripe. We do
            not store full payment card details on our own servers.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">4. Advertising and rewarded ads</h2>
          <p className="leading-relaxed text-slate-700">
            The game may use advertising services, including Google advertising
            products, to show ads or rewarded ads. Rewarded ads may allow players to
            receive in-game coins or progress after voluntarily watching an ad.
          </p>
          <p className="leading-relaxed text-slate-700">
            Advertising partners may use cookies, device identifiers, consent signals,
            and similar technologies to provide, measure, and improve advertising. In
            regions where consent is required, a consent message may be shown before
            personalized advertising is used.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">5. Cookies and local storage</h2>
          <p className="leading-relaxed text-slate-700">
            We may use cookies, browser storage, and similar technologies for login,
            session handling, preferences, security, analytics, advertising consent,
            and game functionality.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">6. How we use information</h2>
          <p className="leading-relaxed text-slate-700">
            We use information to operate the game, maintain player accounts, process
            gameplay actions, show rankings and race results, provide support, prevent
            abuse, improve performance, handle payments, and comply with legal or
            platform requirements.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">7. Sharing information</h2>
          <p className="leading-relaxed text-slate-700">
            We may share limited information with service providers that help operate
            the game, including hosting, database, authentication, payment processing,
            analytics, advertising, and support tools. We do not sell player account
            information as a standalone product.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">8. Data security</h2>
          <p className="leading-relaxed text-slate-700">
            We use technical and organizational measures to protect account and game
            data. No online service can guarantee perfect security, but we work to keep
            the game reliable and safe.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">9. Contact</h2>
          <p className="leading-relaxed text-slate-700">
            For privacy questions, contact us at{' '}
            <a className="font-semibold text-yellow-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/terms"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Terms
          </Link>

          <Link
            to="/contact"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Contact
          </Link>
        </div>
      </article>
    </main>
  )
}