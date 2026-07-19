/**
 * canonicalSerialization.ts
 *
 * Phase 2 canonical JSON serialization and deterministic hashing utilities
 * for the isolated TypeScript race engine.
 *
 * Goals:
 * - Provide a stable, portable canonical JSON representation.
 * - Provide a deterministic 64-bit hash over that representation.
 * - Stay dependency-free and environment-agnostic (browser, server, tests).
 *
 * Constraints:
 * - No Math.random, crypto, TextEncoder, Date, or timers.
 * - No mutation of caller-provided objects.
 */

/**
 * CanonicalJsonPrimitive
 * Valid primitive types in canonical JSON.
 */
export type CanonicalJsonPrimitive = string | number | boolean | null

/**
 * CanonicalJsonValue
 * Recursive union type describing the canonical JSON representation.
 */
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | Readonly<Record<string, CanonicalJsonValue>>

/**
 * isPlainObject
 * Checks whether a value is a plain object with prototype Object.prototype or null.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * canonicalizeInternal
 * Internal recursive implementation that tracks visited objects to detect cycles.
 *
 * @param value - input value to canonicalize
 * @param seen - set of active objects/arrays traversed to detect circular refs
 * @returns CanonicalJsonValue
 */
function canonicalizeInternal(
  value: unknown,
  seen: Set<object>,
): CanonicalJsonValue {
  // Handle null explicitly.
  if (value === null) {
    return null
  }

  const valueType = typeof value

  // Primitive handling.
  if (valueType === 'string' || valueType === 'boolean') {
    return value as CanonicalJsonPrimitive
  }

  if (valueType === 'number') {
    const num = value as number
    if (!Number.isFinite(num)) {
      throw new Error('Non-finite numbers are not allowed in canonical JSON')
    }
    return num
  }

  // Forbidden primitive-like types.
  if (
    valueType === 'undefined' ||
    valueType === 'function' ||
    valueType === 'symbol' ||
    valueType === 'bigint'
  ) {
    throw new Error(`Unsupported value type for canonical JSON: ${valueType}`)
  }

  // At this point, typeof value === 'object' and value is not null.
  // Handle special built-in objects that are not allowed.
  if (value instanceof Date) {
    throw new Error('Date instances are not allowed in canonical JSON')
  }

  if (value instanceof Map) {
    throw new Error('Map instances are not allowed in canonical JSON')
  }

  if (value instanceof Set) {
    throw new Error('Set instances are not allowed in canonical JSON')
  }

  // Arrays: preserve order and recursively canonicalize each element.
  if (Array.isArray(value)) {
    const arr = value as readonly unknown[]

    if (seen.has(arr)) {
      throw new Error('Circular reference detected during canonicalization')
    }

    seen.add(arr)

    try {
      const result: CanonicalJsonValue[] = []

      for (let i = 0; i < arr.length; i += 1) {
        const element = arr[i]

        if (typeof element === 'undefined') {
          throw new Error(
            'Undefined array elements are not allowed in canonical JSON',
          )
        }

        result.push(canonicalizeInternal(element, seen))
      }

      return result
    } finally {
      seen.delete(arr)
    }
  }

  // Only allow plain objects.
  if (!isPlainObject(value)) {
    throw new Error('Only plain objects are allowed in canonical JSON')
  }

  const obj = value as Record<string, unknown>

  // Circular reference detection and safe cleanup via try/finally.
  if (seen.has(obj)) {
    throw new Error('Circular reference detected during canonicalization')
  }

  seen.add(obj)

  try {
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b))
    const result: Record<string, CanonicalJsonValue> = {}

    for (const key of keys) {
      const propertyValue = obj[key]

      if (typeof propertyValue === 'undefined') {
        throw new Error(
          'Undefined object properties are not allowed in canonical JSON',
        )
      }

      result[key] = canonicalizeInternal(propertyValue, seen)
    }

    return result
  } finally {
    seen.delete(obj)
  }
}

/**
 * canonicalizeValue
 * Public entry point that converts an unknown value into a CanonicalJsonValue.
 *
 * Behavior:
 * - Preserves array order.
 * - Sorts object keys lexicographically.
 * - Rejects unsupported or unsafe types (undefined, functions, symbols, bigint, Date, Map, Set, etc.).
 * - Rejects circular references.
 * - Does not mutate input structures.
 *
 * @param value - the value to canonicalize
 * @returns CanonicalJsonValue
 */
export function canonicalizeValue(value: unknown): CanonicalJsonValue {
  return canonicalizeInternal(value, new Set())
}

/**
 * canonicalStringify
 * Returns the JSON.stringify representation of the canonicalized value.
 *
 * Note:
 * - No pretty-print spacing is used to keep output strictly canonical.
 *
 * @param value - value to canonicalize and stringify
 * @returns canonical JSON string
 */
