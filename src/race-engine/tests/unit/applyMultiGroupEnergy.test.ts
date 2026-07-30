/**
 * applyMultiGroupEnergy.test.ts
 *
 * Unit expectations for deterministic group-aware rider-energy application.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { applyMultiGroupEnergy } from '../../simulation/applyMultiGroupEnergy'
import { applyMultiGroupMovement } from '../../simulation/applyMultiGroupMovement'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { calculateMultiGroupMovement } from '../../simulation/multiGroupMovement'

const stageInput: StageInput = {
  raceId:
    'multi-group-energy-race',
  stageId:
    'multi-group-energy-stage',
  stageName:
    'Multi Group Energy Test',
  stageFormat: 'road_race',
  distanceKm: 10,
  seed:
    'multi-group-energy-seed',
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

  const separatedState =
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
      separatedState,
    )

  const movedState =
    applyMultiGroupMovement({
      state:
        separatedState,
      movement,
    }).state

  return {
    movement,
    movedState,
  }
}

describe(
  'applyMultiGroupEnergy',
  () => {
    it(
      'reduces energy for every racing rider',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const result =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        expect(
          result.applications,
        ).toHaveLength(4)

        for (
          const application of
          result.applications
        ) {
          expect(
            application.energyCost,
          ).toBeGreaterThan(0)

          expect(
            application.nextEnergy,
          ).toBeLessThan(
            application.previousEnergy,
          )

          expect(
            result.state.riders[
              application.riderId
            ].energy,
          ).toBe(
            application.nextEnergy,
          )
        }
      },
    )

    it(
      'returns applications in stable rider-ID order',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const result =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        expect(
          result.applications.map(
            (application) =>
              application.riderId,
          ),
        ).toStrictEqual([
          'rider-a1',
          'rider-a2',
          'rider-b1',
          'rider-b2',
        ])
      },
    )

    it(
      'does not move riders or advance the clock',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const result =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        expect(
          result.state.raceSecond,
        ).toBe(
          movedState.raceSecond,
        )

        expect(
          result.state.currentKm,
        ).toBe(
          movedState.currentKm,
        )
      },
    )

    it(
      'does not mutate its inputs',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const stateBefore =
          JSON.stringify(
            movedState,
          )

        const movementBefore =
          JSON.stringify(
            movement,
          )

        applyMultiGroupEnergy({
          state:
            movedState,
          movement,
        })

        expect(
          JSON.stringify(
            movedState,
          ),
        ).toBe(stateBefore)

        expect(
          JSON.stringify(
            movement,
          ),
        ).toBe(
          movementBefore,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const resultA =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        const resultB =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'reduces energy cost when group shelter is enabled',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const withoutShelter =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        const withShelter =
          applyMultiGroupEnergy({
            state: {
              ...movedState,
              groupShelterEnergyEnabled:
                true,
            },
            movement,
          })

        for (
          const shelteredApplication of
          withShelter.applications
        ) {
          const baselineApplication =
            withoutShelter
              .applications
              .find(
                (
                  application,
                ) =>
                  application
                    .riderId ===
                  shelteredApplication
                    .riderId,
              )

          expect(
            baselineApplication,
          ).toBeDefined()

          expect(
            shelteredApplication
              .energyCost,
          ).toBeLessThan(
            baselineApplication!
              .energyCost,
          )

          expect(
            shelteredApplication
              .nextEnergy,
          ).toBeGreaterThan(
            baselineApplication!
              .nextEnergy,
          )
        }
      },
    )

    it(
      'exposes shelter diagnostics only when shelter is enabled',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        const withoutShelter =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        const withShelter =
          applyMultiGroupEnergy({
            state: {
              ...movedState,
              groupShelterEnergyEnabled:
                true,
            },
            movement,
          })

        for (
          const application of
          withoutShelter
            .applications
        ) {
          expect(
            application
              .shelterBonus,
          ).toBeUndefined()

          expect(
            application
              .shelterResult,
          ).toBeUndefined()
        }

        for (
          const application of
          withShelter
            .applications
        ) {
          expect(
            application
              .shelterBonus,
          ).toBeGreaterThan(
            0,
          )

          expect(
            application
              .shelterMultiplier,
          ).toBeLessThan(
            1,
          )

          expect(
            application
              .energyCostBeforeShelter,
          ).toBeGreaterThan(
            application
              .energyCost,
          )

          expect(
            application
              .shelterEnergySaved,
          ).toBeGreaterThan(
            0,
          )

          expect(
            application
              .shelterResult,
          ).toBeDefined()
        }
      },
    )

    it(
      'does not reduce energy for a solo rider group',
      () => {
        const initialState =
          createInitialState(
            stageInput,
          )

        const separatedState =
          createDroppedGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
            ],
            speedKmh:
              34,
          }).state

        const movement =
          calculateMultiGroupMovement(
            separatedState,
          )

        const movedState =
          applyMultiGroupMovement({
            state:
              separatedState,
            movement,
          }).state

        const withoutShelter =
          applyMultiGroupEnergy({
            state:
              movedState,
            movement,
          })

        const withShelter =
          applyMultiGroupEnergy({
            state: {
              ...movedState,
              groupShelterEnergyEnabled:
                true,
            },
            movement,
          })

        const baselineApplication =
          withoutShelter
            .applications
            .find(
              (
                application,
              ) =>
                application
                  .riderId ===
                'rider-a2',
            )

        const shelteredApplication =
          withShelter
            .applications
            .find(
              (
                application,
              ) =>
                application
                  .riderId ===
                'rider-a2',
            )

        expect(
          baselineApplication,
        ).toBeDefined()

        expect(
          shelteredApplication,
        ).toBeDefined()

        expect(
          shelteredApplication!
            .shelterBonus,
        ).toBe(
          0,
        )

        expect(
          shelteredApplication!
            .shelterMultiplier,
        ).toBe(
          1,
        )

        expect(
          shelteredApplication!
            .shelterEnergySaved,
        ).toBe(
          0,
        )

        expect(
          shelteredApplication!
            .energyCost,
        ).toBe(
          baselineApplication!
            .energyCost,
        )

        expect(
          shelteredApplication!
            .nextEnergy,
        ).toBe(
          baselineApplication!
            .nextEnergy,
        )
      },
    )

    it(
      'rejects a rider position that does not match its movement proposal',
      () => {
        const {
          movement,
          movedState,
        } = createScenario()

        expect(() =>
          applyMultiGroupEnergy({
            state: {
              ...movedState,
              riders: {
                ...movedState.riders,
                'rider-a1': {
                  ...movedState.riders[
                    'rider-a1'
                  ],
                  distanceKm: 0,
                },
              },
            },
            movement,
          }),
        ).toThrow()
      },
    )
  },
)