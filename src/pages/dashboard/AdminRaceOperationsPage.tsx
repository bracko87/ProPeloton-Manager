import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type OperationsView = 'today' | 'problems' | 'history'
type CheckStatus =
  | 'waiting'
  | 'running'
  | 'done'
  | 'overdue'
  | 'failed'
  | 'cancelled'
  | 'blocked'
  | 'ready'

type RaceOperationsRow = {
  stage_id: string
  race_id: string
  race_name: string
  race_category: string | null
  stage_number: number
  stage_name: string | null
  stage_start_game_at: string
  calculation_due_game_at: string
  results_due_game_at: string
  game_now_at_check: string
  calculation_status: CheckStatus
  calculation_completed_at_real: string | null
  calculation_run_id: string | null
  calculation_attempt_count: number
  replay_status: CheckStatus
  replay_manifest_ready: boolean
  replay_opened_game_at: string | null
  replay_opened_at_real: string | null
  replay_closed_at_real: string | null
  completion_status: CheckStatus
  results_published: boolean
  official_outputs_persisted: boolean
  stage_result_rows: number
  classification_rows: number
  ranking_award_rows: number
  prize_award_rows: number
  paid_prize_award_rows: number
  results_published_at_real: string | null
  automation_status: string | null
  engine_version: string | null
  survival_phase: string | null
  last_error: string | null
  is_cancelled: boolean
  has_problem: boolean
  issue_key: string | null
  issue_severity: string | null
  issue_message: string | null
  first_problem_at: string | null
  resolved_at: string | null
  last_checked_at: string
  incident_id: string | null
  incident_detected_at: string | null
  incident_email_sent_at: string | null
  incident_email_attempt_count: number | null
  incident_email_last_error: string | null
}

type RaceOperationsCounts = {
  today_total: number
  today_problems: number
  active_problems: number
  completed_today: number
}

type RaceOperationsPayload = {
  game_now: string
  alert_email: string
  email_enabled: boolean
  counts: RaceOperationsCounts
  rows: RaceOperationsRow[]
}

const EMPTY_COUNTS: RaceOperationsCounts = {
  today_total: 0,
  today_problems: 0,
  active_problems: 0,
  completed_today: 0,
}

const VIEWS: Array<{ key: OperationsView; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'problems', label: 'Problems only' },
  { key: 'history', label: 'Last 7 days' },
]

function formatGameDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const season = Math.max(1, date.getUTCFullYear() - 1999)
  const month = date.toLocaleString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  })

  return `Season ${season} · ${String(date.getUTCDate()).padStart(2, '0')} ${month} · ${String(
    date.getUTCHours(),
  ).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function formatRealDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(
  status: CheckStatus,
  phase: 'calculation' | 'replay' | 'completion',
): string {
  if (status === 'done') {
    return phase === 'completion' ? 'Completed' : 'Calculated'
  }

  if (status === 'ready') return 'Ready'
  if (status === 'running') return 'Running'
  if (status === 'overdue') return 'Overdue'
  if (status === 'failed') return 'Failed'
  if (status === 'blocked') return 'Blocked'
  if (status === 'cancelled') return 'Cancelled'
  return 'Waiting'
}

function statusClasses(status: CheckStatus): string {
  switch (status) {
    case 'done':
    case 'ready':
      return 'border-green-200 bg-green-50 text-green-800'
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'overdue':
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-800'
    case 'blocked':
      return 'border-orange-200 bg-orange-50 text-orange-800'
    case 'cancelled':
      return 'border-gray-200 bg-gray-100 text-gray-600'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function StatusIcon({ status }: { status: CheckStatus }): JSX.Element {
  if (status === 'done' || status === 'ready') {
    return <CheckCircle2 size={16} />
  }

  if (status === 'running') {
    return <Loader2 size={16} className="animate-spin" />
  }

  if (status === 'overdue' || status === 'failed') {
    return <XCircle size={16} />
  }

  if (status === 'blocked') {
    return <AlertTriangle size={16} />
  }

  return <Clock3 size={16} />
}

function CheckCard({
  title,
  status,
  detail,
  phase,
}: {
  title: string
  status: CheckStatus
  detail: string
  phase: 'calculation' | 'replay' | 'completion'
}): JSX.Element {
  return (
    <div className={`rounded-xl border px-3 py-3 ${statusClasses(status)}`}>
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <div className="text-xs font-extrabold uppercase tracking-[0.1em]">
          {title}
        </div>
      </div>
      <div className="mt-1 text-sm font-bold">{statusLabel(status, phase)}</div>
      <div className="mt-1 text-xs opacity-80">{detail}</div>
    </div>
  )
}

function overallLabel(row: RaceOperationsRow): string {
  if (row.is_cancelled) return 'Cancelled'
  if (row.has_problem) return 'Needs attention'
  if (row.completion_status === 'done') return 'Completed'
  if (row.replay_status === 'ready') return 'Replay ready'
  if (row.calculation_status === 'done') return 'Calculated'
  if (row.calculation_status === 'running') return 'Running'
  return 'Scheduled'
}

function overallClasses(row: RaceOperationsRow): string {
  if (row.is_cancelled) return 'bg-gray-100 text-gray-700'
  if (row.has_problem) return 'bg-red-100 text-red-800'
  if (row.completion_status === 'done') return 'bg-green-100 text-green-800'
  if (row.replay_status === 'ready') return 'bg-blue-100 text-blue-800'
  return 'bg-slate-100 text-slate-700'
}

export default function AdminRaceOperationsPage(): JSX.Element {
  const [view, setView] = useState<OperationsView>('today')
  const [payload, setPayload] = useState<RaceOperationsPayload | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOperations = useCallback(
    async (
      nextView: OperationsView = view,
      showSpinner = true,
    ): Promise<void> => {
      if (showSpinner) setLoading(true)
      setError(null)

      try {
        const { data, error: rpcError } = await supabase.rpc(
          'get_admin_race_operations_v1',
          {
            p_view: nextView,
            p_days: 7,
          },
        )

        if (rpcError) throw rpcError

        const next = (data ?? {
          game_now: '',
          alert_email: '',
          email_enabled: false,
          counts: EMPTY_COUNTS,
          rows: [],
        }) as RaceOperationsPayload

        const rows = Array.isArray(next.rows) ? next.rows : []

        setPayload({
          ...next,
          counts: {
            ...EMPTY_COUNTS,
            ...(next.counts ?? {}),
          },
          rows,
        })

        setSelectedId(current => {
          if (current && rows.some(row => row.stage_id === current)) {
            return current
          }

          return rows[0]?.stage_id ?? null
        })
      } catch (loadError: any) {
        console.error('Failed to load Race Operations:', loadError)
        setError(
          loadError?.message ??
            'Race Operations could not be loaded.',
        )
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [view],
  )

  const runMonitorNow = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    setError(null)

    try {
      const { error: refreshError } = await supabase.rpc(
        'admin_refresh_race_operations_v1',
      )

      if (refreshError) throw refreshError

      await loadOperations(view, false)
      window.dispatchEvent(
        new CustomEvent('admin-race-operations-count-refresh'),
      )
    } catch (refreshError: any) {
      console.error('Failed to refresh Race Operations:', refreshError)
      setError(
        refreshError?.message ??
          'The race monitor could not be refreshed.',
      )
    } finally {
      setRefreshing(false)
    }
  }, [loadOperations, view])

  useEffect(() => {
    void loadOperations(view)

    // Race Operations is an administrative health dashboard, not live
    // telemetry. A 15-minute poll keeps the page current without paying for a
    // permanent Realtime subscription or minute-by-minute reads.
    const intervalId = window.setInterval(() => {
      void loadOperations(view, false)
    }, 15 * 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadOperations, view])

  const rows = payload?.rows ?? []
  const counts = payload?.counts ?? EMPTY_COUNTS

  const selected = useMemo(
    () => rows.find(row => row.stage_id === selectedId) ?? null,
    [rows, selectedId],
  )

  return (
    <div className="mx-auto w-full max-w-[1750px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
            <Activity size={30} className="text-yellow-600" />
            Race Operations
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
            Automatic production monitor for every race stage: calculation,
            replay readiness, and final result processing. The sidebar badge is
            shown only while a real problem is active.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void runMonitorNow()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
          />
          Run check now
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Today&apos;s stages
          </div>
          <div className="mt-2 text-3xl font-extrabold text-gray-950">
            {counts.today_total}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Completed today
          </div>
          <div className="mt-2 text-3xl font-extrabold text-green-700">
            {counts.completed_today}
          </div>
        </div>

        <div
          className={[
            'rounded-2xl border p-5 shadow-sm',
            counts.active_problems > 0
              ? 'border-red-200 bg-red-50'
              : 'border-green-200 bg-green-50',
          ].join(' ')}
        >
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Active problems
          </div>
          <div
            className={[
              'mt-2 text-3xl font-extrabold',
              counts.active_problems > 0 ? 'text-red-700' : 'text-green-700',
            ].join(' ')}
          >
            {counts.active_problems}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Game time
          </div>
          <div className="mt-2 text-sm font-bold text-gray-950">
            {formatGameDate(payload?.game_now)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
            <Mail size={13} />
            Alerts: {payload?.email_enabled ? 'enabled' : 'disabled'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map(item => (
          <button
            type="button"
            key={item.key}
            onClick={() => {
              setView(item.key)
              setSelectedId(null)
            }}
            className={[
              'rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              view === item.key
                ? 'bg-gray-950 text-white'
                : 'border border-black/10 bg-white text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            {item.label}
            {item.key === 'problems' && counts.active_problems > 0
              ? ` · ${counts.active_problems}`
              : ''}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse">
            <thead>
              <tr className="border-b border-black/5 bg-gray-50 text-left text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500">
                <th className="px-4 py-3">Race / Stage</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">1 · Calculation</th>
                <th className="px-4 py-3">2 · Replay</th>
                <th className="px-4 py-3">3 · Completion</th>
                <th className="px-4 py-3">Overall</th>
              </tr>
            </thead>
            <tbody>
              {loading && !payload ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Loading Race Operations…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No race stages in this view.
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const active = selectedId === row.stage_id

                  return (
                    <tr
                      key={row.stage_id}
                      onClick={() => setSelectedId(row.stage_id)}
                      className={[
                        'cursor-pointer border-b border-black/5 align-top transition-colors last:border-b-0',
                        active ? 'bg-yellow-50' : 'hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-950">
                          {row.race_name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Stage {row.stage_number}
                          {row.stage_name ? ` · ${row.stage_name}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">
                        {formatGameDate(row.stage_start_game_at)}
                      </td>

                      <td className="px-4 py-4">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                            row.calculation_status,
                          )}`}
                        >
                          <StatusIcon status={row.calculation_status} />
                          {statusLabel(row.calculation_status, 'calculation')}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                            row.replay_status,
                          )}`}
                        >
                          <StatusIcon status={row.replay_status} />
                          {statusLabel(row.replay_status, 'replay')}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                            row.completion_status,
                          )}`}
                        >
                          <StatusIcon status={row.completion_status} />
                          {statusLabel(row.completion_status, 'completion')}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${overallClasses(
                            row,
                          )}`}
                        >
                          {overallLabel(row)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                Stage details
              </div>
              <h2 className="mt-1 text-xl font-extrabold text-gray-950">
                {selected.race_name} · Stage {selected.stage_number}
              </h2>
              <div className="mt-1 text-sm text-gray-500">
                {formatGameDate(selected.stage_start_game_at)}
              </div>
            </div>

            <Link
              to={`/dashboard/races/${selected.race_id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50"
            >
              Open race
              <ExternalLink size={15} />
            </Link>
          </div>

          {selected.has_problem ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 font-extrabold text-red-800">
                <AlertTriangle size={18} />
                {selected.issue_severity?.toUpperCase()} ·{' '}
                {selected.issue_key?.replaceAll('_', ' ')}
              </div>
              <div className="mt-2 text-sm leading-6 text-red-800">
                {selected.issue_message}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-red-700">
                <span>
                  First detected: {formatRealDate(selected.first_problem_at)}
                </span>
                <span>
                  Alert email:{' '}
                  {selected.incident_email_sent_at
                    ? `sent ${formatRealDate(selected.incident_email_sent_at)}`
                    : 'pending'}
                </span>
              </div>
              {selected.incident_email_last_error ? (
                <div className="mt-2 text-xs text-red-700">
                  Email error: {selected.incident_email_last_error}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <CheckCard
              title="1 · Calculation"
              status={selected.calculation_status}
              detail={`Due ${formatGameDate(selected.calculation_due_game_at)}`}
              phase="calculation"
            />
            <CheckCard
              title="2 · Replay"
              status={selected.replay_status}
              detail={
                selected.replay_manifest_ready
                  ? 'Replay manifest prepared'
                  : `Expected by ${formatGameDate(selected.stage_start_game_at)}`
              }
              phase="replay"
            />
            <CheckCard
              title="3 · Completion"
              status={selected.completion_status}
              detail={`Results due ${formatGameDate(selected.results_due_game_at)}`}
              phase="completion"
            />
          </div>

          <div className="mt-5 grid gap-4 rounded-2xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Engine state
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {selected.automation_status ?? 'No automation state'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Engine version
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {selected.engine_version ?? '—'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Calculation attempts
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {selected.calculation_attempt_count}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Survival phase
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {selected.survival_phase ?? '—'}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-black/5 p-3">
              <div className="text-xs text-gray-500">Stage results</div>
              <div className="mt-1 text-lg font-extrabold text-gray-950">
                {selected.stage_result_rows}
              </div>
            </div>
            <div className="rounded-xl border border-black/5 p-3">
              <div className="text-xs text-gray-500">Classifications</div>
              <div className="mt-1 text-lg font-extrabold text-gray-950">
                {selected.classification_rows}
              </div>
            </div>
            <div className="rounded-xl border border-black/5 p-3">
              <div className="text-xs text-gray-500">Ranking awards</div>
              <div className="mt-1 text-lg font-extrabold text-gray-950">
                {selected.ranking_award_rows}
              </div>
            </div>
            <div className="rounded-xl border border-black/5 p-3">
              <div className="text-xs text-gray-500">Prize awards</div>
              <div className="mt-1 text-lg font-extrabold text-gray-950">
                {selected.prize_award_rows}
              </div>
            </div>
            <div className="rounded-xl border border-black/5 p-3">
              <div className="text-xs text-gray-500">Prizes paid</div>
              <div className="mt-1 text-lg font-extrabold text-gray-950">
                {selected.paid_prize_award_rows}
              </div>
            </div>
          </div>

          {selected.last_error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-red-700">
                Last engine error
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-800">
                {selected.last_error}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
