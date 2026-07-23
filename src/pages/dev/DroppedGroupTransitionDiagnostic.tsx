/**
 * DroppedGroupTransitionDiagnostic.tsx
 *
 * Phase 7B.5 browser-only diagnostic.
 *
 * Builds a valid controlled 120-second 8% checkpoint from the real 96-rider
 * Rio field, identifies sustainedly unable riders, proposes one dropped group,
 * applies it immutably, and validates the result.
 *
 * The transition is not connected to simulateMultiGroupTick().
 */

import { useMemo } from 'react'

import type {
  RiderState,
} from '../../race-engine/domain/RiderState'
import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
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
  calculateGroupShelter,
} from '../../race-engine/simulation/groupShelter'
import {
  calculateRiderGroupHold,
} from '../../race-engine/simulation/groupHold'
import {
  calculateRiderSeparationEligibility,
} from '../../race-engine/simulation/groupSeparationEligibility'
import {
  calculateRiderTerrainCapability,
} from '../../race-engine/simulation/riderTerrainCapability'
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

interface TransitionRun {
  readonly eligibleRiderIds:
    readonly string[]
  readonly eligibleRiderNames:
    readonly string[]
  readonly sourceBeforeCount: number
  readonly sourceAfterCount: number
  readonly droppedCount: number
  readonly targetGroupId: string
  readonly previousCounter: number
  readonly nextCounter: number
  readonly transitionHash: string
  readonly checks:
    readonly CheckResult[]
  readonly controlledState:
    SimulationState
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly run: TransitionRun
  readonly guardChecks:
    readonly CheckResult[]
}

const GRADIENT_PERCENT =
  8

const GROUP_SPEED_KMH =
  31.2

const RACE_SECOND =
  120

const DISTANCE_KM =
  GROUP_SPEED_KMH *
  (RACE_SECOND / 3600)

function average(
  values: readonly number[],
): number {
  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function createControlledState():
  SimulationState {
  const stageInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const initialState =
    createInitialState(
      stageInput,
    )

  const peloton =
    initialState.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: initial peloton is missing.',
    )
  }

  const riders:
    Record<
      string,
      RiderState
    > = Object.fromEntries(
      Object.entries(
        initialState.riders,
      ).map(
        ([
          riderId,
          rider,
        ]) => [
          riderId,
          {
            ...rider,
            distanceKm:
              DISTANCE_KM,
            speedKmh:
              GROUP_SPEED_KMH,
          },
        ],
      ),
    )

  const controlled:
    SimulationState = {
      ...initialState,
      raceSecond:
        RACE_SECOND,
      currentKm:
        DISTANCE_KM,
      riders,
      groups: {
        ...initialState.groups,
        [peloton.groupId]: {
          ...peloton,
          distanceKm:
            DISTANCE_KM,
          speedKmh:
            GROUP_SPEED_KMH,
        },
      },
    }

  validateSimulationState(
    controlled,
  )

  return controlled
}

