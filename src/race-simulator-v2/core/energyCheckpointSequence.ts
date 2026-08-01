/**
 * energyCheckpointSequence.ts
 *
 * Adds deterministic B1.7 live energy to an existing B1.6 checkpoint sequence.
 *
 * Purpose:
 * - initialize energy from each rider's starting freshness;
 * - apply normal movement energy cost between checkpoints;
 * - reduce movement cost through group shelter and cooperation;
 * - apply one extra attack cost to configured attackers at the attack checkpoint;
 * - preserve every existing movement, group and gap value unchanged.
 */

import { Checkpoint, RiderSnapshot } from '../types/checkpoint'
import { RiderInput } from '../types/rider'
import {
  ATTACK_ENERGY_COST,
  calculateRiderEnergyStep,
} from './riderEnergy'

export interface EnergyCheckpointSequenceOptions {
  attackCheckpointIndex: number
  attackerRiderIds: readonly string[]
  cooperationLevelByGroupId: Readonly<Record<string, number>>
  attackEnergyCost?: number
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    groups: checkpoint.groups.map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
    })),
    riderSnapshots: checkpoint.riderSnapshots.map(
      (riderSnapshot) => ({
        ...riderSnapshot,
      }),
    ),
  }
}

function validateRider(rider: RiderInput): void {
  if (!rider.riderId.trim()) {
    throw new Error('Every energy rider requires a riderId')
  }

  if (
    !Number.isFinite(rider.endurance) ||
    rider.endurance < 0 ||
    rider.endurance > 100
  ) {
    throw new Error(
      `Invalid endurance for rider: ${rider.riderId}`,
    )
  }

  if (
    !Number.isFinite(rider.startingFreshness) ||
    rider.startingFreshness < 0 ||
    rider.startingFreshness > 100
  ) {
    throw new Error(
      `Invalid starting freshness for rider: ${rider.riderId}`,
    )
  }
}

function validateInputs(
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: EnergyCheckpointSequenceOptions,
): void {
  if (checkpoints.length < 2) {
    throw new Error(
      'Energy progression requires at least two checkpoints',
    )
  }

  if (!Number.isInteger(options.attackCheckpointIndex)) {
    throw new Error('attackCheckpointIndex must be an integer')
  }

  if (
    !checkpoints.some(
      (checkpoint) =>
        checkpoint.checkpointIndex ===
        options.attackCheckpointIndex,
    )
  ) {
    throw new Error(
      'attackCheckpointIndex was not found in the checkpoint collection',
    )
  }

  if (riders.length === 0) {
    throw new Error('Energy progression requires riders')
  }

  const riderIds = new Set<string>()

  for (const rider of riders) {
    validateRider(rider)

    if (riderIds.has(rider.riderId)) {
      throw new Error(
        `Duplicate energy rider: ${rider.riderId}`,
      )
    }

    riderIds.add(rider.riderId)
  }

  const initialRiderIds = checkpoints[0].riderSnapshots.map(
    (riderSnapshot) => riderSnapshot.riderId,
  )

  if (
    initialRiderIds.length !== riders.length ||
    initialRiderIds.some((riderId) => !riderIds.has(riderId))
  ) {
    throw new Error(
      'Energy riders must match the checkpoint rider collection',
    )
  }

  const attackerIds = new Set(options.attackerRiderIds)

  if (attackerIds.size !== options.attackerRiderIds.length) {
    throw new Error('attackerRiderIds must be unique')
  }

  for (const attackerId of attackerIds) {
    if (!riderIds.has(attackerId)) {
      throw new Error(
        `Unknown energy attacker: ${attackerId}`,
      )
    }
  }

  const attackEnergyCost =
    options.attackEnergyCost ?? ATTACK_ENERGY_COST

  if (
    !Number.isFinite(attackEnergyCost) ||
    attackEnergyCost < 0
  ) {
    throw new Error(
      'attackEnergyCost must be a non-negative finite number',
    )
  }
}

function getCooperationLevel(
  options: EnergyCheckpointSequenceOptions,
  groupId: string,
): number {
  const cooperationLevel =
    options.cooperationLevelByGroupId[groupId]

  if (cooperationLevel === undefined) {
    throw new Error(
      `Missing energy cooperation level for group: ${groupId}`,
    )
  }

  return cooperationLevel
}

