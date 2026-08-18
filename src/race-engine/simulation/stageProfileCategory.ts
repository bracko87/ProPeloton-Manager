/**
 * stageProfileCategory.ts
 *
 * Pure deterministic classification of a stage elevation profile.
 *
 * This helper derives a broad race profile from raw kilometre/elevation
 * points. It does not mutate state, calculate rider movement, or activate
 * chase behavior.
 */

import type {
  StageInput,
} from '../domain/StageInput'

export type StageProfileCategory =
  | 'flat'
  | 'hilly'
  | 'mountain'

export interface StageProfileCategoryResult {
  readonly category:
    StageProfileCategory

  readonly stageDistanceKm:
    number

  readonly totalClimbingMetres:
    number

  readonly climbingMetresPerKm:
    number

  readonly maximumAbsoluteGradientPercent:
    number

  readonly flatSuitable:
    boolean
}

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateStageProfileCategory: ${fieldName} must be finite.`,
    )
  }
}

/**
 * Classifies a road-stage profile using cumulative positive elevation gain.
 *
 * Initial deterministic thresholds:
 *
 * Flat:
 * - less than 8 metres of climbing per kilometre; and
 * - no segment steeper than 6% in either direction.
 *
 * Mountain:
 * - at least 18 metres of climbing per kilometre; or
 * - at least one segment of 10% or steeper.
 *
 * Everything between those thresholds is hilly.
 */
export function calculateStageProfileCategory(
  stageInput:
    StageInput,
): StageProfileCategoryResult {
  assertFinite(
    stageInput.distanceKm,
    'distanceKm',
  )

  if (stageInput.distanceKm <= 0) {
    throw new Error(
      'calculateStageProfileCategory: distanceKm must be greater than 0.',
    )
  }

  if (
    !Array.isArray(
      stageInput.profilePoints,
    ) ||
    stageInput.profilePoints
      .length < 2
  ) {
    throw new Error(
      'calculateStageProfileCategory: at least two profile points are required.',
    )
  }

  const profilePoints =
    stageInput.profilePoints
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.kilometre -
          right.kilometre,
      )

  let totalClimbingMetres =
    0

  let maximumAbsoluteGradientPercent =
    0

  for (
    let index = 1;
    index <
    profilePoints.length;
    index += 1
  ) {
    const previous =
      profilePoints[
        index - 1
      ]

    const current =
      profilePoints[
        index
      ]

    assertFinite(
      previous.kilometre,
      `profilePoints[${index - 1}].kilometre`,
    )

    assertFinite(
      previous.elevationMetres,
      `profilePoints[${index - 1}].elevationMetres`,
    )

    assertFinite(
      current.kilometre,
      `profilePoints[${index}].kilometre`,
    )

    assertFinite(
      current.elevationMetres,
      `profilePoints[${index}].elevationMetres`,
    )

    const segmentDistanceKm =
      current.kilometre -
      previous.kilometre

    if (segmentDistanceKm <= 0) {
      throw new Error(
        'calculateStageProfileCategory: profile kilometres must increase.',
      )
    }

    const elevationDifferenceMetres =
      current.elevationMetres -
      previous.elevationMetres

    if (
      elevationDifferenceMetres >
      0
    ) {
      totalClimbingMetres +=
        elevationDifferenceMetres
    }

    const gradientPercent =
      (
        elevationDifferenceMetres /
        (
          segmentDistanceKm *
          1000
        )
      ) *
      100

    maximumAbsoluteGradientPercent =
      Math.max(
        maximumAbsoluteGradientPercent,
        Math.abs(
          gradientPercent,
        ),
      )
  }

  const climbingMetresPerKm =
    totalClimbingMetres /
    stageInput.distanceKm

  const flatSuitable =
    climbingMetresPerKm <
      8 &&
    maximumAbsoluteGradientPercent <
      6

  const category:
    StageProfileCategory =
    flatSuitable
      ? 'flat'
      : climbingMetresPerKm >=
          18 ||
        maximumAbsoluteGradientPercent >=
          10
        ? 'mountain'
        : 'hilly'

  return {
    category,
    stageDistanceKm:
      stageInput.distanceKm,
    totalClimbingMetres,
    climbingMetresPerKm,
    maximumAbsoluteGradientPercent,
    flatSuitable,
  }
}