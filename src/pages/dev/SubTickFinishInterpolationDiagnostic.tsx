/**
 * SubTickFinishInterpolationDiagnostic.tsx
 *
 * Phase 7B.8I browser-only diagnostic.
 *
 * Compares the inactive integrated runner with:
 * - legacy tick-end finish timing; and
 * - sub-tick group-crossing interpolation.
 *
 * Pressure severity, movement severity, and five-second consolidation are
 * enabled in both comparisons. Finish interpolation remains disabled by
 * default outside this diagnostic.
 */

import { useMemo } from 'react'

import type {
  GroupState,
} from '../../race-engine/domain/GroupState'
import type {
  RiderState,
} from '../../race-engine/domain/RiderState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import type {
  MultiGroupFinishCandidate,
} from '../../race-engine/simulation/multiGroupFinishCandidates'
import {
  runIntegratedTerrainSeparationStage,
  type IntegratedDroppedTransition,
  type RunIntegratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type ScenarioKey =
  | 'gradient8'
  | 'gradient10'
  | 'gradient12'
  | 'gradient15'
  | 'rio'

interface ScenarioDefinition {
  readonly key:
    ScenarioKey
  readonly label: string
  readonly gradientPercent:
    number | null
}

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface WinnerRow {
  readonly riderId: string
  readonly riderName: string
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly elapsedSeconds: number
  readonly gapSeconds: number
}

interface GroupFinishRow {
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly riderCount: number
  readonly tickEndFinishSeconds: number
  readonly exactFinishSeconds: number
  readonly interpolationShiftSeconds: number
  readonly resultGapSeconds: number
  readonly crossingFraction: number
  readonly previousDistanceKm: number
  readonly projectedNextDistanceKm: number
  readonly containsWinner: boolean
  readonly allRidersShareExactTime: boolean
  readonly sameGroupOrderingCorrect: boolean
}

interface ScenarioSummary {
  readonly label: string

  readonly tickEndHash: string
  readonly interpolatedHash: string
  readonly repeatedHash: string
  readonly tickEndBehaviourHash: string
  readonly interpolatedBehaviourHash: string
  readonly auditHash: string

  readonly tickEndTickCount: number
  readonly interpolatedTickCount: number
  readonly tickEndCompletionSecond: number
  readonly interpolatedCompletionSecond: number

  readonly tickEndWinner:
    WinnerRow
  readonly interpolatedWinner:
    WinnerRow

  readonly transitionCount: number
  readonly transitionStructureUnchanged:
    boolean

  readonly exactFinishGroupCount: number
  readonly fractionalFinishGroupCount: number
  readonly uniqueExactFinishTimeCount: number
  readonly maximumInterpolationShiftSeconds: number
  readonly minimumPositiveResultGapSeconds:
    number | null

  readonly zeroGapDroppedGroupIds:
    readonly string[]
  readonly eventPayloadMismatchCount: number
  readonly riderStateMismatchCount: number
  readonly nonIntegerEventClockCount: number
  readonly exactTimesInsideCrossingTick:
    boolean
  readonly allCandidateRulesInterpolated:
    boolean
  readonly allSameGroupTimesEqual:
    boolean
  readonly allSameGroupOrderingCorrect:
    boolean

  readonly resultCount: number
  readonly ranksContiguous: boolean
  readonly completionEventCount: number
  readonly allPressureCountersReset: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly tickEnd:
    RunIntegratedTerrainSeparationStageResult
  readonly interpolated:
    RunIntegratedTerrainSeparationStageResult
  readonly repeated:
    RunIntegratedTerrainSeparationStageResult
  readonly summary:
    ScenarioSummary
  readonly groupFinishes:
    readonly GroupFinishRow[]
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly scenarios:
    Readonly<
      Record<
        ScenarioKey,
        ScenarioAudit
      >
    >
  readonly checks:
    readonly CheckResult[]
}

const TERRAIN_INFLUENCE =
  0.5

const SEPARATION_WINDOW_SECONDS =
  120

const CONSOLIDATION_THRESHOLD_SECONDS =
  5

const CONSOLIDATION_GAP_DIFFERENCE_SECONDS =
  5

const CONTROLLED_DISTANCE_KM =
  10

const EPSILON =
  0.0000001

function definitions():
  readonly ScenarioDefinition[] {
  return [
    {
      key:
        'gradient8',
      label:
        'Constant 8% · 10 km',
      gradientPercent: 8,
    },
    {
      key:
        'gradient10',
      label:
        'Constant 10% · 10 km',
      gradientPercent: 10,
    },
    {
      key:
        'gradient12',
      label:
        'Constant 12% · 10 km',
      gradientPercent: 12,
    },
    {
      key:
        'gradient15',
      label:
        'Constant 15% · 10 km',
      gradientPercent: 15,
    },
    {
      key:
        'rio',
      label:
        'Real Rio Stage 1',
      gradientPercent:
        null,
    },
  ]
}

function createInput(
  definition:
    ScenarioDefinition,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  if (
    definition.gradientPercent ===
    null
  ) {
    return base
  }

  return {
    ...base,
    raceId:
      `${base.raceId}-sub-tick-finish-${definition.key}`,
    stageId:
      `${base.stageId}-sub-tick-finish-${definition.key}`,
    stageName:
      `Sub-tick finish · ${definition.label}`,
    distanceKm:
      CONTROLLED_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          CONTROLLED_DISTANCE_KM,
        elevationMetres:
          CONTROLLED_DISTANCE_KM *
          1000 *
          (
            definition
              .gradientPercent /
            100
          ),
      },
    ],
    orders: [],
  }
}

