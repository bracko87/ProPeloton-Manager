/**
 * deterministicEngineMode.ts
 *
 * Pure feature-mode contract for the deterministic race engine.
 *
 * This module:
 * - performs no database access
 * - performs no environment-variable access
 * - starts no race runner
 * - performs no persistence
 * - defaults unknown values to disabled
 *
 * Runtime configuration should be read elsewhere and passed into
 * parseDeterministicRaceEngineMode().
 */

export const DETERMINISTIC_RACE_ENGINE_MODES = [
  'disabled',
  'shadow_read_only',
  'shadow_persist_non_authoritative',
  'authoritative',
] as const

export type DeterministicRaceEngineMode =
  typeof DETERMINISTIC_RACE_ENGINE_MODES[number]

export interface DeterministicEngineCapabilities {
  readonly mode:
    DeterministicRaceEngineMode

  readonly canRun:
    boolean

  readonly canPersist:
    boolean

  readonly canBecomeAuthoritative:
    boolean
}

/**
 * Safely parse an unknown configuration value.
 *
 * Missing, malformed, or unsupported values always resolve to disabled.
 */
export function parseDeterministicRaceEngineMode(
  value: unknown,
): DeterministicRaceEngineMode {
  if (
    typeof value !== 'string'
  ) {
    return 'disabled'
  }

  const normalizedValue =
    value
      .trim()
      .toLowerCase()

  switch (normalizedValue) {
    case 'disabled':
      return 'disabled'

    case 'shadow_read_only':
      return 'shadow_read_only'

    case 'shadow_persist_non_authoritative':
      return 'shadow_persist_non_authoritative'

    case 'authoritative':
      return 'authoritative'

    default:
      return 'disabled'
  }
}

/**
 * Whether the deterministic engine may execute at all.
 */
export function isDeterministicEngineEnabled(
  mode: DeterministicRaceEngineMode,
): boolean {
  return mode !== 'disabled'
}

/**
 * Whether a read-only shadow execution is permitted.
 */
export function canRunReadOnlyShadow(
  mode: DeterministicRaceEngineMode,
): boolean {
  return isDeterministicEngineEnabled(
    mode,
  )
}

/**
 * Whether deterministic output may be persisted.
 *
 * shadow_read_only must never persist output.
 */
export function canPersistShadowOutput(
  mode: DeterministicRaceEngineMode,
): boolean {
  return (
    mode ===
      'shadow_persist_non_authoritative' ||
    mode ===
      'authoritative'
  )
}

/**
 * Whether deterministic output may become authoritative.
 *
 * Only the explicit authoritative mode grants this capability.
 */
export function canDeterministicOutputBecomeAuthoritative(
  mode: DeterministicRaceEngineMode,
): boolean {
  return mode === 'authoritative'
}

/**
 * Resolve all capabilities for one validated mode.
 */
export function getDeterministicEngineCapabilities(
  mode: DeterministicRaceEngineMode,
): DeterministicEngineCapabilities {
  return {
    mode,

    canRun:
      isDeterministicEngineEnabled(
        mode,
      ),

    canPersist:
      canPersistShadowOutput(
        mode,
      ),

    canBecomeAuthoritative:
      canDeterministicOutputBecomeAuthoritative(
        mode,
      ),
  }
}

/**
 * Parse an unknown value and resolve its capabilities.
 *
 * Invalid values automatically produce disabled capabilities.
 */
export function resolveDeterministicEngineCapabilities(
  value: unknown,
): DeterministicEngineCapabilities {
  return getDeterministicEngineCapabilities(
    parseDeterministicRaceEngineMode(
      value,
    ),
  )
}
