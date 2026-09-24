import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  GitBranch,
  History,
  LabFlask,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type MigrationStepStatus =
  | 'waiting'
  | 'ready'
  | 'running'
  | 'done'
  | 'blocked'
  | 'failed'

type ReadinessComponent = {
  key: string
  order: number
  status: string
  details: string
  required: boolean
  updated_at: string | null
}

type MigrationChecklistStep = {
  order: number
  key: string
  title: string
  description: string
  status: MigrationStepStatus
  detail: string
  problem: string | null
  remediation: string | null
}

type MigrationRun = {
  id: string
  source_season: number
  target_season: number
  mode: string
  status: string
  source_end_date: string
  target_start_date: string
  error_message: string | null
  created_at: string
  source_frozen_at: string | null
  core_applied_at: string | null
  completed_at: string | null
  updated_at: string
  resumed_at: string | null
  core_report: Record<string, unknown> | null
  reward_report: Record<string, unknown> | null
  communication_report: Record<string, unknown> | null
  validation_report: Record<string, unknown> | null
}

type MigrationEvent = {
  id: number
  phase: string
  event_type: string
  payload: Record<string, unknown> | null
  created_at: string
}

type MigrationHistoryRow = {
  id: string
  source_season: number
  target_season: number
  mode: string
  status: string
  source_end_date: string
  target_start_date: string
  error_message: string | null
  created_at: string
  source_frozen_at: string | null
  core_applied_at: string | null
  completed_at: string | null
  updated_at: string
  resumed_at: string | null
}

type LabCheckpoint = {
  id: string
  label: string
  source_season: number
  source_end_date: string
  restore_method: string | null
  status: string
  notes: string | null
  created_at: string
  verified_at: string | null
  updated_at: string
}

