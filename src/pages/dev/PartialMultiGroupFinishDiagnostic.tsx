/**
 * PartialMultiGroupFinishDiagnostic.tsx
 *
 * Phase 7B.8A browser-only diagnostic.
 *
 * Verifies that one group can finish while another active group continues:
 *
 * - 90-rider peloton reaches the finish first;
 * - 6-rider dropped group remains racing;
 * - global currentKm stays at stageDistanceKm;
 * - terminal riders may remain assigned to their inactive finished group;
 * - the dropped group finishes on a later tick;
 * - final ranks, gaps, events, and completion remain valid.
 *
 * This diagnostic uses the existing simulateMultiGroupTick() orchestration.
 * It does not connect terrain-aware movement or automatic separation.
 */

import { useMemo } from 'react'

import type {
  GroupState,
} from '../../race-engine/domain/GroupState'
import type {
  RiderState,
} from '../../race-engine/domain/RiderState'
import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import type {
  StageResult,
} from '../../race-engine/domain/SimulationOutput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  applyDroppedGroupTransitionProposal,
} from '../../race-engine/simulation/applyDroppedGroupTransitionProposal'
import {
  calculateDroppedGroupTransitionProposal,
} from '../../race-engine/simulation/calculateDroppedGroupTransitionProposal'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  simulateMultiGroupTick,
  type SimulateMultiGroupTickResult,
} from '../../race-engine/simulation/simulateMultiGroupTick'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface TickSummary {
  readonly tickNumber: number
  readonly raceSecond: number
  readonly currentKm: number
  readonly pelotonDistanceKm: number
  readonly droppedDistanceKm: number
  readonly droppedGapSeconds: number
  readonly pelotonActive: boolean
  readonly droppedActive: boolean
  readonly racingRiderCount: number
  readonly finishedRiderCount: number
  readonly newlyFinishedRiderCount: number
  readonly completed: boolean
}

interface DiagnosticRun {
  readonly tickSummaries:
    readonly TickSummary[]
  readonly firstFinishTick:
    SimulateMultiGroupTickResult
  readonly finalTick:
    SimulateMultiGroupTickResult
  readonly results:
    readonly StageResult[]
  readonly winnerFinishTimeSeconds: number
  readonly droppedFinishTimeSeconds: number
  readonly droppedGapSeconds: number
  readonly simulationCompletedEventCount: number
  readonly finalHash: string
  readonly checks:
    readonly CheckResult[]
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly first: DiagnosticRun
  readonly repeatedRunIdentical: boolean
}

const STAGE_DISTANCE_KM =
  5

const PELOTON_START_KM =
  4.95

const DROPPED_START_KM =
  4.0

const PELOTON_START_SPEED_KMH =
  43.4

const DROPPED_START_SPEED_KMH =
  42.35

const DROPPED_GROUP_ID =
  'dropped_1'

function createControlledInput():
  StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      `${base.raceId}-partial-finish`,
    stageId:
      `${base.stageId}-partial-finish`,
    stageName:
      'Partial multi-group finish diagnostic',
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
        elevationMetres: 0,
      },
    ],
    orders: [],
  }
}

