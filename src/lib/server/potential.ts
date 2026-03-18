/**
 * src/lib/server/potential.ts
 *
 * Backend helper utilities for player potential handling.
 *
 * Purpose:
 * - Keep potential numeric on the server while exposing friendly UI labels.
 * - Provide clamping, label mapping, age-based bonus checks and bonus values.
 * - Designed to be safe for importing in server-side logic (no DOM usage).
 */

/**
 * PotentialUiLabel
 *
 * UI-facing named potential tiers used throughout the app.
 */
export type PotentialUiLabel = 'Limited' | 'Average' | 'Promising' | 'High' | 'Elite'

/**
 * POTENTIAL_BONUS_MAX_AGE
 *
 * Maximum age (inclusive) where potential development bonuses apply.
 */
export const POTENTIAL_BONUS_MAX_AGE = 28

/**
 * clampPotential
 *
 * Clamp a numeric potential value to the integer range [0, 100].
 *
 * @param value - The potential value to clamp
 * @returns Rounded and clamped potential (0..100)
 */
export function clampPotential(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * getPotentialUiLabel
 *
 * Map a numeric potential into a friendly UI tier label.
 *
 * @param potential - Numeric potential (optional / nullable)
 * @returns One of the PotentialUiLabel values
 */
export function getPotentialUiLabel(potential?: number | null): PotentialUiLabel {
  const value = clampPotential(potential ?? 0)

  if (value <= 19) return 'Limited'
  if (value <= 39) return 'Average'
  if (value <= 59) return 'Promising'
  if (value <= 79) return 'High'
  return 'Elite'
}

/**
 * hasActivePotentialBonus
 *
 * Determine whether a player's age qualifies for a development bonus.
 *
 * @param age - Player age in years (optional / nullable)
 * @returns True when age is a number and <= POTENTIAL_BONUS_MAX_AGE
 */
export function hasActivePotentialBonus(age?: number | null) {
  return typeof age === 'number' && age <= POTENTIAL_BONUS_MAX_AGE
}

/**
 * getPotentialDevelopmentBonus
 *
 * Compute a small fractional development bonus based on potential when the
 * player's age is within the bonus window.
 *
 * Returns:
 * - 0 for no active bonus or very low potential
 * - 0.25 / 0.5 / 0.75 / 1 for increasing potential bands
 *
 * @param potential - Numeric potential (optional / nullable)
 * @param age - Player age in years (optional / nullable)
 * @returns Fractional bonus number (0..1)
 */
export function getPotentialDevelopmentBonus(potential?: number | null, age?: number | null) {
  if (!hasActivePotentialBonus(age)) {
    return 0
  }

  const value = clampPotential(potential ?? 0)

  if (value <= 19) return 0
  if (value <= 39) return 0.25
  if (value <= 59) return 0.5
  if (value <= 79) return 0.75
  return 1
}