import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

type ProfilePoint = {
  km: number
  elevation: number
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

function NationalProfileChart({
  points,
  distanceKm,
  ariaLabel,
}: {
  points: ProfilePoint[]
  distanceKm: number
  ariaLabel: string
}): JSX.Element {
  const width = 1000
  const height = 280
  const padding = { left: 56, right: 24, top: 24, bottom: 38 }

  const model = useMemo(() => {
    if (points.length < 2) return null

    const sorted = [...points].sort((a, b) => a.km - b.km)
    const minKm = Math.min(...sorted.map(point => point.km))
    const maxKm = Math.max(distanceKm, ...sorted.map(point => point.km), 1)
    const rawMin = Math.min(...sorted.map(point => point.elevation))
    const rawMax = Math.max(...sorted.map(point => point.elevation))
    const minElevation = Math.max(0, Math.floor((rawMin - 100) / 100) * 100)
    const maxElevation = Math.max(
      minElevation + 300,
      Math.ceil((rawMax + 150) / 100) * 100,
    )
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom

    const coords = sorted.map(point => ({
      x:
        padding.left +
        ((point.km - minKm) / Math.max(maxKm - minKm, 1)) * innerWidth,
      y:
        padding.top +
        innerHeight -
        ((point.elevation - minElevation) /
          Math.max(maxElevation - minElevation, 1)) *
          innerHeight,
    }))

    const line = coords
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')
    const area = `${line} L ${coords[coords.length - 1].x} ${
      height - padding.bottom
    } L ${coords[0].x} ${height - padding.bottom} Z`

    return {
      line,
      area,
      minElevation,
      maxElevation,
      maxKm,
      ticks: [0, 0.25, 0.5, 0.75, 1].map(fraction => ({
        fraction,
        elevation:
          minElevation + (maxElevation - minElevation) * (1 - fraction),
        y: padding.top + innerHeight * fraction,
      })),
    }
  }, [points, distanceKm])

  if (!model) {
    return (
      <div className="flex h-64 items-center justify-center rounded border border-slate-200 bg-slate-50 text-sm text-slate-500">
        —
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {model.ticks.map(tick => (
        <g key={tick.fraction}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={tick.y}
            y2={tick.y}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text
            x={padding.left - 10}
            y={tick.y + 4}
            textAnchor="end"
            fontSize="11"
            fill="#64748b"
          >
            {Math.round(tick.elevation)} m
          </text>
        </g>
      ))}

      <path d={model.area} fill="#fef3c7" />
      <path
        d={model.line}
        fill="none"
        stroke="#d97706"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <text
        x={padding.left}
        y={height - 12}
        fontSize="11"
        fill="#64748b"
      >
        0 km
      </text>
      <text
        x={width - padding.right}
        y={height - 12}
        textAnchor="end"
        fontSize="11"
        fill="#64748b"
      >
        {model.maxKm.toFixed(1).replace(/\.0$/, '')} km
      </text>
    </svg>
  )
}

export default function NationalChampionshipRacePage(): JSX.Element {
  const { t } = useTranslation('nationalRanking')
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

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
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
        'get_national_championship_event_page_v1',
        {
          p_edition_id: editionId,
          p_event_type: eventType,
          p_heat_number: parsedHeat,
        },
      )

      if (cancelled) return

      if (rpcError) {
        setError(rpcError.message)
        setData(null)
      } else {
        setData((rpcData ?? null) as EventData | null)
      }

      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [editionId, eventType, heatNumber, t])

  const points = useMemo(
    () =>
      (data?.route?.profile_points ?? [])
        .map(normalizePoint)
        .filter((point): point is ProfilePoint => point !== null)
        .sort((a, b) => a.km - b.km),
    [data?.route?.profile_points],
  )

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

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-800">
                {t('eventPage.nationalEvent')}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {seasonLabel}
              </span>
              {data.event_type === 'qualification' ? (
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {t('eventPage.group', { number: data.heat_number ?? '—' })}
                </span>
              ) : null}
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {t('eventPage.subtitle')}
            </p>
          </div>

          <div className="flex min-w-[180px] items-center justify-center lg:justify-end">
            <img
              src={data.flag_url}
              alt={data.country_name}
              className="h-28 w-40 rounded-xl border border-slate-200 object-cover shadow-sm"
            />
          </div>
        </div>

        <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
          <div className="bg-white px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('eventPage.date')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">{dateLabel}</div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('eventPage.startTime')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {data.start_time_label ?? t('eventPage.startTimeTbd')}
            </div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('eventPage.riders')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">{data.field_count}</div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {data.event_type === 'qualification'
                ? t('eventPage.qualifyingPlaces')
                : t('eventPage.finalField')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {data.event_type === 'qualification'
                ? data.qualifying_places
                : data.final_field_size}
            </div>
          </div>

          <div className="bg-white px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('eventPage.route')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {data.route.route_label}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('eventPage.stageProfile')}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {data.route.route_label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {t('eventPage.profileDescription')}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">{t('eventPage.distance')}</div>
              <div className="mt-1 font-semibold text-slate-900">
                {Number(data.route.distance_km ?? 0).toFixed(1).replace(/\.0$/, '')} km
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('eventPage.terrain')}</div>
              <div className="mt-1 font-semibold text-slate-900">{terrain}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('eventPage.elevation')}</div>
              <div className="mt-1 font-semibold text-slate-900">
                {Math.round(Number(data.route.elevation_gain_m ?? 0)).toLocaleString()} m
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
          <NationalProfileChart
            points={points}
            distanceKm={Number(data.route.distance_km ?? 0)}
            ariaLabel={t('eventPage.profileChartAlt')}
          />
        </div>

        <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          {t('eventPage.profileNote')}
        </div>
      </section>
    </div>
  )
}
