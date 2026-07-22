/**
 * RioStage1ReplayControllerDiagnostic.tsx
 *
 * Browser-only verification for the generic replay playback controller.
 *
 * This diagnostic builds the already-verified Rio ReplayStageModel once, then
 * tests pure playback transitions and the React animation controller. Playback
 * never reruns the race engine.
 *
 * No Supabase, database writes, persistence, API routes, or schedulers.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  advanceReplayPlayback,
  createReplayPlaybackState,
  createReplayStageModelFromSimulationOutput,
  finishReplay,
  getReplayFrameIndexAtRaceSecond,
  getReplayPlaybackView,
  pauseReplay,
  playReplay,
  resetReplay,
  seekReplayToFrame,
  seekReplayToProgress,
  seekReplayToRaceSecond,
  setReplayPlaybackSpeed,
  useRaceReplayController,
  type ReplayStageModel,
  type UseRaceReplayControllerResult,
} from '../../race-replay'

const EXPECTED_REPLAY_MODEL_HASH =
  '91f4bad38bc33e21'

interface DiagnosticBundle {
  readonly model: ReplayStageModel
  readonly modelHash: string
}

interface PureControllerChecks {
  readonly expectedReplayModelHash: boolean
  readonly initialStateAtStart: boolean
  readonly playStartsController: boolean
  readonly oneXAdvancesLiterally: boolean
  readonly eightXAdvancesLiterally: boolean
  readonly pauseStopsPureAdvance: boolean
  readonly seekToRaceSecondWorks: boolean
  readonly seekToProgressWorks: boolean
  readonly seekToFrameWorks: boolean
  readonly finishCreatesCompletedState: boolean
  readonly resetReturnsToStart: boolean
  readonly playFromEndRestarts: boolean
  readonly frameLookupIsCorrect: boolean
  readonly interpolationIsBounded: boolean
  readonly interpolationPreservesRiders: boolean
  readonly nullMetricsRemainNull: boolean
  readonly visibleEventsAreChronological: boolean
  readonly pureOperationsDoNotMutateModel: boolean
}

interface TimerTestResult {
  readonly passed: boolean
  readonly speedAccurate: boolean
  readonly pauseStoppedTimer: boolean
  readonly modelUnchanged: boolean
  readonly realElapsedSeconds: number
  readonly expectedRaceSeconds: number
  readonly observedRaceSeconds: number
  readonly raceSecondsAfterPauseWait: number
}

function allChecksPassed(
  checks: object,
): boolean {
  return (
    Object.values(checks) as boolean[]
  ).every(Boolean)
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

function createDiagnosticBundle(): DiagnosticBundle {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const simulationOutput =
    runDeterministicRoadRace(
      stageInput,
    )

  const model =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    })

  const canonicalModel =
    createCanonicalHashedValue(
      model,
    )

  return {
    model,
    modelHash:
      canonicalModel.hash,
  }
}

function runPureControllerChecks(
  bundle: DiagnosticBundle,
): PureControllerChecks {
  const { model } = bundle

  const before =
    createCanonicalHashedValue(
      model,
    )

  const initial =
    createReplayPlaybackState(
      model,
    )

  const playing =
    playReplay(
      model,
      initial,
    )

  const advancedAtOneX =
    advanceReplayPlayback(
      model,
      playing,
      1.5,
    )

  const playingAtEightX =
    setReplayPlaybackSpeed(
      model,
      advancedAtOneX,
      8,
    )

  const advancedAtEightX =
    advanceReplayPlayback(
      model,
      playingAtEightX,
      2,
    )

  const paused =
    pauseReplay(
      model,
      advancedAtEightX,
    )

  const advancedWhilePaused =
    advanceReplayPlayback(
      model,
      paused,
      5,
    )

  const halfSecond =
    model.durationSeconds / 2

  const soughtToSecond =
    seekReplayToRaceSecond(
      model,
      paused,
      halfSecond,
    )

  const soughtToProgress =
    seekReplayToProgress(
      model,
      paused,
      0.25,
    )

  const targetFrameIndex = Math.min(
    10,
    model.frames.length - 1,
  )

  const targetFrame =
    model.frames[
      targetFrameIndex
    ]

  if (!targetFrame) {
    throw new Error(
      'Missing target replay frame.',
    )
  }

  const soughtToFrame =
    seekReplayToFrame(
      model,
      paused,
      targetFrameIndex,
    )

  const finished =
    finishReplay(
      model,
      paused,
    )

  const reset =
    resetReplay(
      model,
      finished,
    )

  const replayedFromEnd =
    playReplay(
      model,
      finished,
    )

  const firstFrame =
    model.frames[0]

  const secondFrame =
    model.frames[1]

  if (!firstFrame || !secondFrame) {
    throw new Error(
      'At least two replay frames are required.',
    )
  }

  const midpointSecond =
    (
      firstFrame.raceSecond +
      secondFrame.raceSecond
    ) / 2

  const midpointState =
    seekReplayToRaceSecond(
      model,
      initial,
      midpointSecond,
    )

  const midpointView =
    getReplayPlaybackView(
      model,
      midpointState,
    )

  const minimumLeaderKm = Math.min(
    firstFrame.leaderDistanceKm,
    secondFrame.leaderDistanceKm,
  )

  const maximumLeaderKm = Math.max(
    firstFrame.leaderDistanceKm,
    secondFrame.leaderDistanceKm,
  )

  const after =
    createCanonicalHashedValue(
      model,
    )

  return {
    expectedReplayModelHash:
      bundle.modelHash ===
      EXPECTED_REPLAY_MODEL_HASH,

    initialStateAtStart:
      !initial.playing &&
      !initial.completed &&
      initial.speed === 1 &&
      initial.currentFrameIndex === 0 &&
      initial.currentRaceSecond === 0 &&
      initial.progress === 0,

    playStartsController:
      playing.playing &&
      !playing.completed,

    oneXAdvancesLiterally:
      Math.abs(
        advancedAtOneX
          .currentRaceSecond -
          1.5,
      ) < 0.000001,

    eightXAdvancesLiterally:
      Math.abs(
        advancedAtEightX
          .currentRaceSecond -
          17.5,
      ) < 0.000001,

    pauseStopsPureAdvance:
      !paused.playing &&
      advancedWhilePaused ===
        paused,

    seekToRaceSecondWorks:
      Math.abs(
        soughtToSecond
          .currentRaceSecond -
          halfSecond,
      ) < 0.000001,

    seekToProgressWorks:
      Math.abs(
        soughtToProgress.progress -
          0.25,
      ) < 0.000001,

    seekToFrameWorks:
      soughtToFrame
        .currentFrameIndex ===
        targetFrameIndex &&
      soughtToFrame
        .currentRaceSecond ===
        targetFrame.raceSecond,

    finishCreatesCompletedState:
      finished.completed &&
      !finished.playing &&
      finished.progress === 1 &&
      finished.currentRaceSecond ===
        model.durationSeconds,

    resetReturnsToStart:
      !reset.playing &&
      !reset.completed &&
      reset.currentRaceSecond === 0 &&
      reset.currentFrameIndex === 0,

    playFromEndRestarts:
      replayedFromEnd.playing &&
      !replayedFromEnd.completed &&
      replayedFromEnd
        .currentRaceSecond === 0,

    frameLookupIsCorrect:
      getReplayFrameIndexAtRaceSecond(
        model,
        targetFrame.raceSecond,
      ) === targetFrameIndex,

    interpolationIsBounded:
      midpointView
        .frameInterpolation > 0 &&
      midpointView
        .frameInterpolation < 1 &&
      midpointView
        .displayLeaderDistanceKm >=
        minimumLeaderKm &&
      midpointView
        .displayLeaderDistanceKm <=
        maximumLeaderKm,

    interpolationPreservesRiders:
      midpointView.riders.length ===
        firstFrame.riders.length &&
      midpointView.riders.every(
        (rider, index) =>
          rider.riderId ===
          firstFrame.riders[index]
            ?.riderId,
      ),

    nullMetricsRemainNull:
      midpointView.riders.every(
        (rider) =>
          rider.staminaPercent ===
            null &&
          rider.fatiguePercent ===
            null,
      ),

    visibleEventsAreChronological:
      midpointView.visibleEvents.every(
        (event, index, events) =>
          index === 0 ||
          event.raceSecond >=
            (
              events[index - 1]
                ?.raceSecond ?? 0
            ),
      ),

    pureOperationsDoNotMutateModel:
      before.canonicalJson ===
        after.canonicalJson &&
      before.hash === after.hash,
  }
}

interface ControllerHarnessProps {
  readonly bundle: DiagnosticBundle
  readonly pureChecks: PureControllerChecks
}

function ControllerHarness({
  bundle,
  pureChecks,
}: ControllerHarnessProps): JSX.Element {
  const controller =
    useRaceReplayController(
      bundle.model,
      {
        initialSpeed: 1,
        pauseWhenDocumentHidden:
          true,
        resumeAfterDocumentVisible:
          false,
      },
    )

  const controllerRef =
    useRef<UseRaceReplayControllerResult>(
      controller,
    )

  controllerRef.current = controller

  const [
    timerTestRunning,
    setTimerTestRunning,
  ] = useState(false)

  const [
    timerTestResult,
    setTimerTestResult,
  ] = useState<TimerTestResult | null>(
    null,
  )

  const [
    waitingForHiddenPause,
    setWaitingForHiddenPause,
  ] = useState(false)

  const [
    hiddenPauseObserved,
    setHiddenPauseObserved,
  ] = useState(false)

  const timerIdsRef =
    useRef<readonly number[]>([])

  const clearDiagnosticTimers =
    (): void => {
      timerIdsRef.current.forEach(
        (timerId) =>
          window.clearTimeout(
            timerId,
          ),
      )

      timerIdsRef.current = []
    }

  useEffect(() => {
    if (
      waitingForHiddenPause &&
      controller.pausedByVisibility
    ) {
      setHiddenPauseObserved(true)
      setWaitingForHiddenPause(false)
    }
  }, [
    waitingForHiddenPause,
    controller.pausedByVisibility,
  ])

  useEffect(
    () => clearDiagnosticTimers,
    [],
  )

  const runTimerTest = (): void => {
    clearDiagnosticTimers()
    setTimerTestResult(null)
    setTimerTestRunning(true)

    controller.reset()
    controller.setSpeed(8)
    controller.play()

    const startedAt =
      performance.now()

    const movementTimerId =
      window.setTimeout(() => {
        const realElapsedSeconds =
          (
            performance.now() -
            startedAt
          ) / 1000

        const observedRaceSeconds =
          controllerRef.current
            .currentRaceSecond

        controllerRef.current.pause()

        const pauseCheckTimerId =
          window.setTimeout(() => {
            const raceSecondsAfterPauseWait =
              controllerRef.current
                .currentRaceSecond

            const expectedRaceSeconds =
              realElapsedSeconds * 8

            const minimumExpected =
              expectedRaceSeconds * 0.7

            const maximumExpected =
              expectedRaceSeconds * 1.3

            const speedAccurate =
              observedRaceSeconds >=
                minimumExpected &&
              observedRaceSeconds <=
                maximumExpected

            const pauseStoppedTimer =
              Math.abs(
                raceSecondsAfterPauseWait -
                observedRaceSeconds,
              ) < 0.1

            const currentModelHash =
              createCanonicalHashedValue(
                bundle.model,
              ).hash

            const modelUnchanged =
              currentModelHash ===
              bundle.modelHash

            setTimerTestResult({
              passed:
                speedAccurate &&
                pauseStoppedTimer &&
                modelUnchanged,
              speedAccurate,
              pauseStoppedTimer,
              modelUnchanged,
              realElapsedSeconds,
              expectedRaceSeconds,
              observedRaceSeconds,
              raceSecondsAfterPauseWait,
            })

            setTimerTestRunning(false)
          }, 500)

        timerIdsRef.current = [
          pauseCheckTimerId,
        ]
      }, 1500)

    timerIdsRef.current = [
      movementTimerId,
    ]
  }

  const startHiddenPauseCheck =
    (): void => {
      setHiddenPauseObserved(false)
      setWaitingForHiddenPause(true)

      controller.reset()
      controller.setSpeed(8)
      controller.play()
    }

  const purePassed =
    allChecksPassed(
      pureChecks,
    )

  const fullDiagnosticPassed =
    purePassed &&
    timerTestResult?.passed === true &&
    hiddenPauseObserved

  const pureEntries =
    Object.entries(
      pureChecks,
    )

  return (
    <>
      <section
        style={{
          marginTop: '24px',
          padding: '24px',
          border:
            fullDiagnosticPassed
              ? '1px solid #55d187'
              : '1px solid #23364d',
          borderRadius: '10px',
          background:
            fullDiagnosticPassed
              ? 'rgba(85, 209, 135, 0.08)'
              : '#0d1a2a',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {fullDiagnosticPassed
            ? 'PASS'
            : 'Controller verification'}
        </h2>

        <p style={{ marginBottom: 0 }}>
          Pure checks:{' '}
          {purePassed ? 'PASS' : 'FAIL'}
          {' · '}
          Timer check:{' '}
          {timerTestResult === null
            ? 'NOT RUN'
            : timerTestResult.passed
              ? 'PASS'
              : 'FAIL'}
          {' · '}
          Hidden-tab pause:{' '}
          {hiddenPauseObserved
            ? 'PASS'
            : 'NOT OBSERVED'}
        </p>
      </section>

      <section
        style={{
          marginTop: '20px',
          padding: '24px',
          border:
            '1px solid #23364d',
          borderRadius: '10px',
          background: '#0d1a2a',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Live controller
        </h2>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(210px, 1fr) 2fr',
            gap: '10px 20px',
          }}
        >
          <dt>Playing</dt>
          <dd>{String(controller.playing)}</dd>

          <dt>Speed</dt>
          <dd>{controller.speed}x</dd>

          <dt>Race second</dt>
          <dd>
            {controller
              .displayRaceSecond
              .toFixed(2)}
          </dd>

          <dt>Frame index</dt>
          <dd>
            {controller.currentFrameIndex}
          </dd>

          <dt>Frame interpolation</dt>
          <dd>
            {controller
              .frameInterpolation
              .toFixed(3)}
          </dd>

          <dt>Leader distance</dt>
          <dd>
            {controller
              .displayLeaderDistanceKm
              .toFixed(3)} km
          </dd>

          <dt>Progress</dt>
          <dd>
            {(
              controller.displayProgress *
              100
            ).toFixed(3)}%
          </dd>

          <dt>Completed</dt>
          <dd>{String(controller.completed)}</dd>

          <dt>Paused by visibility</dt>
          <dd>
            {String(
              controller
                .pausedByVisibility,
            )}
          </dd>
        </dl>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <button type="button" onClick={controller.play}>
            Play / Resume
          </button>
          <button type="button" onClick={controller.pause}>
            Pause
          </button>
          <button type="button" onClick={controller.previousFrame}>
            Previous frame
          </button>
          <button type="button" onClick={controller.nextFrameStep}>
            Next frame
          </button>
          <button type="button" onClick={controller.finish}>
            Finish Replay
          </button>
          <button type="button" onClick={controller.reset}>
            Reset
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginTop: '12px',
          }}
        >
          {([1, 2, 4, 8] as const).map(
            (speed) => (
              <button
                key={speed}
                type="button"
                onClick={() =>
                  controller.setSpeed(
                    speed,
                  )
                }
              >
                {speed}x
              </button>
            ),
          )}
        </div>

        <label
          style={{
            display: 'block',
            marginTop: '18px',
          }}
        >
          Timeline
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={controller.progress}
            onChange={(
              event: {
                target: {
                  value: string
                }
              },
            ) =>
              controller.seekToProgress(
                Number(
                  event.target.value,
                ),
              )
            }
            style={{
              display: 'block',
              width: '100%',
              marginTop: '8px',
            }}
          />
        </label>
      </section>

      <section
        style={{
          marginTop: '20px',
          padding: '24px',
          border:
            '1px solid #23364d',
          borderRadius: '10px',
          background: '#0d1a2a',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Timer and cleanup test
        </h2>

        <button
          type="button"
          disabled={timerTestRunning}
          onClick={runTimerTest}
        >
          {timerTestRunning
            ? 'Testing…'
            : 'Run 8x timer test'}
        </button>

        {timerTestResult && (
          <ul>
            <li>
              {timerTestResult.speedAccurate
                ? 'PASS'
                : 'FAIL'}
              {' — literal 8x timing / no duplicate timer'}
            </li>
            <li>
              {timerTestResult.pauseStoppedTimer
                ? 'PASS'
                : 'FAIL'}
              {' — pause stops animation updates'}
            </li>
            <li>
              {timerTestResult.modelUnchanged
                ? 'PASS'
                : 'FAIL'}
              {' — replay model unchanged'}
            </li>
            <li>
              Expected race seconds:{' '}
              {timerTestResult
                .expectedRaceSeconds
                .toFixed(2)}
            </li>
            <li>
              Observed race seconds:{' '}
              {timerTestResult
                .observedRaceSeconds
                .toFixed(2)}
            </li>
          </ul>
        )}
      </section>

      <section
        style={{
          marginTop: '20px',
          padding: '24px',
          border:
            '1px solid #23364d',
          borderRadius: '10px',
          background: '#0d1a2a',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Hidden-tab pause test
        </h2>

        <p>
          Click the button, switch to another browser tab for at least one
          second, then return. Playback must remain paused and the check must
          change to PASS.
        </p>

        <button
          type="button"
          onClick={startHiddenPauseCheck}
        >
          Start hidden-tab check
        </button>

        <p>
          {hiddenPauseObserved
            ? 'PASS — hidden-tab pause observed'
            : waitingForHiddenPause
              ? 'WAITING — switch tabs now'
              : 'NOT RUN'}
        </p>
      </section>

      <section
        style={{
          marginTop: '20px',
          padding: '24px',
          border:
            '1px solid #23364d',
          borderRadius: '10px',
          background: '#0d1a2a',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Pure controller checks
        </h2>

        <ul style={{ marginBottom: 0 }}>
          {pureEntries.map(
            ([name, passed]) => (
              <li
                key={name}
                style={{
                  marginBottom: '8px',
                }}
              >
                {passed ? 'PASS' : 'FAIL'}
                {' — '}
                {name}
              </li>
            ),
          )}
        </ul>
      </section>
    </>
  )
}

export default function RioStage1ReplayControllerDiagnostic():
  JSX.Element {
  const [
    bundle,
    setBundle,
  ] = useState<DiagnosticBundle | null>(
    null,
  )

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null)

  const [
    preparing,
    setPreparing,
  ] = useState(false)

  const pureChecks = useMemo(
    () =>
      bundle
        ? runPureControllerChecks(
            bundle,
          )
        : null,
    [bundle],
  )

  const prepare = (): void => {
    setPreparing(true)
    setErrorMessage(null)
    setBundle(null)

    try {
      setBundle(
        createDiagnosticBundle(),
      )
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      )
    } finally {
      setPreparing(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px',
        background: '#07111f',
        color: '#f5f7fa',
        fontFamily:
          'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            color: '#8aa4c2',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Development diagnostic
        </p>

        <h1
          style={{
            margin: '0 0 12px',
            fontSize: '34px',
          }}
        >
          Rio Stage 1 Replay Controller
        </h1>

        <p
          style={{
            maxWidth: '800px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Verifies generic playback state, literal speed controls, seeking,
          interpolation, Finish Replay, reset, one animation timer, timer
          cleanup, and hidden-tab pause behavior.
        </p>

        <button
          type="button"
          onClick={prepare}
          disabled={preparing}
        >
          {preparing
            ? 'Preparing…'
            : 'Prepare controller diagnostic'}
        </button>

        {errorMessage && (
          <pre
            style={{
              marginTop: '20px',
              padding: '20px',
              border:
                '1px solid #ff6b6b',
              borderRadius: '10px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {errorMessage}
          </pre>
        )}

        {bundle && pureChecks && (
          <ControllerHarness
            bundle={bundle}
            pureChecks={pureChecks}
          />
        )}
      </div>
    </main>
  )
}
