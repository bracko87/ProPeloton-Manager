import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Medal } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type ChampionshipHonour = {
  season_number: number
  honor_type: 'national_road' | 'world_road' | 'national_association'
  rank: number
  country_code?: string | null
  source_race_id?: string | null
  awarded_on?: string | null
  is_current_season?: boolean
}
type ChampionshipHonoursPayload = {
  current_season: number
  honours: ChampionshipHonour[]
}
type Placement = 'banner' | 'history'

const medalStyle: Record<number, string> = {
  1: 'border-yellow-600/50 bg-gradient-to-br from-yellow-200 via-amber-400 to-amber-600 text-amber-950',
  2: 'border-slate-400 bg-gradient-to-br from-white via-slate-200 to-slate-400 text-slate-900',
  3: 'border-orange-700/40 bg-gradient-to-br from-amber-100 via-orange-300 to-orange-600 text-amber-950',
}

/** Banner honours belong inside the yellow rider header. Older honours only
 * appear under rider History; no oversized cards above the profile. */
export default function NationalChampionBadge({
  riderId,
  placement = 'banner',
  className = '',
}: {
  riderId: string
  placement?: Placement
  className?: string
}): JSX.Element | null {
  const { t } = useTranslation('riderProfile')
  const honourTitle = (h: ChampionshipHonour): string => {
    const race = h.honor_type === 'world_road'
      ? t('championshipMedals.worldRoad', { defaultValue: 'World Road Championship' })
      : h.honor_type === 'national_association'
        ? t('championshipMedals.nationalAssociation', { defaultValue: 'National Association Championship' })
        : t('championshipMedals.nationalRoad', { defaultValue: 'National Road Championship' })
    const medal = h.rank === 1
      ? t('championshipMedals.gold', { defaultValue: 'Gold' })
      : h.rank === 2
        ? t('championshipMedals.silver', { defaultValue: 'Silver' })
        : t('championshipMedals.bronze', { defaultValue: 'Bronze' })
    return `${race} — ${medal} · ${t('championshipMedals.season', { defaultValue: 'Season' })} ${h.season_number}${h.country_code ? ` · ${h.country_code}` : ''}`
  }
  const [payload, setPayload] = useState<ChampionshipHonoursPayload | null>(null)
  useEffect(() => {
    let alive = true
    setPayload(null)
    void supabase.rpc('get_rider_championship_honours_v1', {
      p_rider_id: riderId,
    }).then(({ data, error }) => {
      if (!alive || error) return
      const next = data as ChampionshipHonoursPayload | null
      setPayload(next && Array.isArray(next.honours) ? next : { current_season: 0, honours: [] })
    })
    return () => { alive = false }
  }, [riderId])

  const current = useMemo(() => (payload?.honours ?? [])
    .filter(h => h.is_current_season === true || h.season_number === payload?.current_season)
    .sort((a,b) => (a.honor_type === 'world_road' ? -1 : 1) - (b.honor_type === 'world_road' ? -1 : 1) || a.rank-b.rank)
    .slice(0,4), [payload])
  // Career achievements contain *all* seasons, including medals that also
  // appear in the current-season yellow banner. They are not in the Top 5 race list.
  const career = useMemo(() => (payload?.honours ?? [])
    .sort((a,b) => b.season_number-a.season_number || a.rank-b.rank), [payload])
  if (placement === 'banner') {
    if (!current.length) return null
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label={t('championshipMedals.current', { defaultValue: 'Current season championship medals' })}>
        {current.map((h,index) => (
          <div key={`${h.honor_type}-${h.season_number}-${h.rank}-${index}`}
            className="group relative inline-flex" tabIndex={0} role="img" aria-label={honourTitle(h)} title={honourTitle(h)}>
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm sm:h-14 sm:w-14 ${medalStyle[h.rank] ?? medalStyle[3]}`}>
              {h.honor_type === 'world_road' ? (
                <span className="flex flex-col items-center justify-center" aria-hidden="true">
                  <span className="text-sm font-black tracking-tight sm:text-base">UCI</span>
                  <span className="mt-0.5 flex h-1 w-8 overflow-hidden rounded-[1px]">
                    <i className="w-1/5 bg-blue-600" /><i className="w-1/5 bg-red-500" />
                    <i className="w-1/5 bg-black" /><i className="w-1/5 bg-yellow-300" />
                    <i className="w-1/5 bg-emerald-500" />
                  </span>
                </span>
              ) : /^[a-z]{2}$/i.test(h.country_code ?? '') ? (
                <img src={`https://flagcdn.com/w80/${h.country_code!.toLowerCase()}.png`}
                  className="h-6 w-9 rounded-sm border border-white/60 object-cover shadow-sm"
                  loading="lazy" alt="" aria-hidden="true" />
              ) : <Medal className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />}
              <span className="sr-only">{honourTitle(h)}</span>
            </div>
            <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-[260px] -translate-x-1/2 rounded-lg bg-slate-950 px-3 py-2 text-center text-xs font-semibold text-white shadow-xl group-hover:block group-focus:block">
              {honourTitle(h)}
              {h.awarded_on ? <div className="mt-1 font-normal">{h.awarded_on}</div> : null}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (!career.length) return null
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">
        {t('championshipMedals.career', { defaultValue: 'Championship and Association achievements' })}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {t('championshipMedals.careerSummary', { defaultValue: 'National, international and association honours, including the current season.' })}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Season</th>
              <th className="px-3 py-2">Achievement</th>
              <th className="px-3 py-2">Medal</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Race</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {career.map((h, index) => (
              <tr key={`${h.honor_type}-${h.season_number}-${h.rank}-${index}`}>
                <td className="px-3 py-2 font-semibold">Season {h.season_number}</td>
                <td className="px-3 py-2">{h.honor_type === 'world_road'
                  ? 'World Road Championship'
                  : h.honor_type === 'national_association'
                    ? 'National Association Championship'
                    : 'National Road Championship'}</td>
                <td className="px-3 py-2 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <Medal size={16} className={h.rank === 1 ? 'text-amber-500' : h.rank === 2 ? 'text-slate-500' : 'text-orange-600'}/>
                    {h.rank === 1 ? 'Gold' : h.rank === 2 ? 'Silver' : 'Bronze'}
                  </span>
                </td>
                <td className="px-3 py-2">{h.country_code ?? '—'}</td>
                <td className="px-3 py-2">{h.source_race_id
                  ? <Link className="font-semibold text-sky-700 hover:underline" to={`/dashboard/races/${h.source_race_id}`}>
                      {t('championshipMedals.viewRace', { defaultValue: 'View race' })}
                    </Link>
                  : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
