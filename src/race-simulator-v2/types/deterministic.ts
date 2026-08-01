/**
 * deterministic.ts
 *
 * Deterministic RNG and configuration types for the race-simulator-v2.
 *
 * Purpose:
 * - Provide a seed type, RNG interface and a minimal deterministic run config
 *   shared across the simulator modules.
 */

/**
 * Seed
 * A seed can be a string or number to initialize deterministic RNGs.
 */
export type Seed = string | number

/**
 * RNG
 * Interface describing a simple, clonable pseudo-random number generator.
 *
 * next(): returns a floating number in [0, 1)
 * clone(): returns a new RNG instance with the same internal state so sequences
 *          can be reproduced independently.
 */
export interface RNG {
  next(): number
  clone(): RNG
}

/**
 * DeterministicConfig
 * Lightweight configuration object that carries the seed for deterministic runs.
 */
export interface DeterministicConfig {
  seed: Seed
}