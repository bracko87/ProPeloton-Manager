/**
 * ProgressiveSteepMovementConsistencyDiagnostic.tsx
 *
 * Phase 7B.8H browser-only diagnostic.
 *
 * Compares:
 * - progressive pressure severity with current movement; and
 * - progressive pressure severity with matching progressive movement.
 *
 * Movement uses rider-specific adjusted capability only. Shelter and the common
 * demand premium remain pressure/hold concepts.
 *
 * Scenarios:
 * - constant 8%, 10%, 12%, and 15% for 10 km;
 * - real Rio Stage 1.
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
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
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
  readonly containsWinner: boolean
}

interface ScenarioSummary {
  readonly label: string

  readonly pressureOnlyHash: string
  readonly consistentHash: string
  readonly pressureOnlyBehaviourHash: string
  readonly consistentBehaviourHash: string
  readonly auditHash: string

  readonly pressureOnlyTickCount: number
  readonly consistentTickCount: number
  readonly pressureOnlyCompletionSecond: number
  readonly consistentCompletionSecond: number

  readonly pressureOnlyFirstTickPelotonSpeedKmh:
    number
  readonly consistentFirstTickPelotonSpeedKmh:
    number
  readonly firstTickSpeedReductionKmh:
    number

  readonly firstTickLegacyTerrainCapability:
    number | null
  readonly firstTickAdjustedTerrainCapability:
    number | null
  readonly firstTickCapabilityReduction:
    number | null
  readonly movementSeverityAppliedTickCount:
    number

  readonly pressureOnlyFirstWaveSize: number
  readonly consistentFirstWaveSize: number
  readonly consistentFirstTransitionSecond:
    number | null
  readonly consistentMovedRiderCount: number
  readonly createdTransitionCount: number
  readonly consolidatedTransitionCount: number
  readonly consistentFinalGroupCount: number

  readonly winnerRiderName: string
  readonly winnerGroupId: string
  readonly winnerGroupType:
    GroupState['groupType']
  readonly winnerGapSeconds: number
  readonly pelotonContainsWinner: boolean

  readonly maximumPhysicalGapSeconds: number
  readonly maximumPhysicalGapMetres: number

  readonly resultCount: number
  readonly ranksContiguous: boolean
  readonly completionEventCount: number
  readonly allPressureCountersReset: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly pressureOnly:
    RunIntegratedTerrainSeparationStageResult
  readonly consistent:
    RunIntegratedTerrainSeparationStageResult
  readonly repeated:
    RunIntegratedTerrainSeparationStageResult
  readonly summary:
    ScenarioSummary
  readonly transitions:
    readonly TransitionRow[]
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
      `${base.raceId}-movement-consistency-${definition.key}`,
    stageId:
      `${base.stageId}-movement-consistency-${definition.key}`,
    stageName:
      `Progressive movement consistency · ${definition.label}`,
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
  movementSeverityEnabled: boolean,
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
        movementSeverityEnabled,
      steepGradientMovementSeverityModel:
        'progressive_resilience',

      maximumTickCount:
        40_000,
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

function ranksContiguous(
  run:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  const ranks =
    run.results.map(
      (result) =>
        result.rank,
    )

  const expected =
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
    )

  return (
    JSON.stringify(ranks) ===
    JSON.stringify(expected)
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
 * Excludes runner option metadata so exact behaviour can be compared.
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

function firstTickPelotonSpeed(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  const proposal =
    run.ticks[0]
      ?.movement
      .movement
      .proposals
      .find(
        (candidate) =>
          candidate.groupId ===
          INITIAL_PELOTON_GROUP_ID,
      )

  if (!proposal) {
    throw new Error(
      'ProgressiveSteepMovementConsistencyDiagnostic: first peloton proposal is missing.',
    )
  }

  return proposal.appliedSpeedKmh
}

function firstTickPelotonPace(
  run:
    RunIntegratedTerrainSeparationStageResult,
) {
  const diagnostic =
    run.ticks[0]
      ?.movement
      .groupDiagnostics
      .find(
        (candidate) =>
          candidate.groupId ===
          INITIAL_PELOTON_GROUP_ID,
      )

  if (!diagnostic) {
    throw new Error(
      'ProgressiveSteepMovementConsistencyDiagnostic: first peloton pace diagnostic is missing.',
    )
  }

  return diagnostic.pace
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

function movementSeverityAppliedTickCount(
  run:
    RunIntegratedTerrainSeparationStageResult,
): number {
  return run.ticks.filter(
    (tick) =>
      tick.movement
        .groupDiagnostics
        .some(
          (diagnostic) =>
            diagnostic.pace
              .steepGradientSeverityEnabled ===
            true,
        ),
  ).length
}

function winnerDetails(
  run:
    RunIntegratedTerrainSeparationStageResult,
): {
  readonly riderName: string
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly gapSeconds: number
} {
  const winner =
    run.results.find(
      (result) =>
        result.rank === 1,
    )

  if (!winner) {
    throw new Error(
      'ProgressiveSteepMovementConsistencyDiagnostic: winner result is missing.',
    )
  }

  const rider =
    run.finalState.riders[
      winner.riderId
    ]

  if (!rider) {
    throw new Error(
      'ProgressiveSteepMovementConsistencyDiagnostic: winner rider is missing.',
    )
  }

  const group =
    run.finalState.groups[
      rider.currentGroupId
    ]

  if (!group) {
    throw new Error(
      'ProgressiveSteepMovementConsistencyDiagnostic: winner group is missing.',
    )
  }

  return {
    riderName:
      rider.riderName,
    groupId:
      group.groupId,
    groupType:
      group.groupType,
    gapSeconds:
      winner.gapSeconds,
  }
}

function transitionRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly TransitionRow[] {
  return run.transitions.map(
    (
      transition,
      index,
    ) => {
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
          'ProgressiveSteepMovementConsistencyDiagnostic: transition groups are missing.',
        )
      }

      const consolidation =
        isConsolidationProposal(
          transition,
        )
          ? transition.proposal
          : null

      return {
        transitionNumber:
          index + 1,
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
          transition
            .movedRiderIds.length,
        movedRiderIds:
          transition
            .movedRiderIds
            .slice(),
        movedRiderNames:
          transition
            .movedRiderIds
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
        estimatedTimeBetweenSeconds:
          consolidation
            ?.estimatedTimeBetweenSeconds ??
          null,
        gapDifferenceSeconds:
          consolidation
            ?.gapDifferenceSeconds ??
          null,
      }
    },
  )
}

function groupFinishRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
  winnerGroupId: string,
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
            `ProgressiveSteepMovementConsistencyDiagnostic: group ${group.groupId} has missing results.`,
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
          containsWinner:
            group.groupId ===
            winnerGroupId,
        }
      },
    )
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
  pressureOnly:
    RunIntegratedTerrainSeparationStageResult,
  consistent:
    RunIntegratedTerrainSeparationStageResult,
  repeated:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const pressureOnlyPace =
    firstTickPelotonPace(
      pressureOnly,
    )

  const consistentPace =
    firstTickPelotonPace(
      consistent,
    )

  const winner =
    winnerDetails(
      consistent,
    )

  const transitions =
    transitionRows(
      consistent,
    )

  const physicalGap =
    maximumPhysicalGap(
      consistent,
    )

  const firstTickLegacyTerrainCapability =
    consistentPace
      .averageLegacyTerrainCapabilityScore ??
    null

  const firstTickAdjustedTerrainCapability =
    consistentPace
      .averageSteepAdjustedTerrainCapabilityScore ??
    null

  const summaryWithoutAuditHash = {
    label:
      definition.label,

    pressureOnlyHash:
      pressureOnly
        .deterministicHash,
    consistentHash:
      consistent
        .deterministicHash,
    pressureOnlyBehaviourHash:
      behaviourHash(
        pressureOnly,
      ),
    consistentBehaviourHash:
      behaviourHash(
        consistent,
      ),

    pressureOnlyTickCount:
      pressureOnly.tickCount,
    consistentTickCount:
      consistent.tickCount,
    pressureOnlyCompletionSecond:
      pressureOnly.finalState
        .raceSecond,
    consistentCompletionSecond:
      consistent.finalState
        .raceSecond,

    pressureOnlyFirstTickPelotonSpeedKmh:
      pressureOnlyPace
        .appliedSpeedKmh,
    consistentFirstTickPelotonSpeedKmh:
      consistentPace
        .appliedSpeedKmh,
    firstTickSpeedReductionKmh:
      pressureOnlyPace
        .appliedSpeedKmh -
      consistentPace
        .appliedSpeedKmh,

    firstTickLegacyTerrainCapability,
    firstTickAdjustedTerrainCapability,
    firstTickCapabilityReduction:
      firstTickLegacyTerrainCapability !==
        null &&
      firstTickAdjustedTerrainCapability !==
        null
        ? (
            firstTickLegacyTerrainCapability -
            firstTickAdjustedTerrainCapability
          )
        : null,
    movementSeverityAppliedTickCount:
      movementSeverityAppliedTickCount(
        consistent,
      ),

    pressureOnlyFirstWaveSize:
      pressureOnly.transitions[0]
        ?.movedRiderIds.length ??
      0,
    consistentFirstWaveSize:
      transitions[0]
        ?.movedRiderCount ??
      0,
    consistentFirstTransitionSecond:
      transitions[0]
        ?.raceSecond ??
      null,
    consistentMovedRiderCount:
      transitions.reduce(
        (
          total,
          transition,
        ) =>
          total +
          transition
            .movedRiderCount,
        0,
      ),
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
    consistentFinalGroupCount:
      Object.keys(
        consistent.finalState.groups,
      ).length,

    winnerRiderName:
      winner.riderName,
    winnerGroupId:
      winner.groupId,
    winnerGroupType:
      winner.groupType,
    winnerGapSeconds:
      winner.gapSeconds,
    pelotonContainsWinner:
      winner.groupId ===
      INITIAL_PELOTON_GROUP_ID,

    maximumPhysicalGapSeconds:
      physicalGap.seconds,
    maximumPhysicalGapMetres:
      physicalGap.metres,

    resultCount:
      consistent.results.length,
    ranksContiguous:
      ranksContiguous(
        consistent,
      ),
    completionEventCount:
      consistent.events
        .filter(
          (event) =>
            event.eventType ===
            'SIMULATION_COMPLETED',
        )
        .length,
    allPressureCountersReset:
      Object.values(
        consistent
          .finalPressureDurationByRiderId,
      ).every(
        (seconds) =>
          seconds === 0,
      ),
  }

  const groupFinishes =
    groupFinishRows(
      consistent,
      winner.groupId,
    )

  const auditHash =
    createCanonicalHashedValue({
      definition,
      summary:
        summaryWithoutAuditHash,
      transitions,
      groupFinishes,
      repeatedHash:
        repeated
          .deterministicHash,
    }).hash

  const summary:
    ScenarioSummary = {
      ...summaryWithoutAuditHash,
      auditHash,
    }

  return {
    definition,
    pressureOnly,
    consistent,
    repeated,
    summary,
    transitions,
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
          const pressureOnly =
            runScenario(
              definition,
              false,
            )

          const consistent =
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
              pressureOnly,
              consistent,
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

  const steepControlled = [
    scenarios.gradient10,
    scenarios.gradient12,
    scenarios.gradient15,
  ]

  const speedReductions =
    steepControlled.map(
      (scenario) =>
        scenario.summary
          .firstTickSpeedReductionKmh,
    )

  const speedReductionProgressive =
    speedReductions.every(
      (
        value,
        index,
      ) =>
        value > 0 &&
        (
          index === 0 ||
          value >
            speedReductions[
              index - 1
            ]
        ),
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
        const movedIds =
          scenario.transitions
            .flatMap(
              (transition) =>
                transition
                  .movedRiderIds,
            )

        return (
          new Set(
            movedIds,
          ).size ===
          movedIds.length
        )
      },
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated movement-consistent runs are identical for all five scenarios',
        passed:
          Object.values(
            scenarios,
          ).every(
            (scenario) =>
              scenario.consistent
                .deterministicHash ===
              scenario.repeated
                .deterministicHash,
          ),
      },
      {
        label:
          'The complete 8% behaviour remains exactly unchanged',
        passed:
          scenarios.gradient8
            .summary
            .pressureOnlyBehaviourHash ===
          scenarios.gradient8
            .summary
            .consistentBehaviourHash,
      },
      {
        label:
          'Rio Stage 1 remains exactly unchanged',
        passed:
          scenarios.rio
            .summary
            .pressureOnlyBehaviourHash ===
            scenarios.rio
              .summary
              .consistentBehaviourHash &&
          scenarios.rio
            .consistent
            .transitions.length ===
            0,
      },
      {
        label:
          'The 8% and Rio first-tick speed reductions are exactly zero',
        passed:
          Math.abs(
            scenarios.gradient8
              .summary
              .firstTickSpeedReductionKmh,
          ) <
            0.000000001 &&
          Math.abs(
            scenarios.rio
              .summary
              .firstTickSpeedReductionKmh,
          ) <
            0.000000001,
      },
      {
        label:
          'Movement becomes progressively slower at 10%, 12%, and 15%',
        passed:
          speedReductionProgressive,
      },
      {
        label:
          'Movement diagnostics use progressive adjusted capability on every consistent run',
        passed:
          Object.values(
            scenarios,
          ).every(
            (scenario) =>
              scenario.summary
                .movementSeverityAppliedTickCount ===
              scenario.consistent
                .tickCount,
          ),
      },
      {
        label:
          'No controlled transition occurs before 120 seconds',
        passed:
          controlled.every(
            (scenario) =>
              scenario.transitions
                .every(
                  (transition) =>
                    transition.raceSecond >=
                    SEPARATION_WINDOW_SECONDS,
                ),
          ),
      },
      {
        label:
          'The 8% transition structure remains unchanged',
        passed:
          scenarios.gradient8
            .summary
            .pressureOnlyFirstWaveSize ===
            scenarios.gradient8
              .summary
              .consistentFirstWaveSize &&
          JSON.stringify(
            scenarios.gradient8
              .pressureOnly
              .transitions
              .map(
                compactTransition,
              ),
          ) ===
            JSON.stringify(
              scenarios.gradient8
                .consistent
                .transitions
                .map(
                  compactTransition,
                ),
            ),
      },
      {
        label:
          'Harder movement does not shorten 10%, 12%, or 15% completion',
        passed:
          steepControlled.every(
            (scenario) =>
              scenario.summary
                .consistentCompletionSecond >=
              scenario.summary
                .pressureOnlyCompletionSecond,
          ),
      },
      {
        label:
          'The peloton contains the stage winner in every controlled climb',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .pelotonContainsWinner &&
              scenario.summary
                .winnerGapSeconds === 0,
          ),
      },
      {
        label:
          'No dropped group contains the winner in a controlled climb',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .winnerGroupType !==
              'dropped',
          ),
      },
      {
        label:
          'Five-second consolidation remains active above 8%',
        passed:
          steepControlled.every(
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
          'No rider is moved by more than one separation wave',
        passed:
          movedRiderIdsUnique,
      },
      {
        label:
          'Every controlled climb creates a positive physical gap',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .maximumPhysicalGapSeconds >
                0 &&
              scenario.summary
                .maximumPhysicalGapMetres >
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
              scenario.consistent
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
            Completion
          </dt>
          <dd>
            {summary
              .pressureOnlyCompletionSecond}s
            {' → '}
            {summary
              .consistentCompletionSecond}s
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Ticks
          </dt>
          <dd>
            {summary.pressureOnlyTickCount}
            {' → '}
            {summary.consistentTickCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            First peloton speed
          </dt>
          <dd>
            {format(
              summary
                .pressureOnlyFirstTickPelotonSpeedKmh,
            )}
            {' → '}
            {format(
              summary
                .consistentFirstTickPelotonSpeedKmh,
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Speed reduction
          </dt>
          <dd>
            {format(
              summary
                .firstTickSpeedReductionKmh,
            )} km/h
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Movement capability
          </dt>
          <dd>
            {optional(
              summary
                .firstTickLegacyTerrainCapability,
            )}
            {' → '}
            {optional(
              summary
                .firstTickAdjustedTerrainCapability,
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            First wave
          </dt>
          <dd>
            {summary
              .pressureOnlyFirstWaveSize}
            {' → '}
            {summary
              .consistentFirstWaveSize}
            {' at '}
            {summary
              .consistentFirstTransitionSecond ??
            '—'}s
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Moved / created / consolidated
          </dt>
          <dd>
            {summary
              .consistentMovedRiderCount}
            {' / '}
            {summary
              .createdTransitionCount}
            {' / '}
            {summary
              .consolidatedTransitionCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Final groups
          </dt>
          <dd>
            {summary
              .consistentFinalGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Winner
          </dt>
          <dd className="text-right">
            {summary.winnerRiderName}
            <br />
            <span className="font-mono text-xs">
              {summary.winnerGroupId}
              {' · '}
              {summary.winnerGapSeconds}s
            </span>
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Maximum gap
          </dt>
          <dd>
            {format(
              summary
                .maximumPhysicalGapSeconds,
            )}s
            {' / '}
            {format(
              summary
                .maximumPhysicalGapMetres,
              1,
            )}m
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Pressure-only hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.pressureOnlyHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Consistent hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.consistentHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Behaviour hashes
          </dt>
          <dd className="text-right font-mono text-xs">
            {summary
              .pressureOnlyBehaviourHash}
            <br />
            {summary
              .consistentBehaviourHash}
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
          {scenario.definition.label} movement-consistent transitions
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
                  Source left / target
                </th>
                <th className="px-3 py-3">
                  Proximity
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
                      {transition.raceSecond}s
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
                      {optional(
                        transition
                          .estimatedTimeBetweenSeconds,
                        's',
                      )}
                      {' / '}
                      {optional(
                        transition
                          .gapDifferenceSeconds,
                        's',
                      )}
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
              <th className="px-3 py-3">
                Winner
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

                  <td className="px-3 py-3">
                    {group.containsWinner
                      ? 'YES'
                      : 'NO'}
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

export default function ProgressiveSteepMovementConsistencyDiagnostic():
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
            Phase 7B.8H development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Progressive movement consistency failed
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
            Phase 7B.8H development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Progressive pressure and movement consistency
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Compares progressive pressure-only behaviour with the same
            rider-specific steep capability applied to movement. Shelter and
            demand remain pressure-only concepts.
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
              ? 'PASS — progressive movement removes the dropped-group winner contradiction while preserving 8% and Rio'
              : 'FAIL — progressive movement consistency needs correction'}
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
        ].map(
          (scenario) => (
            <div
              key={scenario
                .definition.key}
              className="space-y-6"
            >
              <TransitionTable
                scenario={
                  scenario
                }
              />

              <FinishTable
                scenario={
                  scenario
                }
              />
            </div>
          ),
        )}

        <TransitionTable
          scenario={
            value.scenarios.rio
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
            Progressive pressure, movement severity, and consolidation remain
            disabled by default in the inactive runner. simulateMultiGroupTick,
            runMultiGroupStage, production routes, events, replay persistence,
            and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
