/**
 * weatherPerformanceEffects.ts
 *
 * Pure deterministic weather-performance model.
 *
 * Phase 8G.4 defines and verifies weather multipliers only. It does not yet
 * alter the active road-race runner, group movement, rider energy, fatigue,
 * incidents, crashes, equipment, replay output, or production persistence.
 */

import type {
  StageWeatherInput,
} from '../domain/StageInput'

export type RainIntensity =
  | 'none'
  | 'drizzle'
  | 'rain'
  | 'heavy_rain'

export interface WeatherEffectContribution {
  readonly speedMultiplier: number
  readonly energyConsumptionMultiplier: number
  readonly staminaConsumptionMultiplier: number
  readonly fatigueGainMultiplier: number
  readonly incidentProbabilityMultiplier: number
}

export interface WeatherPerformanceEffects {
  readonly speedMultiplier: number
  readonly energyConsumptionMultiplier: number
  readonly staminaConsumptionMultiplier: number
  readonly fatigueGainMultiplier: number
  readonly incidentProbabilityMultiplier: number

  readonly rainIntensity:
    RainIntensity

  readonly windContribution:
    WeatherEffectContribution
  readonly temperatureContribution:
    WeatherEffectContribution
  readonly precipitationContribution:
    WeatherEffectContribution

  readonly reasons:
    readonly string[]
}

const NEUTRAL_CONTRIBUTION:
  WeatherEffectContribution = {
    speedMultiplier: 1,
    energyConsumptionMultiplier: 1,
    staminaConsumptionMultiplier: 1,
    fatigueGainMultiplier: 1,
    incidentProbabilityMultiplier: 1,
  }

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

function roundMultiplier(
  value: number,
): number {
  return Number(
    value.toFixed(6),
  )
}

function normalizeCondition(
  condition: string,
): string {
  return condition
    .trim()
    .toLowerCase()
    .replace(
      /[\s-]+/g,
      '_',
    )
}

function determineRainIntensity(
  weather: StageWeatherInput,
): RainIntensity {
  const condition =
    normalizeCondition(
      weather.condition,
    )

  if (
    condition.includes(
      'thunder',
    ) ||
    condition.includes(
      'storm',
    ) ||
    condition.includes(
      'heavy_rain',
    )
  ) {
    return 'heavy_rain'
  }

  if (
    condition.includes(
      'rain',
    ) ||
    condition.includes(
      'shower',
    )
  ) {
    return 'rain'
  }

  if (
    condition.includes(
      'drizzle',
    )
  ) {
    return 'drizzle'
  }

  const precipitation =
    weather.precipitationMm ??
    0

  if (precipitation > 10) {
    return 'heavy_rain'
  }

  if (precipitation > 2) {
    return 'rain'
  }

  if (precipitation > 0) {
    return 'drizzle'
  }

  return 'none'
}

function calculateWindContribution(
  windSpeedKmh: number | null,
): WeatherEffectContribution {
  const wind =
    Math.max(
      0,
      windSpeedKmh ?? 0,
    )

  if (wind <= 15) {
    return NEUTRAL_CONTRIBUTION
  }

  const excessWind =
    Math.min(
      35,
      wind - 15,
    )

  return {
    speedMultiplier:
      roundMultiplier(
        clamp(
          1 -
            excessWind *
              0.003,
          0.895,
          1,
        ),
      ),
    energyConsumptionMultiplier:
      roundMultiplier(
        clamp(
          1 +
            excessWind *
              0.006,
          1,
          1.21,
        ),
      ),
    staminaConsumptionMultiplier:
      roundMultiplier(
        clamp(
          1 +
            excessWind *
              0.006,
          1,
          1.21,
        ),
      ),
    fatigueGainMultiplier: 1,
    incidentProbabilityMultiplier:
      roundMultiplier(
        clamp(
          1 +
            excessWind *
              0.015,
          1,
          1.525,
        ),
      ),
  }
}

function calculateTemperatureContribution(
  averageTemperatureC:
    number | null,
): WeatherEffectContribution {
  if (
    averageTemperatureC ===
    null
  ) {
    return NEUTRAL_CONTRIBUTION
  }

  if (
    averageTemperatureC >
    30
  ) {
    const heatDegrees =
      Math.min(
        15,
        averageTemperatureC -
          30,
      )

    return {
      speedMultiplier:
        roundMultiplier(
          clamp(
            1 -
              heatDegrees *
                0.002,
            0.97,
            1,
          ),
        ),
      energyConsumptionMultiplier:
        roundMultiplier(
          clamp(
            1 +
              heatDegrees *
                0.02,
            1,
            1.3,
          ),
        ),
      staminaConsumptionMultiplier:
        roundMultiplier(
          clamp(
            1 +
              heatDegrees *
                0.02,
            1,
            1.3,
          ),
        ),
      fatigueGainMultiplier:
        roundMultiplier(
          clamp(
            1 +
              heatDegrees *
                0.03,
            1,
            1.45,
          ),
        ),
      incidentProbabilityMultiplier:
        roundMultiplier(
          clamp(
            1 +
              heatDegrees *
                0.01,
            1,
            1.15,
          ),
        ),
    }
  }

  if (
    averageTemperatureC <
    10
  ) {
    const coldDegrees =
      Math.min(
        20,
        10 -
          averageTemperatureC,
      )

    return {
      speedMultiplier:
        roundMultiplier(
          clamp(
            1 -
              coldDegrees *
                0.0015,
            0.97,
            1,
          ),
        ),
      energyConsumptionMultiplier:
        roundMultiplier(
          clamp(
            1 +
              coldDegrees *
                0.01,
            1,
            1.2,
          ),
        ),
      staminaConsumptionMultiplier:
        roundMultiplier(
          clamp(
            1 +
              coldDegrees *
                0.01,
            1,
            1.2,
          ),
        ),
      fatigueGainMultiplier:
        roundMultiplier(
          clamp(
            1 +
              coldDegrees *
                0.005,
            1,
            1.1,
          ),
        ),
      incidentProbabilityMultiplier:
        roundMultiplier(
          clamp(
            1 +
              coldDegrees *
                0.005,
            1,
            1.1,
          ),
        ),
    }
  }

  return NEUTRAL_CONTRIBUTION
}

