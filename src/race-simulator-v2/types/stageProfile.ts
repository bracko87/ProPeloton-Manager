/**
 * stageProfile.ts
 *
 * Shared deterministic road-stage profile contract used by Phase B2.
 *
 * This model describes terrain only. It does not calculate rider movement,
 * energy, group formation or results.
 */

export type RoadStageType =
  | 'flat'
  | 'hilly'
  | 'mountain'

export type RoadStageFinishType =
  | 'standard'
  | 'sprint'

export type TerrainPhaseType =
  | 'flat'
  | 'rolling'
  | 'climb'
  | 'descent'

export interface RoadStageProfilePoint {
  readonly km: number
  readonly elevationM: number
}

export interface RoadStageProfileInput {
  readonly profileId: string
  readonly stageType: RoadStageType
  readonly finishType: RoadStageFinishType
  readonly distanceKm: number
  readonly profilePoints:
    readonly RoadStageProfilePoint[]
}

export interface TerrainPhase {
  readonly phaseId: string
  readonly phaseIndex: number
  readonly terrainType: TerrainPhaseType
  readonly startKm: number
  readonly endKm: number
  readonly distanceKm: number
  readonly startElevationM: number
  readonly endElevationM: number
  readonly elevationChangeM: number
  readonly averageGradientPercent: number
  readonly sourceSegmentCount: number
  readonly isFinishPhase: boolean
}

export interface TerrainDistanceSummary {
  readonly flatKm: number
  readonly rollingKm: number
  readonly climbKm: number
  readonly descentKm: number
}

export interface RoadStageProfile {
  readonly profileId: string
  readonly stageType: RoadStageType
  readonly finishType: RoadStageFinishType
  readonly distanceKm: number
  readonly profilePoints:
    readonly RoadStageProfilePoint[]
  readonly terrainPhases:
    readonly TerrainPhase[]
  readonly finishPhaseId: string
  readonly sprintFinishEligible: boolean
  readonly totalElevationGainM: number
  readonly totalElevationLossM: number
  readonly highestElevationM: number
  readonly lowestElevationM: number
  readonly distanceByTerrain:
    TerrainDistanceSummary
}
