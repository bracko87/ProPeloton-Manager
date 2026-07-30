/**
 * incidentRisk.ts
 *
 * Pure deterministic incident eligibility and probability model.
 *
 * Phase 8H.1 defines when and why an incident may occur. It does not mutate
 * SimulationState, create RaceEvent values, apply crashes, move riders, add
 * time loss, damage equipment, persist output, or activate production logic.
 */

import {
  createCanonicalHashedValue,
} from './canonicalSerialization'
import {
  calculateEquipmentIncidentRisk,
} from './equipmentIncidentRisk'

export type RaceIncidentKind =
  | 'individual_crash'
  | 'group_crash'
  | 'technical_incident'

export type RaceIncidentCause =
  | 'strong_wind'
  | 'wet_road'
  | 'extreme_heat'
  | 'high_speed'
  | 'descending'
  | 'dense_group'
  | 'runtime_fatigue'
  | 'low_rider_control'
  | 'poor_equipment_condition'

export type IncidentIneligibilityReason =
  | 'not_racing'
  | 'opening_neutral_zone'
  | 'finishing_neutral_zone'
  | 'incident_cooldown'
  | 'group_too_small'
  | 'equipment_condition_missing'

export interface IncidentRiskContribution {
  readonly multiplier: number
  readonly active: boolean
}

export interface RaceIncidentRiskInput {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string

  readonly incidentKind:
    RaceIncidentKind
  readonly occurrenceIndex: number

  readonly raceSecond: number
  readonly tickSeconds: number
  readonly stageDistanceKm: number
  readonly distanceKm: number

  readonly entityId: string
  readonly riderId: string | null
  readonly groupId: string | null
  readonly stageStatus: string

  readonly currentSpeedKmh: number
  readonly gradientPercent: number
  readonly groupSize: number

  readonly runtimeFatigue: number
  readonly resistance: number
  readonly raceIq: number

  readonly weatherIncidentProbabilityMultiplier:
    number
  readonly weatherReasons:
    readonly string[]

  /**
   * Required only by technical_incident.
   * Null deliberately keeps technical incidents ineligible until equipment
   * condition is transported into StageInput.
   */
  readonly equipmentCondition:
    number | null

  /**
   * Final preparation-derived multiplier from
   * race_engine_get_stage_rider_preparation_modifiers_v2.
   *
   * Optional so every existing individual/group caller preserves its exact
   * input shape. Technical risk defaults to neutral 1 when omitted.
   */
  readonly mechanicalIncidentRiskMultiplier?:
    number

  readonly incidentCooldownSecondsRemaining:
    number
}

export interface RaceIncidentRiskResult {
  readonly incidentKind:
    RaceIncidentKind
  readonly entityId: string

  readonly eligible: boolean
  readonly ineligibilityReasons:
    readonly IncidentIneligibilityReason[]

  readonly baseProbability: number
  readonly finalProbability: number
  readonly deterministicRoll: number
  readonly triggered: boolean

  readonly causes:
    readonly RaceIncidentCause[]

  readonly contributions: {
    readonly tickDuration:
      IncidentRiskContribution
    readonly weather:
      IncidentRiskContribution
    readonly speed:
      IncidentRiskContribution
    readonly descent:
      IncidentRiskContribution
    readonly groupDensity:
      IncidentRiskContribution
    readonly runtimeFatigue:
      IncidentRiskContribution
    readonly riderControl:
      IncidentRiskContribution
    readonly equipment:
      IncidentRiskContribution
  }

  readonly deterministicKeyHash:
    string
}

export interface DeterministicIncidentSelection {
  readonly selected:
    RaceIncidentRiskResult | null
  readonly triggeredCandidateCount:
    number
  readonly orderedTriggeredEntityIds:
    readonly string[]
}

const OPENING_NEUTRAL_SECONDS =
  60

const OPENING_NEUTRAL_DISTANCE_KM =
  1

const FINISHING_NEUTRAL_DISTANCE_KM =
  0.5

