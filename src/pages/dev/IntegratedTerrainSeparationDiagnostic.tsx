/**
 * IntegratedTerrainSeparationDiagnostic.tsx
 *
 * Phase 7B.8B browser-only diagnostic.
 *
 * Runs the inactive integrated pipeline with:
 * - 50% terrain-capability influence; and
 * - 120 seconds of consecutive cannot-hold pressure.
 *
 * Scenarios:
 * 1. Real Rio Stage 1 — expected to remain one group.
 * 2. Controlled 2.05 km constant-8% stage — expected to create dropped_1
 *    at 120 seconds, grow a physical gap, and finish in separate ticks.
 *
 * simulateMultiGroupTick() and runMultiGroupStage() remain unchanged.
 */

import { useMemo } from 'react'

import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  runIntegratedTerrainSeparationStage,
  type IntegratedTerrainSeparationTickResult,
  type RunIntegratedTerrainSeparationStageResult,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface ControlledTickRow {
  readonly tickNumber: number
  readonly raceSecond: number
  readonly currentKm: number
  readonly activeGroupCount: number
  readonly pelotonRiderCount: number
  readonly pelotonDistanceKm: number
  readonly pelotonGapSeconds: number
  readonly pelotonActive: boolean
  readonly droppedRiderCount: number
  readonly droppedDistanceKm: number | null
  readonly droppedGapSeconds: number | null
  readonly droppedActive: boolean | null
  readonly cannotHoldCount: number
  readonly maximumPressureSeconds: number
  readonly movedThisTick: number
  readonly newlyFinishedCount: number
  readonly completed: boolean
}

interface ScenarioSummary {
  readonly tickCount: number
  readonly transitionCount: number
  readonly maximumActiveGroupCount: number
  readonly maximumCannotHoldCount: number
  readonly maximumPressureSeconds: number
  readonly resultCount: number
  readonly completionEventCount: number
  readonly hash: string
}

interface DiagnosticResult {
  readonly passed: boolean

  readonly rio:
    RunIntegratedTerrainSeparationStageResult
  readonly rioSummary:
    ScenarioSummary

  readonly controlled:
    RunIntegratedTerrainSeparationStageResult
  readonly controlledSummary:
    ScenarioSummary
  readonly controlledRows:
    readonly ControlledTickRow[]

  readonly transitionSecond: number
  readonly transitionKilometre: number
  readonly movedRiderIds:
    readonly string[]
  readonly movedRiderNames:
    readonly string[]

  readonly pelotonFinishSecond: number
  readonly droppedFinishSecond: number
  readonly droppedResultGapSeconds: number
  readonly maximumPhysicalGapSeconds: number
  readonly maximumPhysicalGapMetres: number

  readonly repeatedRioIdentical: boolean
  readonly repeatedControlledIdentical: boolean

  readonly checks:
    readonly CheckResult[]
}

const TERRAIN_INFLUENCE =
  0.5

const SEPARATION_WINDOW_SECONDS =
  120

const CONTROLLED_DISTANCE_KM =
  2.05

const CONTROLLED_GRADIENT_PERCENT =
  8

const DROPPED_GROUP_ID =
  'dropped_1'

function createRioInput():
  StageInput {
  return createStageInputFromSourceRows(
    rioStage1SourceRows,
  )
}

function createControlledInput():
  StageInput {
  const base =
    createRioInput()

  return {
    ...base,
    raceId:
      `${base.raceId}-integrated-8-percent`,
    stageId:
      `${base.stageId}-integrated-8-percent`,
    stageName:
      'Integrated terrain separation · constant 8%',
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
            CONTROLLED_GRADIENT_PERCENT /
            100
          ),
      },
    ],
    orders: [],
  }
}

function runStage(
  input: StageInput,
): RunIntegratedTerrainSeparationStageResult {
  return runIntegratedTerrainSeparationStage(
    createInitialState(
      input,
    ),
    {
      terrainCapabilityInfluence:
        TERRAIN_INFLUENCE,
      separationWindowSeconds:
        SEPARATION_WINDOW_SECONDS,
      maximumTickCount:
        10_000,
    },
  )
}

