import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flag,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'

type EventRow = {
  event_id: string
  race_day: number
  race_type: string
  event_date?: string | null
  status: string
  race_id?: string | null
  stage_id?: string | null
}

type GroupRow = {
  group_id: string
  group_number: number
  group_label: string
  status: string
  planned_entrant_count: number
  planned_advance_count: number
  entry_count: number
  scored_entry_count: number
  event_count: number
  scheduled_event_count: number
  overdue_event_count: number
  events: EventRow[]
}

type RoundRow = {
  round_id: string
  round_index: number
  round_type: string
  round_label: string
  status: string
  starts_on?: string | null
  ends_on?: string | null
  entrants_target: number
  advance_target: number
  group_count: number
  groups: GroupRow[]
}

type OperationsPayload = {
  season_number: number
  game_date: string
  health: {
    status: 'success' | 'error'
    issues: number
    summary: string
    details: {
      generation_gate?: string | null
      active_associations?: number
      edition_missing_after_gate?: boolean
      unscheduled_groups?: number
      drawn_groups_without_entries?: number
      overdue_events?: number
      invalid_confirmed_squads?: number
      invalid_lineups?: number
      lineup_blocked_events_next_3_days?: number
      unsafe_scheduled_events?: number
    }
  }
  edition?: {
    id: string
    status: string
    active_association_count: number
    finalist_target: number
    host_country_code?: string | null
    champion_country_code?: string | null
    created_on_game_date?: string | null
    completed_on_game_date?: string | null
  } | null
  rounds: RoundRow[]
  team_checks: {
    nations_squads: number
    confirmed_squads: number
    invalid_squads: number
    confirmed_lineups: number
    invalid_lineups: number
  }
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatGameDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function statusClass(status?: string | null): string {
  if (['success', 'completed', 'ready', 'confirmed', 'drawn'].includes(String(status))) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (['qualification', 'planned', 'scheduled', 'active', 'in_progress'].includes(String(status))) {
    return 'border-sky-200 bg-sky-50 text-sky-800'
  }
  if (['warning'].includes(String(status))) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }
  if (['error', 'failed', 'overdue', 'blocked'].includes(String(status))) {
    return 'border-red-200 bg-red-50 text-red-800'
  }
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function StatusIcon({ status }: { status?: string | null }): JSX.Element {
  if (['success', 'completed', 'ready', 'confirmed', 'drawn'].includes(String(status))) {
    return <CheckCircle2 className="h-4 w-4" />
  }
  if (['error', 'failed', 'overdue', 'blocked'].includes(String(status))) {
    return <XCircle className="h-4 w-4" />
  }
  if (['qualification', 'active', 'in_progress'].includes(String(status))) {
    return <Activity className="h-4 w-4" />
  }
  return <Clock3 className="h-4 w-4" />
}

export default function AdminNationsOperationsPage(): JSX.Element {
  const [data, setData] = useState<OperationsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    const { data: result, error: rpcError } = await supabase.rpc(
      'get_admin_nations_operations_v1',
    )

    if (rpcError) {
      setError(rpcError.message)
      if (!silent) setLoading(false)
      return
    }

    setData((result ?? null) as OperationsPayload | null)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    void load()

    const interval = window.setInterval(() => {
      void load(true)
    }, 30000)

    return () => window.clearInterval(interval)
  }, [load])

  const runNow = async (): Promise<void> => {
    try {
      setRunning(true)
      setError(null)
      setMessage(null)

      const { data: result, error: rpcError } = await supabase.rpc(
        'run_admin_nations_runtime_v1',
      )
      if (rpcError) throw rpcError

      const status =
        result && typeof result === 'object' && 'operations_health' in result
          ? String((result as any).operations_health?.status ?? 'completed')
          : 'completed'

      setMessage(`World Nations runtime completed: ${humanize(status)}.`)
      await load(true)
    } catch (caught: any) {
      setError(caught?.message ?? 'Unable to run World Nations maintenance.')
    } finally {
      setRunning(false)
    }
  }

  const details = data?.health?.details ?? {}
  const issueCards = [
    ['Edition missing', details.edition_missing_after_gate ? 1 : 0],
    ['Unscheduled groups', details.unscheduled_groups ?? 0],
    ['Drawn without entries', details.drawn_groups_without_entries ?? 0],
    ['Overdue events', details.overdue_events ?? 0],
    ['Invalid squads', details.invalid_confirmed_squads ?? 0],
    ['Invalid lineups', details.invalid_lineups ?? 0],
    ['Lineup-blocked events · next 3 days', details.lineup_blocked_events_next_3_days ?? 0],
    ['Unsafe scheduled events', details.unsafe_scheduled_events ?? 0],
  ] as const

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading World Nations Operations...
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-slate-800" />
            <h2 className="text-2xl font-semibold text-slate-900">
              World Nations Operations
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Control Center for Association activation, elections, squads, schedules, races and competition progression.
          </p>
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <Link to="/dashboard/world-nations" className="text-yellow-700 hover:underline">
              Open player page
            </Link>
            <Link to="/dashboard/admin/system-health" className="text-yellow-700 hover:underline">
              System Health
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Run maintenance now
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className={`rounded border p-4 ${statusClass(data?.health?.status)}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <StatusIcon status={data?.health?.status} />
              Operations Health
            </div>
            <p className="mt-1 text-sm">{data?.health?.summary ?? 'No health result available.'}</p>
          </div>
          <div className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
            {data?.health?.issues ?? 0} issues
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded bg-white shadow">
        <div className="grid gap-px bg-slate-200 md:grid-cols-4">
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Game date</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              Season {data?.season_number ?? '—'} · {formatGameDate(data?.game_date)}
            </div>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Edition</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {data?.edition ? humanize(data.edition.status) : 'Not generated'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Gate: {formatGameDate(details.generation_gate)}
            </div>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Associations</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {data?.edition?.active_association_count ?? details.active_associations ?? 0}
            </div>
            <div className="mt-1 text-xs text-slate-500">Active and eligible</div>
          </div>
          <div className="bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Final target</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {data?.edition?.finalist_target ?? 16}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Host: {data?.edition?.host_country_code ?? 'Not selected'}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-slate-900">Automatic health checks</h3>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {issueCards.map(([label, count]) => (
            <div
              key={label}
              className={[
                'rounded border p-3',
                Number(count) > 0
                  ? 'border-red-200 bg-red-50'
                  : 'border-emerald-200 bg-emerald-50',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <span className={Number(count) > 0 ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                  {Number(count)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-700" />
            <h3 className="font-semibold text-slate-900">National Team checks</h3>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 md:grid-cols-5">
          {[
            ['Nations squads', data?.team_checks?.nations_squads ?? 0],
            ['Confirmed squads', data?.team_checks?.confirmed_squads ?? 0],
            ['Invalid squads', data?.team_checks?.invalid_squads ?? 0],
            ['Confirmed lineups', data?.team_checks?.confirmed_lineups ?? 0],
            ['Invalid lineups', data?.team_checks?.invalid_lineups ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </div>
              <div className={`mt-2 text-xl font-semibold ${
                String(label).startsWith('Invalid') && Number(value) > 0
                  ? 'text-red-700'
                  : 'text-slate-900'
              }`}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {(data?.rounds ?? []).map(round => (
          <div key={round.round_id} className="rounded bg-white shadow">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <div className="flex items-center gap-2">
                  {round.round_type === 'world_final' ? (
                    <Trophy className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <Flag className="h-5 w-5 text-slate-600" />
                  )}
                  <h3 className="font-semibold text-slate-900">{round.round_label}</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {round.entrants_target} entrants · {round.advance_target} advance · {formatGameDate(round.starts_on)}–{formatGameDate(round.ends_on)}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${statusClass(round.status)}`}>
                <StatusIcon status={round.status} />
                {humanize(round.status)}
              </span>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-2">
              {(round.groups ?? []).map(group => (
                <div key={group.group_id} className="overflow-hidden rounded border border-slate-200">
                  <div className="flex items-start justify-between gap-3 bg-slate-50 px-3 py-2.5">
                    <div>
                      <div className="font-semibold text-slate-900">{group.group_label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Entries {group.entry_count}/{group.planned_entrant_count} · scored {group.scored_entry_count} · advance {group.planned_advance_count}
                      </div>
                    </div>
                    <span className={`rounded border px-2 py-1 text-[11px] font-semibold ${statusClass(group.status)}`}>
                      {humanize(group.status)}
                    </span>
                  </div>

                  {group.overdue_event_count > 0 ? (
                    <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {group.overdue_event_count} overdue event(s)
                    </div>
                  ) : null}

                  <div className="divide-y divide-slate-100">
                    {(group.events ?? []).map(event => (
                      <div key={event.event_id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">
                            Day {event.race_day} · {humanize(event.race_type)}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatGameDate(event.event_date)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded border px-2 py-1 text-[11px] font-semibold ${statusClass(event.status)}`}>
                            {humanize(event.status)}
                          </span>
                          {event.race_id ? (
                            <Link
                              to={`/dashboard/races/${event.race_id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-700 hover:underline"
                            >
                              Race
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {(data?.rounds ?? []).length === 0 ? (
          <div className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow">
            No World Nations rounds have been generated for the current season yet.
          </div>
        ) : null}
      </section>
    </div>
  )
}