function calculateEligibleRiderIds(
  state: SimulationState,
): readonly string[] {
  const peloton =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: controlled peloton is missing.',
    )
  }

  const riders =
    peloton.riderIds
      .map(
        (riderId) => {
          const rider =
            state.riders[
              riderId
            ]

          if (!rider) {
            throw new Error(
              `DroppedGroupTransitionDiagnostic: missing rider ${riderId}.`,
            )
          }

          return rider
        },
      )
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )

  const capabilities =
    riders.map(
      (rider) =>
        calculateRiderTerrainCapability({
          riderId:
            rider.riderId,
          attributes:
            rider.attributes,
          currentEnergy:
            rider.energy,
          gradientPercent:
            GRADIENT_PERCENT,
        }),
    )

  const demand =
    average(
      capabilities.map(
        (result) =>
          result.capabilityScore,
      ),
    )

  const shelter =
    calculateGroupShelter({
      groupType:
        'peloton',
      groupSize:
        riders.length,
      gradientPercent:
        GRADIENT_PERCENT,
    })

  const durations =
    new Map<
      string,
      number
    >(
      riders.map(
        (rider) => [
          rider.riderId,
          0,
        ],
      ),
    )

  for (
    let tick = 0;
    tick < 4;
    tick += 1
  ) {
    for (
      const capability of
      capabilities
    ) {
      const hold =
        calculateRiderGroupHold({
          riderCapabilityScore:
            Math.min(
              100,
              capability
                .capabilityScore +
                shelter
                  .shelterBonus,
            ),
          groupDemandScore:
            demand,
          groupSpeedKmh:
            GROUP_SPEED_KMH,
        })

      const previous =
        durations.get(
          capability.riderId,
        ) ?? 0

      const eligibility =
        calculateRiderSeparationEligibility({
          riderId:
            capability.riderId,
          holdStatus:
            hold.status,
          previousConsecutiveCannotHoldSeconds:
            previous,
          tickSeconds: 30,
        })

      durations.set(
        capability.riderId,
        eligibility
          .nextConsecutiveCannotHoldSeconds,
      )
    }
  }

  return Array.from(
    durations.entries(),
  )
    .filter(
      ([, seconds]) =>
        seconds >= 120,
    )
    .map(
      ([riderId]) =>
        riderId,
    )
    .sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )
}

function actionThrows(
  action: () => unknown,
): boolean {
  try {
    action()
    return false
  } catch {
    return true
  }
}

