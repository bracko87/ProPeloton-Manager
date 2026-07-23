/**
 * DroppedWaveConsolidationApplicationDiagnostic.tsx
 *
 * Phase 7B.8E browser-only diagnostic.
 *
 * Compares the inactive integrated terrain-separation runner with consolidation
 * disabled and enabled at:
 *
 * - maximum estimated time between groups: 5 seconds;
 * - maximum absolute gap difference: 5 seconds.
 *
 * No production runner, event contract, replay output, persistence, or
 * Supabase behaviour is changed.
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
  type RunIntegratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type ScenarioKey =
  | 'moderate5'
  | 'long8'
  | 'severe12'

interface ScenarioDefinition {
  readonly key: ScenarioKey
  readonly label: string
  readonly gradientPercent: number
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
  readonly distanceBetweenMetres:
    number | null
  readonly movedRidersInheritedTargetState:
    boolean
  readonly targetMetadataPreserved:
    boolean
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
  readonly consolidatedHash: string
  readonly baselineTickCount: number
  readonly consolidatedTickCount: number
  readonly baselineTransitionCount: number
  readonly consolidationEnabledTransitionCount: number
  readonly createdTransitionCount: number
  readonly consolidatedWaveCount: number
  readonly baselineFinalGroupCount: number
  readonly consolidatedFinalGroupCount: number
  readonly baselineDroppedGroupCount: number
  readonly consolidatedDroppedGroupCount: number
  readonly totalMovedRiderCount: number
  readonly finalDroppedGroupNumber: number
  readonly resultCount: number
  readonly completionEventCount: number
  readonly allPressureCountersReset: boolean
  readonly ranksContiguous: boolean
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly baseline:
    RunIntegratedTerrainSeparationStageResult
  readonly consolidated:
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

const STAGE_DISTANCE_KM =
  10

function definitions():
  readonly ScenarioDefinition[] {
  return [
    {
      key:
        'moderate5',
      label:
        'Constant 5% · 10 km',
      gradientPercent: 5,
    },
    {
      key:
        'long8',
      label:
        'Constant 8% · 10 km',
      gradientPercent: 8,
    },
    {
      key:
        'severe12',
      label:
        'Constant 12% · 10 km',
      gradientPercent: 12,
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

  return {
    ...base,
    raceId:
      `${base.raceId}-consolidation-application-${definition.key}`,
    stageId:
      `${base.stageId}-consolidation-application-${definition.key}`,
    stageName:
      `Consolidation application · ${definition.label}`,
    distanceKm:
      STAGE_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          STAGE_DISTANCE_KM,
        elevationMetres:
          STAGE_DISTANCE_KM *
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
  consolidationEnabled: boolean,
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
        consolidationEnabled,
      droppedWaveConsolidationThresholdSeconds:
        CONSOLIDATION_THRESHOLD_SECONDS,
      droppedWaveConsolidationGapDifferenceSeconds:
        CONSOLIDATION_GAP_DIFFERENCE_SECONDS,
      maximumTickCount:
        20_000,
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

function transitionRow(
  transition:
    IntegratedDroppedTransition,
  transitionNumber: number,
  initialState:
    RunIntegratedTerrainSeparationStageResult['initialState'],
): TransitionRow {
  const applicationState =
    transition.application
      .state

  const sourceGroup =
    applicationState.groups[
      transition.sourceGroupId
    ]

  const targetGroup =
    applicationState.groups[
      transition.targetGroupId
    ]

  if (
    !sourceGroup ||
    !targetGroup
  ) {
    throw new Error(
      'DroppedWaveConsolidationApplicationDiagnostic: transition groups are missing.',
    )
  }

  const movedRidersInheritedTargetState =
    transition.movedRiderIds
      .every(
        (riderId) => {
          const rider =
            applicationState.riders[
              riderId
            ]

          return (
            rider
              ?.currentGroupId ===
              targetGroup.groupId &&
            rider.distanceKm ===
              targetGroup.distanceKm &&
            rider.speedKmh ===
              targetGroup.speedKmh
          )
        },
      )

  const consolidationProposal =
    isConsolidationProposal(
      transition,
    )
      ? transition.proposal
      : null

  const targetMetadataPreserved =
    consolidationProposal
      ? (
          targetGroup.createdAtRaceSecond ===
            consolidationProposal
              .targetCreatedAtRaceSecond &&
          targetGroup.createdAtKm ===
            consolidationProposal
              .targetCreatedAtKm &&
          targetGroup.distanceKm ===
            consolidationProposal
              .targetDistanceKm &&
          targetGroup.speedKmh ===
            consolidationProposal
              .targetSpeedKmh &&
          targetGroup.gapFromLeaderSeconds ===
            consolidationProposal
              .targetGapFromLeaderSeconds
        )
      : true

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
            initialState.riders[
              riderId
            ]?.riderName ??
            riderId,
        ),
    sourceRemainingRiderCount:
      sourceGroup.riderIds
        .length,
    targetRiderCountAfter:
      targetGroup.riderIds
        .length,
    previousDroppedGroupNumber:
      transition.application
        .previousDroppedGroupNumber,
    nextDroppedGroupNumber:
      transition.application
        .nextDroppedGroupNumber,
    estimatedTimeBetweenSeconds:
      consolidationProposal
        ?.estimatedTimeBetweenSeconds ??
      null,
    gapDifferenceSeconds:
      consolidationProposal
        ?.gapDifferenceSeconds ??
      null,
    distanceBetweenMetres:
      consolidationProposal
        ?.distanceBetweenMetres ??
      null,
    movedRidersInheritedTargetState,
    targetMetadataPreserved,
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
        const groupResults =
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
          groupResults.length !==
          group.riderIds.length
        ) {
          throw new Error(
            `DroppedWaveConsolidationApplicationDiagnostic: missing results for ${group.groupId}.`,
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
              ...groupResults.map(
                (result) =>
                  result
                    .elapsedSeconds,
              ),
            ),
          resultGapSeconds:
            Math.min(
              ...groupResults.map(
                (result) =>
                  result.gapSeconds,
              ),
            ),
        }
      },
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

function scenarioAudit(
  definition:
    ScenarioDefinition,
  baseline:
    RunIntegratedTerrainSeparationStageResult,
  consolidated:
    RunIntegratedTerrainSeparationStageResult,
  repeated:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const transitions =
    consolidated.transitions
      .map(
        (
          transition,
          index,
        ) =>
          transitionRow(
            transition,
            index + 1,
            consolidated
              .initialState,
          ),
      )

  const createdTransitionCount =
    transitions.filter(
      (transition) =>
        transition.transitionKind ===
        'created',
    ).length

  const consolidatedWaveCount =
    transitions.filter(
      (transition) =>
        transition.transitionKind ===
        'consolidated',
    ).length

  const baselineDroppedGroupCount =
    Object.values(
      baseline.finalState.groups,
    ).filter(
      (group) =>
        group.groupType ===
        'dropped',
    ).length

  const consolidatedDroppedGroupCount =
    Object.values(
      consolidated
        .finalState.groups,
    ).filter(
      (group) =>
        group.groupType ===
        'dropped',
    ).length

  const summary:
    ScenarioSummary = {
      label:
        definition.label,
      baselineHash:
        baseline.deterministicHash,
      consolidatedHash:
        consolidated
          .deterministicHash,
      baselineTickCount:
        baseline.tickCount,
      consolidatedTickCount:
        consolidated.tickCount,
      baselineTransitionCount:
        baseline.transitions.length,
      consolidationEnabledTransitionCount:
        consolidated
          .transitions.length,
      createdTransitionCount,
      consolidatedWaveCount,
      baselineFinalGroupCount:
        Object.keys(
          baseline.finalState.groups,
        ).length,
      consolidatedFinalGroupCount:
        Object.keys(
          consolidated
            .finalState.groups,
        ).length,
      baselineDroppedGroupCount,
      consolidatedDroppedGroupCount,
      totalMovedRiderCount:
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
      finalDroppedGroupNumber:
        consolidated
          .finalState
          .nextDroppedGroupNumber,
      resultCount:
        consolidated
          .results.length,
      completionEventCount:
        consolidated.events
          .filter(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          )
          .length,
      allPressureCountersReset:
        Object.values(
          consolidated
            .finalPressureDurationByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
      ranksContiguous:
        ranksContiguous(
          consolidated,
        ),
    }

  const groupFinishes =
    groupFinishRows(
      consolidated,
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
    consolidated,
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

          const consolidated =
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
              consolidated,
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

  const allConsolidations =
    allScenarios.flatMap(
      (scenario) =>
        scenario.transitions
          .filter(
            (transition) =>
              transition
                .transitionKind ===
              'consolidated',
          ),
    )

  const allCreations =
    allScenarios.flatMap(
      (scenario) =>
        scenario.transitions
          .filter(
            (transition) =>
              transition
                .transitionKind ===
              'created',
          ),
    )

  const movedRiderIdsUnique =
    allScenarios.every(
      (scenario) => {
        const moved =
          scenario.transitions
            .flatMap(
              (transition) =>
                transition
                  .movedRiderIds,
            )

        return (
          new Set(
            moved,
          ).size ===
          moved.length
        )
      },
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated consolidation-enabled runs are identical for all scenarios',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .consolidated
                .deterministicHash ===
              scenario
                .repeated
                .deterministicHash,
          ),
      },
      {
        label:
          'The 5% scenario remains one peloton plus one solo dropped group',
        passed:
          scenarios.moderate5
            .summary
            .consolidatedWaveCount ===
            0 &&
          scenarios.moderate5
            .summary
            .consolidatedFinalGroupCount ===
            2 &&
          scenarios.moderate5
            .summary
            .consolidatedDroppedGroupCount ===
            1,
      },
      {
        label:
          'The 8% scenario performs at least one real consolidation',
        passed:
          scenarios.long8
            .summary
            .consolidatedWaveCount >
          0,
      },
      {
        label:
          'The 12% scenario performs at least one real consolidation',
        passed:
          scenarios.severe12
            .summary
            .consolidatedWaveCount >
          0,
      },
      {
        label:
          'Consolidation reduces final group count on both 8% and 12%',
        passed:
          (
            scenarios.long8
              .summary
              .consolidatedFinalGroupCount <
            scenarios.long8
              .summary
              .baselineFinalGroupCount
          ) &&
          (
            scenarios.severe12
              .summary
              .consolidatedFinalGroupCount <
            scenarios.severe12
              .summary
              .baselineFinalGroupCount
          ),
      },
      {
        label:
          'Consolidation preserves the number of separation waves',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .consolidatedWaveCount +
              scenario.summary
                .createdTransitionCount ===
              scenario.summary
                .baselineTransitionCount,
          ),
      },
      {
        label:
          'Every consolidation satisfies both five-second thresholds',
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
          'Every consolidation preserves nextDroppedGroupNumber',
        passed:
          allConsolidations.every(
            (transition) =>
              transition
                .previousDroppedGroupNumber ===
              transition
                .nextDroppedGroupNumber,
          ),
      },
      {
        label:
          'Every new dropped-group creation increments the counter by one',
        passed:
          allCreations.every(
            (transition) =>
              transition
                .nextDroppedGroupNumber ===
              transition
                .previousDroppedGroupNumber +
                1,
          ),
      },
      {
        label:
          'Final counter equals initial counter plus created groups',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .finalDroppedGroupNumber ===
              scenario
                .consolidated
                .initialState
                .nextDroppedGroupNumber +
                scenario.summary
                  .createdTransitionCount,
          ),
      },
      {
        label:
          'Final group count equals initial groups plus created transitions',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .consolidatedFinalGroupCount ===
              Object.keys(
                scenario
                  .consolidated
                  .initialState
                  .groups,
              ).length +
                scenario.summary
                  .createdTransitionCount,
          ),
      },
      {
        label:
          'Every moved rider inherits target membership, position, and speed',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.transitions
                .every(
                  (transition) =>
                    transition
                      .movedRidersInheritedTargetState,
                ),
          ),
      },
      {
        label:
          'Every consolidation preserves target identity and movement metadata',
        passed:
          allConsolidations.every(
            (transition) =>
              transition
                .targetMetadataPreserved,
          ),
      },
      {
        label:
          'No transition empties its source group',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.transitions
                .every(
                  (transition) =>
                    transition
                      .sourceRemainingRiderCount >
                    0,
                ),
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
          'All scenarios complete with 96 contiguous results',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .consolidated
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
  digits = 2,
): string {
  return value.toFixed(
    digits,
  )
}

function optionalSeconds(
  value: number | null,
): string {
  return value === null
    ? '—'
    : `${format(
        value,
      )}s`
}

function optionalMetres(
  value: number | null,
): string {
  return value === null
    ? '—'
    : `${format(
        value,
        1,
      )}m`
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
            Baseline / consolidated ticks
          </dt>
          <dd>
            {summary.baselineTickCount}
            {' / '}
            {summary.consolidatedTickCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Waves
          </dt>
          <dd>
            {summary.consolidatedWaveCount}
            {' consolidated + '}
            {summary.createdTransitionCount}
            {' created'}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Final groups
          </dt>
          <dd>
            {summary.baselineFinalGroupCount}
            {' → '}
            {summary.consolidatedFinalGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Dropped groups
          </dt>
          <dd>
            {summary.baselineDroppedGroupCount}
            {' → '}
            {summary.consolidatedDroppedGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Moved riders
          </dt>
          <dd>
            {summary.totalMovedRiderCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Final dropped counter
          </dt>
          <dd>
            {summary.finalDroppedGroupNumber}
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
            Consolidated hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.consolidatedHash}
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
          {scenario.definition.label} transitions
        </h2>
      </div>

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
              <th className="px-3 py-3">
                Inherited / preserved
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
                      transition
                        .kilometre,
                      3,
                    )} km
                  </td>

                  <td className="min-w-[300px] px-3 py-3 text-slate-300">
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
                    {optionalSeconds(
                      transition
                        .estimatedTimeBetweenSeconds,
                    )}
                    {' / '}
                    {optionalSeconds(
                      transition
                        .gapDifferenceSeconds,
                    )}
                    {' / '}
                    {optionalMetres(
                      transition
                        .distanceBetweenMetres,
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {transition
                      .previousDroppedGroupNumber}
                    {' → '}
                    {transition
                      .nextDroppedGroupNumber}
                  </td>

                  <td className="px-3 py-3">
                    {transition
                      .movedRidersInheritedTargetState
                      ? 'PASS'
                      : 'FAIL'}
                    {' / '}
                    {transition
                      .targetMetadataPreserved
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

export default function DroppedWaveConsolidationApplicationDiagnostic():
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
            Phase 7B.8E development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Immutable consolidation failed
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
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8E development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Immutable dropped-wave consolidation
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Enables the five-second consolidation candidate only inside the
            inactive integrated runner and compares it with the unchanged
            consolidation-disabled baseline.
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
              ? 'PASS — nearby waves consolidate immutably without consuming a new dropped-group number'
              : 'FAIL — immutable consolidation needs correction'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            scenario={
              value.scenarios
                .moderate5
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .long8
            }
          />

          <SummaryCard
            scenario={
              value.scenarios
                .severe12
            }
          />
        </section>

        <TransitionTable
          scenario={
            value.scenarios
              .moderate5
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .moderate5
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .long8
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .long8
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .severe12
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .severe12
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
            Consolidation is disabled by default in the inactive runner. This
            diagnostic explicitly enables it. simulateMultiGroupTick,
            runMultiGroupStage, production routes, events, replay persistence,
            and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
