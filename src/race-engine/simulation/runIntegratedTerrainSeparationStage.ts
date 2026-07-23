/**
 * runIntegratedTerrainSeparationStage.ts
 *
 * Inactive deterministic integration runner for Phase 7B.8B.
 *
 * Orchestration:
 * 1. calculate terrain-aware movement
 * 2. apply movement
 * 3. apply energy
 * 4. evaluate terrain capability, shelter, hold status, and authoritative state pressure
 * 5. either create a dropped group or consolidate into a nearby one
 * 6. detect finish candidates
 * 7. apply partial or final finishes
 *
 * This runner is not imported by simulateMultiGroupTick() or
 * runMultiGroupStage(). Optional transition events are disabled by default.
 * It performs no persistence or external access.
 */

import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  StageResult,
} from '../domain/SimulationOutput'
import {
  applyDroppedGroupTransitionProposal,
  type ApplyDroppedGroupTransitionProposalResult,
} from './applyDroppedGroupTransitionProposal'
import {
  applyDroppedWaveConsolidationProposal,
  type ApplyDroppedWaveConsolidationProposalResult,
} from './applyDroppedWaveConsolidationProposal'
import {
  applyDroppedTransitionRaceEvent,
} from './applyDroppedTransitionRaceEvent'
import {
  applyMultiGroupEnergy,
  type ApplyMultiGroupEnergyResult,
} from './applyMultiGroupEnergy'
import {
  applyMultiGroupFinish,
  type ApplyMultiGroupFinishResult,
} from './applyMultiGroupFinish'
import {
  applyMultiGroupMovement,
  type ApplyMultiGroupMovementResult,
} from './applyMultiGroupMovement'
import {
  calculateDroppedGroupTransitionProposal,
  type DroppedGroupTransitionProposal,
} from './calculateDroppedGroupTransitionProposal'
import {
  calculateDroppedWaveConsolidationProposal,
  type DroppedWaveConsolidationProposal,
} from './calculateDroppedWaveConsolidationProposal'
import {
  createCanonicalHashedValue,
} from './canonicalSerialization'
import {
  calculateGroupShelter,
} from './groupShelter'
import {
  calculateRiderGroupHold,
  type RiderGroupHoldResult,
} from './groupHold'
import {
  calculateRiderSeparationEligibility,
  type RiderSeparationEligibilityResult,
} from './groupSeparationEligibility'
import {
  detectMultiGroupFinishCandidates,
  type MultiGroupFinishCandidateResult,
} from './multiGroupFinishCandidates'
import type {
  MultiGroupMovementProposal,
} from './multiGroupMovement'
import {
  calculateRiderTerrainCapability,
  type RiderTerrainCapabilityResult,
} from './riderTerrainCapability'
import {
  calculateTerrainAwareMultiGroupMovement,
  type TerrainAwareMultiGroupMovementResult,
} from './terrainAwareMultiGroupMovement'
import {
  calculateSteepGradientTerrainSeverity,
  type SteepGradientSeverityModel,
  type SteepGradientTerrainSeverityResult,
} from './steepGradientTerrainSeverity'
import {
  validateSimulationState,
} from '../validation/validateSimulationState'

export interface IntegratedTerrainSeparationOptions {
  readonly terrainCapabilityInfluence?: number
  readonly separationWindowSeconds?: number

  /**
   * Disabled by default so all earlier Phase 7B.8 diagnostics retain their
   * original isolated behaviour unless they explicitly enable consolidation.
   */
  readonly droppedWaveConsolidationEnabled?: boolean
  readonly droppedWaveConsolidationThresholdSeconds?: number
  readonly droppedWaveConsolidationGapDifferenceSeconds?: number

  /**
   * Disabled by default. When enabled, every applied dropped-group creation or
   * consolidation appends exactly one deterministic race event.
   */
  readonly droppedTransitionEventsEnabled?: boolean

  /**
   * Disabled by default. When enabled, the selected candidate affects pressure
   * evaluation.
   */
  readonly steepGradientSeverityEnabled?: boolean
  readonly steepGradientSeverityModel?:
    SteepGradientSeverityModel

  /**
   * Separately disabled by default. When enabled, movement uses the same
   * rider-specific adjusted capability above 8%, without shelter or demand.
   */
  readonly steepGradientMovementSeverityEnabled?: boolean
  readonly steepGradientMovementSeverityModel?:
    SteepGradientSeverityModel

