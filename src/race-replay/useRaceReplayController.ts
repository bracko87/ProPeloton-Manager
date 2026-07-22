/**
 * useRaceReplayController.ts
 *
 * React timing wrapper around the pure replayPlaybackController helpers.
 *
 * The hook replays an existing ReplayStageModel only. It never runs the race
 * engine, queries Supabase, writes data, or creates more than one animation
 * timer at a time.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  ReplayPlaybackSpeed,
  ReplayPlaybackState,
  ReplayStageModel,
} from './replayTypes'
import {
  advanceReplayPlayback,
  createReplayPlaybackState,
  finishReplay,
  getReplayPlaybackView,
  pauseReplay,
  playReplay,
  resetReplay,
  seekReplayToFrame,
  seekReplayToProgress,
  seekReplayToRaceSecond,
  setReplayPlaybackSpeed,
  type ReplayPlaybackView,
} from './replayPlaybackController'

export interface UseRaceReplayControllerOptions {
  readonly initialSpeed?: ReplayPlaybackSpeed
  readonly initialRaceSecond?: number
  readonly autoPlay?: boolean

  /** Pause when the browser document becomes hidden. Defaults to true. */
  readonly pauseWhenDocumentHidden?: boolean

  /** Automatically resume after visibility returns. Defaults to false. */
  readonly resumeAfterDocumentVisible?: boolean

  /**
   * Maximum real-time delta consumed by one animation frame.
   * This prevents a stalled browser frame from jumping far ahead.
   */
  readonly maximumFrameDeltaSeconds?: number

  readonly onComplete?: () => void
}

export interface UseRaceReplayControllerResult
  extends ReplayPlaybackState,
    ReplayPlaybackView {
  readonly pausedByVisibility: boolean

  readonly play: () => void
  readonly pause: () => void
  readonly resume: () => void
  readonly togglePlaying: () => void

  readonly setSpeed: (
    speed: ReplayPlaybackSpeed,
  ) => void

  readonly seekToRaceSecond: (
    raceSecond: number,
  ) => void

  readonly seekToProgress: (
    progress: number,
  ) => void

  readonly seekToFrame: (
    frameIndex: number,
  ) => void

  readonly previousFrame: () => void
  readonly nextFrameStep: () => void

  readonly finish: () => void
  readonly reset: () => void
}

const DEFAULT_MAXIMUM_FRAME_DELTA_SECONDS = 0.25

function getModelIdentity(
  model: ReplayStageModel,
): string {
  return [
    model.contractVersion,
    model.raceId,
    model.stageId,
    model.seed,
    model.durationSeconds,
    model.frames.length,
    model.events.length,
  ].join('|')
}

