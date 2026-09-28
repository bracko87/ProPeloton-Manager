/**
 * Footer.tsx
 * Global footer showing authoritative live game time and important public links.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

const TENNIS_LEGACY_URL = 'https://tennislegacygame.com/?source=propeloton_manager'
const TENNIS_LEGACY_LOGO_URL =
  'https://cwfznmroiqcyhfkfcrow.supabase.co/storage/v1/object/sign/Admin/Branding/logo%20333.png?token=eyJraWQiOiJmYWIyM2E5ZS02NDA1LTQxNjUtODVmNC0wNzZjZjA4NDgyYmQiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJBZG1pbi9CcmFuZGluZy9sb2dvIDMzMy5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3OTQ1MDc5LCJleHAiOjQ5MTAwMDkwNzl9.Q7Ocay_B1kouWo_XmmgtVcGOCh0xtzhzaIm713AhU-ci-xJPY3JanaT3xhdkptAuKV5kUJGHov34fSM2TGjmcQ'

interface GameTimeRow {
  season_number: number
  month_number: number
  month_name: string
  day_number: number
  hour_24: number
  minute_2: number
  display_text: string
}

interface GameTimeProps {
  refreshIntervalMs?: number
}

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function getWeekdayName(
  seasonNumber: number,
  monthName: string,
  dayNumber: number,
): string | null {
  const monthIndex = MONTH_INDEX_BY_NAME[monthName]

  if (monthIndex === undefined || !Number.isInteger(dayNumber)) {
    return null
  }

  const year = 1999 + seasonNumber
  const date = new Date(Date.UTC(year, monthIndex, dayNumber))

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return WEEKDAY_NAMES[date.getUTCDay()] ?? null
}

function formatTime(hour24: number, minute2: number): string {
  const hour = String(hour24).padStart(2, '0')
  const minute = String(minute2).padStart(2, '0')
  return `${hour}:${minute}`
}

export default function Footer({
  refreshIntervalMs = 30000,
}: GameTimeProps): JSX.Element {
  const { t } = useTranslation(['navigation', 'calendar'])
  const [gameTime, setGameTime] = useState<GameTimeRow | null>(null)
  const [gameTimeUnavailable, setGameTimeUnavailable] = useState(false)

  function recordCrossGameClick(): void {
    void supabase.rpc('record_cross_game_referral_event_v1', {
      p_event_type: 'outgoing_click',
      p_source_game: 'propeloton_manager',
      p_destination_game: 'tennis_legacy',
      p_surface: 'game_footer',
    })
  }

  useEffect(() => {
    let cancelled = false

    async function loadGameTime(): Promise<void> {
      const { data, error } = await supabase.rpc('get_authoritative_game_time')

      if (cancelled) return

      if (error) {
        setGameTimeUnavailable(true)
        return
      }

      const rows = data as GameTimeRow[] | null
      const nextRow = rows?.[0] ?? null

      if (nextRow) {
        setGameTime(nextRow)
        setGameTimeUnavailable(false)
      } else {
        setGameTimeUnavailable(true)
      }
    }

    void loadGameTime()

    const interval = window.setInterval(() => {
      void loadGameTime()
    }, refreshIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [refreshIntervalMs])

  const gameTimeText = useMemo(() => {
    if (!gameTime) {
      return gameTimeUnavailable
        ? t('navigation:footer.gameTimeUnavailable')
        : t('navigation:footer.loadingGameTime')
    }

    const weekdayName = getWeekdayName(
      gameTime.season_number,
      gameTime.month_name,
      gameTime.day_number,
    )

    const localizedMonthRaw = t(
      `calendar:months.${gameTime.month_name}`,
      { defaultValue: gameTime.month_name },
    )
    const localizedMonth = localizedMonthRaw
      ? `${localizedMonthRaw.charAt(0).toLocaleUpperCase()}${localizedMonthRaw.slice(1)}`
      : localizedMonthRaw

    const localizedDate = t('calendar:date', {
      month: localizedMonth,
      day: gameTime.day_number,
    })

    const time = formatTime(gameTime.hour_24, gameTime.minute_2)
    const season = t('navigation:footer.season')

    if (weekdayName) {
      const localizedWeekday = t(
        `calendar:weekdays.${weekdayName}`,
        { defaultValue: weekdayName },
      )

      return t('calendar:gameTimeWithWeekday', {
        season,
        seasonNumber: gameTime.season_number,
        weekday: localizedWeekday,
        date: localizedDate,
        time,
      })
    }

    return t('calendar:gameTimeWithoutWeekday', {
      season,
      seasonNumber: gameTime.season_number,
      date: localizedDate,
      time,
    })
  }, [gameTime, gameTimeUnavailable, t])

  return (
    <footer className="border-t border-yellow-500 bg-yellow-400 px-6 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">{gameTimeText}</div>
          <div className="mt-1 text-xs text-black/70">
            {t('navigation:footer.description')}
          </div>

          <a
            href={TENNIS_LEGACY_URL}
            target="_blank"
            rel="noreferrer"
            onClick={recordCrossGameClick}
            className="mt-3 inline-flex max-w-md items-center gap-3 rounded-xl border border-black/15 bg-black/5 px-3 py-2 text-black no-underline hover:bg-black/10"
            aria-label="Play Tennis Legacy: Rise to Glory, another game from Next Quest Studio"
          >
            <img
              src={TENNIS_LEGACY_LOGO_URL}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 rounded-lg bg-slate-950 object-contain"
            />
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-black/55">
                Also from our studio
              </span>
              <span className="block text-xs font-bold">Tennis Legacy: Rise to Glory</span>
            </span>
            <span className="ml-auto text-xs font-bold">Play Now ↗</span>
          </a>
        </div>

        <nav
          aria-label={t('navigation:footer.navigation')}
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <Link to="/about" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.about')}
          </Link>
          <Link to="/how-to-play" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.howToPlay')}
          </Link>
          <Link to="/privacy-policy" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.privacyPolicy')}
          </Link>
          <Link to="/terms" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.terms')}
          </Link>
          <Link to="/support" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.support')}
          </Link>
          <Link to="/contact" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.contact')}
          </Link>
          <Link to="/dashboard/overview" className="text-sm font-semibold text-black hover:opacity-80">
            {t('navigation:footer.dashboard')}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
