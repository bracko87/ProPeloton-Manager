/**
 * RioStage1RaceDetailReplayDiagnostic.tsx
 *
 * Deterministic Engine v1 live staging UI integration.
 *
 * This page:
 * - loads the fixed allow-listed Rio Stage 1 source bundle through the
 *   authenticated read-only staging RPC
 * - runs the calibrated deterministic engine twice in browser memory
 * - verifies repeatable StageInput, SimulationOutput, and ReplayStageModel hashes
 * - passes the generic ReplayStageModel into the actual RaceDetailPage replay branch
 * - keeps the normal production RaceDetailPage route and legacy replay fallback unchanged
 *
 * It does not write to Supabase, persist results, activate a scheduler,
 * mutate official results, or make the browser replay authoritative.
 */

import {
  useEffect,
  useState,
} from 'react'
import {
  useNavigate,
  useSearchParams,
} from 'react-router'

import RaceDetailPage from '../dashboard/RaceDetailPage'
import {
  supabase,
} from '../../lib/supabase'
import {
  executeLiveStagingShadowStageValidation,
  LIVE_STAGING_SHADOW_STAGES,
  type LiveShadowSourceBundle,
  type LiveStagingShadowStageReport,
} from '../../race-engine/migration/liveStagingShadowValidation'
import {
  type ReplayStageModel,
} from '../../race-replay'

type EngineV1UiTestProfile =
  | 'flat'
  | 'hilly'
  | 'mountain'

type EngineV1UiTestStage = {
  readonly profile:
    EngineV1UiTestProfile
  readonly stageId: string
  readonly expectedRaceId:
    string | null
  readonly label: string
}

const ENGINE_V1_UI_TEST_STAGES:
  readonly EngineV1UiTestStage[] = [
    {
      profile: 'flat',
      stageId:
        '24709c46-b258-4db3-a3aa-fd92dc37630e',
      expectedRaceId:
        '65739034-f9e5-4b5c-8f21-4ea27451e0d4',
      label:
        'Rio Tour Stage 1 · Flat',
    },
    {
      profile: 'hilly',
      stageId:
        '3ca7d3dd-6a45-4829-b08e-6b118309fdd8',
      expectedRaceId: null,
      label:
        'Japan Road Cup Stage 1 · Hilly',
    },
    {
      profile: 'mountain',
      stageId:
        '2d33de11-3a34-412a-b90a-847d4839c8d9',
      expectedRaceId: null,
      label:
        'Mentougou International Road Race Stage 3 · Mountain',
    },
  ]

type DeterministicStageResultOverrideRow = {
  readonly rank: number | null
  readonly rider_id: string | null
  readonly team_id: string | null
  readonly rider_name_snapshot:
    string | null
  readonly team_name_snapshot:
    string | null
  readonly elapsed_seconds:
    number | null
  readonly gap_seconds:
    number | null
  readonly bonus_seconds:
    number | null
  readonly penalty_seconds:
    number | null
  readonly finish_points:
    number | null
  readonly sprint_points:
    number | null
  readonly mountain_points:
    number | null
  readonly status: string | null
}

type RaceDetailReplayBundle = {
  readonly raceId: string
  readonly stageId: string
  readonly model:
    ReplayStageModel
  readonly report:
    LiveStagingShadowStageReport
  readonly stageResultRows:
    readonly DeterministicStageResultOverrideRow[]
}

type RaceDetailReplayState = {
  readonly loading: boolean
  readonly bundle:
    RaceDetailReplayBundle | null
  readonly errorMessage:
    string | null
}

type JsonObject =
  Record<string, unknown>

const INITIAL_STATE:
  RaceDetailReplayState = {
    loading: true,
    bundle: null,
    errorMessage: null,
  }

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

function asObject(
  value: unknown,
): JsonObject {
  return (
    value !== null &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {}
}

function asObjectArray(
  value: unknown,
): readonly JsonObject[] {
  return Array.isArray(value)
    ? value.map(asObject)
    : []
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    )
  }

  return value.trim()
}

function normalizeBundle(
  value: unknown,
): LiveShadowSourceBundle {
  const source =
    asObject(value)

  return {
    status:
      requireString(
        source.status,
        'bundle.status',
      ),

    bundle_version:
      requireString(
        source.bundle_version,
        'bundle.bundle_version',
      ),

    generated_at:
      source.generated_at,

    race_id:
      requireString(
        source.race_id,
        'bundle.race_id',
      ),

    stage_id:
      requireString(
        source.stage_id,
        'bundle.stage_id',
      ),

    stage_format:
      requireString(
        source.stage_format,
        'bundle.stage_format',
      ),

    stage:
      asObject(
        source.stage,
      ),

    profile_detail:
      asObject(
        source.profile_detail,
      ),

    teams:
      asObjectArray(
        source.teams,
      ),

    participants:
      asObjectArray(
        source.participants,
      ),

    rider_inputs:
      asObjectArray(
        source.rider_inputs,
      ),

    phase_commands:
      asObjectArray(
        source.phase_commands,
      ),

    official_results:
      asObjectArray(
        source.official_results,
      ),

    official_simulation_runs:
      asObjectArray(
        source.official_simulation_runs,
      ),

    counts:
      asObject(
        source.counts,
      ),

    safety:
      asObject(
        source.safety,
      ),
  }
}

