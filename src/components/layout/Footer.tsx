/**
 * Footer.tsx
 * Global footer showing authoritative live game time and important public links.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

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

    const localizedMonth = t(
      `calendar:months.${gameTime.month_name}`,
      { defaultValue: gameTime.month_name },
    )

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