function runTransition():
  TransitionRun {
  const controlledState =
    createControlledState()

  const eligibleRiderIds =
    calculateEligibleRiderIds(
      controlledState,
    )

  const sourceBefore =
    controlledState.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!sourceBefore) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: source group is missing.',
    )
  }

  const proposal =
    calculateDroppedGroupTransitionProposal({
      state:
        controlledState,
      sourceGroupId:
        sourceBefore.groupId,
      eligibleRiderIds,
    })

  if (!proposal) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: expected a proposal.',
    )
  }

  const applied =
    applyDroppedGroupTransitionProposal({
      state:
        controlledState,
      proposal,
    })

  validateSimulationState(
    applied.state,
  )

  const sourceAfter =
    applied.state.groups[
      sourceBefore.groupId
    ]

  const dropped =
    applied.state.groups[
      proposal.targetGroupId
    ]

  if (
    !sourceAfter ||
    !dropped
  ) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: resulting groups are missing.',
    )
  }

  const movedSet =
    new Set(
      proposal.movedRiderIds,
    )

  const unaffectedRiderIds =
    Object.keys(
      controlledState.riders,
    ).filter(
      (riderId) =>
        !movedSet.has(
          riderId,
        ),
    )

  const checks:
    CheckResult[] = [
      {
        label:
          'Exactly six riders reached 120 seconds',
        passed:
          eligibleRiderIds.length ===
          6,
      },
      {
        label:
          'Source group retains 90 riders',
        passed:
          sourceAfter
            .riderIds.length ===
          90,
      },
      {
        label:
          'Dropped group contains six riders',
        passed:
          dropped
            .riderIds.length ===
          6,
      },
      {
        label:
          'Dropped membership exactly matches the proposal',
        passed:
          JSON.stringify(
            dropped.riderIds,
          ) ===
          JSON.stringify(
            proposal
              .movedRiderIds,
          ),
      },
      {
        label:
          'Moved riders reference the dropped group',
        passed:
          proposal.movedRiderIds
            .every(
              (riderId) =>
                applied.state
                  .riders[
                    riderId
                  ]
                  ?.currentGroupId ===
                dropped.groupId,
            ),
      },
      {
        label:
          'Unaffected rider objects are preserved by reference',
        passed:
          unaffectedRiderIds
            .every(
              (riderId) =>
                applied.state
                  .riders[
                    riderId
                  ] ===
                controlledState
                  .riders[
                    riderId
                  ],
            ),
      },
      {
        label:
          'Original state remains unchanged',
        passed:
          sourceBefore
            .riderIds.length ===
            96 &&
          Object.keys(
            controlledState.groups,
          ).length === 1 &&
          controlledState
            .nextDroppedGroupNumber ===
            1,
      },
      {
        label:
          'Dropped-group counter increments from 1 to 2',
        passed:
          applied
            .previousDroppedGroupNumber ===
            1 &&
          applied
            .nextDroppedGroupNumber ===
            2 &&
          applied.state
            .nextDroppedGroupNumber ===
            2,
      },
      {
        label:
          'Target group ID uses the deterministic counter',
        passed:
          dropped.groupId ===
          'dropped_1',
      },
      {
        label:
          'Dropped group copies source position, speed, and gap',
        passed:
          dropped.distanceKm ===
            sourceBefore
              .distanceKm &&
          dropped.speedKmh ===
            sourceBefore
              .speedKmh &&
          dropped
            .gapFromLeaderSeconds ===
            sourceBefore
              .gapFromLeaderSeconds,
      },
      {
        label:
          'Creation time and kilometre match the transition point',
        passed:
          dropped
            .createdAtRaceSecond ===
            controlledState
              .raceSecond &&
          dropped
            .createdAtKm ===
            sourceBefore
              .distanceKm,
      },
      {
        label:
          'Source and dropped memberships are disjoint',
        passed:
          sourceAfter.riderIds
            .every(
              (riderId) =>
                !movedSet.has(
                  riderId,
                ),
            ),
      },
      {
        label:
          'Events remain unchanged by reference',
        passed:
          applied.state.events ===
          controlledState.events,
      },
      {
        label:
          'Unrelated sequence counters remain unchanged',
        passed:
          applied.state
            .nextEventSequenceNumber ===
            controlledState
              .nextEventSequenceNumber &&
          applied.state
            .nextBreakawayNumber ===
            controlledState
              .nextBreakawayNumber &&
          applied.state
            .nextChaseNumber ===
            controlledState
              .nextChaseNumber,
      },
      {
        label:
          'Resulting SimulationState validates',
        passed: true,
      },
    ]

  const transitionHash =
    createCanonicalHashedValue({
      proposal,
      sourceAfter,
      dropped,
      movedRiders:
        proposal.movedRiderIds
          .map(
            (riderId) =>
              applied.state
                .riders[
                  riderId
                ],
          ),
      counters: {
        previous:
          applied
            .previousDroppedGroupNumber,
        next:
          applied
            .nextDroppedGroupNumber,
      },
      checks,
    }).hash

  return {
    eligibleRiderIds,
    eligibleRiderNames:
      eligibleRiderIds.map(
        (riderId) =>
          controlledState
            .riders[
              riderId
            ]
            ?.riderName ??
          riderId,
      ),
    sourceBeforeCount:
      sourceBefore
        .riderIds.length,
    sourceAfterCount:
      sourceAfter
        .riderIds.length,
    droppedCount:
      dropped
        .riderIds.length,
    targetGroupId:
      dropped.groupId,
    previousCounter:
      applied
        .previousDroppedGroupNumber,
    nextCounter:
      applied
        .nextDroppedGroupNumber,
    transitionHash,
    checks,
    controlledState,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const first =
    runTransition()

  const second =
    runTransition()

  const source =
    first.controlledState
      .groups[
        INITIAL_PELOTON_GROUP_ID
      ]

  if (!source) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: source group is missing for guard tests.',
    )
  }

  const repeated =
    first.transitionHash ===
      second.transitionHash &&
    JSON.stringify(
      first.eligibleRiderIds,
    ) ===
    JSON.stringify(
      second.eligibleRiderIds,
    )

  const noEligibilityReturnsNull =
    calculateDroppedGroupTransitionProposal({
      state:
        first.controlledState,
      sourceGroupId:
        source.groupId,
      eligibleRiderIds: [],
    }) === null

  const emptySourceRejected =
    actionThrows(
      () =>
        calculateDroppedGroupTransitionProposal({
          state:
            first.controlledState,
          sourceGroupId:
            source.groupId,
          eligibleRiderIds:
            source.riderIds,
        }),
    )

  const firstEligible =
    first.eligibleRiderIds[0]

  if (!firstEligible) {
    throw new Error(
      'DroppedGroupTransitionDiagnostic: no controlled eligible rider exists.',
    )
  }

  const duplicateRejected =
    actionThrows(
      () =>
        calculateDroppedGroupTransitionProposal({
          state:
            first.controlledState,
          sourceGroupId:
            source.groupId,
          eligibleRiderIds: [
            firstEligible,
            firstEligible,
          ],
        }),
    )

  const unknownRejected =
    actionThrows(
      () =>
        calculateDroppedGroupTransitionProposal({
          state:
            first.controlledState,
          sourceGroupId:
            source.groupId,
          eligibleRiderIds: [
            'missing-rider',
          ],
        }),
    )

  const guardChecks:
    CheckResult[] = [
      {
        label:
          'Repeated proposal and application are identical',
        passed:
          repeated,
      },
      {
        label:
          'No eligible riders returns null',
        passed:
          noEligibilityReturnsNull,
      },
      {
        label:
          'Emptying the source group is rejected',
        passed:
          emptySourceRejected,
      },
      {
        label:
          'Duplicate eligible rider IDs are rejected',
        passed:
          duplicateRejected,
      },
      {
        label:
          'An unknown rider ID is rejected',
        passed:
          unknownRejected,
      },
    ]

  return {
    passed:
      first.checks.every(
        (check) =>
          check.passed,
      ) &&
      guardChecks.every(
        (check) =>
          check.passed,
      ),
    run:
      first,
    guardChecks,
  }
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

