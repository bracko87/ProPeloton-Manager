/**
 * applyGroupCrash.ts
 *
 * Pure immutable application of one already-selected group crash.
 *
 * Phase 8H.3A is intentionally isolated:
 * - no automatic incident-risk evaluation;
 * - no shared incident runtime;
 * - no database write;
 * - no injury persistence;
 * - no production activation.
 */

import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RaceEvent,
} from '../domain/RaceEvent'
import {
  calculateGroupCrashOutcome,
  type GroupCrashOutcome,
  type GroupCrashSeverity,
} from './groupCrashOutcome'

export interface GroupCrashRiderContract {
  readonly riderId: string
  readonly teamId: string
  readonly currentGroupId: string
  readonly distanceKm: number
  readonly speedKmh: number
  readonly stageStatus: string
}

export interface GroupCrashStateContract<
  TRider extends
    GroupCrashRiderContract =
      GroupCrashRiderContract,
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

export interface GroupCrashRiskContext {
  readonly finalProbability: number
  readonly deterministicRoll: number
  readonly deterministicKeyHash: string
  readonly weatherIncidentProbabilityMultiplier: number
}

export interface ApplyGroupCrashInput<
  TState extends
    GroupCrashStateContract,
> {
  readonly state: TState
  readonly sourceGroupId: string
  readonly severity:
    GroupCrashSeverity
  readonly occurrenceIndex:
    number
  readonly causes?:
    readonly string[]
  readonly riskContext?:
    GroupCrashRiskContext
}

export interface ApplyGroupCrashResult<
  TState extends
    GroupCrashStateContract,
> {
  readonly previousState:
    TState
  readonly state:
    TState

  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly affectedRiderIds:
    readonly string[]

  readonly outcome:
    GroupCrashOutcome
  readonly event:
    RaceEvent
}

export interface ApplyOptionalGroupCrashInput<
  TState extends
    GroupCrashStateContract,
> {
  readonly state: TState
  readonly selectedGroupId:
    string | null
  readonly severity:
    GroupCrashSeverity
  readonly occurrenceIndex:
    number
  readonly causes?:
    readonly string[]
  readonly riskContext?:
    GroupCrashRiskContext
}

export interface ApplyOptionalGroupCrashResult<
  TState extends
    GroupCrashStateContract,
