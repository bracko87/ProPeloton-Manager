/**
 * Terms.tsx
 * Public terms page for ProPeloton Manager.
 *
 * IMPORTANT:
 * This is a practical starter terms page for the game.
 * Review it before production and adjust business/legal details.
 */

import React from 'react'
import { Link } from 'react-router'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

export default function TermsPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-600">
          Terms
        </p>

        <h1 className="mt-3 text-3xl font-bold md:text-4xl">
          Terms of Use for ProPeloton Manager
        </h1>

        <p className="mt-4 text-sm text-slate-500">
          Last updated: July 2026
        </p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">1. Acceptance of terms</h2>
          <p className="leading-relaxed text-slate-700">
            By using ProPeloton Manager, you agree to these Terms of Use. If you do not
            agree, you should not use the game.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">2. Game service</h2>
          <p className="leading-relaxed text-slate-700">
            ProPeloton Manager is an online cycling management game. The game may
            include team creation, rider management, training, race preparation,
            transfers, rankings, finance systems, sponsors, coins, and other gameplay
            features.
          </p>
          <p className="leading-relaxed text-slate-700">
            The game is actively developed. Features, balancing, prices, economy values,
            race systems, user interface, and availability may change over time.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">3. Accounts</h2>
          <p className="leading-relaxed text-slate-700">
            You are responsible for your account activity. Do not share your login
            details, attempt to access another account, or use the game in a way that
            disrupts other players.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">4. Fair play and abuse prevention</h2>
          <p className="leading-relaxed text-slate-700">
            Players must not exploit bugs, manipulate systems, automate actions,
            interfere with the service, attempt fraud, or abuse rewarded ads, payments,
            referrals, transfers, rankings, or any other game system.
          </p>
          <p className="leading-relaxed text-slate-700">
            We may restrict access, reverse unfair gains, remove abusive content, or
            suspend accounts when necessary to protect the game and other players.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">5. Coins and payments</h2>
          <p className="leading-relaxed text-slate-700">
            Coins are an account-based in-game currency used inside ProPeloton Manager.
            Coins are not real money, cannot be withdrawn as cash, and cannot be sold or
            transferred outside the game unless we explicitly provide such a feature.
          </p>
          <p className="leading-relaxed text-slate-700">
            Paid coin packages, if available, are processed through external payment
            providers. Purchase availability, package sizes, and prices may change.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">6. Rewarded ads</h2>
          <p className="leading-relaxed text-slate-700">
            Rewarded ads may allow players to receive in-game progress or coins after
            voluntarily watching an ad. Rewards are controlled by the game backend.
            Attempts to fake ad completion, automate ads, abuse networks, or manipulate
            rewards are not allowed.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">7. User content and communication</h2>
          <p className="leading-relaxed text-slate-700">
            If the game includes messages, names, reports, forum links, or community
            features, users must not post hateful, illegal, abusive, misleading, adult,
            violent, or harmful content. We may moderate or remove content when needed.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">8. Availability</h2>
          <p className="leading-relaxed text-slate-700">
            We try to keep the game available and reliable, but interruptions,
            maintenance, bugs, data corrections, balancing changes, or service changes
            may happen.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">9. Contact</h2>
          <p className="leading-relaxed text-slate-700">
            For questions about these terms, contact us at{' '}
            <a className="font-semibold text-yellow-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/privacy-policy"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Privacy Policy
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