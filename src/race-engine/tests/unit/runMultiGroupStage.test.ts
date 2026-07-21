/**
 * runMultiGroupStage.test.ts
 *
 * Unit expectations for deterministic full-stage multi-group execution.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createInitialState } from '../../simulation/createInitialState'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { runMultiGroupStage } from '../../simulation/runMultiGroupStage'

const stageInput: StageInput = {
  raceId:
    'multi-group-stage-race',
  stageId:
    'multi-group-stage-stage',
  stageName:
    'Multi Group Full Stage Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed:
    'multi-group-stage-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds:
      30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 36,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Team A',
      captainRiderId:
        'rider-a1',
      riderIds: [
        'rider-a1',
        'rider-a2',
      ],
    },
    {
      teamId: 'team-b',
      teamName: 'Team B',
      captainRiderId:
        'rider-b1',
      riderIds: [
        'rider-b1',
        'rider-b2',
      ],
    },
  ],
  riders: [
    {
      riderId: 'rider-a1',
      teamId: 'team-a',
      riderName: 'A1',
      teamName: 'Team A',
      role: 'captain',
      attributes: {
        flat: 75,
        sprint: 90,
        acceleration: 88,
        stamina: 74,
        resistance: 72,
        recovery: 70,
        teamwork: 78,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'rouleur',
      attributes: {
        flat: 86,
        sprint: 68,
        acceleration: 70,
        stamina: 84,
        resistance: 83,
        recovery: 78,
        teamwork: 82,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 78,
        sprint: 87,
        acceleration: 91,
        stamina: 76,
        resistance: 74,
        recovery: 73,
        teamwork: 77,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 82,
        sprint: 64,
        acceleration: 65,
        stamina: 87,
        resistance: 86,
        recovery: 81,
        teamwork: 89,
      },
    },
  ],
  profilePoints: [
    {
      kilometre: 0,
      elevationMetres: 100,
    },
    {
      kilometre: 0.3,
      elevationMetres: 100,
    },
    {
      kilometre: 0.7,
      elevationMetres: 120,
    },
    {
      kilometre: 1,
      elevationMetres: 105,
    },
  ],
  orders: [],
}

function createSeparatedState() {
  return createDroppedGroup({
    state:
      createInitialState(
        stageInput,
      ),
    sourceGroupId:
      'peloton_main',
    riderIds: [
      'rider-a2',
      'rider-b2',
    ],
    speedKmh: 34,
  }).state
}

describe(
  'runMultiGroupStage',
  () => {
    it(
      'runs until every rider finishes',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.completed,
        ).toBe(true)

        expect(
          result.finalState
            .completed,
        ).toBe(true)

        expect(
          Object.values(
            result.finalState
              .riders,
          ).every(
            (rider) =>
              rider.stageStatus ===
              'finished',
          ),
        ).toBe(true)
      },
    )

    it(
      'collects contiguous ordered results',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.results.map(
            (entry) =>
              entry.rank,
          ),
        ).toStrictEqual([
          1,
          2,
          3,
          4,
        ])

        expect(
          result.results,
        ).toHaveLength(4)
      },
    )

    it(
      'returns a complete tick trace',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.tickCount,
        ).toBe(
          result.ticks.length,
        )

        expect(
          result.tickCount,
        ).toBeGreaterThan(0)

        expect(
          result.ticks[
            result.ticks.length - 1
          ].state.completed,
        ).toBe(true)
      },
    )

    it(
      'captures the initial state and every replay boundary',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.replaySnapshots
            .map(
              (snapshot) =>
                snapshot.raceSecond,
            ),
        ).toStrictEqual([
          0,
          30,
          60,
          90,
          120,
        ])

        expect(
          result.replaySnapshots
            .map(
              (snapshot) =>
                snapshot.sequenceNumber,
            ),
        ).toStrictEqual([
          1,
          2,
          3,
          4,
          5,
        ])
      },
    )

    it(
      'captures a completed final replay snapshot',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        const finalSnapshot =
          result.replaySnapshots[
            result.replaySnapshots
              .length - 1
          ]

        expect(
          finalSnapshot.completed,
        ).toBe(true)

        expect(
          finalSnapshot.raceSecond,
        ).toBe(
          result.finalState
            .raceSecond,
        )
      },
    )

    it(
      'creates a deterministic replay collection',
      () => {
        const state =
          createSeparatedState()

        const resultA =
          runMultiGroupStage(
            state,
          )

        const resultB =
          runMultiGroupStage(
            state,
          )

        expect(
          resultA.replayCollection,
        ).toStrictEqual(
          resultB.replayCollection,
        )

        expect(
          resultA.replayCollection
            .deterministicHash,
        ).toBe(
          resultB.replayCollection
            .deterministicHash,
        )
      },
    )


    it(
      'creates canonical full-stage output',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.canonicalJson.length,
        ).toBeGreaterThan(0)

        expect(
          result.deterministicHash
            .length,
        ).toBeGreaterThan(0)

        expect(
          JSON.parse(
            result.canonicalJson,
          ),
        ).toMatchObject({
          raceId:
            'multi-group-stage-race',
          stageId:
            'multi-group-stage-stage',
          seed:
            'multi-group-stage-seed',
          completed: true,
          tickCount:
            result.tickCount,
        })
      },
    )

    it(
      'creates identical canonical output for identical input',
      () => {
        const state =
          createSeparatedState()

        const resultA =
          runMultiGroupStage(
            state,
          )

        const resultB =
          runMultiGroupStage(
            state,
          )

        expect(
          resultA.canonicalJson,
        ).toBe(
          resultB.canonicalJson,
        )

        expect(
          resultA.deterministicHash,
        ).toBe(
          resultB.deterministicHash,
        )
      },
    )

    it(
      'creates one simulation-completed event',
      () => {
        const result =
          runMultiGroupStage(
            createSeparatedState(),
          )

        expect(
          result.events.filter(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          ),
        ).toHaveLength(1)
      },
    )

    it(
      'does not mutate its initial state',
      () => {
        const initialState =
          createSeparatedState()

        const before =
          JSON.stringify(
            initialState,
          )

        runMultiGroupStage(
          initialState,
        )

        expect(
          JSON.stringify(
            initialState,
          ),
        ).toBe(before)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const initialState =
          createSeparatedState()

        const resultA =
          runMultiGroupStage(
            initialState,
          )

        const resultB =
          runMultiGroupStage(
            initialState,
          )

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'enforces the maximum tick safety bound',
      () => {
        expect(() =>
          runMultiGroupStage(
            createSeparatedState(),
            {
              maximumTickCount: 1,
            },
          ),
        ).toThrow(
          'exceeded maximumTickCount',
        )
      },
    )

    it(
      'rejects an already completed initial state',
      () => {
        const completedState = {
          ...createSeparatedState(),
          completed: true,
        }

        expect(() =>
          runMultiGroupStage(
            completedState,
          ),
        ).toThrow(
          'initial state is already completed',
        )
      },
    )
  },
)
