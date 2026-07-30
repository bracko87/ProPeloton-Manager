/**
 * equipmentIncidentRisk.ts
 *
 * Pure authoritative technical-incident equipment multiplier.
 *
 * Exact persisted condition bands:
 *   [0, 25)   -> 1.50
 *   [25, 50)  -> 1.30
 *   [50, 75)  -> 1.15
 *   [75, 90)  -> 1.05
 *   [90, 100] -> 1.00
 *
 * Combined rule:
 * clamp(
 *   mechanicalIncidentRiskMultiplier *
 *   conditionIncidentProbabilityMultiplier,
 *   0.78,
 *   1.50
 * )
 */

export type EquipmentConditionIncidentBand =
  | 'condition_0_to_25'
  | 'condition_25_to_50'
  | 'condition_50_to_75'
  | 'condition_75_to_90'
  | 'condition_90_to_100'

export interface EquipmentIncidentRiskCalculation {
  readonly equipmentConditionPercent:
    number

  readonly conditionBand:
    EquipmentConditionIncidentBand

  readonly conditionIncidentProbabilityMultiplier:
    number

  readonly mechanicalIncidentRiskMultiplier:
    number

  readonly combinedProbabilityFloor:
    0.78

  readonly combinedProbabilityCeiling:
    1.5

  readonly combinedIncidentProbabilityMultiplier:
    number
}

export const EQUIPMENT_COMBINED_PROBABILITY_FLOOR =
  0.78 as const

export const EQUIPMENT_COMBINED_PROBABILITY_CEILING =
  1.5 as const

function roundValue(
  value: number,
  digits = 9,
): number {
  return Number(
    value.toFixed(digits),
  )
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
      `equipmentIncidentRisk: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
}

export function calculateEquipmentConditionIncidentMultiplier(
  equipmentConditionPercent:
    number,
): {
  readonly conditionBand:
    EquipmentConditionIncidentBand
  readonly multiplier:
    number
} {
  assertFiniteRange(
    equipmentConditionPercent,
    0,
    100,
    'equipmentConditionPercent',
  )

  if (
    equipmentConditionPercent <
    25
  ) {
    return {
      conditionBand:
        'condition_0_to_25',
      multiplier: 1.5,
    }
  }

  if (
    equipmentConditionPercent <
    50
  ) {
    return {
      conditionBand:
        'condition_25_to_50',
      multiplier: 1.3,
    }
  }

  if (
    equipmentConditionPercent <
    75
  ) {
    return {
      conditionBand:
        'condition_50_to_75',
      multiplier: 1.15,
    }
  }

  if (
    equipmentConditionPercent <
    90
  ) {
    return {
      conditionBand:
        'condition_75_to_90',
      multiplier: 1.05,
    }
  }

  return {
    conditionBand:
      'condition_90_to_100',
    multiplier: 1,
  }
}

export function calculateEquipmentIncidentRisk(
  equipmentConditionPercent:
    number,
  mechanicalIncidentRiskMultiplier:
    number,
): EquipmentIncidentRiskCalculation {
  assertFiniteRange(
    mechanicalIncidentRiskMultiplier,
    0.75,
    1,
    'mechanicalIncidentRiskMultiplier',
  )

  const condition =
    calculateEquipmentConditionIncidentMultiplier(
      equipmentConditionPercent,
    )

  return {
    equipmentConditionPercent,

    conditionBand:
      condition.conditionBand,

    conditionIncidentProbabilityMultiplier:
      condition.multiplier,

    mechanicalIncidentRiskMultiplier,

    combinedProbabilityFloor:
      EQUIPMENT_COMBINED_PROBABILITY_FLOOR,

    combinedProbabilityCeiling:
      EQUIPMENT_COMBINED_PROBABILITY_CEILING,

    combinedIncidentProbabilityMultiplier:
      roundValue(
        clamp(
          condition.multiplier *
            mechanicalIncidentRiskMultiplier,
          EQUIPMENT_COMBINED_PROBABILITY_FLOOR,
          EQUIPMENT_COMBINED_PROBABILITY_CEILING,
        ),
      ),
  }
}