function createInitialEnergySnapshot(
  source: RiderSnapshot,
  rider: RiderInput,
): RiderSnapshot {
  return {
    ...source,
    freshness: rider.startingFreshness,
    energy: rider.startingFreshness,
    movementEnergyCost: 0,
    attackEnergyCost: 0,
    shelterEnergySaving: 0,
    energyCostSincePreviousCheckpoint: 0,
  }
}

/**
 * Create a new checkpoint sequence with deterministic live energy.
 */
export function createEnergyCheckpointSequence(
  checkpoints: readonly Checkpoint[],
  riders: readonly RiderInput[],
  options: EnergyCheckpointSequenceOptions,
): Checkpoint[] {
  validateInputs(checkpoints, riders, options)

  const riderById = new Map(
    riders.map((rider) => [rider.riderId, rider]),
  )
  const attackerIds = new Set(options.attackerRiderIds)
  const attackEnergyCost =
    options.attackEnergyCost ?? ATTACK_ENERGY_COST
  const output: Checkpoint[] = []

  for (const sourceCheckpoint of checkpoints) {
    if (output.length === 0) {
      output.push({
        ...cloneCheckpoint(sourceCheckpoint),
        riderSnapshots: sourceCheckpoint.riderSnapshots.map(
          (sourceSnapshot) => {
            const rider = riderById.get(
              sourceSnapshot.riderId,
            )

            if (!rider) {
              throw new Error(
                `Missing energy rider: ${sourceSnapshot.riderId}`,
              )
            }

            return createInitialEnergySnapshot(
              sourceSnapshot,
              rider,
            )
          },
        ),
      })
      continue
    }

    const previousCheckpoint = output[output.length - 1]
    const elapsedSeconds =
      sourceCheckpoint.raceSecond -
      previousCheckpoint.raceSecond

    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0
    ) {
      throw new Error(
        'Race time must increase between energy checkpoints',
      )
    }

    const previousRiderById = new Map(
      previousCheckpoint.riderSnapshots.map(
        (riderSnapshot) => [
          riderSnapshot.riderId,
          riderSnapshot,
        ],
      ),
    )

    const groupById = new Map(
      sourceCheckpoint.groups.map((group) => [
        group.groupId,
        group,
      ]),
    )

    const riderSnapshots = sourceCheckpoint.riderSnapshots.map(
      (sourceSnapshot) => {
        const rider = riderById.get(sourceSnapshot.riderId)
        const previousSnapshot = previousRiderById.get(
          sourceSnapshot.riderId,
        )
        const group = groupById.get(
          sourceSnapshot.currentGroupId,
        )

        if (!rider || !previousSnapshot || !group) {
          throw new Error(
            `Incomplete energy state for rider: ${sourceSnapshot.riderId}`,
          )
        }

        const isAttackCheckpoint =
          sourceCheckpoint.checkpointIndex ===
          options.attackCheckpointIndex

        const isAttacker = attackerIds.has(
          sourceSnapshot.riderId,
        )

        const energyStep = calculateRiderEnergyStep({
          currentEnergy: previousSnapshot.energy,
          freshness: rider.startingFreshness,
          endurance: rider.endurance,
          speedKmh: group.speedKmh,
          elapsedSeconds,
          riderCount: group.riderIds.length,
          cooperationLevel: getCooperationLevel(
            options,
            group.groupId,
          ),
          attackEnergyCost:
            isAttackCheckpoint && isAttacker
              ? attackEnergyCost
              : 0,
          resistance: rider.resistance,
        })

        return {
          ...sourceSnapshot,
          freshness: energyStep.freshness,
          energy: energyStep.energyAfter,
          movementEnergyCost:
            energyStep.movementEnergyCost,
          attackEnergyCost:
            energyStep.attackEnergyCost,
          shelterEnergySaving:
            energyStep.shelterEnergySaving,
          energyCostSincePreviousCheckpoint:
            energyStep.energyCostSincePreviousCheckpoint,
        }
      },
    )

    output.push({
      ...cloneCheckpoint(sourceCheckpoint),
      riderSnapshots,
    })
  }

  return output
}