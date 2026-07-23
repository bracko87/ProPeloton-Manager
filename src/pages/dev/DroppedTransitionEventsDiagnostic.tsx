/**
 * DroppedTransitionEventsDiagnostic.tsx
 *
 * Phase 7B.8J browser-only diagnostic.
 *
 * Compares the inactive integrated runner with dropped transition events:
 * - disabled baseline;
 * - enabled;
 * - repeated enabled.
 *
 * Progressive pressure, movement severity, five-second consolidation, and
 * sub-tick finish interpolation are enabled in all runs.
 */

import { useMemo } from 'react'

import type {
  RaceEvent,
} from '../../race-engine/domain/RaceEvent'
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
} from '../../race-engine/simulation/createInitialState'
import type {
  DroppedWaveConsolidationProposal,
} from '../../race-engine/simulation/calculateDroppedWaveConsolidationProposal'
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

interface TransitionEventRow {
  readonly transitionNumber: number
  readonly transitionKind:
    IntegratedDroppedTransition['transitionKind']
  readonly eventSequenceNumber: number
  readonly eventType: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly movedRiderCount: number
  readonly sourceRemainingRiderCount: number
  readonly targetRiderCountBefore: number
  readonly targetRiderCountAfter: number
  readonly previousDroppedGroupNumber: number
  readonly nextDroppedGroupNumber: number
  readonly estimatedTimeBetweenSeconds:
    number | null
  readonly gapDifferenceSeconds:
    number | null
  readonly payloadMatches: boolean
  readonly eventMatchesTransition: boolean
  readonly counterRuleMatches: boolean
  readonly targetSizeRuleMatches: boolean
  readonly precedesSameTickFinishEvents: boolean
}

interface ScenarioSummary {
  readonly label: string

  readonly baselineHash: string
  readonly eventsEnabledHash: string
  readonly repeatedHash: string
  readonly baselinePhysicalHash: string
  readonly eventsEnabledPhysicalHash: string
  readonly auditHash: string

  readonly tickCount: number
  readonly transitionCount: number
  readonly transitionEventCount: number
  readonly groupCreatedEventCount: number
  readonly groupCaughtEventCount: number
  readonly riderFinishedEventCount: number
  readonly completionEventCount: number

  readonly baselineEventCount: number
  readonly eventsEnabledEventCount: number
  readonly addedEventCount: number

  readonly firstTransitionEventSequence:
    number | null
  readonly lastTransitionEventSequence:
    number | null

  readonly missingTransitionEventCount: number
  readonly unexpectedTransitionEventCount: number
  readonly payloadMismatchCount: number
  readonly sequenceMismatchCount: number
  readonly nonIntegerEventClockCount: number

  readonly resultCount: number
  readonly ranksContiguous: boolean
  readonly allPressureCountersReset: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly baseline:
    RunIntegratedTerrainSeparationStageResult
  readonly enabled:
    RunIntegratedTerrainSeparationStageResult
  readonly repeated:
    RunIntegratedTerrainSeparationStageResult
  readonly summary:
    ScenarioSummary
  readonly eventRows:
    readonly TransitionEventRow[]
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
      `${base.raceId}-transition-events-${definition.key}`,
    stageId:
      `${base.stageId}-transition-events-${definition.key}`,
    stageName:
      `Dropped transition events · ${definition.label}`,
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
  droppedTransitionEventsEnabled:
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

      droppedTransitionEventsEnabled,

      steepGradientSeverityEnabled:
        true,
      steepGradientSeverityModel:
        'progressive_resilience',

      steepGradientMovementSeverityEnabled:
        true,
      steepGradientMovementSeverityModel:
        'progressive_resilience',

      subTickFinishInterpolationEnabled:
        true,

      maximumTickCount:
        40_000,
    },
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
 * Excludes events and nextEventSequenceNumber. It verifies that event emission
 * does not alter movement, energy, membership, pressure, transitions, finishes,
 * results, or completion.
 */
