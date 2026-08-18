
/**
 * createBreakawayGroup.test.ts
 *
 * Unit expectations for deterministic forward group separation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  StageInput,
} from '../../domain/StageInput'
import {
  createInitialState,
} from '../../simulation/createInitialState'
import {
  createBreakawayGroup,
} from '../../simulation/createBreakawayGroup'

const stageInput:
  StageInput = {
    raceId:
      'breakaway-group-race',
    stageId:
      'breakaway-group-stage',
    stageName:
      'Breakaway Group Test',
    stageFormat:
      'road_race',
    distanceKm:
      10,
    seed:
      'breakaway-group-seed',
    settings: {
      tickSeconds:
        30,
      replaySnapshotIntervalSeconds:
        30,
      maximumBreakawaySize:
        8,
      minimumSpeedKmh:
        36,
      maximumSpeedKmh:
        60,
    },
    teams: [
      {
        teamId:
          'team-a',
        teamName:
          'Team A',
        captainRiderId:
          'rider-a1',
        riderIds: [
          'rider-a1',
          'rider-a2',
        ],
      },
      {
        teamId:
          'team-b',
        teamName:
          'Team B',
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
        riderId:
          'rider-a1',
        teamId:
          'team-a',
        riderName:
          'A1',
        teamName:
          'Team A',
        role:
          'captain',
        attributes: {
          flat: 80,
          sprint: 80,
          acceleration: 90,
          stamina: 80,
          resistance: 80,
          recovery: 80,
          teamwork: 80,
        },
      },
      {
        riderId:
          'rider-a2',
        teamId:
          'team-a',
        riderName:
          'A2',
        teamName:
          'Team A',
        role:
          'rouleur',
        attributes: {
          flat: 82,
          sprint: 70,
          acceleration: 72,
          stamina: 84,
          resistance: 83,
          recovery: 80,
          teamwork: 85,
        },
      },
      {
        riderId:
          'rider-b1',
        teamId:
          'team-b',
        riderName:
          'B1',
        teamName:
          'Team B',
        role:
          'captain',
        attributes: {
          flat: 79,
          sprint: 82,
          acceleration: 88,
          stamina: 79,
          resistance: 79,
          recovery: 79,
          teamwork: 79,
        },
      },
      {
        riderId:
          'rider-b2',
        teamId:
          'team-b',
        riderName:
          'B2',
        teamName:
          'Team B',
        role:
          'domestique',
        attributes: {
          flat: 81,
          sprint: 65,
          acceleration: 68,
          stamina: 86,
          resistance: 85,
          recovery: 82,
          teamwork: 90,
        },
      },
    ],
    profilePoints: [
      {
        kilometre:
          0,
        elevationMetres:
          100,
      },
      {
        kilometre:
          10,
        elevationMetres:
          100,
      },
    ],
    orders: [],
  }

describe(
  'createBreakawayGroup',
  () => {
    it(
      'moves selected riders into a deterministic breakaway group',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const result =
          createBreakawayGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-b1',
              'rider-a1',
            ],
            speedKmh:
              50,
            initialGapSeconds:
              5,
          })

        expect(
          result.breakawayGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.movedRiderIds,
        ).toStrictEqual([
          'rider-a1',
          'rider-b1',
        ])

        expect(
          result.state.groups[
            'breakaway_1'
          ],
        ).toStrictEqual({
          groupId:
            'breakaway_1',
          groupType:
            'breakaway',
          riderIds: [
            'rider-a1',
            'rider-b1',
          ],
          distanceKm:
            0.06944444444444445,
          speedKmh:
            50,
          gapFromLeaderSeconds:
            0,
          active:
            true,
          createdAtRaceSecond:
            0,
          createdAtKm:
            0.06944444444444445,
        })

        expect(
          result.state.groups
            .peloton_main
            .riderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.state.riders[
            'rider-b1'
          ].currentGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].speedKmh,
        ).toBe(
          50,
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].distanceKm,
        ).toBe(
          0.06944444444444445,
        )

        expect(
          result.state.raceSecond,
        ).toBe(
          state.raceSecond,
        )

        expect(
          result.state.currentKm,
        ).toBe(
          state.currentKm,
        )
      },
    )

    it(
      'does not mutate the source state',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const before =
          JSON.stringify(
            state,
          )

        createBreakawayGroup({
          state,
          sourceGroupId:
            'peloton_main',
          riderIds: [
            'rider-a1',
          ],
          speedKmh:
            50,
        })

        expect(
          JSON.stringify(
            state,
          ),
        ).toBe(
          before,
        )
      },
    )

    it(
      'uses the first available deterministic breakaway ID',
      () => {
        const initialState =
          createInitialState(
            stageInput,
          )

        const first =
          createBreakawayGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a1',
            ],
            speedKmh:
              50,
          })

        const second =
          createBreakawayGroup({
            state:
              first.state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-b1',
            ],
            speedKmh:
              49,
          })

        expect(
          second.breakawayGroupId,
        ).toBe(
          'breakaway_2',
        )
      },
    )

    it(
      'rejects moving every rider out of the source group',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        expect(() =>
          createBreakawayGroup({
            state,
            sourceGroupId:
              'peloton_main',
            riderIds:
              state.groups
                .peloton_main
                .riderIds,
            speedKmh:
              50,
          }),
        ).toThrow(
          'at least one rider must remain',
        )
      },
    )

    it(
      'rejects riders outside the source group',
      () => {
        const initialState =
          createInitialState(
            stageInput,
          )

        const first =
          createBreakawayGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a1',
            ],
            speedKmh:
              50,
          })

        expect(() =>
          createBreakawayGroup({
            state:
              first.state,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a1',
            ],
            speedKmh:
              50,
          }),
        ).toThrow(
          'is not in source group',
        )
      },
    )
  },
)

