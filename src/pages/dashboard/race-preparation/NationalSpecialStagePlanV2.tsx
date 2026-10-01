
import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { NationalSpecialSelection } from './NationalSpecialRacePreparation'

type PlanRider = {
  rider_id: string
  rider_name: string
  club_name?: string | null
  role?: string | null
}

type Workspace = {
  kind: 'national_team' | 'national_ranking'
  event_id?: string
  edition_id?: string
  event_type?: string
  heat_id?: string | null
  event_date: string
  race_type?: string
  round_label?: string
  group_label?: string
  host_country_code?: string | null
  country_code?: string | null
  plan_status: string
  stage_id?: string | null
  selected_rider_ids?: string[]
  riders: PlanRider[]
}

type StageProfile = {
  stage_title?: string | null
  route_label?: string | null
  terrain_type?: string | null
  distance_km?: number | null
  elevation_gain_m?: number | null
  weather_summary?: string | null
  profile_points?: Array<{
    km?: number | null
    elevation?: number | null
    elevation_m?: number | null
  }>
}

type RiderCommands = Record<
  string,
  {
    phase_1: { command: string }
    phase_2: { command: string }
    phase_3: { command: string }
    phase_4: { command: string }
  }
>

const COMMAND_OPTIONS = [
  ['ride_naturally', 'Ride naturally'],
  ['conserve_energy', 'Conserve energy'],
  ['stay_near_front', 'Stay near front'],
  ['join_breakaway', 'Join breakaway'],
  ['attack', 'Attack'],
  ['chase_breakaway', 'Chase breakaway'],
  ['climb_hard', 'Climb hard'],
  ['sprint', 'Sprint'],
  ['avoid_risks', 'Avoid risks'],
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

function defaultCommands() {
  return {
    phase_1: { command: 'ride_naturally' },
    phase_2: { command: 'ride_naturally' },
    phase_3: { command: 'ride_naturally' },
    phase_4: { command: 'ride_naturally' },
  }
}

function dateLabel(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  })
}

function roleLabel(value?: string | null): string {
  if (!value) return 'Rider'
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function raceTypeLabel(value?: string | null): string {
  if (value === 'team_time_trial') return 'Team Time Trial'
  if (value === 'flat_road_race') return 'Flat Road Race'
  if (value === 'hilly_mountain_road_race') return 'Hilly / Mountain Road Race'
  return roleLabel(value)
}

function countryName(code?: string | null): string {
  const normalized = code?.trim().toUpperCase()
  if (!normalized) return '—'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) || normalized
  } catch {
    return normalized
  }
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  if (!normalized || !/^[a-z]{2}$/.test(normalized)) return null
  return 'https://flagcdn.com/w40/' + normalized + '.png'
}

async function loadWorkspace(selection: NationalSpecialSelection): Promise<Workspace> {
  if (selection.kind === 'national_team') {
    const response = await supabase.rpc('get_my_national_team_race_plan_workspace_v2', {
      p_event_id: selection.event.event_id,
    })
    if (response.error) throw response.error
    return response.data as Workspace
  }

  const response = await supabase.rpc('get_my_national_championship_race_plan_workspace_v2', {
    p_edition_id: selection.event.edition_id,
    p_event_type: selection.event.event_type,
    p_heat_id: selection.event.heat_id || null,
    p_preview_rider_ids: selection.event.riders.map(rider => rider.rider_id),
  })
  if (response.error) throw response.error
  return response.data as Workspace
}

function DisabledSelect(props: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <label className="block opacity-65">
      <span className="text-xs font-semibold text-slate-600">{props.label}</span>
      <select
        disabled
        value={props.value}
        onChange={() => undefined}
        className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-2 py-2 text-xs text-slate-500"
      >
        <option value={props.value}>{props.value}</option>
      </select>
      {props.hint ? (
        <span className="mt-1 block text-[10px] leading-4 text-slate-400">{props.hint}</span>
      ) : null}
    </label>
  )
}

