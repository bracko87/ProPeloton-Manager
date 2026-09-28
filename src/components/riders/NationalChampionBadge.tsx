import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Medal, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const WORLD_CHAMPIONSHIP_LOGO =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp'

type ChampionshipHonour = {
  season_number: number
  honor_type: 'national_road' | 'world_road'
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

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function medalLabel(rank: number): string {
  if (rank === 1) return 'Champion'
  if (rank === 2) return 'Silver'
  return 'Bronze'
}

function medalClass(rank: number): string {
  if (rank === 1) {
    return 'border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-white text-amber-950'
  }

  if (rank === 2) {
    return 'border-slate-300 bg-gradient-to-r from-slate-50 via-white to-slate-50 text-slate-900'
  }

  return 'border-orange-300 bg-gradient-to-r from-orange-50 via-amber-50 to-white text-orange-950'
}

export default function NationalChampionBadge({
  riderId,
  className = '',
}: {
  riderId: string
  className?: string
}): JSX.Element | null {
  const [payload, setPayload] = useState<ChampionshipHonoursPayload | null>(null)

  useEffect(() => {
    let alive = true

    const load = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_rider_championship_honours_v1',
        { p_rider_id: riderId },
      )

      if (!alive || error) return

      const value = (data ?? null) as ChampionshipHonoursPayload | null
      setPayload(
        value && Array.isArray(value.honours)
          ? value
          : { current_season: 0, honours: [] },
      )
    }

    void load()

    return () => {
      alive = false
    }
  }, [riderId])

  const currentHonours = useMemo(
    () =>
      (payload?.honours ?? []).filter(
        honour =>
          honour.is_current_season === true ||
          honour.season_number === payload?.current_season,
      ),
    [payload],
  )

  const historicalHonours = useMemo(
    () =>
      (payload?.honours ?? []).filter(
        honour =>
          honour.is_current_season !== true &&
          honour.season_number !== payload?.current_season,
      ),
    [payload],
  )

  if ((payload?.honours?.length ?? 0) === 0) return null

  return (
    <div
      className={[
        'mx-4 mt-4 space-y-2 md:mx-6',
        className,
      ].join(' ')}
    >
      {currentHonours.map((honour, index) => {
        const isWorld = honour.honor_type === 'world_road'
        const flag = flagUrl(honour.country_code)
        const title = isWorld
          ? honour.rank === 1
            ? 'World Road Champion'
            : `World Road Championship ${medalLabel(honour.rank)}`
          : honour.rank === 1
            ? 'National Road Champion'
            : `National Road Championship ${medalLabel(honour.rank)}`

        return (
          <div
            key={`${honour.honor_type}-${honour.season_number}-${honour.country_code ?? 'world'}-${honour.rank}-${index}`}
            className={[
              'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm',
              medalClass(honour.rank),
            ].join(' ')}
          >
            <div className="flex items-center gap-3">
              {isWorld ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white p-1 shadow-sm">
                  <img
                    src={WORLD_CHAMPIONSHIP_LOGO}
                    alt="World Road Championship"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
                  {honour.rank === 1 ? (
                    <Trophy className="h-5 w-5" />
                  ) : (
                    <Medal className="h-5 w-5" />
                  )}
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black">{title}</span>
                  {!isWorld && flag ? (
                    <img
                      src={flag}
                      alt={honour.country_code ?? ''}
                      className="h-4 w-6 rounded-sm border border-black/10 object-cover"
                    />
                  ) : null}
                  {!isWorld && !flag && honour.country_code ? (
                    <span className="text-xs font-bold">
                      {honour.country_code}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs opacity-75">
                  Season {honour.season_number} · #{honour.rank}
                </div>
              </div>
            </div>

            {honour.source_race_id ? (
              <Link
                to={`/dashboard/races/${honour.source_race_id}`}
                className="text-sm font-bold underline-offset-2 hover:underline"
              >
                View championship
              </Link>
            ) : null}
          </div>
        )
      })}

      {historicalHonours.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">
            Career championship honours · {historicalHonours.length}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {historicalHonours.map((honour, index) => {
              const isWorld = honour.honor_type === 'world_road'
              const label = isWorld
                ? `World Road · ${medalLabel(honour.rank)} · S${honour.season_number}`
                : `${honour.country_code ?? 'National'} · ${medalLabel(honour.rank)} · S${honour.season_number}`

              return (
                <span
                  key={`history-${honour.honor_type}-${honour.season_number}-${honour.country_code ?? 'world'}-${honour.rank}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600"
                >
                  {isWorld ? (
                    <img
                      src={WORLD_CHAMPIONSHIP_LOGO}
                      alt=""
                      className="h-4 w-4 object-contain"
                    />
                  ) : flagUrl(honour.country_code) ? (
                    <img
                      src={flagUrl(honour.country_code) ?? undefined}
                      alt=""
                      className="h-3 w-4 rounded-sm object-cover"
                    />
                  ) : null}
                  {label}
                </span>
              )
            })}
          </div>
        </details>
      ) : null}
    </div>
  )
}
