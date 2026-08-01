/**
 * seededRng.ts
 *
 * Small, self-contained seeded RNG implementation used by the simulator.
 *
 * Purpose:
 * - Provide createRng(seed) returning an RNG implementing the RNG interface.
 * - The implementation is cloneable so two RNGs can reproduce the same sequence.
 *
 * Implementation notes:
 * - Uses a compact xorshift-like 32-bit algorithm with floating output in [0,1).
 * - No external dependencies.
 */

import { RNG, Seed } from '../types/deterministic'

/**
 * XorShift32Rng
 * Simple stateful RNG implementing RNG interface. The internal state is a 32-bit
 * integer. clone() returns a new RNG with the same state.
 */
class XorShift32Rng implements RNG {
  private state: number

  /**
   * constructor
   * @param seedNumber - initial 32-bit state
   */
  constructor(seedNumber: number) {
    // ensure non-zero state
    this.state = seedNumber >>> 0
    if (this.state === 0) {
      this.state = 0x9e3779b9 // fallback seed
    }
  }

  /**
   * next
   * Generate next floating number in [0, 1).
   */
  next(): number {
    // xorshift32
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    // keep as uint32
    this.state = x >>> 0
    // convert to float in [0,1)
    return (this.state >>> 0) / 0x100000000
  }

  /**
   * clone
   * Create a new RNG instance seeded with the current internal state.
   */
  clone(): RNG {
    return new XorShift32Rng(this.state)
  }
}

/**
 * hashSeed
 * Convert a Seed (string | number) into a 32-bit unsigned integer deterministically.
 *
 * Uses a simple FNV-1a style hash for strings; numeric seeds are coerced.
 */
function hashSeed(seed: Seed): number {
  if (typeof seed === 'number') {
    return seed >>> 0
  }

  // FNV-1a 32-bit
  let h = 0x811c9dc5 >>> 0
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0 // multiply by FNV prime
  }
  return h >>> 0
}

/**
 * createRng
 * Create a clonable RNG from a provided seed.
 *
 * @param seed - string or number seed
 * @returns RNG instance
 */
export function createRng(seed: Seed): RNG {
  const s = hashSeed(seed)
  return new XorShift32Rng(s)
}