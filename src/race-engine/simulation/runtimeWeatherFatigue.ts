/**
 * runtimeWeatherFatigue.ts
 *
 * Pure deterministic calculation of in-stage fatigue caused by weather.
 *
 * Phase 8G.6 stores the result on RiderState.runtimeFatigue as metadata only.
 * The result does not alter movement, energy cost, separation, finishing,
 * incidents, persistence, or production execution.
 */

export interface RuntimeWeatherFatigueInput {
  readonly currentRuntimeFatigue:
    number
  readonly tickSeconds: number
  readonly fatigueGainMultiplier:
    number
  readonly resistance: number
  readonly recovery: number
}

export interface RuntimeWeatherFatigueResult {
  readonly previousRuntimeFatigue:
    number
  readonly fatigueGain: number
  readonly nextRuntimeFatigue:
    number

  readonly weatherExcessMultiplier:
    number
  readonly attributeProtectionMultiplier:
    number
}

const MAXIMUM_RUNTIME_FATIGUE =
  100

const BASE_HOURLY_WEATHER_FATIGUE =
  6

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value,
    ),
  )
}

function roundValue(
  value: number,
): number {
  return Number(
    value.toFixed(6),
  )
}

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `calculateRuntimeWeatherFatigue: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
}

/**
 * Calculates deterministic weather-only runtime fatigue for one rider/tick.
 *
 * Rules:
 * - multiplier 1 is the exact neutral identity;
 * - only the amount above 1 creates weather fatigue;
 * - resistance and recovery reduce accumulation;
 * - weaker resistance/recovery increase accumulation;
 * - result is rounded deterministically and bounded to 0..100.
 */
export function calculateRuntimeWeatherFatigue(
  input:
    RuntimeWeatherFatigueInput,
): RuntimeWeatherFatigueResult {
  assertFiniteRange(
    input.currentRuntimeFatigue,
    0,
    MAXIMUM_RUNTIME_FATIGUE,
    'currentRuntimeFatigue',
  )

  if (
    !Number.isInteger(
      input.tickSeconds,
    ) ||
    input.tickSeconds <= 0
  ) {
    throw new Error(
      'calculateRuntimeWeatherFatigue: tickSeconds must be a positive integer.',
    )
  }

  assertFiniteRange(
    input.fatigueGainMultiplier,
    1,
    2,
    'fatigueGainMultiplier',
  )

  assertFiniteRange(
    input.resistance,
    0,
    100,
    'resistance',
  )

  assertFiniteRange(
    input.recovery,
    0,
    100,
    'recovery',
  )

  const weatherExcessMultiplier =
    roundValue(
      Math.max(
        0,
        input.fatigueGainMultiplier -
          1,
      ),
    )

  if (
    weatherExcessMultiplier ===
      0 ||
    input.currentRuntimeFatigue >=
      MAXIMUM_RUNTIME_FATIGUE
  ) {
    return {
      previousRuntimeFatigue:
        input.currentRuntimeFatigue,
      fatigueGain: 0,
      nextRuntimeFatigue:
        input.currentRuntimeFatigue,
      weatherExcessMultiplier,
      attributeProtectionMultiplier:
        1,
    }
  }

  const averageProtectionAttribute =
    (
      input.resistance +
      input.recovery
    ) /
    2

  const attributeProtectionMultiplier =
    roundValue(
      clamp(
        1 -
          (
            (
              averageProtectionAttribute -
              50
            ) /
            50
          ) *
            0.2,
        0.8,
        1.2,
      ),
    )

  const unboundedFatigueGain =
    (
      input.tickSeconds /
      3600
    ) *
    BASE_HOURLY_WEATHER_FATIGUE *
    weatherExcessMultiplier *
    attributeProtectionMultiplier

  const nextRuntimeFatigue =
    roundValue(
      Math.min(
        MAXIMUM_RUNTIME_FATIGUE,
        input.currentRuntimeFatigue +
          unboundedFatigueGain,
      ),
    )

  return {
    previousRuntimeFatigue:
      input.currentRuntimeFatigue,
    fatigueGain:
      roundValue(
        nextRuntimeFatigue -
        input.currentRuntimeFatigue,
      ),
    nextRuntimeFatigue,
    weatherExcessMultiplier,
    attributeProtectionMultiplier,
  }
}
