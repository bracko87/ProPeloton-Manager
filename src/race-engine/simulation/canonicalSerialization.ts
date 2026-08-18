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
 * - Hash large canonical strings without allocating a second byte array.
 *
 * Constraints:
 * - No Math.random, crypto, TextEncoder, Date, or timers.
 * - No mutation of caller-provided objects.
 */

/**
 * CanonicalJsonPrimitive
 * Valid primitive types in canonical JSON.
 */
export type CanonicalJsonPrimitive =
  | string
  | number
  | boolean
  | null

/**
 * CanonicalJsonValue
 * Recursive union type describing the canonical JSON representation.
 */
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | Readonly<
      Record<
        string,
        CanonicalJsonValue
      >
    >

/**
 * isPlainObject
 * Checks whether a value is a plain object with prototype Object.prototype
 * or null.
 */
function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return false
  }

  const prototype =
    Object.getPrototypeOf(value)

  return (
    prototype ===
      Object.prototype ||
    prototype === null
  )
}

/**
 * canonicalizeInternal
 * Internal recursive implementation that tracks visited objects to detect
 * cycles.
 *
 * @param value - input value to canonicalize
 * @param seen - active objects/arrays currently being traversed
 * @returns CanonicalJsonValue
 */
function canonicalizeInternal(
  value: unknown,
  seen: Set<object>,
): CanonicalJsonValue {
  if (value === null) {
    return null
  }

  const valueType =
    typeof value

  if (
    valueType === 'string' ||
    valueType === 'boolean'
  ) {
    return value as
      CanonicalJsonPrimitive
  }

  if (valueType === 'number') {
    const numericValue =
      value as number

    if (
      !Number.isFinite(
        numericValue,
      )
    ) {
      throw new Error(
        'Non-finite numbers are not allowed in canonical JSON',
      )
    }

    return numericValue
  }

  if (
    valueType === 'undefined' ||
    valueType === 'function' ||
    valueType === 'symbol' ||
    valueType === 'bigint'
  ) {
    throw new Error(
      `Unsupported value type for canonical JSON: ${valueType}`,
    )
  }

  if (value instanceof Date) {
    throw new Error(
      'Date instances are not allowed in canonical JSON',
    )
  }

  if (value instanceof Map) {
    throw new Error(
      'Map instances are not allowed in canonical JSON',
    )
  }

  if (value instanceof Set) {
    throw new Error(
      'Set instances are not allowed in canonical JSON',
    )
  }

  if (Array.isArray(value)) {
    const array =
      value as readonly unknown[]

    if (seen.has(array)) {
      throw new Error(
        'Circular reference detected during canonicalization',
      )
    }

    seen.add(array)

    try {
      const result:
        CanonicalJsonValue[] = []

      for (
        let index = 0;
        index < array.length;
        index += 1
      ) {
        const element =
          array[index]

        if (
          typeof element ===
          'undefined'
        ) {
          throw new Error(
            'Undefined array elements are not allowed in canonical JSON',
          )
        }

        result.push(
          canonicalizeInternal(
            element,
            seen,
          ),
        )
      }

      return result
    } finally {
      seen.delete(array)
    }
  }

  if (!isPlainObject(value)) {
    throw new Error(
      'Only plain objects are allowed in canonical JSON',
    )
  }

  const object =
    value as Record<
      string,
      unknown
    >

  if (seen.has(object)) {
    throw new Error(
      'Circular reference detected during canonicalization',
    )
  }

  seen.add(object)

  try {
    const keys =
      Object.keys(object)
        .sort(
          (left, right) =>
            left.localeCompare(
              right,
            ),
        )

    const result:
      Record<
        string,
        CanonicalJsonValue
      > = {}

    for (const key of keys) {
      const propertyValue =
        object[key]

      if (
        typeof propertyValue ===
        'undefined'
      ) {
        throw new Error(
          'Undefined object properties are not allowed in canonical JSON',
        )
      }

      result[key] =
        canonicalizeInternal(
          propertyValue,
          seen,
        )
    }

    return result
  } finally {
    seen.delete(object)
  }
}

/**
 * canonicalizeValue
 * Public entry point that converts an unknown value into a
 * CanonicalJsonValue.
 *
 * Behaviour:
 * - Preserves array order.
 * - Sorts object keys lexicographically.
 * - Rejects unsupported or unsafe types.
 * - Rejects circular references.
 * - Does not mutate input structures.
 */
export function canonicalizeValue(
  value: unknown,
): CanonicalJsonValue {
  return canonicalizeInternal(
    value,
    new Set(),
  )
}

/**
 * canonicalStringify
 * Returns the JSON.stringify representation of the canonicalized value.
 *
 * No pretty-print spacing is used.
 */
export function canonicalStringify(
  value: unknown,
): string {
  const canonical =
    canonicalizeValue(value)

  return JSON.stringify(
    canonical,
  )
}

/**
 * 64-bit FNV-1a hashing constants.
 */
const FNV_OFFSET_BASIS_64 =
  14695981039346656037n

const FNV_PRIME_64 =
  1099511628211n

const UINT64_MASK =
  0xffffffffffffffffn

const REPLACEMENT_CHARACTER_CODE_POINT =
  0xfffd

