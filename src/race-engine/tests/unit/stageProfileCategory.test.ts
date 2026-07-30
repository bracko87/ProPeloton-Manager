/**
 * stageProfileCategory.test.ts
 *
 * Unit expectations for deterministic stage-profile classification.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  StageInput,
} from '../../domain/StageInput'
import {
  calculateStageProfileCategory,
} from '../../simulation/stageProfileCategory'

const baseStageInput:
  StageInput = {
    raceId:
      'profile-category-race',
    stageId:
      'profile-category-stage',
    stageName:
      'Profile Category Test',
    stageFormat:
      'road_race',
    distanceKm:
      100,
    seed:
      'profile-category-seed',
    settings: {
      tickSeconds:
        30,
      replaySnapshotIntervalSeconds:
        30,
      maximumBreakawaySize:
        8,
      minimumSpeedKmh:
        30,
      maximumSpeedKmh:
        60,
    },
    teams: [],
    riders: [],
    profilePoints: [
      {
        kilometre:
          0,
        elevationMetres:
          100,
      },
      {
        kilometre:
          100,
        elevationMetres:
          100,
      },
    ],
    orders: [],
  }

describe(
  'calculateStageProfileCategory',
  () => {
    it(
      'classifies a level stage as flat',
      () => {
        const result =
          calculateStageProfileCategory(
            baseStageInput,
          )

        expect(
          result.category,
        ).toBe('flat')

        expect(
          result.totalClimbingMetres,
        ).toBe(0)

        expect(
          result.climbingMetresPerKm,
        ).toBe(0)

        expect(
          result.maximumAbsoluteGradientPercent,
        ).toBe(0)

        expect(
          result.flatSuitable,
        ).toBe(true)
      },
    )

    it(
      'classifies a low-climbing stage as flat',
      () => {
        const result =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  300,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          })

        expect(
          result.totalClimbingMetres,
        ).toBe(200)

        expect(
          result.climbingMetresPerKm,
        ).toBe(2)

        expect(
          result.category,
        ).toBe('flat')

        expect(
          result.flatSuitable,
        ).toBe(true)
      },
    )

    it(
      'classifies a moderate profile as hilly',
      () => {
        const result =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  20,
                elevationMetres:
                  1300,
              },
              {
                kilometre:
                  40,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  60,
                elevationMetres:
                  700,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          })

        expect(
          result.totalClimbingMetres,
        ).toBe(1800)

        expect(
          result.climbingMetresPerKm,
        ).toBe(18)

        expect(
          result.category,
        ).toBe('mountain')
      },
    )

    it(
      'classifies a genuinely hilly profile between the thresholds',
      () => {
        const result =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  25,
                elevationMetres:
                  500,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  75,
                elevationMetres:
                  500,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          })

        expect(
          result.totalClimbingMetres,
        ).toBe(800)

        expect(
          result.climbingMetresPerKm,
        ).toBe(8)

        expect(
          result.category,
        ).toBe('hilly')

        expect(
          result.flatSuitable,
        ).toBe(false)
      },
    )

    it(
      'classifies high cumulative climbing as mountain',
      () => {
        const result =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  25,
                elevationMetres:
                  1000,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  75,
                elevationMetres:
                  1000,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          })

        expect(
          result.totalClimbingMetres,
        ).toBe(1800)

        expect(
          result.climbingMetresPerKm,
        ).toBe(18)

        expect(
          result.category,
        ).toBe('mountain')
      },
    )

    it(
      'classifies a stage with a steep segment as mountain',
      () => {
        const result =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  5,
                elevationMetres:
                  600,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  600,
              },
            ],
          })

        expect(
          result.maximumAbsoluteGradientPercent,
        ).toBe(10)

        expect(
          result.category,
        ).toBe('mountain')
      },
    )

    it(
      'sorts profile points deterministically',
      () => {
        const ordered =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  500,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          })

        const unordered =
          calculateStageProfileCategory({
            ...baseStageInput,
            profilePoints: [
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  500,
              },
            ],
          })

        expect(
          unordered,
        ).toStrictEqual(
          ordered,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const resultA =
          calculateStageProfileCategory(
            baseStageInput,
          )

        const resultB =
          calculateStageProfileCategory(
            baseStageInput,
          )

        expect(
          resultA,
        ).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'rejects invalid distance and profile points',
      () => {
        expect(
          () =>
            calculateStageProfileCategory({
              ...baseStageInput,
              distanceKm:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateStageProfileCategory({
              ...baseStageInput,
              profilePoints: [
                {
                  kilometre:
                    0,
                  elevationMetres:
                    100,
                },
              ],
            }),
        ).toThrow()

        expect(
          () =>
            calculateStageProfileCategory({
              ...baseStageInput,
              profilePoints: [
                {
                  kilometre:
                    0,
                  elevationMetres:
                    100,
                },
                {
                  kilometre:
                    0,
                  elevationMetres:
                    200,
                },
              ],
            }),
        ).toThrow()

        expect(
          () =>
            calculateStageProfileCategory({
              ...baseStageInput,
              profilePoints: [
                {
                  kilometre:
                    0,
                  elevationMetres:
                    Number.NaN,
                },
                {
                  kilometre:
                    100,
                  elevationMetres:
                    100,
                },
              ],
            }),
        ).toThrow()
      },
    )
  },
)