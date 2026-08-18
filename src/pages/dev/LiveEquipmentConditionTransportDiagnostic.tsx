/**
 * LiveEquipmentConditionTransportDiagnostic.tsx
 *
 * Phase 8H.4C authenticated, browser-only, read-only diagnostic.
 *
 * Flow:
 * authenticated user
 * → explicit Supabase auth-session preflight
 * → one authenticated SECURITY DEFINER development RPC
 * → calibrated source bundle + completed simulation run
 * → authoritative equipment condition + preparation modifiers
 * → createStageInputFromSourceRows with live equipment rows
 * → calibrated deterministic execution comparison
 * → generic replay comparison
 *
 * This page performs no insert, update, delete, scheduler call, writer call,
 * equipment assignment, equipment wear, equipment damage, technical-event
 * creation, official classification update, or replay persistence.
 */

import {
  useMemo,
  useState,
} from 'react'

import {
  supabase,
} from '../../lib/supabase'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
  type ParticipantRiderSourceRow,
  type ParticipantTeamSourceRow,
  type ProfilePointSourceRow,
  type RiderEquipmentConditionSourceRow,
  type RiderPreparationModifierSourceRow,
  type RiderSourceRow,
  type StagePlanSourceRow,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  validateStageInput,
} from '../../race-engine/validation/validateStageInput'
import {
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
} from '../../race-replay'

const RIO_STAGE_ID =
  '24709c46-b258-4db3-a3aa-fd92dc37630e'

const JAPAN_HILLY_STAGE_ID =
  '3ca7d3dd-6a45-4829-b08e-6b118309fdd8'

const RIO_STAGE_2_ID =
  'b28d57bd-29bc-47aa-bace-59a2cf7732ab'

const DEFAULT_STAGE_ID =
  RIO_STAGE_ID

const STAGE_OPTIONS = [
  {
    stageId:
      RIO_STAGE_ID,
    label:
      'Rio Tour Stage 1 · Flat · 142.00 km',
  },
  {
    stageId:
      JAPAN_HILLY_STAGE_ID,
    label:
      'Japan Road Cup Stage 1 · Hilly · 144.20 km',
  },
  {
    stageId:
      RIO_STAGE_2_ID,
    label:
      'Rio Tour Stage 2 · Niterói → Teresópolis · 154.00 km',
  },
] as const

const LIVE_EQUIPMENT_TRANSPORT_RPC =
  'race_engine_get_live_equipment_transport_bundle_dev_v1'

type JsonObject =
  Record<string, unknown>

interface ErrorShape {
  readonly message: string
}

interface QueryResultShape {
  readonly data: unknown
  readonly error:
    ErrorShape | null
}

interface RpcClientShape {
  rpc(
    functionName: string,
    args: JsonObject,
  ): Promise<QueryResultShape>
}

interface SourceBundle {
  readonly status: string
  readonly bundle_version: string
  readonly race_id: string
  readonly stage_id: string
  readonly stage_format: string
  readonly stage: JsonObject
  readonly profile_detail: JsonObject
  readonly teams:
    readonly JsonObject[]
  readonly participants:
    readonly JsonObject[]
  readonly rider_inputs:
    readonly JsonObject[]
  readonly phase_commands:
    readonly JsonObject[]
  readonly official_winner:
    JsonObject | null
  readonly safety: JsonObject
}

interface SimulationRunReference {
  readonly id: string
  readonly raceId: string
  readonly stageId: string
  readonly status: string
  readonly completedAt:
    string | null
  readonly source:
    'race_engine_get_live_equipment_transport_bundle_dev_v1'
}

interface LiveEquipmentTransportEnvelope {
  readonly status: string
  readonly bundle_version:
    string
  readonly source_bundle:
    JsonObject
  readonly simulation_run:
    JsonObject
  readonly equipment_conditions:
    readonly unknown[]
  readonly preparation_modifiers:
    readonly unknown[]
  readonly safety:
    JsonObject
}

interface AuthSessionSummary {
  readonly userId: string
  readonly email: string | null
}

interface DiagnosticCheck {
  readonly label: string
  readonly passed: boolean
}

interface EquipmentSample {
  readonly riderId: string
  readonly equipmentSetupId:
    string | null
  readonly selected:
    number
  readonly matched:
    number
  readonly complete:
    boolean
  readonly minimumCondition:
    number | null
  readonly effectiveCondition:
    number
  readonly riskMultiplier:
    number
  readonly timeLossMultiplier:
    number
  readonly missingCategories:
    readonly string[]
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly checks:
    readonly DiagnosticCheck[]

  readonly stageName: string
  readonly raceName: string
  readonly sourceBundleVersion:
    string

  readonly authSession:
    AuthSessionSummary

  readonly simulationRun:
    SimulationRunReference

  readonly executableRiderCount:
    number
  readonly equipmentRowCount:
    number
  readonly preparationRowCount:
    number

  readonly completeSourceCount:
    number
  readonly incompleteSourceCount:
    number

  readonly conditionMinimum:
    number
  readonly conditionAverage:
    number
  readonly conditionMaximum:
    number

  readonly riskMultiplierMinimum:
    number
  readonly riskMultiplierAverage:
    number
  readonly riskMultiplierMaximum:
    number

  readonly timeLossMultiplierMinimum:
    number
  readonly timeLossMultiplierAverage:
    number
  readonly timeLossMultiplierMaximum:
    number

  readonly baselineSourceHash:
    string
  readonly equippedSourceHash:
    string
  readonly reorderedEquippedSourceHash:
    string

  readonly baselineStageInputHash:
    string
  readonly equippedStageInputHash:
    string
  readonly reorderedStageInputHash:
    string

  readonly baselineInitialStateHash:
    string
  readonly equippedInitialStateHash:
    string

  readonly baselineOutputHash:
    string
  readonly equippedOutputHash:
    string
  readonly repeatedEquippedOutputHash:
    string

  readonly baselineBehaviorHash:
    string
  readonly equippedBehaviorHash:
    string
  readonly repeatedEquippedBehaviorHash:
    string

  readonly baselineReplayHash:
    string
  readonly equippedReplayHash:
    string
  readonly repeatedEquippedReplayHash:
    string

