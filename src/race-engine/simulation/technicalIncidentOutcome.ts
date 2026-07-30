/**
 * technicalIncidentOutcome.ts
 *
 * Pure deterministic technical-incident outcome and realistic time-loss model.
 *
 * Phase 8H.5A is intentionally isolated:
 * - the incident has already been selected;
 * - no active risk loop is called;
 * - equipment condition is evidence only and is not applied a second time;
 * - the authoritative preparation time-loss multiplier is applied exactly once;
 * - no equipment damage, wear, maintenance, database write, or production
 *   execution occurs.
 */

import {
  createCanonicalHashedValue,
} from './canonicalSerialization'

export type TechnicalIncidentType =
  | 'dropped_chain'
  | 'puncture'
  | 'wheel_damage'
  | 'drivetrain_failure'
  | 'bike_change'

export type TechnicalIncidentSeverity =
  | 'minor'
  | 'moderate'
  | 'serious'

export type TechnicalIncidentEquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

export interface TechnicalIncidentTimeLossRange {
  readonly minimumSeconds: number
  readonly maximumSeconds: number
}

export interface TechnicalIncidentSpecification {
  readonly technicalType:
    TechnicalIncidentType
  readonly displayName: string
  readonly affectedEquipmentCategories:
    readonly TechnicalIncidentEquipmentCategory[]
  readonly timeLossRanges:
    Readonly<
      Record<
        TechnicalIncidentSeverity,
        TechnicalIncidentTimeLossRange
      >
    >
}

export interface TechnicalIncidentOutcomeInput {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string
  readonly occurrenceIndex: number

  readonly riderId: string
  readonly sourceGroupId: string

  readonly raceSecond: number
  readonly sourceDistanceKm: number
  readonly sourceGapFromLeaderSeconds: number
  readonly sourceSpeedKmh: number

  readonly technicalType:
    TechnicalIncidentType
  readonly severity:
    TechnicalIncidentSeverity

  /**
   * Evidence from the authoritative equipment-condition resolver.
   *
   * Condition already affects pre-incident probability. It is deliberately not
   * applied again to technical time loss.
   */
  readonly equipmentConditionPercent:
    number

  /**
   * Final authoritative preparation modifier transported from
   * race_engine_get_stage_rider_preparation_modifiers_v2.
   */
  readonly mechanicalTimeLossMultiplier:
    number
}

export interface TechnicalIncidentOutcome {
  readonly incidentId: string
  readonly incidentIdentityHash: string
  readonly deterministicHash: string
  readonly deterministicRoll: number

  readonly timeLossModelVersion:
    'technical_incident_time_loss_v1'

  readonly technicalType:
    TechnicalIncidentType
  readonly severity:
    TechnicalIncidentSeverity

  readonly affectedEquipmentCategories:
    readonly TechnicalIncidentEquipmentCategory[]

  readonly equipmentConditionPercent:
    number
  readonly equipmentConditionAppliedToTimeLoss:
    false

  readonly minimumBaseTimeLossSeconds:
    number
  readonly maximumBaseTimeLossSeconds:
    number
  readonly baseTimeLossSeconds:
    number

  readonly mechanicalTimeLossMultiplier:
    number
  readonly responseSavingsSeconds:
    number
  readonly timeLossSeconds:
    number

  readonly sourceDistanceKm: number
  readonly targetDistanceKm: number
  readonly distanceLossKm: number

  readonly sourceGapFromLeaderSeconds:
    number
  readonly targetGapFromLeaderSeconds:
    number
}

