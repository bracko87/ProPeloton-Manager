/**
 * pelotonPace.test.ts
 *
 * Unit expectations for deterministic rider-based peloton pace.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { RiderState } from '../../domain/RiderState'
import {
  calculatePelotonBasePace,
} from '../../simulation/pelotonPace'

function createRider(
  riderId: string,
  values: {
    readonly flat: number
    readonly stamina: number
    readonly resistance: number
    readonly teamwork: number
  },
  stageStatus: RiderState['stageStatus'] = 'racing',
): RiderState {
  return {
    riderId,
    teamId: 'team-test',
    riderName: riderId,
    teamName: 'Test Team',
    role: 'domestique',
    attributes: {
      flat: values.flat,
      sprint: 50,
      acceleration: 50,
      stamina: values.stamina,
      resistance: values.resistance,
      recovery: 50,
      teamwork: values.teamwork,
    },
    currentGroupId: 'peloton_main',
    distanceKm: 0,
    speedKmh: 36,
    energy: 100,
    attackAttempts: 0,
    acceptedOrderIds: [],
    completedOrderIds: [],
    stageStatus,
    finished: false,
    finishPosition: null,
    finishTimeSeconds: null,
  }
}

describe(
  'calculatePelotonBasePace',
  () => {
    it(
      'calculates the documented weighted capability score',
      () => {
        const rider = createRider(
          'rider-a',
          {
            flat: 80,
            stamina: 80,
            resistance: 80,
            teamwork: 80,
          },
        )

        const result =
          calculatePelotonBasePace({
            riders: [rider],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(
          result.averageCapabilityScore,
        ).toBe(80)

        expect(
          result.baseSpeedKmh,
        ).toBeCloseTo(45.6)
      },
    )

    it(
      'produces a higher pace for stronger riders',
      () => {
        const weaker =
          calculatePelotonBasePace({
            riders: [
              createRider(
                'weak',
                {
                  flat: 50,
                  stamina: 50,
                  resistance: 50,
                  teamwork: 50,
                },
              ),
            ],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        const stronger =
          calculatePelotonBasePace({
            riders: [
              createRider(
                'strong',
                {
                  flat: 90,
                  stamina: 90,
                  resistance: 90,
                  teamwork: 90,
                },
              ),
            ],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(
          stronger.baseSpeedKmh,
        ).toBeGreaterThan(
          weaker.baseSpeedKmh,
        )
      },
    )

    it(
      'averages all racing riders',
      () => {
        const result =
          calculatePelotonBasePace({
            riders: [
              createRider(
                'rider-a',
                {
                  flat: 60,
                  stamina: 60,
                  resistance: 60,
                  teamwork: 60,
                },
              ),
              createRider(
                'rider-b',
                {
                  flat: 80,
                  stamina: 80,
                  resistance: 80,
                  teamwork: 80,
                },
              ),
            ],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(
          result.averageCapabilityScore,
        ).toBe(70)
      },
    )

    it(
      'gives one rider and identical organized riders the same base speed',
      () => {
        const soloRider =
          createRider(
            'solo-rider',
            {
              flat: 80,
              stamina: 80,
              resistance: 80,
              teamwork: 80,
            },
          )

        const groupRiders =
          [
            'group-rider-a',
            'group-rider-b',
            'group-rider-c',
            'group-rider-d',
          ].map(
            (
              riderId,
            ) =>
              createRider(
                riderId,
                {
                  flat: 80,
                  stamina: 80,
                  resistance: 80,
                  teamwork: 80,
                },
              ),
          )

        const solo =
          calculatePelotonBasePace({
            riders: [
              soloRider,
            ],
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        const group =
          calculatePelotonBasePace({
            riders:
              groupRiders,
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        expect(
          group
            .averageCapabilityScore,
        ).toBe(
          solo
            .averageCapabilityScore,
        )

        expect(
          group.baseSpeedKmh,
        ).toBe(
          solo.baseSpeedKmh,
        )
      },
    )

    it(
      'does not currently grant a drafting or shared-effort speed benefit',
      () => {
        const riders =
          [
            'rider-a',
            'rider-b',
            'rider-c',
            'rider-d',
            'rider-e',
            'rider-f',
          ].map(
            (
              riderId,
            ) =>
              createRider(
                riderId,
                {
                  flat: 75,
                  stamina: 75,
                  resistance: 75,
                  teamwork: 90,
                },
              ),
          )

        const solo =
          calculatePelotonBasePace({
            riders: [
              riders[0],
            ],
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        const organizedGroup =
          calculatePelotonBasePace({
            riders,
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        expect(
          organizedGroup
            .eligibleRiderCount,
        ).toBe(
          6,
        )

        expect(
          organizedGroup
            .baseSpeedKmh,
        ).toBe(
          solo.baseSpeedKmh,
        )
      },
    )

    it(
      'allows a weaker rider to reduce the group average and base speed',
      () => {
        const strongRider =
          createRider(
            'strong-rider',
            {
              flat: 90,
              stamina: 90,
              resistance: 90,
              teamwork: 90,
            },
          )

        const weakRider =
          createRider(
            'weak-rider',
            {
              flat: 30,
              stamina: 30,
              resistance: 30,
              teamwork: 30,
            },
          )

        const solo =
          calculatePelotonBasePace({
            riders: [
              strongRider,
            ],
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        const mixedGroup =
          calculatePelotonBasePace({
            riders: [
              strongRider,
              weakRider,
            ],
            minimumSpeedKmh:
              36,
            maximumSpeedKmh:
              60,
          })

        expect(
          mixedGroup
            .averageCapabilityScore,
        ).toBeLessThan(
          solo
            .averageCapabilityScore,
        )

        expect(
          mixedGroup
            .baseSpeedKmh,
        ).toBeLessThan(
          solo.baseSpeedKmh,
        )
      },
    )

    it(
      'ignores riders who are not racing',
      () => {
        const result =
          calculatePelotonBasePace({
            riders: [
              createRider(
                'rider-racing',
                {
                  flat: 80,
                  stamina: 80,
                  resistance: 80,
                  teamwork: 80,
                },
              ),
              createRider(
                'rider-finished',
                {
                  flat: 10,
                  stamina: 10,
                  resistance: 10,
                  teamwork: 10,
                },
                'finished',
              ),
            ],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(
          result.eligibleRiderCount,
        ).toBe(1)

        expect(
          result.averageCapabilityScore,
        ).toBe(80)
      },
    )

    it(
      'sorts rider contributions deterministically',
      () => {
        const result =
          calculatePelotonBasePace({
            riders: [
              createRider(
                'rider-z',
                {
                  flat: 70,
                  stamina: 70,
                  resistance: 70,
                  teamwork: 70,
                },
              ),
              createRider(
                'rider-a',
                {
                  flat: 70,
                  stamina: 70,
                  resistance: 70,
                  teamwork: 70,
                },
              ),
            ],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(
          result.riderContributions.map(
            (contribution) =>
              contribution.riderId,
          ),
        ).toEqual([
          'rider-a',
          'rider-z',
        ])
      },
    )

    it(
      'rejects an empty eligible rider set',
      () => {
        expect(() =>
          calculatePelotonBasePace({
            riders: [],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects invalid speed limits',
      () => {
        const rider = createRider(
          'rider-a',
          {
            flat: 80,
            stamina: 80,
            resistance: 80,
            teamwork: 80,
          },
        )

        expect(() =>
          calculatePelotonBasePace({
            riders: [rider],
            minimumSpeedKmh: 0,
            maximumSpeedKmh: 60,
          }),
        ).toThrow()

        expect(() =>
          calculatePelotonBasePace({
            riders: [rider],
            minimumSpeedKmh: 60,
            maximumSpeedKmh: 36,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects rider attributes outside 0 to 100',
      () => {
        const invalidRider =
          createRider(
            'rider-invalid',
            {
              flat: 101,
              stamina: 80,
              resistance: 80,
              teamwork: 80,
            },
          )

        expect(() =>
          calculatePelotonBasePace({
            riders: [invalidRider],
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          }),
        ).toThrow()
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const riders = [
          createRider(
            'rider-a',
            {
              flat: 80,
              stamina: 75,
              resistance: 70,
              teamwork: 85,
            },
          ),
        ]

        const resultA =
          calculatePelotonBasePace({
            riders,
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        const resultB =
          calculatePelotonBasePace({
            riders,
            minimumSpeedKmh: 36,
            maximumSpeedKmh: 60,
          })

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)