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

function confirmedStarter(row: ExpectedChampion): boolean {
  return Boolean(row.champion_rider_id) &&
    row.entry_status === 'confirmed' &&
    ['approved', 'auto_approved'].includes(row.participation_decision ?? '') &&
    !['refused','rejected','withdrawn'].includes(row.final_participation_decision ?? '')
}

function unavailableStarter(row: ExpectedChampion): boolean {
  return ['refused','rejected','withdrawn'].includes(row.final_participation_decision ?? '') ||
    ['unavailable','withdrawn','rejected'].includes(row.entry_status ?? '') ||
    ['refused','rejected'].includes(row.participation_decision ?? '')
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
    let active = true
    setLoading(true)
    setError(null)
    void supabase.rpc('get_world_road_championship_expected_field_v1', {
      p_race_id: raceId,
    }).then(({ data, error: rpcError }) => {
      if (!active) return
      setRows(rpcError ? [] : Array.isArray(data) ? data as ExpectedChampion[] : [])
      setError(rpcError?.message ?? null)
      setLoading(false)
    })
    return () => { active = false }
  }, [raceId])

  // Confirmed national champions first, invitations awaiting final approval next,
  // and countries with unfinished qualification last. Exactly one row per country.
  const ordered = useMemo(() => [...rows].sort((a,b) => {
    const priority = (row: ExpectedChampion) =>
      confirmedStarter(row) ? 0 :
      row.champion_rider_id && !unavailableStarter(row) ? 1 :
      row.champion_rider_id ? 2 : 3
    return priority(a)-priority(b) || a.country_code.localeCompare(b.country_code)
  }), [rows])
  const confirmed = rows.filter(confirmedStarter).length
  const pending = rows.filter(row => !row.champion_rider_id).length

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-sky-200 bg-white">
      <header className="border-b border-sky-100 bg-sky-50 px-4 py-3">
        <h3 className="font-semibold text-slate-950">
          {t('participants.worldChampionshipFieldTitle', { defaultValue: 'World Road Championship — start list and expected nations' })}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {t('participants.worldChampionshipFieldDescription', { defaultValue: 'One rider per country. Confirmed national champions are listed first. Countries still running qualification remain grey until their champion is known.' })}
        </p>
        {!loading && !error ? (
          <p className="mt-2 text-xs font-semibold text-sky-900">
            {confirmed} {t('participants.worldChampionshipConfirmed', { defaultValue: 'confirmed riders' })} · {pending} {t('participants.worldChampionshipAwaiting', { defaultValue: 'awaiting a national champion' })}
          </p>
        ) : null}
      </header>
      {loading ? (
        <div className="p-4 text-sm text-slate-500">{t('participants.loading', { defaultValue: 'Loading...' })}</div>
      ) : error ? (
        <div role="alert" className="p-4 text-sm text-red-700">{error}</div>
      ) : ordered.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">
          {t('participants.worldChampionshipNoSlots', { defaultValue: 'No national championship slots are scheduled yet.' })}
        </div>
      ) : (
        <div className="max-h-[650px] overflow-x-auto overflow-y-auto">
          <div className="min-w-[560px]">
            <div className="sticky top-0 grid grid-cols-[50px_minmax(130px,1fr)_minmax(200px,2fr)_minmax(130px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>#</span><span>{t('participants.country', { defaultValue: 'Country' })}</span>
              <span>{t('participants.rider', { defaultValue: 'Rider' })}</span>
              <span>{t('participants.status', { defaultValue: 'Status' })}</span>
            </div>
            {ordered.map((row, index) => {
              const countryCode = row.country_code?.toUpperCase() ?? ''
              const flagCode = countryCode.toLowerCase()
              const isConfirmed = confirmedStarter(row)
              const isUnavailable = unavailableStarter(row)
              const waitingForNational = !row.champion_rider_id
              const statusLabel = waitingForNational
                ? t('participants.worldChampionshipWaiting', { defaultValue: 'Qualification ongoing' })
                : isConfirmed
                  ? t('participants.worldChampionshipConfirmedLabel', { defaultValue: 'Confirmed' })
                  : isUnavailable
                    ? t('participants.worldChampionshipUnavailable', { defaultValue: 'Not confirmed' })
                    : t('participants.worldChampionshipInvited', { defaultValue: 'Awaiting confirmation' })
              return (
                <div key={countryCode} className={`grid grid-cols-[50px_minmax(130px,1fr)_minmax(200px,2fr)_minmax(130px,1fr)] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-sm ${waitingForNational ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-800'}`}>
                  <span className="text-xs font-semibold tabular-nums">{index+1}</span>
                  <span className="flex items-center gap-2 font-semibold">
                    {/^[a-z]{2}$/.test(flagCode) ? (
                      <img src={`https://flagcdn.com/w80/${flagCode}.png`} className="h-4 w-6 rounded-sm object-cover" alt="" loading="lazy"/>
                    ) : null}
                    {countryCode}
                  </span>
                  <span className="min-w-0">
                    {row.champion_rider_id && row.champion_name ? (
                      <button type="button" className="block max-w-full truncate text-left font-semibold text-sky-800 hover:underline" onClick={() => onOpenRiderProfile(row.champion_rider_id!)}>
                        {row.champion_name}
                      </button>
                    ) : (
                      <span className="italic">{t('participants.worldChampionshipTbd', { defaultValue: 'Participant not yet known' })}</span>
                    )}
                    {!waitingForNational && row.champion_club_name ? <span className="block truncate text-xs text-slate-500">{row.champion_club_name}</span> : null}
                  </span>
                  <span className={`text-xs font-semibold ${waitingForNational ? 'text-slate-400' : isConfirmed ? 'text-emerald-700' : isUnavailable ? 'text-red-600' : 'text-amber-700'}`}>{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