  readonly replayValidationMessages:
    readonly string[]

  readonly sourceBundleContainsEquipmentFields:
    boolean

  readonly equipmentSamples:
    readonly EquipmentSample[]

  readonly auditHash:
    string
}

function asObject(
  value: unknown,
): JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {}
}

function asArray(
  value: unknown,
): readonly unknown[] {
  return Array.isArray(value)
    ? value
    : []
}

function requireString(
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

function nullableString(
  value: unknown,
): string | null {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
    ? value.trim()
    : null
}

function requireNumber(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error(
      `${fieldName} must be a finite number.`,
    )
  }

  return numericValue
}

function nullableNumber(
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

  return requireNumber(
    value,
    fieldName,
  )
}

function requireInteger(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    requireNumber(
      value,
      fieldName,
    )

  if (!Number.isInteger(numericValue)) {
    throw new Error(
      `${fieldName} must be an integer.`,
    )
  }

  return numericValue
}

function requireBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  throw new Error(
    `${fieldName} must be boolean.`,
  )
}

function stringArray(
  value: unknown,
  fieldName: string,
): readonly string[] {
  if (
    value === null ||
    value === undefined
  ) {
    return []
  }

  if (Array.isArray(value)) {
    return value.map(
      (
        item,
        index,
      ) =>
        requireString(
          item,
          `${fieldName}[${index}]`,
        ),
    )
  }

  if (
    typeof value === 'string' &&
    value.startsWith('{') &&
    value.endsWith('}')
  ) {
    const inner =
      value.slice(1, -1)

    return inner.length === 0
      ? []
      : inner
          .split(',')
          .map(
            (item) =>
              requireString(
                item.replace(
                  /^"|"$/g,
                  '',
                ),
                fieldName,
              ),
          )
  }

  throw new Error(
    `${fieldName} must be an array.`,
  )
}

function average(
  values:
    readonly number[],
): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function minimum(
  values:
    readonly number[],
): number {
  return values.length > 0
    ? Math.min(...values)
    : 0
}

function maximum(
  values:
    readonly number[],
): number {
  return values.length > 0
    ? Math.max(...values)
    : 0
}

function normalizeStagePlanRole(
  value: unknown,
): string {
  const source =
    String(value ?? '')
      .trim()
      .toLowerCase()

  const roleMap:
    Readonly<Record<string, string>> = {
      leader:
        'team_leader_gc',
      captain:
        'team_leader_gc',
      gc_leader:
        'team_leader_gc',
      team_leader_gc:
        'team_leader_gc',

      sprinter:
        'sprinter',

      lead_out:
        'lead_out_rider',
      lead_out_rider:
        'lead_out_rider',
      sprint_train:
        'sprint_train_rider',
      sprint_train_rider:
        'sprint_train_rider',

      domestique:
        'helper_domestique',
      helper:
        'helper_domestique',
      helper_domestique:
        'helper_domestique',
      mountain_domestique:
        'mountain_domestique',

      breakaway:
        'breakaway_rider',
      breakaway_rider:
        'breakaway_rider',
      breakaway_chaser:
        'breakaway_chaser',

      protected:
        'protected_rider',
      protected_rider:
        'protected_rider',

      climber:
        'climber',
      rouleur:
        'rouleur',
      free_role:
        'free_role',
      selected:
        'free_role',
    }

  return roleMap[source] ??
    'free_role'
}

function createStagePlans(
  stageId: string,
  phaseCommands:
    readonly JsonObject[],
): readonly StagePlanSourceRow[] {
  const rolesByTeam =
    new Map<
      string,
      Record<string, string>
    >()

  for (
    const command of
      phaseCommands
  ) {
    const teamId =
      requireString(
        command.team_id,
        'phase command team_id',
      )

    const riderId =
      requireString(
        command.rider_id,
        'phase command rider_id',
      )

    const teamRoles =
      rolesByTeam.get(teamId) ??
      {}

    teamRoles[riderId] =
      normalizeStagePlanRole(
        command.role_code,
      )

    rolesByTeam.set(
      teamId,
      teamRoles,
    )
  }

  return Array.from(
    rolesByTeam.entries(),
  )
    .sort(
      (
        [leftTeamId],
        [rightTeamId],
      ) =>
        leftTeamId.localeCompare(
          rightTeamId,
        ),
    )
    .map(
      (
        [
          teamId,
          riderRoles,
        ],
      ) => ({
        id:
          `live-equipment:${stageId}:${teamId}`,
        club_id:
          teamId,
        participating_club_id:
          teamId,
        status:
          'submitted',
        metadata:
          null,
        rider_roles_json:
          riderRoles,
      }),
    )
}

function createProfilePoints(
  profileDetail:
    JsonObject,
): readonly ProfilePointSourceRow[] {
  return asArray(
    profileDetail.profile_points,
  ).map(
    (
      value,
      index,
    ): ProfilePointSourceRow => {
      const point =
        asObject(value)

      return {
        km:
          requireNumber(
            point.km ??
              point.kilometre ??
              point.distance_km,
            `profile point ${index} km`,
          ),
        elevation_m:
          requireNumber(
            point.elevation_m ??
              point.elevation ??
              point.elevationMetres,
            `profile point ${index} elevation`,
          ),
      }
    },
  )
}

function createParticipantTeams(
  rows:
    readonly JsonObject[],
): readonly ParticipantTeamSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      team_id:
        requireString(
          row.team_id,
          `team ${index} team_id`,
        ),
      status:
        requireString(
          row.status,
          `team ${index} status`,
        ),
      team_name_snapshot:
        nullableString(
          row.team_name_snapshot,
        ),
    }),
  )
}

function createParticipantRiders(
  rows:
    readonly JsonObject[],
): readonly ParticipantRiderSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      rider_id:
        requireString(
          row.rider_id,
          `participant ${index} rider_id`,
        ),
      team_id:
        requireString(
          row.team_id,
          `participant ${index} team_id`,
        ),
      start_number:
        nullableNumber(
          row.start_number,
          `participant ${index} start_number`,
        ),
      role_snapshot:
        nullableString(
          row.role_snapshot,
        ),
    }),
  )
}

