/**
 * checkpoint.ts
 *
 * Types describing output Checkpoint, GroupSnapshot and RiderSnapshot for the
 * race-simulator-v2 initial vertical slice.
 *
 * Purpose:
 * - Provide a small deterministic output model that the presentation/adapter
 *   layers will consume later.
 */

/**
 * RiderSnapshot
 * Snapshot for a single rider at a checkpoint.
 *
 * The B1.7 energy fields expose the rider's starting freshness, remaining live
 * energy and the cost components applied since the preceding checkpoint.
 *
 * chaseEnergyCost is present on B1.8 chase checkpoints. Earlier checkpoints
 * intentionally omit it so prior checkpoint output remains unchanged.
 */
export interface RiderSnapshot {
  riderId: string
  distanceKm: number
  speedKmh: number
  currentGroupId: string
  freshness: number
  energy: number
  movementEnergyCost: number
  attackEnergyCost: number
  shelterEnergySaving: number
  energyCostSincePreviousCheckpoint: number
  chaseEnergyCost?: number
}

/**
 * GroupSnapshot
 * Lightweight description of a group (peloton or breakaway) at a checkpoint.
 *
 * gapSecondsToLeader is zero for the leading group and a deterministic positive
 * value for a trailing group once separate movement exists.
 *
 * The optional B1.6 fields expose how drafting and cooperation changed the
 * group's effective speed. The optional B1.8 fields expose the additional
 * late-stage peloton chase effort.
 */
export interface GroupSnapshot {
  groupId: string
  riderIds: string[]
  distanceKm: number
  speedKmh: number
  gapSecondsToLeader: number
  active: boolean
  baseSpeedBeforeGroupAdvantageKmh?: number
  draftingBonusKmh?: number
  cooperationBonusKmh?: number
  totalGroupAdvantageKmh?: number
  cooperationLevel?: number
  chaseActive?: boolean
  baseSpeedBeforeChaseKmh?: number
  chaseSpeedBonusKmh?: number

  /**
   * B2 terrain integration metadata. These fields are additive and optional so
   * every frozen B1 checkpoint remains byte-for-byte unchanged.
   */
  baseSpeedBeforeTerrainKmh?: number
  terrainSpeedMultiplier?: number
  terrainType?: import('./stageProfile').TerrainPhaseType
  averageGradientPercent?: number
  terrainBoundaryCrossingCount?: number
  averageTerrainSpeedKmh?: number
}

/**
 * Checkpoint
 * Represents the full race state at a deterministic checkpoint.
 */
export interface Checkpoint {
  checkpointIndex: number
  raceSecond: number
  currentKm: number
  groups: GroupSnapshot[]
  riderSnapshots: RiderSnapshot[]
}
