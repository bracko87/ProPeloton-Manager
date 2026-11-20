/**
 * Saturn guest-only practice area. No official club, riders, rewards or races.
 * This screen is deliberately unavailable to permanent accounts.
 * It is NOT linked from public navigation while Guest Mode is disabled.
 */
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { guestSupabase } from '../lib/guestSupabase'
import type { User } from '@supabase/supabase-js'

type Role = 'Sprinter' | 'Climber' | 'All-rounder'
type Rider = { id: number; name: string; role: Role; training: number }
type GuestDraft = { version: 1; nickname: string; teamName: string; country: string; primaryColor: string; secondaryColor: string; riders: Rider[] }
const INITIAL_DRAFT: GuestDraft = {
  version: 1,
  nickname: '',
  teamName: '',
  country: '',
  primaryColor: '#2563EB',
  secondaryColor: '#FFFFFF',
  riders: [
    { id: 1, name: 'Alex Marin', role: 'Sprinter', training: 0 },
    { id: 2, name: 'Leo Novak', role: 'Climber', training: 0 },
    { id: 3, name: 'Sam Rossi', role: 'All-rounder', training: 0 },
  ],
}

function isDraft(value: unknown): value is GuestDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<GuestDraft>
  return d.version === 1 &&
    typeof d.nickname === 'string' && d.nickname.length <= 32 &&
    typeof d.country === 'string' && d.country.length <= 60 &&
    typeof d.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(d.primaryColor) &&
    typeof d.secondaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(d.secondaryColor) &&
    typeof d.teamName === 'string' && d.teamName.length <= 64 &&
    Array.isArray(d.riders) && d.riders.length === 3 &&
    d.riders.every((r, i) => r && r.id === i + 1 &&
      typeof r.name === 'string' && r.name.length <= 64 &&
      ['Sprinter', 'Climber', 'All-rounder'].includes(r.role) &&
      Number.isInteger(r.training) && r.training >= 0 && r.training <= 10)
}

