/**
 * createStageInputFromSourceRows.ts
 *
 * Pure deterministic adapter that converts already-loaded database source
 * rows into the canonical StageInput contract.
 *
 * This module:
 * - performs no database calls
 * - performs no RPC calls
 * - performs no HTTP requests
 * - performs no writes
 * - uses no current date
 * - uses no randomness
 */

import type {
  StageFormat,
  StageInput,
  StageProfilePoint,
  StageRiderInput,
  StageRiderEquipmentInput,
  StageSimulationSettings,
  StageTeamInput,
  StageWeatherInput,
} from '../domain/StageInput'
import type {
  RiderAttributes,
  RiderRole,
  RiderStartingCondition,
} from '../domain/RiderState'

export interface RaceSourceRow {
  readonly id: string
  readonly name: string
}

export interface StageSourceRow {
  readonly id: string
  readonly race_id: string
  readonly name: string
  readonly stage_format: string
  readonly distance_km: number
}


export type JsonSourceObject =
  Readonly<Record<string, unknown>>

export interface StageWeatherSourceRows {
  readonly stageSnapshot?:
    JsonSourceObject | null
  readonly stageSummary?:
    string | null
  readonly profileSnapshot?:
    JsonSourceObject | null
  readonly profileSummary?:
    string | null
}

export interface ParticipantTeamSourceRow {
  readonly team_id: string
  readonly status: string
  readonly team_name_snapshot: string | null
}

export interface ParticipantRiderSourceRow {
  readonly rider_id: string
  readonly team_id: string
  readonly start_number: number | null
  readonly role_snapshot: string | null
}

export interface RiderSourceRow {
  readonly id: string

  readonly first_name: string | null
  readonly last_name: string | null
  readonly display_name: string | null

  readonly flat: number
  readonly climbing?: number
  readonly sprint: number
  readonly time_trial?: number
  readonly endurance: number
  readonly resistance: number
  readonly recovery: number
  readonly race_iq: number
  readonly teamwork: number

  readonly fatigue?: number | null
  readonly fatigue_before_stage?: number | null
  readonly start_stamina?: number | null
  readonly morale?: number | null
  readonly availability_status?: string | null
}

/**
 * Direct output shape from
 * race_engine_resolve_stage_rider_equipment_condition_v1.
 */
export interface RiderEquipmentConditionSourceRow {
  readonly rider_id: string
  readonly equipment_setup_id:
    string | null

  readonly selected_component_count:
    number
  readonly matched_component_count:
    number

  readonly complete_source:
    boolean

  readonly minimum_condition_percent:
    number | null
  readonly effective_condition_percent:
    number

  readonly missing_component_categories:
    readonly string[] | null
}

/**
 * Relevant output fields from
 * race_engine_get_stage_rider_preparation_modifiers_v2.
 */
export interface RiderPreparationModifierSourceRow {
  readonly rider_id: string

  readonly mechanical_incident_risk_multiplier:
    number
  readonly mechanical_time_loss_multiplier:
    number
}

export interface StagePlanMetadataSource {
  readonly default_race_captain_rider_id?: string | null
}

export interface StagePlanRiderPhaseCommandsSource {
  readonly phase_1?: string | null
  readonly phase_2?: string | null
  readonly phase_3?: string | null
  readonly phase_4?: string | null
}

export interface StagePlanSourceRow {
  readonly id: string
  readonly club_id: string | null
  readonly participating_club_id: string | null
  readonly status: string

  readonly metadata: StagePlanMetadataSource | null

  readonly rider_roles_json:
    | Readonly<Record<string, string>>
    | null

  readonly rider_phase_commands_json?:
    | Readonly<
        Record<
          string,
          StagePlanRiderPhaseCommandsSource
        >
      >
    | null
}

export interface ProfilePointSourceRow {
  readonly km: number
  readonly elevation_m?: number | null
  readonly elevation?: number | null
}

export interface CreateStageInputFromSourceRowsParams {
  readonly race: RaceSourceRow
  readonly stage: StageSourceRow

  readonly participantTeams:
    readonly ParticipantTeamSourceRow[]

  readonly participantRiders:
    readonly ParticipantRiderSourceRow[]

  readonly riders:
    readonly RiderSourceRow[]

  readonly stagePlans:
    readonly StagePlanSourceRow[]

  readonly profilePoints:
    readonly ProfilePointSourceRow[]

  readonly weather?:
    StageWeatherSourceRows

  /**
   * Both arrays are optional as one pair.
   *
   * When omitted, every historical fixture keeps its exact rider shape.
   * When supplied, both arrays must cover every executable rider exactly once.
   */
  readonly equipmentConditions?:
    readonly RiderEquipmentConditionSourceRow[]

  readonly preparationModifiers?:
    readonly RiderPreparationModifierSourceRow[]
}

