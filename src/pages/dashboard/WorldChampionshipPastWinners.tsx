import React, { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type Champion = {
  season_number: number
  race_date: string | null
  champion_rider_id: string | null
  champion_name_snapshot: string | null
  champion_club_name_snapshot: string | null
}

/**
 * Previous winners only. Reuse the existing World Championship overview API,
 * which reads the completed historical editions. Never display last season's
 * runner-up, podium, or incomplete/current season as a past winner.
 */
export function WorldChampionshipPastWinners({ seasonNumber }: {
  seasonNumber: number
}): JSX.Element | null {
  const { t } = useTranslation('raceDetail')
  const [winners, setWinners] = useState<Champion[]>([])
  const [loading, setLoading] = useState(seasonNumber > 1)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 1) {
      setWinners([])
      setLoading(false)
      setError(false)
      return
    }

    let active = true
    setLoading(true)
    setError(false)
    void supabase.rpc('get_world_road_championship_overview_v1', {
      p_season_number: seasonNumber,
    }).then(({ data, error: requestError }) => {
      if (!active) return
      const raw = data as { past_champions?: unknown } | null
      if (requestError || !Array.isArray(raw?.past_champions)) {
        setWinners([])
        setError(true)
      } else {
        const previous = (raw.past_champions as Champion[])
          .filter(row => row && Number.isInteger(row.season_number) &&
            row.season_number > 0 && row.season_number < seasonNumber &&
            Boolean(row.champion_rider_id && row.champion_name_snapshot?.trim()))
          .sort((a, b) => b.season_number - a.season_number)
        // The API returns one completed edition per game season.
        setWinners(previous.filter((row, index) =>
          previous.findIndex(x => x.season_number === row.season_number) === index))
      }
      setLoading(false)
    }).catch(() => {
      if (active) {
        setWinners([])
        setError(true)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [seasonNumber])

  if (seasonNumber <= 1) return null

  return (
    <aside className="w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-3"
      aria-label={t('championship.pastWinners', { defaultValue: 'Past World Road Champions' })}>
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-900">
        <Trophy size={16} aria-hidden="true" />
        {t('championship.pastWinners', { defaultValue: 'Past winners' })}
      </h2>
      {loading ? (
        <p className="mt-2 text-xs text-slate-600">{t('participants.loading', { defaultValue: 'Loading…' })}</p>
      ) : error ? (
        <p className="mt-2 text-xs text-slate-600">
          {t('championship.pastWinnersUnavailable', { defaultValue: 'Past winners are temporarily unavailable.' })}
        </p>
      ) : winners.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">
          {t('championship.noPastWinners', { defaultValue: 'No past champions recorded.' })}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {winners.map(winner => (
            <li key={winner.season_number} className="border-t border-amber-100 pt-2 first:border-0 first:pt-0">
              <div className="text-[11px] font-semibold uppercase text-amber-800">
                {t('championship.seasonNumber', { defaultValue: 'Season {{number}}', number: winner.season_number })}
              </div>
              <div className="mt-0.5 text-sm font-bold text-slate-950">
                {winner.champion_name_snapshot}
              </div>
              {winner.champion_club_name_snapshot && (
                <div className="text-xs text-slate-600">{winner.champion_club_name_snapshot}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
