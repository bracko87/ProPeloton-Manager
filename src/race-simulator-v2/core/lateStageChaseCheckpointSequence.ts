/**
 * lateStageChaseCheckpointSequence.ts
 *
 * Applies the deterministic B1.8 late-stage peloton chase to a B1.7 checkpoint
 * collection.
 *
 * Purpose:
 * - leave every checkpoint before the chase unchanged;
 * - activate the chase only after the configured final-stage threshold;
 * - increase only peloton speed;
 * - charge only peloton riders an additional chase energy cost;
 * - move the groups independently at the next checkpoint so the gap closes;
 * - stop short of catch/merge logic, which belongs to B1.9.
 */

import { Checkpoint, GroupSnapshot, RiderSnapshot } from '../types/checkpoint'
import { RiderInput } from '../types/rider'
import { StageInput } from '../types/stage'
import { calculateRiderEnergyStep } from './riderEnergy'
import { calculateLateStagePelotonChase } from './lateStagePelotonChase'
import {
  MAXIMUM_GROUP_SPEED_KMH,
  MINIMUM_GROUP_SPEED_KMH,
} from './separateGroupMovementCheckpointSequence'

const DISTANCE_PRECISION = 1_000_000
const GAP_PRECISION = 1_000
const ENERGY_PRECISION = 1_000

export interface LateStageChaseCheckpointSequenceOptions {
  breakawayGroupId: string
  pelotonGroupId: string
  chaseStartProgress: number
  pelotonChaseSpeedBonusKmh: number
  chaseEnergyCost: number
  cooperationLevelByGroupId: Readonly<Record<string, number>>
}

function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

function roundGapSeconds(value: number): number {
  return Math.round(value * GAP_PRECISION) / GAP_PRECISION
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
    throw new Error(`Required chase group was not found: ${groupId}`)
  }

  return group
}

function getCooperationLevel(
  options: LateStageChaseCheckpointSequenceOptions,
  groupId: string,
): number {
  const cooperationLevel = options.cooperationLevelByGroupId[groupId]

  if (cooperationLevel === undefined) {
    throw new Error(`Missing chase cooperation level for group: ${groupId}`)
  }

  return cooperationLevel
}

function calculateGapSecondsToLeader(
  leaderDistanceKm: number,
  group: GroupSnapshot,
): number {
  const distanceGapKm = Math.max(0, leaderDistanceKm - group.distanceKm)

  if (distanceGapKm === 0) return 0

  return roundGapSeconds((distanceGapKm / group.speedKmh) * 3600)
}

function validateRiders(riders: readonly RiderInput[]): void {
  if (riders.length === 0) {
    throw new Error('Late-stage chase requires riders')
  }

  const riderIds = new Set<string>()

  for (const rider of riders) {
    if (!rider.riderId.trim()) {
      throw new Error('Every chase rider requires a riderId')
    }

    if (riderIds.has(rider.riderId)) {
      throw new Error(`Duplicate chase rider: ${rider.riderId}`)
    }

    if (!Number.isFinite(rider.endurance) || rider.endurance < 0 || rider.endurance > 100) {
      throw new Error(`Invalid endurance for chase rider: ${rider.riderId}`)
    }

    if (
      !Number.isFinite(rider.startingFreshness) ||
      rider.startingFreshness < 0 ||
      rider.startingFreshness > 100
    ) {
      throw new Error(`Invalid freshness for chase rider: ${rider.riderId}`)
    }

    riderIds.add(rider.riderId)
  }
}

