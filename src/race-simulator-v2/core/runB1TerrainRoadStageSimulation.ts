/**
 * runB1TerrainRoadStageSimulation.ts
 *
 * True additive B1 + B2 road-stage integration.
 *
 * Terrain-disabled mode delegates to the frozen B1 runner byte-for-byte.
 * Terrain-enabled mode executes the accepted B1 behavior during the real stage:
 * - the controlled B1 attack creates the existing breakaway and peloton;
 * - B1 drafting/cooperation determine each group's base speed;
 * - B2 terrain movement advances every existing group through exact boundaries;
 * - physical terrain-adjusted distances determine gaps, chase, catch/survival;
 * - B1 attack/chase costs and live energy remain active;
 * - final results are derived from the integrated physical finish state.
 *
 * Rider terrain attributes, roles and sprint resolution remain outside this
 * integration milestone and are protected by the Phase B2 checklist.
 */

import {
  runB1RoadStageSimulation,
  type B1RoadStageSimulationDefinition,
  type B1RoadStageSimulationResult,
} from './runB1RoadStageSimulation'
import {
  calculateGroupCooperationAdvantage,
} from './groupCooperationAdvantage'
import {
  calculateRiderEnergyStep,
} from './riderEnergy'
import {
  calculateTerrainMovement,
  calculateTerrainSpeedMultiplier,
} from './terrainMovement'
import {
  getTerrainPhaseAtKm,
} from './roadStageProfile'
import {
  createInitialCheckpoint,
} from './initialCheckpoint'
import type {
  BreakawayOutcome,
  BreakawayOutcomeCheckpointSequenceResult,
} from './breakawayOutcomeCheckpointSequence'
import type {
  Checkpoint,
  GroupSnapshot,
  RiderSnapshot,
} from '../types/checkpoint'
import type {
  RiderInput,
} from '../types/rider'
import type {
  StageInput,
} from '../types/stage'
import type {
  RoadStageProfile,
  TerrainPhase,
  TerrainPhaseType,
} from '../types/stageProfile'
import type {
  DeterministicStageResults,
  RiderStageResult,
  StageResultTieBreakAttribute,
} from '../types/stageResult'
import type {
  TerrainMovementResult,
} from '../types/terrainMovement'

const EPSILON = 0.000001
const ROUNDING_FACTOR = 1_000_000
const ENERGY_ROUNDING_FACTOR = 1_000
const DEFAULT_INTERVAL_SECONDS = 600
const MAX_CHECKPOINTS = 500

function round(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR
}

