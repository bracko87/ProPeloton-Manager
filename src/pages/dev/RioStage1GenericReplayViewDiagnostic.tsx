/**
 * RioStage1GenericReplayViewDiagnostic.tsx
 *
 * Browser-only Phase 5 verification for the generic replay presentation.
 *
 * This diagnostic:
 * - builds the already-verified Rio Stage 1 ReplayStageModel once
 * - validates frozen deterministic hashes and replay-model structure
 * - mounts the real GenericRaceReplayView
 * - catches viewer render errors and displays the exact error
 * - can re-check that UI playback did not mutate the replay model
 *
 * It does not use Supabase, HTTP, persistence, database writes,
 * production replay routes, API routes, or schedulers.
 */

import React, {
  useEffect,
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
  GenericRaceReplayView,
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
  type GenericReplayStageMarker,
  type ReplayStageModel,
} from '../../race-replay'

const EXPECTED_STAGE_INPUT_HASH =
  '85993905d61e0cc5'

const EXPECTED_SIMULATION_OUTPUT_HASH =
  '229fef0b88e36b02'

const EXPECTED_REPLAY_MODEL_HASH =
  '91f4bad38bc33e21'

const EXPECTED_RIDER_COUNT = 96
const EXPECTED_FRAME_COUNT = 395
const EXPECTED_EVENT_COUNT = 98
const EXPECTED_FINAL_RESULT_COUNT = 96
const EXPECTED_PROFILE_POINT_COUNT = 9
const EXPECTED_STAGE_DISTANCE_KM = 142
const EXPECTED_DURATION_SECONDS = 11820

interface DiagnosticChecks {
  readonly sourceFixtureUnchanged: boolean
  readonly stageInputUnchanged: boolean
  readonly simulationOutputUnchanged: boolean
  readonly expectedStageInputHash: boolean
  readonly expectedSimulationOutputHash: boolean
  readonly expectedReplayModelHash: boolean
  readonly replayValidatorPassed: boolean
  readonly expectedRiderCount: boolean
  readonly expectedFrameCount: boolean
  readonly expectedEventCount: boolean
  readonly expectedFinalResultCount: boolean
  readonly expectedProfilePointCount: boolean
  readonly expectedDuration: boolean
  readonly firstFrameAtStart: boolean
  readonly finalFrameAtFinish: boolean
  readonly finalProgressIsOne: boolean
  readonly everyFrameHasAllRiders: boolean
  readonly nullMetricsRemainNull: boolean
}

interface DiagnosticBundle {
  readonly model: ReplayStageModel
  readonly modelHash: string
  readonly modelCanonicalJson: string
  readonly stageInputHash: string
  readonly simulationOutputHash: string
  readonly highlightedTeamId: string | null
  readonly checks: DiagnosticChecks
  readonly validationMessages: readonly string[]
}

interface ViewerErrorBoundaryProps {
  readonly children: React.ReactNode
}

interface ViewerErrorBoundaryState {
  readonly errorMessage: string | null
}

class ViewerErrorBoundary extends React.Component<
  ViewerErrorBoundaryProps,
  ViewerErrorBoundaryState
> {
  public state: ViewerErrorBoundaryState = {
    errorMessage: null,
  }

  public static getDerivedStateFromError(
    error: unknown,
  ): ViewerErrorBoundaryState {
    return {
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error),
    }
  }

  public componentDidCatch(
    error: unknown,
  ): void {
    // eslint-disable-next-line no-console
    console.error(
      'GenericRaceReplayView diagnostic render failed:',
      error,
    )
  }

  public render(): React.ReactNode {
    if (this.state.errorMessage !== null) {
      return (
        <section className="mx-auto my-6 max-w-5xl rounded-3xl border border-red-300 bg-red-50 p-6 text-red-900 shadow-sm">
          <h2 className="text-xl font-semibold">
            Generic replay viewer render failed
          </h2>

          <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-white p-4 text-sm">
            {this.state.errorMessage}
          </pre>
        </section>
      )
    }

    return this.props.children
  }
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

function allChecksPassed(
  checks: DiagnosticChecks,
): boolean {
  return Object.values(
    checks,
  ).every(Boolean)
}

