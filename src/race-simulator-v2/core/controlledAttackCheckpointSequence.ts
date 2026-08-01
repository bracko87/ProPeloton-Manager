/**
 * controlledAttackCheckpointSequence.ts
 *
 * Applies one controlled deterministic attack to an existing peloton-only
 * checkpoint collection.
 *
 * Purpose:
 * - Keep every checkpoint before the attack unchanged.
 * - Split the peloton into one breakaway and one peloton at a configured
 *   checkpoint.
 * - Preserve the same two group memberships for all later checkpoints.
 * - Keep time, distance and speed unchanged during this isolated B1.4 step.
 *
 * This step intentionally contains no separate group movement, changing gap,
 * drafting, energy cost, chase, catch or finish logic.
 */

import { Checkpoint, GroupSnapshot } from '../types/checkpoint'

const PELOTON_GROUP_ID = 'peloton-1'

export interface ControlledAttackOptions {
  /** Existing checkpoint index at which the attack becomes visible. */
  attackCheckpointIndex: number

  /** Controlled riders that leave the peloton together. */
  attackerRiderIds: readonly string[]

  /** Stable identifier assigned to the new breakaway group. */
  breakawayGroupId: string
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

function validateBaseCheckpointCollection(checkpoints: readonly Checkpoint[]): string[] {
  if (checkpoints.length < 2) {
    throw new Error('Controlled attack requires at least two checkpoints')
  }

  const initialGroup = checkpoints[0].groups[0]

  if (checkpoints[0].groups.length !== 1 || initialGroup?.groupId !== PELOTON_GROUP_ID) {
    throw new Error('Controlled attack requires a peloton-only checkpoint collection')
  }

  const expectedRiderIds = [...initialGroup.riderIds]
  const expectedRiderSet = new Set(expectedRiderIds)

  if (expectedRiderSet.size !== expectedRiderIds.length) {
    throw new Error('Peloton rider membership must be unique')
  }

  for (const checkpoint of checkpoints) {
    if (checkpoint.groups.length !== 1) {
      throw new Error('Controlled attack requires a peloton-only checkpoint collection')
    }

    const group = checkpoint.groups[0]

    if (!group.active || group.groupId !== PELOTON_GROUP_ID) {
      throw new Error('Controlled attack requires one active peloton group')
    }

    if (
      group.riderIds.length !== expectedRiderIds.length ||
      group.riderIds.some((riderId, index) => riderId !== expectedRiderIds[index])
    ) {
      throw new Error('Peloton membership and order must remain stable before the attack')
    }

    const snapshotRiderIds = checkpoint.riderSnapshots.map(
      (riderSnapshot) => riderSnapshot.riderId,
    )

    if (
      snapshotRiderIds.length !== expectedRiderIds.length ||
      snapshotRiderIds.some((riderId) => !expectedRiderSet.has(riderId)) ||
      new Set(snapshotRiderIds).size !== snapshotRiderIds.length
    ) {
      throw new Error('Checkpoint rider snapshots must match peloton membership')
    }
  }

  return expectedRiderIds
}

function validateAttackOptions(
  checkpoints: readonly Checkpoint[],
  expectedRiderIds: readonly string[],
  options: ControlledAttackOptions,
): Set<string> {
  if (
    !Number.isInteger(options.attackCheckpointIndex) ||
    options.attackCheckpointIndex <= checkpoints[0].checkpointIndex
  ) {
    throw new Error('attackCheckpointIndex must reference a checkpoint after the start')
  }

  if (
    !checkpoints.some(
      (checkpoint) => checkpoint.checkpointIndex === options.attackCheckpointIndex,
    )
  ) {
    throw new Error('attackCheckpointIndex was not found in the checkpoint collection')
  }

  const breakawayGroupId = options.breakawayGroupId.trim()

  if (!breakawayGroupId) {
    throw new Error('breakawayGroupId must be a non-empty string')
  }

  if (breakawayGroupId === PELOTON_GROUP_ID) {
    throw new Error('breakawayGroupId must differ from the peloton group id')
  }

  if (options.attackerRiderIds.length === 0) {
    throw new Error('attackerRiderIds must contain at least one rider')
  }

  const attackerSet = new Set(options.attackerRiderIds)

  if (attackerSet.size !== options.attackerRiderIds.length) {
    throw new Error('attackerRiderIds must be unique')
  }

  const expectedRiderSet = new Set(expectedRiderIds)

  for (const attackerRiderId of attackerSet) {
    if (!expectedRiderSet.has(attackerRiderId)) {
      throw new Error(`Unknown attacker rider id: ${attackerRiderId}`)
    }
  }

  if (attackerSet.size >= expectedRiderIds.length) {
    throw new Error('At least one rider must remain in the peloton')
  }

  return attackerSet
}

function splitCheckpoint(
  checkpoint: Checkpoint,
  attackerSet: ReadonlySet<string>,
  breakawayGroupId: string,
): Checkpoint {
  const sourceGroup = checkpoint.groups[0]
  const breakawayRiderIds = sourceGroup.riderIds.filter((riderId) =>
    attackerSet.has(riderId),
  )
  const pelotonRiderIds = sourceGroup.riderIds.filter(
    (riderId) => !attackerSet.has(riderId),
  )

  const breakawayGroup: GroupSnapshot = {
    groupId: breakawayGroupId,
    riderIds: breakawayRiderIds,
    distanceKm: sourceGroup.distanceKm,
    speedKmh: sourceGroup.speedKmh,
    gapSecondsToLeader: 0,
    active: true,
  }

  const pelotonGroup: GroupSnapshot = {
    ...sourceGroup,
    riderIds: pelotonRiderIds,
  }

  return {
    ...checkpoint,
    groups: [breakawayGroup, pelotonGroup],
    riderSnapshots: checkpoint.riderSnapshots.map((riderSnapshot) => ({
      ...riderSnapshot,
      currentGroupId: attackerSet.has(riderSnapshot.riderId)
        ? breakawayGroupId
        : PELOTON_GROUP_ID,
    })),
  }
}

/**
 * Create a new checkpoint collection containing one controlled attack.
 *
 * The attack is a membership-only split in B1.4. Both groups remain at the
 * same distance and speed until separate group movement is introduced in B1.5.
 */
export function createControlledAttackCheckpointSequence(
  checkpoints: readonly Checkpoint[],
  options: ControlledAttackOptions,
): Checkpoint[] {
  const expectedRiderIds = validateBaseCheckpointCollection(checkpoints)
  const attackerSet = validateAttackOptions(
    checkpoints,
    expectedRiderIds,
    options,
  )
  const breakawayGroupId = options.breakawayGroupId.trim()

  return checkpoints.map((checkpoint) => {
    if (checkpoint.checkpointIndex < options.attackCheckpointIndex) {
      return cloneCheckpoint(checkpoint)
    }

    return splitCheckpoint(checkpoint, attackerSet, breakawayGroupId)
  })
}
