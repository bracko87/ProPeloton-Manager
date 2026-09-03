import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type RaceStageLiveState = {
  stage_id?: string | null
  is_live?: boolean | null
  speed_locked?: boolean | null
  progress?: number | null
}

const LIVE_LOCK_TITLE =
  'Live race: replay is locked to x1 until the 15-minute live window ends.'

function getReplayStageId(): string | null {
  if (typeof window === 'undefined') return null

  const value = new URLSearchParams(window.location.search).get('replayStageId')
  return value?.trim() || null
}

function getButtonLabel(button: HTMLButtonElement): string {
  return (button.textContent ?? '').replace(/\s+/g, ' ').trim()
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
      const playPauseButton = buttons.find((button) => {
        const label = getButtonLabel(button)
        return label === 'Play' || label === 'Pause'
      })

      // The authoritative live window always runs at x1. If the viewer had a
      // faster speed selected before the live lock was observed, force x1.
      if (
        oneTimesButton &&
        !oneTimesButton.className.includes('bg-slate-950')
      ) {
        clickWithBypass(oneTimesButton)
      }

      // A live race is not a user-started replay. As soon as the replay page is
      // mounted during the live window, start it automatically at x1.
      if (playPauseButton && getButtonLabel(playPauseButton) === 'Play') {
        clickWithBypass(playPauseButton)
      }

      for (const button of buttons) {
        const label = getButtonLabel(button)
        const hideDuringLive =
          label === '2x' ||
          label === '4x' ||
          label === '8x' ||
          label === 'Finish replay' ||
          label === 'Restart'
        const disableDuringLive =
          label === 'Play' || label === 'Pause'

        if (!hideDuringLive && !disableDuringLive) continue

        button.dataset.ppmLiveReplayManaged = 'true'
        button.setAttribute('aria-disabled', 'true')
        button.setAttribute('title', LIVE_LOCK_TITLE)
        button.disabled = true

        if (hideDuringLive) button.hidden = true
      }

      if (oneTimesButton) {
        oneTimesButton.setAttribute('title', LIVE_LOCK_TITLE)

        const controlRow = oneTimesButton.parentElement
        if (
          controlRow &&
          !document.getElementById('ppm-live-replay-lock-pill')
        ) {
          const pill = document.createElement('span')
          pill.id = 'ppm-live-replay-lock-pill'
          pill.textContent = 'LIVE · x1 locked'
          pill.className =
            'rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-semibold text-red-700'
          pill.setAttribute('title', LIVE_LOCK_TITLE)
          controlRow.appendChild(pill)
        }
      }
    }

    function handleCapturedClick(event: MouseEvent): void {
      if (!speedLockedRef.current || bypassClickGuardRef.current) return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement)) return

      const label = getButtonLabel(button)
      const blocked =
        label === 'Play' ||
        label === 'Pause' ||
        label === '2x' ||
        label === '4x' ||
        label === '8x' ||
        label === 'Finish replay' ||
        label === 'Restart'

      if (!blocked) return

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

    // Replay controls mount after the page data. Re-apply the UI guard quickly
    // so React re-renders cannot briefly expose a forbidden live control.
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