function validateInputs(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: LateStageChaseCheckpointSequenceOptions,
): void {
  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('Stage distance must be a positive finite number')
  }

  if (checkpoints.length < 2) {
    throw new Error('Late-stage chase requires at least two checkpoints')
  }

  validateRiders(riders)

  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()

  if (!breakawayGroupId || !pelotonGroupId) {
    throw new Error('Chase group ids must be non-empty strings')
  }

  if (breakawayGroupId === pelotonGroupId) {
    throw new Error('Breakaway and peloton group ids must differ')
  }

  if (
    !Number.isFinite(options.chaseStartProgress) ||
    options.chaseStartProgress <= 0 ||
    options.chaseStartProgress >= 1
  ) {
    throw new Error('chaseStartProgress must be between zero and one')
  }

  if (
    !Number.isFinite(options.pelotonChaseSpeedBonusKmh) ||
    options.pelotonChaseSpeedBonusKmh <= 0
  ) {
    throw new Error('pelotonChaseSpeedBonusKmh must be a positive finite number')
  }

  if (!Number.isFinite(options.chaseEnergyCost) || options.chaseEnergyCost < 0) {
    throw new Error('chaseEnergyCost must be a non-negative finite number')
  }

  const riderIds = new Set(riders.map((rider) => rider.riderId))
  const checkpointRiderIds = checkpoints[0].riderSnapshots.map(
    (riderSnapshot) => riderSnapshot.riderId,
  )

  if (
    checkpointRiderIds.length !== riders.length ||
    checkpointRiderIds.some((riderId) => !riderIds.has(riderId))
  ) {
    throw new Error('Chase riders must match the checkpoint rider collection')
  }

  let hasEligibleCheckpoint = false

  for (const checkpoint of checkpoints) {
    const breakaway = checkpoint.groups.find(
      (group) => group.groupId === breakawayGroupId,
    )
    const peloton = checkpoint.groups.find((group) => group.groupId === pelotonGroupId)

    if (!breakaway || !peloton) continue

    const decision = calculateLateStagePelotonChase({
      stageDistanceKm: stage.distanceKm,
      currentKm: checkpoint.currentKm,
      breakawayAhead: peloton.gapSecondsToLeader > 0,
      pelotonBaseSpeedKmh: peloton.speedKmh,
      chaseStartProgress: options.chaseStartProgress,
      pelotonChaseSpeedBonusKmh: options.pelotonChaseSpeedBonusKmh,
    })

    if (decision.chaseActive) {
      hasEligibleCheckpoint = true

      if (
        decision.effectiveSpeedKmh < MINIMUM_GROUP_SPEED_KMH ||
        decision.effectiveSpeedKmh > MAXIMUM_GROUP_SPEED_KMH
      ) {
        throw new Error(
          `Chase speed must remain between ${MINIMUM_GROUP_SPEED_KMH} and ${MAXIMUM_GROUP_SPEED_KMH} km/h`,
        )
      }

      break

    }
  }

  if (!hasEligibleCheckpoint) {
    throw new Error('No checkpoint is eligible for the configured late-stage chase')
  }
}

function applyActivationEnergyCost(
  sourceSnapshot: RiderSnapshot,
  chaseEnergyCost: number,
): RiderSnapshot {
  const roundedChaseCost = roundEnergy(chaseEnergyCost)

  return {
    ...sourceSnapshot,
    energy: roundEnergy(Math.max(0, sourceSnapshot.energy - roundedChaseCost)),
    chaseEnergyCost: roundedChaseCost,
    energyCostSincePreviousCheckpoint: roundEnergy(
      sourceSnapshot.energyCostSincePreviousCheckpoint + roundedChaseCost,
    ),
  }
}

/**
 * Create a new checkpoint sequence with deterministic late-stage peloton chase.
 */
