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
type GuestDraft = { version: 1; teamName: string; riders: Rider[] }
const INITIAL_DRAFT: GuestDraft = {
  version: 1,
  teamName: 'My Practice Team',
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
        .select('draft')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!active) return
      if (error) setNotice('Practice storage is not available. Changes cannot be saved.')
      else if (data?.draft && isDraft(data.draft)) { setDraft(data.draft); setHasDraft(true) }
      setReady(true)
    })()
    return () => { active = false }
  }, [isGuest, loading, user?.id])

  async function save(next: GuestDraft): Promise<void> {
    if (!isGuest || !ready || busy) return
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

  return <main className="min-h-screen bg-slate-950 text-slate-100 p-5 sm:p-10">
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <p className="text-amber-300 text-sm mb-2">Practice mode — not the official multiplayer world</p>
        <h1 className="text-3xl font-semibold">Your practice cycling team</h1>
        <p className="text-slate-300 mt-2">Experiment with a squad and training. Practice results do not affect real races, standings, coins or Premium.</p>
      </header>
      <section className="rounded-xl bg-slate-900 border border-slate-700 p-5">
        <label htmlFor="guest-team-name" className="block text-sm mb-2">Temporary team name</label>
        <input id="guest-team-name" maxLength={64} className="w-full bg-slate-800 rounded-lg p-3 border border-slate-600"
          value={draft.teamName} onChange={e => setDraft(old => ({ ...old, teamName: e.target.value }))} />
        <button type="button" disabled={busy || !draft.teamName.trim()} onClick={() => void save({ ...draft, teamName: draft.teamName.trim() })}
          className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 disabled:opacity-50">Save team name</button>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Practice riders</h2>
        {draft.riders.map(r => <article key={r.id} className="rounded-xl bg-slate-900 border border-slate-700 p-4 flex flex-wrap items-center gap-4 justify-between">
          <div><p className="font-medium">{r.name}</p><p className="text-sm text-slate-400">{r.role} · Training sessions: {r.training}/10</p></div>
          <button type="button" disabled={busy || r.training >= 10}
            onClick={() => void save({ ...draft, riders: draft.riders.map(item => item.id === r.id ? { ...item, training: item.training + 1 } : item) })}
            className="rounded-lg bg-blue-700 px-4 py-2 disabled:opacity-50">Run practice training</button>
        </article>)}
      </section>
      <p role="status" aria-live="polite" className="text-sm text-amber-200">{notice}</p>
      <aside className="border-t border-slate-700 pt-4 text-sm text-slate-300">
        Guest sessions are temporary. If your browser session is lost, this practice team may not be recoverable. Account conversion is not available yet.
      </aside>
      <Link to="/" className="underline inline-block">Return to homepage</Link>
    </div>
  </main>
}
