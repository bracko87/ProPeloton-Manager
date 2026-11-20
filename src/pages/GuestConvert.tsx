/**
 * Saturn SAT-02: opt-in email upgrade of the EXISTING guest Auth identity.
 *
 * Never calls signUp(), signInWithPassword() or creates a second Auth user.
 * Conversion stays behind the existing disabled anonymous-signup gate.
 * This is a development flow requiring real staging verification before release.
 */
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { User } from '@supabase/supabase-js'
import { guestSupabase } from '../lib/guestSupabase'

const ORIGINAL_GUEST_ID_KEY = 'ppm-saturn-original-guest-uuid-v1'

function getOriginalGuestId(): string | null {
  try {
    const value = window.localStorage.getItem(ORIGINAL_GUEST_ID_KEY)
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null
  } catch { return null }
}

function rememberOriginalGuestId(id: string): void {
  try { window.localStorage.setItem(ORIGINAL_GUEST_ID_KEY, id) } catch { /* Browser storage may be blocked. */ }
}

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export default function GuestConvertPage(): JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [originalId, setOriginalId] = useState<string | null>(() => getOriginalGuestId())
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [emailRequested, setEmailRequested] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)

  async function refreshIdentity(): Promise<void> {
    const { data, error } = await guestSupabase.auth.getUser()
    if (error || !data.user) {
      setMessage('Unable to verify your guest session. Do not start a new registration.')
      return
    }
    if (originalId && data.user.id !== originalId) {
      setMessage('Account identity changed unexpectedly. Conversion stopped. Contact support.')
      return
    }
    setUser(data.user)
    if (!originalId && data.user.is_anonymous === true) {
      setOriginalId(data.user.id)
      rememberOriginalGuestId(data.user.id)
    }
    if (data.user.is_anonymous === true) {
      setMessage('Your email is not yet confirmed. Open the verification email and return to this browser.')
    } else if (!data.user.email_confirmed_at || !data.user.email) {
      setMessage('An identity was linked, but email verification is not complete.')
    } else {
      setMessage('Email verified. You can now set a password for this same account.')
    }
  }

  useEffect(() => {
    let alive = true
    const { data: { subscription } } = guestSupabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!alive) return
        if (session?.user) setUser(session.user)
      },
    )
    void guestSupabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return
      if (!error && data.user) {
        setUser(data.user)
        if (data.user.is_anonymous === true && !getOriginalGuestId()) {
          setOriginalId(data.user.id)
          rememberOriginalGuestId(data.user.id)
        }
      }
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  async function requestEmail(): Promise<void> {
    if (!user?.is_anonymous || !originalId || user.id !== originalId || busy) return
    if (!validEmail(email)) { setMessage('Enter a valid email address.'); return }
    setBusy(true)
    setMessage('')
    // The authenticated guest owns this Auth UUID. This does not create a new
    // account. Supabase must have manual linking enabled for conversion.
    const { error } = await guestSupabase.auth.updateUser({ email: email.trim() })
    if (error) {
      setMessage('Email could not be linked. It may already belong to an account. Please use another email or contact support; do not create a second account.')
    } else {
      setEmailRequested(true)
      setMessage('Check your email for verification, then return to this browser. Your guest session must stay available.')
    }
    setBusy(false)
  }

  async function setVerifiedPassword(): Promise<void> {
    if (!user || user.is_anonymous === true || !user.email_confirmed_at || !user.email ||
        !originalId || user.id !== originalId || busy) return
    if (password.length < 8 || password !== confirm) {
      setMessage('Use a password of at least 8 characters and enter it identically twice.')
      return
    }
    setBusy(true)
    const { error } = await guestSupabase.auth.updateUser({ password })
    setPassword('')
    setConfirm('')
    if (error) setMessage('Could not set your password. Your verified account remains intact; retry safely.')
    else {
      const { data, error: verifyError } = await guestSupabase.auth.getUser()
      if (verifyError || data.user?.id !== originalId || data.user?.is_anonymous !== false) {
        setMessage('Password submitted but identity verification was inconclusive. Contact support before proceeding.')
      } else {
        setPasswordSaved(true)
        setMessage('Your account now uses the same user ID as your guest session. Your practice draft stays stored under that ID.')
      }
    }
    setBusy(false)
  }

  if (loading) return <main className="min-h-screen bg-slate-950 p-10 text-white">Checking guest account…</main>
  if (!user) return <main className="min-h-screen bg-slate-950 p-10 text-white">
    <h1 className="text-2xl">No recoverable guest session</h1>
    <p>Do not create a replacement account to recover lost guest progress. Contact support if you need assistance.</p>
    <Link to="/" className="underline">Home</Link>
  </main>

  const verified = user.is_anonymous === false && Boolean(user.email_confirmed_at && user.email)
  const sameId = Boolean(originalId && user.id === originalId)

  return <main className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-12">
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-semibold">Keep your practice progress</h1>
      <p className="text-slate-300">Convert this guest identity into a permanent account without transferring it to a different user. Email verification is required before setting a password.</p>
      <p className="text-sm text-amber-300">Do not sign out, clear browser data or switch devices until verification is complete. Existing-account merging is not supported.</p>
      {!sameId && <p role="alert" className="text-red-300">Guest identity could not be verified for conversion. No changes can be made.</p>}
      {sameId && !verified && <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-5">
        <label htmlFor="saturn-upgrade-email" className="block">Email address</label>
        <input id="saturn-upgrade-email" type="email" autoComplete="email" maxLength={254}
          className="w-full rounded-lg bg-slate-800 p-3" value={email} disabled={busy || !user.is_anonymous}
          onChange={e => setEmail(e.target.value)} />
        <button type="button" disabled={busy || !user.is_anonymous} onClick={() => void requestEmail()}
          className="rounded-lg bg-emerald-700 px-4 py-2 disabled:opacity-50">Send email verification</button>
        {emailRequested && <button type="button" disabled={busy} onClick={() => void refreshIdentity()}
          className="ml-3 rounded-lg border border-slate-500 px-4 py-2">I've verified my email</button>}
      </section>}
      {sameId && verified && !passwordSaved && <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-lg">Set your login password</h2>
        <label htmlFor="saturn-upgrade-password" className="block">Password</label>
        <input id="saturn-upgrade-password" type="password" autoComplete="new-password" minLength={8}
          className="w-full rounded-lg bg-slate-800 p-3" value={password} onChange={e => setPassword(e.target.value)} />
        <label htmlFor="saturn-upgrade-confirm" className="block">Confirm password</label>
        <input id="saturn-upgrade-confirm" type="password" autoComplete="new-password"
          className="w-full rounded-lg bg-slate-800 p-3" value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button type="button" disabled={busy} onClick={() => void setVerifiedPassword()}
          className="rounded-lg bg-emerald-700 px-4 py-2 disabled:opacity-50">Finish account conversion</button>
      </section>}
      {passwordSaved && <p className="rounded-xl border border-emerald-700 p-4">
        Your email/password account is ready. You may use the normal login page. Practice riders and training do not automatically become official multiplayer assets.
      </p>}
      <p role="status" aria-live="polite" className="text-sm text-amber-200">{message}</p>
      <Link to="/guest-practice" className="underline">Back to practice</Link>
    </div>
  </main>
}