function activeGroupCount(
  tick:
    IntegratedTerrainSeparationTickResult,
): number {
  return Object.values(
    tick.state.groups,
  ).filter(
    (group) =>
      group.active,
  ).length
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

function scenarioSummary(
  run:
    RunIntegratedTerrainSeparationStageResult,
): ScenarioSummary {
  return {
    tickCount:
      run.tickCount,
    transitionCount:
      run.transitions.length,
    maximumActiveGroupCount:
      Math.max(
        ...run.ticks.map(
          (tick) =>
            activeGroupCount(
              tick,
            ),
        ),
      ),
    maximumCannotHoldCount:
      Math.max(
        ...run.ticks.map(
          (tick) =>
            cannotHoldCount(
              tick,
            ),
        ),
      ),
    maximumPressureSeconds:
      Math.max(
        ...run.ticks.map(
          (tick) =>
            maximumPressureSeconds(
              tick,
            ),
        ),
      ),
    resultCount:
      run.results.length,
    completionEventCount:
      run.events.filter(
        (event) =>
          event.eventType ===
          'SIMULATION_COMPLETED',
      ).length,
    hash:
      run.deterministicHash,
  }
}

function createControlledRow(
  tick:
    IntegratedTerrainSeparationTickResult,
  tickNumber: number,
): ControlledTickRow {
  const peloton =
    tick.state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'IntegratedTerrainSeparationDiagnostic: peloton is missing.',
    )
  }

  const dropped =
    tick.state.groups[
      DROPPED_GROUP_ID
    ]

  return {
    tickNumber,
    raceSecond:
      tick.state.raceSecond,
    currentKm:
      tick.state.currentKm,
    activeGroupCount:
      activeGroupCount(
        tick,
      ),

    pelotonRiderCount:
      peloton.riderIds.length,
    pelotonDistanceKm:
      peloton.distanceKm,
    pelotonGapSeconds:
      peloton.gapFromLeaderSeconds,
    pelotonActive:
      peloton.active,

    droppedRiderCount:
      dropped?.riderIds
        .length ?? 0,
    droppedDistanceKm:
      dropped
        ? dropped.distanceKm
        : null,
    droppedGapSeconds:
      dropped
        ? dropped
            .gapFromLeaderSeconds
        : null,
    droppedActive:
      dropped
        ? dropped.active
        : null,

    cannotHoldCount:
      cannotHoldCount(
        tick,
      ),
    maximumPressureSeconds:
      maximumPressureSeconds(
        tick,
      ),
    movedThisTick:
      tick.transitions.reduce(
        (
          total,
          transition,
        ) =>
          total +
          transition
            .movedRiderIds
            .length,
        0,
      ),
    newlyFinishedCount:
      tick.finishedRiderIds
        .length,
    completed:
      tick.state.completed,
  }
}

