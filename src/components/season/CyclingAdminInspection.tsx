import React from 'react'
import { Clock3, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'

export type CyclingMigrationInspectionReport = {
  authorized: boolean
  read_only: boolean
  checked_at: string
  window_phase: string
  migration_started_at: string | null
  earliest_reopen_at: string | null
  game: {
    season: number
    month: number
    day: number
    hour: number
    minute: number
    paused: boolean
    clock_paused: boolean
    speed_multiplier: number
  }
  migration: {
    status: string | null
    completed_at: string | null
    core_validated: boolean
    rewards_applied: boolean
    notifications_done: boolean
    final_validated: boolean
  }
  snapshot_count: number
  season2_race_count: number
  season2_stage_count: number
  early_january_race_count: number
  season2_ranking_awards: number
  source_reward_grants: number
}

function localTime(date: string | null): string {
  if (!date) return 'Not scheduled'
  const value = new Date(date)
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      }).format(value)
    : 'Unavailable'
}

function Verdict({ ok, positive = 'Passed', negative = 'Needs review' }: {
  ok: boolean; positive?: string; negative?: string
}) {
  return <span className={ok ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
    {ok ? positive : negative}
  </span>
}

export function CyclingAdminInspection({ report, onRefresh, onSignOut, busy, error }: {
  report: CyclingMigrationInspectionReport
  onRefresh: () => void
  onSignOut: () => void
  busy: boolean
  error: string | null
}): JSX.Element {
  const gameTime = [
    String(report.game.day).padStart(2, '0'),
    String(report.game.month).padStart(2, '0'),
  ].join('.') + ' · ' +
    String(report.game.hour).padStart(2, '0') + ':' +
    String(report.game.minute).padStart(2, '0')
  const checks: Array<[string, boolean]> = [
    ['Core transition', report.migration.core_validated],
    ['Competition rewards', report.migration.rewards_applied],
    ['Player notifications', report.migration.notifications_done],
    ['Final integrity validation', report.migration.final_validated],
  ]
  return (
    <main className="min-h-screen bg-[#081224] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-xl bg-white p-5 shadow-lg sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                <LockKeyhole size={17} /> Authorized inspection only
              </p>
              <h1 className="mt-2 text-2xl font-bold">Season 2 migration inspection</h1>
              <p className="mt-2 text-sm text-slate-600">
                Read-only production status. The game is still closed to players.
                This screen cannot edit teams, process races, or resume the clock.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onRefresh} disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                <RefreshCw size={16} /> Refresh
              </button>
              <button type="button" onClick={onSignOut} disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Sign out
              </button>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="flex items-center gap-2 text-base font-bold"><Clock3 size={18} /> Game clock</h2>
            <p className="mt-3 text-lg font-semibold">
              Season {report.game.season} · {gameTime}
            </p>
            <p className="mt-2 text-sm">Game paused: <Verdict ok={report.game.paused && report.game.clock_paused} positive="Yes" negative="No" /></p>
            <p className="mt-1 text-sm">Resume speed configured: {report.game.speed_multiplier}×</p>
          </section>
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="flex items-center gap-2 text-base font-bold"><LockKeyhole size={18} /> Access window</h2>
            <p className="mt-3 text-sm">Current phase: <strong>{report.window_phase}</strong></p>
            <p className="mt-2 text-sm">Earliest player reopening:</p>
            <p className="font-semibold">{localTime(report.earliest_reopen_at)}</p>
            <p className="mt-2 text-xs text-slate-500">Reopening requires successful verification and completion of the minimum migration window.</p>
          </section>
        </div>

        <section className="rounded-xl bg-white p-5 shadow sm:p-7">
          <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} /> Migration integrity checks</h2>
          <p className="mt-2 text-sm">Production migration status: <strong>{report.migration.status ?? 'Unknown'}</strong></p>
          <p className="mt-1 text-xs text-slate-500">
            Completed: {localTime(report.migration.completed_at)}
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            {checks.map(([label, ok]) => (
              <div key={label} className="flex justify-between gap-4 py-3 text-sm">
                <span>{label}</span>
                <Verdict ok={ok} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow sm:p-7">
          <h2 className="text-base font-bold">Verified database totals</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([
              ['Frozen Season 1 club snapshots', report.snapshot_count],
              ['Season 2 races', report.season2_race_count],
              ['Season 2 race stages', report.season2_stage_count],
              ['Early January races', report.early_january_race_count],
              ['Season 2 ranking awards', report.season2_ranking_awards],
              ['Season 1 competition reward grants', report.source_reward_grants],
            ] as Array<[string, number]>).map(([label, amount]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">{label}</p>
                <p className="mt-1 text-lg font-bold">{amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="px-1 text-center text-xs text-slate-300">
          Inspected at {localTime(report.checked_at)}. Inspection does not approve early reopening.
        </p>
      </div>
    </main>
  )
}
