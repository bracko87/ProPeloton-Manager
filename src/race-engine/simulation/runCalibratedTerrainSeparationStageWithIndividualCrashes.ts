/**
 * runCalibratedTerrainSeparationStageWithIndividualCrashes.ts
 *
 * Explicit development-only calibrated wrapper with deterministic individual
 * crashes enabled.
 *
 * The accepted runCalibratedTerrainSeparationStage() remains unchanged.
 * runDeterministicRoadRace() does not call this wrapper.
 */

import type {
  SimulationState,
} from '../domain/SimulationState'
import {
  createReplaySnapshot,
  createReplaySnapshotCollection,
  getReplaySnapshotBoundarySeconds,
  type ReplaySnapshot,
  type ReplaySnapshotCollection,
} from './replaySnapshots'
import {
  runIntegratedTerrainSeparationStage,
  type RunIntegratedTerrainSeparationStageResult,
} from './runIntegratedTerrainSeparationStage'

export interface RunCalibratedTerrainSeparationStageWithIndividualCrashesOptions {
  readonly maximumTickCount?: number
}

export interface RunCalibratedTerrainSeparationStageWithIndividualCrashesResult
  extends RunIntegratedTerrainSeparationStageResult {
  readonly replaySnapshots:
    readonly ReplaySnapshot[]
  readonly replayCollection:
    ReplaySnapshotCollection
}

const DEFAULT_MAXIMUM_TICK_COUNT =
  100_000

function validateMaximumTickCount(
  maximumTickCount: number,
): void {
  if (
    !Number.isInteger(
      maximumTickCount,
    ) ||
    maximumTickCount <= 0
  ) {
    throw new Error(
      'runCalibratedTerrainSeparationStageWithIndividualCrashes: maximumTickCount must be a positive integer.',
    )
  }
}

export function runCalibratedTerrainSeparationStageWithIndividualCrashes(
  initialState:
    SimulationState,
  options:
    RunCalibratedTerrainSeparationStageWithIndividualCrashesOptions = {},
): RunCalibratedTerrainSeparationStageWithIndividualCrashesResult {
  const maximumTickCount =
    options.maximumTickCount ??
    DEFAULT_MAXIMUM_TICK_COUNT

  validateMaximumTickCount(
    maximumTickCount,
  )

  const calibratedInitialState =
    initialState.input.weather
      ? {
          ...initialState,
          weatherPerformanceEffectsEnabled:
            true,
        }
      : initialState

  const stage =
    runIntegratedTerrainSeparationStage(
      calibratedInitialState,
      {
        terrainCapabilityInfluence:
          0.5,
        separationWindowSeconds:
          120,

        droppedWaveConsolidationEnabled:
          true,
        droppedWaveConsolidationThresholdSeconds:
          5,
        droppedWaveConsolidationGapDifferenceSeconds:
          5,

        droppedTransitionEventsEnabled:
          true,

        steepGradientSeverityEnabled:
          true,
        steepGradientSeverityModel:
          'progressive_resilience',

        steepGradientMovementSeverityEnabled:
          true,
        steepGradientMovementSeverityModel:
          'progressive_resilience',

        subTickFinishInterpolationEnabled:
          true,

        individualCrashIntegration: {
          globalCooldownSeconds:
            120,
          riderCooldownSeconds:
            900,
          maximumCrashesPerStage:
            3,
        },

        maximumTickCount,
      },
    )

  const replaySnapshots:
    ReplaySnapshot[] = [
      createReplaySnapshot({
        state:
          stage.initialState,
        sequenceNumber: 1,
      }),
    ]

  let nextReplaySequenceNumber =
    2

  for (
    const tick of
    stage.ticks
  ) {
    const replayBoundaries =
      getReplaySnapshotBoundarySeconds(
        tick.previousState
          .raceSecond,
        tick.state
          .raceSecond,
        tick.state.input
          .settings
          .replaySnapshotIntervalSeconds,
      )

    for (
      const replayBoundarySecond of
      replayBoundaries
    ) {
      if (
        replayBoundarySecond !==
        tick.state.raceSecond
      ) {
        throw new Error(
          'runCalibratedTerrainSeparationStageWithIndividualCrashes: replay boundaries must align with tick boundaries.',
        )
      }

      replaySnapshots.push(
        createReplaySnapshot({
          state:
            tick.state,
          sequenceNumber:
            nextReplaySequenceNumber,
        }),
      )

      nextReplaySequenceNumber +=
        1
    }
  }

  const replayCollection =
    createReplaySnapshotCollection(
      replaySnapshots,
    )

  return {
    ...stage,
    replaySnapshots,
    replayCollection,
  }
}
