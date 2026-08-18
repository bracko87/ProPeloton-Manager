/**
 * applyIndividualRiderCrash.ts
 *
 * Pure immutable application of one already-selected individual rider crash.
 *
 * Phase 8H.2A is intentionally isolated:
 * - no automatic risk evaluation;
 * - no database write;
 * - no injury persistence;
 * - no production activation;
 * - no group-crash behavior.
 */

import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RaceEvent,
} from '../domain/RaceEvent'
import {
  calculateIndividualCrashOutcome,
  type IndividualCrashOutcome,
  type IndividualCrashSeverity,
} from './individualCrashOutcome'

export interface IndividualCrashRiderContract {
  readonly riderId: string
  readonly teamId: string
  readonly currentGroupId: string
  readonly distanceKm: number
  readonly speedKmh: number
  readonly stageStatus: string
}

export interface IndividualCrashStateContract<
  TRider extends
    IndividualCrashRiderContract =
      IndividualCrashRiderContract,
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

export interface IndividualCrashRiskContext {
  readonly finalProbability: number
  readonly deterministicRoll: number
  readonly deterministicKeyHash: string
  readonly weatherIncidentProbabilityMultiplier: number
}

export interface ApplyIndividualRiderCrashInput<
  TState extends
    IndividualCrashStateContract,
> {
  readonly state: TState
  readonly riderId: string
  readonly severity:
    IndividualCrashSeverity
  readonly occurrenceIndex:
    number
  readonly causes?:
    readonly string[]
  readonly riskContext?:
    IndividualCrashRiskContext
}

export interface ApplyIndividualRiderCrashResult<
  TState extends
    IndividualCrashStateContract,
> {
  readonly previousState:
    TState
  readonly state:
    TState

  readonly riderId: string
  readonly sourceGroupId: string
  readonly targetGroupId: string

  readonly outcome:
    IndividualCrashOutcome
  readonly event:
    RaceEvent
}

export interface ApplyOptionalIndividualRiderCrashInput<
  TState extends
    IndividualCrashStateContract,
> {
  readonly state: TState
  readonly selectedRiderId:
    string | null
  readonly severity:
    IndividualCrashSeverity
  readonly occurrenceIndex:
    number
  readonly causes?:
    readonly string[]
  readonly riskContext?:
    IndividualCrashRiskContext
}

export interface ApplyOptionalIndividualRiderCrashResult<
  TState extends
    IndividualCrashStateContract,
> {
  readonly state:
    TState
  readonly application:
    ApplyIndividualRiderCrashResult<TState> | null
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
      `applyIndividualRiderCrash: ${fieldName} must be a non-empty string.`,
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
      `applyIndividualRiderCrash: ${fieldName} must be a positive integer.`,
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
      `applyIndividualRiderCrash: ${fieldName} must be a non-negative integer.`,
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
 * Apply one individual crash after strict stale-state validation.
 */
export function applyIndividualRiderCrash<
  TState extends
    IndividualCrashStateContract,
>(
  input:
    ApplyIndividualRiderCrashInput<TState>,
): ApplyIndividualRiderCrashResult<TState> {
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
      'applyIndividualRiderCrash: cannot apply a crash to a completed simulation.',
    )
  }

  const rider =
    state.riders[
      riderId
    ]

  if (!rider) {
    throw new Error(
      `applyIndividualRiderCrash: rider ${riderId} does not exist.`,
    )
  }

  if (
    rider.stageStatus !==
    'racing'
  ) {
    throw new Error(
      `applyIndividualRiderCrash: rider ${riderId} must still be racing.`,
    )
  }

  const sourceGroup =
    state.groups[
      rider.currentGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `applyIndividualRiderCrash: source group ${rider.currentGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      'applyIndividualRiderCrash: source group must be active.',
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
      `applyIndividualRiderCrash: rider ${riderId} must occur exactly once in the source group.`,
    )
  }

  if (
    sourceGroup.riderIds.length <=
    1
  ) {
    throw new Error(
      'applyIndividualRiderCrash: an individual crash may not empty the source group.',
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
      `applyIndividualRiderCrash: target group ${targetGroupId} already exists.`,
    )
  }

  const outcome =
    calculateIndividualCrashOutcome({
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

      severity:
        input.severity,
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
        'RIDER_CRASHED',
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
          'individual_crash',
        severity:
          outcome.severity,
        causes:
          (
            input.causes ??
            []
          ).slice(),
        timeLossSeconds:
          outcome
            .timeLossSeconds,
        distanceLossKm:
          outcome
            .distanceLossKm,
        sourceDistanceKm:
          outcome
            .sourceDistanceKm,
        targetDistanceKm:
          outcome
            .targetDistanceKm,
        sourceGapFromLeaderSeconds:
          outcome
            .sourceGapFromLeaderSeconds,
        targetGapFromLeaderSeconds:
          outcome
            .targetGapFromLeaderSeconds,
        deterministicHash:
          outcome
            .deterministicHash,
        ...(
          input.riskContext
            ? {
                risk: {
                  finalProbability:
                    input
                      .riskContext
                      .finalProbability,
                  deterministicRoll:
                    input
                      .riskContext
                      .deterministicRoll,
                  deterministicKeyHash:
                    input
                      .riskContext
                      .deterministicKeyHash,
                  weatherIncidentProbabilityMultiplier:
                    input
                      .riskContext
                      .weatherIncidentProbabilityMultiplier,
                },
              }
            : {}
        ),
        persistentHealthOutcome:
          'not_created_in_phase_8h2a',
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
 * Apply a crash only when the risk-selection phase supplied a rider.
 *
 * A null selection preserves the exact state reference and creates no event.
 */
export function applyOptionalIndividualRiderCrash<
  TState extends
    IndividualCrashStateContract,
>(
  input:
    ApplyOptionalIndividualRiderCrashInput<TState>,
): ApplyOptionalIndividualRiderCrashResult<TState> {
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
    applyIndividualRiderCrash({
      state:
        input.state,
      riderId:
        input.selectedRiderId,
      severity:
        input.severity,
      occurrenceIndex:
        input.occurrenceIndex,
      causes:
        input.causes,
      riskContext:
        input.riskContext,
    })

  return {
    state:
      application.state,
    application,
  }
}
