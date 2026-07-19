/**
 * index.ts (simulation)
 *
 * Barrel file for race-engine simulation utilities.
 *
 * Re-exports:
 * - seededRandom: deterministic PRNG utilities.
 * - createInitialState: deterministic initial SimulationState builder.
 * - raceClock: deterministic race clock helpers.
 * - simulateTick: basic deterministic movement tick with optional finish.
 * - finishStage: basic deterministic peloton finish logic.
 */

export * from './seededRandom'
export * from './createInitialState'
export * from './raceClock'
export * from './simulateTick'
export * from './finishStage'