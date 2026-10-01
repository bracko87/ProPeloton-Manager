import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../../lib/supabase'
import type {
  NationalRankingListEvent,
  NationalSpecialSelection,
  NationalTeamListEvent,
} from './NationalSpecialRacePreparation'

type SelectionCycle = {
  status?: string | null
  selected_count?: number | null
  locked_on?: string | null
  response_deadline?: string | null
  final_squad_deadline?: string | null
}

type NationalTeamEvent = NationalTeamListEvent & {
  selection_cycle?: SelectionCycle | null
  squad?: {
    squad_id: string
    status: string
    squad_size: number
    confirmed_on?: string | null
    members?: Array<{ rider_id: string; rider_name: string; club_name?: string | null }>
  } | null
  lineup?: {
    lineup_id: string
    status: string
    submitted_on?: string | null
    rider_ids: string[]
  } | null
  race_preparation?: {
    race_preparation_id: string
    status?: string | null
    startlist_status?: string | null
  } | null
  route?: {
    stage_name?: string | null
    start_city?: string | null
    finish_city?: string | null
    distance_km?: number | null
  } | null
}

type NationalIndividualEvent = NationalRankingListEvent & {
  can_manage?: boolean
  riders: Array<{
    rider_id: string
    rider_name: string
    entry_status?: string | null
    participation_decision?: string | null
    final_participation_decision?: string | null
  }>
}

type Workspace = {
  current_game_date: string
  season_number: number
  is_national_coach: boolean
  national_team_events: NationalTeamEvent[]
  national_individual_events: NationalIndividualEvent[]
}

function title(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function countryName(code?: string | null): string {
  const normalized = code?.trim().toUpperCase()
  if (!normalized) return '—'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) ?? normalized
  } catch {
    return normalized
  }
}

function HostLine({ code }: { code?: string | null }): JSX.Element {
  const flag = flagUrl(code)
  return (
    <span className="inline-flex items-center gap-1.5">
      {flag ? (
        <img
          src={flag}
          alt={countryName(code)}
          className="h-3.5 w-5 rounded-sm border border-slate-200 object-cover"
        />
      ) : null}
      <span>Host {countryName(code)}</span>
    </span>
  )
}

function compareDate(a?: string | null, b?: string | null): number {
  return String(a ?? '').localeCompare(String(b ?? ''))
}

function raceTypeLabel(value: string): string {
  if (value === 'team_time_trial') return 'Team Time Trial'
  if (value === 'flat_road_race') return 'Flat Road Race'
  return 'Hilly / Mountain Road Race'
}

function teamStatus(event: NationalTeamEvent, today: string): {
  label: string
  tone: string
  canOpenRacePlan: boolean
} {
  if (!event.squad) {
    return {
      label:
        event.selection_cycle?.status === 'awaiting_responses'
          ? 'Awaiting squad responses'
          : '10-rider squad not confirmed',
      tone: 'bg-amber-100 text-amber-800',
      canOpenRacePlan: false,
    }
  }

  if (event.lineup?.status === 'confirmed' || event.lineup?.status === 'locked') {
    return {
      label: 'Race Plan Submitted',
      tone: 'bg-emerald-100 text-emerald-800',
      canOpenRacePlan: true,
    }
  }

  if (event.test_override) {
    return {
      label: `Opens ${formatDate(event.setup_window_opens_on)}`,
      tone: 'bg-slate-100 text-slate-700',
      canOpenRacePlan: true,
    }
  }

  if (compareDate(today, event.setup_window_opens_on) < 0) {
    return {
      label: `Opens ${formatDate(event.setup_window_opens_on)}`,
      tone: 'bg-slate-100 text-slate-700',
      canOpenRacePlan: false,
    }
  }

  if (compareDate(today, event.lineup_deadline_on) > 0) {
    return {
      label: 'Race Plan deadline passed',
      tone: 'bg-red-100 text-red-800',
      canOpenRacePlan: false,
    }
  }

  return {
    label: 'Race Plan Open',
    tone: 'bg-yellow-100 text-yellow-800',
    canOpenRacePlan: true,
  }
}