export default function GuestPracticePage(): JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<GuestDraft>(INITIAL_DRAFT)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const isGuest = user?.is_anonymous === true

  // Restore only the Saturn guest session. The official account session and
  // its AuthProvider never receive this identity.
  useEffect(() => {
    let active = true
    const { data: { subscription } } = guestSupabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return
        setUser(session?.user?.is_anonymous === true ? session.user : null)
        setLoading(false)
      }
    )
    void guestSupabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      setUser(!error && data.user?.is_anonymous === true ? data.user : null)
      setLoading(false)
    }).catch(() => { if (active) setLoading(false) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!isGuest) { setReady(true); return }
    let active = true
    void (async () => {
      const { data, error } = await guestSupabase
        .from('saturn_guest_drafts_v1')
        .select('draft, created_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!active) return
      if (error) setNotice('Practice storage is not available. Changes cannot be saved.')
      else if (data?.draft && isDraft(data.draft)) {
        setDraft(data.draft)
        setHasDraft(true)
        setStartedAt(data.created_at)
        setExpiresAt(new Date(new Date(data.created_at).getTime() + 7 * 86400000).toISOString())
      }
      setReady(true)
    })()
    return () => { active = false }
  }, [isGuest, loading, user?.id])

  async function save(next: GuestDraft): Promise<void> {
    if (!isGuest || !ready || busy || (expiresAt && Date.now() >= Date.parse(expiresAt))) return
    setBusy(true)
    setNotice('')
    // Update only the draft column after initial insertion: never rewrite owner ID.
    const query = guestSupabase.from('saturn_guest_drafts_v1')
    const { error } = hasDraft
      ? await query.update({ draft: next }).eq('user_id', user.id)
      : await query.insert({ user_id: user.id, draft: next })
    if (error) setNotice('Could not save your practice changes. Please try again.')
    else {
      setHasDraft(true)
      if (!startedAt) {
        const start = new Date()
        setStartedAt(start.toISOString())
        setExpiresAt(new Date(start.getTime() + 7 * 86400000).toISOString())
      }
      setDraft(next)
      setNotice('Practice progress saved.')
    }
    setBusy(false)
  }

  if (loading || !ready) return <main className="min-h-screen bg-slate-950 p-10 text-white">Loading practice area…</main>
  if (!isGuest) {
    return <main className="min-h-screen bg-slate-950 p-10 text-white">
      <h1 className="text-2xl mb-4">Guest practice only</h1>
      <p>This practice area is reserved for a temporary guest session. Guest Mode is not open yet.</p>
      <Link className="underline mt-4 inline-block" to="/">Return home</Link>
    </main>
  }

  const setupComplete = Boolean(draft.nickname.trim() && draft.teamName.trim() && draft.country.trim())
  const expired = Boolean(expiresAt && Date.now() >= Date.parse(expiresAt))
  const validSetup = draft.nickname.trim().length >= 2 &&
    draft.teamName.trim().length >= 3 && draft.country.trim().length >= 2 &&
    draft.primaryColor !== draft.secondaryColor

  return <main className="min-h-screen bg-slate-950 text-slate-100 p-5 sm:p-10">
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <p className="text-amber-300 text-sm mb-2">7-day Practice League · Not an official division</p>
        <h1 className="text-3xl font-semibold">{setupComplete ? draft.teamName : 'Create your practice team'}</h1>
        <p className="text-slate-300 mt-2">No email or password needed to try the game. Your practice team cannot enter official rankings, divisions, races or finances.</p>
        {expiresAt && <p className="text-sm text-slate-300 mt-2">Practice access ends {new Date(expiresAt).toLocaleDateString()}.</p>}
      </header>
      {expired ? <section className="rounded-xl border border-amber-500 p-5 space-y-3">
        <h2 className="text-xl">Your 7-day practice period has ended</h2>
        <p>Your team setup is kept as a draft. Convert to an account to continue. Demo riders and training gains do not become official assets.</p>
        <Link to="/guest-convert" className="underline">Keep your team identity</Link>
      </section> : !setupComplete || !hasDraft ? <section className="rounded-xl bg-slate-900 border border-slate-700 p-5 space-y-4">
        <h2 className="text-xl font-medium">Your test player setup</h2>
        <div><label htmlFor="guest-nickname" className="block text-sm mb-2">Manager nickname</label>
          <input id="guest-nickname" maxLength={32} value={draft.nickname}
            onChange={e => setDraft(old => ({ ...old, nickname: e.target.value }))}
            className="w-full bg-slate-800 rounded-lg p-3 border border-slate-600" /></div>
        <div><label htmlFor="guest-team-name" className="block text-sm mb-2">Team name</label>
          <input id="guest-team-name" maxLength={40} value={draft.teamName}
            onChange={e => setDraft(old => ({ ...old, teamName: e.target.value }))}
            className="w-full bg-slate-800 rounded-lg p-3 border border-slate-600" /></div>
        <div><label htmlFor="guest-country" className="block text-sm mb-2">Team country</label>
          <input id="guest-country" maxLength={60} value={draft.country}
            onChange={e => setDraft(old => ({ ...old, country: e.target.value }))}
            className="w-full bg-slate-800 rounded-lg p-3 border border-slate-600" /></div>
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">Primary jersey color
            <input type="color" className="block mt-2" value={draft.primaryColor}
              onChange={e => setDraft(old => ({ ...old, primaryColor: e.target.value }))} /></label>
          <label className="text-sm">Secondary jersey color
            <input type="color" className="block mt-2" value={draft.secondaryColor}
              onChange={e => setDraft(old => ({ ...old, secondaryColor: e.target.value }))} /></label>
        </div>
        <button type="button" disabled={busy || !validSetup} onClick={() => void save({
          ...draft, nickname: draft.nickname.trim(), teamName: draft.teamName.trim(), country: draft.country.trim()
        })} className="rounded-lg bg-emerald-700 px-5 py-3 disabled:opacity-50">Create practice team</button>
      </section> : <>
        <section className="rounded-xl bg-slate-900 border border-slate-700 p-5">
          <p className="text-sm text-slate-400">Manager: {draft.nickname} · {draft.country}</p>
          <h2 className="text-xl mt-2">Practice League — Entry level</h2>
          <p className="text-sm text-slate-300 mt-2">This is a separate simulated league. Your temporary team occupies no official division slot.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-medium">Starter riders</h2>
          {draft.riders.map(r => <article key={r.id} className="rounded-xl bg-slate-900 border border-slate-700 p-4 flex flex-wrap items-center gap-4 justify-between">
            <div><p className="font-medium">{r.name}</p><p className="text-sm text-slate-400">{r.role} · Practice training: {r.training}/10</p></div>
            <button type="button" disabled={busy || r.training >= 10} onClick={() => void save({
              ...draft, riders: draft.riders.map(item => item.id === r.id ? { ...item, training: item.training + 1 } : item)
            })} className="rounded-lg bg-blue-700 px-4 py-2 disabled:opacity-50">Practice training</button>
          </article>)}
        </section>
      </>}
      <p role="status" aria-live="polite" className="text-sm text-amber-200">{notice}</p>
      <p className="text-sm text-slate-300">Temporary browser sessions may be lost if site data is cleared. Converting to a verified account preserves your identity and setup choices, not simulated competition results.</p>
      <Link to="/guest-convert" className="underline inline-block mr-5">Create permanent account</Link>
      <Link to="/" className="underline inline-block">Return home</Link>
    </div>
  </main>
}
