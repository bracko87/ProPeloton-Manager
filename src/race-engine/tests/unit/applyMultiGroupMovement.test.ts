/**
 * applyMultiGroupMovement.test.ts
 *
 * Unit expectations for immutable multi-group movement application.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { applyMultiGroupMovement } from '../../simulation/applyMultiGroupMovement'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { calculateMultiGroupMovement } from '../../simulation/multiGroupMovement'

const stageInput: StageInput = {
  raceId: 'apply-movement-race',
  stageId: 'apply-movement-stage',
  stageName: 'Apply Movement Test',
  stageFormat: 'road_race',
  distanceKm: 10,
  seed: 'apply-movement-seed',
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

function createScenario() {
  const initialState =
    createInitialState(stageInput)

  const state =
    createDroppedGroup({
      state: initialState,
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-a2',
        'rider-b2',
      ],
      speedKmh: 34,
    }).state

  const movement =
    calculateMultiGroupMovement(
      state,
    )

  return {
    state,
    movement,
  }
}

describe(
  'applyMultiGroupMovement',
  () => {
    it(
      'applies group positions, speeds, and gaps',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        const result =
          applyMultiGroupMovement({
            state,
            movement,
          })

        for (
          const proposal of
          movement.proposals
        ) {
          const group =
            result.state.groups[
              proposal.groupId
            ]

          expect(
            group.distanceKm,
          ).toBe(
            proposal.nextDistanceKm,
          )

          expect(
            group.speedKmh,
          ).toBe(
            proposal.appliedSpeedKmh,
          )

          expect(
            group.gapFromLeaderSeconds,
          ).toBe(
            proposal.gapFromLeaderSeconds,
          )
        }
      },
    )

    it(
      'applies each group position to its racing riders',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        const result =
          applyMultiGroupMovement({
            state,
            movement,
          })

        for (
          const proposal of
          movement.proposals
        ) {
          for (
            const riderId of
            proposal.riderIds
          ) {
            expect(
              result.state.riders[
                riderId
              ].distanceKm,
            ).toBe(
              proposal.nextDistanceKm,
            )

            expect(
              result.state.riders[
                riderId
              ].speedKmh,
            ).toBe(
              proposal.appliedSpeedKmh,
            )
          }
        }
      },
    )

    it(
      'advances the clock and leader position once',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        const result =
          applyMultiGroupMovement({
            state,
            movement,
          })

        expect(
          result.state.raceSecond,
        ).toBe(30)

        expect(
          result.state.currentKm,
        ).toBe(
          movement.leaderDistanceKm,
        )
      },
    )

    it(
      'does not mutate its inputs',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        const stateBefore =
          JSON.stringify(state)

        const movementBefore =
          JSON.stringify(movement)

        applyMultiGroupMovement({
          state,
          movement,
        })

        expect(
          JSON.stringify(state),
        ).toBe(stateBefore)

        expect(
          JSON.stringify(movement),
        ).toBe(movementBefore)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        const resultA =
          applyMultiGroupMovement({
            state,
            movement,
          })

        const resultB =
          applyMultiGroupMovement({
            state,
            movement,
          })

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'rejects incomplete proposals',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        expect(() =>
          applyMultiGroupMovement({
            state,
            movement: {
              ...movement,
              proposals:
                movement.proposals.slice(
                  0,
                  1,
                ),
            },
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a mismatched tick duration',
      () => {
        const {
          state,
          movement,
        } = createScenario()

        expect(() =>
          applyMultiGroupMovement({
            state,
            movement: {
              ...movement,
              tickSeconds: 60,
            },
          }),
        ).toThrow()
      },
    )
  },
)