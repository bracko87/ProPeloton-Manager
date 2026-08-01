/**
 * breakawayOutcomeCheckpointSequence.ts
 *
 * Resolves the deterministic B1.9 breakaway outcome after the B1.8 chase.
 *
 * Purpose:
 * - continue from the final late-stage chase checkpoint;
 * - support one explicit catch configuration and one explicit survival configuration;
 * - create an exact catch checkpoint when the peloton closes the physical gap;
 * - merge all riders into one peloton after a catch;
 * - create a leader-finish checkpoint when the breakaway survives;
 * - preserve deterministic movement, energy and rider membership;
 * - leave final ranks and official result rows to B1.10.
 */

import { Checkpoint, GroupSnapshot, RiderSnapshot } from '../types/checkpoint'
import { RiderInput } from '../types/rider'
import { StageInput } from '../types/stage'
import { calculateGroupCooperationAdvantage } from './groupCooperationAdvantage'
import { calculateRiderEnergyStep } from './riderEnergy'
import {
  MAXIMUM_GROUP_SPEED_KMH,
  MINIMUM_GROUP_SPEED_KMH,
} from './separateGroupMovementCheckpointSequence'

const DISTANCE_PRECISION = 1_000_000
const GAP_PRECISION = 1_000
const SPEED_PRECISION = 1_000
const TIME_PRECISION = 1_000
const ENERGY_PRECISION = 1_000

export type BreakawayOutcome = 'caught' | 'survived'

export interface BreakawayOutcomeCheckpointSequenceOptions {
  expectedOutcome: BreakawayOutcome
  breakawayGroupId: string
  pelotonGroupId: string
  pelotonClosingSpeedBonusKmh: number
  chaseEnergyCost: number
  cooperationLevelByGroupId: Readonly<Record<string, number>>
  mergedGroupCooperationLevel: number
}

export interface BreakawayOutcomeCheckpointSequenceResult {
  outcome: BreakawayOutcome
  outcomeCheckpointIndex: number
  finishCheckpointIndex: number
  checkpoints: Checkpoint[]
}

function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

function roundGapSeconds(value: number): number {
  return Math.round(value * GAP_PRECISION) / GAP_PRECISION
}

function roundSpeedKmh(value: number): number {
  return Math.round(value * SPEED_PRECISION) / SPEED_PRECISION
}

function roundRaceSecond(value: number): number {
  return Math.round(value * TIME_PRECISION) / TIME_PRECISION
}

function roundEnergy(value: number): number {
  return Math.round(value * ENERGY_PRECISION) / ENERGY_PRECISION
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    groups: checkpoint.groups.map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
    })),
    riderSnapshots: checkpoint.riderSnapshots.map((riderSnapshot) => ({
      ...riderSnapshot,
    })),
  }
}

function getGroup(checkpoint: Checkpoint, groupId: string): GroupSnapshot {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) {
    throw new Error(`Required B1.9 group was not found: ${groupId}`)
  }

  return group
}

function getCooperationLevel(
  options: BreakawayOutcomeCheckpointSequenceOptions,
  groupId: string,
): number {
  const cooperationLevel = options.cooperationLevelByGroupId[groupId]

  if (cooperationLevel === undefined) {
    throw new Error(`Missing B1.9 cooperation level for group: ${groupId}`)
  }

  return cooperationLevel
}

function calculateGapSecondsToLeader(
  leaderDistanceKm: number,
  trailingGroup: GroupSnapshot,
): number {
  const distanceGapKm = Math.max(0, leaderDistanceKm - trailingGroup.distanceKm)

  if (distanceGapKm === 0) return 0

  return roundGapSeconds((distanceGapKm / trailingGroup.speedKmh) * 3600)
}

function validateRiders(riders: readonly RiderInput[]): void {
  if (riders.length === 0) {
    throw new Error('B1.9 requires riders')
  }

  const riderIds = new Set<string>()

  for (const rider of riders) {
    if (!rider.riderId.trim()) {
      throw new Error('Every B1.9 rider requires a riderId')
    }

    if (riderIds.has(rider.riderId)) {
      throw new Error(`Duplicate B1.9 rider: ${rider.riderId}`)
    }

    if (
      !Number.isFinite(rider.endurance) ||
      rider.endurance < 0 ||
      rider.endurance > 100
    ) {
      throw new Error(`Invalid B1.9 endurance: ${rider.riderId}`)
    }

    if (
      !Number.isFinite(rider.startingFreshness) ||
      rider.startingFreshness < 0 ||
      rider.startingFreshness > 100
    ) {
      throw new Error(`Invalid B1.9 freshness: ${rider.riderId}`)
    }

    riderIds.add(rider.riderId)
  }
}

