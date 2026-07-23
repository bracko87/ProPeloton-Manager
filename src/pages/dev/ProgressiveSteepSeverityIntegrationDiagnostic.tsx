/**
 * ProgressiveSteepSeverityIntegrationDiagnostic.tsx
 *
 * Phase 7B.8G browser-only diagnostic.
 *
 * Integrates the selected progressive-resilience candidate into pressure
 * evaluation inside the inactive integrated runner. Movement remains unchanged.
 *
 * Scenarios:
 * - constant 8%, 10%, 12%, and 15% for 10 km;
 * - real Rio Stage 1.
 *
 * Every scenario compares:
 * - steep severity disabled baseline;
 * - progressive severity enabled;
 * - repeated progressive severity enabled.
 */

import { useMemo } from 'react'

import type {
  GroupState,
} from '../../race-engine/domain/GroupState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import type {
  DroppedWaveConsolidationProposal,
} from '../../race-engine/simulation/calculateDroppedWaveConsolidationProposal'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  runIntegratedTerrainSeparationStage,
  type IntegratedDroppedTransition,
  type IntegratedTerrainSeparationTickResult,
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

interface TransitionRow {
  readonly transitionNumber: number
  readonly transitionKind:
    IntegratedDroppedTransition['transitionKind']
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly movedRiderCount: number
  readonly movedRiderIds:
    readonly string[]
  readonly movedRiderNames:
    readonly string[]
  readonly sourceRemainingRiderCount: number
  readonly targetRiderCountAfter: number
  readonly previousDroppedGroupNumber: number
  readonly nextDroppedGroupNumber: number
  readonly estimatedTimeBetweenSeconds:
    number | null
  readonly gapDifferenceSeconds:
    number | null
}

interface GroupFinishRow {
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly riderCount: number
  readonly createdAtRaceSecond: number
  readonly createdAtKm: number
  readonly finishSecond: number
  readonly resultGapSeconds: number
}

interface ScenarioSummary {
  readonly label: string
  readonly baselineHash: string
  readonly progressiveHash: string
  readonly behaviourHashBaseline: string
  readonly behaviourHashProgressive: string
  readonly baselineTickCount: number
  readonly progressiveTickCount: number
  readonly baselineTransitionCount: number
  readonly progressiveTransitionCount: number
  readonly createdTransitionCount: number
  readonly consolidatedTransitionCount: number
  readonly baselineMovedRiderCount: number
  readonly progressiveMovedRiderCount: number
  readonly baselineFirstWaveSize: number
  readonly progressiveFirstWaveSize: number
  readonly baselineFirstTransitionSecond:
    number | null
  readonly progressiveFirstTransitionSecond:
    number | null
  readonly baselineMaximumCannotHoldCount: number
  readonly progressiveMaximumCannotHoldCount: number
  readonly progressiveMaximumAdditionalDemandPoints: number
  readonly progressiveMinimumShelterBonus: number
  readonly baselineFinalGroupCount: number
  readonly progressiveFinalGroupCount: number
  readonly progressiveMaximumActiveGroupCount: number
  readonly progressiveMaximumPhysicalGapSeconds: number
  readonly progressiveMaximumPhysicalGapMetres: number
  readonly resultCount: number
  readonly completionEventCount: number
  readonly ranksContiguous: boolean
  readonly allPressureCountersReset: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly baseline:
    RunIntegratedTerrainSeparationStageResult
  readonly progressive:
    RunIntegratedTerrainSeparationStageResult
  readonly repeated:
    RunIntegratedTerrainSeparationStageResult
  readonly summary:
    ScenarioSummary
  readonly transitions:
    readonly TransitionRow[]
  readonly groupFinishes:
    readonly GroupFinishRow[]
  readonly auditHash: string
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
      `${base.raceId}-progressive-severity-${definition.key}`,
    stageId:
      `${base.stageId}-progressive-severity-${definition.key}`,
    stageName:
      `Progressive steep severity · ${definition.label}`,
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
  steepGradientSeverityEnabled: boolean,
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
      steepGradientSeverityEnabled,
      steepGradientSeverityModel:
        'progressive_resilience',
      maximumTickCount:
        30_000,
    },
  )
}

