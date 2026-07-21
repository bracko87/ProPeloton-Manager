```ts
/**
 * rioStage1Shadow.test.ts
 *
 * Read-only, in-memory shadow integration coverage for Rio Stage 1.
 *
 * This verifies:
 * - production-shaped source rows map deterministically to StageInput
 * - the adapter does not mutate the source fixture
 * - the deterministic road-race entry point returns identical outputs
 * - all 96 riders complete the stage
 *
 * No Supabase connection, persistence, API route, or scheduler is used.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

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
  'Rio Stage 1 shadow boundary',
  () => {
    it(
      'adapts and executes deterministically in memory',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const sourceBefore =
          createCanonicalHashedValue(
            sourceRows,
          )

        const stageInputA =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const stageInputB =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const sourceAfter =
          createCanonicalHashedValue(
            sourceRows,
          )

        expect(
          sourceAfter.canonicalJson,
        ).toBe(
          sourceBefore.canonicalJson,
        )

        expect(
          sourceAfter.hash,
        ).toBe(
          sourceBefore.hash,
        )

        expect(stageInputA).toEqual(
          stageInputB,
        )

        expect(stageInputA.raceId).toBe(
          '65739034-f9e5-4b5c-8f21-4ea27451e0d4',
        )

        expect(stageInputA.stageId).toBe(
          '24709c46-b258-4db3-a3aa-fd92dc37630e',
        )

        expect(stageInputA.stageFormat).toBe(
          'road_race',
        )

        expect(stageInputA.distanceKm).toBe(
          142,
        )

        expect(stageInputA.seed).toBe(
          'race_engine_ts_v1:' +
            '65739034-f9e5-4b5c-8f21-4ea27451e0d4:' +
            '24709c46-b258-4db3-a3aa-fd92dc37630e',
        )

        expect(
          stageInputA.teams,
        ).toHaveLength(16)

        expect(
          stageInputA.riders,
        ).toHaveLength(96)

        expect(
          stageInputA.profilePoints,
        ).toHaveLength(9)

        expect(
          stageInputA.profilePoints[0]
            .kilometre,
        ).toBe(0)

        expect(
          stageInputA.profilePoints[
            stageInputA.profilePoints.length - 1
          ].kilometre,
        ).toBe(142)

        expect(
          stageInputA.orders,
        ).toEqual([])

        const canonicalStageInputA =
          createCanonicalHashedValue(
            stageInputA,
          )

        const canonicalStageInputB =
          createCanonicalHashedValue(
            stageInputB,
          )

        expect(
          canonicalStageInputA
            .canonicalJson,
        ).toBe(
          canonicalStageInputB
            .canonicalJson,
        )

        expect(
          canonicalStageInputA.hash,
        ).toBe(
          canonicalStageInputB.hash,
        )

        const outputA =
          runDeterministicRoadRace(
            stageInputA,
          )

        const outputB =
          runDeterministicRoadRace(
            stageInputB,
          )

        expect(outputA).toEqual(outputB)

        expect(outputA.raceId).toBe(
          stageInputA.raceId,
        )

        expect(outputA.stageId).toBe(
          stageInputA.stageId,
        )

        expect(outputA.seed).toBe(
          stageInputA.seed,
        )

        expect(
          outputA.finalRiderStates,
        ).toHaveLength(96)

        expect(
          outputB.finalRiderStates,
        ).toHaveLength(96)

        expect(
          outputA.finalRiderStates.every(
            (rider) =>
              rider.finished &&
              rider.stageStatus ===
                'finished' &&
              rider.finishPosition !==
                null &&
              rider.finishTimeSeconds !==
                null,
          ),
        ).toBe(true)

        expect(
          outputB.finalRiderStates.every(
            (rider) =>
              rider.finished &&
              rider.stageStatus ===
                'finished' &&
              rider.finishPosition !==
                null &&
              rider.finishTimeSeconds !==
                null,
          ),
        ).toBe(true)

        expect(
          new Set(
            outputA.finalRiderStates.map(
              (rider) =>
                rider.finishPosition,
            ),
          ).size,
        ).toBe(96)

        expect(
          outputA.events.some(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          ),
        ).toBe(true)

        expect(
          outputB.events.some(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          ),
        ).toBe(true)

        expect(
          outputA.snapshots.length,
        ).toBeGreaterThan(1)

        expect(
          outputB.snapshots.length,
        ).toBe(
          outputA.snapshots.length,
        )

        const canonicalOutputA =
          createCanonicalHashedValue(
            outputA,
          )

        const canonicalOutputB =
          createCanonicalHashedValue(
            outputB,
          )

        expect(
          canonicalOutputA.canonicalJson,
        ).toBe(
          canonicalOutputB.canonicalJson,
        )

        expect(
          canonicalOutputA.hash,
        ).toBe(
          canonicalOutputB.hash,
        )

        expect(
          canonicalStageInputA.hash,
        ).toBe(
          '85993905d61e0cc5',
        )

        expect(
          canonicalOutputA.hash,
        ).toBe(
          '229fef0b88e36b02',
        )

        expect(
          outputA.snapshots,
        ).toHaveLength(395)

        expect(
          outputA.events,
        ).toHaveLength(98)
      },
    )
  },
)
```
