/**
 * flatStageChaseEffort.test.ts
 *
 * Unit expectations for deterministic flat-stage chase effort.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateFlatStageChaseEffort,
  type FlatStageChaseEffortInput,
} from '../../simulation/flatStageChaseEffort'

const baseInput:
  FlatStageChaseEffortInput = {
    groupType:
      'chase',
    profileCategory:
      'flat',
    currentDistanceKm:
      80,
    stageDistanceKm:
      100,
    gapFromLeaderSeconds:
      120,
    groupSize:
      6,
    averageTeamwork:
      100,
    averageEnergy:
      100,
  }

describe(
  'calculateFlatStageChaseEffort',
  () => {
    it(
      'applies the bounded maximum bonus to an ideal late flat chase',
      () => {
        const result =
          calculateFlatStageChaseEffort({
            ...baseInput,
            currentDistanceKm:
              100,
          })

        expect(
          result.chaseBonusPercent,
        ).toBe(4)

        expect(
          result.chaseMultiplier,
        ).toBe(1.04)

        expect(
          result.maximumChaseBonusPercent,
        ).toBe(4)
      },
    )

    it(
      'applies no bonus to a peloton group',
      () => {
        const result =
          calculateFlatStageChaseEffort({
            ...baseInput,
            groupType:
              'peloton',
          })

        expect(
          result.chaseBonusPercent,
        ).toBe(0)

        expect(
          result.chaseMultiplier,
        ).toBe(1)
      },
    )

    it(
      'applies no bonus to a breakaway group',
      () => {
        const result =
          calculateFlatStageChaseEffort({
            ...baseInput,
            groupType:
              'breakaway',
          })

        expect(
          result.chaseBonusPercent,
        ).toBe(0)

        expect(
          result.chaseMultiplier,
        ).toBe(1)
      },
    )

    it(
      'applies no bonus on hilly or mountain profiles',
      () => {
        const hillyResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            profileCategory:
              'hilly',
          })

        const mountainResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            profileCategory:
              'mountain',
          })

        expect(
          hillyResult.chaseBonusPercent,
        ).toBe(0)

        expect(
          hillyResult.chaseMultiplier,
        ).toBe(1)

        expect(
          mountainResult.chaseBonusPercent,
        ).toBe(0)

        expect(
          mountainResult.chaseMultiplier,
        ).toBe(1)
      },
    )

    it(
      'applies no bonus when the leader gap is five seconds or less',
      () => {
        const fiveSecondResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            gapFromLeaderSeconds:
              5,
          })

        const zeroSecondResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            gapFromLeaderSeconds:
              0,
          })

        expect(
          fiveSecondResult.gapUrgencyFactor,
        ).toBe(0)

        expect(
          fiveSecondResult.chaseBonusPercent,
        ).toBe(0)

        expect(
          zeroSecondResult.chaseBonusPercent,
        ).toBe(0)
      },
    )

    it(
      'increases urgency as the leader gap grows',
      () => {
        const smallGapResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            gapFromLeaderSeconds:
              30,
          })

        const largeGapResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            gapFromLeaderSeconds:
              90,
          })

        const fullUrgencyResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            gapFromLeaderSeconds:
              120,
          })

        expect(
          largeGapResult
            .gapUrgencyFactor,
        ).toBeGreaterThan(
          smallGapResult
            .gapUrgencyFactor,
        )

        expect(
          fullUrgencyResult
            .gapUrgencyFactor,
        ).toBe(1)

        expect(
          largeGapResult
            .chaseBonusPercent,
        ).toBeGreaterThan(
          smallGapResult
            .chaseBonusPercent,
        )
      },
    )

    it(
      'increases the usable bonus with group size teamwork and energy',
      () => {
        const weakResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            groupSize:
              2,
            averageTeamwork:
              20,
            averageEnergy:
              20,
          })

        const strongResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            groupSize:
              6,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        expect(
          strongResult
            .groupSizeFactor,
        ).toBeGreaterThan(
          weakResult
            .groupSizeFactor,
        )

        expect(
          strongResult
            .teamworkFactor,
        ).toBeGreaterThan(
          weakResult
            .teamworkFactor,
        )

        expect(
          strongResult
            .energyFactor,
        ).toBeGreaterThan(
          weakResult
            .energyFactor,
        )

        expect(
          strongResult
            .chaseBonusPercent,
        ).toBeGreaterThan(
          weakResult
            .chaseBonusPercent,
        )
      },
    )

    it(
      'produces a stronger chase later in the stage',
      () => {
        const earlyResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            currentDistanceKm:
              20,
          })

        const lateResult =
          calculateFlatStageChaseEffort({
            ...baseInput,
            currentDistanceKm:
              80,
          })

        expect(
          lateResult
            .stageProgressFactor,
        ).toBeGreaterThan(
          earlyResult
            .stageProgressFactor,
        )

        expect(
          lateResult
            .chaseBonusPercent,
        ).toBeGreaterThan(
          earlyResult
            .chaseBonusPercent,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const resultA =
          calculateFlatStageChaseEffort(
            baseInput,
          )

        const resultB =
          calculateFlatStageChaseEffort(
            baseInput,
          )

        expect(
          resultA,
        ).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'rejects invalid input values',
      () => {
        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              stageDistanceKm:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              currentDistanceKm:
                101,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              gapFromLeaderSeconds:
                -1,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              groupSize:
                0,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              groupSize:
                1.5,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              averageTeamwork:
                101,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFlatStageChaseEffort({
              ...baseInput,
              averageEnergy:
                Number.NaN,
            }),
        ).toThrow()
      },
    )
  },
)