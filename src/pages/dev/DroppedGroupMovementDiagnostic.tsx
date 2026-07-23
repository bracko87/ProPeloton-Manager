/**
 * DroppedGroupMovementDiagnostic.tsx
 *
 * Phase 7B.6 browser-only, read-only diagnostic.
 *
 * Creates the verified 90-rider peloton + 6-rider dropped-group transition,
 * then runs the existing movement proposal/application pipeline for:
 *
 * - a controlled flat stage; and
 * - a controlled constant 8% climb.
 *
 * This measures whether the current per-group pace calculation naturally
 * creates a physical gap. The transition is still not connected to
 * simulateMultiGroupTick().
 */

import { useMemo } from 'react'

import type {
  RiderState,
} from '../../race-engine/domain/RiderState'
import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  applyDroppedGroupTransitionProposal,
} from '../../race-engine/simulation/applyDroppedGroupTransitionProposal'
import {
  applyMultiGroupMovement,
} from '../../race-engine/simulation/applyMultiGroupMovement'
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
  calculateMultiGroupMovement,
} from '../../race-engine/simulation/multiGroupMovement'
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

interface MovementRow {
  readonly elapsedSeconds: number
  readonly pelotonSpeedKmh: number
  readonly droppedSpeedKmh: number
  readonly speedDifferenceKmh: number
  readonly pelotonDistanceKm: number
  readonly droppedDistanceKm: number
  readonly distanceGapMetres: number
  readonly gapSeconds: number
  readonly leaderGroupId: string
  readonly stateValid: boolean
  readonly riderPositionsMatchGroups: boolean
  readonly membershipsStable: boolean
}

interface ScenarioResult {
  readonly label: string
  readonly gradientPercent: number
  readonly tickCount: number
  readonly rows: readonly MovementRow[]
  readonly selectedRows: readonly MovementRow[]
  readonly initialGapSeconds: number
  readonly finalGapSeconds: number
  readonly finalDistanceGapMetres: number
  readonly averagePelotonSpeedKmh: number
  readonly averageDroppedSpeedKmh: number
  readonly averageSpeedDifferenceKmh: number
  readonly pelotonLeaderEveryTick: boolean
  readonly droppedSlowerEveryTick: boolean
  readonly gapNeverDecreases: boolean
  readonly everyStateValid: boolean
  readonly everyRiderPositionMatchesGroup: boolean
  readonly membershipsStableEveryTick: boolean
  readonly bothGroupsActiveAtEnd: boolean
  readonly hash: string
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly eligibleRiderCount: number
  readonly movedRiderNames: readonly string[]
  readonly sourceRiderCount: number
  readonly droppedRiderCount: number
  readonly flat: ScenarioResult
  readonly climb: ScenarioResult
  readonly repeatedFlatIdentical: boolean
  readonly repeatedClimbIdentical: boolean
  readonly climbTimeGapAmplificationRatio: number
  readonly climbDistanceGapAmplificationRatio: number
  readonly terrainSpecificSeparationAmplified: boolean
  readonly checks: readonly CheckResult[]
}

const CONTROLLED_DISTANCE_KM =
  20

const TRANSITION_RACE_SECOND =
  120

const TRANSITION_DISTANCE_KM =
  1.04

const TRANSITION_SPEED_KMH =
  31.2

const ELIGIBILITY_GRADIENT_PERCENT =
  8

const MOVEMENT_TICK_COUNT =
  20

const DROPPED_GROUP_ID =
  'dropped_1'

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function createControlledStageInput(
  gradientPercent: number,
  suffix: string,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const finalElevationMetres =
    CONTROLLED_DISTANCE_KM *
    1000 *
    (gradientPercent / 100)

  return {
    ...base,
    raceId:
      `${base.raceId}-${suffix}`,
    stageId:
      `${base.stageId}-${suffix}`,
    stageName:
      `Dropped-group movement ${suffix}`,
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
          finalElevationMetres,
      },
    ],
    orders: [],
  }
}

