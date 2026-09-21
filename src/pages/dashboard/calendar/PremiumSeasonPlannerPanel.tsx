import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'

type SeasonPlannerRow = {
  race_preparation_id: string
  race_id: string
  race_name: string
  country_code?: string | null
  start_city?: string | null
  finish_city?: string | null
  category: string | null
  race_type?: string | null
  start_date: string
  end_date: string
  rider_submission_deadline_on: string | null
  startlist_status?: string | null
  total_stages: number
  saved_stage_plans: number
  sponsor_target_count: number
  planning_state: string
}

type WorkspacePayload = {
  season_planner?: SeasonPlannerRow[]
}

function formatGameDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const season = Math.max(1, date.getUTCFullYear() - 1999)
  const month = date.toLocaleString(appI18n.resolvedLanguage || appI18n.language || undefined, {
    month: 'short',
    timeZone: 'UTC',
  })

  return appI18n.t('premiumCenter:common.seasonDate', {
    season,
    day: String(date.getUTCDate()).padStart(2, '0'),
    month,
  })
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const key = `premiumCenter:values.${value}`

  if (appI18n.exists(key)) return appI18n.t(key)

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusClass(value: string): string {
  if (value === 'on_track') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (value === 'deadline_close') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function getFlagImageUrl(code?: string | null): string | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase() === 'UK' ? 'GB' : code.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
    : null
}

function daysBetweenGameDates(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

function raceDurationDays(row: SeasonPlannerRow): number {
  const difference = daysBetweenGameDates(row.start_date, row.end_date)
  return difference === null ? 1 : Math.max(1, difference + 1)
}

export default function PremiumSeasonPlannerPanel({
  clubId,
  showHeaderLink = false,
  className = '',
}: {
  clubId: string
  showHeaderLink?: boolean
  className?: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [rows, setRows] = useState<SeasonPlannerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setLoading(false)
        return
      }

      const payload = (data ?? {}) as WorkspacePayload
      let nextRows = Array.isArray(payload.season_planner) ? payload.season_planner : []

      const raceIds = nextRows.map(row => row.race_id).filter(Boolean)
      if (raceIds.length > 0) {
        const raceMetaResult = await supabase
          .from('races')
          .select('id,country_code,start_city,finish_city')
          .in('id', raceIds)

        if (active && !raceMetaResult.error) {
          const raceMeta = new Map(
            (raceMetaResult.data ?? []).map(row => [String(row.id), row as Record<string, unknown>]),
          )
          nextRows = nextRows.map(row => ({
            ...row,
            ...(raceMeta.get(row.race_id) ?? {}),
          }))
        }
      }

      if (!active) return
      setRows(nextRows)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [clubId])

  const insights = useMemo(() => {
    const sortedRows = rows
      .slice()
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

    let raceDays = 0
    let overlapCount = 0
    let largestGap = 0
    let previousEnd: string | null = null

    const enriched = sortedRows.map(row => {
      raceDays += raceDurationDays(row)
      const gapBefore = previousEnd ? daysBetweenGameDates(previousEnd, row.start_date) : null
      const overlapsPrevious = gapBefore !== null && gapBefore <= 0

      if (overlapsPrevious) overlapCount += 1
      if (gapBefore !== null && gapBefore > 1) {
        largestGap = Math.max(largestGap, gapBefore - 1)
      }

      if (!previousEnd || new Date(row.end_date).getTime() > new Date(previousEnd).getTime()) {
        previousEnd = row.end_date
      }

      return { ...row, gapBefore, overlapsPrevious }
    })

    return {
      raceDays,
      freeDays: Math.max(0, 60 - raceDays),
      overlapCount,
      largestGap,
      rows: enriched,
    }
  }, [rows])

  return (
    <section
      id="premium-season-planner"
      className={`mb-5 space-y-4 ${className}`}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{t('season.title')}</h3>
              <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
                Premium
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-600">
              {t('season.description')}
            </p>
          </div>

          {showHeaderLink ? (
            <Link
              to="/dashboard/calendar"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('season.openCalendar')}
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(key => (
            <div key={key} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
          {t('season.noUpcoming')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('season.raceDays')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{insights.raceDays}</div>
              <div className="mt-1 text-xs text-slate-500">{t('season.next60DaysHint')}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('season.freeDays')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{insights.freeDays}</div>
              <div className="mt-1 text-xs text-slate-500">{t('season.next60DaysHint')}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('season.overlaps')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{insights.overlapCount}</div>
              <div className="mt-1 text-xs text-slate-500">
                {insights.overlapCount > 0 ? t('season.overlapWarning') : t('season.noOverlaps')}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('season.largestGap')}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{t('season.daysValue', { count: insights.largestGap })}</div>
              <div className="mt-1 text-xs text-slate-500">{t('season.recoveryWindow')}</div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('season.scheduleMap')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('season.scheduleMapHint')}</div>
            </div>

            <div className="mt-4 space-y-3">
              {insights.rows.slice(0, 10).map((row, index) => {
                const flagUrl = getFlagImageUrl(row.country_code)
                const gapDays = row.gapBefore !== null ? Math.max(0, row.gapBefore - 1) : null
                const route = [row.start_city, row.finish_city].filter(Boolean).join(' → ')

                return (
                  <div key={row.race_preparation_id}>
                    {index > 0 && gapDays !== null ? (
                      <div className="mb-2 ml-4 flex items-center gap-2 text-xs">
                        <div className={`h-px flex-1 ${row.overlapsPrevious ? 'bg-red-200' : 'bg-emerald-200'}`} />
                        <span className={row.overlapsPrevious ? 'font-medium text-red-700' : 'text-slate-500'}>
                          {row.overlapsPrevious
                            ? t('season.overlapBetweenRaces')
                            : t('season.freeWindow', { count: gapDays })}
                        </span>
                        <div className={`h-px flex-1 ${row.overlapsPrevious ? 'bg-red-200' : 'bg-emerald-200'}`} />
                      </div>
                    ) : null}

                    <div className={`rounded-xl border p-4 ${row.overlapsPrevious
                      ? 'border-red-200 bg-red-50/50'
                      : row.planning_state === 'deadline_close'
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-slate-200 bg-white'}`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {flagUrl ? (
                              <img src={flagUrl} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" />
                            ) : null}
                            <span className="font-semibold text-slate-900">{row.race_name}</span>
                            {row.category ? (
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                                {row.category}
                              </span>
                            ) : null}
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(row.planning_state)}`}>
                              {humanize(row.planning_state)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatGameDate(row.start_date)}
                            {row.end_date !== row.start_date ? ` → ${formatGameDate(row.end_date)}` : ''}
                            {' · '}
                            {t('season.durationDays', { count: raceDurationDays(row) })}
                            {route ? ` · ${route}` : ''}
                          </div>
                        </div>

                        <div className="grid min-w-[440px] grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-400">{t('season.startlist')}</div>
                            <div className="mt-0.5 font-medium text-slate-700">{humanize(row.startlist_status)}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-400">{t('season.stagePlans')}</div>
                            <div className="mt-0.5 font-medium text-slate-700">{row.saved_stage_plans}/{row.total_stages}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-400">{t('season.sponsorTargets')}</div>
                            <div className="mt-0.5 font-medium text-slate-700">{row.sponsor_target_count}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-slate-400">{t('season.deadline')}</div>
                            <div className="mt-0.5 font-medium text-slate-700">
                              {row.rider_submission_deadline_on ? formatGameDate(row.rider_submission_deadline_on) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <Link
                          to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                          className="text-xs font-medium text-slate-700 hover:text-yellow-700"
                        >
                          {t('season.officialPreparation')}
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
