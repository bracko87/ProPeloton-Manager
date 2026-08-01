/**
 * roadStageProfile.ts
 *
 * Validates and normalizes a deterministic road-stage elevation profile into
 * contiguous terrain phases. Adjacent source segments with the same terrain
 * category are merged into one stable phase.
 */

import type {
  RoadStageFinishType,
  RoadStageProfile,
  RoadStageProfileInput,
  RoadStageProfilePoint,
  RoadStageType,
  TerrainDistanceSummary,
  TerrainPhase,
  TerrainPhaseType,
} from '../types/stageProfile'

const EPSILON = 1e-9
const ROUNDING_FACTOR = 1_000_000

const SUPPORTED_STAGE_TYPES:
  readonly RoadStageType[] = [
    'flat',
    'hilly',
    'mountain',
  ]

const SUPPORTED_FINISH_TYPES:
  readonly RoadStageFinishType[] = [
    'standard',
    'sprint',
  ]

function round(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) /
    ROUNDING_FACTOR
}

function assertFiniteNumber(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`)
  }
}

function calculateGradientPercent(
  start: RoadStageProfilePoint,
  end: RoadStageProfilePoint,
): number {
  const distanceKm = end.km - start.km

  return round(
    ((end.elevationM - start.elevationM) /
      (distanceKm * 1000)) *
      100,
  )
}

/**
 * Classifies one profile segment using deterministic B2 thresholds.
 *
 * - descent: <= -1.5%
 * - flat:    > -1.5% and < 1.5%
 * - rolling: >= 1.5% and < 4.0%
 * - climb:   >= 4.0%
 */
export function classifyTerrainPhase(
  averageGradientPercent: number,
): TerrainPhaseType {
  assertFiniteNumber(
    averageGradientPercent,
    'averageGradientPercent',
  )

  if (averageGradientPercent <= -1.5) {
    return 'descent'
  }

  if (averageGradientPercent < 1.5) {
    return 'flat'
  }

  if (averageGradientPercent < 4) {
    return 'rolling'
  }

  return 'climb'
}

function validateRoadStageProfileInput(
  input: RoadStageProfileInput,
): void {
  if (input.profileId.trim().length === 0) {
    throw new Error('profileId must not be empty')
  }

  if (!SUPPORTED_STAGE_TYPES.includes(
    input.stageType,
  )) {
    throw new Error(
      `Unsupported stageType: ${input.stageType}`,
    )
  }

  if (!SUPPORTED_FINISH_TYPES.includes(
    input.finishType,
  )) {
    throw new Error(
      `Unsupported finishType: ${input.finishType}`,
    )
  }

  assertFiniteNumber(
    input.distanceKm,
    'distanceKm',
  )

  if (input.distanceKm <= 0) {
    throw new Error('distanceKm must be positive')
  }

  if (input.profilePoints.length < 2) {
    throw new Error(
      'At least two profile points are required',
    )
  }

  input.profilePoints.forEach(
    (point, index) => {
      assertFiniteNumber(
        point.km,
        `profilePoints[${index}].km`,
      )
      assertFiniteNumber(
        point.elevationM,
        `profilePoints[${index}].elevationM`,
      )

      if (point.km < 0) {
        throw new Error(
          `profilePoints[${index}].km must not be negative`,
        )
      }

      if (point.elevationM < 0) {
        throw new Error(
          `profilePoints[${index}].elevationM must not be negative`,
        )
      }

      if (
        index > 0 &&
        point.km <=
          input.profilePoints[index - 1].km
      ) {
        throw new Error(
          'Profile point kilometres must increase strictly',
        )
      }
    },
  )

  const firstPoint = input.profilePoints[0]
  const finalPoint =
    input.profilePoints[
      input.profilePoints.length - 1
    ]

  if (Math.abs(firstPoint.km) > EPSILON) {
    throw new Error(
      'The first profile point must start at 0 km',
    )
  }

  if (
    Math.abs(
      finalPoint.km - input.distanceKm,
    ) > EPSILON
  ) {
    throw new Error(
      'The final profile point must equal stage distance',
    )
  }
}

interface MutableTerrainPhase {
  terrainType: TerrainPhaseType
  startKm: number
  endKm: number
  startElevationM: number
  endElevationM: number
  sourceSegmentCount: number
}

function buildMergedTerrainPhases(
  input: RoadStageProfileInput,
): TerrainPhase[] {
  const merged: MutableTerrainPhase[] = []

  for (
    let index = 0;
    index < input.profilePoints.length - 1;
    index += 1
  ) {
    const start = input.profilePoints[index]
    const end = input.profilePoints[index + 1]
    const terrainType = classifyTerrainPhase(
      calculateGradientPercent(start, end),
    )
    const previous = merged[merged.length - 1]

    if (
      previous &&
      previous.terrainType === terrainType
    ) {
      previous.endKm = end.km
      previous.endElevationM = end.elevationM
      previous.sourceSegmentCount += 1
      continue
    }

    merged.push({
      terrainType,
      startKm: start.km,
      endKm: end.km,
      startElevationM: start.elevationM,
      endElevationM: end.elevationM,
      sourceSegmentCount: 1,
    })
  }

  return merged.map(
    (phase, phaseIndex): TerrainPhase => {
      const distanceKm = round(
        phase.endKm - phase.startKm,
      )
      const elevationChangeM = round(
        phase.endElevationM -
          phase.startElevationM,
      )
      const averageGradientPercent = round(
        (elevationChangeM /
          (distanceKm * 1000)) *
          100,
      )

      return {
        phaseId:
          `${input.profileId}:phase-${String(
            phaseIndex + 1,
          ).padStart(3, '0')}`,
        phaseIndex,
        terrainType: phase.terrainType,
        startKm: round(phase.startKm),
        endKm: round(phase.endKm),
        distanceKm,
        startElevationM: round(
          phase.startElevationM,
        ),
        endElevationM: round(
          phase.endElevationM,
        ),
        elevationChangeM,
        averageGradientPercent,
        sourceSegmentCount:
          phase.sourceSegmentCount,
        isFinishPhase:
          phaseIndex === merged.length - 1,
      }
    },
  )
}

function calculateTerrainDistanceSummary(
  phases: readonly TerrainPhase[],
): TerrainDistanceSummary {
  const summary = {
    flatKm: 0,
    rollingKm: 0,
    climbKm: 0,
    descentKm: 0,
  }

  phases.forEach((phase) => {
    if (phase.terrainType === 'flat') {
      summary.flatKm += phase.distanceKm
    } else if (
      phase.terrainType === 'rolling'
    ) {
      summary.rollingKm += phase.distanceKm
    } else if (
      phase.terrainType === 'climb'
    ) {
      summary.climbKm += phase.distanceKm
    } else {
      summary.descentKm += phase.distanceKm
    }
  })

  return {
    flatKm: round(summary.flatKm),
    rollingKm: round(summary.rollingKm),
    climbKm: round(summary.climbKm),
    descentKm: round(summary.descentKm),
  }
}

function isSprintFinishEligible(
  input: RoadStageProfileInput,
  finishPhase: TerrainPhase,
): boolean {
  if (input.finishType !== 'sprint') {
    return false
  }

  if (input.stageType === 'mountain') {
    return false
  }

  return (
    finishPhase.distanceKm >= 1 &&
    (finishPhase.terrainType === 'flat' ||
      finishPhase.terrainType === 'rolling') &&
    finishPhase.averageGradientPercent < 3
  )
}

/**
 * Creates one normalized, immutable-by-contract stage profile.
 */
export function createRoadStageProfile(
  input: RoadStageProfileInput,
): RoadStageProfile {
  validateRoadStageProfileInput(input)

  const terrainPhases =
    buildMergedTerrainPhases(input)
  const finishPhase =
    terrainPhases[terrainPhases.length - 1]
  const sprintFinishEligible =
    isSprintFinishEligible(
      input,
      finishPhase,
    )

  if (
    input.finishType === 'sprint' &&
    !sprintFinishEligible
  ) {
    throw new Error(
      'Sprint finish requires a supported flat or rolling final phase',
    )
  }

  let totalElevationGainM = 0
  let totalElevationLossM = 0

  for (
    let index = 0;
    index < input.profilePoints.length - 1;
    index += 1
  ) {
    const change =
      input.profilePoints[index + 1]
        .elevationM -
      input.profilePoints[index]
        .elevationM

    if (change > 0) {
      totalElevationGainM += change
    } else {
      totalElevationLossM += Math.abs(change)
    }
  }

  const elevations = input.profilePoints.map(
    (point) => point.elevationM,
  )

  return {
    profileId: input.profileId,
    stageType: input.stageType,
    finishType: input.finishType,
    distanceKm: round(input.distanceKm),
    profilePoints: input.profilePoints.map(
      (point) => ({
        km: round(point.km),
        elevationM: round(point.elevationM),
      }),
    ),
    terrainPhases,
    finishPhaseId: finishPhase.phaseId,
    sprintFinishEligible,
    totalElevationGainM: round(
      totalElevationGainM,
    ),
    totalElevationLossM: round(
      totalElevationLossM,
    ),
    highestElevationM: round(
      Math.max(...elevations),
    ),
    lowestElevationM: round(
      Math.min(...elevations),
    ),
    distanceByTerrain:
      calculateTerrainDistanceSummary(
        terrainPhases,
      ),
  }
}

/**
 * Returns the phase active at a stage kilometre.
 * Boundaries belong to the following phase, while the exact finish belongs to
 * the final phase.
 */
export function getTerrainPhaseAtKm(
  profile: RoadStageProfile,
  km: number,
): TerrainPhase {
  assertFiniteNumber(km, 'km')

  if (km < 0 || km > profile.distanceKm) {
    throw new Error(
      'km must be inside the stage distance',
    )
  }

  const phase = profile.terrainPhases.find(
    (candidate, index) =>
      km >= candidate.startKm &&
      (km < candidate.endKm ||
        (index ===
          profile.terrainPhases.length - 1 &&
          Math.abs(
            km - candidate.endKm,
          ) <= EPSILON)),
  )

  if (!phase) {
    throw new Error(
      'No terrain phase covers the requested kilometre',
    )
  }

  return phase
}

export function calculateStageProgress(
  profile: RoadStageProfile,
  km: number,
): number {
  getTerrainPhaseAtKm(profile, km)

  return round(km / profile.distanceKm)
}
