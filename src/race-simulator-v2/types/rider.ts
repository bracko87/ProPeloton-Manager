/**
 * rider.ts
 *
 * Rider input types used by the race-simulator-v2 initial slice.
 *
 * Purpose:
 * - Define the controlled rider attributes required by the flat-stage engine.
 */

/**
 * RiderInput
 * Minimal rider description for the deterministic flat-stage simulation.
 *
 * riderId: stable identifier for the rider
 * displayName: readable name for tests and debug
 * flat: relative ability on flat terrain (0-100)
 * climbing: relative climbing ability (0-100) - present for future use
 * sprint: relative sprint ability (0-100) - present for future use
 * endurance: resistance to normal race-energy expenditure (0-100)
 * startingFreshness: available energy at the start of the stage (0-100)
 */
export interface RiderInput {
  riderId: string
  displayName: string
  flat: number
  climbing: number
  sprint: number
  endurance: number
  startingFreshness: number
}