function createTransitionCheckpoint(
  stageInput: StageInput,
): SimulationState {
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
      'DroppedGroupMovementDiagnostic: initial peloton is missing.',
    )
  }

  const riders:
    Record<string, RiderState> =
      Object.fromEntries(
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
                TRANSITION_DISTANCE_KM,
              speedKmh:
                TRANSITION_SPEED_KMH,
            },
          ],
        ),
      )

  const checkpoint:
    SimulationState = {
      ...initialState,
      raceSecond:
        TRANSITION_RACE_SECOND,
      currentKm:
        TRANSITION_DISTANCE_KM,
      riders,
      groups: {
        ...initialState.groups,
        [peloton.groupId]: {
          ...peloton,
          distanceKm:
            TRANSITION_DISTANCE_KM,
          speedKmh:
            TRANSITION_SPEED_KMH,
          gapFromLeaderSeconds: 0,
        },
      },
    }

  validateSimulationState(
    checkpoint,
  )

  return checkpoint
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
      'DroppedGroupMovementDiagnostic: eligibility peloton is missing.',
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
              `DroppedGroupMovementDiagnostic: missing rider ${riderId}.`,
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
            ELIGIBILITY_GRADIENT_PERCENT,
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
      groupType: 'peloton',
      groupSize:
        riders.length,
      gradientPercent:
        ELIGIBILITY_GRADIENT_PERCENT,
    })

  const durations =
    new Map<string, number>(
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
            TRANSITION_SPEED_KMH,
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
      ([, duration]) =>
        duration >= 120,
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

function createTransitionState(
  stageInput: StageInput,
): {
  readonly state:
    SimulationState
  readonly eligibleRiderIds:
    readonly string[]
  readonly movedRiderNames:
    readonly string[]
} {
  const checkpoint =
    createTransitionCheckpoint(
      stageInput,
    )

  const eligibleRiderIds =
    calculateEligibleRiderIds(
      checkpoint,
    )

  const proposal =
    calculateDroppedGroupTransitionProposal({
      state:
        checkpoint,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,
      eligibleRiderIds,
    })

  if (!proposal) {
    throw new Error(
      'DroppedGroupMovementDiagnostic: expected a dropped-group proposal.',
    )
  }

  const applied =
    applyDroppedGroupTransitionProposal({
      state:
        checkpoint,
      proposal,
    })

  validateSimulationState(
    applied.state,
  )

  return {
    state:
      applied.state,
    eligibleRiderIds,
    movedRiderNames:
      eligibleRiderIds.map(
        (riderId) =>
          checkpoint.riders[
            riderId
          ]?.riderName ??
          riderId,
      ),
  }
}

function riderPositionsMatchGroups(
  state: SimulationState,
): boolean {
  return Object.values(
    state.riders,
  ).every(
    (rider) => {
      const group =
        state.groups[
          rider.currentGroupId
        ]

      return (
        !!group &&
        rider.distanceKm ===
          group.distanceKm &&
        rider.speedKmh ===
          group.speedKmh
      )
    },
  )
}

function membershipsStable(
  state: SimulationState,
): boolean {
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
    return false
  }

  return (
    peloton.riderIds.length ===
      90 &&
    dropped.riderIds.length ===
      6 &&
    Object.values(
      state.riders,
    ).every(
      (rider) =>
        (
          peloton.riderIds
            .includes(
              rider.riderId,
            ) &&
          rider.currentGroupId ===
            peloton.groupId
        ) ||
        (
          dropped.riderIds
            .includes(
              rider.riderId,
            ) &&
          rider.currentGroupId ===
            dropped.groupId
        ),
    )
  )
}

function selectRows(
  rows:
    readonly MovementRow[],
): readonly MovementRow[] {
  const elapsedTargets =
    new Set([
      30,
      60,
      120,
      300,
      600,
    ])

  return rows.filter(
    (row) =>
      elapsedTargets.has(
        row.elapsedSeconds,
      ),
  )
}

