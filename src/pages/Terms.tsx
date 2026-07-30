import React from 'react'
import { Link } from 'react-router'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

export default function TermsPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 px-6 py-14 text-white md:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-400">Terms of Use</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">Play fairly, manage responsibly.</h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-200 md:text-lg">
            These terms explain the rules for using ProPeloton Manager, managing your account, purchasing coins, and using Premium.
          </p>
        </div>
      </header>

      <div className="px-6 py-12">
        <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-3xl font-bold md:text-4xl">Terms of Use for ProPeloton Manager</h2>
          <p className="mt-4 text-sm text-slate-500">Last updated: July 2026</p>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">1. Acceptance of terms</h3>
            <p className="leading-relaxed text-slate-700">By creating an account, using ProPeloton Manager, purchasing coins, or subscribing to Premium, you agree to these Terms of Use. If you do not agree, you should not use the game.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">2. Game service</h3>
            <p className="leading-relaxed text-slate-700">ProPeloton Manager is an online cycling management game. The game may include team creation, rider management, training, race preparation, transfers, rankings, finance systems, sponsors, Premium features, coins, and other gameplay features.</p>
            <p className="leading-relaxed text-slate-700">The game is actively developed. Features, balancing, prices, economy values, race systems, user interface, and availability may change over time. Premium convenience features do not guarantee better race results, transfer acceptance, or access to hidden rider skills.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">3. Accounts</h3>
            <p className="leading-relaxed text-slate-700">You are responsible for your account activity. Do not share your login details, attempt to access another account, or use the game in a way that disrupts other players.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">4. Fair play and abuse prevention</h3>
            <p className="leading-relaxed text-slate-700">Players must not exploit bugs, manipulate systems, automate prohibited actions, interfere with the service, attempt fraud, or abuse payments, referrals, rankings, Premium access, coins, or any other game system.</p>
            <p className="leading-relaxed text-slate-700">We may restrict access, reverse unfair gains, remove abusive content, correct balances, or suspend accounts when reasonably necessary to protect the game and other players.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">5. Coins and coin packages</h3>
            <p className="leading-relaxed text-slate-700">Coins are an account-based in-game currency used only inside ProPeloton Manager. Coins are not real money, have no cash value, cannot be withdrawn, and cannot be sold, transferred, or redeemed outside the game unless we explicitly introduce such a feature.</p>
            <p className="leading-relaxed text-slate-700">Coin packages are optional one-time purchases processed through an external payment provider such as Stripe. Buying coins does not activate Premium membership.</p>
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
              <strong>Coin-package purchases are non-refundable.</strong>{' '}Once payment is completed and the coins are credited, the purchase is final, except where a refund is required by applicable law or where we confirm a duplicate, unauthorized, or technically incorrect charge.
            </div>
            <p className="leading-relaxed text-slate-700">Unused coins remain attached to the account and do not expire during normal account use or after Premium cancellation. Coins connected to a refunded, reversed, disputed, fraudulent, or unauthorized payment may be removed or corrected.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">6. Premium membership</h3>
            <p className="leading-relaxed text-slate-700">ProPeloton Premium is an optional monthly subscription. The current monthly price and included monthly coin reward are shown before checkout.</p>
            <p className="leading-relaxed text-slate-700">Premium begins after successful payment confirmation and renews automatically each month using the payment method managed by Stripe, unless future renewal is cancelled before the next billing date.</p>
            <p className="leading-relaxed text-slate-700">You may cancel future renewal at any time through Manage Subscription. Premium normally remains active until the current paid period ends, after which normal free game access continues.</p>
            <p className="leading-relaxed text-slate-700">Unused coins normally remain in the account after Premium cancellation. If a Premium payment is refunded, reversed, disputed, fraudulent, or unauthorized, Premium access and coins connected to that payment may be removed or corrected.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">7. Failed payments and cancellation</h3>
            <p className="leading-relaxed text-slate-700">If a Premium renewal payment fails, the payment provider may retry the charge. Premium access may remain temporarily active while payment is processed. If payment is not completed, Premium access may end while the account, club, game progress, and normal free access remain available.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">8. Refunds and payment corrections</h3>
            <p className="leading-relaxed text-slate-700">Coin-package purchases are non-refundable as described above. Premium refund requests involving duplicate charges, unauthorized payments, technical billing errors, or failure to provide the purchased service may be reviewed individually.</p>
            <p className="leading-relaxed text-slate-700">Nothing in these terms removes consumer rights that cannot legally be excluded. Where applicable law requires a refund, cancellation right, withdrawal right, or other remedy, that legal requirement takes priority.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">9. User content and communication</h3>
            <p className="leading-relaxed text-slate-700">If the game includes messages, names, reports, forum links, or community features, users must not post hateful, illegal, abusive, misleading, adult, violent, or harmful content. We may moderate or remove content when needed.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">10. Availability</h3>
            <p className="leading-relaxed text-slate-700">We try to keep the game available and reliable, but interruptions, maintenance, bugs, data corrections, balancing changes, payment-provider interruptions, or service changes may happen.</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">11. Contact</h3>
            <p className="leading-relaxed text-slate-700">For questions about these terms, billing, Premium, or coin purchases, contact us at{' '}<a className="font-semibold text-yellow-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          </section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/privacy-policy" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800">Privacy Policy</Link>
            <Link to="/contact" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50">Contact</Link>
          </div>
        </article>
      </div>
    </main>
  )
}