function createDiagnosticBundle(): DiagnosticBundle {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const sourceBefore =
    createCanonicalHashedValue(
      sourceRows,
    )

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const stageInputBefore =
    createCanonicalHashedValue(
      stageInput,
    )

  const simulationOutput =
    runDeterministicRoadRace(
      stageInput,
    )

  const simulationOutputBefore =
    createCanonicalHashedValue(
      simulationOutput,
    )

  const model =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    })

  const validation =
    validateReplayStageModel(
      model,
    )

  const canonicalModel =
    createCanonicalHashedValue(
      model,
    )

  const sourceAfter =
    createCanonicalHashedValue(
      sourceRows,
    )

  const stageInputAfter =
    createCanonicalHashedValue(
      stageInput,
    )

  const simulationOutputAfter =
    createCanonicalHashedValue(
      simulationOutput,
    )

  const firstFrame =
    model.frames[0]

  const finalFrame =
    model.frames[
      model.frames.length - 1
    ]

  const checks:
    DiagnosticChecks = {
      sourceFixtureUnchanged:
        sourceBefore.hash ===
          sourceAfter.hash &&
        sourceBefore.canonicalJson ===
          sourceAfter.canonicalJson,

      stageInputUnchanged:
        stageInputBefore.hash ===
          stageInputAfter.hash &&
        stageInputBefore.canonicalJson ===
          stageInputAfter.canonicalJson,

      simulationOutputUnchanged:
        simulationOutputBefore.hash ===
          simulationOutputAfter.hash &&
        simulationOutputBefore.canonicalJson ===
          simulationOutputAfter.canonicalJson,

      expectedStageInputHash:
        stageInputBefore.hash ===
        EXPECTED_STAGE_INPUT_HASH,

      expectedSimulationOutputHash:
        simulationOutputBefore.hash ===
        EXPECTED_SIMULATION_OUTPUT_HASH,

      expectedReplayModelHash:
        canonicalModel.hash ===
        EXPECTED_REPLAY_MODEL_HASH,

      replayValidatorPassed:
        validation.valid &&
        validation.issues.length === 0,

      expectedRiderCount:
        firstFrame?.riders.length ===
        EXPECTED_RIDER_COUNT,

      expectedFrameCount:
        model.frames.length ===
        EXPECTED_FRAME_COUNT,

      expectedEventCount:
        model.events.length ===
        EXPECTED_EVENT_COUNT,

      expectedFinalResultCount:
        model.finalResults.length ===
        EXPECTED_FINAL_RESULT_COUNT,

      expectedProfilePointCount:
        model.profilePoints.length ===
        EXPECTED_PROFILE_POINT_COUNT,

      expectedDuration:
        model.durationSeconds ===
        EXPECTED_DURATION_SECONDS,

      firstFrameAtStart:
        firstFrame?.leaderDistanceKm === 0,

      finalFrameAtFinish:
        finalFrame?.leaderDistanceKm ===
        EXPECTED_STAGE_DISTANCE_KM,

      finalProgressIsOne:
        finalFrame?.progress === 1,

      everyFrameHasAllRiders:
        model.frames.every(
          (frame) =>
            frame.riders.length ===
            EXPECTED_RIDER_COUNT,
        ),

      nullMetricsRemainNull:
        model.frames.every(
          (frame) =>
            frame.riders.every(
              (rider) =>
                rider.staminaPercent ===
                  null &&
                rider.fatiguePercent ===
                  null,
            ),
        ),
    }

  return {
    model,
    modelHash:
      canonicalModel.hash,
    modelCanonicalJson:
      canonicalModel.canonicalJson,
    stageInputHash:
      stageInputBefore.hash,
    simulationOutputHash:
      simulationOutputBefore.hash,
    highlightedTeamId:
      stageInput.teams[0]
        ?.teamId ?? null,
    checks,
    validationMessages:
      validation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),
  }
}

function MountedGenericReplayView({
  bundle,
  onMounted,
}: {
  readonly bundle: DiagnosticBundle
  readonly onMounted: () => void
}): JSX.Element {
  useEffect(() => {
    onMounted()
  }, [onMounted])

  const stageMarkers:
    readonly GenericReplayStageMarker[] = [
      {
        id: 'diagnostic-start',
        kilometre: 0,
        label: 'Start',
        kind: 'start',
      },
      {
        id: 'diagnostic-finish',
        kilometre:
          bundle.model.distanceKm,
        label: 'Finish',
        kind: 'finish',
      },
    ]

  return (
    <GenericRaceReplayView
      model={bundle.model}
      displayMode="page"
      raceName="Rio Tour — Phase 5 Diagnostic"
      stageLabel={bundle.model.stageName}
      stageMarkers={stageMarkers}
      highlightedTeamIds={
        bundle.highlightedTeamId
          ? [bundle.highlightedTeamId]
          : []
      }
    />
  )
}

