/**
 * ProPeloton Manager public home clock.
 *
 * Same proven architecture as Tennis Legacy: server clock anchor, a one-second
 * render tick, and periodic backend resynchronization. Unlike Tennis, reads
 * only ProPeloton's own public RPC and never touches game-clock state.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchPublicHomeClockAnchor } from '../lib/supabase'

type GameClockAnchor = {
  gameEpochMs: number
  receivedAtMs: number
  speedMultiplier: number
}

export type PublicHomeGameClock = {
  gameEpochMs: number | null
  loading: boolean
  error: boolean
}

const RESYNC_INTERVAL_MS = 15_000
const REQUEST_TIMEOUT_MS = 8_000
const MAX_EXTRAPOLATION_MS = 30_000

export function projectGameTimeMs(
  gameEpochMs: number,
  speedMultiplier: number,
  elapsedRealMs: number,
): number {
  // A temporarily lost connection cannot allow unbounded speculative time
  // to run ahead of the authoritative backend.
  const safeElapsed = Math.max(0, Math.min(MAX_EXTRAPOLATION_MS, elapsedRealMs))
  return Math.floor(gameEpochMs + safeElapsed * speedMultiplier)
}

export function usePublicHomeGameClock(): PublicHomeGameClock {
  const [anchor, setAnchor] = useState<GameClockAnchor | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    let inFlight = false
    let abort: AbortController | null = null

    async function refresh(): Promise<void> {
      if (!mounted || inFlight) return
      inFlight = true
      const startedAt = Date.now()
      const controller = new AbortController()
      abort = controller
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const remote = await fetchPublicHomeClockAnchor(controller.signal)
        if (!mounted) return

        const receivedAtMs = Date.now()
        // Correct at most half the request round-trip, keeping the server
        // snapshot authoritative. A clock resync fixes any tiny drift.
        const estimatedOneWayMs = Math.min(2_000, Math.max(0, (receivedAtMs - startedAt) / 2))
        const effectiveSpeed = remote.is_paused ? 0 : remote.speed_multiplier

        setAnchor({
          gameEpochMs: remote.game_epoch_ms + estimatedOneWayMs * effectiveSpeed,
          speedMultiplier: effectiveSpeed,
          receivedAtMs,
        })
        setNowMs(receivedAtMs)
        setError(false)
      } catch (failure) {
        if (mounted) {
          console.warn('Could not refresh public game clock:', failure)
          setError(true)
        }
      } finally {
        window.clearTimeout(timeout)
        if (mounted) setLoading(false)
        if (abort === controller) abort = null
        inFlight = false
      }
    }

    void refresh()
    // A regular one-second render tick, as on the Tennis homepage.
    const tickId = window.setInterval(() => setNowMs(Date.now()), 1_000)
    const refreshId = window.setInterval(() => void refresh(), RESYNC_INTERVAL_MS)
    const onFocus = (): void => { void refresh() }
    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      abort?.abort()
      window.clearInterval(tickId)
      window.clearInterval(refreshId)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const gameEpochMs = useMemo(() => {
    if (!anchor) return null
    return projectGameTimeMs(
      anchor.gameEpochMs,
      anchor.speedMultiplier,
      nowMs - anchor.receivedAtMs,
    )
  }, [anchor, nowMs])

  return { gameEpochMs, loading, error }
}