function roundEnergy(value: number): number {
  return Math.round(value * ENERGY_ROUNDING_FACTOR) / ENERGY_ROUNDING_FACTOR
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export interface B1TerrainRoadStageInput {
  readonly stageId: string
  readonly raceId: string
  readonly profile: RoadStageProfile
}

export interface RunB1TerrainRoadStageSimulationOptions {
  readonly outcome: BreakawayOutcome
  readonly terrainEnabled?: boolean
  readonly intervalSeconds?: number
  /**
   * Optional frozen definition used only to build the B1 regression foundation.
   *
   * Real stage inputs may legitimately contain no explicit attack order. The
   * accepted B1 foundation still requires its controlled attack fixture, so the
   * caller can preserve that exact regression result without forcing an attack
   * into the live integrated stage.
   */
  readonly foundationDefinition?: B1RoadStageSimulationDefinition
}

export interface B1TerrainRoadStageSimulationResult {
  readonly foundation: B1RoadStageSimulationResult
  readonly stage: StageInput
  readonly profile: RoadStageProfile
  readonly terrainEnabled: boolean
  readonly checkpoints: readonly Checkpoint[]
  readonly outcomeSequence: BreakawayOutcomeCheckpointSequenceResult
  readonly stageResults: DeterministicStageResults
  /** Unique normalized phase boundaries crossed by at least one live group. */
  readonly phaseBoundaryCrossingCount: number
  readonly requestedOutcome: BreakawayOutcome
  readonly physicalOutcome: BreakawayOutcome
}

type IntegratedGroup = {
  snapshot: GroupSnapshot
  /** Complete B1 speed after drafting/cooperation/chase, before B2 terrain. */
  baseSpeedBeforeTerrainKmh: number
  cooperationLevel: number
  finishTimeSeconds?: number
}

type GroupMovement = {
  group: IntegratedGroup
  movement: TerrainMovementResult
  averageEffectiveSpeedKmh: number
  weightedTerrainEffortMultiplier: number
}

function createTargetStage(input: B1TerrainRoadStageInput): StageInput {
  return {
    stageId: input.stageId,
    raceId: input.raceId,
    distanceKm: input.profile.distanceKm,
    profilePoints: input.profile.profilePoints.map((point) => ({
      km: point.km,
      elevationM: point.elevationM,
    })),
    roadStageProfile: {
      profileId: input.profile.profileId,
      stageType: input.profile.stageType,
      finishType: input.profile.finishType,
      distanceKm: input.profile.distanceKm,
      profilePoints: input.profile.profilePoints.map((point) => ({ ...point })),
    },
  }
}

function cloneGroup(group: GroupSnapshot): GroupSnapshot {
  return {
    ...group,
    riderIds: [...group.riderIds],
  }
}

function cloneRider(snapshot: RiderSnapshot): RiderSnapshot {
  return { ...snapshot }
}

function getCooperationLevel(
  definition: B1RoadStageSimulationDefinition,
  groupId: string,
): number {
  const level = definition.groupCooperation.cooperationLevelByGroupId[groupId]

  if (level === undefined) {
    throw new Error(`Missing B1 cooperation level for integrated group: ${groupId}`)
  }

  return level
}

function terrainEffortMultiplier(
  terrainType: TerrainPhaseType,
  averageGradientPercent: number,
): number {
  if (terrainType === 'climb') {
    return clamp(1.22 + Math.max(0, averageGradientPercent - 4) * 0.045, 1.22, 1.5)
  }

  if (terrainType === 'rolling') {
    return clamp(1.06 + Math.max(0, averageGradientPercent - 1.5) * 0.025, 1.06, 1.16)
  }

  if (terrainType === 'descent') {
    return clamp(0.76 - Math.max(0, Math.abs(averageGradientPercent) - 1.5) * 0.01, 0.64, 0.76)
  }

  return clamp(1 + averageGradientPercent * 0.018, 0.96, 1.04)
}

function calculateWeightedTerrainEffort(
  movement: TerrainMovementResult,
): number {
  if (movement.segments.length === 0 || movement.elapsedDurationSeconds <= 0) {
    return 1
  }

  const weighted = movement.segments.reduce(
    (sum, segment) =>
      sum +
      terrainEffortMultiplier(
        segment.terrainType,
        segment.averageGradientPercent,
      ) *
        segment.durationSeconds,
    0,
  )

  return round(weighted / movement.elapsedDurationSeconds)
}

function collectCrossedBoundaries(
  profile: RoadStageProfile,
  movement: TerrainMovementResult,
  crossedBoundaryKm: Set<number>,
): void {
  for (const segment of movement.segments) {
    if (!segment.reachedPhaseEnd || segment.reachedStageFinish) continue

    const phase = profile.terrainPhases[segment.phaseIndex]
    if (phase) crossedBoundaryKm.add(round(phase.endKm))
  }
}

function moveGroup(
  profile: RoadStageProfile,
  group: IntegratedGroup,
  durationSeconds: number,
): GroupMovement {
  const movement = calculateTerrainMovement({
    profile,
    startKm: group.snapshot.distanceKm,
    durationSeconds,
    baseSpeedKmh: group.baseSpeedBeforeTerrainKmh,
  })
  const averageEffectiveSpeedKmh =
    movement.elapsedDurationSeconds > 0
      ? round((movement.distanceKm / movement.elapsedDurationSeconds) * 3600)
      : round(
          group.baseSpeedBeforeTerrainKmh *
            calculateTerrainSpeedMultiplier(
              getTerrainPhaseAtKm(profile, group.snapshot.distanceKm).terrainType,
              getTerrainPhaseAtKm(profile, group.snapshot.distanceKm)
                .averageGradientPercent,
            ),
        )

  return {
    group,
    movement,
    averageEffectiveSpeedKmh,
    weightedTerrainEffortMultiplier: calculateWeightedTerrainEffort(movement),
  }
}

function calculateDurationToDistance(
  profile: RoadStageProfile,
  startKm: number,
  targetKm: number,
  baseSpeedKmh: number,
): number {
  if (targetKm <= startKm + EPSILON) return 0

  let cursorKm = clamp(startKm, 0, profile.distanceKm)
  const clampedTargetKm = clamp(targetKm, cursorKm, profile.distanceKm)
  let durationSeconds = 0

  while (cursorKm < clampedTargetKm - EPSILON) {
    const phase = getTerrainPhaseAtKm(profile, cursorKm)
    const segmentEndKm = Math.min(clampedTargetKm, phase.endKm)
    const effectiveSpeedKmh =
      baseSpeedKmh *
      calculateTerrainSpeedMultiplier(
        phase.terrainType,
        phase.averageGradientPercent,
      )

    durationSeconds += ((segmentEndKm - cursorKm) / effectiveSpeedKmh) * 3600
    cursorKm = segmentEndKm
  }

  return round(durationSeconds)
}

function calculateGapSeconds(
  profile: RoadStageProfile,
  leaderDistanceKm: number,
  group: IntegratedGroup,
): number {
  if (group.snapshot.distanceKm >= leaderDistanceKm - EPSILON) return 0

  return calculateDurationToDistance(
    profile,
    group.snapshot.distanceKm,
    leaderDistanceKm,
    group.baseSpeedBeforeTerrainKmh,
  )
}

function findCatchSeconds(
  profile: RoadStageProfile,
  breakaway: IntegratedGroup,
  peloton: IntegratedGroup,
  maximumSeconds: number,
): number | null {
  if (peloton.snapshot.distanceKm >= breakaway.snapshot.distanceKm - EPSILON) {
    return 0
  }

  const endBreakaway = moveGroup(profile, breakaway, maximumSeconds).movement.endKm
  const endPeloton = moveGroup(profile, peloton, maximumSeconds).movement.endKm

  if (endPeloton < endBreakaway - EPSILON) return null

  let low = 0
  let high = maximumSeconds

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2
    const breakawayKm = moveGroup(profile, breakaway, middle).movement.endKm
    const pelotonKm = moveGroup(profile, peloton, middle).movement.endKm

    if (pelotonKm >= breakawayKm) high = middle
    else low = middle
  }

  return round(high)
}

