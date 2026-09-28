import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import RaceDetailPage, {
  StageProfileChart,
  getDisplayOnlyProfileMinimumVerticalSpan,
  getDisplayOnlyStageProfilePoints,
} from './RaceDetailPage'

const FREE_AGENT_JERSEY_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit53.png'

type ProfilePoint = {
  km: number
  elevation: number
}

type RiderRow = {
  rider_id: string
  rider_name: string
  national_rank: number
  seed_number?: number | null
  club_id?: string | null
  team_name?: string | null
  country_code?: string | null
  entry_status?: string | null
  participation_decision?: string | null
  jersey_url?: string | null
}

type ResultRow = {
  rank: number | null
  rider_id: string
  rider_name: string
  club_id?: string | null
  team_name?: string | null
  country_code?: string | null
  elapsed_seconds?: number | null
  gap_seconds?: number | null
  status?: string | null
  jersey_url?: string | null
}

type GeneratedStage = {
  id: string
  race_id: string
  stage_number: number
  stage_date: string
  name?: string | null
  start_city?: string | null
  finish_city?: string | null
  planned_start_time_label?: string | null
  planned_start_hour_number?: number | null
  planned_start_minute?: number | null
  terrain_type?: string | null
  profile_type?: string | null
  distance_km?: number | null
  elevation_gain_m?: number | null
  flat_pct?: number | null
  hilly_pct?: number | null
  mountain_pct?: number | null
  cobbled_pct?: number | null
  weather_snapshot?: Record<string, unknown> | null
  weather_summary?: string | null
  weather_cancelled?: boolean | null
  weather_cancellation_reason?: string | null
}

type RouteData = {
  stage_id: string
  route_label: string
  start_city: string
  finish_city: string
  distance_km: number | null
  terrain_type: string | null
  profile_type: string | null
  elevation_gain_m: number | null
  flat_pct: number | null
  hilly_pct: number | null
  mountain_pct: number | null
  cobbled_pct: number | null
  summary: string | null
  profile_points: unknown[]
  route_markers: unknown[]
}

type EventData = {
  edition_id: string
  season_number: number
  country_code: string
  country_name: string
  flag_url: string
  event_type: 'qualification' | 'final'
  heat_number: number | null
  event_title: string
  event_date: string
  race_id: string | null
  status: string
  field_count: number
  qualifying_places: number
  final_field_size: number
  qualification_window_start_date: string | null
  qualification_window_end_date: string | null
  final_date: string
  start_time_label: string | null
  expected_max_temp_c: number | null
  current_game_date: string
  generated_stage_id: string | null
  generated_stage: GeneratedStage | null
  participants: RiderRow[]
  participants_known: boolean
  results: ResultRow[]
  viewer_has_participant: boolean
  route: RouteData
}

type ReplayAvailability = {
  status: 'loading' | 'available' | 'not_open' | 'not_available' | 'error'
  replayOpensGameAt: string | null
}

type ReplayCoinAccess = {
  coin_cost: number
  coin_balance: number
  has_coin_unlock: boolean
  has_premium_access: boolean
  has_replay_access: boolean
}

