import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'

type SeasonPlannerRow = {
  race_preparation_id: string
  race_id: string
  race_name: string
  category: string | null
  start_date: string
  end_date: string
  rider_submission_deadline_on: string | null
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

export default function PremiumSeasonPlannerPanel({
  clubId,
}: {
  clubId: string
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
      } else {
        const payload = (data ?? {}) as WorkspacePayload
        setRows(Array.isArray(payload.season_planner) ? payload.season_planner : [])
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [clubId])

  return (
    <section id="premium-season-planner" className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
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
      </div>

      {loading ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map(key => (
            <div key={key} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-sm text-gray-500">{t('season.noUpcoming')}</div>
      ) : (
        <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {rows.slice(0, 8).map(row => (
            <div
              key={row.race_preparation_id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">{row.race_name}</span>
                  {row.category ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {row.category}
                    </span>
                  ) : null}
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(row.planning_state)}`}>
                    {humanize(row.planning_state)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatGameDate(row.start_date)}
                  {row.end_date !== row.start_date ? ` – ${formatGameDate(row.end_date)}` : ''}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                <span>{t('season.stagePlans')}: {row.saved_stage_plans}/{row.total_stages}</span>
                <span>{t('season.sponsorTargets')}: {row.sponsor_target_count}</span>
                <Link
                  to={`/dashboard/race-preparation?raceId=${row.race_id}`}
                  className="font-medium text-gray-800 hover:text-yellow-700"
                >
                  {t('season.officialPreparation')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
