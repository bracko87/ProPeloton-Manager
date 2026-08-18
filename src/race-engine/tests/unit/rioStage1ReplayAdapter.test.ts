/**
 * rioStage1ReplayAdapter.test.ts
 *
 * Read-only Rio Stage 1 integration coverage for the generic replay adapter.
 * No Supabase connection, persistence, API route, scheduler, or UI is used.
 */

import { describe, expect, it } from 'vitest'

import {
  createReplayStageModelFromSimulationOutput,
} from '../../../race-replay/createReplayStageModelFromSimulationOutput'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../simulation/canonicalSerialization'
import {
  runDeterministicRoadRace,
} from '../../simulation/runDeterministicRoadRace'
import {
  rioStage1SourceRows,
} from '../fixtures/rioStage1SourceRows'

describe(
  'Rio Stage 1 generic replay adapter',
  () => {
    it(
      'creates deterministic replay data without mutating authoritative input or output',
      () => {
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

        const replayModelA =
          createReplayStageModelFromSimulationOutput({
            stageInput,
            simulationOutput,
          })

        const replayModelB =
          createReplayStageModelFromSimulationOutput({
            stageInput,
            simulationOutput,
          })

        const replayModelHashA =
          createCanonicalHashedValue(
            replayModelA,
          )

        const replayModelHashB =
          createCanonicalHashedValue(
            replayModelB,
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

        expect(sourceAfter.hash).toBe(
          sourceBefore.hash,
        )

        expect(stageInputAfter.hash).toBe(
          stageInputBefore.hash,
        )

        expect(simulationOutputAfter.hash).toBe(
          simulationOutputBefore.hash,
        )

        expect(replayModelHashA.hash).toBe(
          replayModelHashB.hash,
        )

        expect(stageInputBefore.hash).toBe(
          '85993905d61e0cc5',
        )

        expect(simulationOutputBefore.hash).toBe(
          '229fef0b88e36b02',
        )

        expect(stageInput.riders).toHaveLength(96)
        expect(simulationOutput.snapshots).toHaveLength(395)
        expect(simulationOutput.events).toHaveLength(98)

        expect(replayModelA.frames).toHaveLength(395)
        expect(replayModelA.events).toHaveLength(98)
        expect(replayModelA.finalResults).toHaveLength(96)
        expect(replayModelA.distanceKm).toBe(142)

        const firstFrame = replayModelA.frames[0]
        const lastFrame =
          replayModelA.frames[
            replayModelA.frames.length - 1
          ]

        if (!firstFrame || !lastFrame) {
          throw new Error(
            'Expected first and last replay frames.',
          )
        }

        expect(firstFrame.leaderDistanceKm).toBe(0)
        expect(lastFrame.leaderDistanceKm).toBe(142)
        expect(lastFrame.progress).toBe(1)

        expect(
          replayModelA.frames.every(
            (frame) =>
              frame.riders.length === 96,
          ),
        ).toBe(true)

        expect(
          replayModelA.frames.every(
            (frame) =>
              new Set(
                frame.riders.map(
                  (rider) => rider.riderId,
                ),
              ).size === 96,
          ),
        ).toBe(true)

        expect(
          replayModelA.frames.every(
            (frame) =>
              frame.riders.every(
                (rider) =>
                  rider.staminaPercent === null &&
                  rider.fatiguePercent === null,
              ),
          ),
        ).toBe(true)

        expect(
          lastFrame.riders.every(
            (rider) =>
              rider.status === 'finished' &&
              rider.finishPosition !== null &&
              rider.finishTimeSeconds !== null,
          ),
        ).toBe(true)

        const finishPositions =
          replayModelA.finalResults
            .map(
              (result) =>
                result.finishPosition,
            )
            .filter(
              (
                position,
              ): position is number =>
                position !== null,
            )

        expect(finishPositions).toHaveLength(96)
        expect(new Set(finishPositions).size).toBe(96)

        expect(
          replayModelA.events.some(
            (event) =>
              event.type ===
              'SIMULATION_COMPLETED',
          ),
        ).toBe(true)
      },
    )
  },
)