  /**
   * Disabled by default. When enabled, finish times are interpolated inside
   * the crossing tick from movement distance and speed.
   */
  readonly subTickFinishInterpolationEnabled?: boolean

  readonly maximumTickCount?: number
}

export interface IntegratedRiderPressureEvaluation {
  readonly riderId: string
  readonly groupId: string
  readonly gradientPercent: number
  readonly groupSpeedKmh: number
  readonly groupDemandScore: number
  readonly shelterBonus: number
  readonly terrainCapability:
    RiderTerrainCapabilityResult
  readonly steepGradientSeverity:
    SteepGradientTerrainSeverityResult | null
  readonly additionalDemandPoints: number
  readonly effectiveCapabilityScore: number
  readonly hold:
    RiderGroupHoldResult
  readonly eligibility:
    RiderSeparationEligibilityResult
}

export type IntegratedDroppedTransitionKind =
  | 'created'
  | 'consolidated'

export interface IntegratedDroppedTransition {
  readonly transitionKind:
    IntegratedDroppedTransitionKind
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly raceSecond: number
  readonly kilometre: number
  readonly movedRiderIds:
    readonly string[]
  readonly proposal:
    | DroppedGroupTransitionProposal
    | DroppedWaveConsolidationProposal
  readonly application:
    | ApplyDroppedGroupTransitionProposalResult
    | ApplyDroppedWaveConsolidationProposalResult

  /**
   * Present only when droppedTransitionEventsEnabled is true.
   */
  readonly event?: RaceEvent
}

export interface IntegratedTerrainSeparationTickResult {
  readonly previousState:
    SimulationState
  readonly movement:
    TerrainAwareMultiGroupMovementResult
  readonly appliedMovement:
    ApplyMultiGroupMovementResult
  readonly appliedEnergy:
    ApplyMultiGroupEnergyResult
  readonly pressureEvaluations:
    readonly IntegratedRiderPressureEvaluation[]
  /**
   * Compatibility alias of state.separationPressureSecondsByRiderId.
   */
  readonly pressureDurationByRiderId:
    Readonly<Record<string, number>>
  readonly transitions:
    readonly IntegratedDroppedTransition[]
  readonly finishDetection:
    MultiGroupFinishCandidateResult
  readonly appliedFinish:
    ApplyMultiGroupFinishResult | null
  readonly state:
    SimulationState
  readonly finishedRiderIds:
    readonly string[]
  readonly completedThisTick: boolean
}

export interface RunIntegratedTerrainSeparationStageResult {
  readonly initialState:
    SimulationState
  readonly finalState:
    SimulationState
  readonly ticks:
    readonly IntegratedTerrainSeparationTickResult[]
  readonly tickCount: number
  readonly transitions:
    readonly IntegratedDroppedTransition[]
  readonly results:
    readonly StageResult[]
  readonly events:
    readonly RaceEvent[]
  /**
   * Compatibility alias of finalState.separationPressureSecondsByRiderId.
   */
  readonly finalPressureDurationByRiderId:
    Readonly<Record<string, number>>
  readonly deterministicHash: string
  readonly completed: boolean
}

const DEFAULT_TERRAIN_CAPABILITY_INFLUENCE =
  0.5

const DEFAULT_SEPARATION_WINDOW_SECONDS =
  120

const DEFAULT_DROPPED_WAVE_CONSOLIDATION_ENABLED =
  false

const DEFAULT_DROPPED_WAVE_CONSOLIDATION_THRESHOLD_SECONDS =
  5

const DEFAULT_DROPPED_WAVE_CONSOLIDATION_GAP_DIFFERENCE_SECONDS =
  5

const DEFAULT_DROPPED_TRANSITION_EVENTS_ENABLED =
  false

const DEFAULT_STEEP_GRADIENT_SEVERITY_ENABLED =
  false

const DEFAULT_STEEP_GRADIENT_SEVERITY_MODEL:
  SteepGradientSeverityModel =
  'progressive_resilience'

const DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_ENABLED =
  false

const DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_MODEL:
  SteepGradientSeverityModel =
  'progressive_resilience'

const DEFAULT_SUB_TICK_FINISH_INTERPOLATION_ENABLED =
  false