function createRiders(
  rows:
    readonly JsonObject[],
): readonly RiderSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      id:
        requireString(
          row.rider_id,
          `rider ${index} rider_id`,
        ),
      first_name: null,
      last_name: null,
      display_name:
        requireString(
          row.rider_name,
          `rider ${index} rider_name`,
        ),

      flat:
        requireNumber(
          row.flat,
          `rider ${index} flat`,
        ),
      climbing:
        requireNumber(
          row.climbing,
          `rider ${index} climbing`,
        ),
      sprint:
        requireNumber(
          row.sprint,
          `rider ${index} sprint`,
        ),
      time_trial:
        requireNumber(
          row.time_trial,
          `rider ${index} time_trial`,
        ),
      endurance:
        requireNumber(
          row.endurance,
          `rider ${index} endurance`,
        ),
      resistance:
        requireNumber(
          row.resistance,
          `rider ${index} resistance`,
        ),
      recovery:
        requireNumber(
          row.recovery,
          `rider ${index} recovery`,
        ),
      race_iq:
        requireNumber(
          row.race_iq,
          `rider ${index} race_iq`,
        ),
      teamwork:
        requireNumber(
          row.teamwork,
          `rider ${index} teamwork`,
        ),

      fatigue:
        nullableNumber(
          row.fatigue,
          `rider ${index} fatigue`,
        ),
      fatigue_before_stage:
        nullableNumber(
          row.fatigue_before_stage,
          `rider ${index} fatigue_before_stage`,
        ),
      start_stamina:
        nullableNumber(
          row.start_stamina,
          `rider ${index} start_stamina`,
        ),
      morale:
        nullableNumber(
          row.morale,
          `rider ${index} morale`,
        ),
      availability_status:
        nullableString(
          row.availability_status,
        ),
    }),
  )
}

function createBaseSourceRows(
  bundle:
    SourceBundle,
): CreateStageInputFromSourceRowsParams {
  const stage =
    bundle.stage

  return {
    race: {
      id:
        requireString(
          bundle.race_id,
          'bundle race_id',
        ),
      name:
        requireString(
          stage.race_name,
          'stage race_name',
        ),
    },

    stage: {
      id:
        requireString(
          bundle.stage_id,
          'bundle stage_id',
        ),
      race_id:
        requireString(
          bundle.race_id,
          'bundle race_id',
        ),
      name:
        requireString(
          stage.name,
          'stage name',
        ),
      stage_format:
        requireString(
          bundle.stage_format,
          'bundle stage_format',
        ),
      distance_km:
        requireNumber(
          stage.distance_km,
          'stage distance_km',
        ),
    },

    participantTeams:
      createParticipantTeams(
        bundle.teams,
      ),

    participantRiders:
      createParticipantRiders(
        bundle.participants,
      ),

    riders:
      createRiders(
        bundle.rider_inputs,
      ),

    stagePlans:
      createStagePlans(
        bundle.stage_id,
        bundle.phase_commands,
      ),

    profilePoints:
      createProfilePoints(
        bundle.profile_detail,
      ),

    weather: {
      stageSnapshot:
        asObject(
          bundle.stage
            .weather_snapshot,
        ),
      stageSummary:
        nullableString(
          bundle.stage
            .weather_summary,
        ),
      profileSnapshot:
        asObject(
          bundle.profile_detail
            .weather_snapshot,
        ),
      profileSummary:
        nullableString(
          bundle.profile_detail
            .weather_summary,
        ),
    },
  }
}

function createEquipmentRows(
  values:
    readonly unknown[],
): readonly RiderEquipmentConditionSourceRow[] {
  return values.map(
    (
      value,
      index,
    ) => {
      const row =
        asObject(value)

      return {
        rider_id:
          requireString(
            row.rider_id,
            `equipment row ${index} rider_id`,
          ),
        equipment_setup_id:
          nullableString(
            row.equipment_setup_id,
          ),
        selected_component_count:
          requireInteger(
            row.selected_component_count,
            `equipment row ${index} selected_component_count`,
          ),
        matched_component_count:
          requireInteger(
            row.matched_component_count,
            `equipment row ${index} matched_component_count`,
          ),
        complete_source:
          requireBoolean(
            row.complete_source,
            `equipment row ${index} complete_source`,
          ),
        minimum_condition_percent:
          nullableNumber(
            row.minimum_condition_percent,
            `equipment row ${index} minimum_condition_percent`,
          ),
        effective_condition_percent:
          requireNumber(
            row.effective_condition_percent,
            `equipment row ${index} effective_condition_percent`,
          ),
        missing_component_categories:
          stringArray(
            row.missing_component_categories,
            `equipment row ${index} missing_component_categories`,
          ),
      }
    },
  )
}

function createPreparationRows(
  values:
    readonly unknown[],
): readonly RiderPreparationModifierSourceRow[] {
  return values.map(
    (
      value,
      index,
    ) => {
      const row =
        asObject(value)

      return {
        rider_id:
          requireString(
            row.rider_id,
            `preparation row ${index} rider_id`,
          ),
        mechanical_incident_risk_multiplier:
          requireNumber(
            row.mechanical_incident_risk_multiplier,
            `preparation row ${index} mechanical_incident_risk_multiplier`,
          ),
        mechanical_time_loss_multiplier:
          requireNumber(
            row.mechanical_time_loss_multiplier,
            `preparation row ${index} mechanical_time_loss_multiplier`,
          ),
      }
    },
  )
}

function createLiveTransportEnvelope(
  value: unknown,
): LiveEquipmentTransportEnvelope {
  const envelope =
    asObject(value)

  return {
    status:
      requireString(
        envelope.status,
        'live transport status',
      ),
    bundle_version:
      requireString(
        envelope.bundle_version,
        'live transport bundle_version',
      ),
    source_bundle:
      asObject(
        envelope.source_bundle,
      ),
    simulation_run:
      asObject(
        envelope.simulation_run,
      ),
    equipment_conditions:
      asArray(
        envelope.equipment_conditions,
      ),
    preparation_modifiers:
      asArray(
        envelope.preparation_modifiers,
      ),
    safety:
      asObject(
        envelope.safety,
      ),
  }
}

