/**
 * terrainMovement.ts
 *
 * Deterministic Phase B2.2 contract for applying a normalized terrain phase
 * and its gradient to one existing group speed.
 *
 * Rider attributes, roles, energy changes and group splitting are intentionally
 * outside this contract.
 */

import type {
  RoadStageProfile,
  TerrainPhaseType,
} from './stageProfile'

export interface TerrainMovementInput {
  readonly profile: RoadStageProfile
  readonly startKm: number
  readonly durationSeconds: number
  readonly baseSpeedKmh: number
}

export interface TerrainMovementSegment {
  readonly phaseId: string
  readonly phaseIndex: number
  readonly terrainType: TerrainPhaseType
  readonly averageGradientPercent: number
  readonly startKm: number
  readonly endKm: number
  readonly distanceKm: number
  readonly durationSeconds: number
  readonly baseSpeedKmh: number
  readonly terrainSpeedMultiplier: number
  readonly effectiveSpeedKmh: number
  readonly reachedPhaseEnd: boolean
  readonly reachedStageFinish: boolean
}

export interface TerrainMovementResult {
  readonly profileId: string
  readonly startKm: number
  readonly endKm: number
  readonly distanceKm: number
  readonly requestedDurationSeconds: number
  readonly elapsedDurationSeconds: number
  readonly unusedDurationSeconds: number
  readonly baseSpeedKmh: number
  readonly startedPhaseId: string
  readonly endedPhaseId: string
  readonly crossedPhaseBoundary: boolean
  readonly phaseBoundaryCrossingCount: number
  readonly stageFinished: boolean
  readonly segments: readonly TerrainMovementSegment[]
}