function selectControlledRows(
  run:
    RunIntegratedTerrainSeparationStageResult,
): readonly ControlledTickRow[] {
  const allRows =
    run.ticks.map(
      (
        tick,
        index,
      ) =>
        createControlledRow(
          tick,
          index + 1,
        ),
    )

  const selectedTickNumbers =
    new Set<number>([
      1,
      2,
      3,
      4,
      5,
    ])

  const firstTransitionIndex =
    run.ticks.findIndex(
      (tick) =>
        tick.transitions
          .length > 0,
    )

  if (
    firstTransitionIndex >= 0
  ) {
    selectedTickNumbers.add(
      firstTransitionIndex + 1,
    )
    selectedTickNumbers.add(
      firstTransitionIndex + 2,
    )
  }

  const firstPartialFinishIndex =
    run.ticks.findIndex(
      (tick) =>
        tick.finishedRiderIds
          .length > 0 &&
        !tick.state.completed,
    )

  if (
    firstPartialFinishIndex >= 0
  ) {
    selectedTickNumbers.add(
      firstPartialFinishIndex + 1,
    )

    if (
      firstPartialFinishIndex + 1 <
      run.ticks.length
    ) {
      selectedTickNumbers.add(
        firstPartialFinishIndex + 2,
      )
    }
  }

  selectedTickNumbers.add(
    run.ticks.length,
  )

  return allRows.filter(
    (row) =>
      selectedTickNumbers.has(
        row.tickNumber,
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

  for (const tick of run.ticks) {
    const peloton =
      tick.state.groups[
        INITIAL_PELOTON_GROUP_ID
      ]

    const dropped =
      tick.state.groups[
        DROPPED_GROUP_ID
      ]

    if (
      !peloton ||
      !dropped
    ) {
      continue
    }

    seconds =
      Math.max(
        seconds,
        dropped
          .gapFromLeaderSeconds,
      )

    metres =
      Math.max(
        metres,
        (
          peloton.distanceKm -
          dropped.distanceKm
        ) *
          1000,
      )
  }

  return {
    seconds,
    metres,
  }
}

function resultFinishSecond(
  run:
    RunIntegratedTerrainSeparationStageResult,
  riderIds:
    ReadonlySet<string>,
): number {
  const values =
    run.results
      .filter(
        (result) =>
          riderIds.has(
            result.riderId,
          ),
      )
      .map(
        (result) =>
          result.elapsedSeconds,
      )

  if (
    values.length === 0
  ) {
    return -1
  }

  return Math.min(
    ...values,
  )
}

function buildDiagnostic():
  DiagnosticResult {
  const rioA =
    runStage(
      createRioInput(),
    )

  const rioB =
    runStage(
      createRioInput(),
    )

  const controlledA =
    runStage(
      createControlledInput(),
    )

  const controlledB =
    runStage(
      createControlledInput(),
    )

  const rioSummary =
    scenarioSummary(
      rioA,
    )

  const controlledSummary =
    scenarioSummary(
      controlledA,
    )

  const repeatedRioIdentical =
    rioA.deterministicHash ===
      rioB.deterministicHash &&
    rioA.tickCount ===
      rioB.tickCount &&
    JSON.stringify(
      rioA.results,
    ) ===
      JSON.stringify(
        rioB.results,
      )

  const repeatedControlledIdentical =
    controlledA
      .deterministicHash ===
      controlledB
        .deterministicHash &&
    controlledA.tickCount ===
      controlledB.tickCount &&
    JSON.stringify(
      controlledA.transitions.map(
        (transition) => ({
          second:
            transition
              .raceSecond,
          target:
            transition
              .targetGroupId,
          riders:
            transition
              .movedRiderIds,
        }),
      ),
    ) ===
      JSON.stringify(
        controlledB.transitions.map(
          (transition) => ({
            second:
              transition
                .raceSecond,
            target:
              transition
                .targetGroupId,
            riders:
              transition
                .movedRiderIds,
          }),
        ),
      )

  const transition =
    controlledA
      .transitions[0]

  if (!transition) {
    throw new Error(
      'IntegratedTerrainSeparationDiagnostic: controlled transition was not created.',
    )
  }

  const movedRiderIds =
    transition
      .movedRiderIds
      .slice()

  const movedSet =
    new Set(
      movedRiderIds,
    )

  const movedRiderNames =
    movedRiderIds.map(
      (riderId) =>
        controlledA
          .initialState
          .riders[
            riderId
          ]?.riderName ??
        riderId,
    )

  const pelotonRiderIds =
    new Set(
      Object.keys(
        controlledA
          .initialState
          .riders,
      ).filter(
        (riderId) =>
          !movedSet.has(
            riderId,
          ),
      ),
    )

  const pelotonFinishSecond =
    resultFinishSecond(
      controlledA,
      pelotonRiderIds,
    )

  const droppedFinishSecond =
    resultFinishSecond(
      controlledA,
      movedSet,
    )

  const droppedResult =
    controlledA.results
      .find(
        (result) =>
          movedSet.has(
            result.riderId,
          ),
      )

  const droppedResultGapSeconds =
    droppedResult
      ?.gapSeconds ?? -1

  const physicalGap =
    maximumPhysicalGap(
      controlledA,
    )

  const noTransitionBefore120 =
    controlledA.ticks
      .filter(
        (tick) =>
          tick.state.raceSecond <
          120,
      )
      .every(
        (tick) =>
          tick.transitions
            .length === 0,
      )

  const exactlyOneTransitionAt120 =
    controlledA
      .transitions.length ===
      1 &&
    transition.raceSecond ===
      120 &&
    transition.targetGroupId ===
      DROPPED_GROUP_ID &&
    movedRiderIds.length ===
      6

  const transitionTick =
    controlledA.ticks
      .find(
        (tick) =>
          tick.state.raceSecond ===
          120,
      )

  const movedCountersReset =
    transitionTick
      ?.pressureDurationByRiderId

  const countersResetAtTransition =
    !!movedCountersReset &&
    movedRiderIds.every(
      (riderId) =>
        movedCountersReset[
          riderId
        ] === 0,
    )

  const noLaterPelotonEvaluation =
    controlledA.ticks
      .filter(
        (tick) =>
          tick.state.raceSecond >
          transition.raceSecond,
      )
      .every(
        (tick) =>
          tick.pressureEvaluations
            .every(
              (evaluation) =>
                !movedSet.has(
                  evaluation.riderId,
                ) ||
                evaluation.groupId !==
                  INITIAL_PELOTON_GROUP_ID,
            ),
      )

  const partialFinishExists =
    controlledA.ticks.some(
      (tick) =>
        tick.finishedRiderIds
          .length > 0 &&
        !tick.state.completed &&
        Object.values(
          tick.state.groups,
        ).some(
          (group) =>
            group.active,
        ),
    )

  const ranks =
    controlledA.results.map(
      (result) =>
        result.rank,
    )

  const expectedRanks =
    Array.from(
      {
        length: 96,
      },
      (
        _,
        index,
      ) =>
        index + 1,
    )

  const allFinalPressureReset =
    Object.values(
      controlledA
        .finalPressureDurationByRiderId,
    ).every(
      (seconds) =>
        seconds === 0,
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Repeated Rio integrated run is identical',
        passed:
          repeatedRioIdentical,
      },
      {
        label:
          'Repeated controlled integrated run is identical',
        passed:
          repeatedControlledIdentical,
      },
      {
        label:
          'Rio Stage 1 creates no dropped-group transition',
        passed:
          rioA.transitions
            .length === 0,
      },
      {
        label:
          'Rio Stage 1 never exceeds one active group',
        passed:
          rioSummary
            .maximumActiveGroupCount ===
          1,
      },
      {
        label:
          'Rio Stage 1 finishes all 96 riders',
        passed:
          rioA.completed &&
          rioA.results.length ===
            96,
      },
      {
        label:
          'No controlled transition occurs during the first 90 seconds',
        passed:
          noTransitionBefore120,
      },
      {
        label:
          'Exactly one six-rider dropped_1 transition occurs at 120 seconds',
        passed:
          exactlyOneTransitionAt120,
      },
      {
        label:
          'Moved-rider pressure counters reset on the transition tick',
        passed:
          countersResetAtTransition,
      },
      {
        label:
          'Moved riders are never evaluated as peloton members afterward',
        passed:
          noLaterPelotonEvaluation,
      },
      {
        label:
          'The controlled run never creates a duplicate transition',
        passed:
          controlledA
            .transitions.length ===
          1,
      },
      {
        label:
          'The dropped group develops a positive physical time gap',
        passed:
          physicalGap.seconds > 0,
      },
      {
        label:
          'The dropped group develops a positive physical distance gap',
        passed:
          physicalGap.metres > 0,
      },
      {
        label:
          'Peloton and dropped riders finish on separate ticks',
        passed:
          pelotonFinishSecond > 0 &&
          droppedFinishSecond >
            pelotonFinishSecond,
      },
      {
        label:
          'A valid partial-finish state exists before global completion',
        passed:
          partialFinishExists,
      },
      {
        label:
          'Dropped riders receive a positive result gap',
        passed:
          droppedResultGapSeconds >
          0,
      },
      {
        label:
          'The controlled run produces all 96 results',
        passed:
          controlledA.results
            .length === 96,
      },
      {
        label:
          'Controlled ranks are contiguous from 1 through 96',
        passed:
          JSON.stringify(
            ranks,
          ) ===
          JSON.stringify(
            expectedRanks,
          ),
      },
      {
        label:
          'Exactly one completion event is emitted in each scenario',
        passed:
          rioSummary
            .completionEventCount ===
            1 &&
          controlledSummary
            .completionEventCount ===
            1,
      },
      {
        label:
          'All controlled pressure counters are zero after completion',
        passed:
          allFinalPressureReset,
      },
      {
        label:
          'Both integrated scenarios complete successfully',
        passed:
          rioA.completed &&
          controlledA.completed,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    rio:
      rioA,
    rioSummary,

    controlled:
      controlledA,
    controlledSummary,
    controlledRows:
      selectControlledRows(
        controlledA,
      ),

    transitionSecond:
      transition.raceSecond,
    transitionKilometre:
      transition.kilometre,
    movedRiderIds,
    movedRiderNames,

    pelotonFinishSecond,
    droppedFinishSecond,
    droppedResultGapSeconds,
    maximumPhysicalGapSeconds:
      physicalGap.seconds,
    maximumPhysicalGapMetres:
      physicalGap.metres,

    repeatedRioIdentical,
    repeatedControlledIdentical,

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

export default function IntegratedTerrainSeparationDiagnostic():
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
            Phase 7B.8B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Integrated terrain separation failed
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
      <div className="mx-auto max-w-[1550px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Inactive integrated terrain separation
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Runs 50% terrain-aware movement, energy, 120-second sustained
            pressure, immutable dropped-group transition, and partial finish
            handling in one alternative deterministic runner.
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
              ? 'PASS — the inactive integrated pipeline separates, moves, and finishes groups deterministically'
              : 'FAIL — the integrated candidate pipeline needs correction'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              'Rio transitions',
              value.rioSummary
                .transitionCount,
            ],
            [
              'Controlled transition',
              `${value.transitionSecond}s`,
            ],
            [
              'Moved riders',
              value.movedRiderIds
                .length,
            ],
            [
              'Maximum physical gap',
              `${format(
                value
                  .maximumPhysicalGapSeconds,
              )} s`,
            ],
            [
              'Finish gap',
              `${value
                .droppedResultGapSeconds}s`,
            ],
          ].map(
            ([label, display]) => (
              <article
                key={String(label)}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {label}
                </div>

                <div className="mt-2 text-2xl font-semibold">
                  {display}
                </div>
              </article>
            ),
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Scenario summaries
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              [
                'Real Rio Stage 1',
                value.rioSummary,
              ] as const,
              [
                'Controlled constant 8%',
                value.controlledSummary,
              ] as const,
            ].map(
              ([
                label,
                summary,
              ]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-slate-950 p-4"
                >
                  <h3 className="font-semibold">
                    {label}
                  </h3>

                  <dl className="mt-3 space-y-2 text-sm text-slate-300">
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
                        Transitions
                      </dt>
                      <dd>
                        {summary.transitionCount}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Maximum active groups
                      </dt>
                      <dd>
                        {summary.maximumActiveGroupCount}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Maximum cannot hold
                      </dt>
                      <dd>
                        {summary.maximumCannotHoldCount}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Maximum pressure
                      </dt>
                      <dd>
                        {summary.maximumPressureSeconds}s
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Results
                      </dt>
                      <dd>
                        {summary.resultCount}
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
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Controlled transition
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Race second
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.transitionSecond}s
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Kilometre
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {format(
                  value
                    .transitionKilometre,
                  3,
                )} km
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Peloton finish
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.pelotonFinishSecond}s
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Dropped finish
              </dt>
              <dd className="mt-2 text-xl font-semibold">
                {value.droppedFinishSecond}s
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-2xl bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Moved riders
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {value.movedRiderNames.map(
                (name) => (
                  <span
                    key={name}
                    className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"
                  >
                    {name}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Controlled tick checkpoints
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Tick / second
                  </th>
                  <th className="px-3 py-3">
                    Current km
                  </th>
                  <th className="px-3 py-3">
                    Active groups
                  </th>
                  <th className="px-3 py-3">
                    Peloton riders / km / gap / active
                  </th>
                  <th className="px-3 py-3">
                    Dropped riders / km / gap / active
                  </th>
                  <th className="px-3 py-3">
                    Cannot hold
                  </th>
                  <th className="px-3 py-3">
                    Max pressure
                  </th>
                  <th className="px-3 py-3">
                    Moved
                  </th>
                  <th className="px-3 py-3">
                    Finished
                  </th>
                  <th className="px-3 py-3">
                    Completed
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.controlledRows.map(
                  (row) => (
                    <tr
                      key={row.tickNumber}
                      className="border-t border-slate-800"
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        {row.tickNumber}
                        {' / '}
                        {row.raceSecond}s
                      </td>

                      <td className="px-3 py-3">
                        {format(
                          row.currentKm,
                          3,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {row.activeGroupCount}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.pelotonRiderCount}
                        {' / '}
                        {format(
                          row.pelotonDistanceKm,
                          3,
                        )}
                        {' / '}
                        {format(
                          row.pelotonGapSeconds,
                        )}s
                        {' / '}
                        {row.pelotonActive
                          ? 'active'
                          : 'inactive'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.droppedRiderCount}
                        {' / '}
                        {row.droppedDistanceKm ===
                        null
                          ? '—'
                          : format(
                              row.droppedDistanceKm,
                              3,
                            )}
                        {' / '}
                        {row.droppedGapSeconds ===
                        null
                          ? '—'
                          : `${format(
                              row.droppedGapSeconds,
                            )}s`}
                        {' / '}
                        {row.droppedActive ===
                        null
                          ? '—'
                          : row.droppedActive
                            ? 'active'
                            : 'inactive'}
                      </td>

                      <td className="px-3 py-3">
                        {row.cannotHoldCount}
                      </td>

                      <td className="px-3 py-3">
                        {row.maximumPressureSeconds}s
                      </td>

                      <td className="px-3 py-3">
                        {row.movedThisTick}
                      </td>

                      <td className="px-3 py-3">
                        {row.newlyFinishedCount}
                      </td>

                      <td className="px-3 py-3">
                        {row.completed
                          ? 'Yes'
                          : 'No'}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

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
            This diagnostic uses a separate runner. simulateMultiGroupTick,
            runMultiGroupStage, production routes, transition events, replay
            persistence, and Supabase remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