type Jan1Backlog = {
  id: string
  current_game_date: string
  season_number: number
  month_number: number
  day_number: number
  status: string
  attempts: number
  source: string | null
  last_error: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

type MigrationPayload = {
  overall_status: string
  problem_count: number
  game: {
    season: number
    month: number
    day: number
    hour: number
    minute: number
    paused: boolean
    game_date: string
    game_timestamp: string
  }
  pair: {
    source_season: number
    target_season: number
    source_end_date: string
    target_start_date: string
    using_active_run_pair: boolean
  }
  timing_policy: {
    trigger: string
    automatic_controller: string
    game_pauses_before_mutation: boolean
    target_boundary_time: string
    fail_closed: boolean
    resume_only_after_completed: boolean
    jan1_daily_processing_deferred: boolean
  }
  readiness: {
    components: ReadinessComponent[]
    ready_components: number
    required_components: number
    blocking_components: number
    ready_for_arming: boolean
  }
  persistence: {
    ok?: boolean
    [key: string]: unknown
  } | null
  control: {
    is_armed: boolean
    armed_source_season: number | null
    armed_target_season: number | null
    armed_at: string | null
    armed_note: string | null
  } | null
  run: MigrationRun | null
  checklist: MigrationChecklistStep[]
  events: MigrationEvent[]
  jan1_backlog: Jan1Backlog | null
  history: MigrationHistoryRow[]
  lab_checkpoints: LabCheckpoint[]
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

function formatGameClock(payload: MigrationPayload | null): string {
  if (!payload) return '—'
  const { season, month, day, hour, minute } = payload.game
  const date = new Date(Date.UTC(2000, month - 1, day))
  const monthLabel = date.toLocaleString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  })

  return `Season ${season} · ${String(day).padStart(2, '0')} ${monthLabel} · ${String(
    hour,
  ).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function statusClasses(status: MigrationStepStatus | string): string {
  switch (status) {
    case 'done':
    case 'ready':
    case 'completed':
      return 'border-green-200 bg-green-50 text-green-800'
    case 'running':
    case 'in_progress':
    case 'armed':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'blocked':
    case 'failed':
    case 'needs_attention':
      return 'border-red-200 bg-red-50 text-red-800'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function StatusIcon({
  status,
  size = 18,
}: {
  status: MigrationStepStatus | string
  size?: number
}): JSX.Element {
  if (status === 'done' || status === 'ready' || status === 'completed') {
    return <CheckCircle2 size={size} />
  }

  if (status === 'running' || status === 'in_progress' || status === 'armed') {
    return <Loader2 size={size} className="animate-spin" />
  }

  if (status === 'blocked' || status === 'failed' || status === 'needs_attention') {
    return <XCircle size={size} />
  }

  return <Clock3 size={size} />
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'neutral' | 'good' | 'warn'
}): JSX.Element {
  const toneClass =
    tone === 'good'
      ? 'border-green-200 bg-green-50'
      : tone === 'warn'
        ? 'border-red-200 bg-red-50'
        : 'border-black/5 bg-white'

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-extrabold text-gray-950">{value}</div>
      {hint ? <div className="mt-1 text-xs leading-5 text-gray-600">{hint}</div> : null}
    </div>
  )
}

export default function AdminMigrationProcessPage(): JSX.Element {
  const [payload, setPayload] = useState<MigrationPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = true): Promise<void> => {
    if (showSpinner) setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_admin_season_migration_process_v1',
      )

      if (rpcError) throw rpcError
      setPayload(data as MigrationPayload)
    } catch (loadError: any) {
      console.error('Failed to load Migration Process:', loadError)
      setError(
        loadError?.message ??
          'The season migration process could not be loaded.',
      )
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await load(false)
      window.dispatchEvent(
        new CustomEvent('admin-season-migration-count-refresh'),
      )
    } finally {
      setRefreshing(false)
    }
  }, [load])

  useEffect(() => {
    void load()

    const intervalMs = payload?.run ? 15_000 : 5 * 60_000
    const intervalId = window.setInterval(() => {
      void load(false)
    }, intervalMs)

    return () => window.clearInterval(intervalId)
  }, [load, payload?.run?.id])

  const components = payload?.readiness?.components ?? []
  const checklist = payload?.checklist ?? []
  const history = payload?.history ?? []
  const events = payload?.events ?? []
  const checkpoints = payload?.lab_checkpoints ?? []

  const blockedSteps = useMemo(
    () => checklist.filter(step => step.status === 'blocked' || step.status === 'failed'),
    [checklist],
  )

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-semibold text-gray-600">
          <Loader2 size={20} className="animate-spin" />
          Loading season migration checklist...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1750px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
            <GitBranch size={30} className="text-yellow-600" />
            Migration Process
          </h1>
          <p className="mt-2 max-w-5xl text-sm leading-6 text-gray-600">
            Permanent season-to-season migration checklist and failure monitor. This page is
            intentionally read-only: it shows what must happen, what has happened, and exactly
            where to investigate if the transition is blocked.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          Refresh checks
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {payload ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Transition"
              value={`Season ${payload.pair.source_season} → Season ${payload.pair.target_season}`}
              hint={`${payload.pair.source_end_date} → ${payload.pair.target_start_date}`}
            />
            <SummaryCard
              label="Game time"
              value={formatGameClock(payload)}
              hint={payload.game.paused ? 'Game clock is paused' : 'Game clock is running'}
              tone={payload.game.paused && payload.run ? 'warn' : 'neutral'}
            />
            <SummaryCard
              label="Preflight"
              value={`${payload.readiness.ready_components}/${payload.readiness.required_components} ready`}
              hint={
                payload.readiness.blocking_components > 0
                  ? `${payload.readiness.blocking_components} blocking component(s)`
                  : 'All required components are green'
              }
              tone={payload.readiness.blocking_components > 0 ? 'warn' : 'good'}
            />
            <SummaryCard
              label="Overall"
              value={humanize(payload.overall_status)}
              hint={
                payload.problem_count > 0
                  ? `${payload.problem_count} problem(s) require attention`
                  : 'No migration problems detected'
              }
              tone={payload.problem_count > 0 ? 'warn' : 'good'}
            />
          </div>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={22} className="mt-0.5 flex-shrink-0 text-blue-700" />
              <div>
                <h2 className="text-base font-extrabold text-blue-950">
                  Timing and safety rules
                </h2>
                <p className="mt-1 text-sm leading-6 text-blue-900/80">
                  The season transition is owned by the automatic v2 boundary controller at the
                  exact Dec 31 → Jan 1 game-date boundary. The ordinary clock is not allowed to
                  jump into the new season by itself.
                </p>
                <div className="mt-3 grid gap-2 text-sm text-blue-950 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-blue-200 bg-white/70 px-3 py-2">
                    <span className="font-bold">1.</span> Game pauses before transition writes.
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/70 px-3 py-2">
                    <span className="font-bold">2.</span> Target starts at Jan 1, 00:00 game time.
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/70 px-3 py-2">
                    <span className="font-bold">3.</span> Any failure is fail-closed and retryable.
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/70 px-3 py-2">
                    <span className="font-bold">4.</span> Resume happens only after final validation.
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-blue-800">
                  Jan 1 daily processors are deliberately queued during the transition and are
                  handled by the retry-safe forward daily automation after the migration boundary.
                </p>
              </div>
            </div>
          </section>

          {blockedSteps.length > 0 ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-center gap-2 text-red-900">
                <AlertTriangle size={21} />
                <h2 className="font-extrabold">
                  Migration blocked · {blockedSteps.length} step(s)
                </h2>
              </div>
              <div className="mt-3 space-y-3">
                {blockedSteps.map(step => (
                  <div key={step.key} className="rounded-xl border border-red-200 bg-white p-4">
                    <div className="font-bold text-red-900">{step.title}</div>
                    <div className="mt-1 text-sm text-red-800">
                      {step.problem ?? step.detail}
                    </div>
                    {step.remediation ? (
                      <div className="mt-2 text-sm font-medium text-gray-800">
                        Fix: {step.remediation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-extrabold text-gray-950">
                Live transition execution
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                These steps are evaluated from the actual transition control, v2 run state,
                migration events and Jan 1 backlog—not from manual checkboxes.
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {checklist.map(step => (
                <div key={step.key} className="p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border ${statusClasses(
                        step.status,
                      )}`}
                    >
                      <StatusIcon status={step.status} size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                            Step {step.order}
                          </div>
                          <h3 className="mt-0.5 text-base font-extrabold text-gray-950">
                            {step.title}
                          </h3>
                        </div>

                        <span
                          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClasses(
                            step.status,
                          )}`}
                        >
                          <StatusIcon status={step.status} size={13} />
                          {humanize(step.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                      <div className="mt-2 text-sm font-semibold text-gray-800">{step.detail}</div>

                      {step.problem ? (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                          <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-red-700">
                            Problem
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-red-900">
                            {step.problem}
                          </div>
                        </div>
                      ) : null}

                      {step.remediation && step.remediation !== 'No action required.' ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-amber-700">
                            What to do
                          </div>
                          <div className="mt-1 text-sm leading-6 text-amber-950">
                            {step.remediation}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-gray-700" />
                <h2 className="text-lg font-extrabold text-gray-950">
                  Permanent readiness checklist
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Every required subsystem must remain certified. Any non-ready required component
                blocks arming and prevents a production rollover.
              </p>
            </div>

            <div className="grid gap-3 p-5 lg:grid-cols-2">
              {components.map(component => (
                <div
                  key={component.key}
                  className={`rounded-xl border p-4 ${statusClasses(component.status)}`}
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon status={component.status} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-extrabold">
                          {component.order}. {humanize(component.key)}
                        </div>
                        {component.required ? (
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                            Required
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 opacity-90">{component.details}</p>
                      <div className="mt-2 text-[11px] opacity-70">
                        Last certified: {formatRealDate(component.updated_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <CircleDot size={20} className="text-gray-700" />
                  <h2 className="text-lg font-extrabold text-gray-950">Current run</h2>
                </div>
              </div>

              <div className="p-5">
                {payload.run ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                          Run
                        </div>
                        <div className="mt-1 break-all text-sm font-bold text-gray-900">
                          {payload.run.id}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                          Status
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-gray-900">
                          {humanize(payload.run.status)}
                        </div>
                      </div>
                    </div>

                    {payload.run.error_message ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <div className="text-xs font-extrabold uppercase tracking-wide text-red-700">
                          Last transition error
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-900">
                          {payload.run.error_message}
                        </div>
                      </div>
                    ) : null}

                    <details className="rounded-xl border border-gray-200">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-gray-800">
                        Run event log ({events.length})
                      </summary>
                      <div className="max-h-[430px] space-y-3 overflow-y-auto border-t border-gray-100 p-4">
                        {events.length > 0 ? (
                          events.map(event => (
                            <div key={event.id} className="rounded-lg bg-gray-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-bold text-gray-900">
                                  {humanize(event.event_type)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {formatRealDate(event.created_at)}
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                Phase: {humanize(event.phase)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500">No run events yet.</div>
                        )}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
                    No live production migration is running. Historical test/production runs are
                    kept below, but they do not mark the next real checklist as completed.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Clock3 size={20} className="text-gray-700" />
                  <h2 className="text-lg font-extrabold text-gray-950">Jan 1 daily processing</h2>
                </div>
              </div>

              <div className="p-5">
                {payload.jan1_backlog ? (
                  <div className="space-y-3">
                    <div
                      className={`rounded-xl border p-4 ${statusClasses(
                        payload.jan1_backlog.status === 'processed'
                          ? 'done'
                          : payload.jan1_backlog.last_error
                            ? 'blocked'
                            : 'waiting',
                      )}`}
                    >
                      <div className="font-extrabold">
                        {humanize(payload.jan1_backlog.status)}
                      </div>
                      <div className="mt-1 text-sm">
                        Game date: {payload.jan1_backlog.current_game_date} · Attempts:{' '}
                        {payload.jan1_backlog.attempts}
                      </div>
                    </div>

                    {payload.jan1_backlog.last_error ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                        {payload.jan1_backlog.last_error}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
                    The Jan 1 backlog row is created only when the real boundary controller moves
                    the game into the target season. Before then, this is expected to be empty.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <History size={20} className="text-gray-700" />
                <h2 className="text-lg font-extrabold text-gray-950">Migration history</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Previous production runs are audit history only. They never pre-check the next live
                migration.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                      Transition
                    </th>
                    <th className="px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                      Started
                    </th>
                    <th className="px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                      Completed
                    </th>
                    <th className="px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.length > 0 ? (
                    history.map(row => (
                      <tr key={row.id} className="border-t border-gray-100">
                        <td className="px-5 py-3 text-sm font-bold text-gray-900">
                          Season {row.source_season} → {row.target_season}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClasses(
                              row.status,
                            )}`}
                          >
                            {humanize(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {formatRealDate(row.created_at)}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {formatRealDate(row.completed_at)}
                        </td>
                        <td className="max-w-xl px-5 py-3 text-sm text-gray-600">
                          {row.error_message ?? '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                        No production migration history yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <LabFlask size={20} className="text-gray-700" />
                <h2 className="text-lg font-extrabold text-gray-950">Migration test checkpoints</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Lab checkpoints are used for rollback/repeat testing without treating a test as the
                next live production migration.
              </p>
            </div>

            <div className="p-5">
              {checkpoints.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {checkpoints.map(checkpoint => (
                    <div key={checkpoint.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-extrabold text-gray-950">{checkpoint.label}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            Season {checkpoint.source_season} · {checkpoint.source_end_date}
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClasses(
                            checkpoint.status === 'ready' ? 'ready' : checkpoint.status,
                          )}`}
                        >
                          {humanize(checkpoint.status)}
                        </span>
                      </div>
                      {checkpoint.notes ? (
                        <p className="mt-3 text-sm leading-6 text-gray-600">{checkpoint.notes}</p>
                      ) : null}
                      <div className="mt-3 text-xs text-gray-500">
                        Verified: {formatRealDate(checkpoint.verified_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
                  No lab checkpoint is currently registered. That is normal until a migration test
                  is prepared.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
