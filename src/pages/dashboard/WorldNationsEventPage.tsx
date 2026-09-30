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

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
}

function NationCell({
  code,
  name,
}: {
  code?: string | null
  name?: string | null
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

  const load = async (): Promise<void> => {
    if (!eventId) {
      setError(t('world.eventPage.invalid'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: responseData, error: responseError } = await supabase.rpc(
      'get_nations_competition_event_page_v1',
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
            {data.host_flag_url ? (
              <img
                src={data.host_flag_url}
                alt={data.host_country_name ?? data.host_country_code ?? 'Host'}
                className="max-h-[150px] w-full max-w-[245px] rounded-xl border border-slate-200 object-cover shadow-sm"
              />
            ) : (
              <div className="text-sm text-slate-400">{t('world.eventPage.hostPending')}</div>
            )}
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
              {t('world.eventPage.host')}
            </div>
            <div className="mt-3 flex items-center gap-3">
              {data.host_flag_url ? (
                <img
                  src={data.host_flag_url}
                  alt={data.host_country_name ?? 'Host'}
                  className="h-9 w-14 rounded border border-slate-200 object-cover"
                />
              ) : null}
              <div>
                <div className="font-semibold text-slate-950">
                  {data.host_country_name ?? data.host_country_code ?? '—'}
                </div>
                <div className="text-xs text-slate-500">
                  {t('world.eventPage.hostRotates')}
                </div>
              </div>
            </div>

            {data.race_id ? (
              <Link
                to={`/dashboard/races/${data.race_id}`}
                className="mt-5 block w-full rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t('world.eventPage.openLiveRace')}
              </Link>
            ) : (
              <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-400">
                {t('world.eventPage.raceGeneratedLater')}
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
        <div className="px-6 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('world.eventPage.raceInformation')}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {t('world.eventPage.teamsResults')}
          </div>
        </div>

        <div className="border-t border-slate-100 p-6">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('teams')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'teams'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              {t('world.eventPage.teams')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'results'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              {t('world.eventPage.results')}
            </button>
          </div>

          {activeTab === 'teams' ? (
            <div className="mt-6">
              {!data.participants_known ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {t('world.eventPage.teamsPending')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[10%]" />
                      <col className="w-[60%]" />
                      <col className="w-[30%]" />
                    </colgroup>
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t('world.eventPage.nationalTeam')}</th>
                        <th className="px-4 py-3">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {data.participants.map(team => (
                        <tr key={team.group_entry_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {team.seed_position ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <NationCell code={team.country_code} name={team.association_name} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(team.status)}`}>
                              {t(`status.${team.status}`, { defaultValue: humanize(team.status) })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6">
              {data.results.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {t('world.eventPage.resultsPending')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t('world.eventPage.nationalTeam')}</th>
                        <th className="px-4 py-3 text-right">{t('world.eventPage.points')}</th>
                        {data.race_type === 'team_time_trial' ? (
                          <>
                            <th className="px-4 py-3 text-right">{t('world.eventPage.time')}</th>
                            <th className="px-4 py-3 text-right">{t('world.eventPage.gap')}</th>
                          </>
                        ) : (
                          <th className="px-4 py-3 text-right">{t('world.eventPage.bestRider')}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {data.results.map(result => (
                        <tr key={result.association_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {result.rank ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <NationCell code={result.country_code} name={result.association_name} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {result.points}
                          </td>
                          {data.race_type === 'team_time_trial' ? (
                            <>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                {formatRaceTime(result.elapsed_seconds)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {formatGap(result.gap_seconds)}
                              </td>
                            </>
                          ) : (
                            <td className="px-4 py-3 text-right text-slate-600">
                              {result.best_rider_rank ? `#${result.best_rider_rank}` : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end">
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
      </section>
    </div>
  )
}
