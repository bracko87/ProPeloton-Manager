/**
 * applyTechnicalIncident.ts
 *
 * Pure immutable application of one already-selected rider technical incident.
 *
 * Phase 8H.5A is intentionally isolated:
 * - no automatic risk evaluation;
 * - no active incident runtime;
 * - no equipment damage or wear;
 * - no database write;
 * - no production activation.
 */

import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RaceEvent,
} from '../domain/RaceEvent'
import {
  calculateTechnicalIncidentOutcome,
  type TechnicalIncidentOutcome,
  type TechnicalIncidentSeverity,
  type TechnicalIncidentType,
} from './technicalIncidentOutcome'

export interface TechnicalIncidentRiderContract {
  readonly riderId: string
  readonly teamId: string
  readonly currentGroupId: string
  readonly distanceKm: number
  readonly speedKmh: number
  readonly stageStatus: string
}

export interface TechnicalIncidentStateContract<
  TRider extends
    TechnicalIncidentRiderContract =
      TechnicalIncidentRiderContract,
> {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string

  readonly raceSecond: number
  readonly currentKm: number
  readonly stageDistanceKm: number
  readonly completed: boolean

  readonly riders:
    Readonly<
      Record<
        string,
        TRider
      >
    >

  readonly groups:
    Readonly<
      Record<
        string,
        GroupState
      >
    >

  readonly events:
    readonly RaceEvent[]

  readonly nextEventSequenceNumber:
    number
  readonly nextDroppedGroupNumber:
    number

  readonly separationPressureSecondsByRiderId:
    Readonly<
      Record<
        string,
        number
      >
    >
}

export interface ApplyTechnicalIncidentInput<
  TState extends
    TechnicalIncidentStateContract,
> {
  readonly state: TState
  readonly riderId: string

  readonly technicalType:
    TechnicalIncidentType
  readonly severity:
    TechnicalIncidentSeverity
  readonly occurrenceIndex:
    number

  readonly equipmentConditionPercent:
    number
  readonly mechanicalTimeLossMultiplier:
    number

  readonly causes?:
    readonly string[]
}

export interface ApplyTechnicalIncidentResult<
  TState extends
    TechnicalIncidentStateContract,
> {
  readonly previousState:
    TState
  readonly state:
    TState

  readonly riderId: string
  readonly sourceGroupId: string
  readonly targetGroupId: string

  readonly outcome:
    TechnicalIncidentOutcome
  readonly event:
    RaceEvent
}

export interface ApplyOptionalTechnicalIncidentInput<
  TState extends
    TechnicalIncidentStateContract,
> {
  readonly state: TState
  readonly selectedRiderId:
    string | null

  readonly technicalType:
    TechnicalIncidentType
  readonly severity:
    TechnicalIncidentSeverity
  readonly occurrenceIndex:
    number

  readonly equipmentConditionPercent:
    number
  readonly mechanicalTimeLossMultiplier:
    number

  readonly causes?:
    readonly string[]
}

export interface ApplyOptionalTechnicalIncidentResult<
  TState extends
    TechnicalIncidentStateContract,
> {
  readonly state:
    TState
  readonly application:
    ApplyTechnicalIncidentResult<TState> | null
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
      `applyTechnicalIncident: ${fieldName} must be a non-empty string.`,
    )
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `applyTechnicalIncident: ${fieldName} must be a positive integer.`,
    )
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `applyTechnicalIncident: ${fieldName} must be a non-negative integer.`,
    )
  }
}

function sorted(
  values:
    readonly string[],
): readonly string[] {
  return values
    .slice()
    .sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )
}

/**
 * Apply one technical incident after strict stale-state validation.
 */
export function applyTechnicalIncident<
  TState extends
    TechnicalIncidentStateContract,