const DEFAULT_MAXIMUM_TICK_COUNT =
  100_000

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `runIntegratedTerrainSeparationStage: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `runIntegratedTerrainSeparationStage: ${fieldName} must be a positive integer.`,
    )
  }
}

function assertSteepGradientSeverityModel(
  value: SteepGradientSeverityModel,
): void {
  if (
    value !== 'current_saturated' &&
    value !== 'shelter_extension' &&
    value !== 'progressive_resilience'
  ) {
    throw new Error(
      'runIntegratedTerrainSeparationStage: steepGradientSeverityModel is invalid.',
    )
  }
}

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    throw new Error(
      'runIntegratedTerrainSeparationStage: cannot average an empty array.',
    )
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function createProposalMap(
  proposals:
    readonly MultiGroupMovementProposal[],
): Readonly<Record<string, MultiGroupMovementProposal>> {
  const map:
    Record<
      string,
      MultiGroupMovementProposal
    > = {}

  for (const proposal of proposals) {
    if (map[proposal.groupId]) {
      throw new Error(
        `runIntegratedTerrainSeparationStage: duplicate movement proposal for ${proposal.groupId}.`,
      )
    }

    map[proposal.groupId] =
      proposal
  }

  return map
}

interface PressureEvaluationResult {
  readonly evaluations:
    readonly IntegratedRiderPressureEvaluation[]
  readonly pressureDurationByRiderId:
    Readonly<Record<string, number>>
  readonly eligibleRiderIdsBySourceGroupId:
    Readonly<Record<string, readonly string[]>>
}

function evaluatePressure(
  state: SimulationState,
  movement:
    TerrainAwareMultiGroupMovementResult,
  previousPressure:
    Readonly<Record<string, number>>,
  separationWindowSeconds: number,
  steepGradientSeverityEnabled: boolean,
  steepGradientSeverityModel:
    SteepGradientSeverityModel,
): PressureEvaluationResult {
  const proposalByGroupId =
    createProposalMap(
      movement.movement
        .proposals,
    )

  const evaluations:
    IntegratedRiderPressureEvaluation[] =
      []

  const nextPressure:
    Record<string, number> =
      Object.fromEntries(
        Object.keys(
          state.riders,
        )
          .slice()
          .sort(
            (left, right) =>
              left.localeCompare(
                right,
              ),
          )
          .map(
            (riderId) => [
              riderId,
              previousPressure[
                riderId
              ] ?? 0,
            ],
          ),
      )

  const evaluatedRiderIds =
    new Set<string>()

  const eligibleByGroup:
    Record<
      string,
      string[]
    > = {}

  const sourceGroups =
    Object.values(
      state.groups,
    )
      .filter(
        (group) =>
          group.active &&
          group.distanceKm <
            state.stageDistanceKm &&
          (
            group.groupType ===
              'peloton' ||
            group.groupType ===
              'breakaway' ||
            group.groupType ===
              'chase'
          ),
      )
      .slice()
      .sort(
        (left, right) =>
          left.groupId.localeCompare(
            right.groupId,
          ),
      )

  for (
    const group of
    sourceGroups
  ) {
    const proposal =
      proposalByGroupId[
        group.groupId
      ]

    if (!proposal) {
      throw new Error(
        `runIntegratedTerrainSeparationStage: missing proposal for pressure source group ${group.groupId}.`,
      )
    }

    const riders =
      group.riderIds
        .map(
          (riderId) => {
            const rider =
              state.riders[
                riderId
              ]

            if (!rider) {
              throw new Error(
                `runIntegratedTerrainSeparationStage: missing rider ${riderId}.`,
              )
            }

            return rider
          },
        )
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

    const steepSeverityByRiderId =
      new Map<
        string,
        SteepGradientTerrainSeverityResult
      >()

    if (
      steepGradientSeverityEnabled
    ) {
      for (
        const rider of
        riders
      ) {
        const severity =
          calculateSteepGradientTerrainSeverity({
            riderId:
              rider.riderId,
            attributes:
              rider.attributes,
            currentEnergy:
              rider.energy,
            groupType:
              group.groupType,
            groupSize:
              riders.length,
            gradientPercent:
              proposal
                .gradientPercent,
            model:
              steepGradientSeverityModel,
          })

        steepSeverityByRiderId.set(
          rider.riderId,
          severity,
        )
      }
    }

    const firstSeverity =
      steepGradientSeverityEnabled
        ? steepSeverityByRiderId
            .values()
            .next()
            .value as
              | SteepGradientTerrainSeverityResult
              | undefined
        : undefined

    const additionalDemandPoints =
      firstSeverity
        ?.additionalDemandPoints ??
      0

    const groupDemandScore =
      Math.min(
        100,
        average(
          capabilities.map(
            (result) =>
              steepSeverityByRiderId
                .get(
                  result.riderId,
                )
                ?.adjustedCapabilityScore ??
              result.capabilityScore,
          ),
        ) +
          additionalDemandPoints,
      )

    for (
      const capability of
      capabilities
    ) {
      evaluatedRiderIds.add(
        capability.riderId,
      )

      const steepGradientSeverity =
        steepSeverityByRiderId.get(
          capability.riderId,
        ) ?? null

      const effectiveCapabilityScore =
        steepGradientSeverity
          ?.effectiveCapabilityScore ??
        Math.min(
          100,
          capability
            .capabilityScore +
            shelter.shelterBonus,
        )

      const appliedShelterBonus =
        steepGradientSeverity
          ?.adjustedShelterBonus ??
        shelter.shelterBonus

      const hold =
        calculateRiderGroupHold({
          riderCapabilityScore:
            effectiveCapabilityScore,
          groupDemandScore,
          groupSpeedKmh:
            Math.max(
              0.000001,
              proposal
                .appliedSpeedKmh,
            ),
        })

      const eligibility =
        calculateRiderSeparationEligibility({
          riderId:
            capability.riderId,
          holdStatus:
            hold.status,
          previousConsecutiveCannotHoldSeconds:
            previousPressure[
              capability.riderId
            ] ?? 0,
          tickSeconds:
            movement.movement
              .tickSeconds,
          eligibilityWindowsSeconds: [
            separationWindowSeconds,
          ],
        })

      nextPressure[
        capability.riderId
      ] =
        eligibility
          .nextConsecutiveCannotHoldSeconds

      evaluations.push({
        riderId:
          capability.riderId,
        groupId:
          group.groupId,
        gradientPercent:
          proposal
            .gradientPercent,
        groupSpeedKmh:
          proposal
            .appliedSpeedKmh,
        groupDemandScore,
        shelterBonus:
          appliedShelterBonus,
        terrainCapability:
          capability,
        steepGradientSeverity,
        additionalDemandPoints,
        effectiveCapabilityScore,
        hold,
        eligibility,
      })

      if (
        eligibility
          .eligibleWindowsSeconds
          .includes(
            separationWindowSeconds,
          )
      ) {
        if (
          !eligibleByGroup[
            group.groupId
          ]
        ) {
          eligibleByGroup[
            group.groupId
          ] = []
        }

        eligibleByGroup[
          group.groupId
        ].push(
          capability.riderId,
        )
      }
    }
  }

  /*
   * Dropped-group riders, finished riders, and riders in groups already at the
   * finish do not retain source-group separation pressure.
   */
  for (
    const riderId of
    Object.keys(
      state.riders,
    )
  ) {
    if (
      !evaluatedRiderIds.has(
        riderId,
      )
    ) {
      nextPressure[riderId] =
        0
    }
  }

  const eligibleRiderIdsBySourceGroupId =
    Object.fromEntries(
      Object.entries(
        eligibleByGroup,
      )
        .sort(
          (
            [left],
            [right],
          ) =>
            left.localeCompare(
              right,
            ),
        )
        .map(
          ([
            groupId,
            riderIds,
          ]) => [
            groupId,
            riderIds
              .slice()
              .sort(
                (left, right) =>
                  left.localeCompare(
                    right,
                  ),
              ),
          ],
        ),
    )

  return {
    evaluations,
    pressureDurationByRiderId:
      nextPressure,
    eligibleRiderIdsBySourceGroupId,
  }
}

function applyEligibleTransitions(
  state: SimulationState,
  eligibleBySourceGroupId:
    Readonly<Record<string, readonly string[]>>,
  pressureDurationByRiderId:
    Readonly<Record<string, number>>,
  droppedWaveConsolidationEnabled: boolean,
  droppedWaveConsolidationThresholdSeconds: number,
  droppedWaveConsolidationGapDifferenceSeconds: number,
  droppedTransitionEventsEnabled: boolean,
): {
  readonly state:
    SimulationState
  readonly transitions:
    readonly IntegratedDroppedTransition[]
  readonly pressureDurationByRiderId:
    Readonly<Record<string, number>>
} {
  let nextState =
    state

  const nextPressure:
    Record<string, number> = {
      ...pressureDurationByRiderId,
    }

  const transitions:
    IntegratedDroppedTransition[] =
      []

  const sourceGroupIds =
    Object.keys(
      eligibleBySourceGroupId,
    )
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )

  for (
    const sourceGroupId of
    sourceGroupIds
  ) {
    const sourceGroup =
      nextState.groups[
        sourceGroupId
      ]

    if (
      !sourceGroup ||
      !sourceGroup.active ||
      sourceGroup.distanceKm >=
        nextState.stageDistanceKm
    ) {
      continue
    }

    const stillEligibleRiderIds =
      (
        eligibleBySourceGroupId[
          sourceGroupId
        ] ?? []
      )
        .filter(
          (riderId) =>
            nextState.riders[
              riderId
            ]?.stageStatus ===
              'racing' &&
            nextState.riders[
              riderId
            ]?.currentGroupId ===
              sourceGroupId,
        )
        .slice()
        .sort(
          (left, right) =>
            left.localeCompare(
              right,
            ),
        )

    if (
      stillEligibleRiderIds.length ===
      0
    ) {
      continue
    }

    if (
      droppedWaveConsolidationEnabled
    ) {
      const consolidationProposal =
        calculateDroppedWaveConsolidationProposal({
          state:
            nextState,
          sourceGroupId,
          eligibleRiderIds:
            stillEligibleRiderIds,
          maximumTimeBetweenSeconds:
            droppedWaveConsolidationThresholdSeconds,
          maximumGapDifferenceSeconds:
            droppedWaveConsolidationGapDifferenceSeconds,
        })

      if (
        consolidationProposal
      ) {
        const consolidationApplication =
          applyDroppedWaveConsolidationProposal({
            state:
              nextState,
            proposal:
              consolidationProposal,
          })

        const transitionEventApplication =
          droppedTransitionEventsEnabled
            ? applyDroppedTransitionRaceEvent({
                state:
                  consolidationApplication
                    .state,
                transitionKind:
                  'consolidated',
                proposal:
                  consolidationProposal,
                application:
                  consolidationApplication,
              })
            : null

        nextState =
          transitionEventApplication
            ?.state ??
          consolidationApplication
            .state

        for (
          const riderId of
          consolidationApplication
            .movedRiderIds
        ) {
          nextPressure[riderId] =
            0
        }

        transitions.push({
          transitionKind:
            'consolidated',
          sourceGroupId:
            consolidationProposal
              .sourceGroupId,
          targetGroupId:
            consolidationProposal
              .targetGroupId,
          raceSecond:
            nextState.raceSecond,
          kilometre:
            consolidationProposal
              .createdAtKm,
          movedRiderIds:
            consolidationProposal
              .movedRiderIds,
          proposal:
            consolidationProposal,
          application:
            consolidationApplication,
          ...(
            transitionEventApplication
              ? {
                  event:
                    transitionEventApplication
                      .event,
                }
              : {}
          ),
        })

        continue
      }
    }

    const creationProposal =
      calculateDroppedGroupTransitionProposal({
        state:
          nextState,
        sourceGroupId,
        eligibleRiderIds:
          stillEligibleRiderIds,
      })

    if (!creationProposal) {
      continue
    }

    const creationApplication =
      applyDroppedGroupTransitionProposal({
        state:
          nextState,
        proposal:
          creationProposal,
      })

    const transitionEventApplication =
      droppedTransitionEventsEnabled
        ? applyDroppedTransitionRaceEvent({
            state:
              creationApplication
                .state,
            transitionKind:
              'created',
            proposal:
              creationProposal,
            application:
              creationApplication,
          })
        : null

    nextState =
      transitionEventApplication
        ?.state ??
      creationApplication.state

    for (
      const riderId of
      creationApplication
        .movedRiderIds
    ) {
      nextPressure[riderId] =
        0
    }

    transitions.push({
      transitionKind:
        'created',
      sourceGroupId:
        creationProposal
          .sourceGroupId,
      targetGroupId:
        creationProposal
          .targetGroupId,
      raceSecond:
        nextState.raceSecond,
      kilometre:
        creationProposal
          .createdAtKm,
      movedRiderIds:
        creationProposal
          .movedRiderIds,
      proposal:
        creationProposal,
      application:
        creationApplication,
      ...(
        transitionEventApplication
          ? {
              event:
                transitionEventApplication
                  .event,
            }
          : {}
      ),
    })
  }

  return {
    state:
      nextState,
    transitions,
    pressureDurationByRiderId:
      nextPressure,
  }
}


function resetTerminalPressure(
  state: SimulationState,
  pressure:
    Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.keys(
      state.riders,
    )
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )
      .map(
        (riderId) => [
          riderId,
          state.riders[
            riderId
          ]?.stageStatus ===
            'racing'
            ? pressure[
                riderId
              ] ?? 0
            : 0,
        ],
      ),
  )
}

/**
 * Runs one inactive integrated terrain/separation tick.
 */
export function simulateIntegratedTerrainSeparationTick(
  state: SimulationState,
  options:
    IntegratedTerrainSeparationOptions = {},
): IntegratedTerrainSeparationTickResult {
  if (state.completed) {
    throw new Error(
      'simulateIntegratedTerrainSeparationTick: cannot advance a completed simulation.',
    )
  }

  const terrainCapabilityInfluence =
    options
      .terrainCapabilityInfluence ??
    DEFAULT_TERRAIN_CAPABILITY_INFLUENCE

  const separationWindowSeconds =
    options
      .separationWindowSeconds ??
    DEFAULT_SEPARATION_WINDOW_SECONDS

  const droppedWaveConsolidationEnabled =
    options
      .droppedWaveConsolidationEnabled ??
    DEFAULT_DROPPED_WAVE_CONSOLIDATION_ENABLED

  const droppedWaveConsolidationThresholdSeconds =
    options
      .droppedWaveConsolidationThresholdSeconds ??
    DEFAULT_DROPPED_WAVE_CONSOLIDATION_THRESHOLD_SECONDS

  const droppedWaveConsolidationGapDifferenceSeconds =
    options
      .droppedWaveConsolidationGapDifferenceSeconds ??
    DEFAULT_DROPPED_WAVE_CONSOLIDATION_GAP_DIFFERENCE_SECONDS

  const droppedTransitionEventsEnabled =
    options
      .droppedTransitionEventsEnabled ??
    DEFAULT_DROPPED_TRANSITION_EVENTS_ENABLED

  const steepGradientSeverityEnabled =
    options
      .steepGradientSeverityEnabled ??
    DEFAULT_STEEP_GRADIENT_SEVERITY_ENABLED

  const steepGradientSeverityModel =
    options
      .steepGradientSeverityModel ??
    DEFAULT_STEEP_GRADIENT_SEVERITY_MODEL

  const steepGradientMovementSeverityEnabled =
    options
      .steepGradientMovementSeverityEnabled ??
    DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_ENABLED

  const steepGradientMovementSeverityModel =
    options
      .steepGradientMovementSeverityModel ??
    DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_MODEL

  const subTickFinishInterpolationEnabled =
    options
      .subTickFinishInterpolationEnabled ??
    DEFAULT_SUB_TICK_FINISH_INTERPOLATION_ENABLED

  assertFiniteRange(
    terrainCapabilityInfluence,
    0,
    1,
    'terrainCapabilityInfluence',
  )

  assertPositiveInteger(
    separationWindowSeconds,
    'separationWindowSeconds',
  )

  assertFiniteRange(
    droppedWaveConsolidationThresholdSeconds,
    0,
    3600,
    'droppedWaveConsolidationThresholdSeconds',
  )

  assertFiniteRange(
    droppedWaveConsolidationGapDifferenceSeconds,
    0,
    3600,
    'droppedWaveConsolidationGapDifferenceSeconds',
  )

  assertSteepGradientSeverityModel(
    steepGradientSeverityModel,
  )

  assertSteepGradientSeverityModel(
    steepGradientMovementSeverityModel,
  )

  const movement =
    calculateTerrainAwareMultiGroupMovement(
      state,
      terrainCapabilityInfluence,
      {
        steepGradientSeverityEnabled:
          steepGradientMovementSeverityEnabled,
        steepGradientSeverityModel:
          steepGradientMovementSeverityModel,
      },
    )

  const appliedMovement =
    applyMultiGroupMovement({
      state,
      movement:
        movement.movement,
    })

  const appliedEnergy =
    applyMultiGroupEnergy({
      state:
        appliedMovement.state,
      movement:
        movement.movement,
    })

  const pressure =
    evaluatePressure(
      appliedEnergy.state,
      movement,
      appliedEnergy.state
        .separationPressureSecondsByRiderId,
      separationWindowSeconds,
      steepGradientSeverityEnabled,
      steepGradientSeverityModel,
    )

  const transitionApplication =
    applyEligibleTransitions(
      appliedEnergy.state,
      pressure
        .eligibleRiderIdsBySourceGroupId,
      pressure
        .pressureDurationByRiderId,
      droppedWaveConsolidationEnabled,
      droppedWaveConsolidationThresholdSeconds,
      droppedWaveConsolidationGapDifferenceSeconds,
      droppedTransitionEventsEnabled,
    )

  const finishDetection =
    detectMultiGroupFinishCandidates(
      transitionApplication.state,
      {
        movement:
          movement.movement,
        subTickInterpolationEnabled:
          subTickFinishInterpolationEnabled,
      },
    )

  const appliedFinish =
    finishDetection.candidates
      .length > 0
      ? applyMultiGroupFinish({
          state:
            transitionApplication.state,
          detection:
            finishDetection,
        })
      : null

  const nextStateBeforePressure =
    appliedFinish
      ? appliedFinish.state
      : transitionApplication.state

  const finalPressure =
    resetTerminalPressure(
      nextStateBeforePressure,
      transitionApplication
        .pressureDurationByRiderId,
    )

  const nextState:
    SimulationState = {
      ...nextStateBeforePressure,
      separationPressureSecondsByRiderId:
        finalPressure,
    }

  validateSimulationState(
    nextState,
  )

  return {
    previousState:
      state,
    movement,
    appliedMovement,
    appliedEnergy,
    pressureEvaluations:
      pressure.evaluations,
    pressureDurationByRiderId:
      finalPressure,
    transitions:
      transitionApplication
        .transitions,
    finishDetection,
    appliedFinish,
    state:
      nextState,
    finishedRiderIds:
      appliedFinish
        ? appliedFinish
            .newlyFinishedRiderIds
            .slice()
        : [],
    completedThisTick:
      appliedFinish
        ?.completedThisApplication ??
      false,
  }
}

/**
 * Runs the inactive integrated pipeline until completion.
 */
export function runIntegratedTerrainSeparationStage(
  initialState: SimulationState,
  options:
    IntegratedTerrainSeparationOptions = {},
): RunIntegratedTerrainSeparationStageResult {
  if (initialState.completed) {
    throw new Error(
      'runIntegratedTerrainSeparationStage: initial state is already completed.',
    )
  }

  validateSimulationState(
    initialState,
  )

  const maximumTickCount =
    options.maximumTickCount ??
    DEFAULT_MAXIMUM_TICK_COUNT

  assertPositiveInteger(
    maximumTickCount,
    'maximumTickCount',
  )

  const ticks:
    IntegratedTerrainSeparationTickResult[] =
      []

  const transitions:
    IntegratedDroppedTransition[] =
      []

  const results:
    StageResult[] = []

  let state =
    initialState

  while (!state.completed) {
    if (
      ticks.length >=
      maximumTickCount
    ) {
      throw new Error(
        `runIntegratedTerrainSeparationStage: exceeded maximumTickCount (${maximumTickCount}).`,
      )
    }

    const tick =
      simulateIntegratedTerrainSeparationTick(
        state,
        options,
      )

    ticks.push(
      tick,
    )

    transitions.push(
      ...tick.transitions,
    )

    if (tick.appliedFinish) {
      results.push(
        ...tick.appliedFinish
          .newResults,
      )
    }

    state =
      tick.state
  }

  const orderedResults =
    results
      .slice()
      .sort(
        (left, right) =>
          left.rank -
          right.rank,
      )

  const droppedWaveConsolidationEnabledForHash =
    options
      .droppedWaveConsolidationEnabled ??
    DEFAULT_DROPPED_WAVE_CONSOLIDATION_ENABLED

  const droppedTransitionEventsEnabledForHash =
    options
      .droppedTransitionEventsEnabled ??
    DEFAULT_DROPPED_TRANSITION_EVENTS_ENABLED

  const steepGradientSeverityEnabledForHash =
    options
      .steepGradientSeverityEnabled ??
    DEFAULT_STEEP_GRADIENT_SEVERITY_ENABLED

  const steepGradientMovementSeverityEnabledForHash =
    options
      .steepGradientMovementSeverityEnabled ??
    DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_ENABLED

  const subTickFinishInterpolationEnabledForHash =
    options
      .subTickFinishInterpolationEnabled ??
    DEFAULT_SUB_TICK_FINISH_INTERPOLATION_ENABLED

  const compactTicks =
    ticks.map(
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
                riderCount:
                  group.riderIds.length,
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
        maximumPressureSeconds:
          Math.max(
            0,
            ...Object.values(
              tick
                .pressureDurationByRiderId,
            ),
          ),
        cannotHoldCount:
          tick.pressureEvaluations
            .filter(
              (evaluation) =>
                evaluation.hold.status ===
                'cannot_hold',
            )
            .length,
        transitions:
          tick.transitions.map(
            (transition) => ({
              ...(
                droppedWaveConsolidationEnabledForHash
                  ? {
                      transitionKind:
                        transition
                          .transitionKind,
                    }
                  : {}
              ),
              sourceGroupId:
                transition
                  .sourceGroupId,
              targetGroupId:
                transition
                  .targetGroupId,
              movedRiderIds:
                transition
                  .movedRiderIds,
              raceSecond:
                transition
                  .raceSecond,
              kilometre:
                transition
                  .kilometre,
            }),
          ),
        finishedRiderIds:
          tick.finishedRiderIds,
        completed:
          tick.state.completed,
      }),
    )

  const deterministicHash =
    createCanonicalHashedValue({
      raceId:
        state.raceId,
      stageId:
        state.stageId,
      seed:
        state.seed,
      options: {
        terrainCapabilityInfluence:
          options
            .terrainCapabilityInfluence ??
          DEFAULT_TERRAIN_CAPABILITY_INFLUENCE,
        separationWindowSeconds:
          options
            .separationWindowSeconds ??
          DEFAULT_SEPARATION_WINDOW_SECONDS,
        ...(
          droppedWaveConsolidationEnabledForHash
            ? {
                droppedWaveConsolidationEnabled:
                  true,
                droppedWaveConsolidationThresholdSeconds:
                  options
                    .droppedWaveConsolidationThresholdSeconds ??
                  DEFAULT_DROPPED_WAVE_CONSOLIDATION_THRESHOLD_SECONDS,
                droppedWaveConsolidationGapDifferenceSeconds:
                  options
                    .droppedWaveConsolidationGapDifferenceSeconds ??
                  DEFAULT_DROPPED_WAVE_CONSOLIDATION_GAP_DIFFERENCE_SECONDS,
              }
            : {}
        ),
        ...(
          droppedTransitionEventsEnabledForHash
            ? {
                droppedTransitionEventsEnabled:
                  true,
              }
            : {}
        ),
        ...(
          steepGradientSeverityEnabledForHash
            ? {
                steepGradientSeverityEnabled:
                  true,
                steepGradientSeverityModel:
                  options
                    .steepGradientSeverityModel ??
                  DEFAULT_STEEP_GRADIENT_SEVERITY_MODEL,
              }
            : {}
        ),
        ...(
          steepGradientMovementSeverityEnabledForHash
            ? {
                steepGradientMovementSeverityEnabled:
                  true,
                steepGradientMovementSeverityModel:
                  options
                    .steepGradientMovementSeverityModel ??
                  DEFAULT_STEEP_GRADIENT_MOVEMENT_SEVERITY_MODEL,
              }
            : {}
        ),
        ...(
          subTickFinishInterpolationEnabledForHash
            ? {
                subTickFinishInterpolationEnabled:
                  true,
              }
            : {}
        ),
      },
      compactTicks,
      transitions:
        transitions.map(
          (transition) => ({
            ...(
              droppedWaveConsolidationEnabledForHash
                ? {
                    transitionKind:
                      transition
                        .transitionKind,
                  }
                : {}
            ),
            sourceGroupId:
              transition
                .sourceGroupId,
            targetGroupId:
              transition
                .targetGroupId,
            raceSecond:
              transition
                .raceSecond,
            kilometre:
              transition
                .kilometre,
            movedRiderIds:
              transition
                .movedRiderIds,
          }),
        ),
      results:
        orderedResults,
      events:
        state.events,
      finalState:
        state,
      finalPressure:
        state
          .separationPressureSecondsByRiderId,
    }).hash

  return {
    initialState,
    finalState:
      state,
    ticks,
    tickCount:
      ticks.length,
    transitions,
    results:
      orderedResults,
    events:
      state.events
        .slice(),
    finalPressureDurationByRiderId:
      state
        .separationPressureSecondsByRiderId,
    deterministicHash,
    completed:
      state.completed,
  }
}