function isConsolidationProposal(
  transition:
    IntegratedDroppedTransition,
): transition is IntegratedDroppedTransition & {
  readonly proposal:
    DroppedWaveConsolidationProposal
} {
  return (
    transition.transitionKind ===
      'consolidated' &&
    'estimatedTimeBetweenSeconds' in
      transition.proposal
  )
}

function cannotHoldCount(
  tick:
    IntegratedTerrainSeparationTickResult,
): number {
  return tick.pressureEvaluations
    .filter(
      (evaluation) =>
        evaluation.hold.status ===
        'cannot_hold',
    )
    .length
}

function maximumAdditionalDemandPoints(
  tick:
    IntegratedTerrainSeparationTickResult,
): number {
  return Math.max(
    0,
    ...tick.pressureEvaluations
      .map(
        (evaluation) =>
          evaluation
            .additionalDemandPoints,
      ),
  )
}

function minimumShelterBonus(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  const values =
    run.ticks.flatMap(
      (tick) =>
        tick.pressureEvaluations
          .map(
            (evaluation) =>
              evaluation
                .shelterBonus,
          ),
    )

  return values.length > 0
    ? Math.min(
        ...values,
      )
    : 0
}

function maximumActiveGroupCount(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  return Math.max(
    0,
    ...run.ticks.map(
      (tick) =>
        Object.values(
          tick.state.groups,
        ).filter(
          (group) =>
            group.active,
        ).length,
    ),
  )
}

function maximumPhysicalGap(
  run:
    RunIntegratedTerrainSeparationStageResult,
): {
  readonly seconds: number
  readonly metres: number
} {
  let seconds = 0
  let metres = 0

  for (
    const tick of
    run.ticks
  ) {
    for (
      const group of
      Object.values(
        tick.state.groups,
      )
    ) {
      seconds =
        Math.max(
          seconds,
          group
            .gapFromLeaderSeconds,
        )

      metres =
        Math.max(
          metres,
          (
            tick.state.currentKm -
            group.distanceKm
          ) *
            1000,
        )
    }
  }

  return {
    seconds,
    metres,
  }
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
 * Behaviour projection deliberately excludes runner option metadata.
 */
function behaviourHash(
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
                  gapFromLeaderSeconds:
                    group
                      .gapFromLeaderSeconds,
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
                  finishPosition:
                    rider.finishPosition,
                  finishTimeSeconds:
                    rider
                      .finishTimeSeconds,
                }),
              ),
          pressure:
            tick
              .pressureDurationByRiderId,
          transitions:
            tick.transitions.map(
              compactTransition,
            ),
          finishedRiderIds:
            tick.finishedRiderIds,
          completed:
            tick.state.completed,
        }),
      ),
    transitions:
      run.transitions.map(
        compactTransition,
      ),
    results:
      run.results,
    events:
      run.events,
    finalState:
      run.finalState,
    finalPressure:
      run
        .finalPressureDurationByRiderId,
  }).hash
}

function preTransitionMovementHash(
  run:
    RunIntegratedTerrainSeparationStageResult,
): string {
  return createCanonicalHashedValue(
    run.ticks
      .filter(
        (tick) =>
          tick.state.raceSecond <
          SEPARATION_WINDOW_SECONDS,
      )
      .map(
        (tick) => ({
          raceSecond:
            tick.state.raceSecond,
          movement:
            tick.movement.movement,
        }),
      ),
  ).hash
}

function transitionRow(
  transition:
    IntegratedDroppedTransition,
  transitionNumber: number,
  run:
    RunIntegratedTerrainSeparationStageResult,
): TransitionRow {
  const state =
    transition.application
      .state

  const source =
    state.groups[
      transition.sourceGroupId
    ]

  const target =
    state.groups[
      transition.targetGroupId
    ]

  if (
    !source ||
    !target
  ) {
    throw new Error(
      'ProgressiveSteepSeverityIntegrationDiagnostic: transition groups are missing.',
    )
  }

  const consolidation =
    isConsolidationProposal(
      transition,
    )
      ? transition.proposal
      : null

  return {
    transitionNumber,
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
    movedRiderCount:
      transition.movedRiderIds
        .length,
    movedRiderIds:
      transition.movedRiderIds
        .slice(),
    movedRiderNames:
      transition.movedRiderIds
        .map(
          (riderId) =>
            run.initialState
              .riders[
                riderId
              ]?.riderName ??
            riderId,
        ),
    sourceRemainingRiderCount:
      source.riderIds.length,
    targetRiderCountAfter:
      target.riderIds.length,
    previousDroppedGroupNumber:
      transition.application
        .previousDroppedGroupNumber,
    nextDroppedGroupNumber:
      transition.application
        .nextDroppedGroupNumber,
    estimatedTimeBetweenSeconds:
      consolidation
        ?.estimatedTimeBetweenSeconds ??
      null,
    gapDifferenceSeconds:
      consolidation
        ?.gapDifferenceSeconds ??
      null,
  }
}

function groupFinishRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly GroupFinishRow[] {
  const resultByRiderId =
    new Map(
      run.results.map(
        (result) => [
          result.riderId,
          result,
        ],
      ),
    )

  return Object.values(
    run.finalState.groups,
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
        const results =
          group.riderIds
            .map(
              (riderId) =>
                resultByRiderId.get(
                  riderId,
                ),
            )
            .filter(
              (
                result,
              ): result is NonNullable<
                typeof result
              > =>
                !!result,
            )

        if (
          results.length !==
          group.riderIds.length
        ) {
          throw new Error(
            `ProgressiveSteepSeverityIntegrationDiagnostic: group ${group.groupId} has missing results.`,
          )
        }

        return {
          groupId:
            group.groupId,
          groupType:
            group.groupType,
          riderCount:
            group.riderIds.length,
          createdAtRaceSecond:
            group
              .createdAtRaceSecond,
          createdAtKm:
            group.createdAtKm,
          finishSecond:
            Math.min(
              ...results.map(
                (result) =>
                  result
                    .elapsedSeconds,
              ),
            ),
          resultGapSeconds:
            Math.min(
              ...results.map(
                (result) =>
                  result.gapSeconds,
              ),
            ),
        }
      },
    )
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
  baseline:
    RunIntegratedTerrainSeparationStageResult,
  progressive:
    RunIntegratedTerrainSeparationStageResult,
  repeated:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const transitions =
    progressive.transitions
      .map(
        (
          transition,
          index,
        ) =>
          transitionRow(
            transition,
            index + 1,
            progressive,
          ),
      )

  const baselineMovedRiderCount =
    baseline.transitions
      .reduce(
        (
          total,
          transition,
        ) =>
          total +
          transition
            .movedRiderIds.length,
        0,
      )

  const progressiveMovedRiderCount =
    transitions.reduce(
      (
        total,
        transition,
      ) =>
        total +
        transition
          .movedRiderCount,
      0,
    )

  const physicalGap =
    maximumPhysicalGap(
      progressive,
    )

  const summary:
    ScenarioSummary = {
      label:
        definition.label,
      baselineHash:
        baseline
          .deterministicHash,
      progressiveHash:
        progressive
          .deterministicHash,
      behaviourHashBaseline:
        behaviourHash(
          baseline,
        ),
      behaviourHashProgressive:
        behaviourHash(
          progressive,
        ),
      baselineTickCount:
        baseline.tickCount,
      progressiveTickCount:
        progressive.tickCount,
      baselineTransitionCount:
        baseline.transitions
          .length,
      progressiveTransitionCount:
        progressive.transitions
          .length,
      createdTransitionCount:
        transitions.filter(
          (transition) =>
            transition.transitionKind ===
            'created',
        ).length,
      consolidatedTransitionCount:
        transitions.filter(
          (transition) =>
            transition.transitionKind ===
            'consolidated',
        ).length,
      baselineMovedRiderCount,
      progressiveMovedRiderCount,
      baselineFirstWaveSize:
        baseline.transitions[0]
          ?.movedRiderIds.length ??
        0,
      progressiveFirstWaveSize:
        transitions[0]
          ?.movedRiderCount ??
        0,
      baselineFirstTransitionSecond:
        baseline.transitions[0]
          ?.raceSecond ??
        null,
      progressiveFirstTransitionSecond:
        transitions[0]
          ?.raceSecond ??
        null,
      baselineMaximumCannotHoldCount:
        Math.max(
          0,
          ...baseline.ticks
            .map(
              (tick) =>
                cannotHoldCount(
                  tick,
                ),
            ),
        ),
      progressiveMaximumCannotHoldCount:
        Math.max(
          0,
          ...progressive.ticks
            .map(
              (tick) =>
                cannotHoldCount(
                  tick,
                ),
            ),
        ),
      progressiveMaximumAdditionalDemandPoints:
        Math.max(
          0,
          ...progressive.ticks
            .map(
              (tick) =>
                maximumAdditionalDemandPoints(
                  tick,
                ),
            ),
        ),
      progressiveMinimumShelterBonus:
        minimumShelterBonus(
          progressive,
        ),
      baselineFinalGroupCount:
        Object.keys(
          baseline.finalState.groups,
        ).length,
      progressiveFinalGroupCount:
        Object.keys(
          progressive
            .finalState.groups,
        ).length,
      progressiveMaximumActiveGroupCount:
        maximumActiveGroupCount(
          progressive,
        ),
      progressiveMaximumPhysicalGapSeconds:
        physicalGap.seconds,
      progressiveMaximumPhysicalGapMetres:
        physicalGap.metres,
      resultCount:
        progressive.results.length,
      completionEventCount:
        progressive.events
          .filter(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          )
          .length,
      ranksContiguous:
        ranksContiguous(
          progressive,
        ),
      allPressureCountersReset:
        Object.values(
          progressive
            .finalPressureDurationByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
    }

  const groupFinishes =
    groupFinishRows(
      progressive,
    )

  const auditHash =
    createCanonicalHashedValue({
      definition,
      summary,
      transitions,
      groupFinishes,
      repeatedHash:
        repeated
          .deterministicHash,
    }).hash

  return {
    definition,
    baseline,
    progressive,
    repeated,
    summary,
    transitions,
    groupFinishes,
    auditHash,
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
          const baseline =
            runScenario(
              definition,
              false,
            )

          const progressive =
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
              baseline,
              progressive,
              repeated,
            ),
          ]
        },
      ),
    ) as Record<
      ScenarioKey,
      ScenarioAudit
    >

  const controlled = [
    scenarios.gradient8,
    scenarios.gradient10,
    scenarios.gradient12,
    scenarios.gradient15,
  ]

  const firstWaveSizes =
    controlled.map(
      (scenario) =>
        scenario.summary
          .progressiveFirstWaveSize,
    )

  const maximumCannotHoldCounts =
    controlled.map(
      (scenario) =>
        scenario.summary
          .progressiveMaximumCannotHoldCount,
    )

  const movedRiderCounts =
    controlled.map(
      (scenario) =>
        scenario.summary
          .progressiveMovedRiderCount,
    )

  const strictlyIncreasingFirstWave =
    firstWaveSizes.every(
      (
        value,
        index,
      ) =>
        index === 0 ||
        value >
          firstWaveSizes[
            index - 1
          ],
    )

  const cannotHoldNonDecreasing =
    maximumCannotHoldCounts
      .every(
        (
          value,
          index,
        ) =>
          index === 0 ||
          value >=
            maximumCannotHoldCounts[
              index - 1
            ],
      )

  const movedRidersNonDecreasing =
    movedRiderCounts.every(
      (
        value,
        index,
      ) =>
        index === 0 ||
        value >=
          movedRiderCounts[
            index - 1
          ],
    )

  const allTransitions =
    controlled.flatMap(
      (scenario) =>
        scenario.transitions,
    )

  const allConsolidations =
    allTransitions.filter(
      (transition) =>
        transition.transitionKind ===
        'consolidated',
    )

  const movedRiderIdsUnique =
    controlled.every(
      (scenario) => {
        const riderIds =
          scenario.transitions
            .flatMap(
              (transition) =>
                transition
                  .movedRiderIds,
            )

        return (
          new Set(
            riderIds,
          ).size ===
          riderIds.length
        )
      },
    )

  const noTransitionBefore120 =
    controlled.every(
      (scenario) =>
        scenario.transitions
          .every(
            (transition) =>
              transition.raceSecond >=
              SEPARATION_WINDOW_SECONDS,
          ),
    )

  const preTransitionMovementUnchanged =
    controlled.every(
      (scenario) =>
        preTransitionMovementHash(
          scenario.baseline,
        ) ===
        preTransitionMovementHash(
          scenario.progressive,
        ),
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated progressive runs are identical for all five scenarios',
        passed:
          Object.values(
            scenarios,
          ).every(
            (scenario) =>
              scenario
                .progressive
                .deterministicHash ===
              scenario
                .repeated
                .deterministicHash,
          ),
      },
      {
        label:
          'The complete 8% behaviour remains exactly unchanged',
        passed:
          scenarios.gradient8
            .summary
            .behaviourHashBaseline ===
          scenarios.gradient8
            .summary
            .behaviourHashProgressive,
      },
      {
        label:
          'Rio Stage 1 remains exactly unchanged',
        passed:
          scenarios.rio
            .summary
            .behaviourHashBaseline ===
            scenarios.rio
              .summary
              .behaviourHashProgressive &&
          scenarios.rio
            .progressive
            .transitions.length ===
            0,
      },
      {
        label:
          'Pre-transition movement remains unchanged in every controlled scenario',
        passed:
          preTransitionMovementUnchanged,
      },
      {
        label:
          'No controlled transition occurs before 120 seconds',
        passed:
          noTransitionBefore120,
      },
      {
        label:
          'First-wave size increases strictly from 8% through 15%',
        passed:
          strictlyIncreasingFirstWave,
      },
      {
        label:
          'Maximum cannot-hold count never decreases from 8% through 15%',
        passed:
          cannotHoldNonDecreasing,
      },
      {
        label:
          'Total moved riders never decreases from 8% through 15%',
        passed:
          movedRidersNonDecreasing,
      },
      {
        label:
          'Five-second consolidation remains active in steep controlled stages',
        passed:
          [
            scenarios.gradient10,
            scenarios.gradient12,
            scenarios.gradient15,
          ].every(
            (scenario) =>
              scenario.summary
                .consolidatedTransitionCount >
              0,
          ),
      },
      {
        label:
          'Every consolidation satisfies both five-second limits',
        passed:
          allConsolidations.every(
            (transition) =>
              (
                transition
                  .estimatedTimeBetweenSeconds ??
                Number.POSITIVE_INFINITY
              ) <=
                CONSOLIDATION_THRESHOLD_SECONDS &&
              (
                transition
                  .gapDifferenceSeconds ??
                Number.POSITIVE_INFINITY
              ) <=
                CONSOLIDATION_GAP_DIFFERENCE_SECONDS,
          ),
      },
      {
        label:
          'No transition empties its source group',
        passed:
          allTransitions.every(
            (transition) =>
              transition
                .sourceRemainingRiderCount >
              0,
          ),
      },
      {
        label:
          'No rider is moved by more than one wave',
        passed:
          movedRiderIdsUnique,
      },
      {
        label:
          'Every controlled scenario creates a positive physical gap',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .progressiveMaximumPhysicalGapSeconds >
                0 &&
              scenario.summary
                .progressiveMaximumPhysicalGapMetres >
                0,
          ),
      },
      {
        label:
          'All scenarios complete with 96 contiguous results',
        passed:
          Object.values(
            scenarios,
          ).every(
            (scenario) =>
              scenario.progressive
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
          Object.values(
            scenarios,
          ).every(
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
  digits = 2,
): string {
  return value.toFixed(
    digits,
  )
}

function optionalNumber(
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
            Ticks baseline → progressive
          </dt>
          <dd>
            {summary.baselineTickCount}
            {' → '}
            {summary.progressiveTickCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Maximum cannot hold
          </dt>
          <dd>
            {summary.baselineMaximumCannotHoldCount}
            {' → '}
            {summary.progressiveMaximumCannotHoldCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            First wave
          </dt>
          <dd>
            {summary.baselineFirstWaveSize}
            {' → '}
            {summary.progressiveFirstWaveSize}
            {' riders'}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Moved riders
          </dt>
          <dd>
            {summary.baselineMovedRiderCount}
            {' → '}
            {summary.progressiveMovedRiderCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Waves created / consolidated
          </dt>
          <dd>
            {summary.createdTransitionCount}
            {' / '}
            {summary.consolidatedTransitionCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Final groups
          </dt>
          <dd>
            {summary.baselineFinalGroupCount}
            {' → '}
            {summary.progressiveFinalGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Demand premium / min shelter
          </dt>
          <dd>
            +{format(
              summary
                .progressiveMaximumAdditionalDemandPoints,
            )}
            {' / '}
            {format(
              summary
                .progressiveMinimumShelterBonus,
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Maximum physical gap
          </dt>
          <dd>
            {format(
              summary
                .progressiveMaximumPhysicalGapSeconds,
            )}s
            {' / '}
            {format(
              summary
                .progressiveMaximumPhysicalGapMetres,
              1,
            )}m
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Baseline hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.baselineHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Progressive hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.progressiveHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Behaviour hashes
          </dt>
          <dd className="text-right font-mono text-xs">
            {summary
              .behaviourHashBaseline}
            <br />
            {summary
              .behaviourHashProgressive}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Audit hash
          </dt>
          <dd className="font-mono text-xs">
            {scenario.auditHash}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function TransitionTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} progressive transitions
        </h2>
      </div>

      {scenario.transitions.length >
      0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">
                  #
                </th>
                <th className="px-3 py-3">
                  Kind
                </th>
                <th className="px-3 py-3">
                  Source → target
                </th>
                <th className="px-3 py-3">
                  Time / km
                </th>
                <th className="px-3 py-3">
                  Riders
                </th>
                <th className="px-3 py-3">
                  Source left / target size
                </th>
                <th className="px-3 py-3">
                  Proximity
                </th>
                <th className="px-3 py-3">
                  Counter
                </th>
              </tr>
            </thead>

            <tbody>
              {scenario.transitions.map(
                (transition) => (
                  <tr
                    key={`${transition.transitionNumber}-${transition.targetGroupId}`}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3">
                      {transition
                        .transitionNumber}
                    </td>

                    <td className="px-3 py-3 font-semibold">
                      {transition
                        .transitionKind}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {transition
                        .sourceGroupId}
                      {' → '}
                      {transition
                        .targetGroupId}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {transition
                        .raceSecond}s
                      {' / '}
                      {format(
                        transition.kilometre,
                        3,
                      )} km
                    </td>

                    <td className="min-w-[320px] px-3 py-3 text-slate-300">
                      {transition
                        .movedRiderCount}
                      {' · '}
                      {transition
                        .movedRiderNames
                        .join(', ')}
                    </td>

                    <td className="px-3 py-3">
                      {transition
                        .sourceRemainingRiderCount}
                      {' / '}
                      {transition
                        .targetRiderCountAfter}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {optionalNumber(
                        transition
                          .estimatedTimeBetweenSeconds,
                        's',
                      )}
                      {' / '}
                      {optionalNumber(
                        transition
                          .gapDifferenceSeconds,
                        's',
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {transition
                        .previousDroppedGroupNumber}
                      {' → '}
                      {transition
                        .nextDroppedGroupNumber}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-5 text-sm text-slate-400">
          No transition occurred.
        </p>
      )}
    </section>
  )
}

function FinishTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} final groups
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
                Type
              </th>
              <th className="px-3 py-3">
                Riders
              </th>
              <th className="px-3 py-3">
                Created
              </th>
              <th className="px-3 py-3">
                Finish
              </th>
              <th className="px-3 py-3">
                Result gap
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
                  </td>

                  <td className="px-3 py-3">
                    {group.riderCount}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {group
                      .createdAtRaceSecond}s
                    {' / '}
                    {format(
                      group.createdAtKm,
                      3,
                    )} km
                  </td>

                  <td className="px-3 py-3">
                    {group.finishSecond}s
                  </td>

                  <td className="px-3 py-3">
                    {group.resultGapSeconds}s
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

export default function ProgressiveSteepSeverityIntegrationDiagnostic():
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
            Phase 7B.8G development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Progressive severity integration failed
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
      <div className="mx-auto max-w-[1900px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8G development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Progressive steep severity in the inactive runner
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Applies progressive resilience only to pressure evaluation.
            Terrain-aware movement remains unchanged. Five-second dropped-wave
            consolidation stays enabled for the controlled comparisons.
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
              ? 'PASS — full-stage steep severity grows progressively while 8% and Rio remain unchanged'
              : 'FAIL — full-stage progressive severity needs correction'}
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

        <TransitionTable
          scenario={
            value.scenarios
              .gradient8
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .gradient8
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .gradient10
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .gradient10
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .gradient12
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .gradient12
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .gradient15
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .gradient15
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .rio
          }
        />

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
            Steep severity and consolidation remain disabled by default in the
            inactive runner. This diagnostic explicitly enables both. Movement,
            simulateMultiGroupTick, runMultiGroupStage, events, replay
            persistence, production routes, and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