function runScenario(
  definition:
    ScenarioDefinition,
  subTickFinishInterpolationEnabled:
    boolean,
): RunIntegratedTerrainSeparationStageResult {
  return runIntegratedTerrainSeparationStage(
    createInitialState(
      createInput(
        definition,
      ),
    ),
    {
      terrainCapabilityInfluence:
        TERRAIN_INFLUENCE,
      separationWindowSeconds:
        SEPARATION_WINDOW_SECONDS,

      droppedWaveConsolidationEnabled:
        true,
      droppedWaveConsolidationThresholdSeconds:
        CONSOLIDATION_THRESHOLD_SECONDS,
      droppedWaveConsolidationGapDifferenceSeconds:
        CONSOLIDATION_GAP_DIFFERENCE_SECONDS,

      steepGradientSeverityEnabled:
        true,
      steepGradientSeverityModel:
        'progressive_resilience',

      steepGradientMovementSeverityEnabled:
        true,
      steepGradientMovementSeverityModel:
        'progressive_resilience',

      subTickFinishInterpolationEnabled,

      maximumTickCount:
        40_000,
    },
  )
}

function riderFinishScoreCompare(
  left:
    MultiGroupFinishCandidate,
  right:
    MultiGroupFinishCandidate,
): number {
  if (
    left.sprintScore !==
    right.sprintScore
  ) {
    return (
      right.sprintScore -
      left.sprintScore
    )
  }

  if (
    left.accelerationScore !==
    right.accelerationScore
  ) {
    return (
      right.accelerationScore -
      left.accelerationScore
    )
  }

  if (
    left.energy !==
    right.energy
  ) {
    return (
      right.energy -
      left.energy
    )
  }

  return left.riderId
    .localeCompare(
      right.riderId,
    )
}

function compactTransition(
  transition:
    IntegratedDroppedTransition,
): Readonly<Record<string, unknown>> {
  return {
    transitionKind:
      transition.transitionKind,
    sourceGroupId:
      transition.sourceGroupId,
    targetGroupId:
      transition.targetGroupId,
    raceSecond:
      transition.raceSecond,
    kilometre:
      transition.kilometre,
    movedRiderIds:
      transition.movedRiderIds,
  }
}

/**
 * Excludes finish results, finish fields, event payloads, and gap values after
 * the first finisher. It verifies that interpolation does not change physical
 * movement, energy, membership, transitions, or completion ticks.
 */