function createNearFinishState():
  SimulationState {
  const initial =
    createInitialState(
      createControlledInput(),
    )

  const peloton =
    initial.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: initial peloton is missing.',
    )
  }

  const movedRiderIds =
    peloton.riderIds
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )
      .slice(0, 6)

  const proposal =
    calculateDroppedGroupTransitionProposal({
      state:
        initial,
      sourceGroupId:
        peloton.groupId,
      eligibleRiderIds:
        movedRiderIds,
    })

  if (!proposal) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: expected a transition proposal.',
    )
  }

  const transitioned =
    applyDroppedGroupTransitionProposal({
      state:
        initial,
      proposal,
    }).state

  const transitionedPeloton =
    transitioned.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  const transitionedDropped =
    transitioned.groups[
      DROPPED_GROUP_ID
    ]

  if (
    !transitionedPeloton ||
    !transitionedDropped
  ) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: expected both groups after transition.',
    )
  }

  const droppedGapSeconds =
    (
      (
        PELOTON_START_KM -
        DROPPED_START_KM
      ) /
      PELOTON_START_SPEED_KMH
    ) *
    3600

  const groups:
    Record<string, GroupState> = {
      ...transitioned.groups,

      [transitionedPeloton.groupId]: {
        ...transitionedPeloton,
        distanceKm:
          PELOTON_START_KM,
        speedKmh:
          PELOTON_START_SPEED_KMH,
        gapFromLeaderSeconds:
          0,
      },

      [transitionedDropped.groupId]: {
        ...transitionedDropped,
        distanceKm:
          DROPPED_START_KM,
        speedKmh:
          DROPPED_START_SPEED_KMH,
        gapFromLeaderSeconds:
          droppedGapSeconds,
      },
    }

  const riders:
    Record<string, RiderState> =
      Object.fromEntries(
        Object.entries(
          transitioned.riders,
        ).map(
          ([
            riderId,
            rider,
          ]) => {
            const group =
              groups[
                rider.currentGroupId
              ]

            if (!group) {
              throw new Error(
                `PartialMultiGroupFinishDiagnostic: rider ${riderId} group is missing.`,
              )
            }

            return [
              riderId,
              {
                ...rider,
                distanceKm:
                  group.distanceKm,
                speedKmh:
                  group.speedKmh,
              },
            ]
          },
        ),
      )

  const state:
    SimulationState = {
      ...transitioned,
      raceSecond: 0,
      currentKm:
        PELOTON_START_KM,
      groups,
      riders,
    }

  validateSimulationState(
    state,
  )

  return state
}

function summarizeTick(
  tick:
    SimulateMultiGroupTickResult,
  tickNumber: number,
): TickSummary {
  const state =
    tick.state

  const peloton =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  const dropped =
    state.groups[
      DROPPED_GROUP_ID
    ]

  if (
    !peloton ||
    !dropped
  ) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: summary groups are missing.',
    )
  }

  const riders =
    Object.values(
      state.riders,
    )

  return {
    tickNumber,
    raceSecond:
      state.raceSecond,
    currentKm:
      state.currentKm,
    pelotonDistanceKm:
      peloton.distanceKm,
    droppedDistanceKm:
      dropped.distanceKm,
    droppedGapSeconds:
      dropped.gapFromLeaderSeconds,
    pelotonActive:
      peloton.active,
    droppedActive:
      dropped.active,
    racingRiderCount:
      riders.filter(
        (rider) =>
          rider.stageStatus ===
          'racing',
      ).length,
    finishedRiderCount:
      riders.filter(
        (rider) =>
          rider.stageStatus ===
          'finished',
      ).length,
    newlyFinishedRiderCount:
      tick.finishedRiderIds
        .length,
    completed:
      state.completed,
  }
}

