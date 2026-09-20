import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'

type RiderDevelopment = {
  rider_id: string
  display_name: string
  country_code: string | null
  role: string | null
  birth_date: string | null
  overall: number | null
  potential: number | null
  fatigue: number | null
  morale: number | null
  availability_status: string | null
  latest_net_change: number | null
  latest_overall_delta: number | null
  development_8w: number
  overall_delta_8w: number
  weeks_recorded: number
}

type WorkspacePayload = {
  rider_development?: RiderDevelopment[]
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const key = `premiumCenter:values.${value}`

  if (appI18n.exists(key)) return appI18n.t(key)

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function safeNumber(value: number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat(appI18n.resolvedLanguage || appI18n.language || undefined, {
    maximumFractionDigits: digits,
  }).format(value)
}

function formatDelta(value: number | null | undefined): string {
  const safe = safeNumber(value)
  const formatted = formatNumber(safe)
  return safe > 0 ? `+${formatted}` : formatted
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper?: string
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  )
}

function SignalCard({
  label,
  rider,
  value,
}: {
  label: string
  rider: RiderDevelopment | null
  value: string
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {rider ? (
        <>
          <Link
            to={`/dashboard/my-riders/${rider.rider_id}`}
            className="mt-2 block truncate text-base font-semibold text-slate-900 hover:text-yellow-700"
          >
            {rider.display_name}
          </Link>
          <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{humanize(rider.role)}</div>
        </>
      ) : (
        <div className="mt-2 text-sm text-slate-500">—</div>
      )}
    </div>
  )
}

