/**
 * SAT-01: full-game temporary team onboarding, behind an OFF-by-default flag.
 * This form never writes real clubs directly. The future dedicated server RPC
 * must create club + lifecycle in ONE authorized transaction.
 */
import React, { useState } from 'react'
import SaturnPage from '../components/trial/SaturnPage'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { testClient, SATURN_TEST_ACCOUNTS_ENABLED as ENABLED } from '../lib/testAccountClient'
import { SaturnGuestCaptcha, SATURN_TURNSTILE_SITE_KEY } from '../components/auth/SaturnGuestCaptcha'

export default function TestTeamSignupPage(): JSX.Element {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [team, setTeam] = useState('')
  const [country, setCountry] = useState('')
  const [primary, setPrimary] = useState('#FFC400')
  const [secondary, setSecondary] = useState('#111827')
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [error, setError] = useState('')
  const [testerReference, setTesterReference] = useState<string | null>(null)

  React.useEffect(() => {
    if (!ENABLED) return
    let active = true
    void supabase.from('countries').select('code, name').eq('is_selectable', true)
      .order('name', { ascending: true }).then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) setError('Countries are temporarily unavailable.')
        else setCountries(data ?? [])
      })
    return () => { active = false }
  }, [])

  async function begin(event: React.FormEvent) {
    event.preventDefault()
    if (!ENABLED || busy) return
    // Fail closed even if the browser attempts to submit without the widget.
    // Supabase Auth MUST validate this token with the Turnstile secret.
    if (!SATURN_TURNSTILE_SITE_KEY || !captchaToken) {
      setError('Complete the security verification before creating a test team.')
      return
    }
    const managerName = nickname.trim()
    const teamName = team.trim()
    if (managerName.length < 3 || managerName.length > 24 ||
        teamName.length < 3 || teamName.length > 40 ||
        !countries.some(c => c.code === country) || primary === secondary) {
      setError('Choose a nickname, a team name, a country and two different colors.')
      return
    }
    setBusy(true)
    setError('')
    setTesterReference(null)
    try {
      const { data: previous, error: previousError } = await testClient.auth.getUser()
      if (previousError && previousError.status !== 400 && previousError.status !== 401) throw previousError
      if (previous.user && !previous.user.is_anonymous) throw new Error('This browser already has a permanent account. Please use Register or Login.')
      if (!previous.user) {
        // Production trigger continues to reject this until explicit security sign-off.
        const { error: signinError } = await testClient.auth.signInAnonymously({
          options: { captchaToken },
        })
        if (signinError) throw signinError
      }
      const { data: authenticated, error: authError } = await testClient.auth.getUser()
      if (authError || !authenticated.user?.is_anonymous) throw new Error('Test session could not be verified.')

      // No direct INSERT on clubs, test-account records or premium/coin tables.
      // This RPC intentionally does not exist until the server-side audit is complete.
      const { data: clubId, error: createError } = await testClient.rpc('saturn_create_test_club_v1', {
        p_nickname: managerName,
        p_name: teamName,
        p_country_code: country,
        p_primary_color: primary,
        p_secondary_color: secondary,
      })
      if (createError?.message === 'Restricted test access: approval required') {
        setTesterReference(authenticated.user.id)
        setError('This test is currently private. Send the tester reference below to the game administrator, then retry after approval.')
        return
      }
      if (createError || typeof clubId !== 'string') throw new Error(createError?.message ?? 'Club could not be created.')
      const { data: session } = await testClient.auth.getSession()
      if (!session.session) throw new Error('Guest session unavailable after creating the club.')
      // The normal game client has no persistent session; transfer in-memory
      // ONLY after the server confirms the official team was created.
      const { error: transferError } = await supabase.auth.setSession({
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
      })
      if (transferError) throw transferError
      navigate('/dashboard/overview', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the test team.')
    } finally {
      // Tokens are short-lived and single-use: never reuse on retry.
      setCaptchaToken(null)
      setCaptchaAttempt(attempt => attempt + 1)
      setBusy(false)
    }
  }

  if (!ENABLED) return <SaturnPage className="p-8">
    <div className="max-w-xl mx-auto mt-16 space-y-4">
      <h1 className="text-3xl">Test Player Mode is coming soon</h1>
      <p>We are finalizing safeguards for fourteen days of real game access and the first seven days of Premium. Regular registration is available.</p>
      <Link to="/register" className="inline-flex rounded-lg bg-yellow-400 text-slate-950 px-5 py-3">Register normally</Link>
    </div>
  </SaturnPage>

  return <SaturnPage className="p-6 sm:p-12">
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-3xl font-semibold">Test ProPeloton for 14 days</h1>
      <p>Build a real cycling team and play the full management game. No email or password is required until you decide to register. Your first seven days include the Premium trial.</p>
      <p className="text-sm text-amber-300">Your test account expires after 14 days. To keep playing, link a permanent account before or after expiry. Clearing browser data before registration may lose access.</p>
      <form onSubmit={e => void begin(e)} className="space-y-4 rounded-xl bg-slate-900 p-5">
        <label className="block text-sm" htmlFor="saturn-nickname">Manager nickname</label>
        <input id="saturn-nickname" required minLength={3} maxLength={24} autoComplete="nickname" value={nickname}
          onChange={e => setNickname(e.target.value)} className="w-full rounded-md bg-slate-800 p-3" />
        <label className="block text-sm" htmlFor="saturn-team">Team name</label>
        <input id="saturn-team" required minLength={3} maxLength={40} value={team}
          onChange={e => setTeam(e.target.value)} className="w-full rounded-md bg-slate-800 p-3" />
        <label className="block text-sm" htmlFor="saturn-country">Team country</label>
        <select id="saturn-country" required value={country} onChange={e => setCountry(e.target.value)}
          className="w-full rounded-md bg-slate-800 p-3">
          <option value="">Choose a country</option>
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <div className="flex gap-6">
          <label>Primary color<input type="color" className="block mt-2" value={primary} onChange={e => setPrimary(e.target.value)} /></label>
          <label>Secondary color<input type="color" className="block mt-2" value={secondary} onChange={e => setSecondary(e.target.value)} /></label>
        </div>
        <SaturnGuestCaptcha key={captchaAttempt} onTokenChange={setCaptchaToken} />
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {testerReference && <p className="break-all text-sm">Tester reference: <code>{testerReference}</code></p>}
        <button type="submit" disabled={busy || countries.length === 0 || !SATURN_TURNSTILE_SITE_KEY || !captchaToken} className="rounded-lg bg-yellow-400 text-slate-950 px-5 py-3 disabled:opacity-40">{busy ? 'Creating your team…' : 'Create team and start testing'}</button>
      </form>
      <p>Already decided to stay? <Link className="underline text-yellow-300" to="/register">Register a permanent account</Link></p>
      <Link className="underline" to="/">Back to homepage</Link>
    </div>
  </SaturnPage>
}