export default function DroppedGroupTransitionDiagnostic():
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
            Phase 7B.5 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped-group transition failed
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
            Phase 7B.5 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Immutable dropped-group transition
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Controlled 120-second 8% pressure checkpoint. The transition is
            applied only inside this page and is not connected to the race tick.
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
              ? 'PASS — eligible riders move immutably into one valid dropped group'
              : 'FAIL — dropped-group transition invariants were not preserved'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              'Eligible riders',
              value.run
                .eligibleRiderIds
                .length,
            ],
            [
              'Source before',
              value.run
                .sourceBeforeCount,
            ],
            [
              'Source after',
              value.run
                .sourceAfterCount,
            ],
            [
              'Dropped group',
              value.run
                .droppedCount,
            ],
            [
              'Next counter',
              value.run
                .nextCounter,
            ],
          ].map(
            ([label, number]) => (
              <article
                key={String(label)}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {label}
                </div>

                <div className="mt-2 text-2xl font-semibold">
                  {number}
                </div>
              </article>
            ),
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Transition
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Target group
              </div>

              <div className="mt-2 font-mono text-sm">
                {value.run
                  .targetGroupId}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Transition hash
              </div>

              <div className="mt-2 font-mono text-sm">
                {value.run
                  .transitionHash}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Moved riders
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {value.run
                .eligibleRiderNames
                .map(
                  (
                    riderName,
                    index,
                  ) => (
                    <span
                      key={
                        value.run
                          .eligibleRiderIds[
                            index
                          ]
                      }
                      className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"
                    >
                      {riderName}
                    </span>
                  ),
                )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Application checks
          </h2>

          <div className="mt-3">
            {value.run.checks.map(
              (check) => (
                <Check
                  key={check.label}
                  result={check}
                />
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Guard checks
          </h2>

          <div className="mt-3">
            {value.guardChecks.map(
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
            simulateMultiGroupTick is unchanged. This page emits no event,
            writes no data, and never applies the transition to an
            authoritative race run.
          </p>
        </section>
      </div>
    </main>
  )
}