export default function PremiumRiderDevelopmentPanel({
  clubId,
}: {
  clubId: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [rows, setRows] = useState<RiderDevelopment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      const { data, error: loadError } = await supabase.rpc('premium_get_command_center_v1', {
        p_club_id: clubId,
      })

      if (!active) return

      if (loadError) {
        setError(loadError.message)
        setRows([])
      } else {
        const payload = (data ?? {}) as WorkspacePayload
        setRows(Array.isArray(payload.rider_development) ? payload.rider_development : [])
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [clubId])

  const analytics = useMemo(() => {
    const overallValues = rows
      .map(rider => rider.overall)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const moraleValues = rows
      .map(rider => rider.morale)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    const improving = rows.filter(rider => safeNumber(rider.development_8w) > 0)
    const unchanged = rows.filter(rider => Math.abs(safeNumber(rider.development_8w)) < 0.05)
    const fatigueWatch = rows.filter(rider => safeNumber(rider.fatigue) >= 60)

    const biggestImprover =
      rows.slice().sort((a, b) => safeNumber(b.development_8w) - safeNumber(a.development_8w))[0] ??
      null

    const largestUpside =
      rows
        .filter(
          rider =>
            typeof rider.overall === 'number' &&
            typeof rider.potential === 'number' &&
            rider.potential > rider.overall,
        )
        .sort(
          (a, b) =>
            safeNumber(b.potential) -
            safeNumber(b.overall) -
            (safeNumber(a.potential) - safeNumber(a.overall)),
        )[0] ?? null

    const highestFatigue =
      rows.slice().sort((a, b) => safeNumber(b.fatigue) - safeNumber(a.fatigue))[0] ?? null

    const topMovers = rows
      .slice()
      .sort((a, b) => safeNumber(b.development_8w) - safeNumber(a.development_8w))
      .slice(0, 8)
      .map(rider => ({
        name: rider.display_name,
        development: safeNumber(rider.development_8w),
      }))

    const overallPotential = rows
      .filter(rider => typeof rider.overall === 'number' || typeof rider.potential === 'number')
      .slice()
      .sort(
        (a, b) =>
          safeNumber(b.potential) -
          safeNumber(b.overall) -
          (safeNumber(a.potential) - safeNumber(a.overall)),
      )
      .slice(0, 10)
      .map(rider => ({
        name: rider.display_name,
        overall: safeNumber(rider.overall),
        potential: safeNumber(rider.potential),
      }))

    return {
      averageOverall: average(overallValues),
      averageMorale: average(moraleValues),
      improvingCount: improving.length,
      unchangedCount: unchanged.length,
      fatigueWatchCount: fatigueWatch.length,
      averageDevelopment: average(rows.map(rider => safeNumber(rider.development_8w))),
      averageWeeks: average(rows.map(rider => safeNumber(rider.weeks_recorded))),
      biggestImprover,
      largestUpside,
      highestFatigue,
      topMovers,
      overallPotential,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return rows
      .filter(rider => {
        if (!normalizedSearch) return true
        return (
          rider.display_name.toLowerCase().includes(normalizedSearch) ||
          String(rider.role ?? '').toLowerCase().includes(normalizedSearch)
        )
      })
      .sort((a, b) => safeNumber(b.development_8w) - safeNumber(a.development_8w))
  }, [rows, search])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(key => (
            <div key={key} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <section id="premium-development" className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-slate-950">{t('development.title')}</h3>
              <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
                Premium
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {t('development.description')}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            {t('development.dataCoverage')}: {formatNumber(analytics.averageWeeks)} {t('development.weeks')}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={t('development.squadAverage')}
          value={formatNumber(analytics.averageOverall)}
          helper={t('development.overall')}
        />
        <MetricCard
          label={t('development.improvingRiders')}
          value={analytics.improvingCount}
          helper={t('development.riders')}
        />
        <MetricCard
          label={t('development.avgDevelopment')}
          value={formatDelta(analytics.averageDevelopment)}
          helper={t('development.eightWeekDevelopment')}
        />
        <MetricCard
          label={t('development.morale')}
          value={formatNumber(analytics.averageMorale)}
        />
        <MetricCard
          label={t('development.fatigueWatch')}
          value={analytics.fatigueWatchCount}
          helper={t('development.riders')}
        />
        <MetricCard
          label={t('development.noChange')}
          value={analytics.unchangedCount}
          helper={t('development.riders')}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h4 className="text-base font-semibold text-slate-900">{t('development.topMovers')}</h4>
            <p className="mt-1 text-sm text-slate-500">{t('development.topMoversDesc')}</p>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.topMovers} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={115} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="development"
                  name={t('development.eightWeekDevelopment')}
                  fill="#eab308"
                  radius={[0, 5, 5, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h4 className="text-base font-semibold text-slate-900">
              {t('development.overallPotentialChart')}
            </h4>
            <p className="mt-1 text-sm text-slate-500">{t('development.overallPotentialDesc')}</p>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.overallPotential} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-24} textAnchor="end" height={70} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="overall" name={t('development.overall')} fill="#334155" radius={[4, 4, 0, 0]} />
                <Bar dataKey="potential" name={t('development.potential')} fill="#eab308" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h4 className="text-base font-semibold text-slate-900">{t('development.insights')}</h4>
          <p className="mt-1 text-sm text-slate-500">{t('development.insightsDesc')}</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SignalCard
            label={t('development.biggestImprover')}
            rider={analytics.biggestImprover}
            value={analytics.biggestImprover ? formatDelta(analytics.biggestImprover.development_8w) : '—'}
          />
          <SignalCard
            label={t('development.largestUpside')}
            rider={analytics.largestUpside}
            value={
              analytics.largestUpside
                ? `+${formatNumber(
                    safeNumber(analytics.largestUpside.potential) -
                      safeNumber(analytics.largestUpside.overall),
                    0,
                  )}`
                : '—'
            }
          />
          <SignalCard
            label={t('development.highestFatigue')}
            rider={analytics.highestFatigue}
            value={
              analytics.highestFatigue
                ? formatNumber(safeNumber(analytics.highestFatigue.fatigue), 0)
                : '—'
            }
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">{t('development.detailedView')}</h4>
            <p className="mt-1 text-sm text-slate-500">{t('development.detailedViewDesc')}</p>
          </div>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('development.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-400 sm:w-64"
          />
        </div>

        {filteredRows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">—</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">{t('development.rider')}</th>
                  <th className="px-4 py-3">{t('development.role')}</th>
                  <th className="px-4 py-3">{t('development.overall')}</th>
                  <th className="px-4 py-3">{t('development.potential')}</th>
                  <th className="px-4 py-3">{t('development.eightWeekDevelopment')}</th>
                  <th className="px-4 py-3">{t('development.overallChange')}</th>
                  <th className="px-4 py-3">{t('development.latestChange')}</th>
                  <th className="px-4 py-3">{t('development.fatigue')}</th>
                  <th className="px-4 py-3">{t('development.morale')}</th>
                  <th className="px-4 py-3">{t('development.weeksRecorded')}</th>
                  <th className="px-4 py-3">{t('development.availability')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(rider => (
                  <tr key={rider.rider_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link
                        to={`/dashboard/my-riders/${rider.rider_id}`}
                        className="font-medium text-slate-900 hover:text-yellow-700"
                      >
                        {rider.display_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{humanize(rider.role)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{rider.overall ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{rider.potential ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatDelta(rider.development_8w)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDelta(rider.overall_delta_8w)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDelta(rider.latest_net_change)}</td>
                    <td className="px-4 py-3 text-slate-700">{rider.fatigue ?? 0}</td>
                    <td className="px-4 py-3 text-slate-700">{rider.morale ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{rider.weeks_recorded ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{humanize(rider.availability_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