function StageProfileChart({ profile }: { profile: StageProfile | null }): JSX.Element {
  const points = (profile?.profile_points || [])
    .map(point => ({
      km: Number(point.km || 0),
      elevation: Number(point.elevation_m ?? point.elevation ?? 0),
    }))
    .filter(point => Number.isFinite(point.km) && Number.isFinite(point.elevation))

  if (points.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400">
        Stage profile is not available.
      </div>
    )
  }

  const width = 760
  const height = 220
  const left = 46
  const right = 18
  const top = 18
  const bottom = 34
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const maxKm = Math.max(...points.map(point => point.km), 1)
  const minElevation = Math.min(...points.map(point => point.elevation))
  const maxElevation = Math.max(...points.map(point => point.elevation))
  const span = Math.max(maxElevation - minElevation, 80)
  const floorElevation = Math.max(0, minElevation - Math.max(20, span * 0.3))
  const ceilingElevation = Math.max(maxElevation + Math.max(20, span * 0.25), floorElevation + 100)

  const chartPoints = points.map(point => ({
    x: left + point.km / maxKm * innerWidth,
    y: top + (ceilingElevation - point.elevation) / (ceilingElevation - floorElevation) * innerHeight,
  }))

  const linePath = chartPoints
    .map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x.toFixed(1) + ' ' + point.y.toFixed(1))
    .join(' ')
  const lastPoint = chartPoints[chartPoints.length - 1]
  const firstPoint = chartPoints[0]
  const areaPath =
    linePath +
    ' L ' + lastPoint.x.toFixed(1) + ' ' + (height - bottom).toFixed(1) +
    ' L ' + firstPoint.x.toFixed(1) + ' ' + (height - bottom).toFixed(1) +
    ' Z'

  const yTicks = [0, 0.5, 1].map(fraction => ({
    value: Math.round(floorElevation + (ceilingElevation - floorElevation) * fraction),
    y: top + (1 - fraction) * innerHeight,
  }))

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(fraction => ({
    value: Math.round(maxKm * fraction * 10) / 10,
    x: left + fraction * innerWidth,
  }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <svg viewBox={'0 0 ' + width + ' ' + height} className="h-52 w-full" role="img" aria-label="Stage elevation profile">
        {yTicks.map(tick => (
          <g key={tick.value}>
            <line x1={left} x2={width - right} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={left - 8} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {tick.value} m
            </text>
          </g>
        ))}
        <path d={areaPath} fill="#fef3c7" />
        <path d={linePath} fill="none" stroke="#475569" strokeWidth="2" />
        {xTicks.map(tick => (
          <g key={tick.value}>
            <line x1={tick.x} x2={tick.x} y1={height - bottom} y2={height - bottom + 4} stroke="#94a3b8" />
            <text x={tick.x} y={height - 11} textAnchor="middle" fontSize="10" fill="#64748b">
              {tick.value} km
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function NationalSpecialStagePlanV2({
  selection,
}: {
  selection: NationalSpecialSelection
}): JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [profile, setProfile] = useState<StageProfile | null>(null)
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [teamStrategy, setTeamStrategy] = useState('balanced')
  const [commands, setCommands] = useState<RiderCommands>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const next = await loadWorkspace(selection)
      if (cancelled) return

      setWorkspace(next)

      const nextCommands: RiderCommands = {}
      next.riders.forEach(rider => {
        nextCommands[rider.rider_id] = defaultCommands()
      })
      setCommands(nextCommands)

      if (next.kind === 'national_team') {
        const selectedIds = new Set(next.selected_rider_ids || [])
        const nextRoles: Record<string, string> = {}
        next.riders.filter(rider => selectedIds.has(rider.rider_id)).forEach(rider => {
          nextRoles[rider.rider_id] =
            next.race_type === 'team_time_trial' ? 'team_time_trial_rider' : 'free_role'
        })
        setRoles(nextRoles)
        setTeamStrategy(next.race_type === 'team_time_trial' ? 'tt_balanced_pace' : 'balanced')
      }

      if (!next.stage_id) {
        setProfile(null)
        return
      }

      const profileResponse = await supabase.rpc('get_race_stage_profile_detail_v1', {
        p_stage_id: next.stage_id,
      })
      if (cancelled) return

      if (profileResponse.error) {
        console.warn('Could not load National Team stage profile:', profileResponse.error.message)
        setProfile(null)
      } else {
        setProfile((profileResponse.data || null) as StageProfile | null)
      }
    }

    setWorkspace(null)
    setProfile(null)
    setMessage(null)
    setError(null)

    void run().catch(caught => {
      if (!cancelled) setError(caught?.message || 'Could not load National Team Stage Plan.')
    })

    return () => {
      cancelled = true
    }
  }, [selection])

  if (!workspace) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        {error || 'Loading National Team Stage Plan…'}
      </div>
    )
  }

  if (workspace.plan_status !== 'submitted') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Submit the Race Plan first. Stage Plans become configurable after the Race Plan is submitted.
      </div>
    )
  }

  const isNationalTeam = workspace.kind === 'national_team'
  const isTTT = isNationalTeam && workspace.race_type === 'team_time_trial'
  const selectedIds = new Set(workspace.selected_rider_ids || [])
  const riders = isNationalTeam
    ? workspace.riders.filter(rider => selectedIds.has(rider.rider_id))
    : workspace.riders

  const strategyOptions = isTTT ? TTT_STRATEGIES : ROAD_STRATEGIES
  const stageTitle = profile?.stage_title || raceTypeLabel(workspace.race_type)
  const routeLabel = profile?.route_label || 'National race route'
  const hostCode = isNationalTeam ? workspace.host_country_code : workspace.country_code
  const hostFlag = flagUrl(hostCode)

  const updateCommand = (
    riderId: string,
    phase: 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4',
    value: string,
  ) => {
    setCommands(current => ({
      ...current,
      [riderId]: {
        ...(current[riderId] || defaultCommands()),
        [phase]: { command: value },
      },
    }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      if (isNationalTeam) {
        const selectedCommands = Object.fromEntries(
          Object.entries(commands).filter(([riderId]) => selectedIds.has(riderId)),
        )
        const response = await supabase.rpc('save_my_national_team_stage_plan_v2', {
          p_event_id: workspace.event_id,
          p_team_plan: teamStrategy,
          p_rider_roles: roles,
          p_rider_commands: selectedCommands,
        })
        if (response.error) throw response.error
      } else {
        for (const rider of riders) {
          const riderCommands = commands[rider.rider_id] || defaultCommands()
          const response = await supabase.rpc('save_my_national_championship_stage_plan_v2', {
            p_edition_id: workspace.edition_id,
            p_event_type: workspace.event_type,
            p_heat_id: workspace.heat_id || null,
            p_rider_id: rider.rider_id,
            p_phase_1_command: riderCommands.phase_1.command,
            p_phase_2_command: riderCommands.phase_2.command,
            p_phase_3_command: riderCommands.phase_3.command,
            p_phase_4_command: riderCommands.phase_4.command,
          })
          if (response.error) throw response.error
        }
      }
      setMessage('Stage Plan saved.')
    } catch (caught: any) {
      setError(caught?.message || 'Could not save Stage Plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected race</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hostFlag ? (
                <img src={hostFlag} alt="" className="h-5 w-7 rounded-sm border border-slate-200 object-cover" />
              ) : null}
              <h2 className="text-xl font-bold text-slate-950">
                {isNationalTeam
                  ? (workspace.round_label || 'National Team') + ' · ' + (workspace.group_label || '') + ' · ' + raceTypeLabel(workspace.race_type)
                  : 'National Championship'}
              </h2>
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                {isNationalTeam ? 'National Team' : 'National Ranking'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                Race date: <strong>{dateLabel(workspace.event_date)}</strong>
              </span>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                Riders: <strong>{riders.length}</strong>
              </span>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                Host: <strong>{countryName(hostCode)}</strong>
              </span>
            </div>
          </div>
          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
            Race Plan Submitted
          </span>
        </div>
      </section>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Stage Plans</h3>
            <p className="mt-1 text-sm text-slate-500">
              Same planning layout as regular races. National Team fields that are system-controlled are greyed out.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Stage Plan'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[285px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Selected stage
            </div>
            <div className="mt-1 text-base font-semibold text-slate-950">
              Stage 1: {stageTitle}
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Date</span>
                <span className="font-semibold text-slate-800">{dateLabel(workspace.event_date)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Terrain</span>
                <span className="font-semibold text-slate-800">{roleLabel(profile?.terrain_type)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Distance</span>
                <span className="font-semibold text-slate-800">
                  {Number.isFinite(Number(profile?.distance_km)) ? Number(profile?.distance_km).toFixed(1) + ' km' : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Elevation gain</span>
                <span className="font-semibold text-slate-800">
                  {Number.isFinite(Number(profile?.elevation_gain_m)) ? Math.round(Number(profile?.elevation_gain_m)) + ' m' : '—'}
                </span>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
              {routeLabel}
            </div>
          </div>

          <div>
            <StageProfileChart profile={profile} />
            {profile?.weather_summary ? (
              <div className="mt-2 text-xs leading-5 text-slate-500">{profile.weather_summary}</div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-800">Selected stage</div>
            <div className="mt-1 text-sm font-semibold text-slate-950">
              Stage 1 · {dateLabel(workspace.event_date)} · {stageTitle}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {riders.length} riders selected · standardized National Team equipment and supplies are applied automatically.
            </div>
          </div>

          {isNationalTeam ? (
            <label className="block min-w-[210px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Team strategy</span>
              <select
                value={teamStrategy}
                onChange={event => setTeamStrategy(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                {strategyOptions.map(option => (
                  <option key={option[0]} value={option[0]}>{option[1]}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
              Individual race · no team strategy
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">1. Rider Equipment Packages</h3>
              <p className="mt-1 text-sm text-slate-500">
                Standard National Team equipment is mandatory and equal for all riders.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
              Locked
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {riders.map(rider => (
              <div
                key={rider.rider_id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_220px] sm:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{rider.rider_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{rider.club_name || 'National Team rider'}</div>
                </div>
                <DisabledSelect label="Equipment package" value="National Team standard" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {isTTT ? '2. Time Trial Pacing & Roles' : '2. Stage Roles'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {isTTT
                  ? 'Team Time Trial rider roles are fixed. Change the team pacing strategy above.'
                  : isNationalTeam
                    ? 'Choose one stage role for every selected National Team rider.'
                    : 'Individual National Championship roles are system-controlled.'}
              </p>
            </div>
            {isTTT || !isNationalTeam ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                Role locked
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {riders.map(rider => (
              <div
                key={rider.rider_id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_220px] sm:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{rider.rider_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {roleLabel(rider.role)}{rider.club_name ? ' · ' + rider.club_name : ''}
                  </div>
                </div>

                {isNationalTeam && !isTTT ? (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Stage role</span>
                    <select
                      value={roles[rider.rider_id] || 'free_role'}
                      onChange={event => setRoles(current => ({
                        ...current,
                        [rider.rider_id]: event.target.value,
                      }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      {ROAD_ROLES.map(option => (
                        <option key={option[0]} value={option[0]}>{option[1]}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <DisabledSelect
                    label="Stage role"
                    value={isTTT ? 'Team Time Trial rider' : 'Individual National rider'}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">3. Individual Tactics</h3>
            <p className="mt-1 text-sm text-slate-500">
              These phase commands remain editable, matching the regular Stage Plans screen.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[200px_repeat(4,minmax(150px,1fr))] gap-2 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <div>Rider</div>
              <div>Phase 1</div>
              <div>Phase 2</div>
              <div>Phase 3</div>
              <div>Phase 4</div>
            </div>

            <div className="space-y-2">
              {riders.map(rider => (
                <div
                  key={rider.rider_id}
                  className="grid grid-cols-[200px_repeat(4,minmax(150px,1fr))] gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                >
                  <div className="min-w-0 px-1 py-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{rider.rider_name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">
                      {rider.club_name || roleLabel(rider.role)}
                    </div>
                  </div>

                  {(['phase_1', 'phase_2', 'phase_3', 'phase_4'] as const).map(phase => (
                    <select
                      key={phase}
                      value={(commands[rider.rider_id] || defaultCommands())[phase].command}
                      onChange={event => updateCommand(rider.rider_id, phase, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      {COMMAND_OPTIONS.map(option => (
                        <option key={option[0]} value={option[0]}>{option[1]}</option>
                      ))}
                    </select>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">4. Stage Race Supplies</h3>
              <p className="mt-1 text-sm text-slate-500">
                National Team supplies are system-provided and cannot be changed.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
              System supplied
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DisabledSelect label="Water bottles" value="Organizer supplied" />
            <DisabledSelect label="Energy gels" value="Organizer supplied" />
            <DisabledSelect label="Nutrition packs" value="Organizer supplied" />
            <DisabledSelect label="Rain jackets / race clothing" value="Organizer supplied" />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Club inventory is not consumed for National Team competition supplies.
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">5. Final Stage Calculation</h3>
              <p className="mt-1 text-sm text-slate-500">
                Read-only National Team setup used by the race engine.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
              Read only
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {[
              ['Equipment package', 'National Team standard'],
              ['Race staff', 'Competition managed'],
              ['Race supplies', 'System supplied'],
              ['Club asset bonus', 'Not applied'],
              ['Club equipment bonus', 'Not applied'],
            ].map(row => (
              <div
                key={row[0]}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm opacity-70"
              >
                <span className="text-slate-600">{row[0]}</span>
                <span className="font-semibold text-slate-700">{row[1]}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
            Team strategy and individual rider commands remain active. Everything that is system-controlled is greyed out.
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Stage Plan'}
        </button>
      </div>
    </div>
  )
}
