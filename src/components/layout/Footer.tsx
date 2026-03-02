/**
 * Footer.tsx
 * Global footer showing live game time and quick links.
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'

/**
 * GameTimeRow
 * Shape returned by public.get_game_time().
 */
interface GameTimeRow {
  season_number: number
  month_name: string
  day_number: number
  hour_24: number
  minute_2: number
  display_text: string
}

/**
 * GameTimeProps
 * Optional refresh interval override.
 */
interface GameTimeProps {
  refreshIntervalMs?: number
}

/**
 * Footer
 * Displays global game-time and simple footer navigation.
 *
 * Game-time is sourced from the centralized backend (Supabase)
 * using public.get_game_time().
 */
export default function Footer({
  refreshIntervalMs = 30000
}: GameTimeProps): JSX.Element {
  const [gameTimeText, setGameTimeText] = useState('Loading game time...')

  useEffect(() => {
    let cancelled = false

    async function loadGameTime(): Promise<void> {
      const { data, error } = await supabase.rpc('get_game_time')

      if (cancelled) return

      if (error) {
        setGameTimeText(prev =>
          prev === 'Loading game time...' ? 'Game time unavailable' : prev
        )
        return
      }

      const rows = data as GameTimeRow[] | null
      const nextText = rows?.[0]?.display_text

      if (nextText) {
        setGameTimeText(nextText)
      } else {
        setGameTimeText(prev =>
          prev === 'Loading game time...' ? 'Game time unavailable' : prev
        )
      }
    }

    loadGameTime()

    const interval = window.setInterval(loadGameTime, refreshIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [refreshIntervalMs])

  return (
    <footer className="border-t border-yellow-500 bg-yellow-400 py-3 px-6 flex items-center justify-between">
      <div className="text-sm font-semibold text-black">
        {gameTimeText}
      </div>

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