const SETTINGS: StageSimulationSettings = {
  tickSeconds: 30,
  replaySnapshotIntervalSeconds: 30,
  maximumBreakawaySize: 8,
  minimumSpeedKmh: 36,
  maximumSpeedKmh: 60,
}

const SUPPORTED_STAGE_FORMATS:
  readonly StageFormat[] = [
    'road_race',
    'individual_time_trial',
    'team_time_trial',
    'pair_time_trial',
    'prologue',
  ]

const PARTICIPANT_ROLE_MAP:
  Readonly<Record<string, RiderRole>> = {
    Leader: 'captain',
    Sprinter: 'sprinter',
    Domestique: 'domestique',
    Breakaway: 'breakaway',

    'All-rounder': 'free_role',
    Climber: 'free_role',
    TT: 'free_role',
    selected: 'free_role',
  }

const STAGE_PLAN_ROLE_MAP:
  Readonly<Record<string, RiderRole>> = {
    team_leader_gc: 'captain',
    sprinter: 'sprinter',
    lead_out_rider: 'leadout',
    sprint_train_rider: 'leadout',
    helper_domestique: 'domestique',
    mountain_domestique: 'domestique',
    breakaway_rider: 'breakaway',

    free_role: 'free_role',
    protected_rider: 'free_role',
    breakaway_chaser: 'free_role',
    climber: 'free_role',
    rouleur: 'rouleur',
  }

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    )
  }

  return value.trim()
}

function requireFiniteNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${fieldName} must be a finite number.`,
    )
  }

  return value
}

function normalizeAttribute(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    requireFiniteNumber(
      value,
      fieldName,
    )

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(numericValue),
    ),
  )
}

function hasConditionSource(
  rider: RiderSourceRow,
): boolean {
  return (
    rider.fatigue !== undefined ||
    rider.fatigue_before_stage !== undefined ||
    rider.start_stamina !== undefined ||
    rider.morale !== undefined ||
    rider.availability_status !== undefined
  )
}

function normalizeConditionMetric(
  value: number | null | undefined,
  fallback: number,
  fieldName: string,
): number {
  const rawValue =
    value ?? fallback

  const numericValue =
    requireFiniteNumber(
      rawValue,
      fieldName,
    )

  return Math.max(
    0,
    Math.min(
      100,
      numericValue,
    ),
  )
}

function normalizeAvailabilityStatus(
  value: string | null | undefined,
): string {
  const normalized =
    value
      ?.trim()
      .toLowerCase()

  return normalized &&
    normalized.length > 0
    ? normalized
    : 'unknown'
}

function asSourceObject(
  value: unknown,
): JsonSourceObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as JsonSourceObject
    : {}
}

function optionalSourceString(
  value: unknown,
): string | null {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
    ? value.trim()
    : null
}

function optionalSourceNumber(
  value: unknown,
  fieldName: string,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const numericValue =
    typeof value === 'number'
      ? value
      : Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error(
      `${fieldName} must be a finite number when provided.`,
    )
  }

  return numericValue
}

function hasSourceKeys(
  value: JsonSourceObject,
): boolean {
  return Object.keys(value).length > 0
}

function createStageWeather(
  source:
    StageWeatherSourceRows | undefined,
): StageWeatherInput | null {
  if (!source) {
    return null
  }

  const stageSnapshot =
    asSourceObject(
      source.stageSnapshot,
    )

  const profileSnapshot =
    asSourceObject(
      source.profileSnapshot,
    )

  const useStageSnapshot =
    hasSourceKeys(
      stageSnapshot,
    )

  const useProfileSnapshot =
    !useStageSnapshot &&
    hasSourceKeys(
      profileSnapshot,
    )

  if (
    !useStageSnapshot &&
    !useProfileSnapshot
  ) {
    return null
  }

  const snapshot =
    useStageSnapshot
      ? stageSnapshot
      : profileSnapshot

  const authority =
    useStageSnapshot
      ? 'stage_weather_snapshot'
      : 'profile_weather_snapshot'

  const summary =
    useStageSnapshot
      ? optionalSourceString(
          source.stageSummary,
        )
      : optionalSourceString(
          source.profileSummary,
        )

  return {
    authority,
    source:
      optionalSourceString(
        snapshot.source,
      ) ??
      authority,
    condition:
      optionalSourceString(
        snapshot.condition,
      ) ??
      'unknown',
    summary,

    averageTemperatureC:
      optionalSourceNumber(
        snapshot.avg_temp_c,
        `${authority}.avg_temp_c`,
      ),
    minimumTemperatureC:
      optionalSourceNumber(
        snapshot.avg_min_temp_c,
        `${authority}.avg_min_temp_c`,
      ),
    maximumTemperatureC:
      optionalSourceNumber(
        snapshot.avg_max_temp_c,
        `${authority}.avg_max_temp_c`,
      ),
    windSpeedKmh:
      optionalSourceNumber(
        snapshot.avg_wind_kmh,
        `${authority}.avg_wind_kmh`,
      ),
    precipitationMm:
      optionalSourceNumber(
        snapshot.avg_precip_mm,
        `${authority}.avg_precip_mm`,
      ),

    hostCity:
      optionalSourceString(
        snapshot.host_city,
      ),
    countryCode:
      optionalSourceString(
        snapshot.country_code,
      ),
  }
}

function createStartingCondition(
  rider: RiderSourceRow,
): RiderStartingCondition | null {
  if (!hasConditionSource(rider)) {
    return null
  }

  return {
    startingEnergy:
      normalizeConditionMetric(
        rider.start_stamina,
        100,
        `rider ${rider.id} start_stamina`,
      ),
    fatigueBeforeStage:
      normalizeConditionMetric(
        rider.fatigue_before_stage ??
          rider.fatigue,
        0,
        `rider ${rider.id} fatigue_before_stage`,
      ),
    morale:
      normalizeConditionMetric(
        rider.morale,
        50,
        `rider ${rider.id} morale`,
      ),
    availabilityStatus:
      normalizeAvailabilityStatus(
        rider.availability_status,
      ),
  }
}

const EQUIPMENT_CATEGORIES =
  [
    'frame',
    'wheelset',
    'tires',
    'groupset',
    'helmet',
    'shoes',
  ] as const

function normalizeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fieldName: string,
): number {
  const numericValue =
    requireFiniteNumber(
      value,
      fieldName,
    )

  if (
    !Number.isInteger(
      numericValue,
    ) ||
    numericValue < minimum ||
    numericValue > maximum
  ) {
    throw new Error(
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    )
  }

  return numericValue
}

function normalizeBoundedMetric(
  value: unknown,
  minimum: number,
  maximum: number,
  fieldName: string,
): number {
  const numericValue =
    requireFiniteNumber(
      value,
      fieldName,
    )

  if (
    numericValue < minimum ||
    numericValue > maximum
  ) {
    throw new Error(
      `${fieldName} must be between ${minimum} and ${maximum}.`,
    )
  }

  return numericValue
}

function normalizeOptionalEquipmentCondition(
  value: number | null,
  fieldName: string,
): number | null {
  if (value === null) {
    return null
  }

  return normalizeBoundedMetric(
    value,
    0,
    100,
    fieldName,
  )
}

function normalizeEquipmentCategories(
  values:
    readonly string[] | null,
  fieldName: string,
): StageRiderEquipmentInput[
  'missingComponentCategories'
] {
  if (values === null) {
    return []
  }

  if (!Array.isArray(values)) {
    throw new Error(
      `${fieldName} must be an array or null.`,
    )
  }

  const normalized =
    values.map(
      (
        value,
        index,
      ) => {
        const category =
          requireNonEmptyString(
            value,
            `${fieldName}[${index}]`,
          )

        if (
          !EQUIPMENT_CATEGORIES.includes(
            category as typeof EQUIPMENT_CATEGORIES[number],
          )
        ) {
          throw new Error(
            `${fieldName}[${index}] has unsupported category ${category}.`,
          )
        }

        return category as
          typeof EQUIPMENT_CATEGORIES[number]
      },
    )

  if (
    new Set(
      normalized,
    ).size !==
    normalized.length
  ) {
    throw new Error(
      `${fieldName} must not contain duplicates.`,
    )
  }

  return normalized.sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )
}

function buildSourceRowMap<
  TRow extends {
    readonly rider_id: string
  },
>(
  rows:
    readonly TRow[],
  fieldName: string,
): ReadonlyMap<string, TRow> {
  const map =
    new Map<string, TRow>()

  for (
    const row of
    rows
  ) {
    const riderId =
      requireNonEmptyString(
        row.rider_id,
        `${fieldName}.rider_id`,
      )

    if (map.has(riderId)) {
      throw new Error(
        `${fieldName} contains duplicate rider ${riderId}.`,
      )
    }

    map.set(
      riderId,
      row,
    )
  }

  return map
}

function createEquipmentInput(
  riderId: string,
  condition:
    RiderEquipmentConditionSourceRow,
  preparation:
    RiderPreparationModifierSourceRow,
): StageRiderEquipmentInput {
  const conditionRiderId =
    requireNonEmptyString(
      condition.rider_id,
      'equipment condition rider_id',
    )

  const preparationRiderId =
    requireNonEmptyString(
      preparation.rider_id,
      'preparation modifier rider_id',
    )

  if (
    conditionRiderId !== riderId ||
    preparationRiderId !== riderId
  ) {
    throw new Error(
      `Equipment source rider mismatch for ${riderId}.`,
    )
  }

  const equipmentSetupId =
    condition
      .equipment_setup_id ===
      null
      ? null
      : requireNonEmptyString(
          condition
            .equipment_setup_id,
          `rider ${riderId} equipment_setup_id`,
        )

  const selectedComponentCount =
    normalizeInteger(
      condition
        .selected_component_count,
      0,
      6,
      `rider ${riderId} selected_component_count`,
    )

  const matchedComponentCount =
    normalizeInteger(
      condition
        .matched_component_count,
      0,
      6,
      `rider ${riderId} matched_component_count`,
    )

  if (
    matchedComponentCount >
    selectedComponentCount
  ) {
    throw new Error(
      `rider ${riderId} matched_component_count may not exceed selected_component_count.`,
    )
  }

  if (
    typeof condition
      .complete_source !==
    'boolean'
  ) {
    throw new Error(
      `rider ${riderId} complete_source must be boolean.`,
    )
  }

  const completeSource =
    condition.complete_source

  const derivedCompleteSource =
    selectedComponentCount >
      0 &&
    matchedComponentCount ===
      selectedComponentCount

  if (
    completeSource !==
    derivedCompleteSource
  ) {
    throw new Error(
      `rider ${riderId} complete_source does not match component counts.`,
    )
  }

  const minimumConditionPercent =
    normalizeOptionalEquipmentCondition(
      condition
        .minimum_condition_percent,
      `rider ${riderId} minimum_condition_percent`,
    )

  const effectiveConditionPercent =
    normalizeBoundedMetric(
      condition
        .effective_condition_percent,
      0,
      100,
      `rider ${riderId} effective_condition_percent`,
    )

  const missingComponentCategories =
    normalizeEquipmentCategories(
      condition
        .missing_component_categories,
      `rider ${riderId} missing_component_categories`,
    )

  if (completeSource) {
    if (equipmentSetupId === null) {
      throw new Error(
        `rider ${riderId} complete equipment source requires equipment_setup_id.`,
      )
    }

    if (
      minimumConditionPercent ===
      null
    ) {
      throw new Error(
        `rider ${riderId} complete equipment source requires minimum_condition_percent.`,
      )
    }

    if (
      Math.abs(
        effectiveConditionPercent -
        minimumConditionPercent
      ) >
      0.000001
    ) {
      throw new Error(
        `rider ${riderId} complete equipment source must use minimum condition as effective condition.`,
      )
    }

    if (
      missingComponentCategories
        .length >
      0
    ) {
      throw new Error(
        `rider ${riderId} complete equipment source may not list missing categories.`,
      )
    }
  } else if (
    effectiveConditionPercent !==
    100
  ) {
    throw new Error(
      `rider ${riderId} incomplete equipment source must use neutral effective condition 100.`,
    )
  }

  const mechanicalIncidentRiskMultiplier =
    normalizeBoundedMetric(
      preparation
        .mechanical_incident_risk_multiplier,
      0.75,
      1,
      `rider ${riderId} mechanical_incident_risk_multiplier`,
    )

  const mechanicalTimeLossMultiplier =
    normalizeBoundedMetric(
      preparation
        .mechanical_time_loss_multiplier,
      0.82,
      1,
      `rider ${riderId} mechanical_time_loss_multiplier`,
    )

  return {
    conditionSource:
      'race_engine_resolve_stage_rider_equipment_condition_v1',
    preparationSource:
      'race_engine_get_stage_rider_preparation_modifiers_v2',

    equipmentSetupId,

    selectedComponentCount,
    matchedComponentCount,
    completeSource,

    minimumConditionPercent,
    effectiveConditionPercent,
    missingComponentCategories,

    mechanicalIncidentRiskMultiplier,
    mechanicalTimeLossMultiplier,
  }
}

/**
 * Deterministic acceleration derivation.
 *
 * acceleration =
 *   sprint * 0.60 +
 *   flat * 0.25 +
 *   raceIq * 0.15
 */
function deriveAcceleration(
  sprint: number,
  flat: number,
  raceIq: number,
): number {
  return normalizeAttribute(
    sprint * 0.6 +
      flat * 0.25 +
      raceIq * 0.15,
    'derived acceleration',
  )
}

function parseStageFormat(
  value: string,
): StageFormat {
  if (
    !SUPPORTED_STAGE_FORMATS.includes(
      value as StageFormat,
    )
  ) {
    throw new Error(
      `Unsupported stage format: ${value}.`,
    )
  }

  return value as StageFormat
}

function createRiderName(
  rider: RiderSourceRow,
): string {
  const displayName =
    rider.display_name?.trim()

  if (displayName) {
    return displayName
  }

  const combinedName = [
    rider.first_name?.trim(),
    rider.last_name?.trim(),
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value === 'string' &&
        value.length > 0,
    )
    .join(' ')

  if (combinedName.length === 0) {
    throw new Error(
      `Rider ${rider.id} has no usable name.`,
    )
  }

  return combinedName
}

function createAttributes(
  rider: RiderSourceRow,
): RiderAttributes {
  const flat =
    normalizeAttribute(
      rider.flat,
      `rider ${rider.id} flat`,
    )

  const climbing =
    normalizeAttribute(
      rider.climbing,
      `rider ${rider.id} climbing`,
    )

  const sprint =
    normalizeAttribute(
      rider.sprint,
      `rider ${rider.id} sprint`,
    )

  const timeTrial =
    normalizeAttribute(
      rider.time_trial,
      `rider ${rider.id} time_trial`,
    )

  const stamina =
    normalizeAttribute(
      rider.endurance,
      `rider ${rider.id} endurance`,
    )

  const resistance =
    normalizeAttribute(
      rider.resistance,
      `rider ${rider.id} resistance`,
    )

  const recovery =
    normalizeAttribute(
      rider.recovery,
      `rider ${rider.id} recovery`,
    )

  const teamwork =
    normalizeAttribute(
      rider.teamwork,
      `rider ${rider.id} teamwork`,
    )

  const raceIq =
    normalizeAttribute(
      rider.race_iq,
      `rider ${rider.id} race_iq`,
    )

  return {
    flat,
    climbing,
    sprint,
    timeTrial,
    acceleration:
      deriveAcceleration(
        sprint,
        flat,
        raceIq,
      ),
    stamina,
    resistance,
    recovery,
    raceIq,
    teamwork,
  }
}

function getTeamIdForPlan(
  plan: StagePlanSourceRow,
): string | null {
  return (
    plan.participating_club_id ??
    plan.club_id
  )
}

function mapParticipantRole(
  value: string | null,
): RiderRole {
  if (!value) {
    return 'free_role'
  }

  return (
    PARTICIPANT_ROLE_MAP[value] ??
    'free_role'
  )
}

function getStagePlanRole(
  plans: readonly StagePlanSourceRow[],
  teamId: string,
  riderId: string,
): RiderRole | null {
  const matchingPlans = plans
    .filter(
      (plan) =>
        getTeamIdForPlan(plan) ===
        teamId,
    )
    .slice()
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id),
    )

  for (const plan of matchingPlans) {
    const sourceRole =
      plan.rider_roles_json?.[riderId]

    if (!sourceRole) {
      continue
    }

    const mappedRole =
      STAGE_PLAN_ROLE_MAP[sourceRole]

    if (mappedRole) {
      return mappedRole
    }
  }

  return null
}

function normalizePhaseCommand(
  value: string | null | undefined,
): string | null {
  if (
    typeof value !==
      'string'
  ) {
    return null
  }

  const normalized =
    value
      .trim()
      .toLowerCase()

  return normalized.length >
    0
    ? normalized
    : null
}

function createAttackOrders(
  plans:
    readonly StagePlanSourceRow[],
  includedRiderIds:
    ReadonlySet<string>,
  distanceKm: number,
): StageInput['orders'] {
  const phaseDefinitions =
    [
      {
        phase:
          'phase_1',
        fromFraction:
          0,
        untilFraction:
          0.25,
        priority:
          400,
      },
      {
        phase:
          'phase_2',
        fromFraction:
          0.25,
        untilFraction:
          0.5,
        priority:
          300,
      },
      {
        phase:
          'phase_3',
        fromFraction:
          0.5,
        untilFraction:
          0.75,
        priority:
          200,
      },
      {
        phase:
          'phase_4',
        fromFraction:
          0.75,
        untilFraction:
          1,
        priority:
          100,
      },
    ] as const

  const orders:
    Array<
      StageInput[
        'orders'
      ][number]
    > = []

  const sortedPlans =
    plans
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.id.localeCompare(
            right.id,
          ),
      )

  for (
    const plan of
    sortedPlans
  ) {
    const teamId =
      getTeamIdForPlan(
        plan,
      )

    if (
      !teamId
    ) {
      continue
    }

    const commandsByRider =
      plan
        .rider_phase_commands_json ??
      {}

    const riderIds =
      Object.keys(
        commandsByRider,
      ).sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )

    for (
      const riderId of
      riderIds
    ) {
      if (
        !includedRiderIds.has(
          riderId,
        )
      ) {
        continue
      }

      const commands =
        commandsByRider[
          riderId
        ]

      if (
        !commands
      ) {
        continue
      }

      for (
        const definition of
        phaseDefinitions
      ) {
        const command =
          normalizePhaseCommand(
            commands[
              definition.phase
            ],
          )

        /*
         * Engine v1.1 UI milestone:
         * only attack has an implemented sporting effect.
         * Other resolved commands remain intentionally unmapped.
         */
        if (
          command !==
          'attack'
        ) {
          continue
        }

        orders.push({
          orderId:
            `live-stage-plan:${plan.id}:${riderId}:${definition.phase}:attack`,
          teamId,
          riderId,
          type:
            'attack',
          status:
            'scheduled',
          eligibleFromKm:
            distanceKm *
            definition
              .fromFraction,
          eligibleUntilKm:
            distanceKm *
            definition
              .untilFraction,
          priority:
            definition.priority,
          targetRiderId:
            null,
          maximumFollowers:
            null,
          metadata: {
            source:
              'stage_plan_phase_command',
            stagePlanId:
              plan.id,
            phase:
              definition.phase,
            resolvedCommand:
              command,
            fromFraction:
              definition
                .fromFraction,
            untilFraction:
              definition
                .untilFraction,
          },
        })
      }
    }
  }

  return orders.sort(
    (
      left,
      right,
    ) =>
      left.orderId.localeCompare(
        right.orderId,
      ),
  )
}

function getValidStoredCaptain(
  plans: readonly StagePlanSourceRow[],
  teamId: string,
  teamRiderIds: ReadonlySet<string>,
): string | null {
  const candidates = plans
    .filter(
      (plan) =>
        getTeamIdForPlan(plan) ===
        teamId,
    )
    .map(
      (plan) =>
        plan.metadata
          ?.default_race_captain_rider_id ??
        null,
    )
    .filter(
      (
        riderId,
      ): riderId is string =>
        typeof riderId === 'string' &&
        teamRiderIds.has(riderId),
    )
    .sort(
      (left, right) =>
        left.localeCompare(right),
    )

  return candidates[0] ?? null
}

function determineCaptainRiderId(
  teamId: string,
  teamParticipants:
    readonly ParticipantRiderSourceRow[],
  stagePlans:
    readonly StagePlanSourceRow[],
): string {
  const riderIds = new Set(
    teamParticipants.map(
      (participant) =>
        participant.rider_id,
    ),
  )

  const storedCaptain =
    getValidStoredCaptain(
      stagePlans,
      teamId,
      riderIds,
    )

  if (storedCaptain) {
    return storedCaptain
  }

  const mappedCaptains =
    teamParticipants
      .filter(
        (participant) =>
          mapParticipantRole(
            participant.role_snapshot,
          ) === 'captain',
      )
      .map(
        (participant) =>
          participant.rider_id,
      )
      .sort(
        (left, right) =>
          left.localeCompare(right),
      )

  if (mappedCaptains.length > 0) {
    return mappedCaptains[0]
  }

  const orderedByStartNumber =
    teamParticipants
      .filter(
        (participant) =>
          participant.start_number !==
          null,
      )
      .slice()
      .sort(
        (left, right) => {
          const leftNumber =
            left.start_number as number

          const rightNumber =
            right.start_number as number

          if (
            leftNumber !==
            rightNumber
          ) {
            return (
              leftNumber -
              rightNumber
            )
          }

          return left.rider_id
            .localeCompare(
              right.rider_id,
            )
        },
      )

  if (
    orderedByStartNumber.length > 0
  ) {
    return orderedByStartNumber[0]
      .rider_id
  }

  const orderedRiderIds =
    [...riderIds].sort(
      (left, right) =>
        left.localeCompare(right),
    )

  const fallbackCaptain =
    orderedRiderIds[0]

  if (!fallbackCaptain) {
    throw new Error(
      `Team ${teamId} has no riders from which to derive a captain.`,
    )
  }

  return fallbackCaptain
}

function createProfilePoints(
  sourcePoints:
    readonly ProfilePointSourceRow[],
  distanceKm: number,
): readonly StageProfilePoint[] {
  if (sourcePoints.length < 2) {
    throw new Error(
      'At least two profile points are required.',
    )
  }

  const points = sourcePoints
    .map(
      (
        sourcePoint,
        index,
      ): StageProfilePoint => {
        const kilometre =
          requireFiniteNumber(
            sourcePoint.km,
            `profilePoints[${index}].km`,
          )

        const rawElevation =
          sourcePoint.elevation_m ??
          sourcePoint.elevation

        const elevationMetres =
          requireFiniteNumber(
            rawElevation,
            `profilePoints[${index}].elevation`,
          )

        if (kilometre < 0) {
          throw new Error(
            'Profile kilometre cannot be negative.',
          )
        }

        return {
          kilometre,
          elevationMetres,
        }
      },
    )
    .sort(
      (left, right) =>
        left.kilometre -
        right.kilometre,
    )

  for (
    let index = 1;
    index < points.length;
    index += 1
  ) {
    if (
      points[index].kilometre <=
      points[index - 1].kilometre
    ) {
      throw new Error(
        'Profile kilometres must be strictly increasing.',
      )
    }
  }

  const firstPoint = points[0]
  const finalPoint =
    points[points.length - 1]

  if (firstPoint.kilometre !== 0) {
    throw new Error(
      'The first profile point must be at kilometre 0.',
    )
  }

  if (
    Math.abs(
      finalPoint.kilometre -
      distanceKm,
    ) > 0.000001
  ) {
    throw new Error(
      'The final profile point must equal the stage distance.',
    )
  }

  return points
}

export function createStageInputFromSourceRows(
  params:
    CreateStageInputFromSourceRowsParams,
): StageInput {
  const raceId =
    requireNonEmptyString(
      params.race.id,
      'race.id',
    )

  const stageId =
    requireNonEmptyString(
      params.stage.id,
      'stage.id',
    )

  const stageRaceId =
    requireNonEmptyString(
      params.stage.race_id,
      'stage.race_id',
    )

  if (stageRaceId !== raceId) {
    throw new Error(
      'The stage does not belong to the supplied race.',
    )
  }

  const stageName =
    requireNonEmptyString(
      params.stage.name,
      'stage.name',
    )

  const stageFormat =
    parseStageFormat(
      requireNonEmptyString(
        params.stage.stage_format,
        'stage.stage_format',
      ),
    )

  if (stageFormat !== 'road_race') {
    throw new Error(
      'The first deterministic integration boundary supports road_race only.',
    )
  }

  const distanceKm =
    requireFiniteNumber(
      params.stage.distance_km,
      'stage.distance_km',
    )

  if (distanceKm <= 0) {
    throw new Error(
      'Stage distance must be greater than zero.',
    )
  }

  const riderById =
    new Map<string, RiderSourceRow>()

  for (const rider of params.riders) {
    const riderId =
      requireNonEmptyString(
        rider.id,
        'rider.id',
      )

    if (riderById.has(riderId)) {
      throw new Error(
        `Duplicate rider source row: ${riderId}.`,
      )
    }

    riderById.set(
      riderId,
      rider,
    )
  }

  const equipmentConditionsProvided =
    params.equipmentConditions !==
    undefined

  const preparationModifiersProvided =
    params.preparationModifiers !==
    undefined

  if (
    equipmentConditionsProvided !==
    preparationModifiersProvided
  ) {
    throw new Error(
      'equipmentConditions and preparationModifiers must be supplied together.',
    )
  }

  const equipmentConditionByRiderId =
    equipmentConditionsProvided
      ? buildSourceRowMap(
          params.equipmentConditions ??
            [],
          'equipmentConditions',
        )
      : null

  const preparationModifierByRiderId =
    preparationModifiersProvided
      ? buildSourceRowMap(
          params.preparationModifiers ??
            [],
          'preparationModifiers',
        )
      : null

  for (
    const riderId of
    equipmentConditionByRiderId
      ?.keys() ??
    []
  ) {
    if (!riderById.has(riderId)) {
      throw new Error(
        `Equipment condition references unknown rider ${riderId}.`,
      )
    }
  }

  for (
    const riderId of
    preparationModifierByRiderId
      ?.keys() ??
    []
  ) {
    if (!riderById.has(riderId)) {
      throw new Error(
        `Preparation modifier references unknown rider ${riderId}.`,
      )
    }
  }

  const participantByRiderId =
    new Map<
      string,
      ParticipantRiderSourceRow
    >()

  const participantsByTeam =
    new Map<
      string,
      ParticipantRiderSourceRow[]
    >()

  for (
    const participant
    of params.participantRiders
  ) {
    const riderId =
      requireNonEmptyString(
        participant.rider_id,
        'participant rider_id',
      )

    const teamId =
      requireNonEmptyString(
        participant.team_id,
        'participant team_id',
      )

    if (
      participantByRiderId.has(
        riderId,
      )
    ) {
      throw new Error(
        `Rider ${riderId} appears more than once in the start list.`,
      )
    }

    participantByRiderId.set(
      riderId,
      participant,
    )

    const current =
      participantsByTeam.get(
        teamId,
      ) ?? []

    current.push(participant)

    participantsByTeam.set(
      teamId,
      current,
    )
  }

  const executableTeamRows =
    params.participantTeams
      .filter(
        (team) =>
          team.status === 'accepted',
      )
      .filter(
        (team) =>
          (
            participantsByTeam.get(
              team.team_id,
            ) ?? []
          ).length > 0,
      )
      .slice()
      .sort(
        (left, right) =>
          left.team_id.localeCompare(
            right.team_id,
          ),
      )

  const seenTeamIds =
    new Set<string>()

  const teams:
    StageTeamInput[] = []

  const riders:
    StageRiderInput[] = []

  for (
    const teamRow
    of executableTeamRows
  ) {
    const teamId =
      requireNonEmptyString(
        teamRow.team_id,
        'participant team_id',
      )

    if (seenTeamIds.has(teamId)) {
      throw new Error(
        `Duplicate participant team: ${teamId}.`,
      )
    }

    seenTeamIds.add(teamId)

    const teamName =
      requireNonEmptyString(
        teamRow.team_name_snapshot,
        `team ${teamId} snapshot name`,
      )

    const teamParticipants =
      (
        participantsByTeam.get(
          teamId,
        ) ?? []
      )
        .slice()
        .sort(
          (left, right) =>
            left.rider_id.localeCompare(
              right.rider_id,
            ),
        )

    const captainRiderId =
      determineCaptainRiderId(
        teamId,
        teamParticipants,
        params.stagePlans,
      )

    const teamRiderIds =
      teamParticipants.map(
        (participant) =>
          participant.rider_id,
      )

    teams.push({
      teamId,
      teamName,
      captainRiderId,
      riderIds: teamRiderIds,
    })

    for (
      const participant
      of teamParticipants
    ) {
      const rider =
        riderById.get(
          participant.rider_id,
        )

      if (!rider) {
        throw new Error(
          `Missing rider source row for ${participant.rider_id}.`,
        )
      }

      const stagePlanRole =
        getStagePlanRole(
          params.stagePlans,
          teamId,
          participant.rider_id,
        )

      const participantRole =
        mapParticipantRole(
          participant.role_snapshot,
        )

      const role =
        participant.rider_id ===
        captainRiderId
          ? 'captain'
          : (
              stagePlanRole ??
              participantRole
            )

      const condition =
        createStartingCondition(
          rider,
        )

      const equipment =
        equipmentConditionByRiderId &&
        preparationModifierByRiderId
          ? createEquipmentInput(
              participant.rider_id,
              equipmentConditionByRiderId.get(
                participant.rider_id,
              ) ??
                (() => {
                  throw new Error(
                    `Missing equipment condition source row for ${participant.rider_id}.`,
                  )
                })(),
              preparationModifierByRiderId.get(
                participant.rider_id,
              ) ??
                (() => {
                  throw new Error(
                    `Missing preparation modifier source row for ${participant.rider_id}.`,
                  )
                })(),
            )
          : null

      riders.push({
        riderId:
          participant.rider_id,
        teamId,
        riderName:
          createRiderName(rider),
        teamName,
        role,
        attributes:
          createAttributes(rider),

        ...(condition
          ? {
              condition,
            }
          : {}),

        ...(equipment
          ? {
              equipment,
            }
          : {}),
      })
    }
  }

  if (
    equipmentConditionByRiderId &&
    preparationModifierByRiderId
  ) {
    const executableRiderIds =
      new Set(
        riders.map(
          (rider) =>
            rider.riderId,
        ),
      )

    if (
      equipmentConditionByRiderId
        .size !==
      executableRiderIds.size ||
      preparationModifierByRiderId
        .size !==
      executableRiderIds.size
    ) {
      throw new Error(
        'Equipment source rows must cover every executable rider exactly once.',
      )
    }

    for (
      const riderId of
      executableRiderIds
    ) {
      if (
        !equipmentConditionByRiderId.has(
          riderId,
        ) ||
        !preparationModifierByRiderId.has(
          riderId,
        )
      ) {
        throw new Error(
          `Equipment source coverage is incomplete for rider ${riderId}.`,
        )
      }
    }
  }

  teams.sort(
    (left, right) =>
      left.teamId.localeCompare(
        right.teamId,
      ),
  )

  riders.sort(
    (left, right) =>
      left.riderId.localeCompare(
        right.riderId,
      ),
  )

  if (teams.length < 2) {
    throw new Error(
      'At least two executable teams are required.',
    )
  }

  if (riders.length < 2) {
    throw new Error(
      'At least two executable riders are required.',
    )
  }

  const includedRiderIds =
    new Set(
      riders.map(
        (rider) =>
          rider.riderId,
      ),
    )

  for (const team of teams) {
    if (
      !includedRiderIds.has(
        team.captainRiderId,
      )
    ) {
      throw new Error(
        `Captain ${team.captainRiderId} is missing from the executable rider list.`,
      )
    }

    for (
      const riderId
      of team.riderIds
    ) {
      if (
        !includedRiderIds.has(
          riderId,
        )
      ) {
        throw new Error(
          `Team ${team.teamId} references missing rider ${riderId}.`,
        )
      }
    }
  }

  const orders =
    createAttackOrders(
      params.stagePlans,
      includedRiderIds,
      distanceKm,
    )

  const profilePoints =
    createProfilePoints(
      params.profilePoints,
      distanceKm,
    )

  const weather =
    createStageWeather(
      params.weather,
    )

  return {
    raceId,
    stageId,
    stageName,
    stageFormat,
    distanceKm,

    seed:
      `race_engine_ts_v1:${raceId}:${stageId}`,

    settings: SETTINGS,

    ...(weather
      ? {
          weather,
        }
      : {}),

    teams,
    riders,
    profilePoints,

    orders,
  }
}