/**
 * multiGroupMovement.test.ts
 *
 * Unit expectations for deterministic multi-group movement proposals.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { calculateMultiGroupMovement } from '../../simulation/multiGroupMovement'

const stageInput: StageInput = {
  raceId: 'multi-group-test-race',
  stageId: 'multi-group-test-stage',
  stageName: 'Multi Group Movement Test',
  stageFormat: 'road_race',
  distanceKm: 10,
  seed: 'multi-group-test-seed',
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
        flat: 90,
        sprint: 80,
        acceleration: 80,
        stamina: 90,
        resistance: 90,
        recovery: 90,
        teamwork: 90,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'domestique',
      attributes: {
        flat: 60,
        sprint: 60,
        acceleration: 60,
        stamina: 60,
        resistance: 60,
        recovery: 60,
        teamwork: 60,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 88,
        sprint: 80,
        acceleration: 80,
        stamina: 88,
        resistance: 88,
        recovery: 88,
        teamwork: 88,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 58,
        sprint: 58,
        acceleration: 58,
        stamina: 58,
        resistance: 58,
        recovery: 58,
        teamwork: 58,
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

function createMultiGroupState() {
  const initialState =
    createInitialState(stageInput)

  return createDroppedGroup({
    state: initialState,
    sourceGroupId: 'peloton_main',
    riderIds: [
      'rider-a2',
      'rider-b2',
    ],
    speedKmh: 34,
  }).state
}

describe(
  'calculateMultiGroupMovement',
  () => {
    it(
      'returns one proposal per active group in stable order',
      () => {
        const result =
          calculateMultiGroupMovement(
            createMultiGroupState(),
          )

        expect(
          result.proposals.map(
            (proposal) =>
              proposal.groupId,
          ),
        ).toStrictEqual([
          'dropped_1',
          'peloton_main',
        ])
      },
    )

    it(
      'moves the stronger peloton farther than the dropped group',
      () => {
        const result =
          calculateMultiGroupMovement(
            createMultiGroupState(),
          )

        const dropped =
          result.proposals.find(
            (proposal) =>
              proposal.groupId ===
              'dropped_1',
          )

        const peloton =
          result.proposals.find(
            (proposal) =>
              proposal.groupId ===
              'peloton_main',
          )

        expect(dropped).toBeDefined()
        expect(peloton).toBeDefined()

        expect(
          peloton!.nextDistanceKm,
        ).toBeGreaterThan(
          dropped!.nextDistanceKm,
        )

        expect(
          result.leaderGroupId,
        ).toBe('peloton_main')

        expect(
          dropped!.gapFromLeaderSeconds,
        ).toBeGreaterThan(0)

        expect(
          peloton!.gapFromLeaderSeconds,
        ).toBe(0)
      },
    )

    it(
      'does not mutate the input state',
      () => {
        const state =
          createMultiGroupState()

        const before =
          JSON.stringify(state)

        calculateMultiGroupMovement(
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
          createMultiGroupState()

        const resultA =
          calculateMultiGroupMovement(
            state,
          )

        const resultB =
          calculateMultiGroupMovement(
            state,
          )

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'clamps movement at the stage distance',
      () => {
        const state =
          createMultiGroupState()

        const nearFinishState = {
          ...state,
          currentKm: 9.99,
          groups:
            Object.fromEntries(
              Object.entries(
                state.groups,
              ).map(
                ([groupId, group]) => [
                  groupId,
                  {
                    ...group,
                    distanceKm: 9.99,
                  },
                ],
              ),
            ),
          riders:
            Object.fromEntries(
              Object.entries(
                state.riders,
              ).map(
                ([riderId, rider]) => [
                  riderId,
                  {
                    ...rider,
                    distanceKm: 9.99,
                  },
                ],
              ),
            ),
        }

        const result =
          calculateMultiGroupMovement(
            nearFinishState,
          )

        for (
          const proposal of
          result.proposals
        ) {
          expect(
            proposal.nextDistanceKm,
          ).toBeLessThanOrEqual(10)
        }
      },
    )
  },
)