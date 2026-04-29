/**
 * Footer.tsx
 * Global footer showing authoritative live game time and quick links.
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
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
  dayNumber: number
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

function formatGameTime(row: GameTimeRow): string {
  const seasonText = `Season ${row.season_number}`
  const weekdayText = getWeekdayName(
    row.season_number,
    row.month_name,
    row.day_number
  )
  const dateText = `${row.month_name} ${row.day_number}`
  const timeText = formatTime(row.hour_24, row.minute_2)

  return weekdayText
    ? `${seasonText} - ${weekdayText} - ${dateText} - ${timeText}`
    : `${seasonText} - ${dateText} - ${timeText}`
}

export default function Footer({
  refreshIntervalMs = 30000,
}: GameTimeProps): JSX.Element {
  const [gameTimeText, setGameTimeText] = useState('Loading game time...')

  useEffect(() => {
    let cancelled = false

    async function loadGameTime(): Promise<void> {
      const { data, error } = await supabase.rpc('get_authoritative_game_time')

      if (cancelled) return

      if (error) {
        setGameTimeText((prev) =>
          prev === 'Loading game time...' ? 'Game time unavailable' : prev
        )
        return
      }

      const rows = data as GameTimeRow[] | null
      const nextRow = rows?.[0]

      if (nextRow) {
        setGameTimeText(formatGameTime(nextRow))
      } else {
        setGameTimeText((prev) =>
          prev === 'Loading game time...' ? 'Game time unavailable' : prev
        )
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

  return (
    <footer className="border-t border-yellow-500 bg-yellow-400 py-3 px-6 flex items-center justify-between">
      <div className="text-sm font-semibold text-black">{gameTimeText}</div>

      <div className="flex items-center gap-4">
        <Link
          to="/dashboard/overview"
          className="text-sm font-semibold text-black hover:opacity-80"
        >
          Dashboard
        </Link>
        <a className="text-sm font-semibold text-black hover:opacity-80">Support</a>
        <a className="text-sm font-semibold text-black hover:opacity-80">Terms</a>
      </div>
    </footer>
  )
}