function physicalBehaviourHash(
  run:
    RunIntegratedTerrainSeparationStageResult,
): string {
  return createCanonicalHashedValue({
    ticks:
      run.ticks.map(
        (
          tick,
          index,
        ) => ({
          tickNumber:
            index + 1,
          raceSecond:
            tick.state.raceSecond,
          currentKm:
            tick.state.currentKm,
          groups:
            Object.values(
              tick.state.groups,
            )
              .slice()
              .sort(
                (left, right) =>
                  left.groupId.localeCompare(
                    right.groupId,
                  ),
              )
              .map(
                (group) => ({
                  groupId:
                    group.groupId,
                  groupType:
                    group.groupType,
                  riderIds:
                    group.riderIds,
                  distanceKm:
                    group.distanceKm,
                  speedKmh:
                    group.speedKmh,
                  active:
                    group.active,
                }),
              ),
          riders:
            Object.values(
              tick.state.riders,
            )
              .slice()
              .sort(
                (left, right) =>
                  left.riderId.localeCompare(
                    right.riderId,
                  ),
              )
              .map(
                (rider) => ({
                  riderId:
                    rider.riderId,
                  currentGroupId:
                    rider.currentGroupId,
                  distanceKm:
                    rider.distanceKm,
                  speedKmh:
                    rider.speedKmh,
                  energy:
                    rider.energy,
                  stageStatus:
                    rider.stageStatus,
                }),
              ),
          pressure:
            tick
              .pressureDurationByRiderId,
          transitions:
            tick.transitions.map(
              compactTransition,
            ),
          /*
           * Finish interpolation intentionally changes finish precedence for
           * groups crossing in the same tick. Physical-behaviour comparison
           * must compare the set of riders finished in that tick, not their
           * result-order sequence.
           */
          finishedRiderIds:
            tick.finishedRiderIds
              .slice()
              .sort(
                (left, right) =>
                  left.localeCompare(
                    right,
                  ),
              ),
          completed:
            tick.state.completed,
        }),
      ),
    transitions:
      run.transitions.map(
        compactTransition,
      ),
  }).hash
}

function winnerRow(
  run:
    RunIntegratedTerrainSeparationStageResult,
): WinnerRow {
  const result =
    run.results.find(
      (candidate) =>
        candidate.rank === 1,
    )

  if (!result) {
    throw new Error(
      'SubTickFinishInterpolationDiagnostic: winner result is missing.',
    )
  }

  const rider =
    run.finalState.riders[
      result.riderId
    ]

  if (!rider) {
    throw new Error(
      'SubTickFinishInterpolationDiagnostic: winner rider is missing.',
    )
  }

  const group =
    run.finalState.groups[
      rider.currentGroupId
    ]

  if (!group) {
    throw new Error(
      'SubTickFinishInterpolationDiagnostic: winner group is missing.',
    )
  }

  return {
    riderId:
      rider.riderId,
    riderName:
      rider.riderName,
    groupId:
      group.groupId,
    groupType:
      group.groupType,
    elapsedSeconds:
      result.elapsedSeconds,
    gapSeconds:
      result.gapSeconds,
  }
}

function candidatesByGroup(
  run:
    RunIntegratedTerrainSeparationStageResult,
): Readonly<
  Map<
    string,
    readonly MultiGroupFinishCandidate[]
  >
> {
  const map =
    new Map<
      string,
      MultiGroupFinishCandidate[]
    >()

  for (
    const tick of
    run.ticks
  ) {
    for (
      const candidate of
      tick.finishDetection
        .candidates
    ) {
      const values =
        map.get(
          candidate.groupId,
        ) ?? []

      values.push(
        candidate,
      )

      map.set(
        candidate.groupId,
        values,
      )
    }
  }

  return map
}

function resultByRiderId(
  run:
    RunIntegratedTerrainSeparationStageResult,
) {
  return new Map(
    run.results.map(
      (result) => [
        result.riderId,
        result,
      ],
    ),
  )
}

