/**
 * SAT-02: upgrade the current temporary FULL-GAME Auth UUID in place.
 * Never signUp or create another club; no data migration should be needed.
 * Feature remains behind the OFF-by-default test account rollout flag.
 */
import React from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

const ENABLED = import.meta.env.VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'
const ORIGINAL_ID_KEY = 'saturn-fullgame-conversion-uuid'

export default function TestAccountRegister(): JSX.Element {
  const { user, loading, refreshUser } = useAuth()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [originId, setOriginId] = React.useState<string | null>(() => {
    try { return window.localStorage.getItem(ORIGINAL_ID_KEY) } catch { return null }
  })

  React.useEffect(() => {
    if (!ENABLED || !user?.id || user.is_anonymous !== true) return
    if (originId) return
    setOriginId(user.id)
    try { window.localStorage.setItem(ORIGINAL_ID_KEY, user.id) } catch { /* no storage */ }
  }, [user?.id, user?.is_anonymous, originId])

  async function addEmail(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !user?.is_anonymous || user.id !== originId) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('Enter a valid email address.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setStatus(error ? 'Email linking failed. If it belongs to an existing account, contact support instead of creating another account.' : 'Check your email for a verification link, then come back to this account.')
    setBusy(false)
  }

  async function refresh() {
    await refreshUser()
    const { data, error } = await supabase.auth.getUser()
    setStatus(error || data.user?.id !== originId ? 'Unable to confirm the original account identity.' :
      data.user?.is_anonymous === false && Boolean(data.user.email_confirmed_at) ? 'Email confirmed. Set a password to finish.' : 'Email confirmation is still pending.')
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !originId || user?.id !== originId || user?.is_anonymous !== false ||
        !user.email_confirmed_at || !user.email) return
    if (password.length < 8 || password !== confirm) {
      setStatus('Choose a password of at least eight characters and confirm it.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPassword('')
    setConfirm('')
    const { data } = await supabase.auth.getUser()
    setStatus(!error && data.user?.id === originId && data.user?.is_anonymous === false ?
      'Permanent account verified. Your team and its original user ID have been preserved.' :
      'Could not verify completion; your existing team has not been deleted. Contact support.')
    await refreshUser()
    setBusy(false)
  }

  if (!ENABLED) return <main className="p-10"><p>Test account registration is not publicly available yet.</p><Link to="/register" className="underline">Regular registration</Link></main>
  if (loading) return <main className="p-10">Checking your test account…</main>
  const same = Boolean(user?.id && originId === user.id)
  const verified = same && user?.is_anonymous === false && Boolean(user?.email_confirmed_at && user?.email)
  return <main className="mx-auto max-w-xl p-6 sm:p-10 space-y-5">
    <h1 className="text-3xl font-semibold">Keep your cycling team</h1>
    <p>Register this same account to retain your riders, equipment, finances and race history. Your trial Premium expiration does not restart.</p>
    <p className="text-sm text-amber-700">Keep this browser session available until verification finishes. Do not use the normal new-account registration form to convert an existing test account.</p>
    {!same && <p role="alert">We cannot verify your original test identity. Contact support before continuing.</p>}
    {same && user?.is_anonymous === true && <form onSubmit={e => void addEmail(e)} className="space-y-3">
      <label htmlFor="saturn-convert-email" className="block">Email address</label>
      <input id="saturn-convert-email" required type="email" autoComplete="email" className="w-full rounded border p-3" value={email} onChange={e => setEmail(e.target.value)} />
      <button disabled={busy} className="rounded bg-amber-700 px-4 py-2 text-white">Send verification</button>
    </form>}
    {same && <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border px-4 py-2">I've confirmed my email — check status</button>}
    {verified && <form onSubmit={e => void finish(e)} className="space-y-3">
      <label htmlFor="saturn-convert-password" className="block">New password</label>
      <input id="saturn-convert-password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border p-3" value={password} onChange={e => setPassword(e.target.value)} />
      <label htmlFor="saturn-confirm-password" className="block">Confirm password</label>
      <input id="saturn-confirm-password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border p-3" value={confirm} onChange={e => setConfirm(e.target.value)} />
      <button disabled={busy} className="rounded bg-amber-700 px-4 py-2 text-white">Complete registration</button>
    </form>}
    <p role="status" aria-live="polite">{status}</p>
    <Link to="/dashboard/overview" className="underline">Return to my team</Link>
  </main>
}
