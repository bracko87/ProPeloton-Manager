import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../../lib/supabase'

type Rider = {
  rider_id: string
  rider_name: string
  club_name?: string | null
  squad_role?: string | null
}

type SelectionCycle = {
  status?: string | null
  selected_count?: number | null
  locked_on?: string | null
  response_deadline?: string | null
  final_squad_deadline?: string | null
}

type NationalSquad = {
  squad_id: string
  status: string
  squad_size: number
  confirmed_on?: string | null
  members: Rider[]
}

type NationalLineup = {
  lineup_id: string
  status: string
  submitted_on?: string | null
  rider_ids: string[]
  riders: Rider[]
}

type NationalRacePreparation = {
  race_preparation_id: string
  status?: string | null
  startlist_status?: string | null
  stage_plan_id?: string | null
  team_strategy?: string | null
  team_tactic_json?: Record<string, unknown> | null
  rider_roles_json?: Record<string, string> | null
  last_saved_at?: string | null
}

type RouteInfo = {
  stage_name?: string | null
  start_city?: string | null
  finish_city?: string | null
  distance_km?: number | null
  terrain_type?: string | null
  profile_type?: string | null
}

type NationalTeamEvent = {
  kind: 'national_team'
  event_id: string
  season_number: number
  round_label: string
  round_type: string
  group_label: string
  race_day: number
  race_type: string
  event_date: string
  event_status: string
  race_id?: string | null
  stage_id?: string | null
  host_country_code?: string | null
  setup_window_opens_on: string
  lineup_deadline_on: string
  can_manage: boolean
  association_id: string
  country_code: string
  selection_cycle?: SelectionCycle | null
  squad?: NationalSquad | null
  lineup?: NationalLineup | null
  race_preparation?: NationalRacePreparation | null
  route?: RouteInfo | null
}

type NationalIndividualEvent = {
  kind: 'national_individual'
  event_key: string
  edition_id: string
  season_number: number
  country_code: string
  event_type: string
  event_date: string
  status: string
  heat_id?: string | null
  heat_number?: number | null
  race_id?: string | null
  setup_window_opens_on: string
  can_manage: false
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

const ROAD_STRATEGIES = [
  ['balanced', 'Balanced'],
  ['aggressive', 'Aggressive'],
  ['sprint_control', 'Sprint control'],
  ['breakaway', 'Breakaway support'],
  ['gc_protection', 'Leader protection'],
] as const

const TTT_STRATEGIES = [
  ['tt_balanced_pace', 'Balanced pace'],
  ['tt_fast_start', 'Fast start'],
  ['tt_negative_split', 'Negative split'],
  ['tt_all_out', 'All out'],
] as const

const ROAD_ROLES = [
  ['team_leader_gc', 'Team leader'],
  ['sprinter', 'Sprinter'],
  ['lead_out_rider', 'Lead-out rider'],
  ['climber', 'Climber'],
  ['mountain_domestique', 'Mountain domestique'],
  ['helper_domestique', 'Helper / domestique'],
  ['breakaway_rider', 'Breakaway rider'],
  ['rouleur', 'Rouleur'],
  ['protected_rider', 'Protected rider'],
  ['free_role', 'Free role'],
] as const

function title(value?: string | null): string {
  if (!value) return '—'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
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
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) ??
      normalized
    )
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
  preparationOpen: boolean
} {
  if (!event.squad) {
    return {
      label:
        event.selection_cycle?.status === 'awaiting_responses'
          ? 'Awaiting squad responses'
          : '10-rider squad not confirmed',
      tone: 'bg-amber-100 text-amber-800',
      preparationOpen: false,
    }
  }

  if (compareDate(today, event.setup_window_opens_on) < 0) {
    return {
      label: `Opens ${formatDate(event.setup_window_opens_on)}`,
      tone: 'bg-slate-100 text-slate-700',
      preparationOpen: false,
    }
  }

  if (compareDate(today, event.lineup_deadline_on) > 0) {
    return {
      label: event.lineup ? 'Lineup locked' : 'Lineup deadline passed',
      tone: event.lineup
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-red-100 text-red-800',
      preparationOpen: false,
    }
  }

  if (event.lineup) {
    return {
      label: '7-rider lineup confirmed',
      tone: 'bg-emerald-100 text-emerald-800',
      preparationOpen: true,
    }
  }

  return {
    label: 'Race preparation open',
    tone: 'bg-sky-100 text-sky-800',
    preparationOpen: true,
  }
}