function createTerrainGroupSnapshot(
  profile: RoadStageProfile,
  source: IntegratedGroup,
  movement: TerrainMovementResult,
  leaderDistanceKm: number,
): GroupSnapshot {
  const endKm = movement.endKm
  const phase = getTerrainPhaseAtKm(profile, endKm)
  const terrainSpeedMultiplier = calculateTerrainSpeedMultiplier(
    phase.terrainType,
    phase.averageGradientPercent,
  )
  const speedKmh = round(source.baseSpeedBeforeTerrainKmh * terrainSpeedMultiplier)
  const snapshot: GroupSnapshot = {
    ...cloneGroup(source.snapshot),
    distanceKm: endKm,
    speedKmh,
    gapSecondsToLeader: 0,
    baseSpeedBeforeTerrainKmh: round(source.baseSpeedBeforeTerrainKmh),
    terrainSpeedMultiplier,
    terrainType: phase.terrainType,
    averageGradientPercent: phase.averageGradientPercent,
    terrainBoundaryCrossingCount: movement.phaseBoundaryCrossingCount,
    averageTerrainSpeedKmh:
      movement.elapsedDurationSeconds > 0
        ? round((movement.distanceKm / movement.elapsedDurationSeconds) * 3600)
        : speedKmh,
  }

  return {
    ...snapshot,
    gapSecondsToLeader:
      endKm >= leaderDistanceKm - EPSILON
        ? 0
        : calculateDurationToDistance(
            profile,
            endKm,
            leaderDistanceKm,
            source.baseSpeedBeforeTerrainKmh,
          ),
  }
}

function applyEnergyInterval({
  definition,
  previousCheckpoint,
  outputGroups,
  movementByPreviousGroupId,
  elapsedSeconds,
  attackCheckpoint,
  chaseActive,
}: {
  definition: B1RoadStageSimulationDefinition
  previousCheckpoint: Checkpoint
  outputGroups: readonly IntegratedGroup[]
  movementByPreviousGroupId: ReadonlyMap<string, GroupMovement>
  elapsedSeconds: number
  attackCheckpoint: boolean
  chaseActive: boolean
}): RiderSnapshot[] {
  const riderById = new Map(
    definition.riders.map((rider) => [rider.riderId, rider] as const),
  )
  const previousSnapshotById = new Map(
    previousCheckpoint.riderSnapshots.map((snapshot) => [snapshot.riderId, snapshot] as const),
  )
  const outputGroupByRiderId = new Map<string, IntegratedGroup>()

  for (const group of outputGroups) {
    for (const riderId of group.snapshot.riderIds) {
      outputGroupByRiderId.set(riderId, group)
    }
  }

  const attackerIds = new Set(definition.controlledAttack.attackerRiderIds)
  const pelotonGroupId = definition.separateGroupMovement.pelotonGroupId

  return definition.riders.map((rider) => {
    const previousSnapshot = previousSnapshotById.get(rider.riderId)
    const outputGroup = outputGroupByRiderId.get(rider.riderId)

    if (!previousSnapshot || !outputGroup) {
      throw new Error(`Incomplete integrated rider state: ${rider.riderId}`)
    }

    const previousGroupId = previousSnapshot.currentGroupId
    const movement =
      movementByPreviousGroupId.get(previousGroupId) ??
      movementByPreviousGroupId.get(outputGroup.snapshot.groupId)
    const averageSpeedKmh = movement?.averageEffectiveSpeedKmh ?? outputGroup.snapshot.speedKmh
    const effortMultiplier = movement?.weightedTerrainEffortMultiplier ?? 1
    const cooperationLevel = outputGroup.cooperationLevel
    const attackEnergyCost =
      attackCheckpoint && attackerIds.has(rider.riderId)
        ? definition.energyModel.attackEnergyCost ?? 8
        : 0
    const chaseEnergyCost =
      chaseActive && outputGroup.snapshot.groupId === pelotonGroupId
        ? definition.lateStageChase.chaseEnergyCost
        : 0
    const energyStep = calculateRiderEnergyStep({
      currentEnergy: previousSnapshot.energy,
      freshness: rider.startingFreshness,
      endurance: rider.endurance,
      speedKmh: Math.max(averageSpeedKmh, EPSILON),
      elapsedSeconds,
      riderCount: outputGroup.snapshot.riderIds.length,
      cooperationLevel,
      attackEnergyCost: 0,
      resistance: rider.resistance,
    })
    const adjustedMovementCost = roundEnergy(
      energyStep.movementEnergyCost * effortMultiplier,
    )
    const adjustedShelterSaving = roundEnergy(
      energyStep.shelterEnergySaving * effortMultiplier,
    )
    const totalCost = roundEnergy(
      adjustedMovementCost + attackEnergyCost + chaseEnergyCost,
    )

    return {
      riderId: rider.riderId,
      distanceKm: outputGroup.snapshot.distanceKm,
      speedKmh: outputGroup.snapshot.speedKmh,
      currentGroupId: outputGroup.snapshot.groupId,
      freshness: rider.startingFreshness,
      energy: roundEnergy(Math.max(0, previousSnapshot.energy - totalCost)),
      movementEnergyCost: adjustedMovementCost,
      attackEnergyCost: roundEnergy(attackEnergyCost),
      chaseEnergyCost: roundEnergy(chaseEnergyCost),
      shelterEnergySaving: adjustedShelterSaving,
      energyCostSincePreviousCheckpoint: totalCost,
    }
  })
}