function runScenario(
  gradientPercent: number,
  label: string,
  suffix: string,
): ScenarioResult {
  const stageInput =
    createControlledStageInput(
      gradientPercent,
      suffix,
    )

  const transition =
    createTransitionState(
      stageInput,
    )

  let state =
    transition.state

  const rows:
    MovementRow[] = []

  const initialDropped =
    state.groups[
      DROPPED_GROUP_ID
    ]

  if (!initialDropped) {
    throw new Error(
      'DroppedGroupMovementDiagnostic: initial dropped group is missing.',
    )
  }

  const initialGapSeconds =
    initialDropped
      .gapFromLeaderSeconds

  for (
    let tickIndex = 1;
    tickIndex <=
      MOVEMENT_TICK_COUNT;
    tickIndex += 1
  ) {
    const movement =
      calculateMultiGroupMovement(
        state,
      )

    const pelotonProposal =
      movement.proposals
        .find(
          (proposal) =>
            proposal.groupId ===
            INITIAL_PELOTON_GROUP_ID,
        )

    const droppedProposal =
      movement.proposals
        .find(
          (proposal) =>
            proposal.groupId ===
            DROPPED_GROUP_ID,
        )

    if (
      !pelotonProposal ||
      !droppedProposal
    ) {
      throw new Error(
        'DroppedGroupMovementDiagnostic: expected peloton and dropped movement proposals.',
      )
    }

    const applied =
      applyMultiGroupMovement({
        state,
        movement,
      })

    let stateValid = true

    try {
      validateSimulationState(
        applied.state,
      )
    } catch {
      stateValid = false
    }

    const nextState =
      applied.state

    rows.push({
      elapsedSeconds:
        tickIndex *
        movement.tickSeconds,
      pelotonSpeedKmh:
        pelotonProposal
          .appliedSpeedKmh,
      droppedSpeedKmh:
        droppedProposal
          .appliedSpeedKmh,
      speedDifferenceKmh:
        pelotonProposal
          .appliedSpeedKmh -
        droppedProposal
          .appliedSpeedKmh,
      pelotonDistanceKm:
        pelotonProposal
          .nextDistanceKm,
      droppedDistanceKm:
        droppedProposal
          .nextDistanceKm,
      distanceGapMetres:
        (
          pelotonProposal
            .nextDistanceKm -
          droppedProposal
            .nextDistanceKm
        ) *
        1000,
      gapSeconds:
        droppedProposal
          .gapFromLeaderSeconds,
      leaderGroupId:
        movement
          .leaderGroupId,
      stateValid,
      riderPositionsMatchGroups:
        riderPositionsMatchGroups(
          nextState,
        ),
      membershipsStable:
        membershipsStable(
          nextState,
        ),
    })

    state =
      nextState
  }

  const finalRow =
    rows[
      rows.length - 1
    ]

  if (!finalRow) {
    throw new Error(
      'DroppedGroupMovementDiagnostic: scenario produced no rows.',
    )
  }

  const gapNeverDecreases =
    rows.every(
      (row, index) =>
        index === 0 ||
        row.gapSeconds >=
          rows[
            index - 1
          ].gapSeconds,
    )

  const finalPeloton =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  const finalDropped =
    state.groups[
      DROPPED_GROUP_ID
    ]

  const compact =
    createCanonicalHashedValue({
      label,
      gradientPercent,
      rows,
      finalGroups: {
        peloton:
          finalPeloton,
        dropped:
          finalDropped,
      },
    })

  return {
    label,
    gradientPercent,
    tickCount:
      rows.length,
    rows,
    selectedRows:
      selectRows(
        rows,
      ),
    initialGapSeconds,
    finalGapSeconds:
      finalRow.gapSeconds,
    finalDistanceGapMetres:
      finalRow
        .distanceGapMetres,
    averagePelotonSpeedKmh:
      average(
        rows.map(
          (row) =>
            row.pelotonSpeedKmh,
        ),
      ),
    averageDroppedSpeedKmh:
      average(
        rows.map(
          (row) =>
            row.droppedSpeedKmh,
        ),
      ),
    averageSpeedDifferenceKmh:
      average(
        rows.map(
          (row) =>
            row.speedDifferenceKmh,
        ),
      ),
    pelotonLeaderEveryTick:
      rows.every(
        (row) =>
          row.leaderGroupId ===
          INITIAL_PELOTON_GROUP_ID,
      ),
    droppedSlowerEveryTick:
      rows.every(
        (row) =>
          row.droppedSpeedKmh <
          row.pelotonSpeedKmh,
      ),
    gapNeverDecreases,
    everyStateValid:
      rows.every(
        (row) =>
          row.stateValid,
      ),
    everyRiderPositionMatchesGroup:
      rows.every(
        (row) =>
          row
            .riderPositionsMatchGroups,
      ),
    membershipsStableEveryTick:
      rows.every(
        (row) =>
          row.membershipsStable,
      ),
    bothGroupsActiveAtEnd:
      !!finalPeloton?.active &&
      !!finalDropped?.active,
    hash:
      compact.hash,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const eligibilityStage =
    createControlledStageInput(
      8,
      'eligibility',
    )

  const transition =
    createTransitionState(
      eligibilityStage,
    )

  const flatA =
    runScenario(
      0,
      'Flat control',
      'flat-a',
    )

  const flatB =
    runScenario(
      0,
      'Flat control',
      'flat-b',
    )

  const climbA =
    runScenario(
      8,
      'Constant 8% climb',
      'climb-a',
    )

  const climbB =
    runScenario(
      8,
      'Constant 8% climb',
      'climb-b',
    )

  const repeatedFlatIdentical =
    flatA.hash ===
      flatB.hash &&
    JSON.stringify(
      flatA.rows,
    ) ===
      JSON.stringify(
        flatB.rows,
      )

  const repeatedClimbIdentical =
    climbA.hash ===
      climbB.hash &&
    JSON.stringify(
      climbA.rows,
    ) ===
      JSON.stringify(
        climbB.rows,
      )

  const climbTimeGapAmplificationRatio =
    flatA.finalGapSeconds > 0
      ? climbA.finalGapSeconds /
        flatA.finalGapSeconds
      : 0

  const climbDistanceGapAmplificationRatio =
    flatA
      .finalDistanceGapMetres > 0
      ? climbA
          .finalDistanceGapMetres /
        flatA
          .finalDistanceGapMetres
      : 0

  /*
   * The current movement engine applies one terrain multiplier to each group's
   * existing flat-biased base pace. Terrain-specific rider capability is not
   * connected yet. This informational flag checks whether the climb produces
   * materially more time separation than the flat control.
   */
  const terrainSpecificSeparationAmplified =
    climbTimeGapAmplificationRatio >
    1.1

  const checks:
    CheckResult[] = [
      {
        label:
          'Exactly six riders form the dropped group',
        passed:
          transition
            .eligibleRiderIds
            .length === 6,
      },
      {
        label:
          'Flat repeated run is identical',
        passed:
          repeatedFlatIdentical,
      },
      {
        label:
          'Climb repeated run is identical',
        passed:
          repeatedClimbIdentical,
      },
      {
        label:
          'Peloton leads every flat tick',
        passed:
          flatA
            .pelotonLeaderEveryTick,
      },
      {
        label:
          'Peloton leads every climbing tick',
        passed:
          climbA
            .pelotonLeaderEveryTick,
      },
      {
        label:
          'Dropped group is slower on every flat tick',
        passed:
          flatA
            .droppedSlowerEveryTick,
      },
      {
        label:
          'Dropped group is slower on every climbing tick',
        passed:
          climbA
            .droppedSlowerEveryTick,
      },
      {
        label:
          'Flat distance and time gaps become positive',
        passed:
          flatA
            .finalDistanceGapMetres >
            0 &&
          flatA
            .finalGapSeconds > 0,
      },
      {
        label:
          'Climbing distance and time gaps become positive',
        passed:
          climbA
            .finalDistanceGapMetres >
            0 &&
          climbA
            .finalGapSeconds > 0,
      },
      {
        label:
          'Flat gap never decreases',
        passed:
          flatA
            .gapNeverDecreases,
      },
      {
        label:
          'Climbing gap never decreases',
        passed:
          climbA
            .gapNeverDecreases,
      },
      {
        label:
          'Every produced state validates',
        passed:
          flatA
            .everyStateValid &&
          climbA
            .everyStateValid,
      },
      {
        label:
          'Every rider position continues matching its group',
        passed:
          flatA
            .everyRiderPositionMatchesGroup &&
          climbA
            .everyRiderPositionMatchesGroup,
      },
      {
        label:
          'The 90 + 6 memberships remain stable',
        passed:
          flatA
            .membershipsStableEveryTick &&
          climbA
            .membershipsStableEveryTick,
      },
      {
        label:
          'Both groups remain active',
        passed:
          flatA
            .bothGroupsActiveAtEnd &&
          climbA
            .bothGroupsActiveAtEnd,
      },
      {
        label:
          'The 8% climb reduces both groups’ applied speed',
        passed:
          climbA
            .averagePelotonSpeedKmh <
            flatA
              .averagePelotonSpeedKmh &&
          climbA
            .averageDroppedSpeedKmh <
            flatA
              .averageDroppedSpeedKmh,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    eligibleRiderCount:
      transition
        .eligibleRiderIds
        .length,
    movedRiderNames:
      transition
        .movedRiderNames,
    sourceRiderCount: 90,
    droppedRiderCount: 6,
    flat:
      flatA,
    climb:
      climbA,
    repeatedFlatIdentical,
    repeatedClimbIdentical,
    climbTimeGapAmplificationRatio,
    climbDistanceGapAmplificationRatio,
    terrainSpecificSeparationAmplified,
    checks,
  }
}

function formatNumber(
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

function ScenarioTable({
  scenario,
}: {
  readonly scenario:
    ScenarioResult
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {scenario.label}
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Gradient:
          {' '}
          {scenario.gradientPercent}%
          {' · '}
          {scenario.tickCount} movement ticks
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">
                Elapsed
              </th>
              <th className="px-3 py-3">
                Peloton speed
              </th>
              <th className="px-3 py-3">
                Dropped speed
              </th>
              <th className="px-3 py-3">
                Difference
              </th>
              <th className="px-3 py-3">
                Distance gap
              </th>
              <th className="px-3 py-3">
                Time gap
              </th>
              <th className="px-3 py-3">
                Leader
              </th>
            </tr>
          </thead>

          <tbody>
            {scenario.selectedRows.map(
              (row) => (
                <tr
                  key={row.elapsedSeconds}
                  className="border-t border-slate-800"
                >
                  <td className="px-3 py-3">
                    {row.elapsedSeconds}s
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {formatNumber(
                      row.pelotonSpeedKmh,
                    )} km/h
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {formatNumber(
                      row.droppedSpeedKmh,
                    )} km/h
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {formatNumber(
                      row.speedDifferenceKmh,
                    )} km/h
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {formatNumber(
                      row.distanceGapMetres,
                      1,
                    )} m
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {formatNumber(
                      row.gapSeconds,
                    )} s
                  </td>

                  <td className="px-3 py-3 font-mono">
                    {row.leaderGroupId}
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

export default function DroppedGroupMovementDiagnostic():
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
            Phase 7B.6 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped-group movement failed
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
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.6 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Dropped-group movement and physical gap
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Runs the existing calculateMultiGroupMovement and
            applyMultiGroupMovement pipeline after the verified 90 + 6
            transition. Flat and constant-8% stages are compared without
            changing the movement engine.
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
              ? 'PASS — existing per-group pace creates a deterministic physical gap'
              : 'FAIL — existing movement does not produce a valid stable gap'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              'Eligible riders',
              value.eligibleRiderCount,
            ],
            [
              'Peloton riders',
              value.sourceRiderCount,
            ],
            [
              'Dropped riders',
              value.droppedRiderCount,
            ],
            [
              'Flat final gap',
              `${formatNumber(
                value.flat
                  .finalGapSeconds,
              )} s`,
            ],
            [
              '8% final gap',
              `${formatNumber(
                value.climb
                  .finalGapSeconds,
              )} s`,
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

        <ScenarioTable
          scenario={
            value.flat
          }
        />

        <ScenarioTable
          scenario={
            value.climb
          }
        />

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Scenario summaries
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[value.flat, value.climb].map(
              (scenario) => (
                <div
                  key={scenario.label}
                  className="rounded-2xl bg-slate-950 p-4"
                >
                  <div className="font-semibold">
                    {scenario.label}
                  </div>

                  <dl className="mt-3 space-y-2 text-sm text-slate-300">
                    <div className="flex justify-between gap-4">
                      <dt>
                        Average peloton speed
                      </dt>
                      <dd>
                        {formatNumber(
                          scenario
                            .averagePelotonSpeedKmh,
                        )} km/h
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Average dropped speed
                      </dt>
                      <dd>
                        {formatNumber(
                          scenario
                            .averageDroppedSpeedKmh,
                        )} km/h
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Average difference
                      </dt>
                      <dd>
                        {formatNumber(
                          scenario
                            .averageSpeedDifferenceKmh,
                        )} km/h
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Final distance gap
                      </dt>
                      <dd>
                        {formatNumber(
                          scenario
                            .finalDistanceGapMetres,
                          1,
                        )} m
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt>
                        Hash
                      </dt>
                      <dd className="font-mono text-xs">
                        {scenario.hash}
                      </dd>
                    </div>
                  </dl>
                </div>
              ),
            )}
          </div>
        </section>

        <section
          className={[
            'rounded-3xl border p-6',
            value
              .terrainSpecificSeparationAmplified
              ? 'border-emerald-500 bg-emerald-950/20'
              : 'border-amber-500 bg-amber-950/20',
          ].join(' ')}
        >
          <h2 className="text-xl font-semibold">
            Terrain-specific separation
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            Climb / flat final time-gap ratio:
            {' '}
            <strong>
              {formatNumber(
                value
                  .climbTimeGapAmplificationRatio,
                3,
              )}
            </strong>
            .
            {' '}
            Climb / flat final distance-gap ratio:
            {' '}
            <strong>
              {formatNumber(
                value
                  .climbDistanceGapAmplificationRatio,
                3,
              )}
            </strong>
            .
          </p>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            {value
              .terrainSpecificSeparationAmplified
              ? 'The climb materially amplifies the separation under the current movement calculation.'
              : 'The climb does not materially amplify time separation. This is expected because the active group base pace is still flat-biased and the same terrain multiplier is applied to both groups.'}
          </p>
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
            Moved riders
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {value.movedRiderNames.map(
              (riderName) => (
                <span
                  key={riderName}
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"
                >
                  {riderName}
                </span>
              ),
            )}
          </div>

          <h2 className="mt-6 text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            No production file is replaced. The normal tick orchestration,
            persistence, events, and authoritative replay remain unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