export default function RioStage1GenericReplayViewDiagnostic():
  JSX.Element {
  const [
    bundle,
    setBundle,
  ] =
    useState<DiagnosticBundle | null>(
      null,
    )

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    )

  const [
    preparing,
    setPreparing,
  ] =
    useState(false)

  const [
    viewerMounted,
    setViewerMounted,
  ] =
    useState(false)

  const [
    modelIntegrityPassed,
    setModelIntegrityPassed,
  ] =
    useState<boolean | null>(
      null,
    )

  const handlePrepare = (): void => {
    setPreparing(true)
    setBundle(null)
    setErrorMessage(null)
    setViewerMounted(false)
    setModelIntegrityPassed(null)

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

  const handleCheckModelIntegrity = (): void => {
    if (!bundle) {
      return
    }

    const current =
      createCanonicalHashedValue(
        bundle.model,
      )

    setModelIntegrityPassed(
      current.hash ===
        bundle.modelHash &&
      current.canonicalJson ===
        bundle.modelCanonicalJson,
    )
  }

  const checksPassed =
    bundle
      ? allChecksPassed(
          bundle.checks,
        )
      : false

  return (
    <div className="min-h-screen bg-slate-950">
      <section className="border-b border-slate-800 bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Rio Stage 1 Generic Replay View
          </h1>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
            Builds the frozen Rio ReplayStageModel once and mounts the real Phase 5 GenericRaceReplayView. Use the replay controls below, then re-check model integrity.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={preparing}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {preparing
                ? 'Preparing…'
                : 'Prepare generic replay view'}
            </button>

            {bundle ? (
              <button
                type="button"
                onClick={handleCheckModelIntegrity}
                className="rounded-full border border-slate-600 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Check replay model unchanged
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-red-400 bg-red-950/40 p-4">
              <div className="font-semibold text-red-200">
                Preparation failed
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-red-100">
                {errorMessage}
              </pre>
            </div>
          ) : null}

          {bundle ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      checksPassed
                        ? 'border-emerald-400 bg-emerald-950/50 text-emerald-200'
                        : 'border-red-400 bg-red-950/50 text-red-200',
                    ].join(' ')}
                  >
                    Model checks: {checksPassed ? 'PASS' : 'FAIL'}
                  </span>

                  <span
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      viewerMounted
                        ? 'border-emerald-400 bg-emerald-950/50 text-emerald-200'
                        : 'border-amber-400 bg-amber-950/50 text-amber-200',
                    ].join(' ')}
                  >
                    Viewer mounted: {viewerMounted ? 'PASS' : 'WAITING'}
                  </span>

                  <span
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      modelIntegrityPassed === true
                        ? 'border-emerald-400 bg-emerald-950/50 text-emerald-200'
                        : modelIntegrityPassed === false
                          ? 'border-red-400 bg-red-950/50 text-red-200'
                          : 'border-slate-600 bg-slate-800 text-slate-300',
                    ].join(' ')}
                  >
                    Model after controls:{' '}
                    {modelIntegrityPassed === null
                      ? 'NOT CHECKED'
                      : modelIntegrityPassed
                        ? 'PASS'
                        : 'FAIL'}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-[minmax(170px,auto)_1fr] gap-x-5 gap-y-2 text-sm">
                  <dt className="text-slate-400">
                    StageInput hash
                  </dt>
                  <dd>
                    <code>{bundle.stageInputHash}</code>
                  </dd>

                  <dt className="text-slate-400">
                    SimulationOutput hash
                  </dt>
                  <dd>
                    <code>{bundle.simulationOutputHash}</code>
                  </dd>

                  <dt className="text-slate-400">
                    ReplayStageModel hash
                  </dt>
                  <dd>
                    <code>{bundle.modelHash}</code>
                  </dd>

                  <dt className="text-slate-400">
                    Frames / events / riders
                  </dt>
                  <dd>
                    {bundle.model.frames.length}
                    {' / '}
                    {bundle.model.events.length}
                    {' / '}
                    {bundle.model.frames[0]?.riders.length ?? 0}
                  </dd>
                </dl>

                <ul className="mt-4 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
                  {Object.entries(
                    bundle.checks,
                  ).map(
                    ([name, passed]) => (
                      <li key={name}>
                        {passed ? 'PASS' : 'FAIL'}
                        {' — '}
                        {name}
                      </li>
                    ),
                  )}
                </ul>

                {bundle.validationMessages.length > 0 ? (
                  <ul className="mt-4 space-y-1 rounded-xl border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-100">
                    {bundle.validationMessages.map(
                      (message) => (
                        <li key={message}>
                          {message}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
                <div className="font-semibold text-white">
                  Browser verification
                </div>

                <ol className="mt-3 list-decimal space-y-2 pl-5 leading-5">
                  <li>Confirm the viewer appears below without a red render-error card.</li>
                  <li>Press Play, Pause, Previous and Next.</li>
                  <li>Test 1x, 2x, 4x and 8x.</li>
                  <li>Move the timeline and confirm groups move on the profile.</li>
                  <li>Confirm stamina and fatigue display N/A.</li>
                  <li>Press Finish Replay and confirm final classification appears.</li>
                  <li>Press Reset and confirm the replay returns to the start.</li>
                  <li>Press “Check replay model unchanged” above.</li>
                  <li>Open F12 Console and confirm there are no red errors.</li>
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {bundle ? (
        <ViewerErrorBoundary>
          <MountedGenericReplayView
            bundle={bundle}
            onMounted={() =>
              setViewerMounted(true)
            }
          />
        </ViewerErrorBoundary>
      ) : (
        <div className="mx-auto max-w-5xl px-6 py-12 text-center text-slate-400">
          Prepare the diagnostic to mount the Phase 5 replay viewer.
        </div>
      )}
    </div>
  )
}