export function createLateStageChaseCheckpointSequence(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: LateStageChaseCheckpointSequenceOptions,
): Checkpoint[] {
  validateInputs(stage, checkpoints, riders, options)

  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()
  const riderById = new Map(riders.map((rider) => [rider.riderId, rider]))
  const output: Checkpoint[] = []
  let chaseActivated = false

  for (const sourceCheckpoint of checkpoints) {
    const sourceBreakaway = sourceCheckpoint.groups.find(
      (group) => group.groupId === breakawayGroupId,
    )
    const sourcePeloton = sourceCheckpoint.groups.find(
      (group) => group.groupId === pelotonGroupId,
    )

    if (!sourceBreakaway || !sourcePeloton) {
      output.push(cloneCheckpoint(sourceCheckpoint))
      continue
    }

    if (!chaseActivated) {
      const chaseDecision = calculateLateStagePelotonChase({
        stageDistanceKm: stage.distanceKm,
        currentKm: sourceCheckpoint.currentKm,
        breakawayAhead: sourcePeloton.gapSecondsToLeader > 0,
        pelotonBaseSpeedKmh: sourcePeloton.speedKmh,
        chaseStartProgress: options.chaseStartProgress,
        pelotonChaseSpeedBonusKmh: options.pelotonChaseSpeedBonusKmh,
      })

      if (!chaseDecision.chaseActive) {
        output.push(cloneCheckpoint(sourceCheckpoint))
        continue
      }

      chaseActivated = true

      const groups = sourceCheckpoint.groups
        .map((group) => {
          if (group.groupId !== pelotonGroupId) {
            return {
              ...group,
              riderIds: [...group.riderIds],
            }
          }

          return {
            ...group,
            riderIds: [...group.riderIds],
            speedKmh: chaseDecision.effectiveSpeedKmh,
            chaseActive: true,
            baseSpeedBeforeChaseKmh: chaseDecision.baseSpeedKmh,
            chaseSpeedBonusKmh: chaseDecision.chaseSpeedBonusKmh,
          }
        })
        .sort((left, right) => {
          if (right.distanceKm !== left.distanceKm) {
            return right.distanceKm - left.distanceKm
          }

          return left.groupId.localeCompare(right.groupId)
        })

      const groupById = new Map(groups.map((group) => [group.groupId, group]))
      const riderSnapshots = sourceCheckpoint.riderSnapshots.map((sourceSnapshot) => {
        const group = groupById.get(sourceSnapshot.currentGroupId)

        if (!group) {
          throw new Error(`Missing activation group for rider: ${sourceSnapshot.riderId}`)
        }

        if (group.groupId !== pelotonGroupId) {
          return {
            ...sourceSnapshot,
            speedKmh: group.speedKmh,
            chaseEnergyCost: 0,
          }
        }

        return applyActivationEnergyCost(
          {
            ...sourceSnapshot,
            speedKmh: group.speedKmh,
          },
          options.chaseEnergyCost,
        )
      })

      output.push({
        ...sourceCheckpoint,
        groups,
        riderSnapshots,
      })
      continue
    }

    const previousCheckpoint = output[output.length - 1]
    const elapsedSeconds = sourceCheckpoint.raceSecond - previousCheckpoint.raceSecond

    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      throw new Error('Race time must increase between chase checkpoints')
    }

    const previousBreakaway = getGroup(previousCheckpoint, breakawayGroupId)
    const previousPeloton = getGroup(previousCheckpoint, pelotonGroupId)
    const groupsBeforeGap: GroupSnapshot[] = [previousBreakaway, previousPeloton].map(
      (previousGroup) => ({
        ...previousGroup,
        riderIds: [...previousGroup.riderIds],
        distanceKm: roundDistanceKm(
          Math.min(
            stage.distanceKm,
            previousGroup.distanceKm +
              (previousGroup.speedKmh * elapsedSeconds) / 3600,
          ),
        ),
      }),
    )
    const leaderDistanceKm = Math.max(
      ...groupsBeforeGap.map((group) => group.distanceKm),
    )
    const groups = groupsBeforeGap
      .map((group) => ({
        ...group,
        gapSecondsToLeader: calculateGapSecondsToLeader(leaderDistanceKm, group),
      }))
      .sort((left, right) => {
        if (right.distanceKm !== left.distanceKm) {
          return right.distanceKm - left.distanceKm
        }

        return left.groupId.localeCompare(right.groupId)
      })
    const groupById = new Map(groups.map((group) => [group.groupId, group]))
    const previousRiderById = new Map(
      previousCheckpoint.riderSnapshots.map((riderSnapshot) => [
        riderSnapshot.riderId,
        riderSnapshot,
      ]),
    )

    const riderSnapshots = sourceCheckpoint.riderSnapshots.map((sourceSnapshot) => {
      const rider = riderById.get(sourceSnapshot.riderId)
      const previousSnapshot = previousRiderById.get(sourceSnapshot.riderId)
      const group = groupById.get(sourceSnapshot.currentGroupId)

      if (!rider || !previousSnapshot || !group) {
        throw new Error(`Incomplete chase state for rider: ${sourceSnapshot.riderId}`)
      }

      const energyStep = calculateRiderEnergyStep({
        currentEnergy: previousSnapshot.energy,
        freshness: rider.startingFreshness,
        endurance: rider.endurance,
        speedKmh: group.speedKmh,
        elapsedSeconds,
        riderCount: group.riderIds.length,
        cooperationLevel: getCooperationLevel(options, group.groupId),
        attackEnergyCost: 0,
      })
      const chaseEnergyCost =
        group.groupId === pelotonGroupId ? roundEnergy(options.chaseEnergyCost) : 0

      return {
        ...sourceSnapshot,
        distanceKm: group.distanceKm,
        speedKmh: group.speedKmh,
        freshness: energyStep.freshness,
        energy: roundEnergy(Math.max(0, energyStep.energyAfter - chaseEnergyCost)),
        movementEnergyCost: energyStep.movementEnergyCost,
        attackEnergyCost: 0,
        shelterEnergySaving: energyStep.shelterEnergySaving,
        chaseEnergyCost,
        energyCostSincePreviousCheckpoint: roundEnergy(
          energyStep.movementEnergyCost + chaseEnergyCost,
        ),
      }
    })

    output.push({
      ...sourceCheckpoint,
      currentKm: roundDistanceKm(leaderDistanceKm),
      groups,
      riderSnapshots,
    })
  }

  return output
}