function runDiagnostic():
  DiagnosticRun {
  let state =
    createNearFinishState()

  const ticks:
    SimulateMultiGroupTickResult[] =
      []

  const tickSummaries:
    TickSummary[] = []

  const results:
    StageResult[] = []

  while (!state.completed) {
    if (ticks.length >= 10) {
      throw new Error(
        'PartialMultiGroupFinishDiagnostic: exceeded ten ticks.',
      )
    }

    const tick =
      simulateMultiGroupTick(
        state,
      )

    validateSimulationState(
      tick.state,
    )

    ticks.push(tick)

    tickSummaries.push(
      summarizeTick(
        tick,
        ticks.length,
      ),
    )

    if (tick.appliedFinish) {
      results.push(
        ...tick
          .appliedFinish
          .newResults,
      )
    }

    state =
      tick.state
  }

  const firstFinishTick =
    ticks.find(
      (tick) =>
        tick.finishedRiderIds
          .length > 0,
    )

  const finalTick =
    ticks[
      ticks.length - 1
    ]

  if (
    !firstFinishTick ||
    !finalTick
  ) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: expected finish ticks.',
    )
  }

  const firstState =
    firstFinishTick.state

  const firstPeloton =
    firstState.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  const firstDropped =
    firstState.groups[
      DROPPED_GROUP_ID
    ]

  const finalPeloton =
    finalTick.state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  const finalDropped =
    finalTick.state.groups[
      DROPPED_GROUP_ID
    ]

  if (
    !firstPeloton ||
    !firstDropped ||
    !finalPeloton ||
    !finalDropped
  ) {
    throw new Error(
      'PartialMultiGroupFinishDiagnostic: finish groups are missing.',
    )
  }

  const orderedResults =
    results
      .slice()
      .sort(
        (left, right) =>
          left.rank -
          right.rank,
      )

  const winnerFinishTimeSeconds =
    orderedResults[0]
      ?.elapsedSeconds ??
    -1

  const droppedResults =
    orderedResults.filter(
      (result) =>
        firstDropped.riderIds
          .includes(
            result.riderId,
          ),
    )

  const droppedFinishTimeSeconds =
    droppedResults[0]
      ?.elapsedSeconds ??
    -1

  const droppedGapSeconds =
    droppedResults[0]
      ?.gapSeconds ??
    -1

  const continuationSummary =
    tickSummaries.find(
      (summary) =>
        !summary.pelotonActive &&
        summary.droppedActive &&
        summary.droppedDistanceKm <
          STAGE_DISTANCE_KM &&
        summary.tickNumber > 1,
    )

  const finalEvents =
    finalTick.state.events

  const simulationCompletedEventCount =
    finalEvents.filter(
      (event) =>
        event.eventType ===
        'SIMULATION_COMPLETED',
    ).length

  const ranks =
    orderedResults.map(
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

  const finishedRiderCountAfterFirst =
    Object.values(
      firstState.riders,
    ).filter(
      (rider) =>
        rider.stageStatus ===
        'finished',
    ).length

  const racingRiderCountAfterFirst =
    Object.values(
      firstState.riders,
    ).filter(
      (rider) =>
        rider.stageStatus ===
        'racing',
    ).length

  const inactiveFinishedRidersValid =
    firstPeloton.riderIds
      .every(
        (riderId) => {
          const rider =
            firstState.riders[
              riderId
            ]

          return (
            rider
              ?.stageStatus ===
              'finished' &&
            rider.currentGroupId ===
              firstPeloton.groupId
          )
        },
      )

  const checks:
    CheckResult[] = [
      {
        label:
          'The peloton finishes before the dropped group',
        passed:
          firstFinishTick
            .finishedRiderIds
            .length === 90 &&
          firstDropped
            .distanceKm <
          STAGE_DISTANCE_KM,
      },
      {
        label:
          'The intermediate simulation is not completed',
        passed:
          !firstState.completed,
      },
      {
        label:
          'The finished peloton is inactive',
        passed:
          !firstPeloton.active,
      },
      {
        label:
          'The trailing dropped group remains active',
        passed:
          firstDropped.active,
      },
      {
        label:
          'Exactly 90 riders are finished after the first finish tick',
        passed:
          finishedRiderCountAfterFirst ===
          90,
      },
      {
        label:
          'Exactly six riders remain racing after the first finish tick',
        passed:
          racingRiderCountAfterFirst ===
          6,
      },
      {
        label:
          'Finished riders remain assigned to their inactive finished group',
        passed:
          inactiveFinishedRidersValid,
      },
      {
        label:
          'Global currentKm remains at stageDistanceKm after the leader finishes',
        passed:
          firstState.currentKm ===
          STAGE_DISTANCE_KM,
      },
      {
        label:
          'Global currentKm remains at the finish while the trailing group continues',
        passed:
          !!continuationSummary &&
          continuationSummary.currentKm ===
            STAGE_DISTANCE_KM,
      },
      {
        label:
          'The trailing group keeps a positive gap to the finished leader',
        passed:
          !!continuationSummary &&
          continuationSummary.droppedGapSeconds >
            0,
      },
      {
        label:
          'The trailing group finishes on a later tick',
        passed:
          droppedFinishTimeSeconds >
          winnerFinishTimeSeconds,
      },
      {
        label:
          'The final simulation is completed',
        passed:
          finalTick.state
            .completed,
      },
      {
        label:
          'Both groups are inactive after all riders finish',
        passed:
          !finalPeloton.active &&
          !finalDropped.active,
      },
      {
        label:
          'All 96 riders receive results',
        passed:
          orderedResults.length ===
          96,
      },
      {
        label:
          'Finish ranks are contiguous from 1 through 96',
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
          'Dropped riders receive a positive winner gap',
        passed:
          droppedGapSeconds > 0,
      },
      {
        label:
          'Exactly one SIMULATION_COMPLETED event is emitted',
        passed:
          simulationCompletedEventCount ===
          1,
      },
      {
        label:
          'Final currentKm equals stageDistanceKm',
        passed:
          finalTick.state
            .currentKm ===
          STAGE_DISTANCE_KM,
      },
      {
        label:
          'Every intermediate and final SimulationState validates',
        passed: true,
      },
    ]

  const finalHash =
    createCanonicalHashedValue({
      tickSummaries,
      results:
        orderedResults,
      events:
        finalEvents,
      finalState:
        finalTick.state,
      checks,
    }).hash

  return {
    tickSummaries,
    firstFinishTick,
    finalTick,
    results:
      orderedResults,
    winnerFinishTimeSeconds,
    droppedFinishTimeSeconds,
    droppedGapSeconds,
    simulationCompletedEventCount,
    finalHash,
    checks,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const first =
    runDiagnostic()

  const second =
    runDiagnostic()

  const repeatedRunIdentical =
    first.finalHash ===
      second.finalHash &&
    JSON.stringify(
      first.tickSummaries,
    ) ===
      JSON.stringify(
        second.tickSummaries,
      ) &&
    JSON.stringify(
      first.results,
    ) ===
      JSON.stringify(
        second.results,
      )

  return {
    passed:
      repeatedRunIdentical &&
      first.checks.every(
        (check) =>
          check.passed,
      ),
    first,
    repeatedRunIdentical,
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

export default function PartialMultiGroupFinishDiagnostic():
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
            Phase 7B.8A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Partial multi-group finish failed
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
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.8A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Partial multi-group finish compatibility
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            A 90-rider peloton finishes first while a six-rider dropped group
            remains active. The trailing group then finishes on a later tick.
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
              ? 'PASS — finished and still-racing groups coexist validly until global completion'
              : 'FAIL — partial finish semantics remain incompatible'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              'Ticks to completion',
              value.first
                .tickSummaries
                .length,
            ],
            [
              'Winner time',
              `${value.first
                .winnerFinishTimeSeconds}s`,
            ],
            [
              'Dropped finish time',
              `${value.first
                .droppedFinishTimeSeconds}s`,
            ],
            [
              'Dropped winner gap',
              `${value.first
                .droppedGapSeconds}s`,
            ],
            [
              'Results',
              value.first
                .results.length,
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

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Tick results
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Tick
                  </th>
                  <th className="px-3 py-3">
                    Race second
                  </th>
                  <th className="px-3 py-3">
                    Current km
                  </th>
                  <th className="px-3 py-3">
                    Peloton km / active
                  </th>
                  <th className="px-3 py-3">
                    Dropped km / active
                  </th>
                  <th className="px-3 py-3">
                    Dropped gap
                  </th>
                  <th className="px-3 py-3">
                    Racing
                  </th>
                  <th className="px-3 py-3">
                    Finished
                  </th>
                  <th className="px-3 py-3">
                    Newly finished
                  </th>
                  <th className="px-3 py-3">
                    Completed
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.first
                  .tickSummaries
                  .map(
                    (row) => (
                      <tr
                        key={row.tickNumber}
                        className="border-t border-slate-800"
                      >
                        <td className="px-3 py-3">
                          {row.tickNumber}
                        </td>

                        <td className="px-3 py-3">
                          {row.raceSecond}s
                        </td>

                        <td className="px-3 py-3">
                          {format(
                            row.currentKm,
                            3,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {format(
                            row.pelotonDistanceKm,
                            3,
                          )}
                          {' / '}
                          {row.pelotonActive
                            ? 'active'
                            : 'inactive'}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3">
                          {format(
                            row.droppedDistanceKm,
                            3,
                          )}
                          {' / '}
                          {row.droppedActive
                            ? 'active'
                            : 'inactive'}
                        </td>

                        <td className="px-3 py-3">
                          {format(
                            row.droppedGapSeconds,
                          )} s
                        </td>

                        <td className="px-3 py-3">
                          {row.racingRiderCount}
                        </td>

                        <td className="px-3 py-3">
                          {row.finishedRiderCount}
                        </td>

                        <td className="px-3 py-3">
                          {row.newlyFinishedRiderCount}
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
            <Check
              result={{
                label:
                  'Repeated full run is identical',
                passed:
                  value
                    .repeatedRunIdentical,
              }}
            />

            {value.first.checks.map(
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
            Hash
          </h2>

          <p className="mt-3 font-mono text-xs text-slate-400">
            {value.first
              .finalHash}
          </p>

          <h2 className="mt-6 text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            This fixes only partial-finish invariants required by real
            multi-group racing. Terrain-aware movement and automatic dropped
            transitions remain inactive.
          </p>
        </section>
      </div>
    </main>
  )
}