function groupFinishRows(
  tickEnd:
    RunIntegratedTerrainSeparationStageResult,
  interpolated:
    RunIntegratedTerrainSeparationStageResult,
  winnerGroupId: string,
): readonly GroupFinishRow[] {
  const tickEndResults =
    resultByRiderId(
      tickEnd,
    )

  const exactResults =
    resultByRiderId(
      interpolated,
    )

  const exactCandidates =
    candidatesByGroup(
      interpolated,
    )

  return Object.values(
    interpolated
      .finalState.groups,
  )
    .slice()
    .sort(
      (left, right) =>
        left.createdAtRaceSecond -
          right.createdAtRaceSecond ||
        left.groupId.localeCompare(
          right.groupId,
        ),
    )
    .map(
      (group) => {
        const tickEndGroupResults =
          group.riderIds
            .map(
              (riderId) =>
                tickEndResults.get(
                  riderId,
                ),
            )
            .filter(
              (
                value,
              ): value is NonNullable<
                typeof value
              > =>
                !!value,
            )

        const exactGroupResults =
          group.riderIds
            .map(
              (riderId) =>
                exactResults.get(
                  riderId,
                ),
            )
            .filter(
              (
                value,
              ): value is NonNullable<
                typeof value
              > =>
                !!value,
            )

        const candidates =
          exactCandidates.get(
            group.groupId,
          ) ?? []

        if (
          tickEndGroupResults.length !==
            group.riderIds.length ||
          exactGroupResults.length !==
            group.riderIds.length ||
          candidates.length !==
            group.riderIds.length
        ) {
          throw new Error(
            `SubTickFinishInterpolationDiagnostic: incomplete finish data for ${group.groupId}.`,
          )
        }

        const tickEndFinishSeconds =
          Math.min(
            ...tickEndGroupResults
              .map(
                (result) =>
                  result
                    .elapsedSeconds,
              ),
          )

        const exactFinishSeconds =
          Math.min(
            ...exactGroupResults
              .map(
                (result) =>
                  result
                    .elapsedSeconds,
              ),
          )

        const candidateTimes =
          candidates.map(
            (candidate) =>
              candidate
                .finishTimeSeconds!,
          )

        const orderedCandidateIds =
          candidates.map(
            (candidate) =>
              candidate.riderId,
          )

        const expectedCandidateIds =
          candidates
            .slice()
            .sort(
              riderFinishScoreCompare,
            )
            .map(
              (candidate) =>
                candidate.riderId,
            )

        const firstCandidate =
          candidates[0]

        if (!firstCandidate) {
          throw new Error(
            `SubTickFinishInterpolationDiagnostic: missing first candidate for ${group.groupId}.`,
          )
        }

        return {
          groupId:
            group.groupId,
          groupType:
            group.groupType,
          riderCount:
            group.riderIds.length,
          tickEndFinishSeconds,
          exactFinishSeconds,
          interpolationShiftSeconds:
            tickEndFinishSeconds -
            exactFinishSeconds,
          resultGapSeconds:
            Math.min(
              ...exactGroupResults
                .map(
                  (result) =>
                    result.gapSeconds,
                ),
            ),
          crossingFraction:
            firstCandidate
              .crossingFraction!,
          previousDistanceKm:
            firstCandidate
              .previousDistanceKm!,
          projectedNextDistanceKm:
            firstCandidate
              .projectedNextDistanceKm!,
          containsWinner:
            group.groupId ===
            winnerGroupId,
          allRidersShareExactTime:
            candidateTimes.every(
              (value) =>
                Math.abs(
                  value -
                  candidateTimes[0]
                ) <
                EPSILON,
            ),
          sameGroupOrderingCorrect:
            JSON.stringify(
              orderedCandidateIds,
            ) ===
            JSON.stringify(
              expectedCandidateIds,
            ),
        }
      },
    )
}

function eventPayloadMismatchCount(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  const results =
    resultByRiderId(
      run,
    )

  let mismatchCount = 0

  for (
    const event of
    run.events
  ) {
    if (
      event.eventType !==
        'RIDER_FINISHED' ||
      !event.actorRiderId
    ) {
      continue
    }

    const result =
      results.get(
        event.actorRiderId,
      )

    const payload =
      event.payload as
        Readonly<
          Record<
            string,
            unknown
          >
        >

    if (
      !result ||
      payload.elapsedSeconds !==
        result.elapsedSeconds ||
      payload.gapSeconds !==
        result.gapSeconds ||
      payload.finishTimingRule !==
        'sub_tick_group_crossing_v1'
    ) {
      mismatchCount +=
        1
    }
  }

  return mismatchCount
}

function riderStateMismatchCount(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  return run.results.filter(
    (result) => {
      const rider =
        run.finalState.riders[
          result.riderId
        ]

      return (
        !rider ||
        rider.finishPosition !==
          result.rank ||
        rider.finishTimeSeconds !==
          result.elapsedSeconds
      )
    },
  ).length
}

function exactTimesInsideCrossingTick(
  run:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  return run.ticks.every(
    (tick) =>
      tick.finishDetection
        .candidates
        .every(
          (candidate) =>
            candidate.finishTimeSeconds! >=
              candidate.previousRaceSecond! -
                EPSILON &&
            candidate.finishTimeSeconds! <=
              candidate.raceSecond +
                EPSILON &&
            candidate.crossingFraction! >=
              0 &&
            candidate.crossingFraction! <=
              1,
        ),
  )
}

