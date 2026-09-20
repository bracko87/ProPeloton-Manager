import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'

type RiderDevelopment = {
  rider_id: string
  display_name: string
  role: string | null
  overall: number | null
  potential: number | null
  fatigue: number | null
  availability_status: string | null
  development_8w: number
  overall_delta_8w: number
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

function formatDelta(value: number): string {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0
  const formatted = new Intl.NumberFormat(appI18n.resolvedLanguage || appI18n.language || undefined, {
    maximumFractionDigits: 1,
  }).format(safe)

  return safe > 0 ? `+${formatted}` : formatted
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

  const visibleRows = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.development_8w - a.development_8w)
        .slice(0, 10),
    [rows],
  )

  return (
    <section id="premium-development" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">{t('development.title')}</h3>
        <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
          Premium
        </span>
      </div>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-600">
        {t('development.description')}
      </p>

      {loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-lg bg-gray-100" />
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="mt-4 text-sm text-gray-500">—</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">{t('development.rider')}</th>
                <th className="px-4 py-3">{t('development.role')}</th>
                <th className="px-4 py-3">{t('development.overall')}</th>
                <th className="px-4 py-3">{t('development.potential')}</th>
                <th className="px-4 py-3">{t('development.eightWeekDevelopment')}</th>
                <th className="px-4 py-3">{t('development.overallChange')}</th>
                <th className="px-4 py-3">{t('development.fatigue')}</th>
                <th className="px-4 py-3">{t('development.availability')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(rider => (
                <tr key={rider.rider_id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/my-riders/${rider.rider_id}`}
                      className="font-medium text-gray-900 hover:text-yellow-700"
                    >
                      {rider.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{humanize(rider.role)}</td>
                  <td className="px-4 py-3 text-gray-900">{rider.overall ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{rider.potential ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDelta(rider.development_8w)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDelta(rider.overall_delta_8w)}</td>
                  <td className="px-4 py-3 text-gray-700">{rider.fatigue ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600">{humanize(rider.availability_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