const MINIMUM_GROUP_CRASH_SIZE =
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
  digits = 9,
): number {
  return Number(
    value.toFixed(digits),
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
      `evaluateRaceIncidentRisk: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
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
      `evaluateRaceIncidentRisk: ${fieldName} must be a non-empty string.`,
    )
  }
}

function baseProbabilityForKind(
  kind: RaceIncidentKind,
): number {
  switch (kind) {
    case 'individual_crash':
      return 0.0004

    case 'group_crash':
      return 0.00008

    case 'technical_incident':
      return 0.00025
  }
}

function maximumProbabilityForKind(
  kind: RaceIncidentKind,
): number {
  switch (kind) {
    case 'individual_crash':
      return 0.08

    case 'group_crash':
      return 0.04

    case 'technical_incident':
      return 0.05
  }
}

function speedMultiplier(
  kind: RaceIncidentKind,
  speedKmh: number,
): number {
  const threshold =
    kind ===
      'group_crash'
      ? 35
      : 40

  if (speedKmh <= threshold) {
    return 1
  }

  return roundValue(
    clamp(
      1 +
        (
          speedKmh -
          threshold
        ) *
          0.04,
      1,
      3,
    ),
  )
}

function descentMultiplier(
  gradientPercent: number,
): number {
  if (gradientPercent >= 0) {
    return 1
  }

  return roundValue(
    clamp(
      1 +
        Math.abs(
          gradientPercent,
        ) *
          0.12,
      1,
      3.5,
    ),
  )
}

function groupDensityMultiplier(
  kind: RaceIncidentKind,
  groupSize: number,
): number {
  if (
    kind ===
    'technical_incident'
  ) {
    return 1
  }

  if (
    kind ===
    'individual_crash'
  ) {
    return roundValue(
      clamp(
        1 +
          Math.max(
            0,
            groupSize - 10,
          ) *
            0.03,
        1,
        2,
      ),
    )
  }

  return roundValue(
    clamp(
      1 +
        Math.max(
          0,
          groupSize -
            MINIMUM_GROUP_CRASH_SIZE,
        ) *
          0.08,
      1,
      5,
    ),
  )
}

function runtimeFatigueMultiplier(
  runtimeFatigue: number,
): number {
  return roundValue(
    1 +
      (
        runtimeFatigue /
        100
      ) *
        1.5,
  )
}

function riderControlMultiplier(
  resistance: number,
  raceIq: number,
): number {
  const averageControl =
    (
      resistance +
      raceIq
    ) /
    2

  return roundValue(
    clamp(
      1 -
        (
          (
            averageControl -
            50
          ) /
          50
        ) *
          0.4,
      0.6,
      1.4,
    ),
  )
}

function equipmentMultiplier(
  kind: RaceIncidentKind,
  equipmentCondition:
    number | null,
  mechanicalIncidentRiskMultiplier:
    number | undefined,
): number {
  if (
    kind !==
    'technical_incident'
  ) {
    return 1
  }

  if (
    equipmentCondition ===
    null
  ) {
    return 1
  }

  return calculateEquipmentIncidentRisk(
    equipmentCondition,
    mechanicalIncidentRiskMultiplier ??
      1,
  ).combinedIncidentProbabilityMultiplier
}

function probabilityRollFromHash(
  hash: string,
): number {
  const safeHex =
    hash.slice(
      0,
      13,
    )

  const numerator =
    Number.parseInt(
      safeHex,
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

function createIneligibilityReasons(
  input:
    RaceIncidentRiskInput,
): readonly IncidentIneligibilityReason[] {
  const reasons:
    IncidentIneligibilityReason[] =
      []

  if (
    input.stageStatus !==
    'racing'
  ) {
    reasons.push(
      'not_racing',
    )
  }

  if (
    input.raceSecond <
      OPENING_NEUTRAL_SECONDS ||
    input.distanceKm <
      OPENING_NEUTRAL_DISTANCE_KM
  ) {
    reasons.push(
      'opening_neutral_zone',
    )
  }

  if (
    (
      input.stageDistanceKm -
      input.distanceKm
    ) <=
    FINISHING_NEUTRAL_DISTANCE_KM
  ) {
    reasons.push(
      'finishing_neutral_zone',
    )
  }

  if (
    input
      .incidentCooldownSecondsRemaining >
    0
  ) {
    reasons.push(
      'incident_cooldown',
    )
  }

  if (
    input.incidentKind ===
      'group_crash' &&
    input.groupSize <
      MINIMUM_GROUP_CRASH_SIZE
  ) {
    reasons.push(
      'group_too_small',
    )
  }

  if (
    input.incidentKind ===
      'technical_incident' &&
    input.equipmentCondition ===
      null
  ) {
    reasons.push(
      'equipment_condition_missing',
    )
  }

  return reasons
}

function createCauses(
  input:
    RaceIncidentRiskInput,
  contributions:
    RaceIncidentRiskResult[
      'contributions'
    ],
): readonly RaceIncidentCause[] {
  const causes:
    RaceIncidentCause[] = []

  if (
    input.weatherReasons.includes(
      'strong_wind',
    )
  ) {
    causes.push(
      'strong_wind',
    )
  }

  if (
    input.weatherReasons.some(
      (reason) =>
        reason ===
          'drizzle' ||
        reason ===
          'rain' ||
        reason ===
          'heavy_rain',
    )
  ) {
    causes.push(
      'wet_road',
    )
  }

  if (
    input.weatherReasons.includes(
      'heat_above_30c',
    )
  ) {
    causes.push(
      'extreme_heat',
    )
  }

  if (
    contributions.speed.active
  ) {
    causes.push(
      'high_speed',
    )
  }

  if (
    contributions.descent.active
  ) {
    causes.push(
      'descending',
    )
  }

  if (
    contributions
      .groupDensity
      .multiplier >
    1.2
  ) {
    causes.push(
      'dense_group',
    )
  }

  if (
    input.runtimeFatigue >=
    30
  ) {
    causes.push(
      'runtime_fatigue',
    )
  }

  if (
    contributions
      .riderControl
      .multiplier >
    1.05
  ) {
    causes.push(
      'low_rider_control',
    )
  }

  if (
    input.incidentKind ===
      'technical_incident' &&
    input.equipmentCondition !==
      null &&
    input.equipmentCondition <
      90
  ) {
    causes.push(
      'poor_equipment_condition',
    )
  }

  return causes
}

function validateInput(
  input:
    RaceIncidentRiskInput,
): void {
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
    input.entityId,
    'entityId',
  )

  if (
    !Number.isInteger(
      input.occurrenceIndex,
    ) ||
    input.occurrenceIndex < 0
  ) {
    throw new Error(
      'evaluateRaceIncidentRisk: occurrenceIndex must be a non-negative integer.',
    )
  }

  if (
    !Number.isInteger(
      input.raceSecond,
    ) ||
    input.raceSecond < 0
  ) {
    throw new Error(
      'evaluateRaceIncidentRisk: raceSecond must be a non-negative integer.',
    )
  }

  if (
    !Number.isInteger(
      input.tickSeconds,
    ) ||
    input.tickSeconds <= 0
  ) {
    throw new Error(
      'evaluateRaceIncidentRisk: tickSeconds must be a positive integer.',
    )
  }

  assertFiniteRange(
    input.stageDistanceKm,
    0.001,
    1000,
    'stageDistanceKm',
  )
  assertFiniteRange(
    input.distanceKm,
    0,
    input.stageDistanceKm,
    'distanceKm',
  )
  assertFiniteRange(
    input.currentSpeedKmh,
    0,
    200,
    'currentSpeedKmh',
  )
  assertFiniteRange(
    input.gradientPercent,
    -40,
    40,
    'gradientPercent',
  )

  if (
    !Number.isInteger(
      input.groupSize,
    ) ||
    input.groupSize < 1 ||
    input.groupSize > 500
  ) {
    throw new Error(
      'evaluateRaceIncidentRisk: groupSize must be an integer between 1 and 500.',
    )
  }

  assertFiniteRange(
    input.runtimeFatigue,
    0,
    100,
    'runtimeFatigue',
  )
  assertFiniteRange(
    input.resistance,
    0,
    100,
    'resistance',
  )
  assertFiniteRange(
    input.raceIq,
    0,
    100,
    'raceIq',
  )
  assertFiniteRange(
    input
      .weatherIncidentProbabilityMultiplier,
    1,
    4,
    'weatherIncidentProbabilityMultiplier',
  )

  if (
    input.equipmentCondition !==
    null
  ) {
    assertFiniteRange(
      input.equipmentCondition,
      0,
      100,
      'equipmentCondition',
    )
  }

  if (
    input
      .mechanicalIncidentRiskMultiplier !==
    undefined
  ) {
    assertFiniteRange(
      input
        .mechanicalIncidentRiskMultiplier,
      0.75,
      1,
      'mechanicalIncidentRiskMultiplier',
    )
  }

  if (
    !Number.isInteger(
      input
        .incidentCooldownSecondsRemaining,
    ) ||
    input
      .incidentCooldownSecondsRemaining <
      0
  ) {
    throw new Error(
      'evaluateRaceIncidentRisk: incidentCooldownSecondsRemaining must be a non-negative integer.',
    )
  }
}

/**
 * Evaluates one incident candidate.
 */
export function evaluateRaceIncidentRisk(
  input:
    RaceIncidentRiskInput,
): RaceIncidentRiskResult {
  validateInput(input)

  const ineligibilityReasons =
    createIneligibilityReasons(
      input,
    )

  const eligible =
    ineligibilityReasons
      .length === 0

  const baseProbability =
    baseProbabilityForKind(
      input.incidentKind,
    )

  const tickDurationMultiplier =
    roundValue(
      input.tickSeconds /
      30,
    )

  const weatherMultiplier =
    input
      .weatherIncidentProbabilityMultiplier

  const resolvedSpeedMultiplier =
    speedMultiplier(
      input.incidentKind,
      input.currentSpeedKmh,
    )

  const resolvedDescentMultiplier =
    descentMultiplier(
      input.gradientPercent,
    )

  const resolvedGroupDensityMultiplier =
    groupDensityMultiplier(
      input.incidentKind,
      input.groupSize,
    )

  const resolvedRuntimeFatigueMultiplier =
    runtimeFatigueMultiplier(
      input.runtimeFatigue,
    )

  const resolvedRiderControlMultiplier =
    riderControlMultiplier(
      input.resistance,
      input.raceIq,
    )

  const resolvedEquipmentMultiplier =
    equipmentMultiplier(
      input.incidentKind,
      input.equipmentCondition,
      input
        .mechanicalIncidentRiskMultiplier,
    )

  const maximumProbability =
    maximumProbabilityForKind(
      input.incidentKind,
    )

  const finalProbability =
    eligible
      ? roundValue(
          clamp(
            baseProbability *
              tickDurationMultiplier *
              weatherMultiplier *
              resolvedSpeedMultiplier *
              resolvedDescentMultiplier *
              resolvedGroupDensityMultiplier *
              resolvedRuntimeFatigueMultiplier *
              resolvedRiderControlMultiplier *
              resolvedEquipmentMultiplier,
            0,
            maximumProbability,
          ),
          12,
        )
      : 0

  const deterministicKey =
    createCanonicalHashedValue({
      raceId:
        input.raceId,
      stageId:
        input.stageId,
      seed:
        input.seed,
      incidentKind:
        input.incidentKind,
      occurrenceIndex:
        input.occurrenceIndex,
      raceSecond:
        input.raceSecond,
      entityId:
        input.entityId,
      riderId:
        input.riderId,
      groupId:
        input.groupId,
    })

  const deterministicRoll =
    probabilityRollFromHash(
      deterministicKey.hash,
    )

  const contributions:
    RaceIncidentRiskResult[
      'contributions'
    ] = {
      tickDuration: {
        multiplier:
          tickDurationMultiplier,
        active:
          tickDurationMultiplier !==
          1,
      },
      weather: {
        multiplier:
          weatherMultiplier,
        active:
          weatherMultiplier >
          1,
      },
      speed: {
        multiplier:
          resolvedSpeedMultiplier,
        active:
          resolvedSpeedMultiplier >
          1,
      },
      descent: {
        multiplier:
          resolvedDescentMultiplier,
        active:
          resolvedDescentMultiplier >
          1,
      },
      groupDensity: {
        multiplier:
          resolvedGroupDensityMultiplier,
        active:
          resolvedGroupDensityMultiplier >
          1,
      },
      runtimeFatigue: {
        multiplier:
          resolvedRuntimeFatigueMultiplier,
        active:
          resolvedRuntimeFatigueMultiplier >
          1,
      },
      riderControl: {
        multiplier:
          resolvedRiderControlMultiplier,
        active:
          resolvedRiderControlMultiplier !==
          1,
      },
      equipment: {
        multiplier:
          resolvedEquipmentMultiplier,
        active:
          resolvedEquipmentMultiplier !==
          1,
      },
    }

  return {
    incidentKind:
      input.incidentKind,
    entityId:
      input.entityId,

    eligible,
    ineligibilityReasons,

    baseProbability,
    finalProbability,
    deterministicRoll,
    triggered:
      eligible &&
      deterministicRoll <
        finalProbability,

    causes:
      createCauses(
        input,
        contributions,
      ),

    contributions,

    deterministicKeyHash:
      deterministicKey.hash,
  }
}

/**
 * Selects at most one incident from already evaluated candidates.
 *
 * Selection order:
 * 1. triggered candidates only;
 * 2. lowest deterministic roll;
 * 3. incident kind;
 * 4. entity id.
 *
 * Input order therefore cannot change the selected candidate.
 */
export function selectDeterministicIncidentCandidate(
  candidates:
    readonly RaceIncidentRiskResult[],
): DeterministicIncidentSelection {
  const triggered =
    candidates
      .filter(
        (candidate) =>
          candidate.triggered,
      )
      .slice()
      .sort(
        (left, right) =>
          left.deterministicRoll -
            right.deterministicRoll ||
          left.incidentKind.localeCompare(
            right.incidentKind,
          ) ||
          left.entityId.localeCompare(
            right.entityId,
          ),
      )

  return {
    selected:
      triggered[0] ??
      null,
    triggeredCandidateCount:
      triggered.length,
    orderedTriggeredEntityIds:
      triggered.map(
        (candidate) =>
          candidate.entityId,
      ),
  }
}
