import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

// Keep the neutral kit identical to the National Championship qualification list.
const NATIONAL_FREE_AGENT_JERSEY_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit53.png'

function WorldRiderJerseyStrip({ url, name }: { url: string | null | undefined; name: string }): JSX.Element {
  const preferredUrl = url?.trim() || NATIONAL_FREE_AGENT_JERSEY_URL
  const [imageUrl, setImageUrl] = useState(preferredUrl)

  useEffect(() => {
    setImageUrl(preferredUrl)
  }, [preferredUrl])

  return (
    <div className="relative h-9 w-full max-w-[240px] overflow-hidden rounded-lg border border-slate-200 bg-white"
      title={name}>
      <img src={imageUrl} alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full scale-[5] object-contain"
        style={{ objectPosition: '50% 37%', transformOrigin: '50% 37%' }}
        onError={() => setImageUrl(current => current !== NATIONAL_FREE_AGENT_JERSEY_URL
          ? NATIONAL_FREE_AGENT_JERSEY_URL : current)} />
      <span className="sr-only">{name}</span>
    </div>
  )
}

type ExpectedChampion = {
  country_code: string
  champion_rider_id: string | null
  champion_name: string | null
  champion_club_name: string | null
  champion_jersey_url?: string | null
  entry_status: string | null
  participation_decision: string | null
  final_participation_decision: string | null
  national_status: string | null
}

function isConfirmed(row: ExpectedChampion): boolean {
  return Boolean(row.champion_rider_id) &&
    row.entry_status === 'confirmed' &&
    ['approved', 'auto_approved'].includes(row.participation_decision ?? '') &&
    !['refused', 'rejected', 'withdrawn'].includes(row.final_participation_decision ?? '')
}

function isUnavailable(row: ExpectedChampion): boolean {
  return ['refused', 'rejected', 'withdrawn'].includes(row.final_participation_decision ?? '') ||
    ['unavailable', 'withdrawn', 'rejected'].includes(row.entry_status ?? '') ||
    ['refused', 'rejected'].includes(row.participation_decision ?? '')
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

  const ordered = useMemo(() => [...rows].sort((a, b) => {
    const priority = (row: ExpectedChampion) =>
      isConfirmed(row) ? 0 : row.champion_rider_id && !isUnavailable(row) ? 1 :
        row.champion_rider_id ? 2 : 3
    return priority(a) - priority(b) || a.country_code.localeCompare(b.country_code)
  }), [rows])
  const confirmedCount = rows.filter(isConfirmed).length
  const waitingCount = rows.filter(row => !row.champion_rider_id).length

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="px-4 py-4">
        <h3 className="font-semibold text-slate-900">
          {t('participants.worldChampionshipFieldTitle', { defaultValue: 'World Road Championship Grand Finale — riders' })}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {t('participants.worldChampionshipFieldDescription', { defaultValue: 'Confirmed starters are listed first. Every remaining country has one reserved place until qualification or participation is decided.' })}
        </p>
        {!loading && !error ? (
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {confirmedCount} {t('participants.worldChampionshipConfirmed', { defaultValue: 'confirmed riders' })}
            {' · '}{waitingCount} {t('participants.worldChampionshipAwaiting', { defaultValue: 'countries awaiting a champion' })}
          </p>
        ) : null}
      </header>
      {loading ? (
        <p className="px-4 pb-4 text-sm text-slate-500">{t('participants.loading', { defaultValue: 'Loading riders...' })}</p>
      ) : error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-red-700">{error}</p>
      ) : ordered.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">
          {t('participants.worldChampionshipNoSlots', { defaultValue: 'No national championship slots have been scheduled yet.' })}
        </p>
      ) : (
        <div className="max-h-[740px] overflow-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[28%]" />
              <col className="w-[24%]" />
              <col className="w-[29%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{t('results.country', { defaultValue: 'Country' })}</th>
                <th className="px-4 py-3">{t('results.rider', { defaultValue: 'Rider' })}</th>
                <th className="px-4 py-3">{t('results.team', { defaultValue: 'Team' })}</th>
                <th className="px-4 py-3">{t('participants.riderKit', { defaultValue: 'Current team jersey' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordered.map((row, index) => {
                const code = (row.country_code ?? '').toUpperCase()
                const flagCode = code.toLowerCase()
                const confirmed = isConfirmed(row)
                const unavailable = isUnavailable(row)
                const waitingForChampion = !row.champion_rider_id
                const pending = !confirmed
                const status = waitingForChampion
                  ? t('participants.worldChampionshipWaiting', { defaultValue: 'Qualification ongoing' })
                  : unavailable
                    ? t('participants.worldChampionshipUnavailable', { defaultValue: 'Not confirmed' })
                    : confirmed
                      ? t('participants.worldChampionshipConfirmedLabel', { defaultValue: 'Confirmed starter' })
                      : t('participants.worldChampionshipInvited', { defaultValue: 'Awaiting participation confirmation' })
                return (
                  <tr key={code} className={pending ? 'bg-slate-50/80 text-slate-500' : 'bg-white hover:bg-slate-50'}>
                    <td className="px-4 py-3 font-semibold tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        {/^[a-z]{2}$/.test(flagCode) ? (
                          <img src={`https://flagcdn.com/w40/${flagCode}.png`}
                            alt={code} loading="lazy"
                            className={`h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover ${pending ? 'opacity-60' : ''}`} />
                        ) : <span className="inline-block h-4 w-6 shrink-0 rounded-sm border bg-slate-100" />}
                        {code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.champion_rider_id && row.champion_name ? (
                        <button type="button" onClick={() => onOpenRiderProfile(row.champion_rider_id!)}
                          className={`text-left font-semibold hover:underline ${confirmed ? 'text-slate-950' : 'text-slate-600'}`}>
                          {row.champion_name}
                        </button>
                      ) : (
                        <span className="italic text-slate-400">
                          {t('participants.worldChampionshipTbd', { defaultValue: 'Participant not yet known' })}
                        </span>
                      )}
                      <div className={`mt-1 text-xs ${confirmed ? 'text-emerald-700' : unavailable ? 'text-rose-600' : 'text-slate-500'}`}>{status}</div>
                    </td>
                    <td className="px-4 py-3">{row.champion_rider_id
                      ? row.champion_club_name?.trim() || t('participants.freeAgent', { defaultValue: 'Free Agent' })
                      : '—'}</td>
                    <td className="px-4 py-2">
                      {row.champion_rider_id ? (
                        <WorldRiderJerseyStrip
                          url={row.champion_club_name?.trim() ? row.champion_jersey_url : null}
                          name={row.champion_club_name?.trim() || t('participants.freeAgent', { defaultValue: 'Free Agent' })}
                        />
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