export const TECHNICAL_INCIDENT_SPECIFICATIONS:
  Readonly<
    Record<
      TechnicalIncidentType,
      TechnicalIncidentSpecification
    >
  > = {
    dropped_chain: {
      technicalType:
        'dropped_chain',
      displayName:
        'Dropped chain',
      affectedEquipmentCategories: [
        'groupset',
      ],
      timeLossRanges: {
        minor: {
          minimumSeconds: 8,
          maximumSeconds: 18,
        },
        moderate: {
          minimumSeconds: 19,
          maximumSeconds: 35,
        },
        serious: {
          minimumSeconds: 36,
          maximumSeconds: 60,
        },
      },
    },

    puncture: {
      technicalType:
        'puncture',
      displayName:
        'Puncture',
      affectedEquipmentCategories: [
        'tires',
        'wheelset',
      ],
      timeLossRanges: {
        minor: {
          minimumSeconds: 20,
          maximumSeconds: 35,
        },
        moderate: {
          minimumSeconds: 36,
          maximumSeconds: 60,
        },
        serious: {
          minimumSeconds: 61,
          maximumSeconds: 95,
        },
      },
    },

    wheel_damage: {
      technicalType:
        'wheel_damage',
      displayName:
        'Wheel damage',
      affectedEquipmentCategories: [
        'wheelset',
      ],
      timeLossRanges: {
        minor: {
          minimumSeconds: 35,
          maximumSeconds: 55,
        },
        moderate: {
          minimumSeconds: 56,
          maximumSeconds: 90,
        },
        serious: {
          minimumSeconds: 91,
          maximumSeconds: 140,
        },
      },
    },

    drivetrain_failure: {
      technicalType:
        'drivetrain_failure',
      displayName:
        'Drivetrain failure',
      affectedEquipmentCategories: [
        'groupset',
      ],
      timeLossRanges: {
        minor: {
          minimumSeconds: 25,
          maximumSeconds: 50,
        },
        moderate: {
          minimumSeconds: 51,
          maximumSeconds: 95,
        },
        serious: {
          minimumSeconds: 96,
          maximumSeconds: 160,
        },
      },
    },

    bike_change: {
      technicalType:
        'bike_change',
      displayName:
        'Bike change',
      affectedEquipmentCategories: [
        'frame',
        'wheelset',
        'tires',
        'groupset',
      ],
      timeLossRanges: {
        minor: {
          minimumSeconds: 60,
          maximumSeconds: 90,
        },
        moderate: {
          minimumSeconds: 91,
          maximumSeconds: 140,
        },
        serious: {
          minimumSeconds: 141,
          maximumSeconds: 220,
        },
      },
    },
  }