function allCandidateRulesInterpolated(
  run:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  return run.ticks
    .flatMap(
      (tick) =>
        tick.finishDetection
          .candidates,
    )
    .every(
      (candidate) =>
        candidate.finishTimingRule ===
        'sub_tick_group_crossing_v1',
    )
}

function ranksContiguous(
  run:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  return (
    JSON.stringify(
      run.results.map(
        (result) =>
          result.rank,
      ),
    ) ===
    JSON.stringify(
      Array.from(
        {
          length:
            run.results.length,
        },
        (
          _,
          index,
        ) =>
          index + 1,
      ),
    )
  )
}

function transitionStructureUnchanged(
  left:
    RunIntegratedTerrainSeparationStageResult,
  right:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  return (
    JSON.stringify(
      left.transitions.map(
        compactTransition,
      ),
    ) ===
    JSON.stringify(
      right.transitions.map(
        compactTransition,
      ),
    )
  )
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
  tickEnd:
    RunIntegratedTerrainSeparationStageResult,
  interpolated:
    RunIntegratedTerrainSeparationStageResult,
  repeated:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const tickEndWinner =
    winnerRow(
      tickEnd,
    )

  const interpolatedWinner =
    winnerRow(
      interpolated,
    )

  const groupFinishes =
    groupFinishRows(
      tickEnd,
      interpolated,
      interpolatedWinner
        .groupId,
    )

  const positiveGaps =
    interpolated.results
      .map(
        (result) =>
          result.gapSeconds,
      )
      .filter(
        (gap) =>
          gap > EPSILON,
      )

  const zeroGapDroppedGroupIds =
    groupFinishes
      .filter(
        (group) =>
          group.groupType ===
            'dropped' &&
          group.resultGapSeconds <=
            EPSILON,
      )
      .map(
        (group) =>
          group.groupId,
      )

  const tickEndBehaviourHash =
    physicalBehaviourHash(
      tickEnd,
    )

  const interpolatedBehaviourHash =
    physicalBehaviourHash(
      interpolated,
    )

  const auditBase = {
    definition,
    tickEndHash:
      tickEnd
        .deterministicHash,
    interpolatedHash:
      interpolated
        .deterministicHash,
    repeatedHash:
      repeated
        .deterministicHash,
    tickEndBehaviourHash,
    interpolatedBehaviourHash,
    tickEndWinner,
    interpolatedWinner,
    groupFinishes,
  }

  const auditHash =
    createCanonicalHashedValue(
      auditBase,
    ).hash

  const summary:
    ScenarioSummary = {
      label:
        definition.label,

      tickEndHash:
        tickEnd
          .deterministicHash,
      interpolatedHash:
        interpolated
          .deterministicHash,
      repeatedHash:
        repeated
          .deterministicHash,
      tickEndBehaviourHash,
      interpolatedBehaviourHash,
      auditHash,

      tickEndTickCount:
        tickEnd.tickCount,
      interpolatedTickCount:
        interpolated.tickCount,
      tickEndCompletionSecond:
        tickEnd.finalState
          .raceSecond,
      interpolatedCompletionSecond:
        interpolated
          .finalState
          .raceSecond,

      tickEndWinner,
      interpolatedWinner,

      transitionCount:
        interpolated
          .transitions.length,
      transitionStructureUnchanged:
        transitionStructureUnchanged(
          tickEnd,
          interpolated,
        ),

      exactFinishGroupCount:
        groupFinishes.length,
      fractionalFinishGroupCount:
        groupFinishes.filter(
          (group) =>
            Math.abs(
              group.exactFinishSeconds /
                30 -
              Math.round(
                group.exactFinishSeconds /
                  30,
              )
            ) >
            EPSILON,
        ).length,
      uniqueExactFinishTimeCount:
        new Set(
          groupFinishes.map(
            (group) =>
              group
                .exactFinishSeconds,
          ),
        ).size,
      maximumInterpolationShiftSeconds:
        Math.max(
          0,
          ...groupFinishes.map(
            (group) =>
              group
                .interpolationShiftSeconds,
          ),
        ),
      minimumPositiveResultGapSeconds:
        positiveGaps.length >
        0
          ? Math.min(
              ...positiveGaps,
            )
          : null,

      zeroGapDroppedGroupIds,
      eventPayloadMismatchCount:
        eventPayloadMismatchCount(
          interpolated,
        ),
      riderStateMismatchCount:
        riderStateMismatchCount(
          interpolated,
        ),
      nonIntegerEventClockCount:
        interpolated.events
          .filter(
            (event) =>
              !Number.isInteger(
                event.raceSecond,
              ),
          )
          .length,
      exactTimesInsideCrossingTick:
        exactTimesInsideCrossingTick(
          interpolated,
        ),
      allCandidateRulesInterpolated:
        allCandidateRulesInterpolated(
          interpolated,
        ),
      allSameGroupTimesEqual:
        groupFinishes.every(
          (group) =>
            group
              .allRidersShareExactTime,
        ),
      allSameGroupOrderingCorrect:
        groupFinishes.every(
          (group) =>
            group
              .sameGroupOrderingCorrect,
        ),

      resultCount:
        interpolated
          .results.length,
      ranksContiguous:
        ranksContiguous(
          interpolated,
        ),
      completionEventCount:
        interpolated.events
          .filter(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          )
          .length,
      allPressureCountersReset:
        Object.values(
          interpolated
            .finalPressureDurationByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
    }

  return {
    definition,
    tickEnd,
    interpolated,
    repeated,
    summary,
    groupFinishes,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const scenarioDefinitions =
    definitions()

  const scenarios =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => {
          const tickEnd =
            runScenario(
              definition,
              false,
            )

          const interpolated =
            runScenario(
              definition,
              true,
            )

          const repeated =
            runScenario(
              definition,
              true,
            )

          return [
            definition.key,
            scenarioAudit(
              definition,
              tickEnd,
              interpolated,
              repeated,
            ),
          ]
        },
      ),
    ) as Record<
      ScenarioKey,
      ScenarioAudit
    >

  const allScenarios =
    Object.values(
      scenarios,
    )

  const controlled = [
    scenarios.gradient8,
    scenarios.gradient10,
    scenarios.gradient12,
    scenarios.gradient15,
  ]

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated interpolation-enabled runs are identical for all scenarios',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .interpolated
                .deterministicHash ===
              scenario
                .repeated
                .deterministicHash,
          ),
      },
      {
        label:
          'Interpolation preserves completion ticks and physical race behaviour',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .tickEndTickCount ===
                scenario.summary
                  .interpolatedTickCount &&
              scenario.summary
                .tickEndCompletionSecond ===
                scenario.summary
                  .interpolatedCompletionSecond &&
              scenario.summary
                .tickEndBehaviourHash ===
                scenario.summary
                  .interpolatedBehaviourHash,
          ),
      },
      {
        label:
          'Interpolation preserves every separation and consolidation transition',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .transitionStructureUnchanged,
          ),
      },
      {
        label:
          'Every finish candidate uses the sub-tick group-crossing rule',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .allCandidateRulesInterpolated,
          ),
      },
      {
        label:
          'Every exact finish time lies inside its crossing tick',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .exactTimesInsideCrossingTick,
          ),
      },
      {
        label:
          'Every scenario produces at least one finish time outside the 30-second grid',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .fractionalFinishGroupCount >
              0,
          ),
      },
      {
        label:
          'All riders in the same group share one exact crossing time',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .allSameGroupTimesEqual,
          ),
      },
      {
        label:
          'Same-group rider ordering preserves sprint, acceleration, energy, and riderId precedence',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .allSameGroupOrderingCorrect,
          ),
      },
      {
        label:
          'The peloton contains the exact winner on every controlled climb',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .interpolatedWinner
                .groupId ===
              INITIAL_PELOTON_GROUP_ID,
          ),
      },
      {
        label:
          'No dropped group receives a zero-gap result',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .zeroGapDroppedGroupIds
                .length === 0,
          ),
      },
      {
        label:
          'Every exact winner has a zero result gap',
        passed:
          allScenarios.every(
            (scenario) =>
              Math.abs(
                scenario.summary
                  .interpolatedWinner
                  .gapSeconds,
              ) <
              EPSILON,
          ),
      },
      {
        label:
          'Result gaps equal exact elapsed time minus winner time',
        passed:
          allScenarios.every(
            (scenario) => {
              const winnerTime =
                scenario.summary
                  .interpolatedWinner
                  .elapsedSeconds

              return scenario
                .interpolated
                .results
                .every(
                  (result) =>
                    Math.abs(
                      result.gapSeconds -
                      Math.max(
                        0,
                        result.elapsedSeconds -
                          winnerTime,
                      ),
                    ) <
                    EPSILON,
                )
            },
          ),
      },
      {
        label:
          'Rider state finish fields match stage results exactly',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .riderStateMismatchCount ===
              0,
          ),
      },
      {
        label:
          'Finish-event payloads contain the exact elapsed time and gap',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .eventPayloadMismatchCount ===
              0,
          ),
      },
      {
        label:
          'Race-event clocks remain integer tick-end values',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .nonIntegerEventClockCount ===
              0,
          ),
      },
      {
        label:
          'All scenarios complete with 96 contiguous results',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .interpolated
                .completed &&
              scenario.summary
                .resultCount === 96 &&
              scenario.summary
                .ranksContiguous,
          ),
      },
      {
        label:
          'Every scenario emits one completion event and resets pressure',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .completionEventCount ===
                1 &&
              scenario.summary
                .allPressureCountersReset,
          ),
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    scenarios,
    checks,
  }
}

