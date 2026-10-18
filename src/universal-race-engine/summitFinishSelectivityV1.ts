/**
 * Prospective-only HC / Category 1 summit contact calibration.
 *
 * Selection is by score distribution and sustainable energy, never by a
 * scripted number of riders, a fixed finishing order or a post-finish gap.
 * The existing physical speed integrator owns gap creation/catch-back and
 * replay. No mutation of results or bonuses occurs here.
 */
export const SUMMIT_FINISH_SELECTIVITY_VERSION = 'summit_selectivity_v1' as const

export interface SummitFinishSelectivityInputV1 {
  readonly stageDistanceKm: number
  readonly stageElevationGainM: number
  readonly climbStartKm: number
  readonly climbEndKm: number
  readonly climbDistanceKm: number
  readonly averageGradientPercent: number
  readonly climbElevationGainM: number
  readonly climbHardness: number
  readonly summitFinish: boolean
  readonly holdScores: readonly number[]
}

export interface SummitFinishSelectivityV1 {
  readonly active: boolean
  readonly hardness: number
  readonly requiredHoldScore: number
  readonly minimumEnergyToHold: number
  readonly modelVersion: typeof SUMMIT_FINISH_SELECTIVITY_VERSION
}

const limit = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo))
const rounded = (x: number) => Math.round(x * 1_000_000) / 1_000_000

/**
 * Only genuinely decisive climbs reaching the finish can use this model.
 * A descent after a mountain pass is resolved by the ordinary physical chase.
 */
export function calculateSummitFinishSelectivityV1(
  input: SummitFinishSelectivityInputV1,
): SummitFinishSelectivityV1 {
  const inactive: SummitFinishSelectivityV1 = {
    active: false, hardness: 0, requiredHoldScore: 0,
    minimumEnergyToHold: 0, modelVersion: SUMMIT_FINISH_SELECTIVITY_VERSION,
  }
  if (
    !input.summitFinish ||
    input.stageDistanceKm <= 0 ||
    Math.abs(input.stageDistanceKm - input.climbEndKm) > 0.55 ||
    input.climbDistanceKm < 6 ||
    input.averageGradientPercent < 5 ||
    input.climbElevationGainM < 450 ||
    input.holdScores.length < 3 ||
    input.holdScores.some((score) => !Number.isFinite(score))
  ) return inactive

  const duration = limit((input.climbDistanceKm - 6) / 15, 0, 1)
  const steepness = limit((input.averageGradientPercent - 5) / 4, 0, 1)
  const ascent = limit((input.climbElevationGainM - 450) / 1150, 0, 1)
  const priorLoad = limit(
    (input.stageElevationGainM - input.climbElevationGainM - 800) / 3100,
    0, 1,
  )
  const hardness = limit(
    0.34 * duration + 0.32 * steepness + 0.22 * ascent +
      0.12 * priorLoad,
    0, 1,
  )
  const scores = input.holdScores
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
  const variance = scores.reduce(
    (sum, value) => sum + (value - mean) ** 2, 0,
  ) / scores.length
  const deviation = Math.sqrt(variance)

  // An elite climbing tempo is harder to follow as length, gradient and
  // previous ascent accumulate. This does not select a fixed front-group size:
  // how many riders can hold the pace depends on their individual abilities.
  const scorePressure = 0.90 + hardness * 0.68
  const reference = mean + deviation * scorePressure
  const tolerance = 1.75 - hardness * 0.55
  const highestScore = Math.max(...scores)
  const requiredHoldScore = Math.min(
    highestScore - 0.000001,
    reference - tolerance,
  )
  const minimumEnergyToHold = 7 + hardness * 10 + priorLoad * 2.5

  return {
    active: true,
    hardness: rounded(hardness),
    requiredHoldScore: rounded(requiredHoldScore),
    minimumEnergyToHold: rounded(minimumEnergyToHold),
    modelVersion: SUMMIT_FINISH_SELECTIVITY_VERSION,
  }
}