function createSplitGroups(
  definition: B1RoadStageSimulationDefinition,
  profile: RoadStageProfile,
  checkpoint: Checkpoint,
): IntegratedGroup[] {
  const peloton = checkpoint.groups[0]
  if (!peloton) throw new Error('Integrated attack requires a peloton group')

  const attackerIds = new Set(definition.controlledAttack.attackerRiderIds)
  const breakawayRiderIds = peloton.riderIds.filter((id) => attackerIds.has(id))
  const pelotonRiderIds = peloton.riderIds.filter((id) => !attackerIds.has(id))

  if (breakawayRiderIds.length === 0 || pelotonRiderIds.length === 0) {
    throw new Error('Integrated attack must create two non-empty groups')
  }

  const definitions = [
    {
      groupId: definition.separateGroupMovement.breakawayGroupId,
      riderIds: breakawayRiderIds,
      speedOffsetKmh: definition.separateGroupMovement.breakawaySpeedOffsetKmh,
    },
    {
      groupId: definition.separateGroupMovement.pelotonGroupId,
      riderIds: pelotonRiderIds,
      speedOffsetKmh: definition.separateGroupMovement.pelotonSpeedOffsetKmh,
    },
  ]

  return definitions.map((groupDefinition) => {
    const cooperationLevel = getCooperationLevel(definition, groupDefinition.groupId)
    const advantage = calculateGroupCooperationAdvantage({
      baseSpeedKmh:
        (peloton.baseSpeedBeforeTerrainKmh ?? peloton.speedKmh) +
        groupDefinition.speedOffsetKmh,
      riderCount: groupDefinition.riderIds.length,
      cooperationLevel,
    })
    const phase = getTerrainPhaseAtKm(profile, checkpoint.currentKm)
    const terrainSpeedMultiplier = calculateTerrainSpeedMultiplier(
      phase.terrainType,
      phase.averageGradientPercent,
    )
    const snapshot: GroupSnapshot = {
      groupId: groupDefinition.groupId,
      riderIds: [...groupDefinition.riderIds],
      distanceKm: checkpoint.currentKm,
      speedKmh: round(advantage.effectiveSpeedKmh * terrainSpeedMultiplier),
      gapSecondsToLeader: 0,
      active: true,
      baseSpeedBeforeGroupAdvantageKmh: advantage.baseSpeedKmh,
      draftingBonusKmh: advantage.draftingBonusKmh,
      cooperationBonusKmh: advantage.cooperationBonusKmh,
      totalGroupAdvantageKmh: advantage.totalBonusKmh,
      cooperationLevel,
      baseSpeedBeforeTerrainKmh: advantage.effectiveSpeedKmh,
      terrainSpeedMultiplier,
      terrainType: phase.terrainType,
      averageGradientPercent: phase.averageGradientPercent,
      terrainBoundaryCrossingCount: 0,
      averageTerrainSpeedKmh: round(advantage.effectiveSpeedKmh * terrainSpeedMultiplier),
    }

    return {
      snapshot,
      baseSpeedBeforeTerrainKmh: advantage.effectiveSpeedKmh,
      cooperationLevel,
    }
  })
}

function activateChase(
  definition: B1RoadStageSimulationDefinition,
  groups: readonly IntegratedGroup[],
  requestedOutcome: BreakawayOutcome,
  chaseIntervalsCompleted: number,
): IntegratedGroup[] {
  const pelotonGroupId = definition.separateGroupMovement.pelotonGroupId
  const scenario =
    requestedOutcome === 'caught'
      ? definition.breakawayCatchScenario
      : definition.breakawaySurvivalScenario

  return groups.map((group) => {
    if (group.snapshot.groupId !== pelotonGroupId) return group

    const extraClosingBonus =
      chaseIntervalsCompleted >= 1 ? scenario.pelotonClosingSpeedBonusKmh : 0
    const totalChaseBonus =
      definition.lateStageChase.pelotonChaseSpeedBonusKmh + extraClosingBonus
    const baseSpeedBeforeChaseKmh =
      group.snapshot.baseSpeedBeforeChaseKmh ?? group.baseSpeedBeforeTerrainKmh
    const baseSpeedBeforeTerrainKmh = round(
      baseSpeedBeforeChaseKmh + totalChaseBonus,
    )

    return {
      ...group,
      baseSpeedBeforeTerrainKmh,
      snapshot: {
        ...cloneGroup(group.snapshot),
        chaseActive: true,
        baseSpeedBeforeChaseKmh,
        chaseSpeedBonusKmh: round(totalChaseBonus),
        baseSpeedBeforeTerrainKmh,
      },
    }
  })
}

