import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import {
  StageProfileChart,
  getDisplayOnlyProfileMinimumVerticalSpan,
  getDisplayOnlyStageProfilePoints,
} from './RaceDetailPage'

const NATIONAL_ASSOCIATION_RACE_LOGO_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp'

type ProfilePoint = {
  km: number
  elevation: number
}

type TeamRow = {
  group_entry_id: string
  competition_entry_id: string
  association_id: string
  association_name: string
  country_code: string
  seed_position?: number | null
  status: string
  team_id?: string | null
  flag_url?: string | null
  logo_url?: string | null
  jersey_url?: string | null
  national_coach_name?: string | null
  national_coach_kind?: 'test_ai' | 'human' | null
  national_coach_status?: string | null
  submitted_riders?: Array<{
    rider_id: string
    rider_name: string
    country_code: string
  }>
}

type TeamResult = {
  rank?: number | null
  association_id: string
  association_name: string
  country_code: string
  points: number
  elapsed_seconds?: number | null
  gap_seconds?: number | null
  best_rider_rank?: number | null
}

type RaceParticipantRider = {
  id: string
  team_id: string
  club_id?: string | null
  rider_id: string
  rider_name_snapshot?: string | null
  first_name?: string | null
  last_name?: string | null
  country_code_snapshot?: string | null
  age_snapshot?: number | null
  start_number?: number | null
  role_snapshot?: string | null
}

type RaceParticipantTeam = {
  id: string
  team_id: string
  club_id?: string | null
  participating_club_id?: string | null
  race_team_entry_id?: string | null
  assigned_riders_count?: number | null
  riders: RaceParticipantRider[]
}

type RaceFavorite = {
  favorite_rank?: number | null
  rider_id?: string | null
  rider_name?: string | null
  team_id?: string | null
  team_name?: string | null
  country_code?: string | null
  start_number?: number | null
  role_snapshot?: string | null
}

type StageResultRow = {
  rank?: number | null
  rider_id?: string | null
  team_id?: string | null
  rider_name_snapshot?: string | null
  elapsed_seconds?: number | null
  gap_seconds?: number | null
  status?: string | null
}

type ReplayAvailability = {
  status?: string | null
  calculated?: boolean | null
  results_visible?: boolean | null
  publication_pending?: boolean | null
  replay_opens_game_at?: string | null
}

type GeneralStanding = {
  association_id: string
  association_name: string
  country_code: string
  final_group_rank?: number | null
  total_points: number
  ttt_points: number
  flat_points: number
  mountain_points: number
  status: string
}

type RouteData = {
  stage_id?: string | null
  route_label?: string | null
  start_city?: string | null
  finish_city?: string | null
  host_city?: string | null
  distance_km?: number | null
  terrain_type?: string | null
  profile_type?: string | null
  elevation_gain_m?: number | null
  flat_pct?: number | null
  hilly_pct?: number | null
  mountain_pct?: number | null
  cobbled_pct?: number | null
  summary?: string | null
  profile_points?: unknown[]
  route_markers?: unknown[]
  weather_snapshot?: Record<string, unknown> | null
  weather_summary?: string | null
}

type EventData = {
  event_id: string
  edition_id: string
  season_number: number
  competition_name: string
  round_id: string
  round_index: number
  round_type: string
  round_label: string
  group_id: string
  group_number: number
  group_label: string
  race_day: number
  race_type: string
  event_date?: string | null
  status: string
  race_id?: string | null
  generated_stage_id?: string | null
  source_stage_id?: string | null
  host_association_id?: string | null
  host_country_code?: string | null
  host_country_name?: string | null
  host_flag_url?: string | null
  team_count: number
  advancing_places: number
  participants: TeamRow[]
  participants_known: boolean
  results: TeamResult[]
  viewer_has_participant: boolean
  start_time_label?: string | null
  expected_max_temp_c?: number | null
  route: RouteData
}

function normalizePoint(value: unknown): ProfilePoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const km = Number(record.km)
  const elevation = Number(record.elevation_m ?? record.elevation)
  if (!Number.isFinite(km) || !Number.isFinite(elevation)) return null
  return { km, elevation }
}

type RiderNameLookupRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
}

