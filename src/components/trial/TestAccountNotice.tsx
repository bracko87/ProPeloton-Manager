/**
 * SAT-01: site-wide dashboard trial identity notice.
 * Reads authoritative lifecycle timestamps. It never grants Premium or changes
 * gameplay permissions. Server-side expiry enforcement is a separate blocker.
 */
import React from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'

const ENABLED = import.meta.env.VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'

type Term = { started_at: string; premium_ends_at: string; expires_at: string }

export default function TestAccountNotice(): JSX.Element | null {
  const { user } = useAuth()
  const [term, setTerm] = React.useState<Term | null>(null)
  const [showWelcome, setShowWelcome] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(Date.now())

  React.useEffect(() => {
    if (!ENABLED || !user?.id || user.is_anonymous !== true) return
    let mounted = true
    void supabase.from('saturn_test_accounts_v1')
      .select('started_at, premium_ends_at, expires_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted || error || !data) return
        setTerm(data as Term)
        const key = `saturn-trial-welcome-${user.id}`
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, 'seen')
            setShowWelcome(true)
          }
        } catch { setShowWelcome(true) }
      })
    return () => { mounted = false }
  }, [user?.id, user?.is_anonymous])

  React.useEffect(() => {
    if (!term) return
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [term])

  if (!ENABLED || user?.is_anonymous !== true || !term) return null
  const expiresAt = Date.parse(term.expires_at)
  const premiumEndsAt = Date.parse(term.premium_ends_at)
  if (!Number.isFinite(expiresAt) || !Number.isFinite(premiumEndsAt)) return null
  const expired = currentTime >= expiresAt
  const daysLeft = Math.max(0, Math.ceil((expiresAt - currentTime) / 86400000))
  return <>
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div>
        <strong>{expired ? 'Your test period has ended' : `Test account · ${daysLeft} day(s) remaining`}</strong>
        <span className="ml-3">{expired ? 'Your registration deadline has passed. Your unregistered team is scheduled for removal.' : currentTime < premiumEndsAt ? 'Your seven-day Premium trial is in its introductory period.' : 'You can continue testing the standard game until your test period ends.'}</span>
      </div>
      {!expired && <Link to="/test-account-register" className="rounded-lg bg-amber-800 px-4 py-2 text-white font-semibold">Register / Keep my team</Link>}
    </div>
    {showWelcome && !expired && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="saturn-guest-welcome-title">
      <div className="w-full max-w-md rounded-xl bg-white p-7 text-slate-900 space-y-4">
        <h2 id="saturn-guest-welcome-title" className="text-xl font-semibold">Welcome to your 14-day test account</h2>
        <p>Explore the real cycling management game. The first seven days include the Premium trial. Your temporary access ends after 14 days.</p>
        <p>Register before the 14-day deadline to keep your team, riders, equipment, finances and race results. Unregistered teams are removed on day 15.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setShowWelcome(false)} className="rounded-lg border px-4 py-2">Continue testing</button>
          <Link to="/test-account-register" className="rounded-lg bg-amber-700 px-4 py-2 text-white">Register now</Link>
        </div>
      </div>
    </div>}
  </>
}