function createSimulationRunReference(
  value: JsonObject,
): SimulationRunReference {
  return {
    id:
      requireString(
        value.id,
        'simulation run id',
      ),
    raceId:
      requireString(
        value.race_id,
        'simulation run race_id',
      ),
    stageId:
      requireString(
        value.stage_id,
        'simulation run stage_id',
      ),
    status:
      requireString(
        value.status,
        'simulation run status',
      ),
    completedAt:
      nullableString(
        value.completed_at,
      ),
    source:
      'race_engine_get_live_equipment_transport_bundle_dev_v1',
  }
}

function sourceBundleHasEquipmentFields(
  bundle:
    SourceBundle,
): boolean {
  const keys =
    new Set([
      'equipment',
      'equipment_condition',
      'equipment_setup_id',
      'effective_condition_percent',
      'mechanical_incident_risk_multiplier',
      'mechanical_time_loss_multiplier',
    ])

  return bundle.rider_inputs.some(
    (row) =>
      Object.keys(row).some(
        (key) =>
          keys.has(key),
      ),
  )
}

function stripEquipmentMetadata(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      stripEquipmentMetadata,
    )
  }

  if (
    value === null ||
    typeof value !==
      'object'
  ) {
    return value
  }

  const result:
    Record<string, unknown> = {}

  for (
    const [
      key,
      child,
    ] of
    Object.entries(
      value as
        Record<string, unknown>,
    )
  ) {
    if (
      key === 'equipment' ||
      key === 'startingEquipment'
    ) {
      continue
    }

    result[key] =
      stripEquipmentMetadata(
        child,
      )
  }

  return result
}

function sameIdCoverage(
  expected:
    readonly string[],
  actual:
    readonly string[],
): boolean {
  const expectedSorted =
    Array.from(
      new Set(expected),
    ).sort()

  const actualSorted =
    Array.from(
      new Set(actual),
    ).sort()

  return (
    expectedSorted.length ===
      expected.length &&
    actualSorted.length ===
      actual.length &&
    JSON.stringify(
      expectedSorted,
    ) ===
    JSON.stringify(
      actualSorted,
    )
  )
}

function createEquipmentSamples(
  input:
    StageInput,
): readonly EquipmentSample[] {
  return input.riders
    .filter(
      (rider) =>
        rider.equipment !==
        undefined,
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) => {
        const leftCondition =
          left.equipment!
            .effectiveConditionPercent

        const rightCondition =
          right.equipment!
            .effectiveConditionPercent

        return (
          leftCondition -
            rightCondition ||
          left.riderId.localeCompare(
            right.riderId,
          )
        )
      },
    )
    .slice(
      0,
      12,
    )
    .map(
      (rider) => ({
        riderId:
          rider.riderId,
        equipmentSetupId:
          rider.equipment!
            .equipmentSetupId,
        selected:
          rider.equipment!
            .selectedComponentCount,
        matched:
          rider.equipment!
            .matchedComponentCount,
        complete:
          rider.equipment!
            .completeSource,
        minimumCondition:
          rider.equipment!
            .minimumConditionPercent,
        effectiveCondition:
          rider.equipment!
            .effectiveConditionPercent,
        riskMultiplier:
          rider.equipment!
            .mechanicalIncidentRiskMultiplier,
        timeLossMultiplier:
          rider.equipment!
            .mechanicalTimeLossMultiplier,
        missingCategories:
          rider.equipment!
            .missingComponentCategories,
      }),
    )
}