function createMergedGroup(
  definition: B1RoadStageSimulationDefinition,
  profile: RoadStageProfile,
  groups: readonly IntegratedGroup[],
  distanceKm: number,
): IntegratedGroup {
  const pelotonGroupId = definition.separateGroupMovement.pelotonGroupId
  const peloton = groups.find((group) => group.snapshot.groupId === pelotonGroupId)
  if (!peloton) throw new Error('Integrated catch requires the peloton')

  const allRiderIds = groups.flatMap((group) => group.snapshot.riderIds)
  const cooperationLevel =
    definition.breakawayCatchScenario.mergedGroupCooperationLevel
  const baseSpeedKmh =
    peloton.snapshot.baseSpeedBeforeGroupAdvantageKmh ??
    peloton.snapshot.baseSpeedBeforeChaseKmh ??
    peloton.baseSpeedBeforeTerrainKmh
  const advantage = calculateGroupCooperationAdvantage({
    baseSpeedKmh,
    riderCount: allRiderIds.length,
    cooperationLevel,
  })
  const phase = getTerrainPhaseAtKm(profile, distanceKm)
  const terrainSpeedMultiplier = calculateTerrainSpeedMultiplier(
    phase.terrainType,
    phase.averageGradientPercent,
  )
  const snapshot: GroupSnapshot = {
    groupId: pelotonGroupId,
    riderIds: [...allRiderIds],
    distanceKm: round(distanceKm),
    speedKmh: round(advantage.effectiveSpeedKmh * terrainSpeedMultiplier),
    gapSecondsToLeader: 0,
    active: true,
    baseSpeedBeforeGroupAdvantageKmh: advantage.baseSpeedKmh,
    draftingBonusKmh: advantage.draftingBonusKmh,
    cooperationBonusKmh: advantage.cooperationBonusKmh,
    totalGroupAdvantageKmh: advantage.totalBonusKmh,
    cooperationLevel,
    chaseActive: false,
    baseSpeedBeforeTerrainKmh: advantage.effectiveSpeedKmh,
    terrainSpeedMultiplier,
    terrainType: phase.terrainType,
    averageGradientPercent: phase.averageGradientPercent,
    terrainBoundaryCrossingCount: 0,
    averageTerrainSpeedKmh: round(advantage.effectiveSpeedKmh * terrainSpeedMultiplier),
  }

  return {
    snapshot,
    baseSpeedBeforeTerrainKmh: advantage.effectiveSpeedKmh,
    cooperationLevel,
  }
}

function compareRiders(
  first: RiderInput,
  second: RiderInput,
  attributes: readonly StageResultTieBreakAttribute[],
): number {
  for (const attribute of attributes) {
    const difference = second[attribute] - first[attribute]
    if (difference !== 0) return difference
  }

  return first.riderId.localeCompare(second.riderId)
}

function createIntegratedStageResults(
  stage: StageInput,
  riders: readonly RiderInput[],
  outcome: BreakawayOutcome,
  finishGroups: readonly IntegratedGroup[],
  tieBreakAttributeOrder: readonly StageResultTieBreakAttribute[],
): DeterministicStageResults {
  const riderById = new Map(riders.map((rider) => [rider.riderId, rider] as const))
  const orderedGroups = [...finishGroups].sort(
    (left, right) =>
      (left.finishTimeSeconds ?? Number.POSITIVE_INFINITY) -
        (right.finishTimeSeconds ?? Number.POSITIVE_INFINITY) ||
      left.snapshot.groupId.localeCompare(right.snapshot.groupId),
  )
  const winnerFinishTimeSeconds = round(
    orderedGroups[0]?.finishTimeSeconds ?? 0,
  )
  const results: RiderStageResult[] = []

  orderedGroups.forEach((group, groupIndex) => {
    const finishTimeSeconds = round(group.finishTimeSeconds ?? 0)
    const groupRiders = group.snapshot.riderIds.map((riderId) => {
      const rider = riderById.get(riderId)
      if (!rider) throw new Error(`Missing integrated result rider: ${riderId}`)
      return rider
    })

    groupRiders.sort((first, second) =>
      compareRiders(first, second, tieBreakAttributeOrder),
    )

    for (const rider of groupRiders) {
      results.push({
        rank: results.length + 1,
        riderId: rider.riderId,
        displayName: rider.displayName,
        status: 'finished',
        finishTimeSeconds,
        gapSecondsToWinner: round(finishTimeSeconds - winnerFinishTimeSeconds),
        finishingGroupId: group.snapshot.groupId,
        finishingGroupRank: groupIndex + 1,
      })
    }
  })

  return {
    stageId: stage.stageId,
    raceId: stage.raceId,
    outcome,
    winnerRiderId: results[0]?.riderId ?? '',
    winnerFinishTimeSeconds,
    results,
  }
}

function createInitialIntegratedGroup(
  definition: B1RoadStageSimulationDefinition,
  profile: RoadStageProfile,
  checkpoint: Checkpoint,
): IntegratedGroup {
  const source = checkpoint.groups[0]
  if (!source) throw new Error('Integrated runner requires an initial group')
  const phase = getTerrainPhaseAtKm(profile, 0)
  const terrainSpeedMultiplier = calculateTerrainSpeedMultiplier(
    phase.terrainType,
    phase.averageGradientPercent,
  )
  const snapshot: GroupSnapshot = {
    ...cloneGroup(source),
    speedKmh: round(source.speedKmh * terrainSpeedMultiplier),
    baseSpeedBeforeTerrainKmh: source.speedKmh,
    terrainSpeedMultiplier,
    terrainType: phase.terrainType,
    averageGradientPercent: phase.averageGradientPercent,
    terrainBoundaryCrossingCount: 0,
    averageTerrainSpeedKmh: round(source.speedKmh * terrainSpeedMultiplier),
  }

  return {
    snapshot,
    baseSpeedBeforeTerrainKmh: source.speedKmh,
    cooperationLevel:
      getCooperationLevel(definition, source.groupId),
  }
}

function createCheckpoint(
  checkpointIndex: number,
  raceSecond: number,
  groups: readonly IntegratedGroup[],
  riderSnapshots: RiderSnapshot[],
): Checkpoint {
  const sortedGroups = [...groups]
    .map((group) => ({ ...group, snapshot: cloneGroup(group.snapshot) }))
    .sort(
      (left, right) =>
        right.snapshot.distanceKm - left.snapshot.distanceKm ||
        left.snapshot.groupId.localeCompare(right.snapshot.groupId),
    )
  const leaderDistanceKm = Math.max(
    ...sortedGroups.map((group) => group.snapshot.distanceKm),
  )

  return {
    checkpointIndex,
    raceSecond: round(raceSecond),
    currentKm: round(leaderDistanceKm),
    groups: sortedGroups.map((group) => cloneGroup(group.snapshot)),
    riderSnapshots: riderSnapshots.map(cloneRider),
  }
}