export default function UnifiedNationalRacePreparationPanel({
  onOpenRacePlan,
  onOpenStagePlans,
}: {
  onOpenRacePlan: (selection: NationalSpecialSelection) => void
  onOpenStagePlans: (selection: NationalSpecialSelection) => void
}): JSX.Element | null {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      setLoading(true)
      const { data, error: rpcError } = await supabase.rpc(
        'get_my_unified_race_preparation_special_events_v1',
      )
      if (rpcError) throw rpcError
      setWorkspace((data ?? null) as Workspace | null)
      setError(null)
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not load National race preparation.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const hasEvents =
    Boolean(workspace?.national_team_events?.length) ||
    Boolean(workspace?.national_individual_events?.length)

  if (loading && !workspace) {
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-500">Loading National races…</div>
      </section>
    )
  }

  if (!hasEvents && !error) return null

  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">National races</h2>
        <p className="mt-1 text-sm text-slate-600">
          National Team and National Ranking events follow the same Race Plan → Stage Plans flow as regular club races.
        </p>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="divide-y divide-slate-200">
        {(workspace?.national_team_events ?? []).map(event => {
          const state = teamStatus(event, workspace?.current_game_date ?? '')
          const submitted = event.lineup?.status === 'confirmed' || event.lineup?.status === 'locked'
          const selection: NationalSpecialSelection = {
            kind: 'national_team',
            event,
            submitted,
          }

          return (
            <div key={event.event_id} className="px-4 py-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                <div className="grid gap-4 md:grid-cols-[96px_1fr_auto] md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-16 text-right text-sm font-semibold leading-tight text-slate-950">
                      <div>{formatDate(event.event_date)}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Day {event.race_day}
                      </div>
                    </div>
                    <div className="h-14 w-px bg-emerald-400" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-slate-900">
                        {event.round_label} · {event.group_label} · {raceTypeLabel(event.race_type)}
                      </span>
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                        National Team
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <HostLine code={event.host_country_code} />
                      <span>Preparation opens {formatDate(event.setup_window_opens_on)}</span>
                      <span>Lineup deadline {formatDate(event.lineup_deadline_on)}</span>
                      {event.route?.start_city && event.route?.finish_city ? (
                        <span>{event.route.start_city} → {event.route.finish_city}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}>
                      {state.label}
                    </span>
                    <button
                      type="button"
                      disabled={!state.canOpenRacePlan}
                      onClick={() => onOpenRacePlan(selection)}
                      className="whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Race Plan
                    </button>
                    {submitted ? (
                      <button
                        type="button"
                        onClick={() => onOpenStagePlans(selection)}
                        className="whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-yellow-300"
                      >
                        Stage Plans
                      </button>
                    ) : null}
                    <Link
                      to={`/dashboard/national-association/world-nations/events/${event.event_id}`}
                      className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Race page
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {(workspace?.national_individual_events ?? []).map(event => {
          const target =
            event.event_type === 'final'
              ? `/dashboard/national-championships/${event.edition_id}/final`
              : `/dashboard/national-championships/${event.edition_id}/qualification/${event.heat_number ?? 1}`
          const selection: NationalSpecialSelection = {
            kind: 'national_ranking',
            event,
            submitted: false,
          }

          return (
            <div key={event.event_key} className="px-4 py-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                <div className="grid gap-4 md:grid-cols-[96px_1fr_auto] md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-16 text-right text-sm font-semibold leading-tight text-slate-950">
                      <div>{formatDate(event.event_date)}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {event.event_type === 'final' ? 'Final' : `Heat ${event.heat_number ?? 1}`}
                      </div>
                    </div>
                    <div className="h-14 w-px bg-emerald-400" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-slate-900">
                        {countryName(event.country_code)} National Championship · {title(event.event_type)}
                        {event.heat_number ? ` · Heat ${event.heat_number}` : ''}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        National Ranking
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <HostLine code={event.country_code} />
                      <span>{event.riders.map(rider => rider.rider_name).join(', ')}</span>
                      <span>Riders fixed automatically · no staff or club assets</span>
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {event.is_preview ? 'Test Preview' : title(event.status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenRacePlan(selection)}
                      className="whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-yellow-300"
                    >
                      Race Plan
                    </button>
                    <Link
                      to={target}
                      className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Race page
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
