/**
 * seededRandom.ts
 * Deterministic pseudo-random generator for the ProPeloton race engine.
 *
 * Design goals:
 * - identical seed + identical call order => identical output;
 * - no dependency on Math.random();
 * - serializable/restorable internal state;
 * - deterministic child streams through fork();
 * - stable behavior across browser and Node runtimes.
 *
 * The implementation combines xmur3 string hashing with sfc32 generation.
 * All arithmetic is forced through unsigned 32-bit operations.
 */

export type SeedValue = string | number | bigint

/**
 * SeededRandomSnapshot
 * Serialized snapshot of the SeededRandom generator state.
 */
export interface SeededRandomSnapshot {
  readonly algorithm: 'xmur3-sfc32-v1'
  readonly seed: string
  readonly state: readonly [number, number, number, number]
  readonly calls: number
}

/**
 * WeightedChoice
 * Describes a value with an associated selection weight.
 */
export interface WeightedChoice<T> {
  readonly value: T
  readonly weight: number
}

/**
 * UINT32_RANGE
 * Constant range for normalizing 32-bit unsigned integers into [0, 1).
 */
const UINT32_RANGE = 0x1_0000_0000

/**
 * normalizeSeed
 * Normalizes any supported seed value into a non-empty string.
 *
 * @param seed - Seed value as string, number or bigint.
 * @returns Normalized seed as a string.
 * @throws If the supplied string seed is empty.
 */
function normalizeSeed(seed: SeedValue): string {
  if (typeof seed === 'string') {
    if (seed.length === 0) {
      throw new Error('Seed must not be an empty string.')
    }

    return seed
  }

  return seed.toString()
}

/**
 * createSeedWords
 * Hashes the seed string into four 32-bit unsigned integers using xmur3-style hashing.
 *
 * @param seed - Normalized seed string.
 * @returns Tuple of four 32-bit unsigned integers representing initial PRNG state.
 */
function createSeedWords(seed: string): [number, number, number, number] {
  let hash = 1779033703 ^ seed.length

  for (let index = 0; index < seed.length; index += 1) {
    // Mix current character into hash using xmur3-style operations.
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }

  /**
   * nextWord
   * Advances the internal hash and returns the next 32-bit unsigned word.
   *
   * @returns Next 32-bit unsigned integer derived from the hash.
   */
  const nextWord = (): number => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }

  return [nextWord(), nextWord(), nextWord(), nextWord()]
}

/**
 * assertFiniteNumber
 * Ensures that the provided value is a finite number.
 *
 * @param value - Number to validate.
 * @param name - Value label used in error messages.
 * @throws If the value is not a finite number.
 */
