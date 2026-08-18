/**
 * attackLaunchSpeed.test.ts
 *
 * Unit expectations for deterministic, bounded attack-launch speed.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateAttackLaunchSpeed,
} from '../../simulation/attackLaunchSpeed'

describe(
  'calculateAttackLaunchSpeed',
  () => {
    it(
      'never grants more than the legacy four kilometre-per-hour bonus',
      () => {
        const result =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 100,
            currentEnergy: 100,
          })

        expect(
          result.launchBonusKmh,
        ).toBeLessThanOrEqual(4)

        expect(
          result.launchSpeedKmh,
        ).toBeLessThanOrEqual(44)
      },
    )

    it(
      'gives strong fresh accelerators a larger bonus',
      () => {
        const strong =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 90,
            currentEnergy: 90,
          })

        const weak =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 40,
            currentEnergy: 40,
          })

        expect(
          strong.launchBonusKmh,
        ).toBeGreaterThan(
          weak.launchBonusKmh,
        )
      },
    )

    it(
      'reduces the launch bonus when rider energy is low',
      () => {
        const fresh =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 80,
            currentEnergy: 100,
          })

        const tired =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 80,
            currentEnergy: 10,
          })

        expect(
          tired.launchBonusKmh,
        ).toBeLessThan(
          fresh.launchBonusKmh,
        )
      },
    )

    it(
      'reduces explosive advantage on steep climbs',
      () => {
        const flat =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 90,
            currentEnergy: 90,
          })

        const uphill =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 10,
            acceleration: 90,
            currentEnergy: 90,
          })

        expect(
          uphill.launchBonusKmh,
        ).toBeLessThan(
          flat.launchBonusKmh,
        )
      },
    )

    it(
      'reduces explosive advantage on steep descents',
      () => {
        const flat =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 90,
            currentEnergy: 90,
          })

        const downhill =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: -10,
            acceleration: 90,
            currentEnergy: 90,
          })

        expect(
          downhill.launchBonusKmh,
        ).toBeLessThan(
          flat.launchBonusKmh,
        )
      },
    )

    it(
      'reduces the bonus near maximum speed',
      () => {
        const normalHeadroom =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 40,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 90,
            currentEnergy: 90,
          })

        const limitedHeadroom =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 59,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 90,
            currentEnergy: 90,
          })

        expect(
          limitedHeadroom
            .launchBonusKmh,
        ).toBeLessThan(
          normalHeadroom
            .launchBonusKmh,
        )

        expect(
          limitedHeadroom
            .launchSpeedKmh,
        ).toBeLessThanOrEqual(60)
      },
    )

    it(
      'gives no launch bonus when already at maximum speed',
      () => {
        const result =
          calculateAttackLaunchSpeed({
            sourceSpeedKmh: 60,
            maximumSpeedKmh: 60,
            gradientPercent: 0,
            acceleration: 100,
            currentEnergy: 100,
          })

        expect(
          result.speedHeadroomFactor,
        ).toBe(0)

        expect(
          result.launchBonusKmh,
        ).toBe(0)

        expect(
          result.launchSpeedKmh,
        ).toBe(60)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input = {
          sourceSpeedKmh: 43,
          maximumSpeedKmh: 60,
          gradientPercent: -4,
          acceleration: 77,
          currentEnergy: 64,
        }

        expect(
          calculateAttackLaunchSpeed(
            input,
          ),
        ).toStrictEqual(
          calculateAttackLaunchSpeed(
            input,
          ),
        )
      },
    )

    it(
      'rejects invalid speed, gradient, attribute, and energy inputs',
      () => {
        expect(
          () =>
            calculateAttackLaunchSpeed({
              sourceSpeedKmh:
                Number.NaN,
              maximumSpeedKmh: 60,
              gradientPercent: 0,
              acceleration: 80,
              currentEnergy: 80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateAttackLaunchSpeed({
              sourceSpeedKmh: 61,
              maximumSpeedKmh: 60,
              gradientPercent: 0,
              acceleration: 80,
              currentEnergy: 80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateAttackLaunchSpeed({
              sourceSpeedKmh: 40,
              maximumSpeedKmh: 60,
              gradientPercent: -31,
              acceleration: 80,
              currentEnergy: 80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateAttackLaunchSpeed({
              sourceSpeedKmh: 40,
              maximumSpeedKmh: 60,
              gradientPercent: 0,
              acceleration: 101,
              currentEnergy: 80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateAttackLaunchSpeed({
              sourceSpeedKmh: 40,
              maximumSpeedKmh: 60,
              gradientPercent: 0,
              acceleration: 80,
              currentEnergy: -1,
            }),
        ).toThrow()
      },
    )
  },
)