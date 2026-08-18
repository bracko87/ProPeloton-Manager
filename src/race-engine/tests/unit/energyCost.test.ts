/**
 * energyCost.test.ts
 *
 * Unit expectations for deterministic rider energy calculation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateRiderEnergyCost,
  type RiderEnergyCostInput,
} from '../../simulation/energyCost'

describe(
  'calculateRiderEnergyCost',
  () => {
    const baseInput: RiderEnergyCostInput = {
      currentEnergy: 100,
      speedKmh: 40,
      baseSpeedKmh: 40,
      gradientPercent: 0,
      tickSeconds: 30,
      stamina: 80,
      resistance: 80,
      recovery: 80,
    }

    it(
      'calculates the documented attribute score',
      () => {
        const result =
          calculateRiderEnergyCost(baseInput)

        expect(result.attributeScore).toBe(80)
        expect(
          result.efficiencyMultiplier,
        ).toBeCloseTo(0.68)
      },
    )

    it(
      'reduces energy on a normal flat tick',
      () => {
        const result =
          calculateRiderEnergyCost(baseInput)

        expect(result.energyCost).toBeGreaterThan(0)
        expect(result.nextEnergy).toBeLessThan(100)
      },
    )

    it(
      'costs more energy uphill than on flat terrain',
      () => {
        const flat =
          calculateRiderEnergyCost(baseInput)

        const uphill =
          calculateRiderEnergyCost({
            ...baseInput,
            gradientPercent: 5,
          })

        expect(uphill.energyCost).toBeGreaterThan(
          flat.energyCost,
        )
      },
    )

    it(
      'costs less energy downhill than on flat terrain',
      () => {
        const flat =
          calculateRiderEnergyCost(baseInput)

        const downhill =
          calculateRiderEnergyCost({
            ...baseInput,
            gradientPercent: -5,
          })

        expect(downhill.energyCost).toBeLessThan(
          flat.energyCost,
        )
      },
    )

    it(
      'costs more energy when riding above base pace',
      () => {
        const normal =
          calculateRiderEnergyCost(baseInput)

        const faster =
          calculateRiderEnergyCost({
            ...baseInput,
            speedKmh: 50,
          })

        expect(faster.energyCost).toBeGreaterThan(
          normal.energyCost,
        )
      },
    )

    it(
      'stronger attributes reduce energy cost',
      () => {
        const weaker =
          calculateRiderEnergyCost({
            ...baseInput,
            stamina: 40,
            resistance: 40,
            recovery: 40,
          })

        const stronger =
          calculateRiderEnergyCost({
            ...baseInput,
            stamina: 90,
            resistance: 90,
            recovery: 90,
          })

        expect(stronger.energyCost).toBeLessThan(
          weaker.energyCost,
        )
      },
    )

    it(
      'never reduces energy below zero',
      () => {
        const result =
          calculateRiderEnergyCost({
            ...baseInput,
            currentEnergy: 0.01,
            gradientPercent: 30,
            tickSeconds: 3600,
          })

        expect(result.nextEnergy).toBe(0)
      },
    )

    it(
      'never produces a negative gross cost',
      () => {
        const result =
          calculateRiderEnergyCost({
            ...baseInput,
            speedKmh: 0,
            gradientPercent: -30,
          })

        expect(
          result.grossEnergyCost,
        ).toBeGreaterThanOrEqual(0)

        expect(
          result.energyCost,
        ).toBeGreaterThanOrEqual(0)
      },
    )

    it(
      'rejects current energy outside 0 to 100',
      () => {
        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            currentEnergy: -1,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            currentEnergy: 101,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects invalid rider attributes',
      () => {
        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            stamina: 101,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            resistance: -1,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects invalid speed and duration values',
      () => {
        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            speedKmh: -1,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            baseSpeedKmh: 0,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            tickSeconds: 0,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects gradients outside the supported range',
      () => {
        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            gradientPercent: -31,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            gradientPercent: 31,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects non-finite values',
      () => {
        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            speedKmh: Number.NaN,
          }),
        ).toThrow()

        expect(() =>
          calculateRiderEnergyCost({
            ...baseInput,
            recovery: Number.POSITIVE_INFINITY,
          }),
        ).toThrow()
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const resultA =
          calculateRiderEnergyCost(baseInput)

        const resultB =
          calculateRiderEnergyCost(baseInput)

        expect(resultA).toStrictEqual(resultB)
      },
    )
  },
)