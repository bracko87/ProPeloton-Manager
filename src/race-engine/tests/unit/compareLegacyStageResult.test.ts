/**
 * compareLegacyStageResult.test.ts
 *
 * Unit and integration coverage for the pure legacy-vs-deterministic
 * comparison boundary.
 *
 * No Supabase connection, persistence, API route, or scheduler is used.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  compareLegacyStageResult,
  type LegacyRiderResultInput,
} from '../../integration/compareLegacyStageResult'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../integration/createStageInputFromSourceRows'
import {
  runDeterministicRoadRace,
} from '../../simulation/runDeterministicRoadRace'
import {
  rioStage1LegacyOutput,
} from '../fixtures/rioStage1LegacyOutput'
import {
  rioStage1SourceRows,
} from '../fixtures/rioStage1SourceRows'

function createLegacyResult(
  overrides:
    Partial<LegacyRiderResultInput> = {},
): LegacyRiderResultInput {
  return {
    rider_id: 'rider-1',
    team_id: 'team-1',
    rank: 1,
    status: 'finished',
    elapsed_seconds: 100,
    ...overrides,
  }
}

describe(
  'compareLegacyStageResult',
  () => {
    it(
      'compares the complete Rio Stage 1 legacy and deterministic outputs',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const report =
          compareLegacyStageResult(
            rioStage1LegacyOutput
              .rider_results,
            deterministicOutput,
          )

        expect(
          report.legacyRiderCount,
        ).toBe(96)

        expect(
          report.deterministicRiderCount,
        ).toBe(96)

        expect(
          report.matchedRiderCount,
        ).toBe(96)

        expect(
          report.missingFromLegacy,
        ).toEqual([])

        expect(
          report.missingFromDeterministic,
        ).toEqual([])

        expect(
          report.fullRiderCoverageMatch,
        ).toBe(true)

        expect(
          report.allTeamIdsMatch,
        ).toBe(true)

        expect(
          report.allStatusesMatch,
        ).toBe(true)

        expect(
          report.legacyWinnerRiderId,
        ).not.toBeNull()

        expect(
          report.deterministicWinnerRiderId,
        ).not.toBeNull()

        expect(
          report.positionDifferences.length,
        ).toBeGreaterThanOrEqual(0)

        expect(
          report.finishTimeDifferences.length,
        ).toBeGreaterThanOrEqual(0)

        expect(
          report.totalAbsolutePositionDelta,
        ).toBeGreaterThanOrEqual(0)

        expect(
          report.maximumAbsolutePositionDelta,
        ).toBeGreaterThanOrEqual(0)

        expect(
          report
            .totalAbsoluteFinishTimeDeltaSeconds,
        ).toBeGreaterThanOrEqual(0)

        expect(
          report
            .maximumAbsoluteFinishTimeDeltaSeconds,
        ).toBeGreaterThanOrEqual(0)
      },
    )

    it(
      'reports missing riders in both directions',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const legacyResults =
          rioStage1LegacyOutput
            .rider_results
            .slice(0, 95)

        const report =
          compareLegacyStageResult(
            [
              ...legacyResults,
              createLegacyResult({
                rider_id:
                  'legacy-only-rider',
                team_id:
                  'legacy-only-team',
                rank: 96,
                elapsed_seconds: 12000,
              }),
            ],
            deterministicOutput,
          )

        expect(
          report.missingFromLegacy,
        ).toHaveLength(1)

        expect(
          report.missingFromDeterministic,
        ).toEqual([
          {
            riderId:
              'legacy-only-rider',
          },
        ])

        expect(
          report.fullRiderCoverageMatch,
        ).toBe(false)
      },
    )

    it(
      'reports team, status, position, and time differences',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const rider =
          deterministicOutput
            .finalRiderStates[0]

        expect(rider).toBeDefined()

        const legacyResults:
          LegacyRiderResultInput[] = [
            createLegacyResult({
              rider_id:
                rider.riderId,
              team_id:
                'different-team',
              rank:
                rider.finishPosition ===
                  null
                  ? 1
                  : rider.finishPosition +
                    1,
              status:
                'dnf',
              elapsed_seconds:
                rider.finishTimeSeconds ===
                  null
                  ? 1
                  : rider.finishTimeSeconds +
                    10,
            }),
          ]

        const report =
          compareLegacyStageResult(
            legacyResults,
            {
              ...deterministicOutput,
              finalRiderStates: [
                rider,
              ],
            },
          )

        expect(
          report.teamDifferences,
        ).toHaveLength(1)

        expect(
          report.statusDifferences,
        ).toHaveLength(1)

        expect(
          report.positionDifferences,
        ).toHaveLength(1)

        expect(
          report.finishTimeDifferences,
        ).toHaveLength(1)

        expect(
          report.allTeamIdsMatch,
        ).toBe(false)

        expect(
          report.allStatusesMatch,
        ).toBe(false)

        expect(
          report.allPositionsMatch,
        ).toBe(false)

        expect(
          report.allFinishTimesMatch,
        ).toBe(false)
      },
    )

    it(
      'handles nullable legacy classifications safely',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const rider =
          deterministicOutput
            .finalRiderStates[0]

        expect(rider).toBeDefined()

        const report =
          compareLegacyStageResult(
            [
              createLegacyResult({
                rider_id:
                  rider.riderId,
                team_id:
                  rider.teamId,
                rank: null,
                status:
                  rider.stageStatus,
                elapsed_seconds:
                  null,
              }),
            ],
            {
              ...deterministicOutput,
              finalRiderStates: [
                rider,
              ],
            },
          )

        expect(
          report.positionDifferences,
        ).toHaveLength(1)

        expect(
          report.positionDifferences[0]
            .absolutePositionDelta,
        ).toBeNull()

        expect(
          report.finishTimeDifferences,
        ).toHaveLength(1)

        expect(
          report.finishTimeDifferences[0]
            .deltaSeconds,
        ).toBeNull()

        expect(
          report.finishTimeDifferences[0]
            .absoluteDeltaSeconds,
        ).toBeNull()
      },
    )

    it(
      'rejects duplicate legacy rider IDs',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const duplicate =
          createLegacyResult()

        expect(
          () =>
            compareLegacyStageResult(
              [
                duplicate,
                duplicate,
              ],
              deterministicOutput,
            ),
        ).toThrow(
          'Duplicate legacy rider result: rider-1.',
        )
      },
    )

    it(
      'rejects duplicate deterministic rider IDs',
      () => {
        const sourceRows:
          CreateStageInputFromSourceRowsParams =
            rioStage1SourceRows

        const stageInput =
          createStageInputFromSourceRows(
            sourceRows,
          )

        const deterministicOutput =
          runDeterministicRoadRace(
            stageInput,
          )

        const rider =
          deterministicOutput
            .finalRiderStates[0]

        expect(rider).toBeDefined()

        expect(
          () =>
            compareLegacyStageResult(
              [
                createLegacyResult({
                  rider_id:
                    rider.riderId,
                  team_id:
                    rider.teamId,
                }),
              ],
              {
                ...deterministicOutput,
                finalRiderStates: [
                  rider,
                  rider,
                ],
              },
            ),
        ).toThrow(
          'The deterministic output contains duplicate rider IDs.',
        )
      },
    )
  },
)