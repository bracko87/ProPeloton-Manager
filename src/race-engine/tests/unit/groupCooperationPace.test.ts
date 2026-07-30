/**
 * groupCooperationPace.test.ts
 *
 * Unit expectations for deterministic shared-effort group pace.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateGroupCooperationPace,
} from '../../simulation/groupCooperationPace'

describe(
  'calculateGroupCooperationPace',
  () => {
    it(
      'gives a solo rider no cooperation bonus',
      () => {
        const result =
          calculateGroupCooperationPace({
            groupType:
              'breakaway',
            groupSize:
              1,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        expect(
          result.sizeFactor,
        ).toBe(
          0,
        )

        expect(
          result.paceBonusPercent,
        ).toBe(
          0,
        )

        expect(
          result.paceMultiplier,
        ).toBe(
          1,
        )
      },
    )

    it(
      'increases the cooperation bonus with group size',
      () => {
        const pair =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              2,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        const fourRiders =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              4,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        const eightRiders =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        expect(
          fourRiders
            .paceBonusPercent,
        ).toBeGreaterThan(
          pair
            .paceBonusPercent,
        )

        expect(
          eightRiders
            .paceBonusPercent,
        ).toBeGreaterThan(
          fourRiders
            .paceBonusPercent,
        )

        expect(
          eightRiders
            .paceBonusPercent,
        ).toBe(
          3,
        )
      },
    )

    it(
      'caps the group-size contribution at eight riders',
      () => {
        const eightRiders =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        const sixteenRiders =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              16,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        expect(
          sixteenRiders
            .sizeFactor,
        ).toBe(
          1,
        )

        expect(
          sixteenRiders
            .paceBonusPercent,
        ).toBe(
          eightRiders
            .paceBonusPercent,
        )
      },
    )

    it(
      'requires teamwork above forty for a cooperation benefit',
      () => {
        const lowTeamwork =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              40,
            gradientPercent:
              0,
          })

        const mediumTeamwork =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              70,
            gradientPercent:
              0,
          })

        const maximumTeamwork =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        expect(
          lowTeamwork
            .paceBonusPercent,
        ).toBe(
          0,
        )

        expect(
          mediumTeamwork
            .paceBonusPercent,
        ).toBeGreaterThan(
          0,
        )

        expect(
          maximumTeamwork
            .paceBonusPercent,
        ).toBeGreaterThan(
          mediumTeamwork
            .paceBonusPercent,
        )
      },
    )

    it(
      'gives chase groups the strongest group-type factor',
      () => {
        const sharedInput = {
          groupSize:
            8,
          averageTeamwork:
            100,
          gradientPercent:
            0,
        } as const

        const chase =
          calculateGroupCooperationPace({
            ...sharedInput,
            groupType:
              'chase',
          })

        const peloton =
          calculateGroupCooperationPace({
            ...sharedInput,
            groupType:
              'peloton',
          })

        const breakaway =
          calculateGroupCooperationPace({
            ...sharedInput,
            groupType:
              'breakaway',
          })

        const dropped =
          calculateGroupCooperationPace({
            ...sharedInput,
            groupType:
              'dropped',
          })

        const finished =
          calculateGroupCooperationPace({
            ...sharedInput,
            groupType:
              'finished',
          })

        expect(
          chase.paceBonusPercent,
        ).toBeGreaterThan(
          peloton.paceBonusPercent,
        )

        expect(
          peloton.paceBonusPercent,
        ).toBeGreaterThan(
          breakaway.paceBonusPercent,
        )

        expect(
          breakaway.paceBonusPercent,
        ).toBeGreaterThan(
          dropped.paceBonusPercent,
        )

        expect(
          finished.paceBonusPercent,
        ).toBe(
          0,
        )
      },
    )

    it(
      'reduces cooperation on uphill gradients',
      () => {
        const flat =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        const moderateClimb =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              4,
          })

        const steepClimb =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              8,
          })

        expect(
          moderateClimb
            .paceBonusPercent,
        ).toBeLessThan(
          flat
            .paceBonusPercent,
        )

        expect(
          steepClimb
            .paceBonusPercent,
        ).toBeLessThan(
          moderateClimb
            .paceBonusPercent,
        )

        expect(
          steepClimb
            .terrainFactor,
        ).toBe(
          0.25,
        )
      },
    )

    it(
      'does not increase cooperation beyond flat-road levels on descents',
      () => {
        const flat =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              0,
          })

        const descent =
          calculateGroupCooperationPace({
            groupType:
              'chase',
            groupSize:
              8,
            averageTeamwork:
              100,
            gradientPercent:
              -10,
          })

        expect(
          descent.terrainFactor,
        ).toBe(
          1,
        )

        expect(
          descent.paceBonusPercent,
        ).toBe(
          flat.paceBonusPercent,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input = {
          groupType:
            'peloton',
          groupSize:
            6,
          averageTeamwork:
            82,
          gradientPercent:
            2,
        } as const

        const resultA =
          calculateGroupCooperationPace(
            input,
          )

        const resultB =
          calculateGroupCooperationPace(
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
      'rejects invalid group sizes, teamwork, and gradients',
      () => {
        expect(
          () =>
            calculateGroupCooperationPace({
              groupType:
                'peloton',
              groupSize:
                0,
              averageTeamwork:
                80,
              gradientPercent:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateGroupCooperationPace({
              groupType:
                'peloton',
              groupSize:
                2.5,
              averageTeamwork:
                80,
              gradientPercent:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateGroupCooperationPace({
              groupType:
                'peloton',
              groupSize:
                8,
              averageTeamwork:
                101,
              gradientPercent:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateGroupCooperationPace({
              groupType:
                'peloton',
              groupSize:
                8,
              averageTeamwork:
                80,
              gradientPercent:
                31,
            }),
        ).toThrow()
      },
    )
  },
)