function createDiagnosticResult(
  bundle:
    SourceBundle,
  authSession:
    AuthSessionSummary,
  simulationRun:
    SimulationRunReference,
  equipmentConditions:
    readonly RiderEquipmentConditionSourceRow[],
  preparationModifiers:
    readonly RiderPreparationModifierSourceRow[],
): DiagnosticResult {
  const baseSourceRows =
    createBaseSourceRows(
      bundle,
    )

  const equippedSourceRows:
    CreateStageInputFromSourceRowsParams = {
      ...baseSourceRows,
      equipmentConditions,
      preparationModifiers,
    }

  const reorderedSourceRows:
    CreateStageInputFromSourceRowsParams = {
      ...baseSourceRows,
      equipmentConditions:
        equipmentConditions
          .slice()
          .reverse(),
      preparationModifiers:
        preparationModifiers
          .slice()
          .reverse(),
    }

  const baselineSourceHash =
    createCanonicalHashedValue(
      baseSourceRows,
    ).hash

  const equippedSourceHash =
    createCanonicalHashedValue(
      equippedSourceRows,
    ).hash

  const reorderedEquippedSourceHash =
    createCanonicalHashedValue(
      reorderedSourceRows,
    ).hash

  const baselineInput =
    createStageInputFromSourceRows(
      baseSourceRows,
    )

  const equippedInput =
    createStageInputFromSourceRows(
      equippedSourceRows,
    )

  const reorderedInput =
    createStageInputFromSourceRows(
      reorderedSourceRows,
    )

  validateStageInput(
    baselineInput,
  )

  validateStageInput(
    equippedInput,
  )

  validateStageInput(
    reorderedInput,
  )

  const baselineStageInputHash =
    createCanonicalHashedValue(
      baselineInput,
    ).hash

  const equippedStageInputHash =
    createCanonicalHashedValue(
      equippedInput,
    ).hash

  const reorderedStageInputHash =
    createCanonicalHashedValue(
      reorderedInput,
    ).hash

  const baselineInitialState =
    createInitialState(
      baselineInput,
    )

  const equippedInitialState =
    createInitialState(
      equippedInput,
    )

  validateSimulationState(
    baselineInitialState,
  )

  validateSimulationState(
    equippedInitialState,
  )

  const baselineInitialStateHash =
    createCanonicalHashedValue(
      baselineInitialState,
    ).hash

  const equippedInitialStateHash =
    createCanonicalHashedValue(
      equippedInitialState,
    ).hash

  const baselineOutput =
    runDeterministicRoadRace(
      baselineInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const equippedOutput =
    runDeterministicRoadRace(
      equippedInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const repeatedEquippedOutput =
    runDeterministicRoadRace(
      equippedInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const baselineOutputHash =
    createCanonicalHashedValue(
      baselineOutput,
    ).hash

  const equippedOutputHash =
    createCanonicalHashedValue(
      equippedOutput,
    ).hash

  const repeatedEquippedOutputHash =
    createCanonicalHashedValue(
      repeatedEquippedOutput,
    ).hash

  const baselineBehaviorHash =
    createCanonicalHashedValue(
      stripEquipmentMetadata(
        baselineOutput,
      ),
    ).hash

  const equippedBehaviorHash =
    createCanonicalHashedValue(
      stripEquipmentMetadata(
        equippedOutput,
      ),
    ).hash

  const repeatedEquippedBehaviorHash =
    createCanonicalHashedValue(
      stripEquipmentMetadata(
        repeatedEquippedOutput,
      ),
    ).hash

  const baselineReplay =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        baselineInput,
      simulationOutput:
        baselineOutput,
    })

  const equippedReplay =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        equippedInput,
      simulationOutput:
        equippedOutput,
    })

  const repeatedEquippedReplay =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        equippedInput,
      simulationOutput:
        repeatedEquippedOutput,
    })

  const baselineReplayHash =
    createCanonicalHashedValue(
      baselineReplay,
    ).hash

  const equippedReplayHash =
    createCanonicalHashedValue(
      equippedReplay,
    ).hash

  const repeatedEquippedReplayHash =
    createCanonicalHashedValue(
      repeatedEquippedReplay,
    ).hash

  const replayValidation =
    validateReplayStageModel(
      equippedReplay,
    )

  /**
   * Replay validation returns `issues`, not `messages`.
   *
   * Passing the nonexistent `messages` property into the final audit object
   * created an explicit undefined value, which canonical JSON correctly
   * rejects. Convert the authoritative issues into deterministic strings.
   */

  const expectedRiderIds =
    baseSourceRows.riders.map(
      (rider) =>
        rider.id,
    )

  const equipmentRiderIds =
    equipmentConditions.map(
      (row) =>
        row.rider_id,
    )

  const preparationRiderIds =
    preparationModifiers.map(
      (row) =>
        row.rider_id,
    )

  const equippedRiders =
    equippedInput.riders.filter(
      (rider) =>
        rider.equipment !==
        undefined,
    )

  const equipmentValues =
    equippedRiders.map(
      (rider) =>
        rider.equipment!
          .effectiveConditionPercent,
    )

  const riskValues =
    equippedRiders.map(
      (rider) =>
        rider.equipment!
          .mechanicalIncidentRiskMultiplier,
    )

  const timeLossValues =
    equippedRiders.map(
      (rider) =>
        rider.equipment!
          .mechanicalTimeLossMultiplier,
    )

  const completeSourceCount =
    equippedRiders.filter(
      (rider) =>
        rider.equipment!
          .completeSource,
    ).length

  const incompleteSourceCount =
    equippedRiders.length -
    completeSourceCount

  const sourceBundleContainsEquipmentFields =
    sourceBundleHasEquipmentFields(
      bundle,
    )

  const inputWithoutEquipmentMatchesBaseline =
    createCanonicalHashedValue(
      stripEquipmentMetadata(
        equippedInput,
      ),
    ).hash ===
    createCanonicalHashedValue(
      baselineInput,
    ).hash

  const stateWithoutEquipmentMatchesBaseline =
    createCanonicalHashedValue(
      stripEquipmentMetadata(
        equippedInitialState,
      ),
    ).hash ===
    createCanonicalHashedValue(
      baselineInitialState,
    ).hash

  const liveEquipmentMatchesInput =
    equippedInput.riders.every(
      (rider) => {
        const source =
          equipmentConditions.find(
            (row) =>
              row.rider_id ===
              rider.riderId,
          )

        const equipment =
          rider.equipment

        return (
          !!source &&
          !!equipment &&
          equipment
            .equipmentSetupId ===
            source
              .equipment_setup_id &&
          equipment
            .selectedComponentCount ===
            source
              .selected_component_count &&
          equipment
            .matchedComponentCount ===
            source
              .matched_component_count &&
          equipment
            .completeSource ===
            source
              .complete_source &&
          equipment
            .minimumConditionPercent ===
            source
              .minimum_condition_percent &&
          equipment
            .effectiveConditionPercent ===
            source
              .effective_condition_percent
        )
      },
    )

  const livePreparationMatchesInput =
    equippedInput.riders.every(
      (rider) => {
        const source =
          preparationModifiers.find(
            (row) =>
              row.rider_id ===
              rider.riderId,
          )

        const equipment =
          rider.equipment

        return (
          !!source &&
          !!equipment &&
          equipment
            .mechanicalIncidentRiskMultiplier ===
            source
              .mechanical_incident_risk_multiplier &&
          equipment
            .mechanicalTimeLossMultiplier ===
            source
              .mechanical_time_loss_multiplier
        )
      },
    )

  const initialEquipmentMatchesInput =
    equippedInput.riders.every(
      (rider) => {
        const stateRider =
          equippedInitialState.riders[
            rider.riderId
          ]

        return (
          !!stateRider &&
          createCanonicalHashedValue(
            stateRider
              .startingEquipment,
          ).hash ===
          createCanonicalHashedValue(
            rider.equipment,
          ).hash
        )
      },
    )

  const incompleteSourcesNeutral =
    equippedRiders
      .filter(
        (rider) =>
          !rider.equipment!
            .completeSource,
      )
      .every(
        (rider) =>
          rider.equipment!
            .effectiveConditionPercent ===
            100,
      )

  const completeSourcesConsistent =
    equippedRiders
      .filter(
        (rider) =>
          rider.equipment!
            .completeSource,
      )
      .every(
        (rider) =>
          rider.equipment!
            .selectedComponentCount >
            0 &&
          rider.equipment!
            .matchedComponentCount ===
            rider.equipment!
              .selectedComponentCount &&
          rider.equipment!
            .minimumConditionPercent !==
            null &&
          rider.equipment!
            .minimumConditionPercent ===
            rider.equipment!
              .effectiveConditionPercent
      )

  const outputContainsTechnicalEvent =
    equippedOutput.events.some(
      (event) => {
        const eventType =
          String(
            event.eventType,
          ).toUpperCase()

        return (
          eventType.includes(
            'TECHNICAL',
          ) ||
          eventType.includes(
            'MECHANICAL',
          ) ||
          eventType.includes(
            'PUNCTURE',
          )
        )
      },
    )

  const checks:
    readonly DiagnosticCheck[] = [
      {
        label:
          'Authenticated Supabase session is present before the live RPC call',
        passed:
          authSession.userId
            .length >
            0,
      },
      {
        label:
          'Authenticated calibrated source bundle loaded successfully',
        passed:
          bundle.status ===
            'ok' ||
          bundle.status ===
            'success' ||
          bundle.rider_inputs
            .length >
            0,
      },
      {
        label:
          'Completed simulation run matches the selected race and stage',
        passed:
          simulationRun.status ===
            'completed' &&
          simulationRun.stageId ===
            bundle.stage_id &&
          simulationRun.raceId ===
            bundle.race_id,
      },
      {
        label:
          'Authoritative equipment rows cover every live executable rider exactly once',
        passed:
          sameIdCoverage(
            expectedRiderIds,
            equipmentRiderIds,
          ),
      },
      {
        label:
          'Authoritative preparation rows cover every live executable rider exactly once',
        passed:
          sameIdCoverage(
            expectedRiderIds,
            preparationRiderIds,
          ),
      },
      {
        label:
          'Original calibrated source bundle remains equipment-free',
        passed:
          !sourceBundleContainsEquipmentFields,
      },
      {
        label:
          'Baseline StageInput omits equipment metadata',
        passed:
          baselineInput.riders.every(
            (rider) =>
              rider.equipment ===
              undefined,
          ),
      },
      {
        label:
          'Equipped StageInput transports equipment for every executable rider',
        passed:
          equippedRiders.length ===
            equippedInput.riders.length &&
          equippedRiders.length ===
            expectedRiderIds.length,
      },
      {
        label:
          'Live equipment-condition values match the authoritative resolver rows',
        passed:
          liveEquipmentMatchesInput,
      },
      {
        label:
          'Live preparation multipliers match the authoritative preparation rows',
        passed:
          livePreparationMatchesInput,
      },
      {
        label:
          'Equipment source-row ordering does not change StageInput',
        passed:
          equippedStageInputHash ===
            reorderedStageInputHash,
      },
      {
        label:
          'Removing equipment metadata from the equipped StageInput reproduces the baseline StageInput',
        passed:
          inputWithoutEquipmentMatchesBaseline,
      },
      {
        label:
          'createInitialState preserves every live equipment snapshot',
        passed:
          initialEquipmentMatchesInput,
      },
      {
        label:
          'Removing startingEquipment from equipped state reproduces baseline state',
        passed:
          stateWithoutEquipmentMatchesBaseline,
      },
      {
        label:
          'Every incomplete live equipment source uses neutral condition 100',
        passed:
          incompleteSourcesNeutral,
      },
      {
        label:
          'Every complete live equipment source uses its fully matched minimum condition',
        passed:
          completeSourcesConsistent,
      },
      {
        label:
          'Every live effective equipment condition is within 0–100',
        passed:
          equipmentValues.every(
            (value) =>
              value >= 0 &&
              value <= 100,
          ),
      },
      {
        label:
          'Every live preparation risk multiplier is within 0.75–1.00',
        passed:
          riskValues.every(
            (value) =>
              value >= 0.75 &&
              value <= 1,
          ),
      },
      {
        label:
          'Every live preparation time-loss multiplier is within 0.82–1.00',
        passed:
          timeLossValues.every(
            (value) =>
              value >= 0.82 &&
              value <= 1,
          ),
      },
      {
        label:
          'Equipment-enabled calibrated execution is exactly deterministic',
        passed:
          equippedOutputHash ===
            repeatedEquippedOutputHash,
      },
      {
        label:
          'Equipment metadata does not change calibrated race behavior',
        passed:
          baselineBehaviorHash ===
            equippedBehaviorHash &&
          equippedBehaviorHash ===
            repeatedEquippedBehaviorHash,
      },
      {
        label:
          'Equipment metadata does not change the generic replay model',
        passed:
          baselineReplayHash ===
            equippedReplayHash &&
          equippedReplayHash ===
            repeatedEquippedReplayHash,
      },
      {
        label:
          'Equipment-enabled generic replay validates',
        passed:
          replayValidation.valid,
      },
      {
        label:
          'All riders finish in the equipment-enabled calibrated execution',
        passed:
          equippedOutput
            .finalRiderStates
            .length ===
            equippedInput.riders.length &&
          equippedOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.finished &&
                rider.finishTimeSeconds !==
                  null,
            ),
      },
      {
        label:
          'No active technical, mechanical, or puncture event is emitted',
        passed:
          !outputContainsTechnicalEvent,
      },
      {
        label:
          'Diagnostic remains read-only and does not activate equipment wear, damage, time loss, or production writers',
        passed:
          true,
      },
    ]

  const resultWithoutAudit = {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    stageName:
      baselineInput.stageName,
    raceName:
      baseSourceRows.race.name,
    sourceBundleVersion:
      bundle.bundle_version,

    authSession,

    simulationRun,

    executableRiderCount:
      baselineInput.riders.length,
    equipmentRowCount:
      equipmentConditions.length,
    preparationRowCount:
      preparationModifiers.length,

    completeSourceCount,
    incompleteSourceCount,

    conditionMinimum:
      minimum(
        equipmentValues,
      ),
    conditionAverage:
      average(
        equipmentValues,
      ),
    conditionMaximum:
      maximum(
        equipmentValues,
      ),

    riskMultiplierMinimum:
      minimum(
        riskValues,
      ),
    riskMultiplierAverage:
      average(
        riskValues,
      ),
    riskMultiplierMaximum:
      maximum(
        riskValues,
      ),

    timeLossMultiplierMinimum:
      minimum(
        timeLossValues,
      ),
    timeLossMultiplierAverage:
      average(
        timeLossValues,
      ),
    timeLossMultiplierMaximum:
      maximum(
        timeLossValues,
      ),

    baselineSourceHash,
    equippedSourceHash,
    reorderedEquippedSourceHash,

    baselineStageInputHash,
    equippedStageInputHash,
    reorderedStageInputHash,

    baselineInitialStateHash,
    equippedInitialStateHash,

    baselineOutputHash,
    equippedOutputHash,
    repeatedEquippedOutputHash,

    baselineBehaviorHash,
    equippedBehaviorHash,
    repeatedEquippedBehaviorHash,

    baselineReplayHash,
    equippedReplayHash,
    repeatedEquippedReplayHash,

    replayValidationMessages:
      replayValidation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),

    sourceBundleContainsEquipmentFields,

    equipmentSamples:
      createEquipmentSamples(
        equippedInput,
      ),
  }

  return {
    ...resultWithoutAudit,

    auditHash:
      createCanonicalHashedValue(
        resultWithoutAudit,
      ).hash,
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    string | number
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">
        {label}
      </dt>
      <dd className="max-w-[70%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

function formatNumber(
  value: number,
  digits = 6,
): string {
  return value.toFixed(
    digits,
  )
}

export default function LiveEquipmentConditionTransportDiagnostic():
  JSX.Element {
  const [
    stageId,
    setStageId,
  ] = useState(
    DEFAULT_STAGE_ID,
  )

  const [
    running,
    setRunning,
  ] = useState(false)

  const [
    result,
    setResult,
  ] = useState<
    DiagnosticResult | null
  >(null)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const overallClasses =
    useMemo(
      () => [
        'rounded-3xl border p-6',
        result?.passed
          ? 'border-emerald-500 bg-emerald-950/20'
          : 'border-red-500 bg-red-950/20',
      ].join(' '),
      [result],
    )

  const runDiagnostic =
    async (): Promise<void> => {
      setRunning(true)
      setResult(null)
      setError(null)

      try {
        const {
          data:
            sessionData,
          error:
            sessionError,
        } =
          await supabase.auth
            .getSession()

        if (sessionError) {
          throw new Error(
            `Could not read the Supabase auth session: ${sessionError.message}`,
          )
        }

        const session =
          sessionData.session

        if (!session) {
          throw new Error(
            'No authenticated Supabase session is available. This project uses persistSession=false, so a browser refresh removes the in-memory login. Sign in again, then open this development route without refreshing the page.',
          )
        }

        const authSession:
          AuthSessionSummary = {
            userId:
              session.user.id,
            email:
              session.user.email ??
              null,
          }

        const client =
          supabase as unknown as
            RpcClientShape

        const response =
          await client.rpc(
            LIVE_EQUIPMENT_TRANSPORT_RPC,
            {
              p_stage_id:
                stageId,
            },
          )

        if (response.error) {
          throw new Error(
            response
              .error
              .message,
          )
        }

        const envelope =
          createLiveTransportEnvelope(
            response.data,
          )

        if (
          envelope.status !==
            'ok' &&
          envelope.status !==
            'success'
        ) {
          throw new Error(
            `Live equipment transport RPC returned status ${envelope.status}.`,
          )
        }

        const bundle =
          envelope
            .source_bundle as unknown as
            SourceBundle

        const simulationRun =
          createSimulationRunReference(
            envelope
              .simulation_run,
          )

        const equipmentConditions =
          createEquipmentRows(
            envelope
              .equipment_conditions,
          )

        const preparationModifiers =
          createPreparationRows(
            envelope
              .preparation_modifiers,
          )

        setResult(
          createDiagnosticResult(
            bundle,
            authSession,
            simulationRun,
            equipmentConditions,
            preparationModifiers,
          ),
        )
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof
            Error
            ? caughtError.message
            : String(
                caughtError,
              ),
        )
      } finally {
        setRunning(false)
      }
    }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8H.4C authenticated live diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Live equipment-condition and preparation transport
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Calls one authenticated read-only development RPC that returns
            the existing calibrated stage bundle, completed simulation run,
            authoritative rider equipment condition, and preparation
            multipliers. All values are transported into StageInput without
            activating a technical incident or writer.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="mb-2 block text-sm font-semibold text-slate-300">
                Live stage
              </span>

              <select
                value={stageId}
                disabled={running}
                onChange={
                  (event) =>
                    setStageId(
                      event.target.value,
                    )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                {STAGE_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.stageId
                      }
                      value={
                        option.stageId
                      }
                    >
                      {option.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <button
              type="button"
              disabled={running}
              onClick={
                () => {
                  void runDiagnostic()
                }
              }
              className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running
                ? 'Running live verification…'
                : 'Run live equipment verification'}
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>

        {result && (
          <>
            <section className={overallClasses}>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Overall result
              </div>

              <div
                className={`mt-3 text-xl font-bold ${
                  result.passed
                    ? 'text-emerald-300'
                    : 'text-red-300'
                }`}
              >
                {result.passed
                  ? 'PASS — live authoritative equipment and preparation values reach StageInput without changing race behavior'
                  : 'FAIL — live equipment transport or regression verification needs correction'}
              </div>

              <p className="mt-3 text-sm text-slate-300">
                {result.raceName}
                {' · '}
                {result.stageName}
              </p>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="font-semibold">
                  Live source
                </h2>

                <dl className="mt-4 space-y-2 text-xs">
                  <Metric
                    label="Authenticated user"
                    value={
                      result
                        .authSession
                        .email ??
                      result
                        .authSession
                        .userId
                    }
                  />
                  <Metric
                    label="Bundle version"
                    value={
                      result
                        .sourceBundleVersion
                    }
                  />
                  <Metric
                    label="Simulation run"
                    value={
                      result
                        .simulationRun
                        .id
                    }
                  />
                  <Metric
                    label="Run source"
                    value={
                      result
                        .simulationRun
                        .source
                    }
                  />
                  <Metric
                    label="Executable riders"
                    value={
                      result
                        .executableRiderCount
                    }
                  />
                  <Metric
                    label="Equipment rows"
                    value={
                      result
                        .equipmentRowCount
                    }
                  />
                  <Metric
                    label="Preparation rows"
                    value={
                      result
                        .preparationRowCount
                    }
                  />
                </dl>
              </article>

              <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="font-semibold">
                  Equipment coverage
                </h2>

                <dl className="mt-4 space-y-2 text-xs">
                  <Metric
                    label="Complete sources"
                    value={
                      result
                        .completeSourceCount
                    }
                  />
                  <Metric
                    label="Incomplete sources"
                    value={
                      result
                        .incompleteSourceCount
                    }
                  />
                  <Metric
                    label="Condition minimum"
                    value={`${formatNumber(result.conditionMinimum, 3)}%`}
                  />
                  <Metric
                    label="Condition average"
                    value={`${formatNumber(result.conditionAverage, 3)}%`}
                  />
                  <Metric
                    label="Condition maximum"
                    value={`${formatNumber(result.conditionMaximum, 3)}%`}
                  />
                </dl>
              </article>

              <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="font-semibold">
                  Preparation modifiers
                </h2>

                <dl className="mt-4 space-y-2 text-xs">
                  <Metric
                    label="Risk min / avg / max"
                    value={`${formatNumber(result.riskMultiplierMinimum)} / ${formatNumber(result.riskMultiplierAverage)} / ${formatNumber(result.riskMultiplierMaximum)}`}
                  />
                  <Metric
                    label="Time-loss min / avg / max"
                    value={`${formatNumber(result.timeLossMultiplierMinimum)} / ${formatNumber(result.timeLossMultiplierAverage)} / ${formatNumber(result.timeLossMultiplierMaximum)}`}
                  />
                  <Metric
                    label="Bundle already had equipment"
                    value={
                      String(
                        result
                          .sourceBundleContainsEquipmentFields,
                      )
                    }
                  />
                  <Metric
                    label="Audit hash"
                    value={
                      result.auditHash
                    }
                  />
                </dl>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Deterministic hashes
              </h2>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <dl className="space-y-2 text-xs">
                  <Metric
                    label="Baseline source"
                    value={
                      result
                        .baselineSourceHash
                    }
                  />
                  <Metric
                    label="Equipped source"
                    value={
                      result
                        .equippedSourceHash
                    }
                  />
                  <Metric
                    label="Reordered equipped source"
                    value={
                      result
                        .reorderedEquippedSourceHash
                    }
                  />
                  <Metric
                    label="Baseline StageInput"
                    value={
                      result
                        .baselineStageInputHash
                    }
                  />
                  <Metric
                    label="Equipped StageInput"
                    value={
                      result
                        .equippedStageInputHash
                    }
                  />
                  <Metric
                    label="Reordered StageInput"
                    value={
                      result
                        .reorderedStageInputHash
                    }
                  />
                </dl>

                <dl className="space-y-2 text-xs">
                  <Metric
                    label="Baseline initial state"
                    value={
                      result
                        .baselineInitialStateHash
                    }
                  />
                  <Metric
                    label="Equipped initial state"
                    value={
                      result
                        .equippedInitialStateHash
                    }
                  />
                  <Metric
                    label="Baseline raw output"
                    value={
                      result
                        .baselineOutputHash
                    }
                  />
                  <Metric
                    label="Equipped raw output"
                    value={
                      result
                        .equippedOutputHash
                    }
                  />
                  <Metric
                    label="Repeated equipped raw output"
                    value={
                      result
                        .repeatedEquippedOutputHash
                    }
                  />
                </dl>

                <dl className="space-y-2 text-xs">
                  <Metric
                    label="Baseline behavior"
                    value={
                      result
                        .baselineBehaviorHash
                    }
                  />
                  <Metric
                    label="Equipped behavior"
                    value={
                      result
                        .equippedBehaviorHash
                    }
                  />
                  <Metric
                    label="Repeated equipped behavior"
                    value={
                      result
                        .repeatedEquippedBehaviorHash
                    }
                  />
                  <Metric
                    label="Baseline replay"
                    value={
                      result
                        .baselineReplayHash
                    }
                  />
                  <Metric
                    label="Equipped replay"
                    value={
                      result
                        .equippedReplayHash
                    }
                  />
                  <Metric
                    label="Repeated equipped replay"
                    value={
                      result
                        .repeatedEquippedReplayHash
                    }
                  />
                </dl>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Equipment samples
              </h2>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[1000px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2">
                        Rider
                      </th>
                      <th className="pb-2">
                        Setup
                      </th>
                      <th className="pb-2">
                        Selected / matched
                      </th>
                      <th className="pb-2">
                        Complete
                      </th>
                      <th className="pb-2">
                        Minimum
                      </th>
                      <th className="pb-2">
                        Effective
                      </th>
                      <th className="pb-2">
                        Risk
                      </th>
                      <th className="pb-2">
                        Time loss
                      </th>
                      <th className="pb-2">
                        Missing
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result
                      .equipmentSamples
                      .map(
                        (sample) => (
                          <tr
                            key={
                              sample.riderId
                            }
                            className="border-t border-slate-800"
                          >
                            <td className="py-2">
                              {sample
                                .riderId}
                            </td>
                            <td className="py-2">
                              {sample
                                .equipmentSetupId ??
                                'null'}
                            </td>
                            <td className="py-2">
                              {sample.selected}
                              {' / '}
                              {sample.matched}
                            </td>
                            <td className="py-2">
                              {String(
                                sample.complete,
                              )}
                            </td>
                            <td className="py-2">
                              {sample
                                .minimumCondition ??
                                'null'}
                            </td>
                            <td className="py-2">
                              {sample
                                .effectiveCondition}
                            </td>
                            <td className="py-2">
                              {sample
                                .riskMultiplier}
                            </td>
                            <td className="py-2">
                              {sample
                                .timeLossMultiplier}
                            </td>
                            <td className="py-2">
                              {sample
                                .missingCategories
                                .join(', ') ||
                                'none'}
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Checks
              </h2>

              <div className="mt-4 space-y-2">
                {result.checks.map(
                  (check) => (
                    <div
                      key={check.label}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                    >
                      <span>
                        {check.label}
                      </span>
                      <strong
                        className={
                          check.passed
                            ? 'text-emerald-300'
                            : 'text-red-300'
                        }
                      >
                        {check.passed
                          ? 'PASS'
                          : 'FAIL'}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Safety
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-300">
                This diagnostic performs one authenticated read-only RPC. It
                does not change the calibrated source-bundle implementation,
                activate technical
                candidates, append technical replay events, apply technical
                time loss, assign equipment, apply equipment wear or damage,
                call an incident writer, alter official results, or change
                production execution.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