function physicalHash(
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
                    rider.finishTimeSeconds,
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
    results:
      run.results,
    finalPressure:
      run
        .finalPressureDurationByRiderId,
  }).hash
}

function transitionEvents(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly RaceEvent[] {
  return run.events.filter(
    (event) => {
      const payload =
        event.payload as
          Readonly<
            Record<
              string,
              unknown
            >
          >

      return (
        (
          event.eventType ===
            'GROUP_CREATED' ||
          event.eventType ===
            'GROUP_CAUGHT'
        ) &&
        (
          payload.transitionKind ===
            'created' ||
          payload.transitionKind ===
            'consolidated'
        )
      )
    },
  )
}

function valuesEqual(
  left: unknown,
  right: unknown,
): boolean {
  return (
    JSON.stringify(
      left,
    ) ===
    JSON.stringify(
      right,
    )
  )
}

function payloadNumber(
  payload:
    Readonly<
      Record<
        string,
        unknown
      >
    >,
  key: string,
): number | null {
  const value =
    payload[key]

  return typeof value ===
    'number'
    ? value
    : null
}

function eventRow(
  transition:
    IntegratedDroppedTransition,
  event:
    RaceEvent,
  transitionNumber: number,
  run:
    RunIntegratedTerrainSeparationStageResult,
): TransitionEventRow {
  const payload =
    event.payload as
      Readonly<
        Record<
          string,
          unknown
        >
      >

  const application =
    transition.application

  const targetRiderCountBefore =
    transition.transitionKind ===
      'created'
      ? 0
      : (
          'targetPreviousRiderIds' in
          application
            ? application
                .targetPreviousRiderIds
                .length
            : -1
        )

  const targetRiderCountAfter =
    transition.transitionKind ===
      'created'
      ? transition
          .movedRiderIds
          .length
      : (
          'targetCombinedRiderIds' in
          application
            ? application
                .targetCombinedRiderIds
                .length
            : -1
        )

  const consolidationProposal =
    transition.transitionKind ===
      'consolidated'
      ? transition.proposal as
          DroppedWaveConsolidationProposal
      : null

  const expectedEventType =
    transition.transitionKind ===
      'created'
      ? 'GROUP_CREATED'
      : 'GROUP_CAUGHT'

  const expectedTemporaryRule =
    transition.transitionKind ===
      'created'
      ? 'dropped_group_created_v1'
      : 'dropped_wave_consolidated_v1'

  const eventMatchesTransition =
    event.eventType ===
      expectedEventType &&
    event.raceSecond ===
      transition.raceSecond &&
    event.kmMarker ===
      transition.kilometre &&
    event.sourceGroupId ===
      transition.sourceGroupId &&
    event.targetGroupId ===
      transition.targetGroupId &&
    valuesEqual(
      event.relatedRiderIds,
      transition.movedRiderIds,
    )

  const commonPayloadMatches =
    payload.transitionKind ===
      transition.transitionKind &&
    payload.movedRiderCount ===
      transition.movedRiderIds
        .length &&
    payload.sourceRemainingRiderCount ===
      application
        .sourceRemainingRiderIds
        .length &&
    payload.targetRiderCountBefore ===
      targetRiderCountBefore &&
    payload.targetRiderCountAfter ===
      targetRiderCountAfter &&
    payload.previousDroppedGroupNumber ===
      application
        .previousDroppedGroupNumber &&
    payload.nextDroppedGroupNumber ===
      application
        .nextDroppedGroupNumber &&
    payload.createdAtRaceSecond ===
      transition.proposal
        .createdAtRaceSecond &&
    payload.createdAtKm ===
      transition.proposal
        .createdAtKm &&
    payload.temporaryTransitionRule ===
      expectedTemporaryRule

  const consolidationPayloadMatches =
    transition.transitionKind ===
      'created'
      ? (
          payload.distanceBetweenKm ===
            null &&
          payload.distanceBetweenMetres ===
            null &&
          payload.gapDifferenceSeconds ===
            null &&
          payload.estimatedTimeBetweenSeconds ===
            null &&
          payload.maximumTimeBetweenSeconds ===
            null &&
          payload.maximumGapDifferenceSeconds ===
            null
        )
      : (
          payload.distanceBetweenKm ===
            consolidationProposal
              ?.distanceBetweenKm &&
          payload.distanceBetweenMetres ===
            consolidationProposal
              ?.distanceBetweenMetres &&
          payload.gapDifferenceSeconds ===
            consolidationProposal
              ?.gapDifferenceSeconds &&
          payload.estimatedTimeBetweenSeconds ===
            consolidationProposal
              ?.estimatedTimeBetweenSeconds &&
          payload.maximumTimeBetweenSeconds ===
            consolidationProposal
              ?.maximumTimeBetweenSeconds &&
          payload.maximumGapDifferenceSeconds ===
            consolidationProposal
              ?.maximumGapDifferenceSeconds
        )

  const counterRuleMatches =
    transition.transitionKind ===
      'created'
      ? application
          .nextDroppedGroupNumber ===
        application
          .previousDroppedGroupNumber +
          1
      : application
          .nextDroppedGroupNumber ===
        application
          .previousDroppedGroupNumber

  const targetSizeRuleMatches =
    targetRiderCountAfter ===
    targetRiderCountBefore +
      transition.movedRiderIds
        .length

  const sameTickFinishEvents =
    run.events.filter(
      (candidateEvent) =>
        candidateEvent.eventType ===
          'RIDER_FINISHED' &&
        candidateEvent.raceSecond ===
          event.raceSecond,
    )

  const precedesSameTickFinishEvents =
    sameTickFinishEvents.every(
      (finishEvent) =>
        event.sequenceNumber <
        finishEvent.sequenceNumber,
    )

  return {
    transitionNumber,
    transitionKind:
      transition.transitionKind,
    eventSequenceNumber:
      event.sequenceNumber,
    eventType:
      event.eventType,
    raceSecond:
      event.raceSecond,
    kilometre:
      event.kmMarker,
    sourceGroupId:
      transition.sourceGroupId,
    targetGroupId:
      transition.targetGroupId,
    movedRiderCount:
      transition.movedRiderIds
        .length,
    sourceRemainingRiderCount:
      application
        .sourceRemainingRiderIds
        .length,
    targetRiderCountBefore,
    targetRiderCountAfter,
    previousDroppedGroupNumber:
      application
        .previousDroppedGroupNumber,
    nextDroppedGroupNumber:
      application
        .nextDroppedGroupNumber,
    estimatedTimeBetweenSeconds:
      consolidationProposal
        ?.estimatedTimeBetweenSeconds ??
      null,
    gapDifferenceSeconds:
      consolidationProposal
        ?.gapDifferenceSeconds ??
      null,
    payloadMatches:
      commonPayloadMatches &&
      consolidationPayloadMatches,
    eventMatchesTransition,
    counterRuleMatches,
    targetSizeRuleMatches,
    precedesSameTickFinishEvents,
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

function contiguousEventSequences(
  run:
    RunIntegratedTerrainSeparationStageResult,
): boolean {
  return run.events.every(
    (
      event,
      index,
    ) =>
      event.sequenceNumber ===
      index + 1,
  )
}

function scenarioAudit(
  definition:
    ScenarioDefinition,
  baseline:
    RunIntegratedTerrainSeparationStageResult,
  enabled:
    RunIntegratedTerrainSeparationStageResult,
  repeated:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const events =
    transitionEvents(
      enabled,
    )

  const eventRows =
    enabled.transitions.map(
      (
        transition,
        index,
      ) => {
        const event =
          transition.event ??
          events[index]

        if (!event) {
          throw new Error(
            `DroppedTransitionEventsDiagnostic: missing event for transition ${index + 1}.`,
          )
        }

        return eventRow(
          transition,
          event,
          index + 1,
          enabled,
        )
      },
    )

  const baselinePhysicalHash =
    physicalHash(
      baseline,
    )

  const eventsEnabledPhysicalHash =
    physicalHash(
      enabled,
    )

  const payloadMismatchCount =
    eventRows.filter(
      (row) =>
        !row.payloadMatches ||
        !row.eventMatchesTransition ||
        !row.counterRuleMatches ||
        !row.targetSizeRuleMatches ||
        !row.precedesSameTickFinishEvents,
    ).length

  const auditBase = {
    definition,
    baselineHash:
      baseline
        .deterministicHash,
    enabledHash:
      enabled
        .deterministicHash,
    repeatedHash:
      repeated
        .deterministicHash,
    baselinePhysicalHash,
    eventsEnabledPhysicalHash,
    eventRows,
  }

  const auditHash =
    createCanonicalHashedValue(
      auditBase,
    ).hash

  const firstEvent =
    events[0] ??
    null

  const lastEvent =
    events[
      events.length - 1
    ] ??
    null

  const summary:
    ScenarioSummary = {
      label:
        definition.label,

      baselineHash:
        baseline
          .deterministicHash,
      eventsEnabledHash:
        enabled
          .deterministicHash,
      repeatedHash:
        repeated
          .deterministicHash,
      baselinePhysicalHash,
      eventsEnabledPhysicalHash,
      auditHash,

      tickCount:
        enabled.tickCount,
      transitionCount:
        enabled
          .transitions.length,
      transitionEventCount:
        events.length,
      groupCreatedEventCount:
        events.filter(
          (event) =>
            event.eventType ===
            'GROUP_CREATED',
        ).length,
      groupCaughtEventCount:
        events.filter(
          (event) =>
            event.eventType ===
            'GROUP_CAUGHT',
        ).length,
      riderFinishedEventCount:
        enabled.events.filter(
          (event) =>
            event.eventType ===
            'RIDER_FINISHED',
        ).length,
      completionEventCount:
        enabled.events.filter(
          (event) =>
            event.eventType ===
            'SIMULATION_COMPLETED',
        ).length,

      baselineEventCount:
        baseline.events.length,
      eventsEnabledEventCount:
        enabled.events.length,
      addedEventCount:
        enabled.events.length -
        baseline.events.length,

      firstTransitionEventSequence:
        firstEvent
          ?.sequenceNumber ??
        null,
      lastTransitionEventSequence:
        lastEvent
          ?.sequenceNumber ??
        null,

      missingTransitionEventCount:
        Math.max(
          0,
          enabled.transitions
            .length -
          events.length,
        ),
      unexpectedTransitionEventCount:
        Math.max(
          0,
          events.length -
          enabled.transitions
            .length,
        ),
      payloadMismatchCount,
      sequenceMismatchCount:
        contiguousEventSequences(
          enabled,
        )
          ? 0
          : 1,
      nonIntegerEventClockCount:
        enabled.events.filter(
          (event) =>
            !Number.isInteger(
              event.raceSecond,
            ),
        ).length,

      resultCount:
        enabled.results.length,
      ranksContiguous:
        ranksContiguous(
          enabled,
        ),
      allPressureCountersReset:
        Object.values(
          enabled
            .finalPressureDurationByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
    }

  return {
    definition,
    baseline,
    enabled,
    repeated,
    summary,
    eventRows,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const scenarios =
    Object.fromEntries(
      definitions().map(
        (definition) => {
          const baseline =
            runScenario(
              definition,
              false,
            )

          const enabled =
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
              enabled,
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

  const allRows =
    controlled.flatMap(
      (scenario) =>
        scenario.eventRows,
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated event-enabled runs are identical for every scenario',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.enabled
                .deterministicHash ===
              scenario.repeated
                .deterministicHash,
          ),
      },
      {
        label:
          'Transition events do not change physical race behaviour',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .baselinePhysicalHash ===
              scenario.summary
                .eventsEnabledPhysicalHash,
          ),
      },
      {
        label:
          'Every applied transition emits exactly one authoritative event',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .transitionCount ===
                scenario.summary
                  .transitionEventCount &&
              scenario.summary
                .missingTransitionEventCount ===
                0 &&
              scenario.summary
                .unexpectedTransitionEventCount ===
                0,
          ),
      },
      {
        label:
          'Rio emits no dropped transition event',
        passed:
          scenarios.rio.summary
            .transitionCount === 0 &&
          scenarios.rio.summary
            .transitionEventCount === 0 &&
          scenarios.rio.summary
            .addedEventCount === 0,
      },
      {
        label:
          'GROUP_CREATED maps only to creation and GROUP_CAUGHT maps only to consolidation',
        passed:
          allRows.every(
            (row) =>
              (
                row.transitionKind ===
                  'created' &&
                row.eventType ===
                  'GROUP_CREATED'
              ) ||
              (
                row.transitionKind ===
                  'consolidated' &&
                row.eventType ===
                  'GROUP_CAUGHT'
              ),
          ),
      },
      {
        label:
          'Every event matches its transition time, kilometre, groups, and moved riders',
        passed:
          allRows.every(
            (row) =>
              row
                .eventMatchesTransition,
          ),
      },
      {
        label:
          'Every transition payload matches the proposal and application',
        passed:
          allRows.every(
            (row) =>
              row.payloadMatches,
          ),
      },
      {
        label:
          'Creation increments the dropped counter and consolidation preserves it',
        passed:
          allRows.every(
            (row) =>
              row.counterRuleMatches,
          ),
      },
      {
        label:
          'Every target size equals previous target size plus moved riders',
        passed:
          allRows.every(
            (row) =>
              row
                .targetSizeRuleMatches,
          ),
      },
      {
        label:
          'Every consolidation event records proximity within both five-second thresholds',
        passed:
          allRows
            .filter(
              (row) =>
                row.transitionKind ===
                'consolidated',
            )
            .every(
              (row) =>
                (
                  row
                    .estimatedTimeBetweenSeconds ??
                  Number.POSITIVE_INFINITY
                ) <=
                  CONSOLIDATION_THRESHOLD_SECONDS &&
                (
                  row
                    .gapDifferenceSeconds ??
                  Number.POSITIVE_INFINITY
                ) <=
                  CONSOLIDATION_GAP_DIFFERENCE_SECONDS,
            ),
      },
      {
        label:
          'Transition events precede finish events emitted in the same tick',
        passed:
          allRows.every(
            (row) =>
              row
                .precedesSameTickFinishEvents,
          ),
      },
      {
        label:
          'All event sequences remain contiguous from one',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .sequenceMismatchCount ===
              0,
          ),
      },
      {
        label:
          'Every event clock remains an integer tick-end value',
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
          'Event-enabled controlled runs add exactly one event per transition',
        passed:
          controlled.every(
            (scenario) =>
              scenario.summary
                .addedEventCount ===
              scenario.summary
                .transitionCount,
          ),
      },
      {
        label:
          'All scenarios complete with 96 contiguous results',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.enabled
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
            Ticks
          </dt>
          <dd>
            {summary.tickCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Transitions / events
          </dt>
          <dd>
            {summary.transitionCount}
            {' / '}
            {summary.transitionEventCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Created / caught
          </dt>
          <dd>
            {summary
              .groupCreatedEventCount}
            {' / '}
            {summary
              .groupCaughtEventCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Events baseline → enabled
          </dt>
          <dd>
            {summary.baselineEventCount}
            {' → '}
            {summary.eventsEnabledEventCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Transition sequence
          </dt>
          <dd>
            {summary
              .firstTransitionEventSequence ??
            '—'}
            {' → '}
            {summary
              .lastTransitionEventSequence ??
            '—'}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Payload mismatches
          </dt>
          <dd>
            {summary
              .payloadMismatchCount}
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
            Event hash
          </dt>
          <dd className="font-mono text-xs">
            {summary
              .eventsEnabledHash}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Physical hashes
          </dt>
          <dd className="text-right font-mono text-xs">
            {summary
              .baselinePhysicalHash}
            <br />
            {summary
              .eventsEnabledPhysicalHash}
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

function EventTable({
  scenario,
}: {
  readonly scenario:
    ScenarioAudit
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.definition.label} transition events
        </h2>
      </div>

      {scenario.eventRows.length >
      0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">
                  #
                </th>
                <th className="px-3 py-3">
                  Sequence / type
                </th>
                <th className="px-3 py-3">
                  Time / km
                </th>
                <th className="px-3 py-3">
                  Source → target
                </th>
                <th className="px-3 py-3">
                  Moved / source left
                </th>
                <th className="px-3 py-3">
                  Target before → after
                </th>
                <th className="px-3 py-3">
                  Counter
                </th>
                <th className="px-3 py-3">
                  Proximity
                </th>
                <th className="px-3 py-3">
                  Event / payload / counter / size / order
                </th>
              </tr>
            </thead>

            <tbody>
              {scenario.eventRows.map(
                (row) => (
                  <tr
                    key={`${row.transitionNumber}-${row.eventSequenceNumber}`}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3">
                      {row.transitionNumber}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {row
                        .eventSequenceNumber}
                      {' / '}
                      {row.eventType}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {row.raceSecond}s
                      {' / '}
                      {format(
                        row.kilometre,
                      )} km
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {row.sourceGroupId}
                      {' → '}
                      {row.targetGroupId}
                    </td>

                    <td className="px-3 py-3">
                      {row.movedRiderCount}
                      {' / '}
                      {row
                        .sourceRemainingRiderCount}
                    </td>

                    <td className="px-3 py-3">
                      {row
                        .targetRiderCountBefore}
                      {' → '}
                      {row
                        .targetRiderCountAfter}
                    </td>

                    <td className="px-3 py-3">
                      {row
                        .previousDroppedGroupNumber}
                      {' → '}
                      {row
                        .nextDroppedGroupNumber}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {optional(
                        row
                          .estimatedTimeBetweenSeconds,
                        's',
                      )}
                      {' / '}
                      {optional(
                        row
                          .gapDifferenceSeconds,
                        's',
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {row
                        .eventMatchesTransition
                        ? 'PASS'
                        : 'FAIL'}
                      {' / '}
                      {row.payloadMatches
                        ? 'PASS'
                        : 'FAIL'}
                      {' / '}
                      {row.counterRuleMatches
                        ? 'PASS'
                        : 'FAIL'}
                      {' / '}
                      {row.targetSizeRuleMatches
                        ? 'PASS'
                        : 'FAIL'}
                      {' / '}
                      {row.precedesSameTickFinishEvents
                        ? 'PASS'
                        : 'FAIL'}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-5 text-sm text-slate-400">
          No transition event occurred.
        </p>
      )}
    </section>
  )
}

export default function DroppedTransitionEventsDiagnostic():
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
            Phase 7B.8J development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped transition event audit failed
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
            Phase 7B.8J development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Deterministic dropped-transition race events
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Appends one GROUP_CREATED event for each new dropped group and one
            GROUP_CAUGHT event for each consolidation. Event emission remains
            disabled by default.
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
              ? 'PASS — every dropped transition emits one deterministic authoritative event without changing race behaviour'
              : 'FAIL — dropped transition event emission needs correction'}
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
            <EventTable
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
            Dropped transition events remain disabled by default in the inactive
            runner. No new event type is introduced. Active execution,
            production routes, replay persistence, and Supabase remain
            unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
