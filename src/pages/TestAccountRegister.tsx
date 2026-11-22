/**
 * SAT-02: upgrade the current temporary FULL-GAME Auth UUID in place.
 * Never signUp or create another club; no data migration should be needed.
 * Feature remains behind the OFF-by-default test account rollout flag.
 */
import React from 'react'
import SaturnPage from '../components/trial/SaturnPage'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'
import { testClient, finishTestSessionPersistence } from '../lib/testAccountClient'

const ENABLED = import.meta.env.VITE_SATURN_TEST_ACCOUNTS_ENABLED === 'true'
const ORIGINAL_ID_KEY = 'saturn-fullgame-conversion-uuid'

export default function TestAccountRegister(): JSX.Element {
  const { user, loading, refreshUser } = useAuth()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [success, setSuccess] = React.useState<string | null>(null)
  const [verificationSent, setVerificationSent] = React.useState(false)
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
    const { error } = await supabase.auth.updateUser({ email: email.trim() }, {
      emailRedirectTo: window.location.origin + window.location.pathname + '?saturn_email_link=1#/test-account-register',
    })
    if (!error) setVerificationSent(true)
    setStatus(error ? 'Email linking failed. If it belongs to an existing account, contact support instead of creating another account.' : 'Check your email for a verification link, then come back to this account.')
    setBusy(false)
  }

  async function requestApprovedPlacement(): Promise<string> {
    // Registration uses the highest competition-safe AI slot and keeps progress.
    const { data: placement, error } = await supabase
      .rpc('saturn_place_converted_test_team_v1')
    if (error) return 'Your team is registered. Division placement can be reviewed later.'
    switch (placement?.status) {
      case 'moved_to_ai_slot':
      case 'moved_to_approved_vacancy':
        return 'Your team has been placed in ' +
          (placement.club_tier === 'worldteam' ? 'WorldTeam' : placement.club_tier === 'proteam' ? 'ProTeam' : 'Continental') +
          ' · World Tier ' + String(placement.world_tier) +
          '. Your riders, finances and results remain unchanged.'
      case 'already_placed':
        return 'Your previously approved division placement is already complete. Your team remains in that division.'
      case 'race_commitment_pending':
        return 'Your team remains in its current division until its ongoing race commitments finish.'
      case 'season_transition_pending':
        return 'Your team remains in its current division during the season transition.'
      default:
        return 'No competition-safe higher AI slot or regional reserve is available yet. Your registered team remains in its current division.'
    }
  }

  async function linkGoogle() {
    if (busy || !user?.id || user.id !== originId || user.is_anonymous !== true) return
    setBusy(true)
    try {
      // The persistent test Auth client owns the original session. Linking
      // Google through signInWithOAuth would create/switch account identities.
      const { data: original, error: authError } = await testClient.auth.getUser()
      if (authError || !original.user || original.user.id !== originId ||
          original.user.is_anonymous !== true) {
        setStatus('Original test session is unavailable. Do not use normal Google sign-in to convert.')
        return
      }

      const { error } = await testClient.auth.linkIdentity({
        provider: 'google',
        options: {
          // HashRouter callback: retain a query marker outside the hash so
          // the test Auth client alone consumes the returned OAuth code.
          redirectTo: window.location.origin + window.location.pathname +
            '?saturn_google_link=1#/test-account-register',
        },
      })
      if (error) {
        setStatus('Google identity linking could not start. Check that manual identity linking and redirect URLs are enabled.')
      } else {
        setStatus('Complete Google verification, then return here to finalize your existing team.')
      }
    } catch {
      setStatus('Google linking could not be started. Your existing test team is unchanged.')
    } finally {
      setBusy(false)
    }
  }

  async function finishGoogle() {
    if (busy || !originId) return
    setBusy(true)
    try {
      // Identity verification must come from Supabase Auth, not browser state.
      const { data: linked, error: identityError } = await testClient.auth.getUser()
      if (identityError || linked.user?.id !== originId ||
          linked.user.is_anonymous !== false ||
          !linked.user.identities?.some(identity => identity.provider === 'google')) {
        setStatus('Google has not yet been linked to your original test account. Complete linking in this browser first.')
        return
      }

      const { data: result, error: finalizeError } = await testClient
        .rpc('saturn_finalize_test_account_google_conversion_v1')
      if (finalizeError || result?.success !== true ||
          result?.converted !== true || result?.user_id !== originId ||
          result?.provider !== 'google') {
        setStatus('Google is linked, but the server has not confirmed team registration. Keep this session and contact support.')
        return
      }

      // One client retains the SAME linked Auth session; no refresh-token handoff.
      const { data: session } = await testClient.auth.getSession()
      if (!session.session || session.session.user.id !== originId) {
        setStatus('Registration is verified, but game session restoration is pending. Please sign in with Google using this account.')
        return
      }
      finishTestSessionPersistence(originId)
      window.localStorage.removeItem(ORIGINAL_ID_KEY)
      await refreshUser()
      window.dispatchEvent(new Event('saturn-registration-completed'))
      const placementMessage = await requestApprovedPlacement()
      setSuccess('Google registration completed on your original account. ' + placementMessage)
    } catch {
      setStatus('Could not confirm Google registration; do not create another team.')
    } finally {
      setBusy(false)
    }
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
    if (error || data.user?.id !== originId || data.user?.is_anonymous !== false ||
        !data.user.email || !data.user.email_confirmed_at) {
      setStatus('Could not verify the original account after password setup. Your test team has not been deleted.')
    } else {
      // A new non-anonymous Auth identity alone is not a completed conversion.
      // Mark the ORIGINAL lifecycle as converted on the server before success.
      const { data: result, error: finalizeError } = await supabase
        .rpc('saturn_finalize_test_account_email_conversion_v1')
      const converted = !finalizeError && result?.success === true &&
        result?.converted === true && result?.user_id === originId
      if (converted) {
        finishTestSessionPersistence(originId)
        window.localStorage.removeItem(ORIGINAL_ID_KEY)
        window.dispatchEvent(new Event('saturn-registration-completed'))
        const placementMessage = await requestApprovedPlacement()
        setSuccess('Registration completed on your original account. ' + placementMessage)
      } else {
        setStatus('Your email and password are linked, but the server could not complete team registration. Keep this session and contact support; do not create a second account.')
      }
    }
    await refreshUser()
    setBusy(false)
  }

  if (!ENABLED) return <SaturnPage className="p-6 sm:p-10"><div className="mx-auto max-w-xl space-y-4 rounded-xl bg-slate-900 p-6"><p>Test account registration is not publicly available yet.</p><Link to="/register" className="text-yellow-300 underline">Regular registration</Link></div></SaturnPage>
  if (loading) return <SaturnPage className="p-6 sm:p-10"><div className="mx-auto max-w-xl rounded-xl bg-slate-900 p-6">Checking your test account…</div></SaturnPage>
  if (success) return <SaturnPage className="p-6 sm:p-10">
    <section role="status" className="mx-auto max-w-xl rounded-xl border border-emerald-500 bg-slate-900 p-8 space-y-5 text-center">
      <div aria-hidden="true" className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-3xl text-white">✓</div>
      <h1 className="text-3xl font-bold text-white">Registration successful!</h1>
      <p className="text-emerald-300 font-semibold">Welcome to ProPeloton Manager. You are now a registered manager.</p>
      <p>{success}</p>
      <div className="rounded-lg bg-slate-800 p-4 space-y-2 text-left">
        <p>✓ Your original team and progress are preserved.</p>
        <p>✓ Your 20 welcome Coins have been credited.</p>
        <p>✓ Your existing Premium trial continues without restarting.</p>
        <p>✓ The 14-day guest deadline no longer applies.</p>
      </div>
      <Link replace to="/dashboard/overview" className="block rounded-lg bg-yellow-400 px-6 py-4 text-lg font-bold text-slate-950">Go to my dashboard →</Link>
    </section>
  </SaturnPage>
  const same = Boolean(user?.id && originId === user.id)
  const verified = same && user?.is_anonymous === false && Boolean(user?.email_confirmed_at && user?.email)
  return <SaturnPage className="p-6 sm:p-10">
    <section className="mx-auto max-w-xl space-y-5 rounded-xl bg-slate-900 p-6 sm:p-8">
    <p className="text-sm font-semibold text-yellow-300">{verified ? 'Step 2 of 2 · Finish registration' : verificationSent ? 'Step 1 of 2 · Verify your email' : 'Step 1 of 2 · Link your account'}</p>
    <h1 className="text-3xl font-semibold">{verified ? 'Email verified — set your password' : 'Keep your cycling team'}</h1>
    <p>Complete registration before the 14-day deadline to retain your riders, equipment, finances and race history. After the deadline your test team cannot be recovered. Your trial Premium expiration does not restart.</p>
    <p className="text-sm text-amber-300">Keep this browser session available until verification finishes. Do not use the normal new-account registration form to convert an existing test account.</p>
    {!same && <p role="alert">We cannot verify your original test identity. Contact support before continuing.</p>}
    {same && verificationSent && !verified && <div role="status" className="rounded-lg border border-emerald-500 bg-emerald-950 p-4">
      <h2 className="font-semibold text-emerald-200">Verification email sent</h2>
      <p>Open the email and click the verification button in this same browser. Then set your password to complete registration.</p>
    </div>}
    {same && user?.is_anonymous === true && <form onSubmit={e => void addEmail(e)} className="space-y-3">
      <label htmlFor="saturn-convert-email" className="block">Email address</label>
      <input id="saturn-convert-email" required type="email" autoComplete="email" className="w-full rounded border border-slate-600 bg-slate-800 p-3 text-white" value={email} onChange={e => setEmail(e.target.value)} />
      <button disabled={busy} className="rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Send verification</button>
    </form>}
    {same && !verified && <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-slate-500 px-4 py-2 hover:bg-slate-800">I've confirmed my email — check status</button>}
    {verified && <form onSubmit={e => void finish(e)} className="space-y-3">
      <label htmlFor="saturn-convert-password" className="block">New password</label>
      <input id="saturn-convert-password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border border-slate-600 bg-slate-800 p-3 text-white" value={password} onChange={e => setPassword(e.target.value)} />
      <label htmlFor="saturn-confirm-password" className="block">Confirm password</label>
      <input id="saturn-confirm-password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border border-slate-600 bg-slate-800 p-3 text-white" value={confirm} onChange={e => setConfirm(e.target.value)} />
      <button disabled={busy} className="rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Complete registration</button>
    </form>}
    {same && user?.is_anonymous === true && <div className="space-y-2 border-t border-slate-700 pt-4">
      <p className="text-sm">Or keep this exact team by linking a Google account.</p>
      <button type="button" disabled={busy} onClick={() => void linkGoogle()}
        className="rounded bg-yellow-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
        Link Google to this team
      </button>
    </div>}
    {same && user?.is_anonymous === false && user.identities?.some(identity => identity.provider === 'google') && <button type="button" disabled={busy}
      onClick={() => void finishGoogle()} className="rounded border border-slate-500 px-4 py-2 hover:bg-slate-800">
      Complete Google registration
    </button>}
    {status && <p role="status" aria-live="polite" className="rounded-lg border border-slate-500 bg-slate-800 p-4">{status}</p>}
    <Link to="/dashboard/overview" className="text-yellow-300 underline">Return to my team</Link>
    </section>
  </SaturnPage>
}