async function loadSourceBundle(
  stageId: string,
): Promise<LiveShadowSourceBundle> {
  const {
    data,
    error,
  } = await supabase.rpc(
    'race_engine_get_calibrated_shadow_source_bundle_dev_v1',
    {
      p_stage_id:
        stageId,
    },
  )

  if (error) {
    throw new Error(
      `Unable to load the staging source bundle: ${error.message}`,
    )
  }

  if (
    data === null ||
    typeof data !==
      'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'The staging source RPC returned an invalid source bundle.',
    )
  }

  return normalizeBundle(
    data,
  )
}

async function createLiveRaceDetailReplayBundle(
  selectedStage:
    EngineV1UiTestStage,
): Promise<RaceDetailReplayBundle> {
  const sourceBundle =
    await loadSourceBundle(
      selectedStage.stageId,
    )

  const definition =
    LIVE_STAGING_SHADOW_STAGES
      .find(
        (candidate) =>
          candidate.stageId ===
          selectedStage.stageId,
      )

  if (!definition) {
    throw new Error(
      `${selectedStage.label} is missing from the live staging shadow allow-list.`,
    )
  }

  if (
    sourceBundle.stage_id !==
      selectedStage.stageId
  ) {
    throw new Error(
      `Expected stage ${selectedStage.stageId}, received ${sourceBundle.stage_id}.`,
    )
  }

  if (
    selectedStage.expectedRaceId &&
    sourceBundle.race_id !==
      selectedStage.expectedRaceId
  ) {
    throw new Error(
      `Expected race ${selectedStage.expectedRaceId}, received ${sourceBundle.race_id}.`,
    )
  }

  const execution =
    executeLiveStagingShadowStageValidation({
      definition,
      bundle:
        sourceBundle,
    })

  if (
    !execution.report
      .executionPassed
  ) {
    throw new Error(
      `The live ${selectedStage.profile} deterministic execution did not pass its safety and completeness checks.`,
    )
  }

  if (
    execution.report
      .databaseWritesPerformed !==
      false ||
    execution.report
      .replayPersisted !==
      false ||
    execution.report
      .officialResultMutationAllowed !==
      false
  ) {
    throw new Error(
      `The live ${selectedStage.profile} execution did not preserve the required read-only safety contract.`,
    )
  }

  const finishedRiderTimes =
    execution
      .simulationOutput
      .finalRiderStates
      .filter(
        (rider) =>
          rider.finished &&
          typeof rider
            .finishTimeSeconds ===
            'number',
      )
      .map(
        (rider) =>
          rider
            .finishTimeSeconds as number,
      )

  if (
    finishedRiderTimes.length ===
      0
  ) {
    throw new Error(
      'The deterministic simulation produced no finished riders.',
    )
  }

  const winnerTimeSeconds =
    Math.min(
      ...finishedRiderTimes,
    )

  const stageResultRows =
    execution
      .simulationOutput
      .finalRiderStates
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          (
            left.finishPosition ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            right.finishPosition ??
            Number.MAX_SAFE_INTEGER
          ) ||
          left.riderId
            .localeCompare(
              right.riderId,
            ),
      )
      .map(
        (
          rider,
        ):
          DeterministicStageResultOverrideRow => {
          const elapsedSeconds =
            rider.finishTimeSeconds

          return {
            rank:
              rider.finishPosition,
            rider_id:
              rider.riderId,
            team_id:
              rider.teamId,
            rider_name_snapshot:
              rider.riderName,
            team_name_snapshot:
              rider.teamName,
            elapsed_seconds:
              elapsedSeconds,
            gap_seconds:
              elapsedSeconds !==
                  null
                ? Math.max(
                    0,
                    elapsedSeconds -
                      winnerTimeSeconds,
                  )
                : null,
            bonus_seconds: 0,
            penalty_seconds: 0,
            finish_points: 0,
            sprint_points: 0,
            mountain_points: 0,
            status:
              rider.finished
                ? 'finished'
                : rider.stageStatus,
          }
        },
      )

  return {
    raceId:
      sourceBundle.race_id,
    stageId:
      sourceBundle.stage_id,
    model:
      execution.replayModel,
    report:
      execution.report,
    stageResultRows,
  }
}