function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`)
  }
}

/**
 * assertPositiveInteger
 * Ensures that the provided value is a positive integer.
 *
 * @param value - Number to validate.
 * @param name - Value label used in error messages.
 * @throws If the value is not a positive integer.
 */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

/**
 * SeededRandom
 * Deterministic pseudo-random number generator based on xmur3 + sfc32.
 * Produces repeatable sequences for identical seeds and call orders.
 */
export class SeededRandom {
  public readonly seed: string

  private a: number
  private b: number
  private c: number
  private d: number
  private callCount: number

  /**
   * Creates a new SeededRandom instance.
   *
   * @param seed - Initial seed used to construct the generator.
   * @param snapshot - Optional snapshot to restore a previous generator state.
   * @throws If the snapshot algorithm or seed does not match expectations.
   */
  public constructor(seed: SeedValue, snapshot?: SeededRandomSnapshot) {
    this.seed = normalizeSeed(seed)

    if (snapshot !== undefined) {
      if (snapshot.algorithm !== 'xmur3-sfc32-v1') {
        throw new Error(
          `Unsupported random snapshot algorithm: ${snapshot.algorithm}`,
        )
      }

      if (snapshot.seed !== this.seed) {
        throw new Error(
          'Snapshot seed does not match the requested generator seed.',
        )
      }

      const [a, b, c, d] = snapshot.state
      this.a = a >>> 0
      this.b = b >>> 0
      this.c = c >>> 0
      this.d = d >>> 0
      this.callCount = snapshot.calls
      return
    }

    const [a, b, c, d] = createSeedWords(this.seed)
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.callCount = 0
  }

  /**
   * nextFloat
   * Returns a deterministic float in the half-open interval [0, 1).
   *
   * @returns Pseudo-random float between 0 (inclusive) and 1 (exclusive).
   */
  public nextFloat(): number {
    const result = (this.a + this.b + this.d) >>> 0

    // sfc32 state update sequence.
    this.d = (this.d + 1) >>> 0
    this.a = (this.b ^ (this.b >>> 9)) >>> 0
    this.b = (this.c + (this.c << 3)) >>> 0
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0
    this.c = (this.c + result) >>> 0
    this.callCount += 1

    return result / UINT32_RANGE
  }

  /**
   * nextInt
   * Returns a deterministic integer from min through max, inclusive.
   *
   * @param min - Inclusive lower bound (safe integer).
   * @param max - Inclusive upper bound (safe integer).
   * @returns Pseudo-random integer in [min, max].
   * @throws If bounds are not safe integers or if range is invalid.
   */
  public nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new Error('nextInt bounds must be safe integers.')
    }

    if (max < min) {
      throw new Error('nextInt max must be greater than or equal to min.')
    }

    const range = max - min + 1

    if (!Number.isSafeInteger(range) || range <= 0) {
      throw new Error('nextInt range is invalid or exceeds safe integer limits.')
    }

    return min + Math.floor(this.nextFloat() * range)
  }

  /**
   * nextRange
   * Returns a deterministic float from min through max.
   *
   * @param min - Inclusive lower bound.
   * @param max - Inclusive upper bound.
   * @returns Pseudo-random float in [min, max].
   * @throws If bounds are not finite numbers or if max < min.
   */
  public nextRange(min: number, max: number): number {
    assertFiniteNumber(min, 'min')
    assertFiniteNumber(max, 'max')

    if (max < min) {
      throw new Error('nextRange max must be greater than or equal to min.')
    }

    return min + this.nextFloat() * (max - min)
  }

  /**
   * chance
   * Returns true with the given probability.
   *
   * @param probability - Probability in [0, 1].
   * @returns True with the specified probability, false otherwise.
   * @throws If probability is not finite or not within [0, 1].
   */
  public chance(probability: number): boolean {
    assertFiniteNumber(probability, 'probability')

    if (probability < 0 || probability > 1) {
      throw new Error('Probability must be between 0 and 1 inclusive.')
    }

    return this.nextFloat() < probability
  }

  /**
   * pick
   * Picks a single value from a non-empty collection.
   *
   * @param values - Array of candidate values.
   * @returns One of the supplied values.
   * @throws If values is empty.
   */
  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('Cannot pick from an empty collection.')
    }

    return values[this.nextInt(0, values.length - 1)]
  }

  /**
   * weightedPick
   * Picks a value from a set of weighted choices.
   *
   * @param choices - Weighted candidate values.
   * @returns One of the supplied values, selected proportionally to its weight.
   * @throws If choices is empty or all weights are zero/invalid.
   */
  public weightedPick<T>(choices: readonly WeightedChoice<T>[]): T {
    if (choices.length === 0) {
      throw new Error(
        'Cannot perform a weighted pick from an empty collection.',
      )
    }

    let totalWeight = 0

    for (const choice of choices) {
      assertFiniteNumber(choice.weight, 'weight')

      if (choice.weight < 0) {
        throw new Error('Weighted-choice weights must not be negative.')
      }

      totalWeight += choice.weight
    }

    if (!(totalWeight > 0)) {
      throw new Error(
        'At least one weighted-choice weight must be greater than zero.',
      )
    }

    let cursor = this.nextRange(0, totalWeight)

    // Walk the choices until the cursor falls inside a bucket.
    for (const choice of choices) {
      cursor -= choice.weight

      if (cursor < 0) {
        return choice.value
      }
    }

    // Fallback for potential floating-point drift: return the last choice.
    return choices[choices.length - 1].value
  }

  /**
   * shuffle
   * Fisher–Yates shuffle that never mutates the supplied collection.
   *
   * @param values - Collection to shuffle.
   * @returns New array containing the shuffled elements.
   */
  public shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values]

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.nextInt(0, index)
      ;[shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ]
    }

    return shuffled
  }

  /**
   * fork
   * Produces a deterministic child stream without consuming the parent stream.
   * The same parent seed and namespace always create the same child sequence.
   *
   * @param namespace - Namespace appended to the generator seed.
   * @returns New SeededRandom instance bound to the derived namespace.
   */
  public fork(namespace: SeedValue): SeededRandom {
    return new SeededRandom(`${this.seed}::${normalizeSeed(namespace)}`)
  }

  /**
   * skip
   * Advances the stream by an explicit number of calls.
   *
   * @param count - Non-negative integer number of values to skip.
   * @throws If count is not a non-negative integer.
   */
  public skip(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Skip count must be a non-negative integer.')
    }

    for (let index = 0; index < count; index += 1) {
      this.nextFloat()
    }
  }

  /**
   * snapshot
   * Captures the current generator state for later restoration.
   *
   * @returns A serializable snapshot of the internal PRNG state.
   */
  public snapshot(): SeededRandomSnapshot {
    return {
      algorithm: 'xmur3-sfc32-v1',
      seed: this.seed,
      state: [this.a, this.b, this.c, this.d],
      calls: this.callCount,
    }
  }

  /**
   * calls
   * Number of PRNG calls that produced a value from this instance.
   */
  public get calls(): number {
    return this.callCount
  }
}

/**
 * createSeededRandom
 * Convenience factory for creating a SeededRandom instance.
 *
 * @param seed - Seed value for the generator.
 * @returns New SeededRandom instance.
 */
export function createSeededRandom(seed: SeedValue): SeededRandom {
  return new SeededRandom(seed)
}
