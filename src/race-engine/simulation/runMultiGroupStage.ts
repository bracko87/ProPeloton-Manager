/**
 * runMultiGroupStage.ts
 *
 * Pure deterministic full-stage runner for the isolated multi-group engine.
 *
 * Starting from an existing SimulationState, this repeatedly calls
 * simulateMultiGroupTick() until the simulation completes. It accumulates
 * finish results, captures deterministic replay snapshots, and exposes the
 * complete per-tick trace.
 *
 * This runner is in-memory only. It does not access Supabase, persist output,
 * schedule work, or activate any production runtime.
 */

import type { RaceEvent } from '../domain/RaceEvent'
import type { SimulationState } from '../domain/SimulationState'
import type { StageResult } from '../domain/SimulationOutput'
import {
  createCanonicalHashedValue,
} from './canonicalSerialization'
import {
  createReplaySnapshot,
  createReplaySnapshotCollection,
  getReplaySnapshotBoundarySeconds,
  type ReplaySnapshot,
  type ReplaySnapshotCollection,
} from './replaySnapshots'
import {
  simulateMultiGroupTick,
  type SimulateMultiGroupTickResult,
} from './simulateMultiGroupTick'

export interface RunMultiGroupStageOptions {
  /**
   * Safety bound preventing an invalid state from producing an endless loop.
   */
  readonly maximumTickCount?: number
}

export interface RunMultiGroupStageResult {
  readonly initialState: SimulationState
  readonly finalState: SimulationState
  readonly ticks:
    readonly SimulateMultiGroupTickResult[]
  readonly tickCount: number
  readonly results:
    readonly StageResult[]
  readonly events:
    readonly RaceEvent[]
  readonly replaySnapshots:
    readonly ReplaySnapshot[]
  readonly replayCollection:
    ReplaySnapshotCollection
  readonly canonicalJson: string
  readonly deterministicHash: string
  readonly completed: boolean
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
      'runMultiGroupStage: maximumTickCount must be a positive integer.',
    )
  }
}

/**
 * Runs an isolated multi-group simulation state until completion.
 */
export function runMultiGroupStage(
  initialState: SimulationState,
  options: RunMultiGroupStageOptions = {},
): RunMultiGroupStageResult {
  if (initialState.completed) {
    throw new Error(
      'runMultiGroupStage: initial state is already completed.',
    )
  }

  const maximumTickCount =
    options.maximumTickCount ??
    DEFAULT_MAXIMUM_TICK_COUNT

  validateMaximumTickCount(
    maximumTickCount,
  )

  const ticks:
    SimulateMultiGroupTickResult[] = []

  const results:
    StageResult[] = []

  const replaySnapshots:
    ReplaySnapshot[] = [
      createReplaySnapshot({
        state: initialState,
        sequenceNumber: 1,
      }),
    ]

  let nextReplaySequenceNumber = 2

  let currentState =
    initialState

  while (!currentState.completed) {
    if (
      ticks.length >=
      maximumTickCount
    ) {
      throw new Error(
        `runMultiGroupStage: exceeded maximumTickCount (${maximumTickCount}) before completion.`,
      )
    }

    const previousState =
      currentState

    const tick =
      simulateMultiGroupTick(
        previousState,
      )

    ticks.push(tick)

    if (tick.appliedFinish) {
      results.push(
        ...tick.appliedFinish
          .newResults,
      )
    }

    currentState =
      tick.state

    const replayBoundaries =
      getReplaySnapshotBoundarySeconds(
        previousState.raceSecond,
        currentState.raceSecond,
        currentState.input
          .settings
          .replaySnapshotIntervalSeconds,
      )

    for (
      const replayBoundarySecond of
      replayBoundaries
    ) {
      if (
        replayBoundarySecond !==
        currentState.raceSecond
      ) {
        throw new Error(
          'runMultiGroupStage: replay snapshot boundaries must align with multi-group tick boundaries.',
        )
      }

      replaySnapshots.push(
        createReplaySnapshot({
          state: currentState,
          sequenceNumber:
            nextReplaySequenceNumber,
        }),
      )

      nextReplaySequenceNumber += 1
    }
  }

  const orderedResults =
    results
      .slice()
      .sort(
        (
          resultA,
          resultB,
        ) =>
          resultA.rank -
          resultB.rank,
      )

  const replayCollection =
    createReplaySnapshotCollection(
      replaySnapshots,
    )

  const canonicalOutput =
    createCanonicalHashedValue({
      raceId:
        currentState.raceId,
      stageId:
        currentState.stageId,
      seed:
        currentState.seed,
      completed:
        currentState.completed,
      tickCount:
        ticks.length,
      finalState:
        currentState,
      results:
        orderedResults,
      events:
        currentState.events,
      replaySnapshots,
      replayCollection,
    })

  return {
    initialState,
    finalState:
      currentState,
    ticks,
    tickCount:
      ticks.length,
    results:
      orderedResults,
    events:
      currentState.events
        .slice(),
    replaySnapshots,
    replayCollection,
    canonicalJson:
      canonicalOutput.canonicalJson,
    deterministicHash:
      canonicalOutput.hash,
    completed:
      currentState.completed,
  }
}