function assertNonEmpty(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `calculateTechnicalIncidentOutcome: ${fieldName} must be a non-empty string.`,
    )
  }
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
      `calculateTechnicalIncidentOutcome: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
}

function roundValue(
  value: number,
  digits = 9,
): number {
  return Number(
    value.toFixed(digits),
  )
}

function probabilityRollFromHash(
  hash: string,
): number {
  const numerator =
    Number.parseInt(
      hash.slice(0, 13),
      16,
    )

  const denominator =
    0x10000000000000

  return roundValue(
    numerator /
      denominator,
    12,
  )
}

function integerFromRoll(
  minimum: number,
  maximum: number,
  roll: number,
): number {
  const optionCount =
    maximum -
    minimum +
    1

  return Math.min(
    maximum,
    minimum +
      Math.floor(
        roll *
          optionCount,
      ),
  )
}

/**
 * Calculate one deterministic technical-incident outcome.
 */
export function calculateTechnicalIncidentOutcome(
  input:
    TechnicalIncidentOutcomeInput,
): TechnicalIncidentOutcome {
  assertNonEmpty(
    input.raceId,
    'raceId',
  )
  assertNonEmpty(
    input.stageId,
    'stageId',
  )
  assertNonEmpty(
    input.seed,
    'seed',
  )
  assertNonEmpty(
    input.riderId,
    'riderId',
  )
  assertNonEmpty(
    input.sourceGroupId,
    'sourceGroupId',
  )

  if (
    !Number.isInteger(
      input.occurrenceIndex,
    ) ||
    input.occurrenceIndex < 0
  ) {
    throw new Error(
      'calculateTechnicalIncidentOutcome: occurrenceIndex must be a non-negative integer.',
    )
  }

  if (
    !Number.isInteger(
      input.raceSecond,
    ) ||
    input.raceSecond < 0
  ) {
    throw new Error(
      'calculateTechnicalIncidentOutcome: raceSecond must be a non-negative integer.',
    )
  }

  assertFiniteRange(
    input.sourceDistanceKm,
    0,
    1000,
    'sourceDistanceKm',
  )
  assertFiniteRange(
    input.sourceGapFromLeaderSeconds,
    0,
    1_000_000,
    'sourceGapFromLeaderSeconds',
  )
  assertFiniteRange(
    input.sourceSpeedKmh,
    0,
    200,
    'sourceSpeedKmh',
  )
  assertFiniteRange(
    input.equipmentConditionPercent,
    0,
    100,
    'equipmentConditionPercent',
  )
  assertFiniteRange(
    input.mechanicalTimeLossMultiplier,
    0.82,
    1,
    'mechanicalTimeLossMultiplier',
  )

  const specification =
    TECHNICAL_INCIDENT_SPECIFICATIONS[
      input.technicalType
    ]

  const range =
    specification
      .timeLossRanges[
        input.severity
      ]

  /**
   * The incident identity and base time-loss roll deliberately exclude:
   * - equipmentConditionPercent, because condition already affects risk;
   * - mechanicalTimeLossMultiplier, because preparation modifies response time
   *   after the same incident has occurred.
   */
  const identity =
    createCanonicalHashedValue({
      contract:
        'technical_incident_identity_v1',
      raceId:
        input.raceId,
      stageId:
        input.stageId,
      seed:
        input.seed,
      occurrenceIndex:
        input.occurrenceIndex,
      riderId:
        input.riderId,
      sourceGroupId:
        input.sourceGroupId,
      raceSecond:
        input.raceSecond,
      technicalType:
        input.technicalType,
      severity:
        input.severity,
    })

  const deterministicRoll =
    probabilityRollFromHash(
      identity.hash,
    )

  const baseTimeLossSeconds =
    integerFromRoll(
      range.minimumSeconds,
      range.maximumSeconds,
      deterministicRoll,
    )

  const timeLossSeconds =
    Math.max(
      1,
      Math.round(
        baseTimeLossSeconds *
          input
            .mechanicalTimeLossMultiplier,
      ),
    )

  const responseSavingsSeconds =
    baseTimeLossSeconds -
    timeLossSeconds

  const distanceLossKm =
    roundValue(
      input.sourceSpeedKmh *
        (
          timeLossSeconds /
          3600
        ),
    )

  const targetDistanceKm =
    roundValue(
      Math.max(
        0,
        input.sourceDistanceKm -
          distanceLossKm,
      ),
    )

  const targetGapFromLeaderSeconds =
    roundValue(
      input
        .sourceGapFromLeaderSeconds +
        timeLossSeconds,
    )

  const outcomeHash =
    createCanonicalHashedValue({
      contract:
        'technical_incident_outcome_v1',
      incidentIdentityHash:
        identity.hash,

      equipmentConditionPercent:
        input.equipmentConditionPercent,
      equipmentConditionAppliedToTimeLoss:
        false,

      mechanicalTimeLossMultiplier:
        input.mechanicalTimeLossMultiplier,

      baseTimeLossSeconds,
      responseSavingsSeconds,
      timeLossSeconds,

      sourceDistanceKm:
        input.sourceDistanceKm,
      targetDistanceKm,
      distanceLossKm,

      sourceGapFromLeaderSeconds:
        input.sourceGapFromLeaderSeconds,
      targetGapFromLeaderSeconds,
    })

  return {
    incidentId:
      [
        input.raceId,
        input.stageId,
        'technical_incident',
        identity.hash,
      ].join(':'),

    incidentIdentityHash:
      identity.hash,
    deterministicHash:
      outcomeHash.hash,
    deterministicRoll,

    timeLossModelVersion:
      'technical_incident_time_loss_v1',

    technicalType:
      input.technicalType,
    severity:
      input.severity,

    affectedEquipmentCategories:
      specification
        .affectedEquipmentCategories
        .slice(),

    equipmentConditionPercent:
      input.equipmentConditionPercent,
    equipmentConditionAppliedToTimeLoss:
      false,

    minimumBaseTimeLossSeconds:
      range.minimumSeconds,
    maximumBaseTimeLossSeconds:
      range.maximumSeconds,
    baseTimeLossSeconds,

    mechanicalTimeLossMultiplier:
      input
        .mechanicalTimeLossMultiplier,
    responseSavingsSeconds,
    timeLossSeconds,

    sourceDistanceKm:
      input.sourceDistanceKm,
    targetDistanceKm,
    distanceLossKm,

    sourceGapFromLeaderSeconds:
      input
        .sourceGapFromLeaderSeconds,
    targetGapFromLeaderSeconds,
  }
}