function fullRiderName(row?: RiderNameLookupRow | null): string | null {
  if (!row) return null
  const firstName = row.first_name?.trim() ?? ''
  const lastName = row.last_name?.trim() ?? ''
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || row.display_name?.trim() || null
}

async function loadFullRiderNames(riderIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(riderIds.filter(Boolean)))
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('riders')
    .select('id, first_name, last_name, display_name')
    .in('id', ids)

  if (error) {
    console.warn('Could not load full rider names for World Nations race:', error.message)
    return new Map()
  }

  const result = new Map<string, string>()
  for (const row of (data ?? []) as RiderNameLookupRow[]) {
    const name = fullRiderName(row)
    if (row.id && name) result.set(row.id, name)
  }
  return result
}

function riderProfilePath(riderId?: string | null): string {
  return riderId ? `/dashboard/riders/${riderId}` : '#'
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatDayMonth(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatRaceTime(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—'
  const total = Math.max(0, Math.round(Number(seconds)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatGap(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—'
  const total = Math.max(0, Math.round(Number(seconds)))
  if (total === 0) return 'Leader'
  if (total < 60) return `+${total}s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `+${minutes}:${String(secs).padStart(2, '0')}`
}

function nationDisplayName(name?: string | null, code?: string | null): string {
  const cleaned = name?.replace(/\s+National Association$/i, '').trim()
  return cleaned || code || '—'
}

function statusClasses(status?: string | null): string {
  if (['completed', 'ready', 'active', 'advanced', 'winner'].includes(status ?? '')) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (['scheduled', 'waiting_for_lineups', 'drawn', 'entered'].includes(status ?? '')) {
    return 'bg-sky-100 text-sky-800'
  }
  if (['planned'].includes(status ?? '')) {
    return 'bg-amber-100 text-amber-800'
  }
  return 'bg-slate-100 text-slate-700'
}

function isAssociationCustomJersey(url?: string | null): boolean {
  return Boolean(url && /\/national-associations\//i.test(url))
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
}

function NationCell({
  code,
  name,
  jerseyUrl,
}: {
  code?: string | null
  name?: string | null
  jerseyUrl?: string | null
}): JSX.Element {
  const src = flagUrl(code)

  return (
    <div className="flex items-center gap-3">
      {src ? (
        <img
          src={src}
          alt={code ?? name ?? 'Nation'}
          className="h-5 w-8 rounded border border-slate-200 object-cover"
        />
      ) : (
        <div className="h-5 w-8 rounded border border-slate-200 bg-slate-50" />
      )}
      {jerseyUrl ? (
        <img
          src={jerseyUrl}
          alt=""
          className="h-9 w-9 rounded border border-slate-200 bg-white object-contain p-0.5"
        />
      ) : null}
      <div>
        <div className="font-semibold text-slate-950">{name ?? code ?? '—'}</div>
        <div className="text-xs text-slate-500">{code ?? '—'}</div>
      </div>
    </div>
  )
}

function TerrainSplit({
  route,
  t,
}: {
  route: RouteData
  t: (key: string, options?: any) => string
}): JSX.Element {
  const rows = [
    [t('world.eventPage.flat'), Number(route.flat_pct ?? 0)],
    [t('world.eventPage.hilly'), Number(route.hilly_pct ?? 0)],
    [t('world.eventPage.mountain'), Number(route.mountain_pct ?? 0)],
    [t('world.eventPage.cobbled'), Number(route.cobbled_pct ?? 0)],
  ] as const

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {t('world.eventPage.terrainSplit')}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(([label, raw]) => {
          const value = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0))
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                <span>{label}</span>
                <span>{value.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-slate-800"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function WorldNationsEventPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const navigate = useNavigate()
  const { eventId } = useParams()
  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'teams' | 'results'>('teams')
  const [raceTeams, setRaceTeams] = useState<RaceParticipantTeam[]>([])
  const [raceFavorites, setRaceFavorites] = useState<RaceFavorite[]>([])
  const [stageResults, setStageResults] = useState<StageResultRow[]>([])
  const [generalStandings, setGeneralStandings] = useState<GeneralStanding[]>([])
  const [replayAvailability, setReplayAvailability] = useState<ReplayAvailability | null>(null)
  const [raceInformationOpen, setRaceInformationOpen] = useState(true)

  const load = async (): Promise<void> => {
    if (!eventId) {
      setError(t('world.eventPage.invalid'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: responseData, error: responseError } = await supabase.rpc(
      'get_nations_competition_event_page_v2',
      { p_event_id: eventId },
    )

    if (responseError) {
      setError(responseError.message)
      setData(null)
    } else {
      setData((responseData ?? null) as EventData | null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    const stageId = data?.generated_stage_id ?? data?.route?.stage_id ?? null
    if (!stageId) {
      setReplayAvailability(null)
      return
    }

    let cancelled = false

    async function loadReplayAvailability(): Promise<void> {
      const { data: response, error: availabilityError } = await supabase.rpc(
        'get_universal_race_stage_replay_availability_v1',
        { p_stage_id: stageId },
      )

      if (cancelled) return

      if (availabilityError) {
        setReplayAvailability(null)
        return
      }

      setReplayAvailability((response ?? null) as ReplayAvailability | null)
    }

    void loadReplayAvailability()
    const interval = window.setInterval(() => void loadReplayAvailability(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [data?.generated_stage_id, data?.route?.stage_id])

  const resultsVisible = replayAvailability?.results_visible === true

  useEffect(() => {
    if (!data) {
      setRaceTeams([])
      setRaceFavorites([])
      setStageResults([])
      setGeneralStandings([])
      return
    }

    let cancelled = false

    async function loadRaceInformation(): Promise<void> {
      const raceId = data?.race_id ?? null
      const stageId = data?.generated_stage_id ?? data?.route?.stage_id ?? null

      if (raceId) {
        const [teamsResponse, ridersResponse, favoritesResponse] = await Promise.all([
          supabase
            .from('race_participant_teams_v1')
            .select('*')
            .eq('race_id', raceId)
            .eq('status', 'accepted'),
          supabase
            .from('race_participant_riders_v1')
            .select('id, team_id, club_id, rider_id, rider_name_snapshot, country_code_snapshot, age_snapshot, start_number, role_snapshot')
            .eq('race_id', raceId),
          supabase.rpc('get_race_favorites_v1', { p_race_id: raceId, p_limit: 5 }),
        ])

        if (!cancelled) {
          const rawRiders = (ridersResponse.data ?? []) as RaceParticipantRider[]
          const rawFavorites = ((favoritesResponse.data ?? []) as RaceFavorite[]).slice(0, 5)
          const fullNames = await loadFullRiderNames([
            ...rawRiders.map(rider => rider.rider_id),
            ...rawFavorites
              .map(favorite => favorite.rider_id ?? '')
              .filter(Boolean),
          ])

          if (cancelled) return

          const riders = rawRiders.map(rider => ({
            ...rider,
            rider_name_snapshot:
              fullNames.get(rider.rider_id) ??
              rider.rider_name_snapshot ??
              null,
          }))

          const favorites = rawFavorites.map(favorite => ({
            ...favorite,
            rider_name:
              (favorite.rider_id ? fullNames.get(favorite.rider_id) : null) ??
              favorite.rider_name ??
              null,
          }))

          const teams = ((teamsResponse.data ?? []) as Omit<RaceParticipantTeam, 'riders'>[]).map(team => {
            const ids = new Set(
              [team.id, team.team_id, team.club_id, team.participating_club_id, team.race_team_entry_id]
                .filter((value): value is string => Boolean(value)),
            )
            return {
              ...team,
              riders: riders
                .filter(rider => ids.has(rider.team_id) || (rider.club_id ? ids.has(rider.club_id) : false))
                .sort((a, b) => (a.start_number ?? 999) - (b.start_number ?? 999)),
            }
          })
          setRaceTeams(teams)
          setRaceFavorites(favorites)
        }
      } else if (!cancelled) {
        setRaceTeams([])
        setRaceFavorites([])
      }

      if (!resultsVisible) {
        if (!cancelled) {
          setStageResults([])
          setGeneralStandings([])
        }
        return
      }

      if (stageId) {
        const { data: resultRows } = await supabase
          .from('race_stage_results')
          .select('rank, rider_id, team_id, rider_name_snapshot, elapsed_seconds, gap_seconds, status')
          .eq('stage_id', stageId)
          .order('rank', { ascending: true })

        if (!cancelled) {
          const rawResults = (resultRows ?? []) as StageResultRow[]
          const fullNames = await loadFullRiderNames(
            rawResults
              .map(result => result.rider_id ?? '')
              .filter(Boolean),
          )

          if (cancelled) return

          setStageResults(
            rawResults.map(result => ({
              ...result,
              rider_name_snapshot:
                (result.rider_id ? fullNames.get(result.rider_id) : null) ??
                result.rider_name_snapshot ??
                null,
            })),
          )
        }
      } else if (!cancelled) {
        setStageResults([])
      }

      const { data: overviewData } = await supabase.rpc('get_nations_competition_overview_v1', {
        p_season_number: data.season_number,
      })

      if (!cancelled) {
        const overview = (overviewData ?? {}) as any
        const rounds = Array.isArray(overview.rounds) ? overview.rounds : []
        const group = rounds
          .flatMap((round: any) => (Array.isArray(round.groups) ? round.groups : []))
          .find((candidate: any) => candidate?.id === data.group_id)
        setGeneralStandings(
          Array.isArray(group?.entries)
            ? group.entries.map((entry: any) => ({
                association_id: String(entry.association_id ?? ''),
                association_name: String(entry.association_name ?? entry.country_code ?? ''),
                country_code: String(entry.country_code ?? ''),
                final_group_rank: entry.final_group_rank == null ? null : Number(entry.final_group_rank),
                total_points: Number(entry.total_points ?? 0),
                ttt_points: Number(entry.ttt_points ?? 0),
                flat_points: Number(entry.flat_points ?? 0),
                mountain_points: Number(entry.mountain_points ?? 0),
                status: String(entry.status ?? 'entered'),
              }))
            : [],
        )
      }
    }

    void loadRaceInformation()
    return () => {
      cancelled = true
    }
  }, [data?.event_id, data?.race_id, data?.generated_stage_id, data?.group_id, data?.season_number, data?.route?.stage_id, resultsVisible])


  const points = useMemo(() => {
    const authoritative = (data?.route?.profile_points ?? [])
      .map(normalizePoint)
      .filter((point): point is ProfilePoint => point !== null)
      .sort((a, b) => a.km - b.km)

    return getDisplayOnlyStageProfilePoints(
      data?.route?.stage_id ?? data?.generated_stage_id ?? data?.source_stage_id,
      authoritative,
      data?.route?.terrain_type,
    )
  }, [
    data?.generated_stage_id,
    data?.route?.profile_points,
    data?.route?.stage_id,
    data?.route?.terrain_type,
    data?.source_stage_id,
  ])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('world.eventPage.loading')}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/national-association/world-nations')}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('world.eventPage.back')}
        </button>
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? t('world.eventPage.invalid')}
        </div>
      </div>
    )
  }

  const dateLabel = `${formatDayMonth(data.event_date)} · ${t('common.seasonNumber', {
    season: data.season_number,
  })}`
  const raceTypeLabel = t(`raceTypes.${data.race_type}`, {
    defaultValue: humanize(data.race_type),
  })
  const terrainLabel = humanize(data.route.terrain_type)
  const weather = data.route.weather_snapshot ?? {}
  const weatherCondition = String(weather.condition ?? '')
  const weatherTemp = Number(weather.avg_temp_c ?? weather.temperature_c ?? weather.temp_c)
  const weatherMin = Number(weather.avg_min_temp_c)
  const weatherMax = Number(weather.avg_max_temp_c)
  const weatherWind = Number(weather.avg_wind_kmh)
  const weatherRain = Number(weather.avg_precip_mm)
  const hasWeather = Object.keys(weather).length > 0
  const title = `${data.round_label} · ${data.group_label} · ${raceTypeLabel}`

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={() => navigate('/dashboard/national-association/world-nations')}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('world.eventPage.back')}
      </button>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                {t('world.eventPage.nationsRace')}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {raceTypeLabel}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(data.status)}`}>
                {t(`status.${data.status}`, { defaultValue: humanize(data.status) })}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {data.host_flag_url ? (
                <img
                  src={data.host_flag_url}
                  alt={data.host_country_name ?? data.host_country_code ?? 'Host'}
                  className="h-7 w-11 rounded border border-slate-200 object-cover"
                />
              ) : null}
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                {title}
              </h1>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              {dateLabel}
              {' · '}
              {data.route.host_city ?? data.host_country_name ?? '—'}
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-700">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('world.eventPage.teams')}: <strong>{data.team_count}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('world.eventPage.advance')}: <strong>{data.advancing_places}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('world.eventPage.startTime')}:{' '}
                <strong>{data.start_time_label ?? t('world.eventPage.tbd')}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('world.eventPage.host')}:{' '}
                <strong>{data.host_country_name ?? data.host_country_code ?? '—'}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('world.eventPage.systemCovered')}
              </span>
            </div>
          </div>

          <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-white p-4">
            <img
              src={NATIONAL_ASSOCIATION_RACE_LOGO_URL}
              alt="Cycling World Championships"
              className="max-h-[150px] w-full max-w-[245px] object-contain"
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('world.eventPage.race')}
        </div>
        <div className="mt-4 min-h-[92px] rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left text-slate-950 shadow-sm">
          <div className="text-sm font-medium text-slate-500">
            {dateLabel}
            {data.start_time_label ? ` · ${data.start_time_label}` : ''}
          </div>
          <div className="mt-1 text-base font-semibold">
            {t('world.eventPage.dayRace', { day: data.race_day, race: raceTypeLabel })}
          </div>
          <div className="mt-1 text-xs text-slate-700">
            {data.route.route_label ?? `${data.route.start_city ?? '—'} → ${data.route.finish_city ?? '—'}`}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {terrainLabel} · {Number(data.route.distance_km ?? 0).toFixed(1).replace(/\.0$/, '')} km
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t('world.eventPage.stageProfile')}
          </div>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950">
                {data.route.route_label ?? `${data.route.start_city ?? '—'} → ${data.route.finish_city ?? '—'}`}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {data.route.summary ?? t('world.eventPage.profileDescription')}
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{t('world.eventPage.distance')}</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {Number(data.route.distance_km ?? 0).toFixed(1).replace(/\.0$/, '')} km
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('world.eventPage.terrain')}</div>
                <div className="mt-1 font-semibold text-slate-900">{terrainLabel}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('world.eventPage.elevation')}</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {Math.round(Number(data.route.elevation_gain_m ?? 0)).toLocaleString()} m
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('world.eventPage.temperature')}</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {data.expected_max_temp_c == null
                    ? '—'
                    : `${Number(data.expected_max_temp_c).toFixed(1)}°C`}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <StageProfileChart
              points={points}
              markers={[
                { type: 'start', km: 0, label: t('world.eventPage.start') },
                {
                  type: 'finish',
                  km: Number(data.route.distance_km ?? 0),
                  label: t('world.eventPage.finish'),
                },
              ]}
              distanceKm={Number(data.route.distance_km ?? 0)}
              terrainType={data.route.terrain_type}
              mountainClimbs={[]}
              minimumVerticalSpanOverride={getDisplayOnlyProfileMinimumVerticalSpan(
                data.route.terrain_type,
              )}
            />
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Live race
            </div>
            <div className="mt-3 text-lg font-semibold text-slate-950">
              {data.race_id ? 'Race page available' : 'Replay unavailable'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {data.race_id
                ? 'Open the generated race page for live race status, replay and race controls.'
                : 'Replay is not available yet.'}
            </p>
            {!data.race_id ? (
              <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                Replay becomes available after race generation at the scheduled race time.
              </p>
            ) : null}

            {data.race_id ? (
              <Link
                to={`/dashboard/races/${data.race_id}`}
                className="mt-5 block w-full rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
              >
                Open race page
              </Link>
            ) : (
              <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-400">
                Replay unavailable
              </div>
            )}
          </section>

          <TerrainSplit route={data.route} t={t} />

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {t('world.eventPage.weather')}
            </div>
            {hasWeather ? (
              <>
                <div className="mt-3 text-lg font-semibold text-slate-950">
                  {humanize(weatherCondition)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">{t('world.eventPage.average')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherTemp) ? `${weatherTemp.toFixed(1)}°C` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{t('world.eventPage.minMax')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherMin) && Number.isFinite(weatherMax)
                        ? `${weatherMin.toFixed(1)} / ${weatherMax.toFixed(1)}°C`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{t('world.eventPage.wind')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherWind) ? `${weatherWind.toFixed(0)} km/h` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{t('world.eventPage.rain')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherRain) ? `${weatherRain.toFixed(1)} mm` : '—'}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                {t('world.eventPage.weatherLater')}
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setRaceInformationOpen(value => !value)}
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('world.eventPage.raceInformation')}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-950">
              Participants and results
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            {raceInformationOpen ? 'Hide' : 'Show'}
          </span>
        </button>

        {raceInformationOpen ? (
        <div className="border-t border-slate-100 p-6">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('teams')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'teams' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500',
              ].join(' ')}
            >
              Teams & riders
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'results' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500',
              ].join(' ')}
            >
              Results
            </button>
          </div>

          {activeTab === 'teams' ? (
            <div className="mt-6 space-y-5">
              {raceFavorites.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/40">
                  <div className="border-b border-sky-100 px-4 py-3">
                    <div className="text-sm font-semibold text-sky-950">Top 5 race favorites</div>
                    <div className="text-xs text-sky-700">
                      Calculated from rider skills, this season results, race profile and assigned role.
                    </div>
                  </div>
                  <div className="grid gap-2 p-3 lg:grid-cols-5">
                    {raceFavorites.map((favorite, index) => {
                      const nation = data.participants.find(team => team.team_id === favorite.team_id)
                      const nationFlag = flagUrl(nation?.country_code ?? favorite.country_code)
                      return (
                        <div
                          key={favorite.rider_id ?? `${favorite.rider_name}-${index}`}
                          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                              {favorite.favorite_rank ?? index + 1}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {favorite.start_number ? `#${favorite.start_number}` : '—'}
                            </span>
                          </div>
                          {favorite.rider_id ? (
                            <Link
                              to={riderProfilePath(favorite.rider_id)}
                              className="block truncate text-sm font-semibold text-slate-950 no-underline hover:text-slate-950 hover:no-underline"
                            >
                              {favorite.rider_name ?? '—'}
                            </Link>
                          ) : (
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {favorite.rider_name ?? '—'}
                            </div>
                          )}
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                            {nationFlag ? (
                              <img
                                src={nationFlag}
                                alt=""
                                className="h-3.5 w-5 rounded-sm border border-slate-200 object-cover"
                              />
                            ) : null}
                            <span className="truncate">
                              {nation ? nationDisplayName(nation.association_name, nation.country_code) : 'National Team'}
                            </span>
                          </div>
                          <div className="mt-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {favorite.role_snapshot ? humanize(favorite.role_snapshot) : '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {!data.participants_known ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {t('world.eventPage.teamsPending')}
                </div>
              ) : (
                <div>
                  <div className="mb-4 text-sm font-semibold text-slate-700">
                    {data.participants.length} national team{data.participants.length === 1 ? '' : 's'}
                  </div>
                  <div className="grid gap-5 xl:grid-cols-2">
                    {data.participants.map(team => {
                      const raceTeam = raceTeams.find(candidate => {
                        const ids = [candidate.id, candidate.team_id, candidate.club_id, candidate.participating_club_id, candidate.race_team_entry_id]
                        return ids.some(id => id && id === team.team_id)
                      })
                      // Before race-stage participant synchronization, show the actual
                      // confirmed national-team lineup. Never mistake a scheduled
                      // submission for a stage that has already been simulated.
                      const submittedRiders = data.status === 'completed'
                        ? []
                        : (team.submitted_riders ?? []).map((rider, index) => ({
                            id: rider.rider_id,
                            rider_id: rider.rider_id,
                            team_id: team.team_id ?? '',
                            rider_name_snapshot: rider.rider_name,
                            country_code_snapshot: rider.country_code,
                            start_number: index + 1,
                          }))
                      const riders = raceTeam?.riders?.length ? raceTeam.riders : submittedRiders
                      const nationalFlag = flagUrl(team.country_code)

                      return (
                        <article
                          key={team.group_entry_id}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                        >
                          <div className="border-b border-slate-100 px-5 py-4">
                            <div className="text-lg font-semibold text-slate-950">
                              {nationDisplayName(team.association_name, team.country_code)}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                              {nationalFlag ? (
                                <img
                                  src={nationalFlag}
                                  alt=""
                                  className="h-3.5 w-5 rounded-sm border border-slate-200 object-cover"
                                />
                              ) : null}
                              <span>National Team</span>
                            </div>
                            {team.national_coach_kind === 'test_ai' && team.national_coach_name ? (
                              <div className="mt-1 text-xs text-slate-500">
                                Test National Coach: {team.national_coach_name}
                              </div>
                            ) : null}
                          </div>

                          <div className="grid md:grid-cols-[190px_minmax(0,1fr)]">
                            <div className="border-b border-slate-100 md:border-b-0 md:border-r">
                              <div className="border-b border-slate-100 p-5">
                                <div className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Team logo
                                </div>
                                <div className="mt-3 flex min-h-[120px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  {nationalFlag ? (
                                    <img
                                      src={nationalFlag}
                                      alt={nationDisplayName(team.association_name, team.country_code)}
                                      className="max-h-20 max-w-[120px] object-contain"
                                    />
                                  ) : null}
                                </div>
                              </div>

                              <div className="p-5">
                                <div className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Team jersey
                                </div>
                                <div className="mt-3 flex h-[190px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                                  {team.jersey_url ? (
                                    <img
                                      src={team.jersey_url}
                                      alt=""
                                      className={[
                                        'h-44 w-44 object-contain',
                                        isAssociationCustomJersey(team.jersey_url)
                                          ? 'scale-[1.32]'
                                          : '',
                                      ].join(' ')}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="p-5">
                              <div className="font-semibold text-slate-900">
                                Riders participating in this race
                              </div>
                              <div className="mt-1 text-sm text-slate-500">
                                {riders.length > 0
                                  ? `${riders.length} assigned rider${riders.length === 1 ? '' : 's'}`
                                  : 'No riders submitted yet.'}
                              </div>

                              <div className="mt-3 space-y-2">
                                {riders.map(rider => (
                                  <div
                                    key={rider.rider_id}
                                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-slate-900">
                                        {rider.start_number ? (
                                          <span>{`#${rider.start_number} `}</span>
                                        ) : null}
                                        <Link
                                          to={riderProfilePath(rider.rider_id)}
                                          className="text-slate-900 no-underline hover:text-slate-900 hover:no-underline"
                                        >
                                          {rider.rider_name_snapshot ?? '—'}
                                        </Link>
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                        {flagUrl(rider.country_code_snapshot) ? (
                                          <img
                                            src={flagUrl(rider.country_code_snapshot) ?? ''}
                                            alt=""
                                            className="h-3.5 w-5 rounded-sm border border-slate-200 object-cover"
                                          />
                                        ) : null}
                                        <span>
                                          {[
                                            rider.age_snapshot ? `${rider.age_snapshot} yrs` : null,
                                            rider.role_snapshot ? humanize(rider.role_snapshot) : null,
                                          ].filter(Boolean).join(' · ')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6">
              {!resultsVisible ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">Results are not published yet.</div>
                  <div className="mt-1">
                    Classification and stage results follow the same publication gate as regular races and stay hidden until the replay/result publication window is complete.
                  </div>
                </div>
              ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div>
                    <div className="font-semibold text-slate-950">
                      National team classification
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Current group standing
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl bg-white">
                    <table className="min-w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="w-[8%] px-3 py-3">#</th>
                          <th className="w-[52%] px-3 py-3">Team</th>
                          <th className="w-[22%] px-3 py-3 text-right">
                            {data.race_type === 'team_time_trial' ? 'Time' : 'Points'}
                          </th>
                          <th className="w-[18%] px-3 py-3 text-right">
                            {data.race_type === 'team_time_trial' ? 'Gap' : 'Total'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.race_type === 'team_time_trial' && data.results.length > 0
                          ? data.results.map((result, index) => {
                              const team = data.participants.find(candidate => candidate.association_id === result.association_id)
                              return (
                                <tr key={result.association_id} className="border-b border-slate-100 bg-white">
                                  <td className="px-3 py-3 font-semibold text-slate-900">{result.rank ?? index + 1}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      {team?.jersey_url ? (
                                        <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <img src={team.jersey_url} alt="" className="h-12 w-full object-cover object-top" />
                                        </div>
                                      ) : null}
                                      <span className="font-semibold text-slate-900">
                                        {nationDisplayName(result.association_name, result.country_code)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                    {formatRaceTime(result.elapsed_seconds)}
                                  </td>
                                  <td className="px-3 py-3 text-right text-slate-500">
                                    {formatGap(result.gap_seconds)}
                                  </td>
                                </tr>
                              )
                            })
                          : [...generalStandings]
                              .sort((a, b) => (a.final_group_rank ?? 999) - (b.final_group_rank ?? 999) || b.total_points - a.total_points)
                              .map((standing, index) => {
                                const team = data.participants.find(candidate => candidate.association_id === standing.association_id)
                                return (
                                  <tr key={standing.association_id} className="border-b border-slate-100 bg-white">
                                    <td className="px-3 py-3 font-semibold text-slate-900">
                                      {standing.final_group_rank ?? index + 1}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-3">
                                        {team?.jersey_url ? (
                                          <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                            <img src={team.jersey_url} alt="" className="h-12 w-full object-cover object-top" />
                                          </div>
                                        ) : null}
                                        <span className="font-semibold text-slate-900">
                                          {nationDisplayName(standing.association_name, standing.country_code)}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                      {standing.total_points}
                                    </td>
                                    <td className="px-3 py-3 text-right text-slate-500">
                                      {standing.ttt_points + standing.flat_points + standing.mountain_points}
                                    </td>
                                  </tr>
                                )
                              })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">
                    Stage results
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {data.race_type === 'team_time_trial'
                      ? 'National Team Time Trial result'
                      : 'Riders who participated in this race'}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl bg-white">
                    <table className="min-w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="w-[8%] px-3 py-3">#</th>
                          <th className="w-[52%] px-3 py-3">
                            {data.race_type === 'team_time_trial' ? 'Team' : 'Rider'}
                          </th>
                          <th className="w-[22%] px-3 py-3 text-right">Time</th>
                          <th className="w-[18%] px-3 py-3 text-right">Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.race_type === 'team_time_trial'
                          ? data.results.map((result, index) => {
                              const team = data.participants.find(candidate => candidate.association_id === result.association_id)
                              return (
                                <tr key={`ttt-${result.association_id}`} className="border-b border-slate-100 bg-white">
                                  <td className="px-3 py-3 font-semibold text-slate-900">{result.rank ?? index + 1}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      {team?.jersey_url ? (
                                        <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <img src={team.jersey_url} alt="" className="h-12 w-full object-cover object-top" />
                                        </div>
                                      ) : null}
                                      <span className="font-semibold text-slate-900">
                                        {nationDisplayName(result.association_name, result.country_code)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatRaceTime(result.elapsed_seconds)}</td>
                                  <td className="px-3 py-3 text-right text-slate-500">{formatGap(result.gap_seconds)}</td>
                                </tr>
                              )
                            })
                          : stageResults.map((result, index) => {
                              const participant = data.participants.find(team => team.team_id === result.team_id)
                              return (
                                <tr key={`stage-${result.rider_id ?? index}`} className="border-b border-slate-100 bg-white">
                                  <td className="px-3 py-3 font-semibold text-slate-900">{result.rank ?? '—'}</td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-3">
                                      {participant?.jersey_url ? (
                                        <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <img
                                            src={participant.jersey_url}
                                            alt=""
                                            className="h-12 w-full object-cover object-top"
                                          />
                                        </div>
                                      ) : null}
                                      <div>
                                        {result.rider_id ? (
                                          <Link
                                            to={riderProfilePath(result.rider_id)}
                                            className="font-semibold text-slate-900 no-underline hover:text-slate-900 hover:no-underline"
                                          >
                                            {result.rider_name_snapshot ?? '—'}
                                          </Link>
                                        ) : (
                                          <div className="font-semibold text-slate-900">{result.rider_name_snapshot ?? '—'}</div>
                                        )}
                                        {participant ? (
                                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                            {flagUrl(participant.country_code) ? (
                                              <img
                                                src={flagUrl(participant.country_code) ?? ''}
                                                alt=""
                                                className="h-3.5 w-5 rounded-sm border border-slate-200 object-cover"
                                              />
                                            ) : null}
                                            <span>{nationDisplayName(participant.association_name, participant.country_code)}</span>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatRaceTime(result.elapsed_seconds)}</td>
                                  <td className="px-3 py-3 text-right text-slate-500">{formatGap(result.gap_seconds)}</td>
                                </tr>
                              )
                            })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              {t('common.refresh')}
            </button>
          </div>
        </div>
        ) : null}
      </section>
    </div>
  )
}
