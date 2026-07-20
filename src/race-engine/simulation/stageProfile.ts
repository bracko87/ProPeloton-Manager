/**
 * stageProfile.ts
 *
 * Deterministic terrain-profile sampling for race stages.
 *
 * This module:
 * - validates raw profile points;
 * - works with a sorted copy without mutating StageInput;
 * - interpolates elevation;
 * - derives the gradient of the surrounding segment.
 */

import type {
  StageInput,
  StageProfilePoint,
} from '../domain/StageInput'

/**
 * Terrain information at one kilometre of the stage.
 */
export interface StageTerrainSample {
  readonly kilometre: number
  readonly elevationMetres: number
  readonly gradientPercent: number
  readonly lowerPointKilometre: number
  readonly upperPointKilometre: number
}

/**
 * Adjacent profile points surrounding a requested kilometre.
 */
interface SurroundingProfilePoints {
  readonly lower: StageProfilePoint
  readonly upper: StageProfilePoint
}

function ensureFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`)
  }
}

function validateRequestedKilometre(
  stageInput: StageInput,
  kilometre: number,
): void {
  ensureFinite(stageInput.distanceKm, 'stageInput.distanceKm')
  ensureFinite(kilometre, 'kilometre')

  if (stageInput.distanceKm <= 0) {
    throw new Error(
      'stageInput.distanceKm must be greater than 0.',
    )
  }

  if (kilometre < 0) {
    throw new Error(
      'Requested kilometre must be greater than or equal to 0.',
    )
  }

  if (kilometre > stageInput.distanceKm) {
    throw new Error(
      'Requested kilometre must be less than or equal to stage distance.',
    )
  }
}

function validateAndSortProfilePoints(
  stageInput: StageInput,
): readonly StageProfilePoint[] {
  const originalPoints = stageInput.profilePoints

  if (!Array.isArray(originalPoints)) {
    throw new Error('Stage profilePoints must be an array.')
  }

  if (originalPoints.length < 2) {
    throw new Error(
      'Stage profile must contain at least two points.',
    )
  }

  for (let index = 0; index < originalPoints.length; index += 1) {
    const point = originalPoints[index]

    ensureFinite(
      point.kilometre,
      `profilePoints[${index}].kilometre`,
    )

    ensureFinite(
      point.elevationMetres,
      `profilePoints[${index}].elevationMetres`,
    )

    if (
      point.kilometre < 0 ||
      point.kilometre > stageInput.distanceKm
    ) {
      throw new Error(
        `profilePoints[${index}].kilometre must be between 0 and distanceKm inclusive.`,
      )
    }
  }

  const profilePoints = [...originalPoints].sort(
    (pointA, pointB) =>
      pointA.kilometre - pointB.kilometre,
  )

  for (let index = 1; index < profilePoints.length; index += 1) {
    const previousPoint = profilePoints[index - 1]
    const currentPoint = profilePoints[index]

    if (currentPoint.kilometre === previousPoint.kilometre) {
      throw new Error(
        `Duplicate profile-point kilometre ${currentPoint.kilometre} is not allowed.`,
      )
    }
  }

  return profilePoints
}

function findSurroundingPoints(
  profilePoints: readonly StageProfilePoint[],
  kilometre: number,
): SurroundingProfilePoints {
  const firstPoint = profilePoints[0]
  const lastPoint = profilePoints[profilePoints.length - 1]

  if (kilometre <= firstPoint.kilometre) {
    return {
      lower: firstPoint,
      upper: profilePoints[1],
    }
  }

  if (kilometre >= lastPoint.kilometre) {
    return {
      lower: profilePoints[profilePoints.length - 2],
      upper: lastPoint,
    }
  }

  for (
    let index = 0;
    index < profilePoints.length - 1;
    index += 1
  ) {
    const lower = profilePoints[index]
    const upper = profilePoints[index + 1]

    /*
     * The upper comparison is exclusive so an exact internal profile
     * point becomes the lower point of the following segment.
     */
    if (
      kilometre >= lower.kilometre &&
      kilometre < upper.kilometre
    ) {
      return {
        lower,
        upper,
      }
    }
  }

  throw new Error(
    'Unable to find surrounding profile points.',
  )
}

/**
 * Return interpolated elevation and segment gradient at a stage kilometre.
 */
export function getStageTerrainSample(
  stageInput: StageInput,
  kilometre: number,
): StageTerrainSample {
  validateRequestedKilometre(stageInput, kilometre)

  const profilePoints =
    validateAndSortProfilePoints(stageInput)

  const { lower, upper } = findSurroundingPoints(
    profilePoints,
    kilometre,
  )

  const distanceBetweenPoints =
    upper.kilometre - lower.kilometre

  if (distanceBetweenPoints <= 0) {
    throw new Error(
      'Surrounding profile points must have increasing kilometre values.',
    )
  }

  const positionRatio =
    (kilometre - lower.kilometre) /
    distanceBetweenPoints

  const elevationMetres =
    lower.elevationMetres +
    (upper.elevationMetres - lower.elevationMetres) *
      positionRatio

  const horizontalDistanceMetres =
    distanceBetweenPoints * 1000

  const gradientPercent =
    ((upper.elevationMetres - lower.elevationMetres) /
      horizontalDistanceMetres) *
    100

  return {
    kilometre,
    elevationMetres,
    gradientPercent,
    lowerPointKilometre: lower.kilometre,
    upperPointKilometre: upper.kilometre,
  }
}