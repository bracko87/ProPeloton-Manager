/**
 * fatigueModifier.test.ts
 *
 * Unit expectations for deterministic rider fatigue calculation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateRiderFatigueModifier,
  type RiderFatigueModifierInput,
} from '../../simulation/fatigueModifier'

describe(
  'calculateRiderFatigueModifier',
  () => {
    const baseInput: RiderFatigueModifierInput = {
      currentEnergy: 100,
      resistance: 80,
      recovery: 80,
    }

    it(
      'applies no fatigue penalty at full energy',
      () => {
        const result =
          calculateRiderFatigueModifier(
            baseInput,
          )

        expect(result.fatigued).toBe(false)
        expect(result.energyDeficit).toBe(0)
        expect(result.paceMultiplier).toBe(1)
        expect(
          result.capabilityMultiplier,
        ).toBe(1)
      },
    )

    it(
      'applies no fatigue penalty at the threshold',
      () => {
        const result =
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: 70,
          })

        expect(result.fatigued).toBe(false)
        expect(result.paceMultiplier).toBe(1)
      },
    )

    it(
      'applies a penalty below the threshold',
      () => {
        const result =
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: 50,
          })

        expect(result.fatigued).toBe(true)
        expect(result.energyDeficit).toBe(20)

        expect(
          result.paceMultiplier,
        ).toBeLessThan(1)
      },
    )

    it(
      'applies a larger penalty at lower energy',
      () => {
        const mediumFatigue =
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: 50,
          })

        const severeFatigue =
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: 10,
          })

        expect(
          severeFatigue.paceMultiplier,
        ).toBeLessThan(
          mediumFatigue.paceMultiplier,
        )
      },
    )

    it(
      'gives stronger riders more fatigue protection',
      () => {
        const weakProtection =
          calculateRiderFatigueModifier({
            currentEnergy: 20,
            resistance: 20,
            recovery: 20,
          })

        const strongProtection =
          calculateRiderFatigueModifier({
            currentEnergy: 20,
            resistance: 90,
            recovery: 90,
          })

        expect(
          strongProtection.protectionFactor,
        ).toBeGreaterThan(
          weakProtection.protectionFactor,
        )

        expect(
          strongProtection.paceMultiplier,
        ).toBeGreaterThan(
          weakProtection.paceMultiplier,
        )
      },
    )

    it(
      'weights resistance more than recovery',
      () => {
        const resistanceFocused =
          calculateRiderFatigueModifier({
            currentEnergy: 20,
            resistance: 100,
            recovery: 0,
          })

        const recoveryFocused =
          calculateRiderFatigueModifier({
            currentEnergy: 20,
            resistance: 0,
            recovery: 100,
          })

        expect(
          resistanceFocused.protectionScore,
        ).toBe(60)

        expect(
          recoveryFocused.protectionScore,
        ).toBe(40)

        expect(
          resistanceFocused.paceMultiplier,
        ).toBeGreaterThan(
          recoveryFocused.paceMultiplier,
        )
      },
    )

    it(
      'never produces a multiplier above 1',
      () => {
        const result =
          calculateRiderFatigueModifier({
            currentEnergy: 100,
            resistance: 100,
            recovery: 100,
          })

        expect(
          result.paceMultiplier,
        ).toBeLessThanOrEqual(1)
      },
    )

    it(
      'never produces a multiplier below 0.85',
      () => {
        const result =
          calculateRiderFatigueModifier({
            currentEnergy: 0,
            resistance: 0,
            recovery: 0,
          })

        expect(
          result.paceMultiplier,
        ).toBeGreaterThanOrEqual(0.85)

        expect(result.paceMultiplier).toBe(0.85)
      },
    )

    it(
      'rejects energy outside 0 to 100',
      () => {
        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: -1,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: 101,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects invalid attributes',
      () => {
        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            resistance: -1,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            recovery: 101,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects non-finite values',
      () => {
        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            currentEnergy: Number.NaN,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderFatigueModifier({
            ...baseInput,
            recovery:
              Number.POSITIVE_INFINITY,
          }),
        ).toThrow()
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input: RiderFatigueModifierInput = {
          currentEnergy: 35,
          resistance: 82,
          recovery: 76,
        }

        const resultA =
          calculateRiderFatigueModifier(input)

        const resultB =
          calculateRiderFatigueModifier(input)

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )
  },
)