function format(
  value: number,
  digits = 3,
): string {
  return value.toFixed(
    digits,
  )
}

function optional(
  value: number | null,
  suffix = '',
): string {
  return value === null
    ? '—'
    : `${format(
        value,
      )}${suffix}`
}

function Check({
  result,
}: {
  readonly result:
    CheckResult
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {result.label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          result.passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {result.passed
          ? 'PASS'
          : 'FAIL'}
      </span>
    </div>
  )
}

function SummaryCard({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  const summary =
    scenario.summary

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">
        {summary.label}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <div className="flex justify-between gap-4">
          <dt>
            Ticks / completion
          </dt>
          <dd>
            {summary
              .interpolatedTickCount}
            {' / '}
            {summary
              .interpolatedCompletionSecond}s
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Tick-end winner
          </dt>
          <dd className="text-right">
            {summary
              .tickEndWinner
              .riderName}
            <br />
            <span className="font-mono text-xs">
              {summary
                .tickEndWinner
                .groupId}
              {' · '}
              {format(
                summary
                  .tickEndWinner
                  .elapsedSeconds,
              )}s
            </span>
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Exact winner
          </dt>
          <dd className="text-right">
            {summary
              .interpolatedWinner
              .riderName}
            <br />
            <span className="font-mono text-xs">
              {summary
                .interpolatedWinner
                .groupId}
              {' · '}
              {format(
                summary
                  .interpolatedWinner
                  .elapsedSeconds,
              )}s
            </span>
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Finish groups / unique times
          </dt>
          <dd>
            {summary
              .exactFinishGroupCount}
            {' / '}
            {summary
              .uniqueExactFinishTimeCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Fractional groups
          </dt>
          <dd>
            {summary
              .fractionalFinishGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Maximum interpolation
          </dt>
          <dd>
            {format(
              summary
                .maximumInterpolationShiftSeconds,
            )}s
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Minimum positive gap
          </dt>
          <dd>
            {optional(
              summary
                .minimumPositiveResultGapSeconds,
              's',
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Zero-gap dropped groups
          </dt>
          <dd className="text-right font-mono text-xs">
            {summary
              .zeroGapDroppedGroupIds
              .length > 0
              ? summary
                  .zeroGapDroppedGroupIds
                  .join(', ')
              : 'None'}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Tick-end hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.tickEndHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Interpolated hash
          </dt>
          <dd className="font-mono text-xs">
            {summary
              .interpolatedHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Physical hashes
          </dt>
          <dd className="text-right font-mono text-xs">
            {summary
              .tickEndBehaviourHash}
            <br />
            {summary
              .interpolatedBehaviourHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Audit hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.auditHash}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function GroupFinishTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} exact group finishes
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">
                Group
              </th>
              <th className="px-3 py-3">
                Type / riders
              </th>
              <th className="px-3 py-3">
                Tick-end
              </th>
              <th className="px-3 py-3">
                Exact
              </th>
              <th className="px-3 py-3">
                Interpolation
              </th>
              <th className="px-3 py-3">
                Gap
              </th>
              <th className="px-3 py-3">
                Crossing fraction
              </th>
              <th className="px-3 py-3">
                Previous → projected km
              </th>
              <th className="px-3 py-3">
                Winner
              </th>
              <th className="px-3 py-3">
                Same time / ordering
              </th>
            </tr>
          </thead>

          <tbody>
            {scenario.groupFinishes.map(
              (group) => (
                <tr
                  key={group.groupId}
                  className="border-t border-slate-800"
                >
                  <td className="px-3 py-3 font-mono">
                    {group.groupId}
                  </td>

                  <td className="px-3 py-3">
                    {group.groupType}
                    {' / '}
                    {group.riderCount}
                  </td>

                  <td className="px-3 py-3">
                    {format(
                      group
                        .tickEndFinishSeconds,
                    )}s
                  </td>

                  <td className="px-3 py-3">
                    {format(
                      group
                        .exactFinishSeconds,
                    )}s
                  </td>

                  <td className="px-3 py-3">
                    {format(
                      group
                        .interpolationShiftSeconds,
                    )}s
                  </td>

                  <td className="px-3 py-3">
                    {format(
                      group
                        .resultGapSeconds,
                    )}s
                  </td>

                  <td className="px-3 py-3">
                    {format(
                      group
                        .crossingFraction,
                      6,
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {format(
                      group
                        .previousDistanceKm,
                      6,
                    )}
                    {' → '}
                    {format(
                      group
                        .projectedNextDistanceKm,
                      6,
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {group.containsWinner
                      ? 'YES'
                      : 'NO'}
                  </td>

                  <td className="px-3 py-3">
                    {group
                      .allRidersShareExactTime
                      ? 'PASS'
                      : 'FAIL'}
                    {' / '}
                    {group
                      .sameGroupOrderingCorrect
                      ? 'PASS'
                      : 'FAIL'}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function SubTickFinishInterpolationDiagnostic():
  JSX.Element {
  const result =
    useMemo(
      () => {
        try {
          return {
            ok: true as const,
            value:
              buildDiagnostic(),
          }
        } catch (error) {
          return {
            ok: false as const,
            message:
              error instanceof Error
                ? error.message
                : String(error),
            stack:
              error instanceof Error
                ? error.stack ??
                  null
                : null,
          }
        }
      },
      [],
    )

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-5xl rounded-3xl border border-red-400 bg-red-950/30 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Phase 7B.8I development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Sub-tick finish interpolation failed
          </h1>

          <pre className="mt-5 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-4 text-sm text-red-100">
            {result.message}
          </pre>

          {result.stack ? (
            <details className="mt-4 rounded-2xl bg-slate-950 p-4">
              <summary className="cursor-pointer font-semibold">
                Browser stack
              </summary>

              <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-400">
                {result.stack}
              </pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }

  const value =
    result.value

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1950px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8I development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Sub-tick finish-line interpolation
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Interpolates each group’s exact finish-line crossing inside its
            current 30-second tick. Simulation ticks and event clocks remain
            unchanged.
          </p>
        </header>

        <section
          className={[
            'rounded-3xl border p-6',
            value.passed
              ? 'border-emerald-400 bg-emerald-950/25'
              : 'border-red-400 bg-red-950/25',
          ].join(' ')}
        >
          <h2 className="text-2xl font-semibold">
            {value.passed
              ? 'PASS — exact group crossing times remove tick-level finish ties without changing physical race behaviour'
              : 'FAIL — sub-tick finish interpolation needs correction'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            scenario={
              value.scenarios
                .gradient8
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .gradient10
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .gradient12
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .gradient15
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .rio
            }
          />
        </section>

        {[
          value.scenarios
            .gradient8,
          value.scenarios
            .gradient10,
          value.scenarios
            .gradient12,
          value.scenarios
            .gradient15,
          value.scenarios
            .rio,
        ].map(
          (scenario) => (
            <GroupFinishTable
              key={scenario
                .definition.key}
              scenario={
                scenario
              }
            />
          ),
        )}

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            {value.checks.map(
              (check) => (
                <Check
                  key={check.label}
                  result={check}
                />
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            Sub-tick interpolation remains disabled by default and is used only
            in the inactive integrated runner. RaceEvent.raceSecond remains the
            integer tick-end clock. Active execution, production routes, replay
            persistence, and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
