import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type NationalTitle = {
  season_number: number
  country_code: string
  final_race_id?: string | null
  completed_at?: string | null
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

export default function NationalChampionBadge({
  riderId,
  className = '',
}: {
  riderId: string
  className?: string
}): JSX.Element | null {
  const [titles, setTitles] = useState<NationalTitle[]>([])

  useEffect(() => {
    let alive = true

    const load = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_rider_national_championship_titles_v1',
        { p_rider_id: riderId },
      )

      if (!alive || error) return
      setTitles(Array.isArray(data) ? (data as NationalTitle[]) : [])
    }

    void load()

    return () => {
      alive = false
    }
  }, [riderId])

  if (titles.length === 0) return null

  const latest = titles[0]
  const flag = flagUrl(latest.country_code)

  return (
    <div
      className={[
        'mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 shadow-sm md:mx-6',
        className,
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm">
          <Trophy className="h-5 w-5" />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-amber-950">National Champion</span>
            {flag ? (
              <img
                src={flag}
                alt={latest.country_code}
                className="h-4 w-6 rounded-sm border border-amber-200 object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-amber-800">{latest.country_code}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-amber-800">
            Season {latest.season_number}
            {titles.length > 1 ? ` · ${titles.length} national titles` : ''}
          </div>
        </div>
      </div>

      <Link
        to={`/dashboard/national-ranking?country=${encodeURIComponent(latest.country_code)}`}
        className="text-sm font-bold text-amber-900 hover:text-amber-700"
      >
        Championship history
      </Link>
    </div>
  )
}
