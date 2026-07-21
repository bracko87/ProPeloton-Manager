/**
 * applyMultiGroupFinish.test.ts
 *
 * Unit expectations for immutable multi-group finish application.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { applyMultiGroupFinish } from '../../simulation/applyMultiGroupFinish'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { detectMultiGroupFinishCandidates } from '../../simulation/multiGroupFinishCandidates'

const stageInput: StageInput = {
  raceId: 'apply-finish-race',
  stageId: 'apply-finish-stage',
  stageName: 'Apply Finish Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed: 'apply-finish-seed',
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

function createPartialFinishScenario() {
  const separatedState =
    createDroppedGroup({
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

  const state = {
    ...separatedState,
    raceSecond: 90,
    currentKm: 1,
    groups: {
      ...separatedState.groups,
      dropped_1: {
        ...separatedState
          .groups.dropped_1,
        distanceKm: 1,
        speedKmh: 0,
        gapFromLeaderSeconds: 0,
      },
      peloton_main: {
        ...separatedState
          .groups.peloton_main,
        distanceKm: 0.95,
        speedKmh: 40,
        gapFromLeaderSeconds: 4.5,
      },
    },
    riders: {
      ...separatedState.riders,
      'rider-a2': {
        ...separatedState
          .riders['rider-a2'],
        distanceKm: 1,
        speedKmh: 0,
      },
      'rider-b2': {
        ...separatedState
          .riders['rider-b2'],
        distanceKm: 1,
        speedKmh: 0,
      },
      'rider-a1': {
        ...separatedState
          .riders['rider-a1'],
        distanceKm: 0.95,
        speedKmh: 40,
      },
      'rider-b1': {
        ...separatedState
          .riders['rider-b1'],
        distanceKm: 0.95,
        speedKmh: 40,
      },
    },
  }

  return {
    state,
    detection:
      detectMultiGroupFinishCandidates(
        state,
      ),
  }
}

describe(
  'applyMultiGroupFinish',
  () => {
    it(
      'finishes only detected riders',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const result =
          applyMultiGroupFinish({
            state,
            detection,
          })

        expect(
          result.newlyFinishedRiderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])

        expect(
          result.state.riders[
            'rider-a2'
          ].stageStatus,
        ).toBe('finished')

        expect(
          result.state.riders[
            'rider-b2'
          ].stageStatus,
        ).toBe('finished')

        expect(
          result.state.riders[
            'rider-a1'
          ].stageStatus,
        ).toBe('racing')

        expect(
          result.state.riders[
            'rider-b1'
          ].stageStatus,
        ).toBe('racing')
      },
    )

    it(
      'deactivates only the finished group',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const result =
          applyMultiGroupFinish({
            state,
            detection,
          })

        expect(
          result.state.groups
            .dropped_1.active,
        ).toBe(false)

        expect(
          result.state.groups
            .peloton_main.active,
        ).toBe(true)

        expect(
          result.completedThisApplication,
        ).toBe(false)
      },
    )

    it(
      'creates contiguous finish positions, results, and events',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const result =
          applyMultiGroupFinish({
            state,
            detection,
          })

        expect(
          result.newResults.map(
            (entry) =>
              entry.rank,
          ),
        ).toStrictEqual([
          1,
          2,
        ])

        expect(
          result.newEvents.map(
            (event) =>
              event.eventType,
          ),
        ).toStrictEqual([
          'RIDER_FINISHED',
          'RIDER_FINISHED',
        ])

        expect(
          result.state
            .nextEventSequenceNumber,
        ).toBe(4)
      },
    )

    it(
      'preserves unfinished rider positions and the race clock',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const result =
          applyMultiGroupFinish({
            state,
            detection,
          })

        expect(
          result.state.raceSecond,
        ).toBe(90)

        expect(
          result.state.riders[
            'rider-a1'
          ].distanceKm,
        ).toBe(0.95)
      },
    )

    it(
      'does not mutate its inputs',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const stateBefore =
          JSON.stringify(state)

        const detectionBefore =
          JSON.stringify(detection)

        applyMultiGroupFinish({
          state,
          detection,
        })

        expect(
          JSON.stringify(state),
        ).toBe(stateBefore)

        expect(
          JSON.stringify(detection),
        ).toBe(detectionBefore)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const {
          state,
          detection,
        } =
          createPartialFinishScenario()

        const resultA =
          applyMultiGroupFinish({
            state,
            detection,
          })

        const resultB =
          applyMultiGroupFinish({
            state,
            detection,
          })

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)