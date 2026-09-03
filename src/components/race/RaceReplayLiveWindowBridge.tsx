import { useEffect, useRef } from 'react'
import i18n from '../../i18n'
import { supabase } from '../../lib/supabase'

type RaceStageLiveState = {
  stage_id?: string | null
  is_live?: boolean | null
  speed_locked?: boolean | null
  progress?: number | null
}

const LIVE_LOCK_TITLE =
  'Live race: replay is locked to x1 until the 15-minute live window ends.'

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function getReplayStageId(): string | null {
  if (typeof window === 'undefined') return null

  const value = new URLSearchParams(window.location.search).get('replayStageId')
  return value?.trim() || null
}

function getButtonLabel(button: HTMLButtonElement): string {
  return normalizeLabel(button.textContent ?? '')
}

function translatedReplayLabel(
  key: 'play' | 'pause' | 'finishReplay' | 'restart',
  fallback: string
): Set<string> {
  const translated = String(i18n.t(`replay.${key}`, { ns: 'raceDetail' }) ?? '')
  return new Set(
    [fallback, translated]
      .map(normalizeLabel)
      .filter((value) => value.length > 0)
  )
}

function replayButtons(): HTMLButtonElement[] {
  if (typeof document === 'undefined') return []
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
}

function restoreManagedButtons(): void {
  for (const button of replayButtons()) {
    if (button.dataset.ppmLiveReplayManaged !== 'true') continue

    button.disabled = false
    button.hidden = false
    button.removeAttribute('aria-disabled')
    button.removeAttribute('title')
    delete button.dataset.ppmLiveReplayManaged
  }

  document.getElementById('ppm-live-replay-lock-pill')?.remove()
}

export default function RaceReplayLiveWindowBridge() {
  const speedLockedRef = useRef(false)
  const bypassClickGuardRef = useRef(false)
  const requestInFlightRef = useRef(false)

  useEffect(() => {
    let disposed = false

    function clickWithBypass(button: HTMLButtonElement): void {
      bypassClickGuardRef.current = true
      try {
        button.click()
      } finally {
        bypassClickGuardRef.current = false
      }
    }

    function enforceLiveControls(): void {
      if (!speedLockedRef.current) {
        restoreManagedButtons()
        return
      }

      const buttons = replayButtons()
      const oneTimesButton = buttons.find(
        (button) => getButtonLabel(button) === '1x'
      )

      if (!oneTimesButton) return

      // The speed buttons live in the same compact replay-control row. Using
      // that row keeps the guard isolated from unrelated Play/Restart buttons.
      const controlRow = oneTimesButton.parentElement
      if (!controlRow) return

      const controlButtons = Array.from(
        controlRow.querySelectorAll<HTMLButtonElement>('button')
      )
      const playPauseButton = controlButtons[0] ?? null
      const playLabels = translatedReplayLabel('play', 'Play')
      const pauseLabels = translatedReplayLabel('pause', 'Pause')

      // The authoritative live window always runs at x1. If the viewer had a
      // faster speed selected before the lock was observed, force x1 first.
      if (!oneTimesButton.className.includes('bg-slate-950')) {
        clickWithBypass(oneTimesButton)
      }

      // A live race is not a user-started replay. When the replay page mounts
      // during the live window, start it automatically at x1.
      if (
        playPauseButton &&
        playLabels.has(getButtonLabel(playPauseButton))
      ) {
        clickWithBypass(playPauseButton)
      }

      // During the real-time window only x1 is available. The first button is
      // Play/Pause, then 1x/2x/4x/8x, followed by Finish and Restart. Keep x1
      // visible, lock Play/Pause after autoplay, and hide every skip control.
      for (const button of controlButtons) {
        if (button === oneTimesButton) continue

        const label = getButtonLabel(button)
        const isPlayPause =
          button === playPauseButton ||
          playLabels.has(label) ||
          pauseLabels.has(label)
        const isFasterSpeed = label === '2x' || label === '4x' || label === '8x'

        button.dataset.ppmLiveReplayManaged = 'true'
        button.setAttribute('aria-disabled', 'true')
        button.setAttribute('title', LIVE_LOCK_TITLE)
        button.disabled = true

        if (!isPlayPause || isFasterSpeed) {
          button.hidden = true
        }
      }

      oneTimesButton.dataset.ppmLiveReplayManaged = 'true'
      oneTimesButton.setAttribute('title', LIVE_LOCK_TITLE)

      if (!document.getElementById('ppm-live-replay-lock-pill')) {
        const pill = document.createElement('span')
        pill.id = 'ppm-live-replay-lock-pill'
        pill.textContent = 'LIVE · x1 locked'
        pill.className =
          'rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-semibold text-red-700'
        pill.setAttribute('title', LIVE_LOCK_TITLE)
        controlRow.appendChild(pill)
      }
    }

    function handleCapturedClick(event: MouseEvent): void {
      if (!speedLockedRef.current || bypassClickGuardRef.current) return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement)) return
      if (button.dataset.ppmLiveReplayManaged !== 'true') return

      // x1 remains selectable; all managed live controls are blocked.
      if (getButtonLabel(button) === '1x') return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    async function refreshLiveState(): Promise<void> {
      if (requestInFlightRef.current) return

      const stageId = getReplayStageId()
      if (!stageId) {
        speedLockedRef.current = false
        restoreManagedButtons()
        return
      }

      requestInFlightRef.current = true

      try {
        const { data, error } = await supabase.rpc(
          'get_race_stage_live_state_v1',
          { p_stage_id: stageId }
        )

        if (disposed) return

        if (error) {
          console.warn('Could not refresh live replay speed state:', error.message)
          return
        }

        const rawValue = Array.isArray(data) ? data[0] : data
        const liveState =
          rawValue && typeof rawValue === 'object'
            ? (rawValue as RaceStageLiveState)
            : null

        speedLockedRef.current = Boolean(
          liveState?.stage_id === stageId &&
            liveState?.is_live === true &&
            liveState?.speed_locked === true
        )

        enforceLiveControls()
      } finally {
        requestInFlightRef.current = false
      }
    }

    document.addEventListener('click', handleCapturedClick, true)

    void refreshLiveState()

    // Backend state changes only once at live-window close, so two seconds is
    // frequent enough for authoritative state while keeping RPC traffic small.
    const stateInterval = window.setInterval(refreshLiveState, 2000)

    // Replay controls mount after page data. Re-apply the UI guard quickly so
    // React/localization re-renders cannot briefly expose a forbidden control.
    const controlInterval = window.setInterval(enforceLiveControls, 250)

    return () => {
      disposed = true
      speedLockedRef.current = false
      document.removeEventListener('click', handleCapturedClick, true)
      window.clearInterval(stateInterval)
      window.clearInterval(controlInterval)
      restoreManagedButtons()
    }
  }, [])

  return null
}