/** Reusable controller hook for an already-calculated generic replay model. */
export function useRaceReplayController(
  model: ReplayStageModel,
  options: UseRaceReplayControllerOptions = {},
): UseRaceReplayControllerResult {
  const initialSpeed =
    options.initialSpeed ?? 1

  const initialRaceSecond =
    options.initialRaceSecond ?? 0

  const autoPlay =
    options.autoPlay ?? false

  const pauseWhenDocumentHidden =
    options.pauseWhenDocumentHidden ?? true

  const resumeAfterDocumentVisible =
    options.resumeAfterDocumentVisible ?? false

  const maximumFrameDeltaSeconds =
    options.maximumFrameDeltaSeconds ??
    DEFAULT_MAXIMUM_FRAME_DELTA_SECONDS

  if (
    !Number.isFinite(
      maximumFrameDeltaSeconds,
    ) ||
    maximumFrameDeltaSeconds <= 0
  ) {
    throw new Error(
      'useRaceReplayController: maximumFrameDeltaSeconds must be finite and greater than zero.',
    )
  }

  const modelIdentity =
    getModelIdentity(model)

  const [
    playbackState,
    setPlaybackState,
  ] = useState<ReplayPlaybackState>(
    () =>
      createReplayPlaybackState(
        model,
        {
          initialSpeed,
          initialRaceSecond,
          autoPlay,
        },
      ),
  )

  const [
    pausedByVisibility,
    setPausedByVisibility,
  ] = useState(false)

  const modelRef =
    useRef(model)

  const stateRef =
    useRef(playbackState)

  const animationFrameRef =
    useRef<number | null>(null)

  const previousTimestampRef =
    useRef<number | null>(null)

  const tickRef =
    useRef<(timestamp: number) => void>(
      () => undefined,
    )

  const wasPlayingBeforeHiddenRef =
    useRef(false)

  const onCompleteRef =
    useRef(options.onComplete)

  modelRef.current = model
  onCompleteRef.current = options.onComplete

  const commit = useCallback(
    (
      nextState: ReplayPlaybackState,
    ): void => {
      stateRef.current = nextState
      setPlaybackState(nextState)
    },
    [],
  )

  const cancelAnimationFrameLoop =
    useCallback((): void => {
      if (
        animationFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationFrameRef.current,
        )

        animationFrameRef.current =
          null
      }

      previousTimestampRef.current =
        null
    }, [])

  const play = useCallback((): void => {
    setPausedByVisibility(false)

    commit(
      playReplay(
        modelRef.current,
        stateRef.current,
      ),
    )
  }, [commit])

  const pause = useCallback((): void => {
    commit(
      pauseReplay(
        modelRef.current,
        stateRef.current,
      ),
    )
  }, [commit])

  const togglePlaying =
    useCallback((): void => {
      if (stateRef.current.playing) {
        pause()
      } else {
        play()
      }
    }, [pause, play])

  const setSpeed = useCallback(
    (
      speed: ReplayPlaybackSpeed,
    ): void => {
      commit(
        setReplayPlaybackSpeed(
          modelRef.current,
          stateRef.current,
          speed,
        ),
      )
    },
    [commit],
  )

  const seekToRaceSecond =
    useCallback(
      (
        raceSecond: number,
      ): void => {
        commit(
          seekReplayToRaceSecond(
            modelRef.current,
            stateRef.current,
            raceSecond,
          ),
        )
      },
      [commit],
    )

  const seekToProgress =
    useCallback(
      (
        progress: number,
      ): void => {
        commit(
          seekReplayToProgress(
            modelRef.current,
            stateRef.current,
            progress,
          ),
        )
      },
      [commit],
    )

  const seekToFrame = useCallback(
    (
      frameIndex: number,
    ): void => {
      commit(
        seekReplayToFrame(
          modelRef.current,
          stateRef.current,
          frameIndex,
        ),
      )
    },
    [commit],
  )

  const previousFrame =
    useCallback((): void => {
      const paused = pauseReplay(
        modelRef.current,
        stateRef.current,
      )

      commit(
        seekReplayToFrame(
          modelRef.current,
          paused,
          paused.currentFrameIndex - 1,
        ),
      )
    }, [commit])

  const nextFrameStep =
    useCallback((): void => {
      const paused = pauseReplay(
        modelRef.current,
        stateRef.current,
      )

      commit(
        seekReplayToFrame(
          modelRef.current,
          paused,
          paused.currentFrameIndex + 1,
        ),
      )
    }, [commit])

  const finish = useCallback((): void => {
    setPausedByVisibility(false)

    commit(
      finishReplay(
        modelRef.current,
        stateRef.current,
      ),
    )
  }, [commit])

  const reset = useCallback((): void => {
    setPausedByVisibility(false)

    commit(
      resetReplay(
        modelRef.current,
        stateRef.current,
      ),
    )
  }, [commit])

  useEffect(() => {
    modelRef.current = model
    setPausedByVisibility(false)
    wasPlayingBeforeHiddenRef.current =
      false

    commit(
      createReplayPlaybackState(
        model,
        {
          initialSpeed,
          initialRaceSecond,
          autoPlay,
        },
      ),
    )

    return cancelAnimationFrameLoop
  }, [
    modelIdentity,
    initialSpeed,
    initialRaceSecond,
    autoPlay,
    commit,
    cancelAnimationFrameLoop,
  ])

  useEffect(() => {
    tickRef.current = (
      timestamp: number,
    ): void => {
      animationFrameRef.current =
        null

      const currentState =
        stateRef.current

      if (!currentState.playing) {
        previousTimestampRef.current =
          null
        return
      }

      const previousTimestamp =
        previousTimestampRef.current

      previousTimestampRef.current =
        timestamp

      if (previousTimestamp !== null) {
        const rawDeltaSeconds = Math.max(
          0,
          (
            timestamp -
            previousTimestamp
          ) / 1000,
        )

        const deltaSeconds = Math.min(
          rawDeltaSeconds,
          maximumFrameDeltaSeconds,
        )

        const nextState =
          advanceReplayPlayback(
            modelRef.current,
            currentState,
            deltaSeconds,
          )

        const completedNow =
          !currentState.completed &&
          nextState.completed

        commit(nextState)

        if (completedNow) {
          onCompleteRef.current?.()
        }
      }

      if (stateRef.current.playing) {
        animationFrameRef.current =
          requestAnimationFrame(
            tickRef.current,
          )
      }
    }
  }, [
    maximumFrameDeltaSeconds,
    commit,
  ])

  useEffect(() => {
    if (!playbackState.playing) {
      cancelAnimationFrameLoop()
      return
    }

    if (
      animationFrameRef.current ===
      null
    ) {
      previousTimestampRef.current =
        null

      animationFrameRef.current =
        requestAnimationFrame(
          tickRef.current,
        )
    }

    return cancelAnimationFrameLoop
  }, [
    playbackState.playing,
    cancelAnimationFrameLoop,
  ])

  useEffect(() => {
    if (
      !pauseWhenDocumentHidden ||
      typeof document === 'undefined'
    ) {
      return
    }

    const handleVisibilityChange =
      (): void => {
        if (
          document.visibilityState ===
          'hidden'
        ) {
          if (stateRef.current.playing) {
            wasPlayingBeforeHiddenRef.current =
              true

            setPausedByVisibility(true)

            commit(
              pauseReplay(
                modelRef.current,
                stateRef.current,
              ),
            )
          }

          return
        }

        const shouldResume =
          wasPlayingBeforeHiddenRef.current &&
          resumeAfterDocumentVisible

        wasPlayingBeforeHiddenRef.current =
          false

        if (shouldResume) {
          setPausedByVisibility(false)

          commit(
            playReplay(
              modelRef.current,
              stateRef.current,
            ),
          )
        }
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [
    pauseWhenDocumentHidden,
    resumeAfterDocumentVisible,
    commit,
  ])

  useEffect(
    () => cancelAnimationFrameLoop,
    [cancelAnimationFrameLoop],
  )

  const playbackView = useMemo(
    () =>
      getReplayPlaybackView(
        model,
        playbackState,
      ),
    [model, playbackState],
  )

  return {
    ...playbackState,
    ...playbackView,
    pausedByVisibility,
    play,
    pause,
    resume: play,
    togglePlaying,
    setSpeed,
    seekToRaceSecond,
    seekToProgress,
    seekToFrame,
    previousFrame,
    nextFrameStep,
    finish,
    reset,
  }
}
