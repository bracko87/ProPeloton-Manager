/**
 * canonicalRoadStageProfile.ts
 *
 * Read-only integration contract for adapting an existing production stage
 * profile into the deterministic B2 road-stage profile model.
 */

import type {
  RoadStageFinishType,
  RoadStageProfile,
  RoadStageType,
} from './stageProfile'

export type CanonicalRoadStageProfileKey =
  | 'rio-stage-1-flat'
  | 'rio-stage-6-hilly'
  | 'rio-stage-3-mountain'

export interface CanonicalRoadStageReference {
  readonly key: CanonicalRoadStageProfileKey
  readonly raceId: string
  readonly stageId: string
  readonly stageNumber: number
  readonly stageType: RoadStageType
  readonly finishType: RoadStageFinishType
  readonly buttonLabel: string
  readonly fallbackStageTitle: string
}

export interface CanonicalStageRouteMarker {
  readonly type: string
  readonly km: number
  readonly label: string
  readonly name: string | null
  readonly category: string | null
}

export interface CanonicalStageClimb {
  readonly km: number
  readonly name: string
  readonly category: string | null
  readonly lengthKm: number
  readonly averageGradientPercent: number
}

export interface BackendRoadStageProfilePayload {
  readonly stage_id?: unknown
  readonly race_id?: unknown
  readonly stage_number?: unknown
  readonly stage_title?: unknown
  readonly route_label?: unknown
  readonly stage_summary?: unknown
  readonly distance_km?: unknown
  readonly elevation_gain_m?: unknown
  readonly terrain_type?: unknown
  readonly profile_type?: unknown
  readonly profile_points?: unknown
  readonly route_markers?: unknown
  readonly mountain_climbs?: unknown
  readonly has_profile?: unknown
}

export interface CanonicalRoadStageProfileSnapshot {
  readonly reference: CanonicalRoadStageReference
  readonly stageTitle: string
  readonly routeLabel: string | null
  readonly stageSummary: string | null
  readonly sourceTerrainType: string
  readonly sourceProfileType: string | null
  readonly sourceElevationGainM: number | null
  readonly routeMarkers:
    readonly CanonicalStageRouteMarker[]
  readonly mountainClimbs:
    readonly CanonicalStageClimb[]
  readonly derivedClimbStartPointCount: number
  readonly normalizedProfile: RoadStageProfile
}
