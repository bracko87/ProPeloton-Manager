/**
 * TerrainAwareGroupPaceDiagnostic.tsx
 *
 * Phase 7B.7 browser-only, read-only diagnostic.
 *
 * Compares terrain-capability influence values 0%, 50%, and 100% after the
 * verified 90 + 6 dropped-group transition.
 *
 * Influence 0% must reproduce the current movement engine exactly.
 * Flat-road movement must remain unchanged at every influence.
 * On an 8% climb, terrain-specialisation differences should progressively
 * amplify the time gap.
 *
 * No production movement file is replaced.
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
  calculateTerrainAwareMultiGroupMovement,
} from '../../race-engine/simulation/terrainAwareMultiGroupMovement'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'

type Influence =
  | 0
  | 0.5
  | 1

interface CheckResult {
  readonly label: string
  readonly passed: boolean
}

interface ScenarioRow {
  readonly elapsedSeconds: number
  readonly pelotonSpeedKmh: number
  readonly droppedSpeedKmh: number
  readonly speedDifferenceKmh: number
  readonly distanceGapMetres: number
  readonly gapSeconds: number
}

interface ScenarioResult {
  readonly gradientPercent: number
  readonly influence: Influence
  readonly rows:
    readonly ScenarioRow[]
  readonly selectedRows:
    readonly ScenarioRow[]

  readonly pelotonFlatCapability: number
  readonly pelotonTerrainCapability: number
  readonly pelotonCapabilityRatio: number
  readonly pelotonAdjustmentMultiplier: number

  readonly droppedFlatCapability: number
  readonly droppedTerrainCapability: number
  readonly droppedCapabilityRatio: number
  readonly droppedAdjustmentMultiplier: number

  readonly finalDistanceGapMetres: number
  readonly finalGapSeconds: number
  readonly averagePelotonSpeedKmh: number
  readonly averageDroppedSpeedKmh: number
  readonly averageSpeedDifferenceKmh: number

  readonly pelotonLeaderEveryTick: boolean
  readonly droppedSlowerEveryTick: boolean
  readonly gapNeverDecreases: boolean
  readonly everyStateValid: boolean
  readonly riderPositionsMatchGroups: boolean
  readonly membershipsStable: boolean
  readonly bothGroupsActive: boolean

  readonly hash: string
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly eligibleRiderCount: number
  readonly movedRiderNames:
    readonly string[]

  readonly flat:
    Readonly<
      Record<
        Influence,
        ScenarioResult
      >
    >

  readonly climb:
    Readonly<
      Record<
        Influence,
        ScenarioResult
      >
    >

  readonly zeroInfluenceMatchesCurrentFlat:
    boolean
  readonly zeroInfluenceMatchesCurrentClimb:
    boolean

  readonly repeatedIdentical:
    boolean

  readonly fiftyPercentGapAmplification:
    number
  readonly fullGapAmplification:
    number

  readonly checks:
    readonly CheckResult[]
}

const INFLUENCES:
  readonly Influence[] = [
    0,
    0.5,
    1,
  ]

const DISTANCE_KM =
  20

const TRANSITION_RACE_SECOND =
  120

const TRANSITION_DISTANCE_KM =
  1.04

const TRANSITION_SPEED_KMH =
  31.2

const ELIGIBILITY_GRADIENT =
  8

const MOVEMENT_TICKS =
  20

const DROPPED_GROUP_ID =
  'dropped_1'

function average(
  values: readonly number[],
): number {
  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function controlledStage(
  gradientPercent: number,
  suffix: string,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      `${base.raceId}-${suffix}`,
    stageId:
      `${base.stageId}-${suffix}`,
    stageName:
      `Terrain-aware group pace ${suffix}`,
    distanceKm:
      DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          DISTANCE_KM,
        elevationMetres:
          DISTANCE_KM *
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

function transitionCheckpoint(
  stageInput: StageInput,
): SimulationState {
  const initial =
    createInitialState(
      stageInput,
    )

  const peloton =
    initial.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'TerrainAwareGroupPaceDiagnostic: peloton is missing.',
    )
  }

  const riders:
    Record<string, RiderState> =
      Object.fromEntries(
        Object.entries(
          initial.riders,
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

  const state:
    SimulationState = {
      ...initial,
      raceSecond:
        TRANSITION_RACE_SECOND,
      currentKm:
        TRANSITION_DISTANCE_KM,
      riders,
      groups: {
        ...initial.groups,
        [peloton.groupId]: {
          ...peloton,
          distanceKm:
            TRANSITION_DISTANCE_KM,
          speedKmh:
            TRANSITION_SPEED_KMH,
          gapFromLeaderSeconds:
            0,
        },
      },
    }

  validateSimulationState(
    state,
  )

  return state
}

function eligibleRiderIds(
  state: SimulationState,
): readonly string[] {
  const peloton =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]

  if (!peloton) {
    throw new Error(
      'TerrainAwareGroupPaceDiagnostic: eligibility peloton is missing.',
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
              `TerrainAwareGroupPaceDiagnostic: missing rider ${riderId}.`,
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
            ELIGIBILITY_GRADIENT,
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
        ELIGIBILITY_GRADIENT,
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

function transitionedState(
  stageInput: StageInput,
): {
  readonly state:
    SimulationState
  readonly eligible:
    readonly string[]
  readonly names:
    readonly string[]
} {
  const checkpoint =
    transitionCheckpoint(
      stageInput,
    )

  const eligible =
    eligibleRiderIds(
      checkpoint,
    )

  const proposal =
    calculateDroppedGroupTransitionProposal({
      state:
        checkpoint,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,
      eligibleRiderIds:
        eligible,
    })

  if (!proposal) {
    throw new Error(
      'TerrainAwareGroupPaceDiagnostic: expected transition proposal.',
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
    eligible,
    names:
      eligible.map(
        (riderId) =>
          checkpoint.riders[
            riderId
          ]?.riderName ??
          riderId,
      ),
  }
}

function positionsMatch(
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

function stableMembership(
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

  return (
    !!peloton &&
    !!dropped &&
    peloton.riderIds.length ===
      90 &&
    dropped.riderIds.length ===
      6
  )
}

function selectedRows(
  rows:
    readonly ScenarioRow[],
): readonly ScenarioRow[] {
  const targets =
    new Set([
      30,
      60,
      120,
      300,
      600,
    ])

  return rows.filter(
    (row) =>
      targets.has(
        row.elapsedSeconds,
      ),
  )
}

function runScenario(
  gradientPercent: number,
  influence: Influence,
  suffix: string,
): ScenarioResult {
  const stage =
    controlledStage(
      gradientPercent,
      suffix,
    )

  const transition =
    transitionedState(
      stage,
    )

  let state =
    transition.state

  const rows:
    ScenarioRow[] = []

  let firstPelotonDiagnostic:
    ReturnType<
      typeof calculateTerrainAwareMultiGroupMovement
    >['groupDiagnostics'][number]['pace'] |
      null = null

  let firstDroppedDiagnostic:
    ReturnType<
      typeof calculateTerrainAwareMultiGroupMovement
    >['groupDiagnostics'][number]['pace'] |
      null = null

  let allValid = true
  let allPositionsMatch = true
  let allMembershipsStable = true
  let bothActive = true

  for (
    let tickIndex = 1;
    tickIndex <=
      MOVEMENT_TICKS;
    tickIndex += 1
  ) {
    const candidate =
      calculateTerrainAwareMultiGroupMovement(
        state,
        influence,
      )

    const pelotonProposal =
      candidate.movement
        .proposals.find(
          (proposal) =>
            proposal.groupId ===
            INITIAL_PELOTON_GROUP_ID,
        )

    const droppedProposal =
      candidate.movement
        .proposals.find(
          (proposal) =>
            proposal.groupId ===
            DROPPED_GROUP_ID,
        )

    const pelotonDiagnostic =
      candidate
        .groupDiagnostics
        .find(
          (entry) =>
            entry.groupId ===
            INITIAL_PELOTON_GROUP_ID,
        )

    const droppedDiagnostic =
      candidate
        .groupDiagnostics
        .find(
          (entry) =>
            entry.groupId ===
            DROPPED_GROUP_ID,
        )

    if (
      !pelotonProposal ||
      !droppedProposal ||
      !pelotonDiagnostic ||
      !droppedDiagnostic
    ) {
      throw new Error(
        'TerrainAwareGroupPaceDiagnostic: expected both group proposals and diagnostics.',
      )
    }

    if (!firstPelotonDiagnostic) {
      firstPelotonDiagnostic =
        pelotonDiagnostic.pace
      firstDroppedDiagnostic =
        droppedDiagnostic.pace
    }

    const applied =
      applyMultiGroupMovement({
        state,
        movement:
          candidate.movement,
      })

    try {
      validateSimulationState(
        applied.state,
      )
    } catch {
      allValid = false
    }

    allPositionsMatch =
      allPositionsMatch &&
      positionsMatch(
        applied.state,
      )

    allMembershipsStable =
      allMembershipsStable &&
      stableMembership(
        applied.state,
      )

    bothActive =
      bothActive &&
      !!applied.state.groups[
        INITIAL_PELOTON_GROUP_ID
      ]?.active &&
      !!applied.state.groups[
        DROPPED_GROUP_ID
      ]?.active

    rows.push({
      elapsedSeconds:
        tickIndex *
        candidate.movement
          .tickSeconds,
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
    })

    state =
      applied.state
  }

  if (
    !firstPelotonDiagnostic ||
    !firstDroppedDiagnostic
  ) {
    throw new Error(
      'TerrainAwareGroupPaceDiagnostic: no pace diagnostics were produced.',
    )
  }

  const finalRow =
    rows[
      rows.length - 1
    ]

  if (!finalRow) {
    throw new Error(
      'TerrainAwareGroupPaceDiagnostic: no movement rows were produced.',
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

  const hash =
    createCanonicalHashedValue({
      gradientPercent,
      influence,
      rows,
      firstPelotonDiagnostic,
      firstDroppedDiagnostic,
      finalGroups: {
        peloton:
          state.groups[
            INITIAL_PELOTON_GROUP_ID
          ],
        dropped:
          state.groups[
            DROPPED_GROUP_ID
          ],
      },
    }).hash

  return {
    gradientPercent,
    influence,
    rows,
    selectedRows:
      selectedRows(
        rows,
      ),

    pelotonFlatCapability:
      firstPelotonDiagnostic
        .averageFlatCapabilityScore,
    pelotonTerrainCapability:
      firstPelotonDiagnostic
        .averageTerrainCapabilityScore,
    pelotonCapabilityRatio:
      firstPelotonDiagnostic
        .rawCapabilityRatio,
    pelotonAdjustmentMultiplier:
      firstPelotonDiagnostic
        .terrainAdjustmentMultiplier,

    droppedFlatCapability:
      firstDroppedDiagnostic
        .averageFlatCapabilityScore,
    droppedTerrainCapability:
      firstDroppedDiagnostic
        .averageTerrainCapabilityScore,
    droppedCapabilityRatio:
      firstDroppedDiagnostic
        .rawCapabilityRatio,
    droppedAdjustmentMultiplier:
      firstDroppedDiagnostic
        .terrainAdjustmentMultiplier,

    finalDistanceGapMetres:
      finalRow
        .distanceGapMetres,
    finalGapSeconds:
      finalRow.gapSeconds,
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
          row.pelotonSpeedKmh >
          row.droppedSpeedKmh,
      ),
    droppedSlowerEveryTick:
      rows.every(
        (row) =>
          row.droppedSpeedKmh <
          row.pelotonSpeedKmh,
      ),
    gapNeverDecreases,
    everyStateValid:
      allValid,
    riderPositionsMatchGroups:
      allPositionsMatch,
    membershipsStable:
      allMembershipsStable,
    bothGroupsActive:
      bothActive,

    hash,
  }
}

function scenarioRecord(
  gradientPercent: number,
  suffix: string,
): Readonly<
  Record<
    Influence,
    ScenarioResult
  >
> {
  return {
    0:
      runScenario(
        gradientPercent,
        0,
        `${suffix}-0`,
      ),
    0.5:
      runScenario(
        gradientPercent,
        0.5,
        `${suffix}-50`,
      ),
    1:
      runScenario(
        gradientPercent,
        1,
        `${suffix}-100`,
      ),
  }
}

function zeroMatchesCurrent(
  gradientPercent: number,
): boolean {
  const stage =
    controlledStage(
      gradientPercent,
      `baseline-${gradientPercent}`,
    )

  const transition =
    transitionedState(
      stage,
    )

  const current =
    calculateMultiGroupMovement(
      transition.state,
    )

  const candidate =
    calculateTerrainAwareMultiGroupMovement(
      transition.state,
      0,
    ).movement

  return (
    createCanonicalHashedValue(
      current,
    ).hash ===
    createCanonicalHashedValue(
      candidate,
    ).hash
  )
}

function buildDiagnostic():
  DiagnosticResult {
  const transition =
    transitionedState(
      controlledStage(
        8,
        'transition',
      ),
    )

  const flatA =
    scenarioRecord(
      0,
      'flat-a',
    )

  const flatB =
    scenarioRecord(
      0,
      'flat-b',
    )

  const climbA =
    scenarioRecord(
      8,
      'climb-a',
    )

  const climbB =
    scenarioRecord(
      8,
      'climb-b',
    )

  const repeatedIdentical =
    INFLUENCES.every(
      (influence) =>
        flatA[influence].hash ===
          flatB[influence].hash &&
        climbA[influence].hash ===
          climbB[influence].hash,
    )

  const zeroInfluenceMatchesCurrentFlat =
    zeroMatchesCurrent(0)

  const zeroInfluenceMatchesCurrentClimb =
    zeroMatchesCurrent(8)

  const baselineGap =
    climbA[0]
      .finalGapSeconds

  const fiftyPercentGapAmplification =
    climbA[0.5]
      .finalGapSeconds /
    baselineGap

  const fullGapAmplification =
    climbA[1]
      .finalGapSeconds /
    baselineGap

  const flatGapEqual =
    flatA[0]
      .finalGapSeconds ===
      flatA[0.5]
        .finalGapSeconds &&
    flatA[0.5]
      .finalGapSeconds ===
      flatA[1]
        .finalGapSeconds

  const climbGapProgressive =
    climbA[0]
      .finalGapSeconds <
      climbA[0.5]
        .finalGapSeconds &&
    climbA[0.5]
      .finalGapSeconds <
      climbA[1]
        .finalGapSeconds

  const allScenarios =
    [
      ...INFLUENCES.map(
        (influence) =>
          flatA[
            influence
          ],
      ),
      ...INFLUENCES.map(
        (influence) =>
          climbA[
            influence
          ],
      ),
    ]

  const checks:
    CheckResult[] = [
      {
        label:
          'Exactly six riders form the dropped group',
        passed:
          transition
            .eligible.length === 6,
      },
      {
        label:
          '0% influence exactly matches current flat movement',
        passed:
          zeroInfluenceMatchesCurrentFlat,
      },
      {
        label:
          '0% influence exactly matches current climbing movement',
        passed:
          zeroInfluenceMatchesCurrentClimb,
      },
      {
        label:
          'Repeated candidate runs are identical',
        passed:
          repeatedIdentical,
      },
      {
        label:
          'Flat movement is unchanged at 0%, 50%, and 100% influence',
        passed:
          flatGapEqual &&
          flatA[0]
            .averagePelotonSpeedKmh ===
            flatA[0.5]
              .averagePelotonSpeedKmh &&
          flatA[0.5]
            .averagePelotonSpeedKmh ===
            flatA[1]
              .averagePelotonSpeedKmh &&
          flatA[0]
            .averageDroppedSpeedKmh ===
            flatA[0.5]
              .averageDroppedSpeedKmh &&
          flatA[0.5]
            .averageDroppedSpeedKmh ===
            flatA[1]
              .averageDroppedSpeedKmh,
      },
      {
        label:
          'Climbing time gap increases progressively with terrain influence',
        passed:
          climbGapProgressive,
      },
      {
        label:
          'Peloton remains faster in every scenario',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .pelotonLeaderEveryTick &&
              scenario
                .droppedSlowerEveryTick,
          ),
      },
      {
        label:
          'Every scenario gap never decreases',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .gapNeverDecreases,
          ),
      },
      {
        label:
          'Every candidate SimulationState validates',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .everyStateValid,
          ),
      },
      {
        label:
          'Rider positions continue matching group positions',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .riderPositionsMatchGroups,
          ),
      },
      {
        label:
          'The 90 + 6 memberships remain stable',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .membershipsStable,
          ),
      },
      {
        label:
          'Both groups remain active',
        passed:
          allScenarios.every(
            (scenario) =>
              scenario
                .bothGroupsActive,
          ),
      },
      {
        label:
          'Dropped riders have a lower 8% capability ratio than the peloton',
        passed:
          climbA[0]
            .droppedCapabilityRatio <
          climbA[0]
            .pelotonCapabilityRatio,
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
        .eligible.length,
    movedRiderNames:
      transition.names,
    flat:
      flatA,
    climb:
      climbA,
    zeroInfluenceMatchesCurrentFlat,
    zeroInfluenceMatchesCurrentClimb,
    repeatedIdentical,
    fiftyPercentGapAmplification,
    fullGapAmplification,
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

function influenceLabel(
  influence: Influence,
): string {
  return `${Math.round(
    influence * 100,
  )}%`
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
  title,
  scenarios,
}: {
  readonly title: string
  readonly scenarios:
    Readonly<
      Record<
        Influence,
        ScenarioResult
      >
    >
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-semibold">
          {title}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950 uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">
                Influence
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
                Final distance gap
              </th>
              <th className="px-3 py-3">
                Final time gap
              </th>
              <th className="px-3 py-3">
                Peloton ratio / modifier
              </th>
              <th className="px-3 py-3">
                Dropped ratio / modifier
              </th>
              <th className="px-3 py-3">
                Hash
              </th>
            </tr>
          </thead>

          <tbody>
            {INFLUENCES.map(
              (influence) => {
                const scenario =
                  scenarios[
                    influence
                  ]

                return (
                  <tr
                    key={influence}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-3 font-semibold">
                      {influenceLabel(
                        influence,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .averagePelotonSpeedKmh,
                      )} km/h
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .averageDroppedSpeedKmh,
                      )} km/h
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .averageSpeedDifferenceKmh,
                      )} km/h
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .finalDistanceGapMetres,
                        1,
                      )} m
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .finalGapSeconds,
                      )} s
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .pelotonCapabilityRatio,
                        4,
                      )}
                      {' / '}
                      {format(
                        scenario
                          .pelotonAdjustmentMultiplier,
                        4,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {format(
                        scenario
                          .droppedCapabilityRatio,
                        4,
                      )}
                      {' / '}
                      {format(
                        scenario
                          .droppedAdjustmentMultiplier,
                        4,
                      )}
                    </td>

                    <td className="px-3 py-3 font-mono">
                      {scenario.hash}
                    </td>
                  </tr>
                )
              },
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function TerrainAwareGroupPaceDiagnostic():
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
            Phase 7B.7 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain-aware group pace failed
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
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Phase 7B.7 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Terrain-aware group pace calibration
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Compares 0%, 50%, and 100% influence from each group’s relative
            terrain capability. Zero influence reproduces the current movement
            engine; flat movement must remain unchanged.
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
              ? 'PASS — terrain capability progressively amplifies climbing separation without changing flat movement'
              : 'FAIL — terrain-aware group pace needs recalibration'}
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Eligible riders
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {value.eligibleRiderCount}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Current 8% gap
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {format(
                value.climb[0]
                  .finalGapSeconds,
              )} s
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              50% 8% gap
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {format(
                value.climb[0.5]
                  .finalGapSeconds,
              )} s
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              100% 8% gap
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {format(
                value.climb[1]
                  .finalGapSeconds,
              )} s
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              50% amplification
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {format(
                value
                  .fiftyPercentGapAmplification,
                3,
              )}×
            </div>
          </article>
        </section>

        <ScenarioTable
          title="Flat control"
          scenarios={
            value.flat
          }
        />

        <ScenarioTable
          title="Constant 8% climb"
          scenarios={
            value.climb
          }
        />

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Amplification
          </h2>

          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                50% influence / current gap
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {format(
                  value
                    .fiftyPercentGapAmplification,
                  3,
                )}×
              </dd>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                100% influence / current gap
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {format(
                  value
                    .fullGapAmplification,
                  3,
                )}×
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm leading-6 text-slate-300">
            These are calibration candidates only. The browser results must be
            reviewed before choosing an influence value.
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

          <h2 className="mt-6 text-xl font-semibold text-slate-100">
            Safety
          </h2>

          <p className="mt-3">
            calculateMultiGroupMovement and simulateMultiGroupTick remain
            unchanged. No production movement, event, replay, or persistence
            behaviour is modified.
          </p>
        </section>
      </div>
    </main>
  )
}
