/**
 * groupHold.test.ts
 *
 * Unit expectations for deterministic rider group-hold calculation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateRiderGroupHold,
  type RiderGroupHoldInput,
} from '../../simulation/groupHold'

describe(
  'calculateRiderGroupHold',
  () => {
    const baseInput: RiderGroupHoldInput = {
      riderCapabilityScore: 80,
      groupDemandScore: 75,
      groupSpeedKmh: 40,
    }

    it(
      'returns comfortable at a margin of exactly plus five',
      () => {
        const result =
          calculateRiderGroupHold(
            baseInput,
          )

        expect(result.capabilityMargin).toBe(5)
        expect(result.status).toBe('comfortable')
        expect(
          result.sustainableSpeedMultiplier,
        ).toBe(1)
        expect(
          result.shouldDropFromGroup,
        ).toBe(false)
      },
    )

    it(
      'returns under pressure below the comfortable margin',
      () => {
        const result =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 79,
          })

        expect(result.capabilityMargin).toBe(4)
        expect(result.status).toBe(
          'under_pressure',
        )
        expect(
          result.sustainableSpeedMultiplier,
        ).toBeLessThan(1)
        expect(
          result.shouldDropFromGroup,
        ).toBe(false)
      },
    )

    it(
      'returns under pressure at the drop boundary',
      () => {
        const result =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 67,
          })

        expect(result.capabilityMargin).toBe(-8)
        expect(result.status).toBe(
          'under_pressure',
        )
        expect(
          result.shouldDropFromGroup,
        ).toBe(false)
      },
    )

    it(
      'returns cannot hold below the drop boundary',
      () => {
        const result =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 66,
          })

        expect(result.capabilityMargin).toBe(-9)
        expect(result.status).toBe(
          'cannot_hold',
        )
        expect(
          result.shouldDropFromGroup,
        ).toBe(true)
      },
    )

    it(
      'produces a larger speed deficit for a weaker rider',
      () => {
        const moderate =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 70,
          })

        const severe =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 40,
          })

        expect(
          severe.speedDeficitKmh,
        ).toBeGreaterThan(
          moderate.speedDeficitKmh,
        )
      },
    )

    it(
      'never exceeds the group speed',
      () => {
        const result =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 100,
          })

        expect(
          result.sustainableSpeedKmh,
        ).toBeLessThanOrEqual(
          result.groupSpeedKmh,
        )
      },
    )

    it(
      'never drops below 85 percent of group speed',
      () => {
        const result =
          calculateRiderGroupHold({
            riderCapabilityScore: 0,
            groupDemandScore: 100,
            groupSpeedKmh: 40,
          })

        expect(
          result.sustainableSpeedMultiplier,
        ).toBe(0.85)

        expect(
          result.sustainableSpeedKmh,
        ).toBe(34)
      },
    )

    it(
      'reports capability deficit only when demand is higher',
      () => {
        const comfortable =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 90,
          })

        const pressured =
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: 70,
          })

        expect(
          comfortable.capabilityDeficit,
        ).toBe(0)

        expect(
          pressured.capabilityDeficit,
        ).toBe(5)
      },
    )

    it(
      'rejects scores outside 0 to 100',
      () => {
        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore: -1,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            groupDemandScore: 101,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects non-positive group speed',
      () => {
        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            groupSpeedKmh: 0,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            groupSpeedKmh: -1,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects non-finite values',
      () => {
        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            riderCapabilityScore:
              Number.NaN,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderGroupHold({
            ...baseInput,
            groupSpeedKmh:
              Number.POSITIVE_INFINITY,
          }),
        ).toThrow()
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input: RiderGroupHoldInput = {
          riderCapabilityScore: 68,
          groupDemandScore: 75,
          groupSpeedKmh: 40,
        }

        const resultA =
          calculateRiderGroupHold(input)

        const resultB =
          calculateRiderGroupHold(input)

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)