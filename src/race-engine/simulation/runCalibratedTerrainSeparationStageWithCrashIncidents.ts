/**
 * runCalibratedTerrainSeparationStageWithCrashIncidents.ts
 *
 * Explicit development-only calibrated wrapper with shared individual/group
 * crash selection. The accepted calibrated wrapper and public race boundary
 * remain unchanged.
 */

import type {
  ActiveCrashIncidentKind,
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

export interface RunCalibratedTerrainSeparationStageWithCrashIncidentsOptions {
  readonly maximumTickCount?: number
  readonly maximumIncidentsPerStage?: number
  readonly enabledIncidentKinds?:
    readonly ActiveCrashIncidentKind[]
}

export interface RunCalibratedTerrainSeparationStageWithCrashIncidentsResult
  extends RunIntegratedTerrainSeparationStageResult {
  readonly replaySnapshots:
    readonly ReplaySnapshot[]
  readonly replayCollection:
    ReplaySnapshotCollection
}

const DEFAULT_MAXIMUM_TICK_COUNT =
  100_000

export function runCalibratedTerrainSeparationStageWithCrashIncidents(
  initialState:
    SimulationState,
  options:
    RunCalibratedTerrainSeparationStageWithCrashIncidentsOptions = {},
): RunCalibratedTerrainSeparationStageWithCrashIncidentsResult {
  const maximumTickCount =
    options.maximumTickCount ??
    DEFAULT_MAXIMUM_TICK_COUNT

  if (
    !Number.isInteger(
      maximumTickCount,
    ) ||
    maximumTickCount <= 0
  ) {
    throw new Error(
      'runCalibratedTerrainSeparationStageWithCrashIncidents: maximumTickCount must be a positive integer.',
    )
  }

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

        crashIncidentIntegration: {
          globalCooldownSeconds:
            120,
          riderCooldownSeconds:
            900,
          maximumIncidentsPerStage:
            options
              .maximumIncidentsPerStage ??
            3,
          enabledIncidentKinds:
            options
              .enabledIncidentKinds,
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
          'runCalibratedTerrainSeparationStageWithCrashIncidents: replay boundary must align with a tick boundary.',
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

  return {
    ...stage,
    replaySnapshots,
    replayCollection:
      createReplaySnapshotCollection(
        replaySnapshots,
      ),
  }
}
