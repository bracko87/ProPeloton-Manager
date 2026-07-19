/**
 * seededRandom.test.ts
 * Unit tests for the deterministic SeededRandom generator used by the race engine.
 */

import { describe, expect, it } from 'vitest'

import {
  SeededRandom,
  createSeededRandom,
  type SeededRandomSnapshot,
} from '../../simulation/seededRandom'

/**
 * Collects a sample of floats from the generator.
 *
 * @param generator - Seeded random instance.
 * @param count - Number of values to sample.
 */
function sample(generator: SeededRandom, count: number): number[] {
  return Array.from({ length: count }, () => generator.nextFloat())
}

describe('SeededRandom', () => {
  it('reproduces the same sequence for the same seed', () => {
    const first = createSeededRandom('flat-stage-fixture-001')
    const second = createSeededRandom('flat-stage-fixture-001')

    expect(sample(first, 100)).toEqual(sample(second, 100))
  })

  it('produces a different sequence for a different seed', () => {
    const first = createSeededRandom('flat-stage-fixture-001')
    const second = createSeededRandom('flat-stage-fixture-002')

    expect(sample(first, 20)).not.toEqual(sample(second, 20))
  })

  it('restores an exact stream position from a snapshot', () => {
    const original = createSeededRandom('snapshot-fixture')
    sample(original, 37)

    const snapshot: SeededRandomSnapshot = original.snapshot()
    const restored = new SeededRandom(snapshot.seed, snapshot)

    expect(sample(restored, 50)).toEqual(sample(original, 50))
    expect(restored.calls).toBe(original.calls)
  })

  it('creates stable child streams without consuming the parent', () => {
    const parent = createSeededRandom('stage-001')
    const before = parent.snapshot()

    const attackStreamA = parent.fork('attacks')
    const attackStreamB = parent.fork('attacks')
    const sprintStream = parent.fork('sprint')

    expect(parent.snapshot()).toEqual(before)
    expect(sample(attackStreamA, 30)).toEqual(sample(attackStreamB, 30))
    expect(sample(parent.fork('attacks'), 10)).not.toEqual(
      sample(sprintStream, 10),
    )
  })

  it('keeps inclusive integers inside their requested bounds', () => {
    const generator = createSeededRandom('integer-bounds')

    for (let index = 0; index &lt; 5_000; index += 1) {
      const value = generator.nextInt(3, 7)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(7)
    }
  })

  it('performs deterministic non-mutating shuffles', () => {
    const source = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f'])
    const first = createSeededRandom('shuffle-fixture').shuffle(source)
    const second = createSeededRandom('shuffle-fixture').shuffle(source)

    expect(first).toEqual(second)
    expect(source).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect([...first].sort()).toEqual([...source].sort())
  })

  it('performs deterministic weighted choices', () => {
    const choices = [
      { value: 'attack', weight: 2 },
      { value: 'hold', weight: 5 },
      { value: 'chase', weight: 3 },
    ] as const

    const first = createSeededRandom('weighted-fixture')
    const second = createSeededRandom('weighted-fixture')

    const firstSequence = Array.from({ length: 100 }, () =>
      first.weightedPick(choices),
    )
    const secondSequence = Array.from({ length: 100 }, () =>
      second.weightedPick(choices),
    )

    expect(firstSequence).toEqual(secondSequence)
  })

  it('rejects invalid inputs instead of silently changing behavior', () => {
    const generator = createSeededRandom('validation-fixture')

    expect(() => generator.nextInt(5, 4)).toThrow()
    expect(() => generator.chance(-0.01)).toThrow()
    expect(() => generator.chance(1.01)).toThrow()
    expect(() => generator.pick([])).toThrow()
    expect(() => generator.weightedPick([])).toThrow()
    expect(() =>
      generator.weightedPick([{ value: 'invalid', weight: -1 }]),
    ).toThrow()
  })
})