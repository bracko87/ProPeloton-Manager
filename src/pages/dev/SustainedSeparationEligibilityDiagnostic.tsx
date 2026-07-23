/**
 * SustainedSeparationEligibilityDiagnostic.tsx
 *
 * Phase 7B.4 browser-only, read-only diagnostic.
 *
 * Audits the actual Rio Stage 1 tick stream and a controlled sustained 8%
 * climbing sequence. It combines:
 * - movement gradient and applied group speed;
 * - riderTerrainCapability;
 * - groupShelter;
 * - existing groupHold classification; and
 * - consecutive cannot-hold duration.
 *
 * No rider changes group and no SimulationState is modified outside the
 * existing immutable tick runner.
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
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  calculateGroupShelter,
} from '../../race-engine/simulation/groupShelter'
import {
  calculateRiderGroupHold,
  type RiderGroupHoldStatus,
} from '../../race-engine/simulation/groupHold'
import {
  calculateRiderSeparationEligibility,
  DEFAULT_SEPARATION_WINDOWS_SECONDS,
} from '../../race-engine/simulation/groupSeparationEligibility'
import {
  calculateRiderTerrainCapability,
} from '../../race-engine/simulation/riderTerrainCapability'
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

type EligibilityWindow =
  typeof DEFAULT_SEPARATION_WINDOWS_SECONDS[number]

type HoldCounts = {
  readonly comfortable: number
  readonly underPressure: number
  readonly cannotHold: number
}

type EligibilityCounts = {
  readonly at60Seconds: number
  readonly at120Seconds: number
  readonly at180Seconds: number
}

type RioTickRow = {
  readonly raceSecond: number
  readonly distanceKm: number
  readonly activeGroupCount: number
  readonly leaderGradientPercent: number
  readonly leaderSpeedKmh: number
  readonly averageTerrainCapability: number
  readonly averageShelterBonus: number
  readonly holdCounts: HoldCounts
  readonly maximumConsecutiveCannotHoldSeconds: number
  readonly eligibilityCounts: EligibilityCounts
}

type FirstEligibility = {
  readonly raceSecond: number
  readonly distanceKm: number
  readonly riderCount: number
}

type RioAudit = {
  readonly tickCount: number
  readonly rows: readonly RioTickRow[]
  readonly selectedRows:
    readonly RioTickRow[]
  readonly maximumCannotHoldCount: number
  readonly maximumConsecutiveCannotHoldSeconds: number
  readonly firstEligibility:
    Readonly<
      Record<
        EligibilityWindow,
        FirstEligibility | null
      >
    >
  readonly finalEligibilityCounts:
    EligibilityCounts
  readonly actualMembershipChangeCount: number
  readonly actualCreatedGroupCount: number
  readonly everyStateValid: boolean
  readonly hash: string
}

type ControlledStep = {
  readonly elapsedSeconds: number
  readonly gradientPercent: number
  readonly cannotHoldCount: number
  readonly maximumConsecutiveCannotHoldSeconds: number
  readonly eligibilityCounts: EligibilityCounts
}

type ControlledAudit = {
  readonly steps:
    readonly ControlledStep[]
  readonly climbCannotHoldCount: number
  readonly eligibleAfter30Seconds:
    EligibilityCounts
  readonly eligibleAfter60Seconds:
    EligibilityCounts
  readonly eligibleAfter120Seconds:
    EligibilityCounts
  readonly eligibleAfter180Seconds:
    EligibilityCounts
  readonly nonZeroCountersAfterRecovery: number
  readonly resetRiderCount: number
  readonly hash: string
}

type DiagnosticResult = {
  readonly passed: boolean
  readonly repeatedRioAuditIdentical: boolean
  readonly repeatedControlledAuditIdentical: boolean
  readonly rio: RioAudit
  readonly controlled: ControlledAudit
  readonly checks:
    Readonly<
      Record<string, boolean>
    >
}

const CONTROLLED_GROUP_SPEED_KMH =
  31.2

function createDurationMap(
  riderIds:
    readonly string[],
): Map<string, number> {
  return new Map(
    riderIds.map(
      (riderId) => [
        riderId,
        0,
      ],
    ),
  )
}

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

function emptyHoldCounts():
  HoldCounts {
  return {
    comfortable: 0,
    underPressure: 0,
    cannotHold: 0,
  }
}

function addHoldStatus(
  counts: HoldCounts,
  status: RiderGroupHoldStatus,
): HoldCounts {
  if (status === 'comfortable') {
    return {
      ...counts,
      comfortable:
        counts.comfortable + 1,
    }
  }

  if (
    status ===
    'under_pressure'
  ) {
    return {
      ...counts,
      underPressure:
        counts.underPressure + 1,
    }
  }

  return {
    ...counts,
    cannotHold:
      counts.cannotHold + 1,
  }
}

function getEligibilityCounts(
  durations:
    ReadonlyMap<string, number>,
): EligibilityCounts {
  const values =
    Array.from(
      durations.values(),
    )

  return {
    at60Seconds:
      values.filter(
        (value) =>
          value >= 60,
      ).length,
    at120Seconds:
      values.filter(
        (value) =>
          value >= 120,
      ).length,
    at180Seconds:
      values.filter(
        (value) =>
          value >= 180,
      ).length,
  }
}

function getWindowCount(
  counts: EligibilityCounts,
  window: EligibilityWindow,
): number {
  if (window === 60) {
    return counts.at60Seconds
  }

  if (window === 120) {
    return counts.at120Seconds
  }

  return counts.at180Seconds
}

function getRacingRiders(
  state: SimulationState,
  riderIds: readonly string[],
): RiderState[] {
  return riderIds
    .map((riderId) => {
      const rider =
        state.riders[riderId]

      if (!rider) {
        throw new Error(
          `Sustained separation diagnostic: missing rider ${riderId}.`,
        )
      }

      return rider
    })
    .filter(
      (rider) =>
        rider.stageStatus ===
        'racing',
    )
    .sort(
      (left, right) =>
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
}

function processActualTick(
  tick: SimulateMultiGroupTickResult,
  durations: Map<string, number>,
): RioTickRow {
  const state =
    tick.appliedEnergy.state

  let holdCounts =
    emptyHoldCounts()

  const capabilityAverages:
    number[] = []

  const shelterBonuses:
    number[] = []

  for (
    const proposal of
    tick.movement.proposals
  ) {
    const group =
      state.groups[
        proposal.groupId
      ]

    if (!group) {
      throw new Error(
        `Sustained separation diagnostic: missing group ${proposal.groupId}.`,
      )
    }

    const riders =
      getRacingRiders(
        state,
        proposal.riderIds,
      )

    if (riders.length === 0) {
      continue
    }

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
              proposal
                .gradientPercent,
          }),
      )

    const groupDemandScore =
      average(
        capabilities.map(
          (result) =>
            result.capabilityScore,
        ),
      )

    const shelter =
      calculateGroupShelter({
        groupType:
          group.groupType,
        groupSize:
          riders.length,
        gradientPercent:
          proposal
            .gradientPercent,
      })

    capabilityAverages.push(
      groupDemandScore,
    )

    shelterBonuses.push(
      shelter.shelterBonus,
    )

    for (
      const result of
      capabilities
    ) {
      const effectiveCapability =
        Math.min(
          100,
          result.capabilityScore +
            shelter.shelterBonus,
        )

      const hold =
        calculateRiderGroupHold({
          riderCapabilityScore:
            effectiveCapability,
          groupDemandScore,
          groupSpeedKmh:
            Math.max(
              0.000001,
              proposal
                .appliedSpeedKmh,
            ),
        })

      holdCounts =
        addHoldStatus(
          holdCounts,
          hold.status,
        )

      const previousDuration =
        durations.get(
          result.riderId,
        ) ?? 0

      const eligibility =
        calculateRiderSeparationEligibility({
          riderId:
            result.riderId,
          holdStatus:
            hold.status,
          previousConsecutiveCannotHoldSeconds:
            previousDuration,
          tickSeconds:
            tick.movement
              .tickSeconds,
        })

      durations.set(
        result.riderId,
        eligibility
          .nextConsecutiveCannotHoldSeconds,
      )
    }
  }

  const leaderProposal =
    tick.movement.proposals
      .find(
        (proposal) =>
          proposal.groupId ===
          tick.movement
            .leaderGroupId,
      )

  if (!leaderProposal) {
    throw new Error(
      'Sustained separation diagnostic: leader proposal is missing.',
    )
  }

  const durationValues =
    Array.from(
      durations.values(),
    )

  return {
    raceSecond:
      state.raceSecond,
    distanceKm:
      state.currentKm,
    activeGroupCount:
      tick.movement
        .proposals.length,
    leaderGradientPercent:
      leaderProposal
        .gradientPercent,
    leaderSpeedKmh:
      leaderProposal
        .appliedSpeedKmh,
    averageTerrainCapability:
      average(
        capabilityAverages,
      ),
    averageShelterBonus:
      average(
        shelterBonuses,
      ),
    holdCounts,
    maximumConsecutiveCannotHoldSeconds:
      durationValues.length > 0
        ? Math.max(
            ...durationValues,
          )
        : 0,
    eligibilityCounts:
      getEligibilityCounts(
        durations,
      ),
  }
}

function nearestRow(
  rows: readonly RioTickRow[],
  targetDistanceKm: number,
): RioTickRow {
  const result =
    rows
      .slice()
      .sort(
        (left, right) => {
          const leftDifference =
            Math.abs(
              left.distanceKm -
                targetDistanceKm,
            )

          const rightDifference =
            Math.abs(
              right.distanceKm -
                targetDistanceKm,
            )

          if (
            leftDifference !==
            rightDifference
          ) {
            return (
              leftDifference -
              rightDifference
            )
          }

          return (
            left.raceSecond -
            right.raceSecond
          )
        },
      )[0]

  if (!result) {
    throw new Error(
      'Sustained separation diagnostic: no Rio rows were produced.',
    )
  }

  return result
}

function selectRioRows(
  rows: readonly RioTickRow[],
  stageDistanceKm: number,
): readonly RioTickRow[] {
  const targets = [
    0,
    stageDistanceKm * 0.25,
    stageDistanceKm * 0.5,
    stageDistanceKm * 0.75,
    stageDistanceKm * 0.9,
    stageDistanceKm,
  ]

  const selected =
    targets.map(
      (target) =>
        nearestRow(
          rows,
          target,
        ),
    )

  const firstCannotHold =
    rows.find(
      (row) =>
        row.holdCounts
          .cannotHold > 0,
    )

  if (firstCannotHold) {
    selected.push(
      firstCannotHold,
    )
  }

  const unique =
    new Map<
      number,
      RioTickRow
    >()

  for (const row of selected) {
    unique.set(
      row.raceSecond,
      row,
    )
  }

  return Array.from(
    unique.values(),
  ).sort(
    (left, right) =>
      left.raceSecond -
      right.raceSecond,
  )
}

function runRioAudit():
  RioAudit {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    )

  let state =
    createInitialState(
      stageInput,
    )

  validateSimulationState(
    state,
  )

  const durations =
    createDurationMap(
      stageInput.riders.map(
        (rider) =>
          rider.riderId,
      ),
    )

  const rows:
    RioTickRow[] = []

  let tickCount = 0
  let everyStateValid = true
  let actualMembershipChangeCount = 0
  let actualCreatedGroupCount = 0

  const firstEligibility:
    Record<
      EligibilityWindow,
      FirstEligibility | null
    > = {
      60: null,
      120: null,
      180: null,
    }

  while (!state.completed) {
    const previousState =
      state

    const previousGroupIds =
      new Set(
        Object.keys(
          previousState.groups,
        ),
      )

    const tick =
      simulateMultiGroupTick(
        previousState,
      )

    tickCount += 1

    const row =
      processActualTick(
        tick,
        durations,
      )

    rows.push(row)

    for (
      const window of
      DEFAULT_SEPARATION_WINDOWS_SECONDS
    ) {
      if (
        !firstEligibility[
          window
        ]
      ) {
        const count =
          getWindowCount(
            row.eligibilityCounts,
            window,
          )

        if (count > 0) {
          firstEligibility[
            window
          ] = {
            raceSecond:
              row.raceSecond,
            distanceKm:
              row.distanceKm,
            riderCount:
              count,
          }
        }
      }
    }

    for (
      const rider of
      Object.values(
        tick.state.riders,
      )
    ) {
      const previousRider =
        previousState.riders[
          rider.riderId
        ]

      if (
        previousRider &&
        previousRider
          .currentGroupId !==
          rider.currentGroupId
      ) {
        actualMembershipChangeCount +=
          1
      }
    }

    for (
      const groupId of
      Object.keys(
        tick.state.groups,
      )
    ) {
      if (
        !previousGroupIds.has(
          groupId,
        )
      ) {
        actualCreatedGroupCount +=
          1
      }
    }

    try {
      validateSimulationState(
        tick.state,
      )
    } catch (error) {
      everyStateValid = false
      throw error
    }

    state =
      tick.state
  }

  const durationValues =
    Array.from(
      durations.values(),
    )

  const canonical =
    createCanonicalHashedValue({
      rows,
      tickCount,
      firstEligibility,
      actualMembershipChangeCount,
      actualCreatedGroupCount,
    })

  return {
    tickCount,
    rows,
    selectedRows:
      selectRioRows(
        rows,
        stageInput.distanceKm,
      ),
    maximumCannotHoldCount:
      Math.max(
        ...rows.map(
          (row) =>
            row.holdCounts
              .cannotHold,
        ),
      ),
    maximumConsecutiveCannotHoldSeconds:
      durationValues.length > 0
        ? Math.max(
            ...durationValues,
          )
        : 0,
    firstEligibility,
    finalEligibilityCounts:
      getEligibilityCounts(
        durations,
      ),
    actualMembershipChangeCount,
    actualCreatedGroupCount,
    everyStateValid,
    hash:
      canonical.hash,
  }
}

function processControlledStep(
  riders:
    readonly {
      readonly riderId: string
      readonly attributes:
        RiderState['attributes']
    }[],
  durations: Map<string, number>,
  gradientPercent: number,
  groupSpeedKmh: number,
  elapsedSeconds: number,
): {
  readonly step:
    ControlledStep
  readonly resetRiderCount: number
} {
  const capabilities =
    riders.map(
      (rider) =>
        calculateRiderTerrainCapability({
          riderId:
            rider.riderId,
          attributes:
            rider.attributes,
          currentEnergy: 100,
          gradientPercent,
        }),
    )

  const groupDemandScore =
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
      gradientPercent,
    })

  let cannotHoldCount = 0
  let resetRiderCount = 0

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
        groupDemandScore,
        groupSpeedKmh,
      })

    if (
      hold.status ===
      'cannot_hold'
    ) {
      cannotHoldCount += 1
    }

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

    if (
      eligibility
        .resetThisTick
    ) {
      resetRiderCount += 1
    }

    durations.set(
      capability.riderId,
      eligibility
        .nextConsecutiveCannotHoldSeconds,
    )
  }

  const values =
    Array.from(
      durations.values(),
    )

  return {
    step: {
      elapsedSeconds,
      gradientPercent,
      cannotHoldCount,
      maximumConsecutiveCannotHoldSeconds:
        Math.max(
          ...values,
        ),
      eligibilityCounts:
        getEligibilityCounts(
          durations,
        ),
    },
    resetRiderCount,
  }
}

function findControlledStep(
  steps:
    readonly ControlledStep[],
  elapsedSeconds: number,
): ControlledStep {
  const result =
    steps.find(
      (step) =>
        step.elapsedSeconds ===
        elapsedSeconds,
    )

  if (!result) {
    throw new Error(
      `Sustained separation diagnostic: missing controlled step ${elapsedSeconds}.`,
    )
  }

  return result
}

function runControlledAudit():
  ControlledAudit {
  const stageInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const riders =
    stageInput.riders.map(
      (rider) => ({
        riderId:
          rider.riderId,
        attributes:
          rider.attributes,
      }),
    )

  const durations =
    createDurationMap(
      riders.map(
        (rider) =>
          rider.riderId,
      ),
    )

  const steps:
    ControlledStep[] = []

  let resetRiderCount = 0

  for (
    let elapsedSeconds = 30;
    elapsedSeconds <= 180;
    elapsedSeconds += 30
  ) {
    const processed =
      processControlledStep(
        riders,
        durations,
        8,
        CONTROLLED_GROUP_SPEED_KMH,
        elapsedSeconds,
      )

    steps.push(
      processed.step,
    )
  }

  const climbCannotHoldCount =
    steps[0]
      .cannotHoldCount

  const after30 =
    findControlledStep(
      steps,
      30,
    )

  const after60 =
    findControlledStep(
      steps,
      60,
    )

  const after120 =
    findControlledStep(
      steps,
      120,
    )

  const after180 =
    findControlledStep(
      steps,
      180,
    )

  const recovery =
    processControlledStep(
      riders,
      durations,
      0,
      43.34,
      210,
    )

  steps.push(
    recovery.step,
  )

  resetRiderCount =
    recovery
      .resetRiderCount

  const nonZeroCountersAfterRecovery =
    Array.from(
      durations.values(),
    )
      .filter(
        (value) =>
          value > 0,
      )
      .length

  const canonical =
    createCanonicalHashedValue({
      steps,
      resetRiderCount,
      nonZeroCountersAfterRecovery,
    })

  return {
    steps,
    climbCannotHoldCount,
    eligibleAfter30Seconds:
      after30
        .eligibilityCounts,
    eligibleAfter60Seconds:
      after60
        .eligibilityCounts,
    eligibleAfter120Seconds:
      after120
        .eligibilityCounts,
    eligibleAfter180Seconds:
      after180
        .eligibilityCounts,
    nonZeroCountersAfterRecovery,
    resetRiderCount,
    hash:
      canonical.hash,
  }
}

function buildDiagnostic():
  DiagnosticResult {
  const rioA =
    runRioAudit()

  const rioB =
    runRioAudit()

  const controlledA =
    runControlledAudit()

  const controlledB =
    runControlledAudit()

  const repeatedRioAuditIdentical =
    rioA.hash ===
      rioB.hash &&
    JSON.stringify(rioA) ===
      JSON.stringify(rioB)

  const repeatedControlledAuditIdentical =
    controlledA.hash ===
      controlledB.hash &&
    JSON.stringify(
      controlledA,
    ) ===
      JSON.stringify(
        controlledB,
      )

  const controlled60 =
    controlledA
      .eligibleAfter60Seconds
      .at60Seconds

  const controlled120 =
    controlledA
      .eligibleAfter120Seconds
      .at120Seconds

  const controlled180 =
    controlledA
      .eligibleAfter180Seconds
      .at180Seconds

  const checks = {
    repeatedRioAuditIdentical,
    repeatedControlledAuditIdentical,

    rioEveryStateValid:
      rioA.everyStateValid,

    rioCreatesNoGroups:
      rioA
        .actualCreatedGroupCount ===
      0,

    rioChangesNoMembership:
      rioA
        .actualMembershipChangeCount ===
      0,

    rioHasNoImmediateEligibility:
      rioA
        .firstEligibility[60] ===
      null,

    transientThirtySecondFailureIsNotEligible:
      controlledA
        .eligibleAfter30Seconds
        .at60Seconds === 0,

    sustainedClimbReachesSixtySeconds:
      controlled60 > 0,

    sustainedClimbReachesOneHundredTwentySeconds:
      controlled120 > 0,

    sustainedClimbReachesOneHundredEightySeconds:
      controlled180 > 0,

    longerWindowsNeverIncreaseEligibleCount:
      controlled60 >=
        controlled120 &&
      controlled120 >=
        controlled180,

    recoveryResetsAllCounters:
      controlledA
        .nonZeroCountersAfterRecovery ===
      0,

    recoveryActuallyResetRiders:
      controlledA
        .resetRiderCount > 0,
  }

  return {
    passed:
      Object.values(
        checks,
      ).every(Boolean),
    repeatedRioAuditIdentical,
    repeatedControlledAuditIdentical,
    rio:
      rioA,
    controlled:
      controlledA,
    checks,
  }
}

function formatSeconds(
  seconds: number,
): string {
  const whole =
    Math.max(
      0,
      Math.round(seconds),
    )

  const hours =
    Math.floor(
      whole / 3600,
    )

  const minutes =
    Math.floor(
      (whole % 3600) / 60,
    )

  const remaining =
    whole % 60

  return [
    hours,
    minutes,
    remaining,
  ]
    .map(
      (value) =>
        String(value).padStart(
          2,
          '0',
        ),
    )
    .join(':')
}

function formatNumber(
  value: number,
  digits = 2,
): string {
  return value.toFixed(
    digits,
  )
}

function formatFirstEligibility(
  value:
    FirstEligibility | null,
): string {
  if (!value) {
    return 'Never'
  }

  return (
    `${formatNumber(
      value.distanceKm,
      1,
    )} km · ` +
    `${formatSeconds(
      value.raceSecond,
    )} · ` +
    `${value.riderCount} riders`
  )
}

function Check({
  label,
  passed,
}: {
  readonly label: string
  readonly passed: boolean
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {passed
          ? 'PASS'
          : 'FAIL'}
      </span>
    </div>
  )
}

export default function SustainedSeparationEligibilityDiagnostic():
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
            Phase 7B.4 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Sustained separation eligibility failed
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
            Phase 7B.4 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Sustained separation eligibility
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Compares 60, 120, and 180 seconds of consecutive cannot-hold
            pressure. Rio uses its actual immutable tick stream; the controlled
            sequence applies six 30-second ticks at 8%, followed by one flat
            recovery tick.
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
              ? 'PASS — sustained duration prevents instant separation and resets after recovery'
              : 'FAIL — sustained-separation eligibility needs recalibration'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              'Rio ticks',
              value.rio
                .tickCount,
            ],
            [
              'Rio maximum cannot hold',
              value.rio
                .maximumCannotHoldCount,
            ],
            [
              'Rio maximum consecutive seconds',
              value.rio
                .maximumConsecutiveCannotHoldSeconds,
            ],
            [
              'Controlled 8% cannot hold',
              value.controlled
                .climbCannotHoldCount,
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
            Rio eligibility windows
          </h2>

          <dl className="mt-4 grid gap-4 md:grid-cols-3">
            {DEFAULT_SEPARATION_WINDOWS_SECONDS.map(
              (window) => (
                <div
                  key={window}
                  className="rounded-2xl bg-slate-950 p-4"
                >
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    First eligible at {window}s
                  </dt>

                  <dd className="mt-2 text-sm font-semibold">
                    {formatFirstEligibility(
                      value.rio
                        .firstEligibility[
                          window
                        ],
                    )}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Actual Rio checkpoints
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    Time
                  </th>
                  <th className="px-3 py-3">
                    Distance
                  </th>
                  <th className="px-3 py-3">
                    Groups
                  </th>
                  <th className="px-3 py-3">
                    Gradient
                  </th>
                  <th className="px-3 py-3">
                    Speed
                  </th>
                  <th className="px-3 py-3">
                    Capability
                  </th>
                  <th className="px-3 py-3">
                    Shelter
                  </th>
                  <th className="px-3 py-3">
                    C / P / D
                  </th>
                  <th className="px-3 py-3">
                    Max consecutive
                  </th>
                  <th className="px-3 py-3">
                    Eligible 60 / 120 / 180
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.rio.selectedRows.map(
                  (row) => (
                    <tr
                      key={row.raceSecond}
                      className="border-t border-slate-800"
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatSeconds(
                          row.raceSecond,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {formatNumber(
                          row.distanceKm,
                          1,
                        )} km
                      </td>

                      <td className="px-3 py-3">
                        {row.activeGroupCount}
                      </td>

                      <td className="px-3 py-3">
                        {formatNumber(
                          row.leaderGradientPercent,
                        )}%
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {formatNumber(
                          row.leaderSpeedKmh,
                        )} km/h
                      </td>

                      <td className="px-3 py-3">
                        {formatNumber(
                          row.averageTerrainCapability,
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {formatNumber(
                          row.averageShelterBonus,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.holdCounts.comfortable}
                        {' / '}
                        {row.holdCounts.underPressure}
                        {' / '}
                        {row.holdCounts.cannotHold}
                      </td>

                      <td className="px-3 py-3">
                        {row.maximumConsecutiveCannotHoldSeconds}s
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {row.eligibilityCounts.at60Seconds}
                        {' / '}
                        {row.eligibilityCounts.at120Seconds}
                        {' / '}
                        {row.eligibilityCounts.at180Seconds}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Controlled 8% sequence
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Six 30-second climb steps, followed by a flat recovery step at
              210 seconds.
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
                    Gradient
                  </th>
                  <th className="px-3 py-3">
                    Cannot hold
                  </th>
                  <th className="px-3 py-3">
                    Max consecutive
                  </th>
                  <th className="px-3 py-3">
                    Eligible 60 / 120 / 180
                  </th>
                </tr>
              </thead>

              <tbody>
                {value.controlled.steps.map(
                  (step) => (
                    <tr
                      key={step.elapsedSeconds}
                      className="border-t border-slate-800"
                    >
                      <td className="px-3 py-3">
                        {step.elapsedSeconds}s
                      </td>

                      <td className="px-3 py-3">
                        {step.gradientPercent > 0
                          ? '+'
                          : ''}
                        {step.gradientPercent}%
                      </td>

                      <td className="px-3 py-3">
                        {step.cannotHoldCount}
                      </td>

                      <td className="px-3 py-3">
                        {step.maximumConsecutiveCannotHoldSeconds}s
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {step.eligibilityCounts.at60Seconds}
                        {' / '}
                        {step.eligibilityCounts.at120Seconds}
                        {' / '}
                        {step.eligibilityCounts.at180Seconds}
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
            Recovery result
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Riders reset by flat recovery
              </dt>

              <dd className="mt-2 text-2xl font-semibold">
                {value.controlled.resetRiderCount}
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Non-zero counters after recovery
              </dt>

              <dd className="mt-2 text-2xl font-semibold">
                {value.controlled.nonZeroCountersAfterRecovery}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-3">
            <Check
              label="Repeated Rio audit is identical"
              passed={
                value.checks
                  .repeatedRioAuditIdentical
              }
            />

            <Check
              label="Repeated controlled audit is identical"
              passed={
                value.checks
                  .repeatedControlledAuditIdentical
              }
            />

            <Check
              label="Every Rio SimulationState validates"
              passed={
                value.checks
                  .rioEveryStateValid
              }
            />

            <Check
              label="Rio creates no groups"
              passed={
                value.checks
                  .rioCreatesNoGroups
              }
            />

            <Check
              label="Rio changes no rider membership"
              passed={
                value.checks
                  .rioChangesNoMembership
              }
            />

            <Check
              label="Rio produces no 60-second separation eligibility"
              passed={
                value.checks
                  .rioHasNoImmediateEligibility
              }
            />

            <Check
              label="A transient 30-second failure is not eligible"
              passed={
                value.checks
                  .transientThirtySecondFailureIsNotEligible
              }
            />

            <Check
              label="Sustained climbing reaches the 60-second window"
              passed={
                value.checks
                  .sustainedClimbReachesSixtySeconds
              }
            />

            <Check
              label="Sustained climbing reaches the 120-second window"
              passed={
                value.checks
                  .sustainedClimbReachesOneHundredTwentySeconds
              }
            />

            <Check
              label="Sustained climbing reaches the 180-second window"
              passed={
                value.checks
                  .sustainedClimbReachesOneHundredEightySeconds
              }
            />

            <Check
              label="Longer windows never increase the eligible rider count"
              passed={
                value.checks
                  .longerWindowsNeverIncreaseEligibleCount
              }
            />

            <Check
              label="Flat recovery resets all counters"
              passed={
                value.checks
                  .recoveryResetsAllCounters
              }
            />

            <Check
              label="The recovery step actually resets riders"
              passed={
                value.checks
                  .recoveryActuallyResetRiders
              }
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm leading-6 text-slate-300">
          <h2 className="text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            Eligibility is diagnostic metadata only. The active tick remains
            movement → energy → finish. No transition proposal or dropped group
            is created by this page.
          </p>

          <p className="mt-3 font-mono text-xs text-slate-500">
            Rio audit hash:
            {' '}
            {value.rio.hash}
            <br />
            Controlled audit hash:
            {' '}
            {value.controlled.hash}
          </p>
        </section>
      </div>
    </main>
  )
}