>(
  input:
    ApplyTechnicalIncidentInput<TState>,
): ApplyTechnicalIncidentResult<TState> {
  const {
    state,
    riderId,
  } = input

  assertNonEmpty(
    riderId,
    'riderId',
  )
  assertPositiveInteger(
    state.nextEventSequenceNumber,
    'nextEventSequenceNumber',
  )
  assertPositiveInteger(
    state.nextDroppedGroupNumber,
    'nextDroppedGroupNumber',
  )
  assertNonNegativeInteger(
    input.occurrenceIndex,
    'occurrenceIndex',
  )

  if (state.completed) {
    throw new Error(
      'applyTechnicalIncident: cannot apply a technical incident to a completed simulation.',
    )
  }

  const rider =
    state.riders[
      riderId
    ]

  if (!rider) {
    throw new Error(
      `applyTechnicalIncident: rider ${riderId} does not exist.`,
    )
  }

  if (
    rider.stageStatus !==
    'racing'
  ) {
    throw new Error(
      `applyTechnicalIncident: rider ${riderId} must still be racing.`,
    )
  }

  const sourceGroup =
    state.groups[
      rider.currentGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `applyTechnicalIncident: source group ${rider.currentGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      'applyTechnicalIncident: source group must be active.',
    )
  }

  if (
    sourceGroup.groupType ===
    'finished'
  ) {
    throw new Error(
      'applyTechnicalIncident: a rider in a finished group cannot receive a technical incident.',
    )
  }

  const membershipCount =
    sourceGroup.riderIds.filter(
      (candidateRiderId) =>
        candidateRiderId ===
        riderId,
    ).length

  if (membershipCount !== 1) {
    throw new Error(
      `applyTechnicalIncident: rider ${riderId} must occur exactly once in the source group.`,
    )
  }

  if (
    sourceGroup.riderIds.length <=
    1
  ) {
    throw new Error(
      'applyTechnicalIncident: a technical incident may not empty the source group.',
    )
  }

  const targetGroupId =
    `dropped_${state.nextDroppedGroupNumber}`

  if (
    state.groups[
      targetGroupId
    ]
  ) {
    throw new Error(
      `applyTechnicalIncident: target group ${targetGroupId} already exists.`,
    )
  }

  const outcome =
    calculateTechnicalIncidentOutcome({
      raceId:
        state.raceId,
      stageId:
        state.stageId,
      seed:
        state.seed,
      occurrenceIndex:
        input.occurrenceIndex,

      riderId,
      sourceGroupId:
        sourceGroup.groupId,

      raceSecond:
        state.raceSecond,
      sourceDistanceKm:
        sourceGroup.distanceKm,
      sourceGapFromLeaderSeconds:
        sourceGroup
          .gapFromLeaderSeconds,
      sourceSpeedKmh:
        sourceGroup.speedKmh,

      technicalType:
        input.technicalType,
      severity:
        input.severity,

      equipmentConditionPercent:
        input
          .equipmentConditionPercent,
      mechanicalTimeLossMultiplier:
        input
          .mechanicalTimeLossMultiplier,
    })

  const sourceRemainingRiderIds =
    sorted(
      sourceGroup.riderIds.filter(
        (candidateRiderId) =>
          candidateRiderId !==
          riderId,
      ),
    )

  const nextSourceGroup:
    GroupState = {
      ...sourceGroup,
      riderIds:
        sourceRemainingRiderIds,
    }

  const nextTargetGroup:
    GroupState = {
      groupId:
        targetGroupId,
      groupType:
        'dropped',
      riderIds: [
        riderId,
      ],
      distanceKm:
        outcome.targetDistanceKm,
      speedKmh: 0,
      gapFromLeaderSeconds:
        outcome
          .targetGapFromLeaderSeconds,
      createdAtRaceSecond:
        state.raceSecond,
      createdAtKm:
        sourceGroup.distanceKm,
      active: true,
    }

  const nextRider = {
    ...rider,
    currentGroupId:
      targetGroupId,
    distanceKm:
      outcome.targetDistanceKm,
    speedKmh: 0,
  }

  const event:
    RaceEvent = {
      sequenceNumber:
        state
          .nextEventSequenceNumber,
      eventType:
        'RIDER_TECHNICAL_INCIDENT',
      raceSecond:
        state.raceSecond,
      kmMarker:
        sourceGroup.distanceKm,

      actorRiderId:
        riderId,
      teamId:
        rider.teamId,
      sourceGroupId:
        sourceGroup.groupId,
      targetGroupId,

      relatedRiderIds: [
        riderId,
      ],

      payload: {
        incidentId:
          outcome.incidentId,
        incidentKind:
          'technical_incident',

        technicalType:
          outcome.technicalType,
        severity:
          outcome.severity,

        affectedEquipmentCategories:
          outcome
            .affectedEquipmentCategories
            .slice(),

        causes:
          (
            input.causes ??
            []
          ).slice(),

        equipmentConditionPercent:
          outcome
            .equipmentConditionPercent,
        equipmentConditionAppliedToTimeLoss:
          outcome
            .equipmentConditionAppliedToTimeLoss,

        timeLossModelVersion:
          outcome
            .timeLossModelVersion,

        minimumBaseTimeLossSeconds:
          outcome
            .minimumBaseTimeLossSeconds,
        maximumBaseTimeLossSeconds:
          outcome
            .maximumBaseTimeLossSeconds,
        baseTimeLossSeconds:
          outcome
            .baseTimeLossSeconds,

        mechanicalTimeLossMultiplier:
          outcome
            .mechanicalTimeLossMultiplier,
        responseSavingsSeconds:
          outcome
            .responseSavingsSeconds,
        timeLossSeconds:
          outcome
            .timeLossSeconds,

        sourceDistanceKm:
          outcome
            .sourceDistanceKm,
        targetDistanceKm:
          outcome
            .targetDistanceKm,
        distanceLossKm:
          outcome
            .distanceLossKm,

        sourceGapFromLeaderSeconds:
          outcome
            .sourceGapFromLeaderSeconds,
        targetGapFromLeaderSeconds:
          outcome
            .targetGapFromLeaderSeconds,

        incidentIdentityHash:
          outcome
            .incidentIdentityHash,
        deterministicHash:
          outcome
            .deterministicHash,

        equipmentDamagePersistence:
          'not_applied_in_phase_8h5a',
        equipmentWearPersistence:
          'not_applied_in_phase_8h5a',
        technicalRunnerIntegration:
          'not_active_in_phase_8h5a',
      },

      commentaryText: null,
    }

  const nextState = {
    ...state,

    riders: {
      ...state.riders,
      [riderId]:
        nextRider,
    },

    groups: {
      ...state.groups,
      [sourceGroup.groupId]:
        nextSourceGroup,
      [targetGroupId]:
        nextTargetGroup,
    },

    events: [
      ...state.events,
      event,
    ],

    nextEventSequenceNumber:
      state
        .nextEventSequenceNumber +
      1,

    nextDroppedGroupNumber:
      state
        .nextDroppedGroupNumber +
      1,

    separationPressureSecondsByRiderId: {
      ...state
        .separationPressureSecondsByRiderId,
      [riderId]: 0,
    },
  } as TState

  return {
    previousState:
      state,
    state:
      nextState,

    riderId,
    sourceGroupId:
      sourceGroup.groupId,
    targetGroupId,

    outcome,
    event,
  }
}

/**
 * Apply a technical incident only when the selection phase supplied a rider.
 *
 * A null selection preserves the exact state reference and creates no event.
 */
export function applyOptionalTechnicalIncident<
  TState extends
    TechnicalIncidentStateContract,
>(
  input:
    ApplyOptionalTechnicalIncidentInput<TState>,
): ApplyOptionalTechnicalIncidentResult<TState> {
  if (
    input.selectedRiderId ===
    null
  ) {
    return {
      state:
        input.state,
      application: null,
    }
  }

  const application =
    applyTechnicalIncident({
      state:
        input.state,
      riderId:
        input.selectedRiderId,

      technicalType:
        input.technicalType,
      severity:
        input.severity,
      occurrenceIndex:
        input.occurrenceIndex,

      equipmentConditionPercent:
        input
          .equipmentConditionPercent,
      mechanicalTimeLossMultiplier:
        input
          .mechanicalTimeLossMultiplier,

      causes:
        input.causes,
    })

  return {
    state:
      application.state,
    application,
  }
}
