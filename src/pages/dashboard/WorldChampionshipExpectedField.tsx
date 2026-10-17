import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type ExpectedChampion = {
  country_code: string
  national_final_date: string | null
  champion_rider_id: string | null
  champion_name: string | null
  champion_club_name: string | null
  entry_status: string | null
  participation_decision: string | null
  final_participation_decision: string | null
  national_status: string | null
}

export function WorldChampionshipExpectedField({
  raceId,
  onOpenRiderProfile,
}: {
  raceId: string
  onOpenRiderProfile: (riderId: string) => void
}): JSX.Element {
  const { t } = useTranslation('raceDetail')
  const [rows, setRows] = useState<ExpectedChampion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    void supabase.rpc('get_world_road_championship_expected_field_v1', {
      p_race_id: raceId,
    }).then(({ data, error: rpcError }) => {
      if (!alive) return
      if (rpcError) {
        setError(rpcError.message)
        setRows([])
      } else {
        setRows(Array.isArray(data) ? (data as ExpectedChampion[]) : [])
      }
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [raceId])

  const confirmed = useMemo(() => rows.filter(row =>
    row.entry_status === 'confirmed' &&
    ['approved', 'auto_approved'].includes(row.participation_decision ?? '') &&
    !['refused', 'rejected'].includes(row.final_participation_decision ?? '')
  ).length, [rows])

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-sky-200 bg-white">
      <div className="border-b border-sky-100 bg-sky-50 px-4 py-3">
        <h3 className="font-semibold text-slate-950">
          {t('participants.worldChampionshipFieldTitle', { defaultValue: 'National champions — confirmed riders and expected country slots' })}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {t('participants.worldChampionshipFieldDescription', { defaultValue: 'Each country has a reserved expectation until its National Road Championship is decided. Names appear only when the national title has been awarded. Invitations are not guaranteed starts.' })}
        </p>
        {!loading && !error ? (
          <div className="mt-2 text-xs font-semibold text-sky-900">
            {confirmed} {t('participants.worldChampionshipConfirmed', { defaultValue: 'confirmed riders' })} · {rows.filter(row => !row.champion_rider_id).length} {t('participants.worldChampionshipAwaiting', { defaultValue: 'awaiting a national champion' })}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="p-4 text-sm text-slate-500">{t('participants.loading', { defaultValue: 'Loading...' })}</div>
      ) : error ? (
        <div className="p-4 text-sm text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">
          {t('participants.worldChampionshipNoSlots', { defaultValue: 'No national championship slots have been scheduled yet.' })}
        </div>
      ) : (
        <div className="grid max-h-[580px] grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => {
            const countryCode = row.country_code?.toUpperCase() ?? ''
            const flagCode = countryCode.toLowerCase()
            const hasChampion = Boolean(row.champion_rider_id)
            const hasFinalRefusal = ['rejected', 'refused'].includes(row.final_participation_decision ?? '')
            const isConfirmed = row.entry_status === 'confirmed' &&
              ['approved', 'auto_approved'].includes(row.participation_decision ?? '') &&
              !hasFinalRefusal
            const unavailable = hasFinalRefusal || ['unavailable', 'withdrawn', 'rejected'].includes(row.entry_status ?? '') ||
              ['rejected', 'refused'].includes(row.participation_decision ?? '')
            const status = !hasChampion
              ? t('participants.worldChampionshipWaiting', { defaultValue: 'Awaiting national champion' })
              : unavailable
                ? t('participants.worldChampionshipUnavailable', { defaultValue: 'Not on confirmed start list' })
                : isConfirmed
                  ? t('participants.worldChampionshipConfirmedLabel', { defaultValue: 'Confirmed starter' })
                  : t('participants.worldChampionshipInvited', { defaultValue: 'Invitation / confirmation pending' })
            return (
              <div key={countryCode} className="flex min-w-0 items-start gap-3 border-b border-r border-slate-100 px-4 py-3">
                {/^[a-z]{2}$/.test(flagCode) ? (
                  <img className="mt-1 h-4 w-6 rounded-sm object-cover" src={`https://flagcdn.com/w80/${flagCode}.png`} alt="" loading="lazy" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-500">{countryCode}</div>
                  {hasChampion && row.champion_rider_id ? (
                    <button type="button" className="block truncate text-left text-sm font-semibold text-sky-800 hover:underline" onClick={() => onOpenRiderProfile(row.champion_rider_id!)}>
                      {row.champion_name || t('participants.worldChampionshipChampion', { defaultValue: 'National champion' })}
                    </button>
                  ) : (
                    <div className="text-sm font-medium italic text-slate-600">
                      {t('participants.worldChampionshipTbd', { defaultValue: 'Rider to be determined' })}
                    </div>
                  )}
                  {hasChampion && row.champion_club_name ? (
                    <div className="truncate text-xs text-slate-500">{row.champion_club_name}</div>
                  ) : null}
                  <div className={`mt-1 text-xs ${isConfirmed ? 'text-emerald-700' : unavailable ? 'text-red-600' : 'text-amber-700'}`}>{status}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
