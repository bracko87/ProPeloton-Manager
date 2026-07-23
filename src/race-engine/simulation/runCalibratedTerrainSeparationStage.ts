/**
 * runCalibratedTerrainSeparationStage.ts
 *
 * Coherent calibrated-mode wrapper around the integrated terrain-separation
 * runner.
 *
 * This wrapper deliberately exposes only maximumTickCount. All calibrated race
 * rules are fixed together so pressure and movement cannot be enabled in an
 * inconsistent combination.
 *
 * It also creates replay snapshots using the same interval-boundary rule as
 * runMultiGroupStage.
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

export interface RunCalibratedTerrainSeparationStageOptions {
  readonly maximumTickCount?: number
}

export interface RunCalibratedTerrainSeparationStageResult
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
      'runCalibratedTerrainSeparationStage: maximumTickCount must be a positive integer.',
    )
  }
}

/**
 * Runs the complete accepted Phase 7B calibrated package.
 *
 * Fixed configuration:
 * - terrain capability influence: 50%
 * - sustained separation window: 120 seconds
 * - progressive pressure severity
 * - progressive movement severity
 * - five-second dropped-wave consolidation
 * - deterministic transition events
 * - sub-tick finish interpolation
 * - authoritative state-owned pressure
 */
export function runCalibratedTerrainSeparationStage(
  initialState:
    SimulationState,
  options:
    RunCalibratedTerrainSeparationStageOptions = {},
): RunCalibratedTerrainSeparationStageResult {
  const maximumTickCount =
    options.maximumTickCount ??
    DEFAULT_MAXIMUM_TICK_COUNT

  validateMaximumTickCount(
    maximumTickCount,
  )

  const stage =
    runIntegratedTerrainSeparationStage(
      initialState,
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
          'runCalibratedTerrainSeparationStage: replay snapshot boundaries must align with calibrated tick boundaries.',
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