/**
 * hashByte
 * Applies one byte to the active FNV-1a hash.
 */
function hashByte(
  currentHash: bigint,
  byte: number,
): bigint {
  const withByte =
    currentHash ^
    BigInt(byte)

  return (
    withByte *
    FNV_PRIME_64
  ) & UINT64_MASK
}

/**
 * hashCodePointAsUtf8
 * Applies one Unicode code point to the active hash using the same UTF-8 byte
 * representation previously produced by utf8Encode().
 *
 * Returning the updated hash avoids creating a potentially huge number[] for
 * the complete canonical string.
 */
function hashCodePointAsUtf8(
  currentHash: bigint,
  codePoint: number,
): bigint {
  let hash =
    currentHash

  if (codePoint <= 0x7f) {
    return hashByte(
      hash,
      codePoint,
    )
  }

  if (codePoint <= 0x7ff) {
    hash =
      hashByte(
        hash,
        0xc0 |
          (codePoint >> 6),
      )

    return hashByte(
      hash,
      0x80 |
        (codePoint & 0x3f),
    )
  }

  if (codePoint <= 0xffff) {
    hash =
      hashByte(
        hash,
        0xe0 |
          (codePoint >> 12),
      )

    hash =
      hashByte(
        hash,
        0x80 |
          (
            (
              codePoint >>
              6
            ) &
            0x3f
          ),
      )

    return hashByte(
      hash,
      0x80 |
        (codePoint & 0x3f),
    )
  }

  hash =
    hashByte(
      hash,
      0xf0 |
        (codePoint >> 18),
    )

  hash =
    hashByte(
      hash,
      0x80 |
        (
          (
            codePoint >>
            12
          ) &
          0x3f
        ),
    )

  hash =
    hashByte(
      hash,
      0x80 |
        (
          (
            codePoint >>
            6
          ) &
          0x3f
        ),
    )

  return hashByte(
    hash,
    0x80 |
      (codePoint & 0x3f),
  )
}

/**
 * deterministicHashString
 * Computes a deterministic 64-bit FNV-1a hash of a UTF-8 string.
 *
 * Important:
 * - UTF-8 bytes are hashed incrementally.
 * - No byte array proportional to input length is allocated.
 * - Valid surrogate pairs are encoded as four-byte UTF-8 sequences.
 * - Unpaired surrogates use U+FFFD, matching the previous implementation.
 * - Existing hashes remain unchanged because the byte sequence and FNV-1a
 *   operations are identical.
 */
export function deterministicHashString(
  input: string,
): string {
  let hash =
    FNV_OFFSET_BASIS_64

  let index = 0

  while (
    index <
    input.length
  ) {
    const codeUnit =
      input.charCodeAt(
        index,
      )

    if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff
    ) {
      if (
        index + 1 <
        input.length
      ) {
        const nextCodeUnit =
          input.charCodeAt(
            index + 1,
          )

        if (
          nextCodeUnit >=
            0xdc00 &&
          nextCodeUnit <=
            0xdfff
        ) {
          const codePoint =
            (
              (
                codeUnit -
                0xd800
              ) <<
              10
            ) +
            (
              nextCodeUnit -
              0xdc00
            ) +
            0x10000

          hash =
            hashCodePointAsUtf8(
              hash,
              codePoint,
            )

          index += 2
          continue
        }
      }

      hash =
        hashCodePointAsUtf8(
          hash,
          REPLACEMENT_CHARACTER_CODE_POINT,
        )

      index += 1
      continue
    }

    if (
      codeUnit >= 0xdc00 &&
      codeUnit <= 0xdfff
    ) {
      hash =
        hashCodePointAsUtf8(
          hash,
          REPLACEMENT_CHARACTER_CODE_POINT,
        )

      index += 1
      continue
    }

    hash =
      hashCodePointAsUtf8(
        hash,
        codeUnit,
      )

    index += 1
  }

  let hexadecimal =
    hash.toString(16)

  if (
    hexadecimal.length <
    16
  ) {
    hexadecimal =
      hexadecimal.padStart(
        16,
        '0',
      )
  } else if (
    hexadecimal.length >
    16
  ) {
    hexadecimal =
      hexadecimal.slice(-16)
  }

  return hexadecimal
    .toLowerCase()
}

/**
 * deterministicHashValue
 * Hashes an arbitrary value by first canonicalizing it and then hashing its
 * canonical JSON string.
 */
export function deterministicHashValue(
  value: unknown,
): string {
  const canonicalJson =
    canonicalStringify(value)

  return deterministicHashString(
    canonicalJson,
  )
}

/**
 * CanonicalHashedValue
 * Convenience structure bundling canonical JSON with its deterministic hash.
 */
export interface CanonicalHashedValue {
  readonly canonicalJson: string
  readonly hash: string
}

/**
 * createCanonicalHashedValue
 * Produces both the canonical JSON string and deterministic hash in a single
 * canonicalization/stringification pass.
 */
export function createCanonicalHashedValue(
  value: unknown,
): CanonicalHashedValue {
  const canonical =
    canonicalizeValue(value)

  const canonicalJson =
    JSON.stringify(canonical)

  const hash =
    deterministicHashString(
      canonicalJson,
    )

  return {
    canonicalJson,
    hash,
  }
}