export default function RioStage1RaceDetailReplayDiagnostic():
  JSX.Element {
  const navigate =
    useNavigate()

  const [
    searchParams,
  ] = useSearchParams()

  const requestedProfile =
    searchParams.get(
      'profile',
    )

  const selectedStage =
    ENGINE_V1_UI_TEST_STAGES.find(
      (candidate) =>
        candidate.profile ===
        requestedProfile,
    ) ??
    ENGINE_V1_UI_TEST_STAGES[0]

  const [
    state,
    setState,
  ] = useState<
    RaceDetailReplayState
  >(INITIAL_STATE)

  useEffect(() => {
    let mounted = true

    const load =
      async (): Promise<void> => {
        setState({
          loading: true,
          bundle: null,
          errorMessage: null,
        })

        try {
          const bundle =
            await createLiveRaceDetailReplayBundle(
              selectedStage,
            )

          if (!mounted) {
            return
          }

          setState({
            loading: false,
            bundle,
            errorMessage: null,
          })
        } catch (error) {
          if (!mounted) {
            return
          }

          setState({
            loading: false,
            bundle: null,
            errorMessage:
              getErrorMessage(error),
          })
        }
      }

    void load()

    return () => {
      mounted = false
    }
  }, [selectedStage.stageId])

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-3xl border border-sky-500/40 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Deterministic Engine v1 test
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Preparing live Engine v1 replay
          </h1>

          <p className="mt-3 text-sm text-slate-300">
            Loading the authenticated read-only staging source bundle and running the deterministic engine in browser memory.
          </p>
        </section>
      </main>
    )
  }

  if (
    state.errorMessage ||
    !state.bundle
  ) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-3xl border border-red-400 bg-red-950/40 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Deterministic Engine v1 live UI integration
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Live Engine v1 replay preparation failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {state.errorMessage ??
              'Unknown preparation error.'}
          </pre>
        </section>
      </main>
    )
  }

  const {
    raceId,
    stageId,
    model,
    report,
    stageResultRows,
  } = state.bundle

  const repeatabilityPassed =
    report.stageInputHash ===
      report.repeatedStageInputHash &&
    report.deterministicOutputHash ===
      report.repeatedDeterministicOutputHash &&
    report.replayModelHash ===
      report.repeatedReplayModelHash

  const zeroWritesPreserved =
    report.databaseWritesPerformed ===
      false &&
    report.deterministicWriterCalls ===
      0 &&
    report.replayPersisted ===
      false &&
    report.officialResultMutationAllowed ===
      false

  return (
    <div className="min-h-screen bg-slate-100">
      <section className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
              Deterministic Engine v1 · Live staging test
            </div>

            <div className="mt-1 text-sm text-slate-300">
              Actual RaceDetailPage · live calibrated Engine v1 replay · read-only in-memory execution
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ENGINE_V1_UI_TEST_STAGES.map(
              (candidate) => (
                <button
                  key={
                    candidate.profile
                  }
                  type="button"
                  onClick={() => {
                    navigate(
                      `/dev/rio-stage-1-race-detail-replay?profile=${candidate.profile}`,
                    )
                  }}
                  className={
                    candidate.profile ===
                    selectedStage.profile
                      ? 'rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-white'
                      : 'rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300'
                  }
                >
                  {candidate.profile}
                </button>
              ),
            )}
          </div>

          <div className="flex max-w-4xl flex-wrap items-center justify-end gap-2 text-xs">
            <span className="rounded-full border border-emerald-400 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-200">
              {report.executionPassed
                ? 'Execution passed'
                : 'Execution failed'}
            </span>

            <span
              className={
                repeatabilityPassed
                  ? 'rounded-full border border-emerald-400 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-200'
                  : 'rounded-full border border-red-400 bg-red-950/50 px-3 py-1 font-semibold text-red-200'
              }
            >
              {repeatabilityPassed
                ? 'Repeatability passed'
                : 'Repeatability failed'}
            </span>

            <span
              className={
                zeroWritesPreserved
                  ? 'rounded-full border border-emerald-400 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-200'
                  : 'rounded-full border border-red-400 bg-red-950/50 px-3 py-1 font-semibold text-red-200'
              }
            >
              {zeroWritesPreserved
                ? 'Zero writes'
                : 'Write safety failed'}
            </span>

            <span className="rounded-full border border-amber-400 bg-amber-950/50 px-3 py-1 font-semibold text-amber-200">
              {report.strictMigrationComparisonPassed
                ? 'Strict legacy comparison passed'
                : 'Strict legacy comparison blocked'}
            </span>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              StageInput: {report.stageInputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              Repeated: {report.repeatedStageInputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              Output: {report.deterministicOutputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              Repeated: {report.repeatedDeterministicOutputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              Replay: {report.replayModelHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              Repeated: {report.repeatedReplayModelHash}
            </code>
          </div>
        </div>
      </section>

      <RaceDetailPage
        raceIdOverride={raceId}
        replayStageIdOverride={stageId}
        genericReplayModelOverride={model}
        stageResultsOverride={{
          stageId,
          rows:
            stageResultRows,
        }}
        engineTestModeLabel={
          `Deterministic Engine v1 test mode · ${selectedStage.label}`
        }
        onCloseReplayOverride={() => {
          navigate(
            `/dev/rio-stage-1-race-detail-replay?profile=${selectedStage.profile}`,
          )
        }}
      />
    </div>
  )
}