function runIntegratedTerrainSimulation(
  definition: B1RoadStageSimulationDefinition,
  stage: StageInput,
  profile: RoadStageProfile,
  requestedOutcome: BreakawayOutcome,
  intervalSeconds: number,
): {
  checkpoints: Checkpoint[]
  outcomeSequence: BreakawayOutcomeCheckpointSequenceResult
  stageResults: DeterministicStageResults
  phaseBoundaryCrossingCount: number
  physicalOutcome: BreakawayOutcome
} {
  const initialBaseCheckpoint = createInitialCheckpoint(
    definition.config,
    stage,
    definition.riders,
  )
  const initialGroup = createInitialIntegratedGroup(
    definition,
    profile,
    initialBaseCheckpoint,
  )
  const initialCheckpoint: Checkpoint = {
    ...initialBaseCheckpoint,
    groups: [cloneGroup(initialGroup.snapshot)],
    riderSnapshots: initialBaseCheckpoint.riderSnapshots.map((snapshot) => ({
      ...snapshot,
      speedKmh: initialGroup.snapshot.speedKmh,
    })),
  }
  const checkpoints: Checkpoint[] = [initialCheckpoint]
  const crossedBoundaryKm = new Set<number>()
  let groups: IntegratedGroup[] = [initialGroup]
  let chaseActive = false
  let chaseIntervalsCompleted = 0
  let physicalOutcome: BreakawayOutcome | null = null
  let outcomeCheckpointIndex = -1
  let finishCheckpointIndex = -1
  const finishGroups: IntegratedGroup[] = []

  while (checkpoints.length < MAX_CHECKPOINTS) {
    const previousCheckpoint = checkpoints[checkpoints.length - 1]

    if (groups.every((group) => group.finishTimeSeconds !== undefined)) break

    const nextCheckpointIndex = previousCheckpoint.checkpointIndex + 1
    const attackCheckpoint =
      groups.length === 1 &&
      nextCheckpointIndex === definition.controlledAttack.attackCheckpointIndex

    if (groups.length === 2 && !chaseActive) {
      const breakaway = groups.find(
        (group) =>
          group.snapshot.groupId === definition.separateGroupMovement.breakawayGroupId,
      )
      const peloton = groups.find(
        (group) =>
          group.snapshot.groupId === definition.separateGroupMovement.pelotonGroupId,
      )
      const leaderProgress =
        Math.max(...groups.map((group) => group.snapshot.distanceKm)) /
        stage.distanceKm

      if (
        breakaway &&
        peloton &&
        breakaway.snapshot.distanceKm > peloton.snapshot.distanceKm + EPSILON &&
        leaderProgress >= definition.lateStageChase.chaseStartProgress
      ) {
        chaseActive = true
      }
    }

    if (chaseActive && groups.length === 2) {
      groups = activateChase(
        definition,
        groups,
        requestedOutcome,
        chaseIntervalsCompleted,
      )
    }

    if (attackCheckpoint) {
      const sourceGroup = groups[0]
      const movement = moveGroup(profile, sourceGroup, intervalSeconds)
      collectCrossedBoundaries(profile, movement.movement, crossedBoundaryKm)
      const movedSnapshot = createTerrainGroupSnapshot(
        profile,
        sourceGroup,
        movement.movement,
        movement.movement.endKm,
      )
      const movedGroup: IntegratedGroup = {
        ...sourceGroup,
        snapshot: movedSnapshot,
      }
      const movementMap = new Map([[sourceGroup.snapshot.groupId, movement]])
      const movedCheckpoint = createCheckpoint(
        nextCheckpointIndex,
        previousCheckpoint.raceSecond + movement.movement.elapsedDurationSeconds,
        [movedGroup],
        applyEnergyInterval({
          definition,
          previousCheckpoint,
          outputGroups: [movedGroup],
          movementByPreviousGroupId: movementMap,
          elapsedSeconds: movement.movement.elapsedDurationSeconds,
          attackCheckpoint: false,
          chaseActive: false,
        }),
      )
      const splitGroups = createSplitGroups(definition, profile, movedCheckpoint)
      const splitRiderSnapshots = movedCheckpoint.riderSnapshots.map((snapshot) => {
        const splitGroup = splitGroups.find((group) =>
          group.snapshot.riderIds.includes(snapshot.riderId),
        )
        if (!splitGroup) throw new Error(`Missing integrated split rider: ${snapshot.riderId}`)
        const attackCost = definition.controlledAttack.attackerRiderIds.includes(
          snapshot.riderId,
        )
          ? definition.energyModel.attackEnergyCost ?? 8
          : 0

        return {
          ...snapshot,
          currentGroupId: splitGroup.snapshot.groupId,
          distanceKm: splitGroup.snapshot.distanceKm,
          speedKmh: splitGroup.snapshot.speedKmh,
          attackEnergyCost: roundEnergy(attackCost),
          energy: roundEnergy(Math.max(0, snapshot.energy - attackCost)),
          energyCostSincePreviousCheckpoint: roundEnergy(
            snapshot.energyCostSincePreviousCheckpoint + attackCost,
          ),
        }
      })
      groups = splitGroups
      checkpoints.push(
        createCheckpoint(
          nextCheckpointIndex,
          movedCheckpoint.raceSecond,
          groups,
          splitRiderSnapshots,
        ),
      )
      continue
    }

    const unfinishedGroups = groups.filter(
      (group) => group.finishTimeSeconds === undefined,
    )
    const movementByGroupId = new Map<string, GroupMovement>()

    for (const group of unfinishedGroups) {
      const movement = moveGroup(profile, group, intervalSeconds)
      movementByGroupId.set(group.snapshot.groupId, movement)
      collectCrossedBoundaries(profile, movement.movement, crossedBoundaryKm)
    }

    let eventSeconds = intervalSeconds
    let catchSeconds: number | null = null
    const breakaway = groups.find(
      (group) =>
        group.snapshot.groupId === definition.separateGroupMovement.breakawayGroupId,
    )
    const peloton = groups.find(
      (group) =>
        group.snapshot.groupId === definition.separateGroupMovement.pelotonGroupId,
    )

    if (
      breakaway &&
      peloton &&
      breakaway.finishTimeSeconds === undefined &&
      peloton.finishTimeSeconds === undefined
    ) {
      const startingDistanceDifferenceKm =
        breakaway.snapshot.distanceKm -
        peloton.snapshot.distanceKm

      const breakawayLeads =
        startingDistanceDifferenceKm >
        EPSILON

      const pelotonAlreadyAhead =
        startingDistanceDifferenceKm <
        -EPSILON

      const groupsStartTogether =
        Math.abs(
          startingDistanceDifferenceKm,
        ) <= EPSILON

      if (breakawayLeads) {
        catchSeconds =
          findCatchSeconds(
            profile,
            breakaway,
            peloton,
            intervalSeconds,
          )
      } else if (pelotonAlreadyAhead) {
        catchSeconds = 0
      } else if (groupsStartTogether) {
        const projectedBreakawayKm =
          movementByGroupId.get(
            breakaway.snapshot.groupId,
          )?.movement.endKm ??
          breakaway.snapshot.distanceKm

        const projectedPelotonKm =
          movementByGroupId.get(
            peloton.snapshot.groupId,
          )?.movement.endKm ??
          peloton.snapshot.distanceKm

        const pelotonWouldOvertakeDuringLaunchInterval =
          projectedPelotonKm >
          projectedBreakawayKm +
            EPSILON

        if (
          pelotonWouldOvertakeDuringLaunchInterval
        ) {
          catchSeconds =
            intervalSeconds
        }
      }

      if (catchSeconds !== null) {
        eventSeconds =
          Math.min(
            eventSeconds,
            catchSeconds,
          )
      }
    }

    for (const movement of movementByGroupId.values()) {
      if (movement.movement.stageFinished) {
        eventSeconds = Math.min(eventSeconds, movement.movement.elapsedDurationSeconds)
      }
    }

    const caughtImmediately =
      catchSeconds !== null &&
      catchSeconds <= EPSILON

    if (caughtImmediately) {
      const catchDistanceKm = Math.max(
        ...groups.map(
          (group) =>
            group.snapshot.distanceKm,
        ),
      )

      const mergedGroup =
        createMergedGroup(
          definition,
          profile,
          groups,
          catchDistanceKm,
        )

      const mergedRiderSnapshots =
        previousCheckpoint.riderSnapshots.map(
          (snapshot) => ({
            ...snapshot,
            currentGroupId:
              mergedGroup.snapshot.groupId,
            distanceKm:
              mergedGroup.snapshot.distanceKm,
            speedKmh:
              mergedGroup.snapshot.speedKmh,
          }),
        )

      groups = [mergedGroup]
      physicalOutcome = 'caught'
      outcomeCheckpointIndex =
        nextCheckpointIndex

      checkpoints.push(
        createCheckpoint(
          nextCheckpointIndex,
          previousCheckpoint.raceSecond,
          groups,
          mergedRiderSnapshots,
        ),
      )

      chaseActive = false
      continue
    }

    const exactMovementByGroupId = new Map<string, GroupMovement>()
    for (const group of unfinishedGroups) {
      const movement = moveGroup(profile, group, eventSeconds)
      exactMovementByGroupId.set(group.snapshot.groupId, movement)
      collectCrossedBoundaries(profile, movement.movement, crossedBoundaryKm)
    }

    const movedGroups: IntegratedGroup[] = groups.map((group) => {
      if (group.finishTimeSeconds !== undefined) return group
      const movement = exactMovementByGroupId.get(group.snapshot.groupId)
      if (!movement) throw new Error(`Missing integrated movement: ${group.snapshot.groupId}`)

      return {
        ...group,
        snapshot: createTerrainGroupSnapshot(
          profile,
          group,
          movement.movement,
          0,
        ),
      }
    })
    const leaderDistanceKm = Math.max(
      ...movedGroups.map((group) => group.snapshot.distanceKm),
    )

    for (const group of movedGroups) {
      group.snapshot = {
        ...group.snapshot,
        gapSecondsToLeader: calculateGapSeconds(profile, leaderDistanceKm, group),
      }
    }

    const caughtAtEvent =
      catchSeconds !== null && Math.abs(eventSeconds - catchSeconds) <= 0.001
    const eventRaceSecond = previousCheckpoint.raceSecond + eventSeconds

    if (caughtAtEvent) {
      const preMergeGroups = movedGroups
      const preMergeRiderSnapshots = applyEnergyInterval({
        definition,
        previousCheckpoint,
        outputGroups: preMergeGroups,
        movementByPreviousGroupId: exactMovementByGroupId,
        elapsedSeconds: eventSeconds,
        attackCheckpoint: false,
        chaseActive,
      })
      const catchDistanceKm = Math.max(
        ...preMergeGroups.map((group) => group.snapshot.distanceKm),
      )
      const mergedGroup = createMergedGroup(
        definition,
        profile,
        preMergeGroups,
        catchDistanceKm,
      )
      const mergedRiderSnapshots = preMergeRiderSnapshots.map((snapshot) => ({
        ...snapshot,
        currentGroupId: mergedGroup.snapshot.groupId,
        distanceKm: mergedGroup.snapshot.distanceKm,
        speedKmh: mergedGroup.snapshot.speedKmh,
      }))

      groups = [mergedGroup]
      physicalOutcome = 'caught'
      outcomeCheckpointIndex = nextCheckpointIndex
      checkpoints.push(
        createCheckpoint(
          nextCheckpointIndex,
          eventRaceSecond,
          groups,
          mergedRiderSnapshots,
        ),
      )
      chaseActive = false
      continue
    }

    const outputRiderSnapshots = applyEnergyInterval({
      definition,
      previousCheckpoint,
      outputGroups: movedGroups,
      movementByPreviousGroupId: exactMovementByGroupId,
      elapsedSeconds: eventSeconds,
      attackCheckpoint: false,
      chaseActive,
    })

    groups = movedGroups
    for (const group of groups) {
      if (
        group.finishTimeSeconds === undefined &&
        group.snapshot.distanceKm >= stage.distanceKm - EPSILON
      ) {
        group.finishTimeSeconds = round(eventRaceSecond)
        finishGroups.push(group)
      }
    }

    const leaderFinished = finishGroups.length > 0
    if (leaderFinished && physicalOutcome === null) {
      physicalOutcome = groups.length === 1 ? 'caught' : 'survived'
      outcomeCheckpointIndex = nextCheckpointIndex
    }

    checkpoints.push(
      createCheckpoint(
        nextCheckpointIndex,
        eventRaceSecond,
        groups,
        outputRiderSnapshots,
      ),
    )

    if (leaderFinished) {
      for (const group of groups) {
        if (group.finishTimeSeconds !== undefined) continue
        const remainingSeconds = calculateDurationToDistance(
          profile,
          group.snapshot.distanceKm,
          stage.distanceKm,
          group.baseSpeedBeforeTerrainKmh,
        )
        group.finishTimeSeconds = round(eventRaceSecond + remainingSeconds)
        finishGroups.push(group)
      }
      finishCheckpointIndex = nextCheckpointIndex
      break
    }

    if (chaseActive && groups.length === 2) chaseIntervalsCompleted += 1
  }

  if (checkpoints.length >= MAX_CHECKPOINTS) {
    throw new Error('Integrated B1+B2 runner exceeded its checkpoint safety limit')
  }

  if (!physicalOutcome || finishCheckpointIndex < 0 || finishGroups.length === 0) {
    throw new Error('Integrated B1+B2 runner did not reach a physical finish')
  }

  const outcomeSequence: BreakawayOutcomeCheckpointSequenceResult = {
    outcome: physicalOutcome,
    outcomeCheckpointIndex,
    finishCheckpointIndex,
    checkpoints,
  }
  const stageResults = createIntegratedStageResults(
    stage,
    definition.riders,
    physicalOutcome,
    finishGroups,
    definition.finalResultModel.tieBreakAttributeOrder,
  )

  return {
    checkpoints,
    outcomeSequence,
    stageResults,
    phaseBoundaryCrossingCount: crossedBoundaryKm.size,
    physicalOutcome,
  }
}

