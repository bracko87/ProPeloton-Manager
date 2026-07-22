/**
 * RioStage1RaceDetailReplayDiagnostic.tsx
 *
 * Phase 6 development-only route.
 *
 * This page:
 * - builds the frozen Rio Stage 1 deterministic replay in browser memory
 * - verifies the frozen StageInput, SimulationOutput, and ReplayStageModel hashes
 * - passes the generic ReplayStageModel into the actual RaceDetailPage replay branch
 * - keeps the normal production RaceDetailPage route and legacy replay fallback unchanged
 *
 * It does not write to Supabase, persist results, activate a scheduler,
 * or make the browser replay authoritative.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router'

import RaceDetailPage from '../dashboard/RaceDetailPage'
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
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
  type ReplayStageModel,
} from '../../race-replay'

const RIO_RACE_ID =
  '65739034-f9e5-4b5c-8f21-4ea27451e0d4'

const RIO_STAGE_ID =
  '24709c46-b258-4db3-a3aa-fd92dc37630e'

const EXPECTED_STAGE_INPUT_HASH =
  '85993905d61e0cc5'

const EXPECTED_SIMULATION_OUTPUT_HASH =
  '229fef0b88e36b02'

const EXPECTED_REPLAY_MODEL_HASH =
  '91f4bad38bc33e21'

type RioRaceDetailReplayBundle = {
  readonly model: ReplayStageModel
  readonly stageInputHash: string
  readonly simulationOutputHash: string
  readonly replayModelHash: string
}

type RioRaceDetailReplayPreparation = {
  readonly bundle: RioRaceDetailReplayBundle | null
  readonly errorMessage: string | null
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

function assertExpectedHash({
  label,
  actual,
  expected,
}: {
  readonly label: string
  readonly actual: string
  readonly expected: string
}): void {
  if (actual !== expected) {
    throw new Error(
      `${label} hash changed. Expected ${expected}, received ${actual}.`,
    )
  }
}

function createRioRaceDetailReplayBundle():
  RioRaceDetailReplayBundle {
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

  const canonicalStageInput =
    createCanonicalHashedValue(
      stageInput,
    )

  assertExpectedHash({
    label: 'StageInput',
    actual:
      canonicalStageInput.hash,
    expected:
      EXPECTED_STAGE_INPUT_HASH,
  })

  if (
    stageInput.raceId !==
      RIO_RACE_ID ||
    stageInput.stageId !==
      RIO_STAGE_ID
  ) {
    throw new Error(
      'The Rio fixture race or stage ID no longer matches the Phase 6 development route.',
    )
  }

  const simulationOutput =
    runDeterministicRoadRace(
      stageInput,
    )

  const canonicalSimulationOutput =
    createCanonicalHashedValue(
      simulationOutput,
    )

  assertExpectedHash({
    label: 'SimulationOutput',
    actual:
      canonicalSimulationOutput.hash,
    expected:
      EXPECTED_SIMULATION_OUTPUT_HASH,
  })

  const model =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    })

  const validation =
    validateReplayStageModel(
      model,
    )

  if (
    !validation.valid ||
    validation.issues.length > 0
  ) {
    const messages =
      validation.issues
        .map(
          (issue) =>
            `${issue.path}: ${issue.message}`,
        )
        .join('\n')

    throw new Error(
      `ReplayStageModel validation failed.${
        messages
          ? `\n${messages}`
          : ''
      }`,
    )
  }

  const canonicalReplayModel =
    createCanonicalHashedValue(
      model,
    )

  assertExpectedHash({
    label: 'ReplayStageModel',
    actual:
      canonicalReplayModel.hash,
    expected:
      EXPECTED_REPLAY_MODEL_HASH,
  })

  const sourceAfter =
    createCanonicalHashedValue(
      sourceRows,
    )

  if (
    sourceBefore.hash !==
      sourceAfter.hash ||
    sourceBefore.canonicalJson !==
      sourceAfter.canonicalJson
  ) {
    throw new Error(
      'The Rio source fixture was mutated while preparing the Phase 6 replay.',
    )
  }

  return {
    model,
    stageInputHash:
      canonicalStageInput.hash,
    simulationOutputHash:
      canonicalSimulationOutput.hash,
    replayModelHash:
      canonicalReplayModel.hash,
  }
}

export default function RioStage1RaceDetailReplayDiagnostic():
  JSX.Element {
  const navigate =
    useNavigate()

  const preparation =
    useMemo<
      RioRaceDetailReplayPreparation
    >(
      () => {
        try {
          return {
            bundle:
              createRioRaceDetailReplayBundle(),
            errorMessage: null,
          }
        } catch (error) {
          return {
            bundle: null,
            errorMessage:
              getErrorMessage(error),
          }
        }
      },
      [],
    )

  if (
    preparation.errorMessage ||
    !preparation.bundle
  ) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-4xl rounded-3xl border border-red-400 bg-red-950/40 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 6 development route
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Rio RaceDetailPage replay preparation failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {preparation.errorMessage ??
              'Unknown preparation error.'}
          </pre>
        </section>
      </main>
    )
  }

  const {
    model,
    stageInputHash,
    simulationOutputHash,
    replayModelHash,
  } = preparation.bundle

  return (
    <div className="min-h-screen bg-slate-100">
      <section className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
              Phase 6 development route
            </div>

            <div className="mt-1 text-sm text-slate-300">
              Actual RaceDetailPage · generic Rio replay · legacy production fallback preserved
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-400 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-200">
              Model verified
            </span>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              {stageInputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              {simulationOutputHash}
            </code>

            <code className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              {replayModelHash}
            </code>
          </div>
        </div>
      </section>

      <RaceDetailPage
        raceIdOverride={RIO_RACE_ID}
        replayStageIdOverride={RIO_STAGE_ID}
        genericReplayModelOverride={model}
        onCloseReplayOverride={() => {
          navigate(
            '/dev/rio-stage-1-generic-replay-view',
          )
        }}
      />
    </div>
  )
}
