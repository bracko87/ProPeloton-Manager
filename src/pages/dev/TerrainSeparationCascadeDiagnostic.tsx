/**
 * TerrainSeparationCascadeDiagnostic.tsx
 *
 * Phase 7B.8C browser-only calibration audit.
 *
 * Uses the inactive integrated terrain-separation runner to measure:
 * - repeated separation on a long constant 8% climb;
 * - pressure recovery after a short 8% section followed by flat road;
 * - moderate constant 5% behaviour; and
 * - severe constant 12% behaviour.
 *
 * No active production runner, event contract, replay output, persistence, or
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
  | 'moderate5'
  | 'long8'
  | 'severe12'
  | 'recovery'

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface ScenarioDefinition {
  readonly key: ScenarioKey
  readonly label: string
  readonly input: StageInput
}

interface TransitionRow {
  readonly transitionNumber: number
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly movedRiderCount: number
  readonly movedRiderNames:
    readonly string[]
  readonly sourceRemainingRiderCount: number
  readonly targetRiderCount: number
}

interface GroupFinishRow {
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly riderCount: number
  readonly createdAtRaceSecond: number
  readonly createdAtKm: number
  readonly finishSecond: number
  readonly finishGapSeconds: number
}

interface ScenarioSummary {
  readonly label: string
  readonly tickCount: number
  readonly durationSeconds: number
  readonly transitionCount: number
  readonly totalMovedRiderCount: number
  readonly finalGroupCount: number
  readonly maximumActiveGroupCount: number
  readonly maximumCannotHoldCount: number
  readonly maximumPressureSeconds: number
  readonly maximumPhysicalGapSeconds: number
  readonly maximumPhysicalGapMetres: number
  readonly minimumCreatedDroppedGroupSize: number | null
  readonly minimumSourceRemainingSize: number | null
  readonly resultCount: number
  readonly completionEventCount: number
  readonly allFinalPressureCountersZero: boolean
  readonly ranksContiguous: boolean
  readonly transitionTargetsUnique: boolean
  readonly transitionsChronological: boolean
  readonly hash: string
}

interface ScenarioAudit {
  readonly definition:
    ScenarioDefinition
  readonly run:
    RunIntegratedTerrainSeparationStageResult
  readonly summary:
    ScenarioSummary
  readonly transitions:
    readonly TransitionRow[]
  readonly groupFinishes:
    readonly GroupFinishRow[]
}

interface RecoveryAudit {
  readonly firstFlatTickNumber: number
  readonly firstFlatRaceSecond: number
  readonly maximumPressureBeforeFlatSeconds: number
  readonly maximumPressureOnFirstFlatTickSeconds: number
  readonly ridersResetOnFirstFlatTick: number
  readonly transitionCountBeforeFlat: number
  readonly transitionCountAfterFlat: number
  readonly noDelayedTransition: boolean
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly repeatedRunsIdentical: boolean
  readonly scenarios:
    Readonly<
      Record<
        ScenarioKey,
        ScenarioAudit
      >
    >
  readonly recovery:
    RecoveryAudit
  readonly moderateTransitionRatioVsEight: number
  readonly severeTransitionRatioVsEight: number
  readonly firstEightTransitionSize: number
  readonly firstTwelveTransitionSize: number
  readonly firstEightTransitionSecond: number
  readonly firstTwelveTransitionSecond: number
  readonly eightAndTwelveFirstWaveMatch: boolean
  readonly checks:
    readonly CheckResult[]
}

const TERRAIN_INFLUENCE =
  0.5

const SEPARATION_WINDOW_SECONDS =
  120

const CONSTANT_STAGE_DISTANCE_KM =
  10

const RECOVERY_CLIMB_END_KM =
  0.7

const RECOVERY_STAGE_DISTANCE_KM =
  4

function baseInput():
  StageInput {
  return createStageInputFromSourceRows(
    rioStage1SourceRows,
  )
}

function constantGradientInput(
  gradientPercent: number,
  suffix: string,
  label: string,
): StageInput {
  const base =
    baseInput()

  return {
    ...base,
    raceId:
      `${base.raceId}-${suffix}`,
    stageId:
      `${base.stageId}-${suffix}`,
    stageName:
      label,
    distanceKm:
      CONSTANT_STAGE_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          CONSTANT_STAGE_DISTANCE_KM,
        elevationMetres:
          CONSTANT_STAGE_DISTANCE_KM *
          1000 *
          (
            gradientPercent /
            100
          ),
      },
    ],
    orders: [],
  }
}

function recoveryInput():
  StageInput {
  const base =
    baseInput()

  const climbElevationMetres =
    RECOVERY_CLIMB_END_KM *
    1000 *
    0.08

  return {
    ...base,
    raceId:
      `${base.raceId}-recovery-audit`,
    stageId:
      `${base.stageId}-recovery-audit`,
    stageName:
      '8% pressure followed by flat recovery',
    distanceKm:
      RECOVERY_STAGE_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          RECOVERY_CLIMB_END_KM,
        elevationMetres:
          climbElevationMetres,
      },
      {
        kilometre:
          RECOVERY_STAGE_DISTANCE_KM,
        elevationMetres:
          climbElevationMetres,
      },
    ],
    orders: [],
  }
}

function definitions():
  readonly ScenarioDefinition[] {
  return [
    {
      key:
        'moderate5',
      label:
        'Constant 5% · 10 km',
      input:
        constantGradientInput(
          5,
          'cascade-5-percent',
          'Cascade audit · constant 5%',
        ),
    },
    {
      key:
        'long8',
      label:
        'Constant 8% · 10 km',
      input:
        constantGradientInput(
          8,
          'cascade-8-percent',
          'Cascade audit · constant 8%',
        ),
    },
    {
      key:
        'severe12',
      label:
        'Constant 12% · 10 km',
      input:
        constantGradientInput(
          12,
          'cascade-12-percent',
          'Cascade audit · constant 12%',
        ),
    },
    {
      key:
        'recovery',
      label:
        '0.7 km at 8%, then flat',
      input:
        recoveryInput(),
    },
  ]
}

function runScenario(
  definition:
    ScenarioDefinition,
): RunIntegratedTerrainSeparationStageResult {
  return runIntegratedTerrainSeparationStage(
    createInitialState(
      definition.input,
    ),
    {
      terrainCapabilityInfluence:
        TERRAIN_INFLUENCE,
      separationWindowSeconds:
        SEPARATION_WINDOW_SECONDS,
      maximumTickCount:
        20_000,
    },
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

function maximumPressureSeconds(
  tick:
    IntegratedTerrainSeparationTickResult,
): number {
  return Math.max(
    0,
    ...tick.pressureEvaluations
      .map(
        (evaluation) =>
          evaluation
            .eligibility
            .nextConsecutiveCannotHoldSeconds,
      ),
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
      'TerrainSeparationCascadeDiagnostic: transition groups are missing.',
    )
  }

  return {
    transitionNumber,
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
    targetRiderCount:
      targetGroup.riderIds
        .length,
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
      (left, right) => {
        if (
          left.createdAtRaceSecond !==
          right.createdAtRaceSecond
        ) {
          return (
            left.createdAtRaceSecond -
            right.createdAtRaceSecond
          )
        }

        return left.groupId.localeCompare(
          right.groupId,
        )
      },
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
            `TerrainSeparationCascadeDiagnostic: group ${group.groupId} is missing finish results.`,
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
          finishGapSeconds:
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

function maximumPhysicalGap(
  run:
    RunIntegratedTerrainSeparationStageResult,
): {
  readonly seconds: number
  readonly metres: number
} {
  let seconds = 0
  let metres = 0

  for (const tick of run.ticks) {
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

function scenarioAudit(
  definition:
    ScenarioDefinition,
  run:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioAudit {
  const transitions =
    run.transitions.map(
      (
        transition,
        index,
      ) =>
        transitionRow(
          transition,
          index + 1,
          run.initialState,
        ),
    )

  const activeCounts =
    run.ticks.map(
      (tick) =>
        Object.values(
          tick.state.groups,
        ).filter(
          (group) =>
            group.active,
        ).length,
    )

  const physicalGap =
    maximumPhysicalGap(
      run,
    )

  const transitionTargetIds =
    transitions.map(
      (transition) =>
        transition.targetGroupId,
    )

  const transitionSeconds =
    transitions.map(
      (transition) =>
        transition.raceSecond,
    )

  const transitionsChronological =
    transitionSeconds.every(
      (
        second,
        index,
      ) =>
        index === 0 ||
        second >=
          transitionSeconds[
            index - 1
          ],
    )

  const droppedSizes =
    transitions.map(
      (transition) =>
        transition
          .targetRiderCount,
    )

  const sourceRemainingSizes =
    transitions.map(
      (transition) =>
        transition
          .sourceRemainingRiderCount,
    )

  const summary:
    ScenarioSummary = {
      label:
        definition.label,
      tickCount:
        run.tickCount,
      durationSeconds:
        run.finalState
          .raceSecond,
      transitionCount:
        transitions.length,
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
      finalGroupCount:
        Object.keys(
          run.finalState.groups,
        ).length,
      maximumActiveGroupCount:
        Math.max(
          0,
          ...activeCounts,
        ),
      maximumCannotHoldCount:
        Math.max(
          0,
          ...run.ticks.map(
            (tick) =>
              cannotHoldCount(
                tick,
              ),
          ),
        ),
      maximumPressureSeconds:
        Math.max(
          0,
          ...run.ticks.map(
            (tick) =>
              maximumPressureSeconds(
                tick,
              ),
          ),
        ),
      maximumPhysicalGapSeconds:
        physicalGap.seconds,
      maximumPhysicalGapMetres:
        physicalGap.metres,
      minimumCreatedDroppedGroupSize:
        droppedSizes.length > 0
          ? Math.min(
              ...droppedSizes,
            )
          : null,
      minimumSourceRemainingSize:
        sourceRemainingSizes.length >
        0
          ? Math.min(
              ...sourceRemainingSizes,
            )
          : null,
      resultCount:
        run.results.length,
      completionEventCount:
        run.events.filter(
          (event) =>
            event.eventType ===
            'SIMULATION_COMPLETED',
        ).length,
      allFinalPressureCountersZero:
        Object.values(
          run
            .finalPressureDurationByRiderId,
        ).every(
          (seconds) =>
            seconds === 0,
        ),
      ranksContiguous:
        ranksContiguous(
          run,
        ),
      transitionTargetsUnique:
        new Set(
          transitionTargetIds,
        ).size ===
        transitionTargetIds.length,
      transitionsChronological,
      hash:
        run.deterministicHash,
    }

  return {
    definition,
    run,
    summary,
    transitions,
    groupFinishes:
      groupFinishRows(
        run,
      ),
  }
}

function firstTickWithFlatPressure(
  run:
    RunIntegratedTerrainSeparationStageResult,
): {
  readonly tick:
    IntegratedTerrainSeparationTickResult
  readonly index: number
} {
  const index =
    run.ticks.findIndex(
      (tick) =>
        tick.pressureEvaluations
          .length > 0 &&
        tick.pressureEvaluations
          .every(
            (evaluation) =>
              Math.abs(
                evaluation
                  .gradientPercent,
              ) <
              0.000001,
          ),
    )

  if (index < 0) {
    throw new Error(
      'TerrainSeparationCascadeDiagnostic: recovery scenario never reached flat pressure evaluation.',
    )
  }

  return {
    tick:
      run.ticks[index],
    index,
  }
}

function recoveryAudit(
  scenario:
    ScenarioAudit,
): RecoveryAudit {
  const run =
    scenario.run

  const firstFlat =
    firstTickWithFlatPressure(
      run,
    )

  const previousTick =
    firstFlat.index > 0
      ? run.ticks[
          firstFlat.index - 1
        ]
      : null

  const previousPressure =
    previousTick
      ? previousTick
          .pressureDurationByRiderId
      : {}

  const currentPressure =
    firstFlat.tick
      .pressureDurationByRiderId

  const ridersResetOnFirstFlatTick =
    Object.keys(
      currentPressure,
    ).filter(
      (riderId) =>
        (
          previousPressure[
            riderId
          ] ?? 0
        ) > 0 &&
        (
          currentPressure[
            riderId
          ] ?? 0
        ) === 0,
    ).length

  const maximumPressureBeforeFlatSeconds =
    Math.max(
      0,
      ...run.ticks
        .slice(
          0,
          firstFlat.index,
        )
        .map(
          (tick) =>
            maximumPressureSeconds(
              tick,
            ),
        ),
    )

  const maximumPressureOnFirstFlatTickSeconds =
    maximumPressureSeconds(
      firstFlat.tick,
    )

  const transitionCountBeforeFlat =
    run.transitions.filter(
      (transition) =>
        transition.raceSecond <
        firstFlat.tick
          .state.raceSecond,
    ).length

  const transitionCountAfterFlat =
    run.transitions.filter(
      (transition) =>
        transition.raceSecond >=
        firstFlat.tick
          .state.raceSecond,
    ).length

  return {
    firstFlatTickNumber:
      firstFlat.index + 1,
    firstFlatRaceSecond:
      firstFlat.tick
        .state.raceSecond,
    maximumPressureBeforeFlatSeconds,
    maximumPressureOnFirstFlatTickSeconds,
    ridersResetOnFirstFlatTick,
    transitionCountBeforeFlat,
    transitionCountAfterFlat,
    noDelayedTransition:
      transitionCountAfterFlat ===
      0,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const scenarioDefinitions =
    definitions()

  const firstRuns =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          runScenario(
            definition,
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      RunIntegratedTerrainSeparationStageResult
    >

  const secondRuns =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          runScenario(
            definition,
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      RunIntegratedTerrainSeparationStageResult
    >

  const repeatedRunsIdentical =
    scenarioDefinitions.every(
      (definition) =>
        firstRuns[
          definition.key
        ].deterministicHash ===
        secondRuns[
          definition.key
        ].deterministicHash,
    )

  const scenarios =
    Object.fromEntries(
      scenarioDefinitions.map(
        (definition) => [
          definition.key,
          scenarioAudit(
            definition,
            firstRuns[
              definition.key
            ],
          ),
        ],
      ),
    ) as Record<
      ScenarioKey,
      ScenarioAudit
    >

  const recovery =
    recoveryAudit(
      scenarios.recovery,
    )

  const eightTransitions =
    scenarios.long8
      .summary
      .transitionCount

  const moderateTransitionRatioVsEight =
    eightTransitions > 0
      ? scenarios.moderate5
          .summary
          .transitionCount /
        eightTransitions
      : 0

  const severeTransitionRatioVsEight =
    eightTransitions > 0
      ? scenarios.severe12
          .summary
          .transitionCount /
        eightTransitions
      : 0

  const firstEightTransition =
    scenarios.long8
      .transitions[0]

  const firstTwelveTransition =
    scenarios.severe12
      .transitions[0]

  const firstEightTransitionSize =
    firstEightTransition
      ?.movedRiderCount ?? 0

  const firstTwelveTransitionSize =
    firstTwelveTransition
      ?.movedRiderCount ?? 0

  const firstEightTransitionSecond =
    firstEightTransition
      ?.raceSecond ?? -1

  const firstTwelveTransitionSecond =
    firstTwelveTransition
      ?.raceSecond ?? -1

  const eightAndTwelveFirstWaveMatch =
    firstEightTransitionSize >
      0 &&
    firstEightTransitionSize ===
      firstTwelveTransitionSize &&
    firstEightTransitionSecond ===
      firstTwelveTransitionSecond

  const allScenarios =
    Object.values(
      scenarios,
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated runs are identical for all four scenarios',
        passed:
          repeatedRunsIdentical,
      },
      {
        label:
          'Every scenario completes successfully',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.run
                .completed,
          ),
      },
      {
        label:
          'Every scenario produces all 96 results',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .resultCount === 96,
          ),
      },
      {
        label:
          'Every scenario has contiguous ranks',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .ranksContiguous,
          ),
      },
      {
        label:
          'Every scenario emits exactly one completion event',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .completionEventCount ===
              1,
          ),
      },
      {
        label:
          'Every scenario ends with all pressure counters reset',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .allFinalPressureCountersZero,
          ),
      },
      {
        label:
          'All transition target group IDs are unique',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .transitionTargetsUnique,
          ),
      },
      {
        label:
          'All transitions are chronological',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario.summary
                .transitionsChronological,
          ),
      },
      {
        label:
          'No transition empties its source group',
        passed:
          allScenarios.every(
            (scenario) =>
              (
                scenario.summary
                  .minimumSourceRemainingSize ??
                1
              ) > 0,
          ),
      },
      {
        label:
          'The long 8% climb creates repeated separation waves',
        passed:
          scenarios.long8
            .summary
            .transitionCount >=
          2,
      },
      {
        label:
          'The recovery scenario accumulates pressure before flat terrain',
        passed:
          recovery
            .maximumPressureBeforeFlatSeconds >
          0,
      },
      {
        label:
          'The first flat tick resets the accumulated pressure',
        passed:
          recovery
            .maximumPressureOnFirstFlatTickSeconds ===
            0 &&
          recovery
            .ridersResetOnFirstFlatTick >
            0,
      },
      {
        label:
          'Recovery prevents a delayed dropped-group transition',
        passed:
          recovery
            .noDelayedTransition,
      },
      {
        label:
          'The moderate 5% scenario is no more aggressive than the long 8% scenario',
        passed:
          scenarios.moderate5
            .summary
            .transitionCount <=
          scenarios.long8
            .summary
            .transitionCount,
      },
      {
        label:
          'The severe 12% scenario is at least as aggressive as the long 8% scenario',
        passed:
          scenarios.severe12
            .summary
            .transitionCount >=
          scenarios.long8
            .summary
            .transitionCount,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    repeatedRunsIdentical,
    scenarios,
    recovery,
    moderateTransitionRatioVsEight,
    severeTransitionRatioVsEight,
    firstEightTransitionSize,
    firstTwelveTransitionSize,
    firstEightTransitionSecond,
    firstTwelveTransitionSecond,
    eightAndTwelveFirstWaveMatch,
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

function formatNullable(
  value: number | null,
): string {
  return value === null
    ? 'None'
    : String(value)
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

function ScenarioSummaryCard({
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
            Duration / ticks
          </dt>
          <dd>
            {summary.durationSeconds}s
            {' / '}
            {summary.tickCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Transitions / moved
          </dt>
          <dd>
            {summary.transitionCount}
            {' / '}
            {summary.totalMovedRiderCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Final / max active groups
          </dt>
          <dd>
            {summary.finalGroupCount}
            {' / '}
            {summary.maximumActiveGroupCount}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Max cannot hold / pressure
          </dt>
          <dd>
            {summary.maximumCannotHoldCount}
            {' / '}
            {summary.maximumPressureSeconds}s
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Max physical gap
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
            Smallest dropped / source left
          </dt>
          <dd>
            {formatNullable(
              summary
                .minimumCreatedDroppedGroupSize,
            )}
            {' / '}
            {formatNullable(
              summary
                .minimumSourceRemainingSize,
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt>
            Hash
          </dt>
          <dd className="font-mono text-xs">
            {summary.hash}
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
          {scenario.summary.label} transitions
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          {scenario.transitions.length ===
          0
            ? 'No dropped-group transition occurred.'
            : `${scenario.transitions.length} transition waves`}
        </p>
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
                  Source → target
                </th>
                <th className="px-3 py-3">
                  Time
                </th>
                <th className="px-3 py-3">
                  Kilometre
                </th>
                <th className="px-3 py-3">
                  Moved
                </th>
                <th className="px-3 py-3">
                  Source left
                </th>
                <th className="px-3 py-3">
                  Riders
                </th>
              </tr>
            </thead>

            <tbody>
              {scenario.transitions.map(
                (transition) => (
                  <tr
                    key={
                      transition.targetGroupId
                    }
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3">
                      {transition
                        .transitionNumber}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {transition
                        .sourceGroupId}
                      {' → '}
                      {transition
                        .targetGroupId}
                    </td>

                    <td className="px-3 py-3">
                      {transition.raceSecond}s
                    </td>

                    <td className="px-3 py-3">
                      {format(
                        transition.kilometre,
                        3,
                      )} km
                    </td>

                    <td className="px-3 py-3">
                      {transition
                        .movedRiderCount}
                    </td>

                    <td className="px-3 py-3">
                      {transition
                        .sourceRemainingRiderCount}
                    </td>

                    <td className="min-w-[320px] px-3 py-3 text-slate-300">
                      {transition
                        .movedRiderNames
                        .join(', ')}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : null}
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
          {scenario.summary.label} group finishes
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
                    {group.finishGapSeconds}s
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

export default function TerrainSeparationCascadeDiagnostic():
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
            Phase 7B.8C development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Cascade and recovery audit failed
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
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8C development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Long-climb cascade and recovery audit
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Uses the inactive 50%-terrain, 120-second separation runner on
            constant 5%, 8%, and 12% stages plus an 8%-to-flat recovery stage.
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
              ? 'PASS — cascade behaviour is deterministic and accumulated pressure resets on recovery'
              : 'FAIL — cascade or recovery behaviour needs correction'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ScenarioSummaryCard
            scenario={
              value.scenarios
                .moderate5
            }
          />

          <ScenarioSummaryCard
            scenario={
              value.scenarios
                .long8
            }
          />

          <ScenarioSummaryCard
            scenario={
              value.scenarios
                .severe12
            }
          />

          <ScenarioSummaryCard
            scenario={
              value.scenarios
                .recovery
            }
          />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Recovery audit
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              [
                'First flat tick',
                value.recovery
                  .firstFlatTickNumber,
              ],
              [
                'First flat second',
                `${value.recovery
                  .firstFlatRaceSecond}s`,
              ],
              [
                'Max pressure before flat',
                `${value.recovery
                  .maximumPressureBeforeFlatSeconds}s`,
              ],
              [
                'Pressure on first flat tick',
                `${value.recovery
                  .maximumPressureOnFirstFlatTickSeconds}s`,
              ],
              [
                'Riders reset',
                value.recovery
                  .ridersResetOnFirstFlatTick,
              ],
              [
                'Transitions after flat',
                value.recovery
                  .transitionCountAfterFlat,
              ],
            ].map(
              ([label, display]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl bg-slate-950 p-4"
                >
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {label}
                  </dt>

                  <dd className="mt-2 text-xl font-semibold">
                    {display}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Terrain comparison
          </h2>

          <dl className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                5% transitions / 8%
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {format(
                  value
                    .moderateTransitionRatioVsEight,
                  3,
                )}×
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                12% transitions / 8%
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {format(
                  value
                    .severeTransitionRatioVsEight,
                  3,
                )}×
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                First 8% wave
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value
                  .firstEightTransitionSize}
                {' riders at '}
                {value
                  .firstEightTransitionSecond}s
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                First 12% wave
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value
                  .firstTwelveTransitionSize}
                {' riders at '}
                {value
                  .firstTwelveTransitionSecond}s
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm leading-6 text-slate-300">
            {value
              .eightAndTwelveFirstWaveMatch
              ? 'The first 8% and 12% separation waves are identical. This is a calibration signal that rider capability and shelter currently saturate at 8%; additional 12% severity mainly comes from slower speed and longer exposure.'
              : 'The first 8% and 12% separation waves differ under the current candidate model.'}
          </p>
        </section>

        <TransitionTable
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

        <TransitionTable
          scenario={
            value.scenarios
              .severe12
          }
        />

        <TransitionTable
          scenario={
            value.scenarios
              .recovery
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .moderate5
          }
        />

        <FinishTable
          scenario={
            value.scenarios
              .long8
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
            This page only calls the separate inactive integrated runner.
            simulateMultiGroupTick, runMultiGroupStage, transition events,
            replay persistence, production routes, and Supabase are unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