function NationalTeamPreparation({
  event,
  today,
  onRefresh,
}: {
  event: NationalTeamEvent
  today: string
  onRefresh: () => Promise<void>
}): JSX.Element {
  const state = teamStatus(event, today)
  const members = event.squad?.members ?? []
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>(
    event.lineup?.rider_ids ?? [],
  )
  const [strategy, setStrategy] = useState(
    event.race_preparation?.team_strategy ??
      (event.race_type === 'team_time_trial' ? 'tt_balanced_pace' : 'balanced'),
  )
  const [roles, setRoles] = useState<Record<string, string>>(
    event.race_preparation?.rider_roles_json ?? {},
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setSelectedRiderIds(event.lineup?.rider_ids ?? [])
    setStrategy(
      event.race_preparation?.team_strategy ??
        (event.race_type === 'team_time_trial' ? 'tt_balanced_pace' : 'balanced'),
    )
    setRoles(event.race_preparation?.rider_roles_json ?? {})
    setError(null)
    setMessage(null)
  }, [event.event_id, event.lineup?.lineup_id, event.race_preparation?.stage_plan_id])

  const lineupRiders = useMemo(
    () =>
      members.filter(member =>
        selectedRiderIds.includes(member.rider_id),
      ),
    [members, selectedRiderIds],
  )

  const canEditLineup =
    Boolean(event.can_manage && event.squad) &&
    compareDate(today, event.setup_window_opens_on) >= 0 &&
    compareDate(today, event.lineup_deadline_on) <= 0

  const toggleRider = (riderId: string): void => {
    if (!canEditLineup) return
    setSelectedRiderIds(current => {
      if (current.includes(riderId)) {
        return current.filter(id => id !== riderId)
      }
      if (current.length >= 7) return current
      return [...current, riderId]
    })
  }

  const saveLineup = async (): Promise<void> => {
    if (!event.squad?.squad_id || selectedRiderIds.length !== 7) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { error: rpcError } = await supabase.rpc(
        'submit_national_team_lineup_v1',
        {
          p_squad_id: event.squad.squad_id,
          p_race_day: event.race_day,
          p_rider_ids: selectedRiderIds,
        },
      )
      if (rpcError) throw rpcError
      setMessage('7-rider lineup confirmed. The National Team race package has been initialized.')
      await onRefresh()
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not confirm the National Team lineup.')
    } finally {
      setSaving(false)
    }
  }

  const saveStrategy = async (): Promise<void> => {
    if (!event.lineup || selectedRiderIds.length !== 7) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const defaultRole =
        event.race_type === 'team_time_trial'
          ? 'team_time_trial_rider'
          : 'free_role'
      const payloadRoles = Object.fromEntries(
        selectedRiderIds.map(riderId => [
          riderId,
          roles[riderId] ?? defaultRole,
        ]),
      )
      const { error: rpcError } = await supabase.rpc(
        'save_my_national_team_race_strategy_v1',
        {
          p_event_id: event.event_id,
          p_team_plan: strategy,
          p_rider_roles: payloadRoles,
        },
      )
      if (rpcError) throw rpcError
      setMessage('National Team race strategy saved.')
      await onRefresh()
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not save the National Team race strategy.')
    } finally {
      setSaving(false)
    }
  }

  const strategyOptions =
    event.race_type === 'team_time_trial'
      ? TTT_STRATEGIES
      : ROAD_STRATEGIES

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      {!event.squad ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <div className="font-semibold text-amber-950">
              Confirm the 10-rider National Team squad first
            </div>
            <div className="mt-1 text-sm text-amber-800">
              {event.selection_cycle?.selected_count ?? 0}/10 selected · {title(event.selection_cycle?.status)}
              {event.selection_cycle?.response_deadline
                ? ` · club responses by ${formatDate(event.selection_cycle.response_deadline)}`
                : ''}
            </div>
          </div>
          <Link
            to="/dashboard/national-association/squad"
            className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-300"
          >
            Open National Team selection
          </Link>
        </div>
      ) : !state.preparationOpen && !event.lineup ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Race preparation opens <strong>{formatDate(event.setup_window_opens_on)}</strong>.
          The final 7-rider lineup must be confirmed by <strong>{formatDate(event.lineup_deadline_on)}</strong>.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  7-rider race lineup
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Choose exactly 7 riders from the confirmed 10-rider squad.
                  Deadline: {formatDate(event.lineup_deadline_on)}.
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {selectedRiderIds.length}/7 selected
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {members.map(member => {
                const selected = selectedRiderIds.includes(member.rider_id)
                return (
                  <button
                    key={member.rider_id}
                    type="button"
                    disabled={!canEditLineup}
                    onClick={() => toggleRider(member.rider_id)}
                    className={[
                      'rounded-xl border p-3 text-left transition',
                      selected
                        ? 'border-yellow-400 bg-yellow-50'
                        : 'border-slate-200 bg-white',
                      !canEditLineup ? 'cursor-default opacity-80' : 'hover:border-yellow-300',
                    ].join(' ')}
                  >
                    <div className="font-semibold text-slate-900">
                      {member.rider_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {member.club_name ?? '—'}
                    </div>
                  </button>
                )
              })}
            </div>

            {canEditLineup ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={saving || selectedRiderIds.length !== 7}
                  onClick={() => void saveLineup()}
                  className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Saving…' : event.lineup ? 'Update 7-rider lineup' : 'Confirm 7-rider lineup'}
                </button>
              </div>
            ) : null}
          </div>

          {event.lineup ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    National Team strategy
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    National Team equipment, cars, supplies and travel are standardized and system-covered. Only the race strategy and rider roles are managed here.
                  </p>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Team plan
                    </span>
                    <select
                      value={strategy}
                      disabled={!canEditLineup}
                      onChange={e => setStrategy(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {strategyOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                    Standard package: equal National Team equipment · top-tier race cars · fixed supplies · no Association cost.
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rider roles
                  </div>
                  <div className="mt-2 space-y-2">
                    {lineupRiders.map(rider => (
                      <div
                        key={rider.rider_id}
                        className="grid items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_210px]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {rider.rider_name}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {rider.club_name ?? '—'}
                          </div>
                        </div>
                        {event.race_type === 'team_time_trial' ? (
                          <div className="text-xs font-semibold text-slate-600">
                            Team Time Trial rider
                          </div>
                        ) : (
                          <select
                            value={roles[rider.rider_id] ?? 'free_role'}
                            disabled={!canEditLineup}
                            onChange={e =>
                              setRoles(current => ({
                                ...current,
                                [rider.rider_id]: e.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          >
                            {ROAD_ROLES.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {canEditLineup ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveStrategy()}
                    className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : 'Save National Team strategy'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function UnifiedNationalRacePreparationPanel(): JSX.Element | null {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
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
        <h2 className="text-lg font-semibold text-slate-900">
          National races
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          National Team and National Championship events now use the same Race Preparation hub as regular club races.
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
          const expanded = expandedEventId === event.event_id
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
                      {event.route?.distance_km ? (
                        <span>
                          {Number(event.route.distance_km).toFixed(1).replace(/\.0$/, '')} km
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}>
                      {state.label}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEventId(current =>
                          current === event.event_id ? null : event.event_id,
                        )
                      }
                      className="whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-yellow-300"
                    >
                      {expanded ? 'Close preparation' : 'Open preparation'}
                    </button>
                    <Link
                      to={`/dashboard/national-association/world-nations/events/${event.event_id}`}
                      className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Race page
                    </Link>
                  </div>
                </div>
              </div>

              {expanded ? (
                <NationalTeamPreparation
                  event={event}
                  today={workspace?.current_game_date ?? ''}
                  onRefresh={load}
                />
              ) : null}
            </div>
          )
        })}

        {(workspace?.national_individual_events ?? []).map(event => {
          const target =
            event.event_type === 'final'
              ? `/dashboard/national-championships/${event.edition_id}/final`
              : `/dashboard/national-championships/${event.edition_id}/qualification/${event.heat_number ?? 1}`
          return (
            <div key={event.event_key} className="px-4 py-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                <div className="grid gap-4 md:grid-cols-[96px_1fr_auto] md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-16 text-right text-sm font-semibold leading-tight text-slate-950">
                      <div>{formatDate(event.event_date)}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {event.event_type === 'final'
                          ? 'Final'
                          : `Heat ${event.heat_number ?? 1}`}
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
                      <span>Individual race · no club team commands</span>
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {title(event.status)}
                    </span>
                    <Link
                      to={target}
                      className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open event
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
