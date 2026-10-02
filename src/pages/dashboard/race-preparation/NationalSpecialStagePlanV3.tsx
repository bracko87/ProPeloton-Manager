
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../../lib/supabase'
import type { NationalSpecialSelection } from './NationalSpecialRacePreparation'

type JsonRecord = Record<string, unknown>

type PlanRider = {
  rider_id: string
  rider_name: string
  club_name?: string | null
  role?: string | null
}

type EquipmentPreset = {
  id: string
  setup_name: string
  setup_slot?: number | null
  is_empty?: boolean
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
  source_stage_id?: string | null
  profile_stage_id?: string | null
  selected_rider_ids?: string[]
  riders: PlanRider[]
  stage_profile?: JsonRecord | null
  stage_plan?: JsonRecord | null
  equipment_presets?: JsonRecord[]
  saved_rider_plans?: Record<string, JsonRecord>
  test_override?: boolean
}

type StageTiming = {
  available?: boolean
  current_game_ts?: string | null
  stage_start_game_ts?: string | null
  stage_lock_game_ts?: string | null
  locked?: boolean
  lock_policy?: string | null
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
  ['team_time_trial_rider', 'Team Time Trial Rider'],
  ['team_leader_gc', 'Team Leader'],
  ['sprinter', 'Sprinter'],
  ['lead_out_rider', 'Lead-out Rider'],
  ['sprint_train_rider', 'Sprint Train Rider'],
  ['climber', 'Climber'],
  ['mountain_domestique', 'Mountain Domestique'],
  ['helper_domestique', 'Helper / Domestique'],
  ['breakaway_rider', 'Breakaway Rider'],
  ['breakaway_chaser', 'Breakaway Chaser'],
  ['rouleur', 'Rouleur'],
  ['protected_rider', 'Protected Rider'],
  ['free_role', 'Free Role'],
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function defaultCommands() {
  return {
    phase_1: { command: 'ride_naturally' },
    phase_2: { command: 'ride_naturally' },
    phase_3: { command: 'ride_naturally' },
    phase_4: { command: 'ride_naturally' },
  }
}

function normalizeCommands(value: unknown) {
  const record = asRecord(value)
  const result = defaultCommands()
  ;(['phase_1', 'phase_2', 'phase_3', 'phase_4'] as const).forEach(phase => {
    const phaseRecord = asRecord(record[phase])
    const command = String(phaseRecord.command || '').trim()
    if (command) result[phase] = { command }
  })
  return result
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

function formatGameTimestamp(value?: string | null): string {
  if (!value) return '—'
  const normalized = value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value)
    ? value
    : value + 'Z'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value

  const season = Math.max(1, date.getUTCFullYear() - 1999)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
  const month = date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')

  return 'S' + season + ' · ' + weekday + ' · ' + month + ' ' + day + ' · ' + hour + ':' + minute
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

function titleFromSnake(value?: string | null): string {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function profilePoints(profile: JsonRecord) {
  const raw = Array.isArray(profile.profile_points) ? profile.profile_points : []
  return raw
    .map(item => {
      const row = asRecord(item)
      const km = toNumber(row.km)
      const elevation = toNumber(row.elevation_m ?? row.elevation)
      return km === null || elevation === null ? null : { km, elevation }
    })
    .filter((item): item is { km: number; elevation: number } => Boolean(item))
    .sort((a, b) => a.km - b.km)
}

function markerLabel(marker: JsonRecord): string {
  const type = String(marker.type ?? marker.point_type ?? '').toUpperCase()
  if (type === 'START') return 'Start'
  if (type === 'FINISH') return 'Finish'
  if (type.includes('SPRINT')) return 'Sprint'
  if (type === 'KOM' || type === 'MOUNTAIN') {
    const category = String(marker.category ?? marker.kom_category ?? '').trim()
    return category ? 'Cat ' + category : 'KOM'
  }
  return 'Point'
}

function markerColor(type: string): string {
  const normalized = type.toUpperCase()
  if (normalized === 'START') return '#64748b'
  if (normalized === 'FINISH') return '#2563eb'
  if (normalized === 'KOM' || normalized === 'MOUNTAIN') return '#ef4444'
  if (normalized.includes('SPRINT')) return '#22c55e'
  return '#475569'
}

function profileMarkers(profile: JsonRecord, distanceKm: number) {
  const raw = Array.isArray(profile.route_markers) ? profile.route_markers : []
  const markers = raw
    .map(item => {
      const row = asRecord(item)
      const km = toNumber(row.km)
      const type = String(row.type ?? row.point_type ?? '')
      if (km === null || !type) return null
      return { km, type, label: markerLabel(row) }
    })
    .filter((item): item is { km: number; type: string; label: string } => Boolean(item))
    .filter(item => {
      const type = item.type.toUpperCase()
      return (
        type === 'START' ||
        type === 'FINISH' ||
        type === 'KOM' ||
        type === 'MOUNTAIN' ||
        type.includes('SPRINT')
      )
    })

  if (!markers.some(marker => marker.km <= 0.5)) {
    markers.unshift({ km: 0, type: 'START', label: 'Start' })
  }
  if (!markers.some(marker => Math.abs(marker.km - distanceKm) <= 0.5)) {
    markers.push({ km: distanceKm, type: 'FINISH', label: 'Finish' })
  }

  return markers.sort((a, b) => a.km - b.km)
}

function StageProfileChart({ profile }: { profile: JsonRecord }): JSX.Element {
  const points = profilePoints(profile)
  const distanceKm = toNumber(profile.distance_km) ?? Math.max(...points.map(point => point.km), 1)

  if (points.length < 2) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        Stage profile points are missing.
      </div>
    )
  }

  const width = 920
  const height = 360
  const padding = { top: 38, right: 24, bottom: 54, left: 58 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const maxElevationRaw = Math.max(...points.map(point => point.elevation))
  const maxElevation = Math.max(500, Math.ceil((maxElevationRaw * 1.12) / 100) * 100)

  const xForKm = (km: number) =>
    padding.left + (Math.max(0, Math.min(distanceKm, km)) / distanceKm) * innerWidth
  const yForElevation = (elevation: number) =>
    padding.top + innerHeight - (Math.max(0, elevation) / maxElevation) * innerHeight

  const coordinates = points.map(point => ({
    x: xForKm(point.km),
    y: yForElevation(point.elevation),
    ...point,
  }))

  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) return 'M ' + point.x + ' ' + point.y
    const previous = coordinates[index - 1]
    const controlX = (previous.x + point.x) / 2
    return path + ' C ' + controlX + ' ' + previous.y + ', ' + controlX + ' ' + point.y + ', ' + point.x + ' ' + point.y
  }, '')

  const areaPath =
    linePath +
    ' L ' + coordinates[coordinates.length - 1].x + ' ' + (height - padding.bottom) +
    ' L ' + coordinates[0].x + ' ' + (height - padding.bottom) +
    ' Z'

  const markers = profileMarkers(profile, distanceKm)
  const elevationTicks = [0, 0.25, 0.5, 0.75, 1].map(
    ratio => Math.round((maxElevation * ratio) / 100) * 100,
  )

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <svg viewBox={'0 0 ' + width + ' ' + height} className="h-[360px] w-full" role="img" aria-label="Stage profile chart">
        <rect width={width} height={height} fill="#ffffff" />
        {elevationTicks.map(tick => {
          const y = yForElevation(tick)
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#64748b">{tick} m</text>
            </g>
          )
        })}
        <path d={areaPath} fill="#fde68a" opacity="0.9" />
        <path d={linePath} fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
        {markers.map((marker, index) => {
          const x = xForKm(marker.km)
          const color = markerColor(marker.type)
          return (
            <g key={marker.type + '-' + marker.km + '-' + index}>
              <line
                x1={x}
                x2={x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.75"
              />
              <rect x={x - 34} y={14} width="68" height="22" rx="11" fill={color} />
              <text x={x} y={29} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff">
                {marker.label}
              </text>
              <text x={x} y={height - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">
                {marker.km.toFixed(marker.km % 1 === 0 ? 0 : 1)} km
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CompactInfo({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function WeatherCard({ profile }: { profile: JsonRecord }): JSX.Element {
  const weather = asRecord(profile.weather_snapshot)
  const temp = toNumber(weather.temperature_c ?? weather.temp_c)
  const wind = toNumber(weather.wind_kmh ?? weather.wind_kph ?? weather.wind_speed_kph)
  const rain = toNumber(
    weather.rain_chance_pct ??
    weather.rain_probability_pct ??
    weather.precipitation_chance_pct
  )

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span className="text-base">🌤️</span>
        Stage Weather
      </div>
      <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
        <div>
          <div className="text-[11px] text-slate-400">Temp</div>
          <div className="font-semibold text-slate-900">{temp === null ? '—' : temp.toFixed(1) + '°C'}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Wind</div>
          <div className="font-semibold text-slate-900">{wind === null ? '—' : Math.round(wind) + ' km/h'}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Rain</div>
          <div className="font-semibold text-slate-900">{rain === null ? '—' : Math.round(rain) + '%'}</div>
        </div>
      </div>
    </div>
  )
}

function normalizeEquipmentPresets(workspace: Workspace): EquipmentPreset[] {
  return (workspace.equipment_presets || [])
    .map(raw => {
      const row = asRecord(raw)
      const id = String(row.preset_id ?? row.id ?? '')
      const name = String(row.setup_name ?? 'Equipment setup')
      const selected = asRecord(row.selected_catalog_item_ids)
      const explicitEmpty = Boolean(row.is_empty)
      const derivedEmpty =
        'selected_catalog_item_ids' in row &&
        ['frame', 'wheelset', 'tires', 'groupset', 'helmet', 'shoes'].some(key => !selected[key])

      return {
        id,
        setup_name: name,
        setup_slot: toNumber(row.setup_slot),
        is_empty: explicitEmpty || derivedEmpty,
      }
    })
    .filter(preset => Boolean(preset.id))
}

async function loadWorkspace(selection: NationalSpecialSelection): Promise<Workspace> {
  if (selection.kind === 'national_team') {
    const response = await supabase.rpc('get_my_national_team_race_plan_workspace_v3', {
      p_event_id: selection.event.event_id,
    })
    if (response.error) throw response.error
    return response.data as Workspace
  }

  const response = await supabase.rpc('get_my_national_championship_race_plan_workspace_v3', {
    p_edition_id: selection.event.edition_id,
    p_event_type: selection.event.event_type,
    p_heat_id: selection.event.heat_id || null,
    p_preview_rider_ids: selection.event.riders.map(rider => rider.rider_id),
  })
  if (response.error) throw response.error
  return response.data as Workspace
}

export default function NationalSpecialStagePlanV3({
  selection,
}: {
  selection: NationalSpecialSelection
}): JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [timing, setTiming] = useState<StageTiming | null>(null)
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [equipmentByRider, setEquipmentByRider] = useState<Record<string, string>>({})
  const [commands, setCommands] = useState<RiderCommands>({})
  const [teamStrategy, setTeamStrategy] = useState('balanced')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const next = await loadWorkspace(selection)

    let nextTiming: StageTiming | null = null
    if (next.stage_id) {
      const timingResponse = await supabase.rpc('get_national_stage_plan_timing_v1', {
        p_stage_id: next.stage_id,
      })
      if (!timingResponse.error) {
        nextTiming = (timingResponse.data || null) as StageTiming | null
      }
    }

    setWorkspace(next)
    setTiming(nextTiming)

    const nextCommands: RiderCommands = {}
    const nextRoles: Record<string, string> = {}
    const nextEquipment: Record<string, string> = {}
    const presets = normalizeEquipmentPresets(next)
    const completePresetIds = new Set(
      presets.filter(preset => !preset.is_empty).map(preset => preset.id),
    )
    const firstCompletePreset = presets.find(preset => !preset.is_empty)?.id || ''

    if (next.kind === 'national_team') {
      const stagePlan = asRecord(next.stage_plan)
      const savedRoles = asRecord(stagePlan.rider_roles_json)
      const savedEquipment = asRecord(stagePlan.rider_equipment_json)
      const savedCommands = asRecord(stagePlan.rider_individual_tactics_json)
      const allowedRoleIds = new Set<string>(ROAD_ROLES.map(option => option[0]))
      const isTimeTrial = next.race_type === 'team_time_trial'

      next.riders.forEach(rider => {
        const rawRole = String(savedRoles[rider.rider_id] ?? '')
        const normalizedLegacyRole =
          rawRole === 'domestique'
            ? 'helper_domestique'
            : rawRole === 'leader'
              ? 'team_leader_gc'
              : rawRole
        nextRoles[rider.rider_id] = allowedRoleIds.has(normalizedLegacyRole)
          ? normalizedLegacyRole
          : isTimeTrial
            ? 'team_time_trial_rider'
            : 'free_role'

        const savedPresetId = String(savedEquipment[rider.rider_id] ?? '')
        nextEquipment[rider.rider_id] = completePresetIds.has(savedPresetId)
          ? savedPresetId
          : firstCompletePreset

        nextCommands[rider.rider_id] = normalizeCommands(savedCommands[rider.rider_id])
      })

      const rawTeamStrategy = String(stagePlan.team_strategy ?? '')
      const validTeamStrategies = new Set<string>(
        (isTimeTrial ? TTT_STRATEGIES : ROAD_STRATEGIES).map(option => option[0]),
      )
      setTeamStrategy(
        validTeamStrategies.has(rawTeamStrategy)
          ? rawTeamStrategy
          : isTimeTrial
            ? 'tt_balanced_pace'
            : 'balanced',
      )
      setSaved(Boolean(stagePlan.last_saved_at))
    } else {
      const savedPlans = next.saved_rider_plans || {}
      next.riders.forEach(rider => {
        const riderPlan = asRecord(savedPlans[rider.rider_id])
        nextRoles[rider.rider_id] = 'free_role'
        nextEquipment[rider.rider_id] = String(riderPlan.equipment_setup_id ?? firstCompletePreset)
        nextCommands[rider.rider_id] = {
          phase_1: { command: String(riderPlan.phase_1_command ?? 'ride_naturally') },
          phase_2: { command: String(riderPlan.phase_2_command ?? 'ride_naturally') },
          phase_3: { command: String(riderPlan.phase_3_command ?? 'ride_naturally') },
          phase_4: { command: String(riderPlan.phase_4_command ?? 'ride_naturally') },
        }
      })
      setSaved(Object.keys(savedPlans).length > 0)
    }

    setRoles(nextRoles)
    setEquipmentByRider(nextEquipment)
    setCommands(nextCommands)
  }

  useEffect(() => {
    setWorkspace(null)
    setTiming(null)
    setMessage(null)
    setError(null)
    void load().catch(caught => setError(caught?.message || 'Could not load National Stage Plan.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const presets = useMemo(() => workspace ? normalizeEquipmentPresets(workspace) : [], [workspace])
  const completePresets = presets.filter(preset => !preset.is_empty)

  if (!workspace) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        {error || 'Loading National Stage Plan…'}
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

  const isTeam = workspace.kind === 'national_team'
  const isTT = workspace.race_type === 'team_time_trial'
  const selectedIds = new Set(workspace.selected_rider_ids || [])
  const riders = isTeam
    ? workspace.riders.filter(rider => selectedIds.has(rider.rider_id))
    : workspace.riders
  const profile = asRecord(workspace.stage_profile)
  const profileTitle = String(profile.stage_title || raceTypeLabel(workspace.race_type))
  const routeLabel = String(profile.route_label || profile.metadata && asRecord(profile.metadata).route_label || 'Route details pending')
  const profileLabel = titleFromSnake(String(profile.profile_type || profile.terrain_type || ''))
  const distance = toNumber(profile.distance_km)
  const hostCode = isTeam ? workspace.host_country_code : workspace.country_code
  const hostFlag = flagUrl(hostCode)
  const strategyOptions = isTT ? TTT_STRATEGIES : ROAD_STRATEGIES
  const stageLocked = Boolean(timing?.locked) && !Boolean(workspace.test_override)
  const stageStartLabel = timing?.stage_start_game_ts
    ? formatGameTimestamp(timing.stage_start_game_ts)
    : dateLabel(workspace.event_date)
  const stageLockLabel = timing?.stage_lock_game_ts
    ? formatGameTimestamp(timing.stage_lock_game_ts)
    : '—'
  const racePath = selection.kind === 'national_team'
    ? '/dashboard/national-association/world-nations/events/' + selection.event.event_id
    : selection.event.event_type === 'final'
      ? '/dashboard/national-championships/' + selection.event.edition_id + '/final'
      : '/dashboard/national-championships/' + selection.event.edition_id + '/qualification/' + (selection.event.heat_number || 1)

  const updateCommand = (
    riderId: string,
    phase: 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4',
    command: string,
  ) => {
    setCommands(current => ({
      ...current,
      [riderId]: {
        ...(current[riderId] || defaultCommands()),
        [phase]: { command },
      },
    }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      if (isTeam) {
        const response = await supabase.rpc('save_my_national_team_stage_plan_v3', {
          p_event_id: workspace.event_id,
          p_team_plan: teamStrategy,
          p_rider_roles: Object.fromEntries(riders.map(rider => [rider.rider_id, roles[rider.rider_id] || 'free_role'])),
          p_rider_commands: Object.fromEntries(riders.map(rider => [rider.rider_id, commands[rider.rider_id] || defaultCommands()])),
          p_rider_equipment: Object.fromEntries(riders.map(rider => [rider.rider_id, equipmentByRider[rider.rider_id] || ''])),
        })
        if (response.error) throw response.error
      } else {
        for (const rider of riders) {
          const riderCommands = commands[rider.rider_id] || defaultCommands()
          const response = await supabase.rpc('save_my_national_championship_stage_plan_v3', {
            p_edition_id: workspace.edition_id,
            p_event_type: workspace.event_type,
            p_heat_id: workspace.heat_id || null,
            p_rider_id: rider.rider_id,
            p_equipment_setup_id: equipmentByRider[rider.rider_id] || null,
            p_phase_1_command: riderCommands.phase_1.command,
            p_phase_2_command: riderCommands.phase_2.command,
            p_phase_3_command: riderCommands.phase_3.command,
            p_phase_4_command: riderCommands.phase_4.command,
          })
          if (response.error) throw response.error
        }
      }

      setSaved(true)
      setMessage('Stage Plan saved.')
      await load()
    } catch (caught: any) {
      setError(caught?.message || 'Could not save Stage Plan.')
    } finally {
      setSaving(false)
    }
  }

  const ttPhases = [
    { key: 'phase_1' as const, label: 'Before split', range: distance ? '0–' + (distance / 2).toFixed(1) + ' km' : '' },
    { key: 'phase_2' as const, label: 'After split', range: distance ? (distance / 2).toFixed(1) + '–' + distance.toFixed(1) + ' km' : '' },
  ]
  const roadPhases = [
    { key: 'phase_1' as const, label: 'Phase 1', range: '' },
    { key: 'phase_2' as const, label: 'Phase 2', range: '' },
    { key: 'phase_3' as const, label: 'Phase 3', range: '' },
    { key: 'phase_4' as const, label: 'Phase 4', range: '' },
  ]
  const visiblePhases = isTT ? ttPhases : roadPhases

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected race</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hostFlag ? <img src={hostFlag} alt="" className="h-5 w-7 rounded-sm border border-slate-200 object-cover" /> : null}
              <h2 className="text-xl font-bold text-slate-950">
                {isTeam
                  ? (workspace.round_label || 'National Team') + ' · ' + (workspace.group_label || '') + ' · ' + raceTypeLabel(workspace.race_type)
                  : countryName(workspace.country_code) + ' National Championship · ' + titleFromSnake(workspace.event_type)}
              </h2>
              <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (isTeam ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')}>
                {isTeam ? 'National Team' : 'National Ranking'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Race date: <strong>{dateLabel(workspace.event_date)}</strong></span>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Riders: <strong>{riders.length}</strong></span>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Host: <strong>{countryName(hostCode)}</strong></span>
            </div>
          </div>
          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
            Race Plan Submitted
          </span>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Stage Plans</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a stage below to review its profile, then configure equipment, team tactics and individual tactics for that stage.
            </p>
          </div>
          <Link to={racePath} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Open Race Page
          </Link>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-5 xl:grid-cols-[0.58fr_1.42fr]">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-slate-500">Selected Stage Profile</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Stage 1: {profileTitle}</h3>
              <div className="mt-4 grid gap-2">
                <CompactInfo label="Date" value={stageStartLabel} />
                <CompactInfo label="Route" value={routeLabel} />
                <CompactInfo label="Profile" value={profileLabel} />
                <CompactInfo
                  label="Distance"
                  value={distance === null ? '—' : distance.toFixed(distance % 1 === 0 ? 0 : 1) + ' km'}
                />
              </div>
              <WeatherCard profile={profile} />
            </div>
            <div className="rounded-2xl bg-white p-4">
              {profile.has_profile ? (
                <StageProfileChart profile={profile} />
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
                  Stage profile data is not available from the backend yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {!saved ? (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Missing Stage Plans</div>
              <div className="mt-1 text-xs">Open this stage and save a real stage plan before race start.</div>
            </div>
            <div className="text-right text-xs">
              <div>Saved 0/1 stages</div>
              <div className="font-semibold">Missing 1</div>
            </div>
          </div>
        </section>
      ) : null}

      {timing?.available ? (
        <section className={'rounded-2xl border px-4 py-3 ' + (
          stageLocked
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        )}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">Stage Plan lock</span>
            <span>·</span>
            <span>Locks 3 hours before stage start</span>
            <span>·</span>
            <span>Lock time: {stageLockLabel}</span>
            <span>·</span>
            <span>Stage start: {stageStartLabel}</span>
            <span className={'rounded-full px-2 py-0.5 text-[11px] font-semibold ' + (
              stageLocked
                ? 'bg-red-100 text-red-800'
                : 'bg-emerald-100 text-emerald-800'
            )}>
              Status: {stageLocked ? 'Locked' : 'Open'}
            </span>
          </div>
          <div className="mt-1 text-xs">
            {stageLocked
              ? 'This Stage Plan is locked because the three-hour cutoff has been reached.'
              : 'This Stage Plan is still open and can be edited until the lock time is reached.'}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stages</div>
        <div className={'mt-3 rounded-2xl border p-4 ' + (saved ? 'border-emerald-200 bg-emerald-50/40' : 'border-yellow-300 bg-yellow-50/70')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-slate-600">S1 · {dateLabel(workspace.event_date)}</div>
              <div className="mt-1 text-base font-semibold text-slate-950">Stage 1</div>
              <div className="mt-1 text-xs text-slate-500">{routeLabel}</div>
              <div className="mt-1 text-xs text-slate-500">{profileLabel} · {distance === null ? '—' : distance.toFixed(1) + ' km'}</div>
            </div>
            <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (saved ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800')}>
              {saved ? 'Stage Plan Saved' : 'Missing Stage Plan'}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Selected stage save <span className="font-normal text-slate-500">· Stage 1 · {dateLabel(workspace.event_date)}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{saved ? 'Stage Plan saved.' : 'Not saved yet.'}</div>
          </div>
          <button
            type="button"
            disabled={saving || stageLocked || (isTeam && completePresets.length === 0)}
            onClick={() => void save()}
            className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? 'Saving…' : 'Save Stage Plan'}
          </button>
        </div>
      </section>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">1. Rider Equipment Packages</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose one equipment package for each rider for this stage.
              </p>
            </div>
            <button
              type="button"
              disabled={saving || stageLocked || (isTeam && completePresets.length === 0)}
              onClick={() => void save()}
              className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:bg-slate-200 disabled:text-slate-500"
            >
              Save
            </button>
          </div>

          {completePresets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No complete equipment setup is available yet.
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {riders.map(rider => (
              <div key={rider.rider_id} className="grid items-center gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_300px]">
                <div>
                  <div className="font-semibold text-slate-950">{rider.rider_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{roleLabel(rider.role)}{rider.club_name ? ' · ' + rider.club_name : ''}</div>
                </div>
                <select
                  disabled={stageLocked}
                  value={equipmentByRider[rider.rider_id] || ''}
                  onChange={event => {
                    setEquipmentByRider(current => ({ ...current, [rider.rider_id]: event.target.value }))
                    setSaved(false)
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{isTeam ? 'Choose equipment package' : 'Default race equipment'}</option>
                  {presets.map(preset => (
                    <option key={preset.id} value={preset.id} disabled={preset.is_empty}>
                      {preset.setup_name}{preset.is_empty ? ' · incomplete' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isTT ? '2. Time Trial Pacing & Roles' : '2. Stage Roles'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {isTeam
                  ? isTT
                    ? 'Set the National Team pacing plan and rider roles for this time trial.'
                    : 'Choose one clear role for each rider. Detailed race orders are set below.'
                  : 'National Ranking riders compete independently. Team roles are locked.'}
              </p>
            </div>
            {isTeam ? (
              <button
                type="button"
                disabled={saving || stageLocked}
                onClick={() => void save()}
                className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300"
              >
                Save
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">Locked</span>
            )}
          </div>

          {isTeam && isTT ? (
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Pacing plan</span>
              <select
                disabled={stageLocked}
                value={teamStrategy}
                onChange={event => {
                  setTeamStrategy(event.target.value)
                  setSaved(false)
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {strategyOptions.map(option => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
              </select>
            </label>
          ) : null}

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">Rider stage roles</div>
            <div className="space-y-3">
              {riders.map(rider => (
                <div key={rider.rider_id} className="grid items-center gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_240px]">
                  <div>
                    <div className="font-medium text-slate-900">{rider.rider_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Engine role: {isTeam ? roleLabel(roles[rider.rider_id] || 'free_role') : 'Free Role'}
                    </div>
                  </div>
                  {isTeam ? (
                    <select
                      disabled={stageLocked}
                      value={roles[rider.rider_id] || (isTT ? 'team_time_trial_rider' : 'free_role')}
                      onChange={event => {
                        setRoles(current => ({ ...current, [rider.rider_id]: event.target.value }))
                        setSaved(false)
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {ROAD_ROLES.map(option => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
                    </select>
                  ) : (
                    <select disabled value="free_role" className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400">
                      <option value="free_role">Free Role</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">3. Individual Tactics</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isTT
                ? 'Time-trial pacing is split into Before split and After split.'
                : 'Phases 1–4 contain the rider-specific race orders.'}
            </p>
          </div>
          <button
            type="button"
            disabled={saving || stageLocked}
            onClick={() => void save()}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300"
          >
            Save
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div style={{ minWidth: 250 + visiblePhases.length * 180 }}>
            <div
              className="grid gap-2 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              style={{ gridTemplateColumns: '250px repeat(' + visiblePhases.length + ', minmax(150px, 1fr))' }}
            >
              <div>Rider</div>
              {visiblePhases.map(phase => (
                <div key={phase.key}>
                  <div>{phase.label}</div>
                  {phase.range ? <div className="mt-0.5 font-normal normal-case text-slate-400">{phase.range}</div> : null}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {riders.map(rider => (
                <div
                  key={rider.rider_id}
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                  style={{ gridTemplateColumns: '250px repeat(' + visiblePhases.length + ', minmax(150px, 1fr))' }}
                >
                  <div className="px-1 py-1">
                    <div className="font-semibold text-slate-900">{rider.rider_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{rider.club_name || roleLabel(rider.role)}</div>
                  </div>
                  {visiblePhases.map(phase => (
                    <select
                      key={phase.key}
                      disabled={stageLocked}
                      value={(commands[rider.rider_id] || defaultCommands())[phase.key].command}
                      onChange={event => updateCommand(rider.rider_id, phase.key, event.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {COMMAND_OPTIONS.map(option => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
                    </select>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-slate-50 p-5 opacity-70 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-700">4. Stage Race Supplies</h2>
              <p className="mt-1 text-sm text-slate-500">
                National competition supplies are system-provided and cannot be changed.
              </p>
            </div>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500">Locked</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {['Water bottles', 'Energy gels', 'Nutrition packs', 'Rain jackets / race clothing'].map(label => (
              <label key={label} className="block">
                <span className="text-xs font-semibold text-slate-500">{label}</span>
                <select disabled value="system" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400">
                  <option value="system">System supplied</option>
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-slate-50 p-5 opacity-70 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-700">5. Final Stage Calculation</h2>
              <p className="mt-1 text-sm text-slate-500">
                This engine preview is read-only for National competition races.
              </p>
            </div>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500">Locked</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Equipment', 'Included'],
              ['Stage roles', isTeam ? 'Included' : 'Independent rider'],
              ['Individual tactics', 'Included'],
              ['Supplies', 'System supplied'],
              ['National race costs', 'System covered'],
              ['Club assets', 'Not applied'],
            ].map(row => (
              <div key={row[0]} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-xs text-slate-400">{row[0]}</div>
                <div className="mt-1 text-sm font-semibold text-slate-600">{row[1]}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
