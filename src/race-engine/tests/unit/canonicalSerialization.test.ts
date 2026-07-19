/**
 * canonicalSerialization.test.ts
 *
 * Unit tests for canonical JSON serialization and deterministic hashing.
 *
 * Notes:
 * - Uses Vitest-style syntax consistent with existing tests.
 * - This file defines expectations but may not be executed in this environment.
 */

import { describe, expect, it } from 'vitest'
import {
  canonicalStringify,
  canonicalizeValue,
  createCanonicalHashedValue,
  deterministicHashString,
} from '../../simulation/canonicalSerialization'

/**
 * Helper to assert that a function throws.
 * @param fn - function expected to throw
 */
function expectToThrow(fn: () => unknown): void {
  expect(fn).toThrow()
}

describe('canonicalSerialization - canonical JSON behavior', () => {
  it('sorts object keys so equivalent objects have identical canonical JSON and hashes', () => {
    const valueA = { z: 1, a: 2 }
    const valueB = { a: 2, z: 1 }

    const hashedA = createCanonicalHashedValue(valueA)
    const hashedB = createCanonicalHashedValue(valueB)

    expect(hashedA.canonicalJson).toBe(hashedB.canonicalJson)
    expect(hashedA.hash).toBe(hashedB.hash)
  })

  it('sorts nested object keys recursively', () => {
    const valueA = { outer: { z: 1, a: 2 } }
    const valueB = { outer: { a: 2, z: 1 } }

    const jsonA = canonicalStringify(valueA)
    const jsonB = canonicalStringify(valueB)

    expect(jsonA).toBe(jsonB)
  })

  it('preserves array order so differently ordered arrays differ', () => {
    const jsonA = canonicalStringify([1, 2])
    const jsonB = canonicalStringify([2, 1])

    expect(jsonA).not.toBe(jsonB)
  })
})

describe('canonicalSerialization - deterministic hashing', () => {
  it('produces identical hashes for the same value', () => {
    const value = { a: 1, b: [2, 3] }

    const hash1 = deterministicHashString(canonicalStringify(value))
    const hash2 = deterministicHashString(canonicalStringify(value))

    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for simple different values', () => {
    const hashA = deterministicHashString(canonicalStringify({ a: 1 }))
    const hashB = deterministicHashString(canonicalStringify({ a: 2 }))

    expect(hashA).not.toBe(hashB)
  })

  it('produces a 16-character lowercase hexadecimal hash for Unicode input', () => {
    const hash = deterministicHashString('hello 🌍')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('createCanonicalHashedValue uses deterministicHashString over canonicalJson', () => {
    const value = { x: 42, y: 'test' }
    const { canonicalJson, hash } = createCanonicalHashedValue(value)
    const expectedHash = deterministicHashString(canonicalJson)

    expect(hash).toBe(expectedHash)
  })
})

describe('canonicalSerialization - rejection of unsupported values', () => {
  it('rejects undefined values', () => {
    expectToThrow(() => canonicalizeValue(undefined))
    expectToThrow(() => canonicalizeValue({ a: undefined }))
    expectToThrow(() => canonicalizeValue([1, undefined]))
  })

  it('rejects non-finite numbers (NaN, Infinity, -Infinity)', () => {
    expectToThrow(() => canonicalizeValue(NaN))
    expectToThrow(() => canonicalizeValue(Infinity))
    expectToThrow(() => canonicalizeValue(-Infinity))
  })

  it('rejects circular references', () => {
    const obj: { self?: unknown } = {}
    obj.self = obj
    expectToThrow(() => canonicalizeValue(obj))
  })

  it('rejects BigInt', () => {
    expectToThrow(() => canonicalizeValue(1n))
  })

  it('rejects Map, Set, and Date instances', () => {
    expectToThrow(() => canonicalizeValue(new Map()))
    expectToThrow(() => canonicalizeValue(new Set()))
    expectToThrow(() => canonicalizeValue(new Date()))
  })
})