function normalizePoint(value: unknown): ProfilePoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const km = Number(record.km)
  const elevation = Number(record.elevation_m ?? record.elevation)
  if (!Number.isFinite(km) || !Number.isFinite(elevation)) return null
  return { km, elevation }
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

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
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
  if (total === 0) return '—'
  if (total < 60) return `+${total}s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `+${minutes}:${String(secs).padStart(2, '0')}`
}

function normalizeReplayAvailability(value: unknown): ReplayAvailability {
  const data = Array.isArray(value) ? value[0] : value
  if (!data || typeof data !== 'object') {
    return { status: 'error', replayOpensGameAt: null }
  }
  const row = data as Record<string, unknown>
  const rawStatus = String(row.status ?? 'not_available')
  const status: ReplayAvailability['status'] =
    rawStatus === 'available' ||
    rawStatus === 'not_open' ||
    rawStatus === 'not_available'
      ? rawStatus
      : 'error'

  return {
    status,
    replayOpensGameAt:
      typeof row.replay_opens_game_at === 'string'
        ? row.replay_opens_game_at
        : null,
  }
}

function normalizeCoinAccess(value: unknown): ReplayCoinAccess | null {
  const data = Array.isArray(value) ? value[0] : value
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  return {
    coin_cost: Number(row.coin_cost ?? 2),
    coin_balance: Number(row.coin_balance ?? 0),
    has_coin_unlock:
      row.has_coin_unlock === true || row.has_coin_unlock === 'true',
    has_premium_access:
      row.has_premium_access === true || row.has_premium_access === 'true',
    has_replay_access:
      row.has_replay_access === true || row.has_replay_access === 'true',
  }
}

function Jersey({
  url,
  name,
}: {
  url?: string | null
  name: string
}): JSX.Element {
  const [src, setSrc] = useState(url?.trim() || FREE_AGENT_JERSEY_URL)

  useEffect(() => {
    setSrc(url?.trim() || FREE_AGENT_JERSEY_URL)
  }, [url])

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5">
      <img
        src={src}
        alt={name}
        className="h-full w-full scale-[1.12] object-contain"
        loading="lazy"
        onError={() => {
          if (src !== FREE_AGENT_JERSEY_URL) setSrc(FREE_AGENT_JERSEY_URL)
        }}
      />
    </div>
  )
}

function TerrainSplit({
  data,
  labels,
}: {
  data: RouteData
  labels: { title: string; flat: string; hilly: string; mountain: string; cobbled: string }
}): JSX.Element {
  const rows = [
    [labels.flat, Number(data.flat_pct ?? 0)],
    [labels.hilly, Number(data.hilly_pct ?? 0)],
    [labels.mountain, Number(data.mountain_pct ?? 0)],
    [labels.cobbled, Number(data.cobbled_pct ?? 0)],
  ] as const

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {labels.title}
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
    </div>
  )
}

export default function NationalChampionshipRacePage(): JSX.Element {
  const { t } = useTranslation('nationalRanking')
  const { t: tr } = useTranslation('raceDetail')
  const navigate = useNavigate()
  const { editionId, eventType: routeEventType, heatNumber } = useParams()

  const eventType: 'qualification' | 'final' | null =
    routeEventType === 'qualification' || routeEventType === 'final'
      ? routeEventType
      : heatNumber
        ? 'qualification'
        : 'final'

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raceInfoTab, setRaceInfoTab] = useState<'riders' | 'results'>('riders')
  const [replayOpen, setReplayOpen] = useState(false)
  const [replayAvailability, setReplayAvailability] =
    useState<ReplayAvailability>({
      status: 'loading',
      replayOpensGameAt: null,
    })
  const [coinAccess, setCoinAccess] = useState<ReplayCoinAccess | null>(null)
  const [coinAccessLoading, setCoinAccessLoading] = useState(false)
  const [coinPurchaseLoading, setCoinPurchaseLoading] = useState(false)
  const [coinMessage, setCoinMessage] = useState<string | null>(null)
  const [coinError, setCoinError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    if (!editionId || (eventType !== 'qualification' && eventType !== 'final')) {
      setError(t('eventPage.invalid'))
      setLoading(false)
      return
    }

    const parsedHeat =
      eventType === 'qualification' ? Number(heatNumber ?? Number.NaN) : null

    if (
      eventType === 'qualification' &&
      (!Number.isInteger(parsedHeat) || Number(parsedHeat) < 1)
    ) {
      setError(t('eventPage.invalid'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_national_championship_event_page_v2',
      {
        p_edition_id: editionId,
        p_event_type: eventType,
        p_heat_number: parsedHeat,
      },
    )

    if (rpcError) {
      setError(rpcError.message)
      setData(null)
    } else {
      setData((rpcData ?? null) as EventData | null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId, eventType, heatNumber])

  useEffect(() => {
    const stageId = data?.generated_stage_id
    const raceId = data?.race_id

    if (!stageId || !raceId) {
      setReplayAvailability({
        status: 'not_available',
        replayOpensGameAt: null,
      })
      setCoinAccess(null)
      return
    }

    let cancelled = false

    async function loadReplayState(): Promise<void> {
      const replayRes = await supabase.rpc(
        'get_universal_race_stage_replay_payload_v1',
        { p_stage_id: stageId },
      )

      if (cancelled) return

      if (replayRes.error) {
        setReplayAvailability({
          status: 'error',
          replayOpensGameAt: null,
        })
      } else {
        setReplayAvailability(normalizeReplayAvailability(replayRes.data))
      }

      if (data?.viewer_has_participant) {
        setCoinAccess(null)
        setCoinAccessLoading(false)
        return
      }

      setCoinAccessLoading(true)
      const accessRes = await supabase.rpc('get_race_replay_coin_access_v1', {
        p_race_id: raceId,
      })

      if (cancelled) return

      if (!accessRes.error) {
        setCoinAccess(normalizeCoinAccess(accessRes.data))
      }
      setCoinAccessLoading(false)
    }

    void loadReplayState()
    const timer = window.setInterval(() => void loadReplayState(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    data?.generated_stage_id,
    data?.race_id,
    data?.viewer_has_participant,
  ])

  async function purchaseReplay(): Promise<void> {
    if (!data?.race_id || coinPurchaseLoading) return

    setCoinPurchaseLoading(true)
    setCoinError(null)
    setCoinMessage(null)

    const { data: purchaseData, error: purchaseError } = await supabase.rpc(
      'purchase_race_replay_access_v1',
      { p_race_id: data.race_id },
    )

    if (purchaseError) {
      setCoinError(purchaseError.message)
    } else {
      const next = normalizeCoinAccess(purchaseData)
      setCoinAccess(next)
      setCoinMessage(
        tr('replay.unlocked', { coins: next?.coin_cost ?? 2 }),
      )
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
    }

    setCoinPurchaseLoading(false)
  }

  const points = useMemo(() => {
    const authoritativePoints = (data?.route?.profile_points ?? [])
      .map(normalizePoint)
      .filter((point): point is ProfilePoint => point !== null)
      .sort((a, b) => a.km - b.km)

    return getDisplayOnlyStageProfilePoints(
      data?.route?.stage_id ??
        data?.generated_stage_id ??
        data?.race_id,
      authoritativePoints,
      data?.route?.terrain_type,
    )
  }, [
    data?.generated_stage_id,
    data?.race_id,
    data?.route?.profile_points,
    data?.route?.stage_id,
    data?.route?.terrain_type,
  ])

  if (
    replayOpen &&
    data?.race_id &&
    data?.generated_stage_id
  ) {
    return (
      <RaceDetailPage
        raceIdOverride={data.race_id}
        replayStageIdOverride={data.generated_stage_id}
        onCloseReplayOverride={() => setReplayOpen(false)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/national-ranking')}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('eventPage.back')}
        </button>
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? t('eventPage.invalid')}
        </div>
      </div>
    )
  }

  const title =
    data.event_type === 'qualification'
      ? t('eventPage.qualificationTitle', {
          country: data.country_name,
          number: data.heat_number ?? '—',
        })
      : t('eventPage.finalTitle', { country: data.country_name })

  const seasonLabel = t('champions.season', { number: data.season_number })
  const dateLabel = `${formatDayMonth(data.event_date)} · ${seasonLabel}`
  const terrainKey = String(data.route.terrain_type ?? '').trim().toLowerCase()
  const terrain = t(`eventPage.terrainTypes.${terrainKey}`, {
    defaultValue: humanize(data.route.terrain_type),
  })
  const generatedStage = data.generated_stage
  const weather = generatedStage?.weather_snapshot ?? {}
  const hasWeather = Object.keys(weather).length > 0
  const weatherCondition = String(weather.condition ?? '')
  const weatherTemp = Number(
    weather.avg_temp_c ?? weather.temperature_c ?? weather.temp_c,
  )
  const weatherMin = Number(weather.avg_min_temp_c)
  const weatherMax = Number(weather.avg_max_temp_c)
  const weatherWind = Number(weather.avg_wind_kmh)
  const weatherRain = Number(weather.avg_precip_mm)

  const hasReplayAccess =
    data.viewer_has_participant ||
    coinAccess?.has_coin_unlock === true ||
    coinAccess?.has_premium_access === true ||
    coinAccess?.has_replay_access === true
  const replayAvailable = replayAvailability.status === 'available'
  const canWatchReplay =
    Boolean(data.generated_stage_id) && replayAvailable && hasReplayAccess

  const statusLabel =
    data.status === 'completed'
      ? t('eventPage.finished')
      : data.status === 'ready' || data.status === 'final_ready'
        ? t('eventPage.ready')
        : t('eventPage.planned')

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={() => navigate('/dashboard/national-ranking')}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('eventPage.back')}
      </button>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                {t('eventPage.nationalEvent')}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {t('eventPage.oneDayRace')}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={data.flag_url}
                alt={data.country_name}
                className="h-6 w-9 rounded border border-slate-200 object-cover"
              />
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                {title}
              </h1>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              {t('eventPage.raceDateLine', {
                date: dateLabel,
                place: data.route.start_city,
              })}
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-700">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('eventPage.riders')}: <strong>{data.field_count}</strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {data.event_type === 'qualification'
                  ? t('eventPage.qualifyingPlaces')
                  : t('eventPage.finalField')}: {' '}
                <strong>
                  {data.event_type === 'qualification'
                    ? data.qualifying_places
                    : data.final_field_size}
                </strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('eventPage.startTime')}: {' '}
                <strong>
                  {data.start_time_label ?? t('eventPage.startTimeTbd')}
                </strong>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
                {t('eventPage.noTeamCost')}
              </span>
            </div>
          </div>

          <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-white p-4">
            <img
              src={data.flag_url}
              alt={data.country_name}
              className="max-h-[150px] w-full max-w-[245px] rounded-xl border border-slate-200 object-cover shadow-sm"
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('eventPage.stages')}
        </div>
        <div className="mt-4">
          <div className="min-h-[92px] rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left text-slate-950 shadow-sm">
            <div className="text-sm font-medium text-slate-500">
              {dateLabel}
              {data.start_time_label ? ` · ${data.start_time_label}` : ''}
            </div>
            <div className="mt-1 text-base font-semibold">
              {t('eventPage.stageOne')}
            </div>
            <div className="mt-1 text-xs text-slate-700">
              {data.route.route_label}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {terrain} · {' '}
              {Number(data.route.distance_km ?? 0)
                .toFixed(1)
                .replace(/\.0$/, '')}{' '}
              km
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t('eventPage.stageProfile')}
          </div>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950">
                {data.route.route_label}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t('eventPage.profileDescription')}
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{t('eventPage.distance')}</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {Number(data.route.distance_km ?? 0)
                    .toFixed(1)
                    .replace(/\.0$/, '')}{' '}
                  km
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('eventPage.terrain')}</div>
                <div className="mt-1 font-semibold text-slate-900">{terrain}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('eventPage.elevation')}</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {Math.round(
                    Number(data.route.elevation_gain_m ?? 0),
                  ).toLocaleString()}{' '}
                  m
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">
                  {t('eventPage.expectedTemperature')}
                </div>
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
                {
                  type: 'start',
                  km: 0,
                  label: tr('stage.start'),
                },
                {
                  type: 'finish',
                  km: Number(data.route.distance_km ?? 0),
                  label: tr('stage.finish'),
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
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {tr('replay.liveRace')}
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {replayAvailable ? tr('replay.available') : tr('replay.unavailable')}
            </h3>
            <p className="mt-2 text-sm leading-5 text-slate-500">
              {!data.generated_stage_id
                ? t('eventPage.replayAfterGeneration')
                : replayAvailability.status === 'not_open'
                  ? tr('replay.notOpen')
                  : replayAvailability.status === 'not_available'
                    ? tr('replay.notAvailable')
                    : replayAvailability.status === 'error'
                      ? tr('replay.temporaryUnavailable')
                      : data.viewer_has_participant
                        ? tr('replay.availableForRace', { race: title })
                        : hasReplayAccess
                          ? tr('replay.availableForRace', { race: title })
                          : tr('replay.unlockDescription', {
                              coins: coinAccess?.coin_cost ?? 2,
                            })}
            </p>

            {replayAvailable &&
            !data.viewer_has_participant &&
            !hasReplayAccess ? (
              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  onClick={() => void purchaseReplay()}
                  disabled={
                    coinPurchaseLoading ||
                    coinAccessLoading ||
                    Number(coinAccess?.coin_balance ?? 0) <
                      Number(coinAccess?.coin_cost ?? 2)
                  }
                  className="w-full rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-950 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {coinPurchaseLoading
                    ? tr('replay.unlocking')
                    : tr('replay.unlockReplay', {
                        coins: coinAccess?.coin_cost ?? 2,
                      })}
                </button>
                <div className="text-center text-xs text-slate-500">
                  {tr('replay.coinBalance', {
                    balance: Number(
                      coinAccess?.coin_balance ?? 0,
                    ).toLocaleString(),
                  })}
                </div>
              </div>
            ) : null}

            {coinMessage ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {coinMessage}
              </div>
            ) : null}
            {coinError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {coinError}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canWatchReplay || coinAccessLoading}
              onClick={() => setReplayOpen(true)}
              className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                canWatchReplay
                  ? 'bg-slate-950 text-white hover:bg-slate-800'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              {canWatchReplay ? tr('replay.watch') : tr('replay.unavailable')}
            </button>
          </section>

          <TerrainSplit
            data={data.route}
            labels={{
              title: tr('stage.terrainSplit'),
              flat: tr('stage.flat'),
              hilly: tr('stage.hilly'),
              mountain: tr('stage.mountain'),
              cobbled: tr('stage.cobbled'),
            }}
          />

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {tr('weather.title')}
            </div>
            {hasWeather ? (
              <>
                <div className="mt-3 text-lg font-semibold text-slate-950">
                  {humanize(weatherCondition)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">{tr('weather.average')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherTemp)
                        ? `${weatherTemp.toFixed(1)}°C`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('weather.minMax')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherMin) && Number.isFinite(weatherMax)
                        ? `${weatherMin.toFixed(1)} / ${weatherMax.toFixed(1)}°C`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('weather.wind')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherWind)
                        ? `${weatherWind.toFixed(0)} km/h`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('weather.rain')}</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {Number.isFinite(weatherRain)
                        ? `${weatherRain.toFixed(1)} mm`
                        : '—'}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                {tr('weather.forecastLater')}
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('eventPage.raceInformation')}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {t('eventPage.ridersResults')}
          </div>
        </div>

        <div className="border-t border-slate-100 p-6">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setRaceInfoTab('riders')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                raceInfoTab === 'riders'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              {t('eventPage.riders')}
            </button>
            <button
              type="button"
              onClick={() => setRaceInfoTab('results')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                raceInfoTab === 'results'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              {t('eventPage.results')}
            </button>
          </div>

          {raceInfoTab === 'riders' ? (
            <div className="mt-6">
              {!data.participants_known ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {t('eventPage.finalRidersPending')}
                </div>
              ) : data.participants.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {t('eventPage.noRiders')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t('eventPage.jersey')}</th>
                        <th className="px-4 py-3">{t('eventPage.rider')}</th>
                        <th className="px-4 py-3">{t('eventPage.team')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {data.participants.map(rider => (
                        <tr key={rider.rider_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {rider.seed_number ?? rider.national_rank}
                          </td>
                          <td className="px-4 py-2">
                            <Jersey
                              url={rider.jersey_url}
                              name={rider.team_name ?? t('ranking.freeAgent')}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/dashboard/riders/${rider.rider_id}`}
                              className="font-semibold text-slate-950 hover:underline"
                            >
                              {rider.rider_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {rider.team_name ?? t('ranking.freeAgent')}
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
                  {t('eventPage.resultsPending')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t('eventPage.jersey')}</th>
                        <th className="px-4 py-3">{t('eventPage.rider')}</th>
                        <th className="px-4 py-3">{t('eventPage.team')}</th>
                        <th className="px-4 py-3 text-right">{t('eventPage.time')}</th>
                        <th className="px-4 py-3 text-right">{t('eventPage.gap')}</th>
                        <th className="px-4 py-3">{t('eventPage.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {data.results.map(result => (
                        <tr key={result.rider_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {result.rank ?? '—'}
                          </td>
                          <td className="px-4 py-2">
                            <Jersey
                              url={result.jersey_url}
                              name={result.team_name ?? t('ranking.freeAgent')}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/dashboard/riders/${result.rider_id}`}
                              className="font-semibold text-slate-950 hover:underline"
                            >
                              {result.rider_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {result.team_name ?? t('ranking.freeAgent')}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatRaceTime(result.elapsed_seconds)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatGap(result.gap_seconds)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {humanize(result.status ?? 'finished')}
                          </td>
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
              {t('eventPage.refresh')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
