/**
 * multiGroupFinishCandidates.test.ts
 *
 * Unit expectations for pure deterministic multi-group finish detection.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { detectMultiGroupFinishCandidates } from '../../simulation/multiGroupFinishCandidates'

const stageInput: StageInput = {
  raceId:
    'multi-group-finish-race',
  stageId:
    'multi-group-finish-stage',
  stageName:
    'Multi Group Finish Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed:
    'multi-group-finish-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds:
      30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 30,
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
        flat: 80,
        sprint: 90,
        acceleration: 88,
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
        sprint: 70,
        acceleration: 75,
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
        sprint: 85,
        acceleration: 90,
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
        sprint: 65,
        acceleration: 70,
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
      kilometre: 1,
      elevationMetres: 100,
    },
  ],
  orders: [],
}

function createSeparatedState() {
  const initialState =
    createInitialState(stageInput)

  return createDroppedGroup({
    state: initialState,
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
  'detectMultiGroupFinishCandidates',
  () => {
    it(
      'returns no candidates when no group reached the finish',
      () => {
        const state =
          createSeparatedState()

        const result =
          detectMultiGroupFinishCandidates(
            state,
          )

        expect(
          result.finishedGroupIds,
        ).toStrictEqual([])

        expect(
          result.candidates,
        ).toStrictEqual([])
      },
    )

    it(
      'returns only riders from groups that reached the finish',
      () => {
        const state =
          createSeparatedState()

        const finishState = {
          ...state,
          raceSecond: 90,
          currentKm: 1,
          groups: {
            ...state.groups,
            dropped_1: {
              ...state.groups
                .dropped_1,
              distanceKm: 1,
              gapFromLeaderSeconds: 0,
            },
            peloton_main: {
              ...state.groups
                .peloton_main,
              distanceKm: 0.95,
              gapFromLeaderSeconds: 5,
            },
          },
          riders: {
            ...state.riders,
            'rider-a2': {
              ...state.riders[
                'rider-a2'
              ],
              distanceKm: 1,
            },
            'rider-b2': {
              ...state.riders[
                'rider-b2'
              ],
              distanceKm: 1,
            },
            'rider-a1': {
              ...state.riders[
                'rider-a1'
              ],
              distanceKm: 0.95,
            },
            'rider-b1': {
              ...state.riders[
                'rider-b1'
              ],
              distanceKm: 0.95,
            },
          },
        }

        const result =
          detectMultiGroupFinishCandidates(
            finishState,
          )

        expect(
          result.finishedGroupIds,
        ).toStrictEqual([
          'dropped_1',
        ])

        expect(
          result.candidateRiderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])
      },
    )

    it(
      'uses deterministic rider tie-break ordering inside a group',
      () => {
        const state =
          createSeparatedState()

        const finishState = {
          ...state,
          raceSecond: 90,
          currentKm: 1,
          groups: {
            ...state.groups,
            peloton_main: {
              ...state.groups
                .peloton_main,
              distanceKm: 1,
              gapFromLeaderSeconds: 0,
            },
          },
          riders: {
            ...state.riders,
            'rider-a1': {
              ...state.riders[
                'rider-a1'
              ],
              distanceKm: 1,
            },
            'rider-b1': {
              ...state.riders[
                'rider-b1'
              ],
              distanceKm: 1,
            },
          },
        }

        const result =
          detectMultiGroupFinishCandidates(
            finishState,
          )

        expect(
          result.candidateRiderIds,
        ).toStrictEqual([
          'rider-a1',
          'rider-b1',
        ])
      },
    )

    it(
      'ignores riders already marked finished',
      () => {
        const state =
          createSeparatedState()

        const finishState = {
          ...state,
          raceSecond: 90,
          currentKm: 1,
          groups: {
            ...state.groups,
            dropped_1: {
              ...state.groups
                .dropped_1,
              distanceKm: 1,
            },
          },
          riders: {
            ...state.riders,
            'rider-a2': {
              ...state.riders[
                'rider-a2'
              ],
              distanceKm: 1,
              stageStatus:
                'finished' as const,
              finished: true,
            },
            'rider-b2': {
              ...state.riders[
                'rider-b2'
              ],
              distanceKm: 1,
            },
          },
        }

        const result =
          detectMultiGroupFinishCandidates(
            finishState,
          )

        expect(
          result.candidateRiderIds,
        ).toStrictEqual([
          'rider-b2',
        ])
      },
    )

    it(
      'does not mutate the source state',
      () => {
        const state =
          createSeparatedState()

        const before =
          JSON.stringify(state)

        detectMultiGroupFinishCandidates(
          state,
        )

        expect(
          JSON.stringify(state),
        ).toBe(before)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const state =
          createSeparatedState()

        const resultA =
          detectMultiGroupFinishCandidates(
            state,
          )

        const resultB =
          detectMultiGroupFinishCandidates(
            state,
          )

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)