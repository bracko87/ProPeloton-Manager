/**
 * finalStagePelotonEffort.test.ts
 *
 * Unit expectations for deterministic final-stage peloton effort.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateFinalStagePelotonEffort,
} from '../../simulation/finalStagePelotonEffort'

describe(
  'calculateFinalStagePelotonEffort',
  () => {
    it(
      'gives no bonus before seventy percent of the stage',
      () => {
        const result =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              69,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        expect(
          result.stageProgress,
        ).toBeCloseTo(
          0.69,
        )

        expect(
          result.finalStageProgress,
        ).toBe(0)

        expect(
          result.effortBonusPercent,
        ).toBe(0)

        expect(
          result.effortMultiplier,
        ).toBe(1)
      },
    )

    it(
      'starts the final-stage window at seventy percent',
      () => {
        const result =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              70,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        expect(
          result.stageProgress,
        ).toBe(0.7)

        expect(
          result.finalStageProgress,
        ).toBe(0)

        expect(
          result.effortBonusPercent,
        ).toBe(0)
      },
    )

    it(
      'ramps the bonus through the final thirty percent',
      () => {
        const early =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              75,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        const late =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              95,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        expect(
          late.finalStageProgress,
        ).toBeGreaterThan(
          early.finalStageProgress,
        )

        expect(
          late.effortBonusPercent,
        ).toBeGreaterThan(
          early.effortBonusPercent,
        )

        expect(
          late.effortMultiplier,
        ).toBeGreaterThan(
          early.effortMultiplier,
        )
      },
    )

    it(
      'never exceeds the configured three-percent maximum',
      () => {
        const result =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              100,
            stageDistanceKm:
              100,
            averageTeamwork:
              100,
            averageEnergy:
              100,
          })

        expect(
          result.effortBonusPercent,
        ).toBeLessThanOrEqual(
          3,
        )

        expect(
          result.effortBonusPercent,
        ).toBe(3)

        expect(
          result.effortMultiplier,
        ).toBe(1.03)
      },
    )

    it(
      'gives stronger teamwork a larger final-stage bonus',
      () => {
        const organized =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              90,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        const disorganized =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              90,
            stageDistanceKm:
              100,
            averageTeamwork:
              30,
            averageEnergy:
              90,
          })

        expect(
          organized
            .effortBonusPercent,
        ).toBeGreaterThan(
          disorganized
            .effortBonusPercent,
        )
      },
    )

    it(
      'limits the final-stage bonus when energy is low',
      () => {
        const fresh =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              90,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              90,
          })

        const tired =
          calculateFinalStagePelotonEffort({
            groupType:
              'peloton',
            currentDistanceKm:
              90,
            stageDistanceKm:
              100,
            averageTeamwork:
              90,
            averageEnergy:
              10,
          })

        expect(
          tired
            .effortBonusPercent,
        ).toBeLessThan(
          fresh
            .effortBonusPercent,
        )
      },
    )

    it(
      'does not apply the bonus to non-peloton groups',
      () => {
        const groupTypes = [
          'breakaway',
          'chase',
          'dropped',
          'finished',
        ] as const

        for (
          const groupType of
          groupTypes
        ) {
          const result =
            calculateFinalStagePelotonEffort({
              groupType,
              currentDistanceKm:
                95,
              stageDistanceKm:
                100,
              averageTeamwork:
                100,
              averageEnergy:
                100,
            })

          expect(
            result.effortBonusPercent,
          ).toBe(0)

          expect(
            result.effortMultiplier,
          ).toBe(1)
        }
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const input = {
          groupType:
            'peloton' as const,
          currentDistanceKm:
            87.5,
          stageDistanceKm:
            100,
          averageTeamwork:
            82,
          averageEnergy:
            67,
        }

        expect(
          calculateFinalStagePelotonEffort(
            input,
          ),
        ).toStrictEqual(
          calculateFinalStagePelotonEffort(
            input,
          ),
        )
      },
    )

    it(
      'rejects invalid distance, teamwork, and energy inputs',
      () => {
        expect(
          () =>
            calculateFinalStagePelotonEffort({
              groupType:
                'peloton',
              currentDistanceKm:
                -1,
              stageDistanceKm:
                100,
              averageTeamwork:
                80,
              averageEnergy:
                80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFinalStagePelotonEffort({
              groupType:
                'peloton',
              currentDistanceKm:
                101,
              stageDistanceKm:
                100,
              averageTeamwork:
                80,
              averageEnergy:
                80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFinalStagePelotonEffort({
              groupType:
                'peloton',
              currentDistanceKm:
                50,
              stageDistanceKm:
                0,
              averageTeamwork:
                80,
              averageEnergy:
                80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFinalStagePelotonEffort({
              groupType:
                'peloton',
              currentDistanceKm:
                50,
              stageDistanceKm:
                100,
              averageTeamwork:
                101,
              averageEnergy:
                80,
            }),
        ).toThrow()

        expect(
          () =>
            calculateFinalStagePelotonEffort({
              groupType:
                'peloton',
              currentDistanceKm:
                50,
              stageDistanceKm:
                100,
              averageTeamwork:
                80,
              averageEnergy:
                -1,
            }),
        ).toThrow()
      },
    )
  },
)