/**
 * Run the frozen B1 behavior exactly when terrain is disabled, or execute the
 * same B1 mechanics inside the selected real B2 profile when terrain is active.
 */
export function runB1TerrainRoadStageSimulation(
  definition: B1RoadStageSimulationDefinition,
  input: B1TerrainRoadStageInput,
  options: RunB1TerrainRoadStageSimulationOptions,
): B1TerrainRoadStageSimulationResult {
  const foundation = runB1RoadStageSimulation(
    options.foundationDefinition ?? definition,
    {
      outcome: options.outcome,
    },
  )
  const stage = createTargetStage(input)
  const terrainEnabled = options.terrainEnabled !== false

  if (!terrainEnabled) {
    return {
      foundation,
      stage: foundation.stage,
      profile: input.profile,
      terrainEnabled: false,
      checkpoints: foundation.outcomeSequence.checkpoints,
      outcomeSequence: foundation.outcomeSequence,
      stageResults: foundation.stageResults,
      phaseBoundaryCrossingCount: 0,
      requestedOutcome: options.outcome,
      physicalOutcome: foundation.outcomeSequence.outcome,
    }
  }

  const intervalSeconds = options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error('Integrated checkpoint interval must be positive')
  }

  const integrated = runIntegratedTerrainSimulation(
    definition,
    stage,
    input.profile,
    options.outcome,
    intervalSeconds,
  )

  return {
    foundation,
    stage,
    profile: input.profile,
    terrainEnabled: true,
    checkpoints: integrated.checkpoints,
    outcomeSequence: integrated.outcomeSequence,
    stageResults: integrated.stageResults,
    phaseBoundaryCrossingCount: integrated.phaseBoundaryCrossingCount,
    requestedOutcome: options.outcome,
    physicalOutcome: integrated.physicalOutcome,
  }
}
