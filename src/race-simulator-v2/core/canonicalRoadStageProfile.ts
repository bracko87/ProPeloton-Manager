/**
 * canonicalRoadStageProfile.ts
 *
 * Converts a production read-only stage-profile payload into the deterministic
 * B2 road-stage model. Classified climbs can add a derived start point when the
 * backend profile is too sparse to preserve the stored climb length/gradient.
 */

import {
  createRoadStageProfile,
} from './roadStageProfile'
import type {
  RoadStageProfilePoint,
} from '../types/stageProfile'
import type {
  BackendRoadStageProfilePayload,
  CanonicalRoadStageProfileSnapshot,
  CanonicalRoadStageReference,
  CanonicalStageClimb,
  CanonicalStageRouteMarker,
} from '../types/canonicalRoadStageProfile'

const EPSILON = 1e-9
const ROUNDING_FACTOR = 1_000_000

function round(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) /
    ROUNDING_FACTOR
}

function asRecord(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {}
  }

  return value as Readonly<Record<string, unknown>>
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function requiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(`${label} must be a non-empty string`)
  }

  return value.trim()
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null
}

function requiredFiniteNumber(
  value: unknown,
  label: string,
): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be finite`)
  }

  return parsed
}

function optionalFiniteNumber(
  value: unknown,
): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeProfilePoints(
  value: unknown,
): RoadStageProfilePoint[] {
  const points = asArray(value).map(
    (entry, index): RoadStageProfilePoint => {
      const record = asRecord(entry)
      const km = requiredFiniteNumber(
        record.km,
        `profile_points[${index}].km`,
      )
      const elevationM = requiredFiniteNumber(
        record.elevation_m ?? record.elevation,
        `profile_points[${index}].elevation`,
      )

      return {
        km,
        elevationM,
      }
    },
  )

  if (points.length < 2) {
    throw new Error(
      'The production profile must contain at least two profile points',
    )
  }

  return points.sort((first, second) =>
    first.km - second.km,
  )
}

function normalizeRouteMarkers(
  value: unknown,
): CanonicalStageRouteMarker[] {
  return asArray(value)
    .map((entry, index) => {
      const record = asRecord(entry)
      const km = requiredFiniteNumber(
        record.km,
        `route_markers[${index}].km`,
      )
      const type =
        optionalString(record.type)?.toLowerCase() ??
        'marker'
      const label =
        optionalString(record.label) ?? type

      return {
        type,
        km,
        label,
        name: optionalString(record.name),
        category:
          optionalString(record.category) ??
          optionalString(record.kom_category) ??
          optionalString(record.climb_category),
      }
    })
    .sort((first, second) => first.km - second.km)
}

function normalizeMountainClimbs(
  value: unknown,
): CanonicalStageClimb[] {
  return asArray(value)
    .map((entry, index) => {
      const record = asRecord(entry)
      const km = requiredFiniteNumber(
        record.km,
        `mountain_climbs[${index}].km`,
      )
      const lengthKm = requiredFiniteNumber(
        record.length_km,
        `mountain_climbs[${index}].length_km`,
      )
      const averageGradientPercent =
        requiredFiniteNumber(
          record.avg_gradient,
          `mountain_climbs[${index}].avg_gradient`,
        )

      if (lengthKm <= 0) {
        throw new Error(
          `mountain_climbs[${index}].length_km must be positive`,
        )
      }

      if (averageGradientPercent <= 0) {
        throw new Error(
          `mountain_climbs[${index}].avg_gradient must be positive`,
        )
      }

      return {
        km,
        name:
          optionalString(record.name) ??
          `Climb ${index + 1}`,
        category: optionalString(record.category),
        lengthKm,
        averageGradientPercent,
      }
    })
    .sort((first, second) => first.km - second.km)
}

function findPointAtKm(
  points: readonly RoadStageProfilePoint[],
  km: number,
): RoadStageProfilePoint | undefined {
  return points.find(
    (point) => Math.abs(point.km - km) <= EPSILON,
  )
}

function enrichProfileWithClimbStarts(
  sourcePoints: readonly RoadStageProfilePoint[],
  climbs: readonly CanonicalStageClimb[],
): {
  readonly profilePoints: RoadStageProfilePoint[]
  readonly derivedPointCount: number
} {
  const points = sourcePoints.map((point) => ({
    ...point,
  }))
  let derivedPointCount = 0

  climbs.forEach((climb) => {
    const summit = findPointAtKm(points, climb.km)

    if (!summit) {
      throw new Error(
        `Classified climb at ${climb.km} km requires an exact summit profile point`,
      )
    }

    const startKm = round(climb.km - climb.lengthKm)

    if (startKm < 0) {
      throw new Error(
        `Classified climb at ${climb.km} km starts before the stage`,
      )
    }

    if (findPointAtKm(points, startKm)) {
      return
    }

    const elevationGainM =
      climb.lengthKm *
      1000 *
      (climb.averageGradientPercent / 100)
    const startElevationM = round(
      summit.elevationM - elevationGainM,
    )

    if (startElevationM < 0) {
      throw new Error(
        `Derived climb start at ${startKm} km has negative elevation`,
      )
    }

    points.push({
      km: startKm,
      elevationM: startElevationM,
    })
    derivedPointCount += 1
  })

  points.sort((first, second) =>
    first.km - second.km,
  )

  return {
    profilePoints: points,
    derivedPointCount,
  }
}

/**
 * Builds a deterministic canonical snapshot from an existing read-only stage
 * profile payload. The payload and reference are never mutated.
 */
export function createCanonicalRoadStageProfile(
  reference: CanonicalRoadStageReference,
  payload: BackendRoadStageProfilePayload,
): CanonicalRoadStageProfileSnapshot {
  if (payload.has_profile !== true) {
    throw new Error(
      'The production stage does not expose a profile',
    )
  }

  const stageId = requiredString(
    payload.stage_id,
    'stage_id',
  )
  const raceId = requiredString(
    payload.race_id,
    'race_id',
  )
  const stageNumber = requiredFiniteNumber(
    payload.stage_number,
    'stage_number',
  )
  const sourceTerrainType = requiredString(
    payload.terrain_type,
    'terrain_type',
  ).toLowerCase()

  if (stageId !== reference.stageId) {
    throw new Error(
      `Unexpected stage_id: ${stageId}`,
    )
  }

  if (raceId !== reference.raceId) {
    throw new Error(
      `Unexpected race_id: ${raceId}`,
    )
  }

  if (stageNumber !== reference.stageNumber) {
    throw new Error(
      `Unexpected stage_number: ${stageNumber}`,
    )
  }

  if (sourceTerrainType !== reference.stageType) {
    throw new Error(
      `Expected ${reference.stageType} terrain but received ${sourceTerrainType}`,
    )
  }

  const sourceProfilePoints = normalizeProfilePoints(
    payload.profile_points,
  )
  const mountainClimbs = normalizeMountainClimbs(
    payload.mountain_climbs,
  )
  const enriched = enrichProfileWithClimbStarts(
    sourceProfilePoints,
    mountainClimbs,
  )
  const distanceKm = requiredFiniteNumber(
    payload.distance_km,
    'distance_km',
  )

  const normalizedProfile = createRoadStageProfile({
    profileId: `canonical:${reference.stageId}`,
    stageType: reference.stageType,
    finishType: reference.finishType,
    distanceKm,
    profilePoints: enriched.profilePoints,
  })

  return {
    reference,
    stageTitle:
      optionalString(payload.stage_title) ??
      reference.fallbackStageTitle,
    routeLabel: optionalString(payload.route_label),
    stageSummary: optionalString(
      payload.stage_summary,
    ),
    sourceTerrainType,
    sourceProfileType: optionalString(
      payload.profile_type,
    ),
    sourceElevationGainM: optionalFiniteNumber(
      payload.elevation_gain_m,
    ),
    routeMarkers: normalizeRouteMarkers(
      payload.route_markers,
    ),
    mountainClimbs,
    derivedClimbStartPointCount:
      enriched.derivedPointCount,
    normalizedProfile,
  }
}
