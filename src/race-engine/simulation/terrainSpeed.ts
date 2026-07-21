/**
 * terrainSpeed.ts
 *
 * Deterministic terrain-based speed adjustment utility for the race engine.
 *
 * Responsibilities:
 * - Apply a simple gradient-based multiplier to a rider's base speed.
 * - Clamp the multiplier to a safe range.
 * - Clamp the final speed between configured minimum and maximum limits.
 * - Perform strict input validation without using randomness or external state.
 */

export interface TerrainSpeedInput {
  /**
   * Baseline speed in km/h before terrain adjustment.
   */
  readonly baseSpeedKmh: number
  /**
   * Road gradient in percent, where:
   * - positive values represent uphill (e.g. 5 for 5%),
   * - negative values represent downhill (e.g. -3 for -3%).
   */
  readonly gradientPercent: number
  /**
   * Minimum allowed speed in km/h after terrain adjustment.
   */
  readonly minimumSpeedKmh: number
  /**
   * Maximum allowed speed in km/h after terrain adjustment.
   */
  readonly maximumSpeedKmh: number
}

/**
 * TerrainSpeedResult
 *
 * Output of the terrain speed calculation, exposing both intermediate and final values
 * for debugging, diagnostics, and deterministic hashing.
 */
export interface TerrainSpeedResult {
  readonly baseSpeedKmh: number
  readonly gradientPercent: number
  readonly terrainMultiplier: number
  readonly unclampedSpeedKmh: number
  readonly speedKmh: number
}

/**
 * calculateTerrainSpeed
 *
 * Computes a deterministic terrain-adjusted speed based on gradient and limits.
 *
 * Behavior:
 * - Validates all numeric inputs.
 * - Computes a gradient-based terrain multiplier.
 * - Clamps the multiplier between 0.35 and 1.35.
 * - Applies the multiplier to baseSpeedKmh to obtain unclampedSpeedKmh.
 * - Clamps the final speed between minimumSpeedKmh and maximumSpeedKmh.
 *
 * Notes:
 * - No randomness, timing, or external state is used.
 * - This utility does not consider rider attributes, energy, or group dynamics.
 *
 * @throws {Error} If validation fails for any input value.
 */
export function calculateTerrainSpeed(input: TerrainSpeedInput): TerrainSpeedResult {
  const { baseSpeedKmh, gradientPercent, minimumSpeedKmh, maximumSpeedKmh } = input

  // Basic numeric validation.
  if (
    !Number.isFinite(baseSpeedKmh) ||
    !Number.isFinite(gradientPercent) ||
    !Number.isFinite(minimumSpeedKmh) ||
    !Number.isFinite(maximumSpeedKmh)
  ) {
    throw new Error('TerrainSpeedInput values must be finite numbers.')
  }

  if (baseSpeedKmh <= 0) {
    throw new Error('baseSpeedKmh must be greater than 0.')
  }

  if (minimumSpeedKmh <= 0) {
    throw new Error('minimumSpeedKmh must be greater than 0.')
  }

  if (maximumSpeedKmh < minimumSpeedKmh) {
    throw new Error('maximumSpeedKmh must be greater than or equal to minimumSpeedKmh.')
  }

  if (gradientPercent < -30 || gradientPercent > 30) {
    throw new Error('gradientPercent must be between -30 and 30 inclusive.')
  }

  // Terrain multiplier based on gradient.
  let terrainMultiplier: number

  if (gradientPercent > 0) {
    // Uphill reduces speed.
    terrainMultiplier = 1 - gradientPercent * 0.035
  } else if (gradientPercent < 0) {
    // Downhill increases speed.
    terrainMultiplier = 1 + Math.abs(gradientPercent) * 0.018
  } else {
    // Flat.
    terrainMultiplier = 1
  }

  // Clamp multiplier to a safe range.
  const clampedTerrainMultiplier = Math.min(1.35, Math.max(0.35, terrainMultiplier))

  const unclampedSpeedKmh = baseSpeedKmh * clampedTerrainMultiplier

  const speedKmh = Math.min(
    maximumSpeedKmh,
    Math.max(minimumSpeedKmh, unclampedSpeedKmh),
  )

  return {
    baseSpeedKmh,
    gradientPercent,
    terrainMultiplier: clampedTerrainMultiplier,
    unclampedSpeedKmh,
    speedKmh,
  }
}