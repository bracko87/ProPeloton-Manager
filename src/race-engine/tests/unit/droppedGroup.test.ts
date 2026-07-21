/**
 * droppedGroup.test.ts
 *
 * Unit expectations for deterministic dropped-group creation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { SimulationState } from '../../domain/SimulationState'
import { createInitialState } from '../../simulation/createInitialState'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import type { StageInput } from '../../domain/StageInput'

const stageInput: StageInput = {
  raceId: 'drop-test-race',
  stageId: 'drop-test-stage',
  stageName: 'Dropped Group Test',
  stageFormat: 'road_race',
  distanceKm: 10,
  seed: 'drop-test-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds: 30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 30,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Team A',
      captainRiderId: 'rider-a1',
      riderIds: [
        'rider-a1',
        'rider-a2',
      ],
    },
    {
      teamId: 'team-b',
      teamName: 'Team B',
      captainRiderId: 'rider-b1',
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
        flat: 80,
        sprint: 80,
        acceleration: 80,
        stamina: 80,
        resistance: 80,
        recovery: 80,
        teamwork: 80,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'domestique',
      attributes: {
        flat: 80,
        sprint: 80,
        acceleration: 80,
        stamina: 80,
        resistance: 80,
        recovery: 80,
        teamwork: 80,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 80,
        sprint: 80,
        acceleration: 80,
        stamina: 80,
        resistance: 80,
        recovery: 80,
        teamwork: 80,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 80,
        sprint: 80,
        acceleration: 80,
        stamina: 80,
        resistance: 80,
        recovery: 80,
        teamwork: 80,
      },
    },
  ],
  profilePoints: [
    {
      kilometre: 0,
      elevationMetres: 100,
    },
    {
      kilometre: 10,
      elevationMetres: 100,
    },
  ],
  orders: [],
}

function createTestState(): SimulationState {
  return createInitialState(stageInput)
}

describe(
  'createDroppedGroup',
  () => {
    it(
      'creates a deterministic dropped group',
      () => {
        const state = createTestState()

        const result =
          createDroppedGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-b2',
              'rider-a2',
            ],
            speedKmh: 35,
          })

        expect(
          result.droppedGroupId,
        ).toBe('dropped_1')

        expect(
          result.movedRiderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])

        expect(
          result.droppedGroup.riderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])

        expect(
          result.sourceGroup.riderIds,
        ).toStrictEqual([
          'rider-a1',
          'rider-b1',
        ])

        expect(
          result.state.nextDroppedGroupNumber,
        ).toBe(2)
      },
    )

    it(
      'updates moved rider membership and speed',
      () => {
        const state = createTestState()

        const result =
          createDroppedGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: ['rider-a2'],
            speedKmh: 34,
          })

        expect(
          result.state.riders[
            'rider-a2'
          ].currentGroupId,
        ).toBe('dropped_1')

        expect(
          result.state.riders[
            'rider-a2'
          ].speedKmh,
        ).toBe(34)

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe('peloton_main')
      },
    )

    it(
      'preserves the input state',
      () => {
        const state = createTestState()

        createDroppedGroup({
          state,
          sourceGroupId:
            'peloton_main',
          riderIds: ['rider-a2'],
          speedKmh: 34,
        })

        expect(
          state.groups.peloton_main
            .riderIds,
        ).toStrictEqual([
          'rider-a1',
          'rider-a2',
          'rider-b1',
          'rider-b2',
        ])

        expect(
          state.groups.dropped_1,
        ).toBeUndefined()

        expect(
          state.nextDroppedGroupNumber,
        ).toBe(1)
      },
    )

    it(
      'uses the source position and current race time',
      () => {
        const state = createTestState()

        const transformedState: SimulationState = {
          ...state,
          raceSecond: 120,
          currentKm: 2,
          groups: {
            ...state.groups,
            peloton_main: {
              ...state.groups.peloton_main,
              distanceKm: 2,
              speedKmh: 40,
            },
          },
          riders:
            Object.fromEntries(
              Object.entries(
                state.riders,
              ).map(
                ([riderId, rider]) => [
                  riderId,
                  {
                    ...rider,
                    distanceKm: 2,
                    speedKmh: 40,
                  },
                ],
              ),
            ),
        }

        const result =
          createDroppedGroup({
            state: transformedState,
            sourceGroupId:
              'peloton_main',
            riderIds: ['rider-b2'],
            speedKmh: 36,
          })

        expect(
          result.droppedGroup.distanceKm,
        ).toBe(2)

        expect(
          result.droppedGroup.createdAtKm,
        ).toBe(2)

        expect(
          result.droppedGroup
            .createdAtRaceSecond,
        ).toBe(120)
      },
    )

    it(
      'rejects duplicate rider IDs',
      () => {
        const state = createTestState()

        expect(() =>
          createDroppedGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
              'rider-a2',
            ],
            speedKmh: 34,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects riders outside the source group',
      () => {
        const state = createTestState()

        expect(() =>
          createDroppedGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'missing-rider',
            ],
            speedKmh: 34,
          }),
        ).toThrow()
      },
    )

    it(
      'does not allow the source group to become empty',
      () => {
        const state = createTestState()

        expect(() =>
          createDroppedGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a1',
              'rider-a2',
              'rider-b1',
              'rider-b2',
            ],
            speedKmh: 34,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a completed simulation',
      () => {
        const state = createTestState()

        expect(() =>
          createDroppedGroup({
            state: {
              ...state,
              completed: true,
            },
            sourceGroupId:
              'peloton_main',
            riderIds: ['rider-a2'],
            speedKmh: 34,
          }),
        ).toThrow()
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const state = createTestState()

        const input = {
          state,
          sourceGroupId:
            'peloton_main',
          riderIds: [
            'rider-b2',
            'rider-a2',
          ],
          speedKmh: 35,
        } as const

        const resultA =
          createDroppedGroup(input)

        const resultB =
          createDroppedGroup(input)

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)
