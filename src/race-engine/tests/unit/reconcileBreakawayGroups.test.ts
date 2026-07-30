/**
 * reconcileBreakawayGroups.test.ts
 *
 * Unit expectations for deterministic breakaway merging and peloton
 * reabsorption.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  SimulationState,
} from '../../domain/SimulationState'
import type {
  StageInput,
} from '../../domain/StageInput'
import {
  createInitialState,
} from '../../simulation/createInitialState'
import {
  createBreakawayGroup,
} from '../../simulation/createBreakawayGroup'
import {
  reconcileBreakawayGroups,
} from '../../simulation/reconcileBreakawayGroups'

const stageInput:
  StageInput = {
    raceId:
      'breakaway-reconciliation-race',
    stageId:
      'breakaway-reconciliation-stage',
    stageName:
      'Breakaway Reconciliation Test',
    stageFormat:
      'road_race',
    distanceKm:
      10,
    seed:
      'breakaway-reconciliation-seed',
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
          'rider-a3',
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
          'rider-a3',
        teamId:
          'team-a',
        riderName:
          'A3',
        teamName:
          'Team A',
        role:
          'domestique',
        attributes: {
          flat: 78,
          sprint: 68,
          acceleration: 75,
          stamina: 82,
          resistance: 81,
          recovery: 79,
          teamwork: 84,
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

function createFourBreakawayState():
  SimulationState {
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
        44.2,
    })

  const second =
    createBreakawayGroup({
      state:
        first.state,
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-a2',
      ],
      speedKmh:
        43.7,
    })

  const third =
    createBreakawayGroup({
      state:
        second.state,
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-b1',
      ],
      speedKmh:
        42.5,
    })

  const fourth =
    createBreakawayGroup({
      state:
        third.state,
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-b2',
      ],
      speedKmh:
        41.2,
    })

  const groupValues = {
    breakaway_1: {
      distanceKm:
        1.2,
      speedKmh:
        44.2,
      gapFromLeaderSeconds:
        0,
    },
    breakaway_2: {
      distanceKm:
        1.19,
      speedKmh:
        43.7,
      gapFromLeaderSeconds:
        1,
    },
    breakaway_3: {
      distanceKm:
        1.17,
      speedKmh:
        42.5,
      gapFromLeaderSeconds:
        4,
    },
    breakaway_4: {
      distanceKm:
        1.15,
      speedKmh:
        41.2,
      gapFromLeaderSeconds:
        7,
    },
  } as const

  const nextGroups = {
    ...fourth.state.groups,

    peloton_main: {
      ...fourth.state
        .groups
        .peloton_main,
      distanceKm:
        1.1,
      speedKmh:
        42,
      gapFromLeaderSeconds:
        9,
    },

    breakaway_1: {
      ...fourth.state
        .groups[
          'breakaway_1'
        ],
      ...groupValues
        .breakaway_1,
    },

    breakaway_2: {
      ...fourth.state
        .groups[
          'breakaway_2'
        ],
      ...groupValues
        .breakaway_2,
    },

    breakaway_3: {
      ...fourth.state
        .groups[
          'breakaway_3'
        ],
      ...groupValues
        .breakaway_3,
    },

    breakaway_4: {
      ...fourth.state
        .groups[
          'breakaway_4'
        ],
      ...groupValues
        .breakaway_4,
    },
  }

  const nextRiders =
    Object.fromEntries(
      Object.entries(
        fourth.state.riders,
      ).map(
        (
          [
            riderId,
            rider,
          ],
        ) => {
          const currentGroupId =
            rider.currentGroupId

          if (
            !currentGroupId
          ) {
            return [
              riderId,
              rider,
            ]
          }

          const group =
            nextGroups[
              currentGroupId
            ]

          return [
            riderId,
            {
              ...rider,
              distanceKm:
                group.distanceKm,
              speedKmh:
                group.speedKmh,
            },
          ]
        },
      ),
    )

  return {
    ...fourth.state,
    currentKm:
      1.2,
    groups:
      nextGroups,
    riders:
      nextRiders,
  }
}

function createCaughtBreakawayState():
  SimulationState {
  const initialState =
    createInitialState(
      stageInput,
    )

  const separated =
    createBreakawayGroup({
      state:
        initialState,
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-a1',
      ],
      speedKmh:
        41,
    })

  return {
    ...separated.state,
    currentKm:
      1,
    groups: {
      ...separated.state.groups,

      peloton_main: {
        ...separated.state
          .groups
          .peloton_main,
        distanceKm:
          1,
        speedKmh:
          42,
        gapFromLeaderSeconds:
          0,
      },

      breakaway_1: {
        ...separated.state
          .groups[
            'breakaway_1'
          ],
        distanceKm:
          0.99,
        speedKmh:
          41,
        gapFromLeaderSeconds:
          1,
      },
    },
    riders: {
      ...separated.state.riders,

      'rider-a1': {
        ...separated.state
          .riders[
            'rider-a1'
          ],
        distanceKm:
          0.99,
        speedKmh:
          41,
      },

      'rider-a2': {
        ...separated.state
          .riders[
            'rider-a2'
          ],
        distanceKm:
          1,
        speedKmh:
          42,
      },

      'rider-a3': {
        ...separated.state
          .riders[
            'rider-a3'
          ],
        distanceKm:
          1,
        speedKmh:
          42,
      },

      'rider-b1': {
        ...separated.state
          .riders[
            'rider-b1'
          ],
        distanceKm:
          1,
        speedKmh:
          42,
      },

      'rider-b2': {
        ...separated.state
          .riders[
            'rider-b2'
          ],
        distanceKm:
          1,
        speedKmh:
          42,
      },
    },
  }
}

describe(
  'reconcileBreakawayGroups',
  () => {
    it(
      'merges breakaways within ten seconds into the foremost breakaway',
      () => {
        const state =
          createFourBreakawayState()

        const result =
          reconcileBreakawayGroups(
            state,
          )

        expect(
          result.changed,
        ).toBe(
          true,
        )

        expect(
          result
            .mergedBreakawayGroupIds,
        ).toStrictEqual([
          'breakaway_2',
          'breakaway_3',
          'breakaway_4',
        ])

        expect(
          result
            .survivingBreakawayGroupIds,
        ).toStrictEqual([
          'breakaway_1',
        ])

        expect(
          result.state.groups[
            'breakaway_1'
          ].riderIds,
        ).toStrictEqual([
          'rider-a1',
          'rider-a2',
          'rider-b1',
          'rider-b2',
        ])

        expect(
          result.state.groups[
            'breakaway_1'
          ].distanceKm,
        ).toBe(
          1.2,
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].speedKmh,
        ).toBe(
          44.2,
        )

        for (
          const riderId of
          [
            'rider-a1',
            'rider-a2',
            'rider-b1',
            'rider-b2',
          ]
        ) {
          expect(
            result.state.riders[
              riderId
            ].currentGroupId,
          ).toBe(
            'breakaway_1',
          )

          expect(
            result.state.riders[
              riderId
            ].distanceKm,
          ).toBe(
            1.2,
          )

          expect(
            result.state.riders[
              riderId
            ].speedKmh,
          ).toBe(
            44.2,
          )
        }

        for (
          const groupId of
          [
            'breakaway_2',
            'breakaway_3',
            'breakaway_4',
          ]
        ) {
          expect(
            result.state.groups[
              groupId
            ].active,
          ).toBe(
            false,
          )

          expect(
            result.state.groups[
              groupId
            ].riderIds,
          ).toStrictEqual([])
        }
      },
    )

    it(
      'reabsorbs a breakaway that is at or behind the peloton',
      () => {
        const state =
          createCaughtBreakawayState()

        const result =
          reconcileBreakawayGroups(
            state,
          )

        expect(
          result
            .reabsorbedBreakawayGroupIds,
        ).toStrictEqual([
          'breakaway_1',
        ])

        expect(
          result.state.groups[
            'breakaway_1'
          ].active,
        ).toBe(
          false,
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].riderIds,
        ).toStrictEqual([])

        expect(
          result.state.groups
            .peloton_main
            .riderIds,
        ).toContain(
          'rider-a1',
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'peloton_main',
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].distanceKm,
        ).toBe(
          1,
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].speedKmh,
        ).toBe(
          42,
        )
      },
    )


    it(
      'reabsorbs a dropped group within five seconds of the peloton',
      () => {
        const state =
          createCaughtBreakawayState()

        const nextState:
          SimulationState = {
          ...state,
          groups: {
            ...state.groups,
            breakaway_1: {
              ...state.groups[
                'breakaway_1'
              ],
              groupType:
                'dropped',
              distanceKm:
                0.99,
              gapFromLeaderSeconds:
                4,
            },
          },
        }

        const result =
          reconcileBreakawayGroups(
            nextState,
          )

        expect(
          result
            .reabsorbedBreakawayGroupIds,
        ).toStrictEqual([
          'breakaway_1',
        ])

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'peloton_main',
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].active,
        ).toBe(
          false,
        )
      },
    )

    it(
      'keeps a dropped group more than five seconds behind the peloton',
      () => {
        const state =
          createCaughtBreakawayState()

        const nextState:
          SimulationState = {
          ...state,
          groups: {
            ...state.groups,
            breakaway_1: {
              ...state.groups[
                'breakaway_1'
              ],
              groupType:
                'dropped',
              distanceKm:
                0.9,
              gapFromLeaderSeconds:
                12,
            },
          },
          riders: {
            ...state.riders,
            'rider-a1': {
              ...state.riders[
                'rider-a1'
              ],
              distanceKm:
                0.9,
              speedKmh:
                state.groups[
                  'breakaway_1'
                ].speedKmh,
            },
          },
        }

        const result =
          reconcileBreakawayGroups(
            nextState,
          )

        expect(
          result.changed,
        ).toBe(
          false,
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].groupType,
        ).toBe(
          'dropped',
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'breakaway_1',
        )
      },
    )

    it(
      'reclassifies a dropped group ahead of the peloton as chase',
      () => {
        const state =
          createCaughtBreakawayState()

        const nextState:
          SimulationState = {
          ...state,
          groups: {
            ...state.groups,
            breakaway_1: {
              ...state.groups[
                'breakaway_1'
              ],
              groupType:
                'dropped',
              distanceKm:
                1.1,
              gapFromLeaderSeconds:
                8,
            },
          },
          riders: {
            ...state.riders,
            'rider-a1': {
              ...state.riders[
                'rider-a1'
              ],
              distanceKm:
                1.1,
              speedKmh:
                state.groups[
                  'breakaway_1'
                ].speedKmh,
            },
          },
        }

        const result =
          reconcileBreakawayGroups(
            nextState,
          )

        expect(
          result
            .reclassifiedDroppedGroupIds,
        ).toStrictEqual([
          'breakaway_1',
        ])

        expect(
          result.state.groups[
            'breakaway_1'
          ].groupType,
        ).toBe(
          'chase',
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].active,
        ).toBe(
          true,
        )
      },
    )

    it(
      'does not mutate the supplied state',
      () => {
        const state =
          createFourBreakawayState()

        const before =
          JSON.stringify(
            state,
          )

        reconcileBreakawayGroups(
          state,
        )

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
      'returns identical output for identical input',
      () => {
        const state =
          createFourBreakawayState()

        const resultA =
          reconcileBreakawayGroups(
            state,
          )

        const resultB =
          reconcileBreakawayGroups(
            state,
          )

        expect(
          resultA,
        ).toStrictEqual(
          resultB,
        )
      },
    )
  },
)