export function canonicalStringify(value: unknown): string {
  const canonical = canonicalizeValue(value)
  return JSON.stringify(canonical)
}

/**
 * UTF-8 encoding helpers
 *
 * The deterministic hash operates on UTF-8 bytes. We implement a small,
 * dependency-free encoder instead of using TextEncoder so this stays
 * portable across environments.
 */

/**
 * encodeCodePointToUtf8
 * Encodes a single Unicode code point into UTF-8 bytes.
 *
 * @param codePoint - Unicode code point
 * @param out - array to push encoded bytes into
 */
function encodeCodePointToUtf8(codePoint: number, out: number[]): void {
  if (codePoint <= 0x7f) {
    out.push(codePoint)
  } else if (codePoint <= 0x7ff) {
    out.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
  } else if (codePoint <= 0xffff) {
    out.push(
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    )
  } else {
    out.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    )
  }
}

/**
 * utf8Encode
 * Encodes a JavaScript string into an array of UTF-8 bytes.
 *
 * - Supports ASCII, two-byte, three-byte, and four-byte sequences.
 * - Correctly handles surrogate pairs.
 * - Unpaired surrogates are encoded as the replacement character U+FFFD.
 *
 * @param input - input string
 * @returns array of bytes
 */
function utf8Encode(input: string): number[] {
  const bytes: number[] = []
  const replacementCharCode = 0xfffd

  let i = 0
  while (i < input.length) {
    const codeUnit = input.charCodeAt(i)

    // Fast path for ASCII.
    if (codeUnit <= 0x7f) {
      bytes.push(codeUnit)
      i += 1
      continue
    }

    // Surrogate pair handling.
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      // High surrogate.
      if (i + 1 < input.length) {
        const next = input.charCodeAt(i + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          // Valid surrogate pair.
          const high = codeUnit
          const low = next
          const codePoint =
            ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000
          encodeCodePointToUtf8(codePoint, bytes)
          i += 2
          continue
        }
      }

      // Unpaired high surrogate - use replacement character.
      encodeCodePointToUtf8(replacementCharCode, bytes)
      i += 1
      continue
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      // Unpaired low surrogate - replacement character.
      encodeCodePointToUtf8(replacementCharCode, bytes)
      i += 1
      continue
    }

    // All other BMP characters.
    encodeCodePointToUtf8(codeUnit, bytes)
    i += 1
  }

  return bytes
}

/**
 * 64-bit FNV-1a hashing constants (BigInt).
 *
 * These provide a simple, deterministic, dependency-free hash for canonical JSON.
 */
const FNV_OFFSET_BASIS_64 = 14695981039346656037n
const FNV_PRIME_64 = 1099511628211n
const UINT64_MASK = 0xffffffffffffffffn

/**
 * deterministicHashString
 * Computes a deterministic 64-bit FNV-1a hash of a UTF-8 string.
 *
 * - Operates on UTF-8 bytes from a local encoder (no TextEncoder).
 * - Returns a lowercase hexadecimal string padded to exactly 16 characters.
 *
 * @param input - input string
 * @returns 16-char lowercase hex hash
 */
export function deterministicHashString(input: string): string {
  const bytes = utf8Encode(input)
  let hash = FNV_OFFSET_BASIS_64

  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]
    hash ^= BigInt(byte)
    hash = (hash * FNV_PRIME_64) & UINT64_MASK
  }

  let hex = hash.toString(16)
  if (hex.length < 16) {
    hex = hex.padStart(16, '0')
  } else if (hex.length > 16) {
    // Safety clamp; in practice, masked 64-bit should never exceed 16 hex chars.
    hex = hex.slice(-16)
  }

  return hex.toLowerCase()
}

/**
 * deterministicHashValue
 * Hashes an arbitrary value by first canonicalizing it and then hashing
 * its canonical JSON string.
 *
 * @param value - value to hash
 * @returns 16-char lowercase hex hash
 */
export function deterministicHashValue(value: unknown): string {
  const canonicalJson = canonicalStringify(value)
  return deterministicHashString(canonicalJson)
}

/**
 * CanonicalHashedValue
 * Convenience structure bundling the canonical JSON string with its hash.
 */
export interface CanonicalHashedValue {
  readonly canonicalJson: string
  readonly hash: string
}

/**
 * createCanonicalHashedValue
 * Produces both the canonical JSON string and its deterministic hash
 * in a single pass of canonicalization and stringification.
 *
 * @param value - value to canonicalize and hash
 * @returns CanonicalHashedValue
 */
export function createCanonicalHashedValue(
  value: unknown,
): CanonicalHashedValue {
  const canonical = canonicalizeValue(value)
  const canonicalJson = JSON.stringify(canonical)
  const hash = deterministicHashString(canonicalJson)

  return {
    canonicalJson,
    hash,
  }
}