> {
  readonly state:
    TState
  readonly application:
    ApplyGroupCrashResult<TState> | null
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
      `applyGroupCrash: ${fieldName} must be a non-empty string.`,
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
      `applyGroupCrash: ${fieldName} must be a positive integer.`,
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
      `applyGroupCrash: ${fieldName} must be a non-negative integer.`,
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
 * Apply one group crash after strict stale-state validation.
 */
export function applyGroupCrash<
  TState extends
    GroupCrashStateContract,
>(
  input:
    ApplyGroupCrashInput<TState>,
): ApplyGroupCrashResult<TState> {
  const {
    state,
    sourceGroupId,
  } = input

  assertNonEmpty(
    sourceGroupId,
    'sourceGroupId',
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
      'applyGroupCrash: cannot apply a group crash to a completed simulation.',
    )
  }

  const sourceGroup =
    state.groups[
      sourceGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `applyGroupCrash: source group ${sourceGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      'applyGroupCrash: source group must be active.',
    )
  }

  if (
    sourceGroup.groupType ===
    'finished'
  ) {
    throw new Error(
      'applyGroupCrash: a finished group cannot crash.',
    )
  }

  const sourceRiders =
    sourceGroup.riderIds.map(
      (riderId) => {
        const rider =
          state.riders[
            riderId
          ]

        if (!rider) {
          throw new Error(
            `applyGroupCrash: source group references missing rider ${riderId}.`,
          )
        }

        if (
          rider.currentGroupId !==
          sourceGroupId
        ) {
          throw new Error(
            `applyGroupCrash: rider ${riderId} currentGroupId does not match the source group.`,
          )
        }

        if (
          rider.stageStatus !==
          'racing'
        ) {
          throw new Error(
            `applyGroupCrash: every source-group rider must still be racing; ${riderId} is ${rider.stageStatus}.`,
          )
        }

        return rider
      },
    )

  const targetGroupId =
    `dropped_${state.nextDroppedGroupNumber}`

  if (
    state.groups[
      targetGroupId
    ]
  ) {
    throw new Error(
      `applyGroupCrash: target group ${targetGroupId} already exists.`,
    )
  }

  const outcome =
    calculateGroupCrashOutcome({
      raceId:
        state.raceId,
      stageId:
        state.stageId,
      seed:
        state.seed,
      occurrenceIndex:
        input.occurrenceIndex,

      sourceGroupId:
        sourceGroup.groupId,
      sourceRiderIds:
        sourceRiders.map(
          (rider) =>
            rider.riderId,
        ),

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

  const affectedRiderIdSet =
    new Set(
      outcome.affectedRiderIds,
    )

  const sourceRemainingRiderIds =
    sorted(
      sourceGroup.riderIds.filter(
        (riderId) =>
          !affectedRiderIdSet.has(
            riderId,
          ),
      ),
    )

  if (
    sourceRemainingRiderIds.length ===
    0
  ) {
    throw new Error(
      'applyGroupCrash: a group crash may not empty the source group.',
    )
  }

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
      riderIds:
        outcome
          .affectedRiderIds
          .slice(),
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

  const nextRiders:
    Record<
      string,
      TState['riders'][string]
    > = {
      ...state.riders,
    }

  for (
    const riderId of
    outcome.affectedRiderIds
  ) {
    const rider =
      state.riders[
        riderId
      ]

    if (!rider) {
      throw new Error(
        `applyGroupCrash: affected rider ${riderId} disappeared during application.`,
      )
    }

    nextRiders[
      riderId
    ] = {
      ...rider,
      currentGroupId:
        targetGroupId,
      distanceKm:
        outcome.targetDistanceKm,
      speedKmh: 0,
    }
  }

  const nextPressure = {
    ...state
      .separationPressureSecondsByRiderId,
  }

  for (
    const riderId of
    outcome.affectedRiderIds
  ) {
    nextPressure[
      riderId
    ] = 0
  }

  const event:
    RaceEvent = {
      sequenceNumber:
        state
          .nextEventSequenceNumber,
      eventType:
        'GROUP_CRASHED',
      raceSecond:
        state.raceSecond,
      kmMarker:
        sourceGroup.distanceKm,

      actorRiderId: null,
      teamId: null,
      sourceGroupId:
        sourceGroup.groupId,
      targetGroupId,

      relatedRiderIds:
        outcome
          .affectedRiderIds
          .slice(),

      payload: {
        incidentId:
          outcome.incidentId,
        incidentKind:
          'group_crash',
        severity:
          outcome.severity,

        affectedRiderCount:
          outcome
            .affectedRiderCount,
        affectedRiderIds:
          outcome
            .affectedRiderIds
            .slice(),

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
        selectionHash:
          outcome
            .selectionHash,
        timeLossHash:
          outcome
            .timeLossHash,

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
          'not_created_in_phase_8h3a',
      },

      commentaryText: null,
    }

  const nextState = {
    ...state,

    riders:
      nextRiders,

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

    separationPressureSecondsByRiderId:
      nextPressure,
  } as TState

  return {
    previousState:
      state,
    state:
      nextState,

    sourceGroupId:
      sourceGroup.groupId,
    targetGroupId,
    affectedRiderIds:
      outcome
        .affectedRiderIds
        .slice(),

    outcome,
    event,
  }
}

/**
 * Apply a group crash only when the risk-selection phase supplied a group.
 *
 * A null selection preserves the exact state reference and creates no event.
 */
export function applyOptionalGroupCrash<
  TState extends
    GroupCrashStateContract,
>(
  input:
    ApplyOptionalGroupCrashInput<TState>,
): ApplyOptionalGroupCrashResult<TState> {
  if (
    input.selectedGroupId ===
    null
  ) {
    return {
      state:
        input.state,
      application: null,
    }
  }

  const application =
    applyGroupCrash({
      state:
        input.state,
      sourceGroupId:
        input.selectedGroupId,
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
