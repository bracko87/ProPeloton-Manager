/**
 * groupShelter.test.ts
 *
 * Unit expectations for deterministic group shelter calculation.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateGroupShelter,
} from '../../simulation/groupShelter'

describe(
  'calculateGroupShelter',
  () => {
    it(
      'gives a solo rider no shelter',
      () => {
        const result =
          calculateGroupShelter({
            groupType:
              'breakaway',
            groupSize:
              1,
            gradientPercent:
              0,
          })

        expect(
          result.sizeFactor,
        ).toBe(
          0,
        )

        expect(
          result.shelterBonus,
        ).toBe(
          0,
        )
      },
    )

    it(
      'increases shelter as group size increases',
      () => {
        const smallGroup =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              2,
            gradientPercent:
              0,
          })

        const mediumGroup =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              8,
            gradientPercent:
              0,
          })

        const largeGroup =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              0,
          })

        expect(
          mediumGroup
            .shelterBonus,
        ).toBeGreaterThan(
          smallGroup
            .shelterBonus,
        )

        expect(
          largeGroup
            .shelterBonus,
        ).toBeGreaterThan(
          mediumGroup
            .shelterBonus,
        )

        expect(
          largeGroup
            .shelterBonus,
        ).toBe(
          10,
        )
      },
    )

    it(
      'caps the group-size contribution at thirty-two riders',
      () => {
        const thirtyTwo =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              0,
          })

        const sixtyFour =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              64,
            gradientPercent:
              0,
          })

        expect(
          sixtyFour
            .sizeFactor,
        ).toBe(
          1,
        )

        expect(
          sixtyFour
            .shelterBonus,
        ).toBe(
          thirtyTwo
            .shelterBonus,
        )
      },
    )

    it(
      'gives a peloton more shelter than smaller tactical group types',
      () => {
        const sharedInput = {
          groupSize:
            16,
          gradientPercent:
            0,
        } as const

        const peloton =
          calculateGroupShelter({
            ...sharedInput,
            groupType:
              'peloton',
          })

        const chase =
          calculateGroupShelter({
            ...sharedInput,
            groupType:
              'chase',
          })

        const dropped =
          calculateGroupShelter({
            ...sharedInput,
            groupType:
              'dropped',
          })

        const breakaway =
          calculateGroupShelter({
            ...sharedInput,
            groupType:
              'breakaway',
          })

        expect(
          peloton.shelterBonus,
        ).toBeGreaterThan(
          chase.shelterBonus,
        )

        expect(
          chase.shelterBonus,
        ).toBeGreaterThan(
          dropped.shelterBonus,
        )

        expect(
          dropped.shelterBonus,
        ).toBeGreaterThan(
          breakaway.shelterBonus,
        )
      },
    )

    it(
      'reduces shelter progressively on uphill gradients',
      () => {
        const flat =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              0,
          })

        const moderateClimb =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              4,
          })

        const steepClimb =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              8,
          })

        expect(
          moderateClimb
            .shelterBonus,
        ).toBeLessThan(
          flat.shelterBonus,
        )

        expect(
          steepClimb
            .shelterBonus,
        ).toBeLessThan(
          moderateClimb
            .shelterBonus,
        )

        expect(
          steepClimb
            .terrainFactor,
        ).toBe(
          0.25,
        )

        expect(
          steepClimb
            .shelterBonus,
        ).toBe(
          2.5,
        )
      },
    )

    it(
      'does not increase shelter further on descending terrain',
      () => {
        const flat =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              0,
          })

        const descent =
          calculateGroupShelter({
            groupType:
              'peloton',
            groupSize:
              32,
            gradientPercent:
              -10,
          })

        expect(
          descent.terrainFactor,
        ).toBe(
          1,
        )

        expect(
          descent.shelterBonus,
        ).toBe(
          flat.shelterBonus,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input = {
          groupType:
            'chase',
          groupSize:
            7,
          gradientPercent:
            2,
        } as const

        const resultA =
          calculateGroupShelter(
            input,
          )

        const resultB =
          calculateGroupShelter(
            input,
          )

        expect(
          resultA,
        ).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'rejects invalid group sizes and gradients',
      () => {
        expect(
          () =>
            calculateGroupShelter({
              groupType:
                'peloton',
              groupSize:
                0,
              gradientPercent:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateGroupShelter({
              groupType:
                'peloton',
              groupSize:
                2.5,
              gradientPercent:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateGroupShelter({
              groupType:
                'peloton',
              groupSize:
                2,
              gradientPercent:
                31,
            }),
        ).toThrow()
      },
    )
  },
)