function validateCooperationLevel(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${fieldName} must be between zero and one`)
  }
}

type ValidatedOutcomeInputs = {
  sourceCheckpoint: Checkpoint
  sourceBreakaway: GroupSnapshot
  sourcePeloton: GroupSnapshot
  pelotonContinuationSpeedKmh: number
  breakawayFinishSeconds: number
  catchSeconds: number
  physicalOutcome: BreakawayOutcome
}

function validateInputs(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: BreakawayOutcomeCheckpointSequenceOptions,
): ValidatedOutcomeInputs {
  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('Stage distance must be a positive finite number')
  }

  if (checkpoints.length === 0) {
    throw new Error('B1.9 requires at least one checkpoint')
  }

  validateRiders(riders)

  if (options.expectedOutcome !== 'caught' && options.expectedOutcome !== 'survived') {
    throw new Error('expectedOutcome must be caught or survived')
  }

  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()

  if (!breakawayGroupId || !pelotonGroupId) {
    throw new Error('B1.9 group ids must be non-empty strings')
  }

  if (breakawayGroupId === pelotonGroupId) {
    throw new Error('B1.9 breakaway and peloton group ids must differ')
  }

  if (
    !Number.isFinite(options.pelotonClosingSpeedBonusKmh) ||
    options.pelotonClosingSpeedBonusKmh < 0
  ) {
    throw new Error('pelotonClosingSpeedBonusKmh must be non-negative')
  }

  if (!Number.isFinite(options.chaseEnergyCost) || options.chaseEnergyCost < 0) {
    throw new Error('chaseEnergyCost must be non-negative')
  }

  validateCooperationLevel(
    options.mergedGroupCooperationLevel,
    'mergedGroupCooperationLevel',
  )
  validateCooperationLevel(
    getCooperationLevel(options, breakawayGroupId),
    `cooperationLevelByGroupId.${breakawayGroupId}`,
  )
  validateCooperationLevel(
    getCooperationLevel(options, pelotonGroupId),
    `cooperationLevelByGroupId.${pelotonGroupId}`,
  )

  const sourceCheckpoint = checkpoints[checkpoints.length - 1]
  const sourceBreakaway = getGroup(sourceCheckpoint, breakawayGroupId)
  const sourcePeloton = getGroup(sourceCheckpoint, pelotonGroupId)

  if (sourceBreakaway.distanceKm <= sourcePeloton.distanceKm) {
    throw new Error('B1.9 requires a breakaway that remains physically ahead')
  }

  if (sourceBreakaway.distanceKm >= stage.distanceKm) {
    throw new Error('B1.9 source breakaway must not already be finished')
  }

  if (sourcePeloton.distanceKm >= stage.distanceKm) {
    throw new Error('B1.9 source peloton must not already be finished')
  }

  if (sourcePeloton.chaseActive !== true) {
    throw new Error('B1.9 requires an active peloton chase')
  }

  const checkpointRiderIds = sourceCheckpoint.riderSnapshots.map(
    (riderSnapshot) => riderSnapshot.riderId,
  )
  const expectedRiderIds = new Set(riders.map((rider) => rider.riderId))

  if (
    checkpointRiderIds.length !== riders.length ||
    checkpointRiderIds.some((riderId) => !expectedRiderIds.has(riderId)) ||
    new Set(checkpointRiderIds).size !== riders.length
  ) {
    throw new Error('B1.9 riders must match the source checkpoint exactly')
  }

  const pelotonContinuationSpeedKmh = roundSpeedKmh(
    sourcePeloton.speedKmh + options.pelotonClosingSpeedBonusKmh,
  )

  if (
    pelotonContinuationSpeedKmh < MINIMUM_GROUP_SPEED_KMH ||
    pelotonContinuationSpeedKmh > MAXIMUM_GROUP_SPEED_KMH
  ) {
    throw new Error(
      `B1.9 peloton speed must remain between ${MINIMUM_GROUP_SPEED_KMH} and ${MAXIMUM_GROUP_SPEED_KMH} km/h`,
    )
  }

  const breakawayFinishSeconds =
    ((stage.distanceKm - sourceBreakaway.distanceKm) / sourceBreakaway.speedKmh) *
    3600
  const relativeSpeedKmh = pelotonContinuationSpeedKmh - sourceBreakaway.speedKmh
  const distanceGapKm = sourceBreakaway.distanceKm - sourcePeloton.distanceKm
  const catchSeconds =
    relativeSpeedKmh > 0
      ? (distanceGapKm / relativeSpeedKmh) * 3600
      : Number.POSITIVE_INFINITY
  const physicalOutcome: BreakawayOutcome =
    catchSeconds < breakawayFinishSeconds ? 'caught' : 'survived'

  if (physicalOutcome !== options.expectedOutcome) {
    throw new Error(
      `Configured B1.9 outcome ${options.expectedOutcome} does not match physical outcome ${physicalOutcome}`,
    )
  }

  return {
    sourceCheckpoint,
    sourceBreakaway,
    sourcePeloton,
    pelotonContinuationSpeedKmh,
    breakawayFinishSeconds,
    catchSeconds,
    physicalOutcome,
  }
}

function calculateOutcomeEnergySnapshot({
  previousSnapshot,
  rider,
  previousGroup,
  movementSpeedKmh,
  outputGroupId,
  outputDistanceKm,
  outputSpeedKmh,
  elapsedSeconds,
  cooperationLevel,
  chaseEnergyCost,
}: {
  previousSnapshot: RiderSnapshot
  rider: RiderInput
  previousGroup: GroupSnapshot
  movementSpeedKmh: number
  outputGroupId: string
  outputDistanceKm: number
  outputSpeedKmh: number
  elapsedSeconds: number
  cooperationLevel: number
  chaseEnergyCost: number
}): RiderSnapshot {
  const energyStep = calculateRiderEnergyStep({
    currentEnergy: previousSnapshot.energy,
    freshness: rider.startingFreshness,
    endurance: rider.endurance,
    speedKmh: movementSpeedKmh,
    elapsedSeconds,
    riderCount: previousGroup.riderIds.length,
    cooperationLevel,
    attackEnergyCost: 0,
  })
  const roundedChaseEnergyCost = roundEnergy(chaseEnergyCost)

  return {
    ...previousSnapshot,
    distanceKm: outputDistanceKm,
    speedKmh: outputSpeedKmh,
    currentGroupId: outputGroupId,
    freshness: energyStep.freshness,
    energy: roundEnergy(
      Math.max(0, energyStep.energyAfter - roundedChaseEnergyCost),
    ),
    movementEnergyCost: energyStep.movementEnergyCost,
    attackEnergyCost: 0,
    shelterEnergySaving: energyStep.shelterEnergySaving,
    chaseEnergyCost: roundedChaseEnergyCost,
    energyCostSincePreviousCheckpoint: roundEnergy(
      energyStep.movementEnergyCost + roundedChaseEnergyCost,
    ),
  }
}

function createCaughtSequence(
  stage: StageInput,
  clonedPrefix: Checkpoint[],
  riders: readonly RiderInput[],
  options: BreakawayOutcomeCheckpointSequenceOptions,
  validation: ValidatedOutcomeInputs,
): BreakawayOutcomeCheckpointSequenceResult {
  const {
    sourceCheckpoint,
    sourceBreakaway,
    sourcePeloton,
    pelotonContinuationSpeedKmh,
    catchSeconds,
  } = validation
  const pelotonGroupId = options.pelotonGroupId.trim()
  const riderById = new Map(riders.map((rider) => [rider.riderId, rider]))
  const previousGroupById = new Map(
    sourceCheckpoint.groups.map((group) => [group.groupId, group]),
  )
  const catchDistanceKm = roundDistanceKm(
    sourceBreakaway.distanceKm + (sourceBreakaway.speedKmh * catchSeconds) / 3600,
  )
  const catchRaceSecond = roundRaceSecond(sourceCheckpoint.raceSecond + catchSeconds)
  const allRiderIds = sourceCheckpoint.riderSnapshots.map(
    (riderSnapshot) => riderSnapshot.riderId,
  )
  const mergedGroupAdvantage = calculateGroupCooperationAdvantage({
    baseSpeedKmh:
      sourcePeloton.baseSpeedBeforeGroupAdvantageKmh ??
      sourcePeloton.baseSpeedBeforeChaseKmh ??
      sourcePeloton.speedKmh,
    riderCount: allRiderIds.length,
    cooperationLevel: options.mergedGroupCooperationLevel,
  })
  const mergedGroupSpeedKmh = mergedGroupAdvantage.effectiveSpeedKmh
  const {
    chaseActive: _discardedChaseActive,
    baseSpeedBeforeChaseKmh: _discardedBaseSpeedBeforeChase,
    chaseSpeedBonusKmh: _discardedChaseSpeedBonus,
    ...pelotonWithoutChase
  } = sourcePeloton
  const mergedGroup: GroupSnapshot = {
    ...pelotonWithoutChase,
    groupId: pelotonGroupId,
    riderIds: [...allRiderIds],
    distanceKm: catchDistanceKm,
    speedKmh: mergedGroupSpeedKmh,
    gapSecondsToLeader: 0,
    active: true,
    baseSpeedBeforeGroupAdvantageKmh: mergedGroupAdvantage.baseSpeedKmh,
    draftingBonusKmh: mergedGroupAdvantage.draftingBonusKmh,
    cooperationBonusKmh: mergedGroupAdvantage.cooperationBonusKmh,
    totalGroupAdvantageKmh: mergedGroupAdvantage.totalBonusKmh,
    cooperationLevel: options.mergedGroupCooperationLevel,
    chaseActive: false,
  }
  const catchRiderSnapshots = sourceCheckpoint.riderSnapshots.map(
    (previousSnapshot) => {
      const rider = riderById.get(previousSnapshot.riderId)
      const previousGroup = previousGroupById.get(previousSnapshot.currentGroupId)

      if (!rider || !previousGroup) {
        throw new Error(`Incomplete B1.9 catch state: ${previousSnapshot.riderId}`)
      }

      const wasPelotonRider = previousGroup.groupId === pelotonGroupId
      const movementSpeedKmh = wasPelotonRider
        ? pelotonContinuationSpeedKmh
        : sourceBreakaway.speedKmh

      return calculateOutcomeEnergySnapshot({
        previousSnapshot,
        rider,
        previousGroup,
        movementSpeedKmh,
        outputGroupId: pelotonGroupId,
        outputDistanceKm: catchDistanceKm,
        outputSpeedKmh: mergedGroupSpeedKmh,
        elapsedSeconds: catchSeconds,
        cooperationLevel: getCooperationLevel(options, previousGroup.groupId),
        chaseEnergyCost: wasPelotonRider ? options.chaseEnergyCost : 0,
      })
    },
  )
  const catchCheckpoint: Checkpoint = {
    checkpointIndex: sourceCheckpoint.checkpointIndex + 1,
    raceSecond: catchRaceSecond,
    currentKm: catchDistanceKm,
    groups: [mergedGroup],
    riderSnapshots: catchRiderSnapshots,
  }
  const finishElapsedSeconds =
    ((stage.distanceKm - catchDistanceKm) / mergedGroupSpeedKmh) * 3600
  const finishRaceSecond = roundRaceSecond(catchRaceSecond + finishElapsedSeconds)
  const catchRiderById = new Map(
    catchRiderSnapshots.map((riderSnapshot) => [riderSnapshot.riderId, riderSnapshot]),
  )
  const finishRiderSnapshots = allRiderIds.map((riderId) => {
    const rider = riderById.get(riderId)
    const previousSnapshot = catchRiderById.get(riderId)

    if (!rider || !previousSnapshot) {
      throw new Error(`Incomplete B1.9 finish state: ${riderId}`)
    }

    return calculateOutcomeEnergySnapshot({
      previousSnapshot,
      rider,
      previousGroup: mergedGroup,
      movementSpeedKmh: mergedGroupSpeedKmh,
      outputGroupId: pelotonGroupId,
      outputDistanceKm: stage.distanceKm,
      outputSpeedKmh: mergedGroupSpeedKmh,
      elapsedSeconds: finishElapsedSeconds,
      cooperationLevel: options.mergedGroupCooperationLevel,
      chaseEnergyCost: 0,
    })
  })
  const finishCheckpoint: Checkpoint = {
    checkpointIndex: catchCheckpoint.checkpointIndex + 1,
    raceSecond: finishRaceSecond,
    currentKm: stage.distanceKm,
    groups: [
      {
        ...mergedGroup,
        riderIds: [...allRiderIds],
        distanceKm: stage.distanceKm,
      },
    ],
    riderSnapshots: finishRiderSnapshots,
  }
  const checkpoints = [...clonedPrefix, catchCheckpoint, finishCheckpoint]

  return {
    outcome: 'caught',
    outcomeCheckpointIndex: catchCheckpoint.checkpointIndex,
    finishCheckpointIndex: finishCheckpoint.checkpointIndex,
    checkpoints,
  }
}

function createSurvivedSequence(
  stage: StageInput,
  clonedPrefix: Checkpoint[],
  riders: readonly RiderInput[],
  options: BreakawayOutcomeCheckpointSequenceOptions,
  validation: ValidatedOutcomeInputs,
): BreakawayOutcomeCheckpointSequenceResult {
  const {
    sourceCheckpoint,
    sourceBreakaway,
    sourcePeloton,
    pelotonContinuationSpeedKmh,
    breakawayFinishSeconds,
  } = validation
  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()
  const riderById = new Map(riders.map((rider) => [rider.riderId, rider]))
  const previousGroupById = new Map(
    sourceCheckpoint.groups.map((group) => [group.groupId, group]),
  )
  const pelotonDistanceKm = roundDistanceKm(
    Math.min(
      stage.distanceKm,
      sourcePeloton.distanceKm +
        (pelotonContinuationSpeedKmh * breakawayFinishSeconds) / 3600,
    ),
  )
  const totalChaseSpeedBonusKmh = roundSpeedKmh(
    pelotonContinuationSpeedKmh -
      (sourcePeloton.baseSpeedBeforeChaseKmh ?? sourcePeloton.speedKmh),
  )
  const breakawayGroup: GroupSnapshot = {
    ...sourceBreakaway,
    riderIds: [...sourceBreakaway.riderIds],
    distanceKm: stage.distanceKm,
    gapSecondsToLeader: 0,
  }
  const pelotonGroupBeforeGap: GroupSnapshot = {
    ...sourcePeloton,
    riderIds: [...sourcePeloton.riderIds],
    distanceKm: pelotonDistanceKm,
    speedKmh: pelotonContinuationSpeedKmh,
    chaseActive: true,
    chaseSpeedBonusKmh: totalChaseSpeedBonusKmh,
  }
  const pelotonGroup: GroupSnapshot = {
    ...pelotonGroupBeforeGap,
    gapSecondsToLeader: calculateGapSecondsToLeader(
      stage.distanceKm,
      pelotonGroupBeforeGap,
    ),
  }
  const groupById = new Map<string, GroupSnapshot>([
    [breakawayGroupId, breakawayGroup],
    [pelotonGroupId, pelotonGroup],
  ])
  const finishRiderSnapshots = sourceCheckpoint.riderSnapshots.map(
    (previousSnapshot) => {
      const rider = riderById.get(previousSnapshot.riderId)
      const previousGroup = previousGroupById.get(previousSnapshot.currentGroupId)
      const outputGroup = groupById.get(previousSnapshot.currentGroupId)

      if (!rider || !previousGroup || !outputGroup) {
        throw new Error(`Incomplete B1.9 survival state: ${previousSnapshot.riderId}`)
      }

      const isPelotonRider = previousGroup.groupId === pelotonGroupId
      const movementSpeedKmh = isPelotonRider
        ? pelotonContinuationSpeedKmh
        : sourceBreakaway.speedKmh

      return calculateOutcomeEnergySnapshot({
        previousSnapshot,
        rider,
        previousGroup,
        movementSpeedKmh,
        outputGroupId: outputGroup.groupId,
        outputDistanceKm: outputGroup.distanceKm,
        outputSpeedKmh: outputGroup.speedKmh,
        elapsedSeconds: breakawayFinishSeconds,
        cooperationLevel: getCooperationLevel(options, previousGroup.groupId),
        chaseEnergyCost: isPelotonRider ? options.chaseEnergyCost : 0,
      })
    },
  )
  const finishCheckpoint: Checkpoint = {
    checkpointIndex: sourceCheckpoint.checkpointIndex + 1,
    raceSecond: roundRaceSecond(
      sourceCheckpoint.raceSecond + breakawayFinishSeconds,
    ),
    currentKm: stage.distanceKm,
    groups: [breakawayGroup, pelotonGroup],
    riderSnapshots: finishRiderSnapshots,
  }
  const checkpoints = [...clonedPrefix, finishCheckpoint]

  return {
    outcome: 'survived',
    outcomeCheckpointIndex: finishCheckpoint.checkpointIndex,
    finishCheckpointIndex: finishCheckpoint.checkpointIndex,
    checkpoints,
  }
}

/**
 * Resolve one deterministic catch or survival scenario after the B1.8 chase.
 */
export function createBreakawayOutcomeCheckpointSequence(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: BreakawayOutcomeCheckpointSequenceOptions,
): BreakawayOutcomeCheckpointSequenceResult {
  const validation = validateInputs(stage, checkpoints, riders, options)
  const clonedPrefix = checkpoints.map(cloneCheckpoint)

  return validation.physicalOutcome === 'caught'
    ? createCaughtSequence(stage, clonedPrefix, riders, options, validation)
    : createSurvivedSequence(stage, clonedPrefix, riders, options, validation)
}