function calculatePrecipitationContribution(
  intensity:
    RainIntensity,
): WeatherEffectContribution {
  switch (intensity) {
    case 'drizzle':
      return {
        speedMultiplier: 0.99,
        energyConsumptionMultiplier: 1.02,
        staminaConsumptionMultiplier: 1.02,
        fatigueGainMultiplier: 1.01,
        incidentProbabilityMultiplier: 1.1,
      }

    case 'rain':
      return {
        speedMultiplier: 0.97,
        energyConsumptionMultiplier: 1.05,
        staminaConsumptionMultiplier: 1.05,
        fatigueGainMultiplier: 1.03,
        incidentProbabilityMultiplier: 1.25,
      }

    case 'heavy_rain':
      return {
        speedMultiplier: 0.94,
        energyConsumptionMultiplier: 1.09,
        staminaConsumptionMultiplier: 1.09,
        fatigueGainMultiplier: 1.06,
        incidentProbabilityMultiplier: 1.5,
      }

    case 'none':
    default:
      return NEUTRAL_CONTRIBUTION
  }
}

function multiplyContributions(
  wind:
    WeatherEffectContribution,
  temperature:
    WeatherEffectContribution,
  precipitation:
    WeatherEffectContribution,
): WeatherEffectContribution {
  return {
    speedMultiplier:
      roundMultiplier(
        clamp(
          wind.speedMultiplier *
            temperature
              .speedMultiplier *
            precipitation
              .speedMultiplier,
          0.75,
          1,
        ),
      ),
    energyConsumptionMultiplier:
      roundMultiplier(
        clamp(
          wind
            .energyConsumptionMultiplier *
            temperature
              .energyConsumptionMultiplier *
            precipitation
              .energyConsumptionMultiplier,
          1,
          1.75,
        ),
      ),
    staminaConsumptionMultiplier:
      roundMultiplier(
        clamp(
          wind
            .staminaConsumptionMultiplier *
            temperature
              .staminaConsumptionMultiplier *
            precipitation
              .staminaConsumptionMultiplier,
          1,
          1.75,
        ),
      ),
    fatigueGainMultiplier:
      roundMultiplier(
        clamp(
          wind
            .fatigueGainMultiplier *
            temperature
              .fatigueGainMultiplier *
            precipitation
              .fatigueGainMultiplier,
          1,
          2,
        ),
      ),
    incidentProbabilityMultiplier:
      roundMultiplier(
        clamp(
          wind
            .incidentProbabilityMultiplier *
            temperature
              .incidentProbabilityMultiplier *
            precipitation
              .incidentProbabilityMultiplier,
          1,
          4,
        ),
      ),
  }
}

function createReasons(
  weather: StageWeatherInput,
  intensity:
    RainIntensity,
): readonly string[] {
  const reasons:
    string[] = []

  if (
    (
      weather.windSpeedKmh ??
      0
    ) >
    15
  ) {
    reasons.push(
      'strong_wind',
    )
  }

  if (
    weather.averageTemperatureC !==
      null &&
    weather.averageTemperatureC >
      30
  ) {
    reasons.push(
      'heat_above_30c',
    )
  }

  if (
    weather.averageTemperatureC !==
      null &&
    weather.averageTemperatureC <
      10
  ) {
    reasons.push(
      'cold_below_10c',
    )
  }

  if (intensity !== 'none') {
    reasons.push(
      intensity,
    )
  }

  return reasons
}

/**
 * Calculates deterministic weather multipliers.
 *
 * Missing weather returns the exact neutral identity model.
 */
export function calculateWeatherPerformanceEffects(
  weather:
    StageWeatherInput | undefined,
): WeatherPerformanceEffects {
  if (!weather) {
    return {
      ...NEUTRAL_CONTRIBUTION,
      rainIntensity:
        'none',
      windContribution:
        NEUTRAL_CONTRIBUTION,
      temperatureContribution:
        NEUTRAL_CONTRIBUTION,
      precipitationContribution:
        NEUTRAL_CONTRIBUTION,
      reasons: [],
    }
  }

  const rainIntensity =
    determineRainIntensity(
      weather,
    )

  const windContribution =
    calculateWindContribution(
      weather.windSpeedKmh,
    )

  const temperatureContribution =
    calculateTemperatureContribution(
      weather
        .averageTemperatureC,
    )

  const precipitationContribution =
    calculatePrecipitationContribution(
      rainIntensity,
    )

  const combined =
    multiplyContributions(
      windContribution,
      temperatureContribution,
      precipitationContribution,
    )

  return {
    ...combined,
    rainIntensity,
    windContribution,
    temperatureContribution,
    precipitationContribution,
    reasons:
      createReasons(
        weather,
        rainIntensity,
      ),
  }
}
