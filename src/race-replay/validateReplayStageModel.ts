/**
 * validateReplayStageModel.ts
 *
 * Pure runtime validation for the generic replay view model.
 *
 * No database reads, engine execution, mutation,
 * persistence, or UI calculations.
 */

import type {
  ReplayEvent,
  ReplayFinalResult,
  ReplayFrame,
  ReplayStageModel,
  ReplayValidationIssue,
  ReplayValidationResult,
} from './replayTypes'

/**
 * Add one validation issue.
 */
function addIssue(
  issues: ReplayValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({
    code,
    path,
    message,
  })
}

/**
 * Validate a required non-empty string.
 */
function validateRequiredText(
  value: string,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (!value.trim()) {
    addIssue(
      issues,
      'required_text',
      path,
      'A non-empty string is required.',
    )
  }
}

/**
 * Validate a non-negative finite number.
 */
function validateNonNegativeNumber(
  value: number,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    addIssue(
      issues,
      'non_negative_number',
      path,
      'A finite number greater than or equal to zero is required.',
    )
  }
}

/**
 * Validate a nullable non-negative number.
 */
function validateNullableNonNegativeNumber(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (value === null) {
    return
  }

  validateNonNegativeNumber(
    value,
    path,
    issues,
  )
}

/**
 * Validate a nullable percentage.
 */
function validateNullablePercentage(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (value === null) {
    return
  }

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    addIssue(
      issues,
      'percentage_range',
      path,
      'A percentage must be null or between 0 and 100.',
    )
  }
}

/**
 * Validate a nullable positive integer position.
 */
function validateNullablePosition(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (value === null) {
    return
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    addIssue(
      issues,
      'positive_integer',
      path,
      'A position must be null or a positive integer.',
    )
  }
}

/**
 * Validate a distance value.
 */
function validateDistance(
  value: number,
  maximum: number,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum + 0.001
  ) {
    addIssue(
      issues,
      'distance_range',
      path,
      `Distance must be between 0 and ${maximum} km.`,
    )
  }
}

/**
 * Validate that an array contains unique,
 * non-empty identifiers.
 */
function validateUniqueStrings(
  values: readonly string[],
  path: string,
  issues: ReplayValidationIssue[],
): Set<string> {
  const seen =
    new Set<string>()

  values.forEach(
    (
      value,
      index,
    ) => {
      const itemPath =
        `${path}[${index}]`

      if (!value.trim()) {
        addIssue(
          issues,
          'required_identifier',
          itemPath,
          'A non-empty identifier is required.',
        )

        return
      }

      if (seen.has(value)) {
        addIssue(
          issues,
          'duplicate_identifier',
          itemPath,
          `Duplicate identifier: ${value}.`,
        )

        return
      }

      seen.add(value)
    },
  )

  return seen
}

/**
 * Validate one replay frame.
 */
function validateFrame(
  frame: ReplayFrame,
  frameIndex: number,
  model: ReplayStageModel,
  issues: ReplayValidationIssue[],
): void {
  const framePath =
    `frames[${frameIndex}]`

  if (
    !Number.isInteger(
      frame.frameNumber,
    ) ||
    frame.frameNumber < 0
  ) {
    addIssue(
      issues,
      'frame_number',
      `${framePath}.frameNumber`,
      'Frame number must be a non-negative integer.',
    )
  }

  validateNonNegativeNumber(
    frame.raceSecond,
    `${framePath}.raceSecond`,
    issues,
  )

  if (
    frame.raceSecond >
    model.durationSeconds
  ) {
    addIssue(
      issues,
      'frame_after_duration',
      `${framePath}.raceSecond`,
      'Frame time cannot exceed replay duration.',
    )
  }

  if (
    !Number.isFinite(
      frame.progress,
    ) ||
    frame.progress < 0 ||
    frame.progress > 1
  ) {
    addIssue(
      issues,
      'frame_progress',
      `${framePath}.progress`,
      'Frame progress must be between 0 and 1.',
    )
  }

  validateDistance(
    frame.leaderDistanceKm,
    model.distanceKm,
    `${framePath}.leaderDistanceKm`,
    issues,
  )

  const riderIds =
    validateUniqueStrings(
      frame.riders.map(
        (rider) =>
          rider.riderId,
      ),
      `${framePath}.riders.*.riderId`,
      issues,
    )

  const groupIds =
    validateUniqueStrings(
      frame.groups.map(
        (group) =>
          group.groupId,
      ),
      `${framePath}.groups.*.groupId`,
      issues,
    )

  const riderPositions =
    new Set<number>()

  frame.riders.forEach(
    (
      rider,
      riderIndex,
    ) => {
      const riderPath =
        `${framePath}.riders[${riderIndex}]`

      validateRequiredText(
        rider.riderId,
        `${riderPath}.riderId`,
        issues,
      )

      validateRequiredText(
        rider.teamId,
        `${riderPath}.teamId`,
        issues,
      )

      validateRequiredText(
        rider.riderName,
        `${riderPath}.riderName`,
        issues,
      )

      validateRequiredText(
        rider.teamName,
        `${riderPath}.teamName`,
        issues,
      )

      validateDistance(
        rider.distanceKm,
        model.distanceKm,
        `${riderPath}.distanceKm`,
        issues,
      )

      validateNullableNonNegativeNumber(
        rider.speedKmh,
        `${riderPath}.speedKmh`,
        issues,
      )

      validateNullableNonNegativeNumber(
        rider.gapToLeaderSeconds,
        `${riderPath}.gapToLeaderSeconds`,
        issues,
      )

      validateNullableNonNegativeNumber(
        rider.gapToPreviousRiderSeconds,
        `${riderPath}.gapToPreviousRiderSeconds`,
        issues,
      )

      validateNullablePosition(
        rider.position,
        `${riderPath}.position`,
        issues,
      )

      validateNullablePercentage(
        rider.staminaPercent,
        `${riderPath}.staminaPercent`,
        issues,
      )

      validateNullablePercentage(
        rider.fatiguePercent,
        `${riderPath}.fatiguePercent`,
        issues,
      )

      validateNullableNonNegativeNumber(
        rider.finishTimeSeconds,
        `${riderPath}.finishTimeSeconds`,
        issues,
      )

      validateNullablePosition(
        rider.finishPosition,
        `${riderPath}.finishPosition`,
        issues,
      )

      if (
        rider.status ===
          'racing' &&
        rider.groupId === null
      ) {
        addIssue(
          issues,
          'racing_rider_missing_group',
          `${riderPath}.groupId`,
          'A racing rider must belong to an authoritative group.',
        )
      }

      if (
        rider.groupId !== null &&
        !groupIds.has(
          rider.groupId,
        )
      ) {
        addIssue(
          issues,
          'unknown_rider_group',
          `${riderPath}.groupId`,
          `Rider references unknown group ${rider.groupId}.`,
        )
      }

      if (
        rider.status ===
          'finished' &&
        (
          rider.finishTimeSeconds ===
            null ||
          rider.finishPosition ===
            null
        )
      ) {
        addIssue(
          issues,
          'finished_rider_missing_result',
          riderPath,
          'A finished rider must have finish time and finish position.',
        )
      }

      if (
        rider.position !== null
      ) {
        if (
          riderPositions.has(
            rider.position,
          )
        ) {
          addIssue(
            issues,
            'duplicate_frame_position',
            `${riderPath}.position`,
            `Duplicate rider position: ${rider.position}.`,
          )
        }

        riderPositions.add(
          rider.position,
        )
      }
    },
  )

  const groupOrders =
    new Set<number>()

  const membershipByRiderId =
    new Map<
      string,
      string
    >()

  frame.groups.forEach(
    (
      group,
      groupIndex,
    ) => {
      const groupPath =
        `${framePath}.groups[${groupIndex}]`

      validateRequiredText(
        group.groupId,
        `${groupPath}.groupId`,
        issues,
      )

      validateRequiredText(
        group.label,
        `${groupPath}.label`,
        issues,
      )

      if (
        !Number.isInteger(
          group.order,
        ) ||
        group.order <= 0
      ) {
        addIssue(
          issues,
          'group_order',
          `${groupPath}.order`,
          'Group order must be a positive integer.',
        )
      } else if (
        groupOrders.has(
          group.order,
        )
      ) {
        addIssue(
          issues,
          'duplicate_group_order',
          `${groupPath}.order`,
          `Duplicate group order: ${group.order}.`,
        )
      }

      groupOrders.add(
        group.order,
      )

      validateDistance(
        group.distanceKm,
        model.distanceKm,
        `${groupPath}.distanceKm`,
        issues,
      )

      validateNullableNonNegativeNumber(
        group.speedKmh,
        `${groupPath}.speedKmh`,
        issues,
      )

      validateNonNegativeNumber(
        group.gapToLeaderSeconds,
        `${groupPath}.gapToLeaderSeconds`,
        issues,
      )

      validateNullableNonNegativeNumber(
        group.gapToPreviousGroupSeconds,
        `${groupPath}.gapToPreviousGroupSeconds`,
        issues,
      )

      validateUniqueStrings(
        group.riderIds,
        `${groupPath}.riderIds`,
        issues,
      )

      group.riderIds.forEach(
        (
          riderId,
          riderIndex,
        ) => {
          const riderPath =
            `${groupPath}.riderIds[${riderIndex}]`

          if (
            !riderIds.has(
              riderId,
            )
          ) {
            addIssue(
              issues,
              'unknown_group_rider',
              riderPath,
              `Group references unknown rider ${riderId}.`,
            )
          }

          const existingGroupId =
            membershipByRiderId.get(
              riderId,
            )

          if (
            existingGroupId &&
            existingGroupId !==
              group.groupId
          ) {
            addIssue(
              issues,
              'rider_in_multiple_groups',
              riderPath,
              `Rider ${riderId} appears in groups ${existingGroupId} and ${group.groupId}.`,
            )
          }

          membershipByRiderId.set(
            riderId,
            group.groupId,
          )
        },
      )
    },
  )

  frame.riders.forEach(
    (
      rider,
      riderIndex,
    ) => {
      const membership =
        membershipByRiderId.get(
          rider.riderId,
        ) ?? null

      if (
        membership !==
        rider.groupId
      ) {
        addIssue(
          issues,
          'group_membership_mismatch',
          `${framePath}.riders[${riderIndex}].groupId`,
          `Rider group ${String(rider.groupId)} does not match group membership ${String(membership)}.`,
        )
      }
    },
  )
}

/**
 * Validate one replay event.
 */
function validateEvent(
  event: ReplayEvent,
  eventIndex: number,
  model: ReplayStageModel,
  issues: ReplayValidationIssue[],
): void {
  const eventPath =
    `events[${eventIndex}]`

  validateRequiredText(
    event.id,
    `${eventPath}.id`,
    issues,
  )

  validateRequiredText(
    event.type,
    `${eventPath}.type`,
    issues,
  )

  if (
    !Number.isInteger(
      event.sequenceNumber,
    ) ||
    event.sequenceNumber <= 0
  ) {
    addIssue(
      issues,
      'event_sequence',
      `${eventPath}.sequenceNumber`,
      'Event sequence must be a positive integer.',
    )
  }

  validateNonNegativeNumber(
    event.raceSecond,
    `${eventPath}.raceSecond`,
    issues,
  )

  validateDistance(
    event.kilometre,
    model.distanceKm,
    `${eventPath}.kilometre`,
    issues,
  )

  validateUniqueStrings(
    event.riderIds,
    `${eventPath}.riderIds`,
    issues,
  )

  if (
    event.raceSecond >
    model.durationSeconds
  ) {
    addIssue(
      issues,
      'event_after_duration',
      `${eventPath}.raceSecond`,
      'Event time cannot exceed replay duration.',
    )
  }
}

/**
 * Validate one final result.
 */
function validateFinalResult(
  result: ReplayFinalResult,
  resultIndex: number,
  issues: ReplayValidationIssue[],
): void {
  const resultPath =
    `finalResults[${resultIndex}]`

  validateRequiredText(
    result.riderId,
    `${resultPath}.riderId`,
    issues,
  )

  validateRequiredText(
    result.teamId,
    `${resultPath}.teamId`,
    issues,
  )

  validateRequiredText(
    result.riderName,
    `${resultPath}.riderName`,
    issues,
  )

  validateRequiredText(
    result.teamName,
    `${resultPath}.teamName`,
    issues,
  )

  validateNullableNonNegativeNumber(
    result.finishTimeSeconds,
    `${resultPath}.finishTimeSeconds`,
    issues,
  )

  validateNullablePosition(
    result.finishPosition,
    `${resultPath}.finishPosition`,
    issues,
  )

  if (
    result.status ===
      'finished' &&
    (
      result.finishTimeSeconds ===
        null ||
      result.finishPosition ===
        null
    )
  ) {
    addIssue(
      issues,
      'finished_result_incomplete',
      resultPath,
      'A finished result must have finish time and finish position.',
    )
  }

  if (
    result.status !==
      'finished' &&
    result.finishPosition !==
      null
  ) {
    addIssue(
      issues,
      'non_finisher_has_position',
      `${resultPath}.finishPosition`,
      'Only finished riders may have a finish position.',
    )
  }
}

/**
 * Validate the complete generic replay model.
 *
 * Returns every discovered validation issue.
 */
export function validateReplayStageModel(
  model: ReplayStageModel,
): ReplayValidationResult {
  const issues:
    ReplayValidationIssue[] = []

  if (
    model.contractVersion !==
    'race_replay_view_model_v1'
  ) {
    addIssue(
      issues,
      'contract_version',
      'contractVersion',
      'Unsupported replay contract version.',
    )
  }

  validateRequiredText(
    model.raceId,
    'raceId',
    issues,
  )

  validateRequiredText(
    model.stageId,
    'stageId',
    issues,
  )

  validateRequiredText(
    model.stageName,
    'stageName',
    issues,
  )

  validateRequiredText(
    model.engineVersion,
    'engineVersion',
    issues,
  )

  validateRequiredText(
    model.simulationMode,
    'simulationMode',
    issues,
  )

  validateRequiredText(
    model.seed,
    'seed',
    issues,
  )

  if (
    !Number.isFinite(
      model.distanceKm,
    ) ||
    model.distanceKm <= 0
  ) {
    addIssue(
      issues,
      'stage_distance',
      'distanceKm',
      'Stage distance must be greater than zero.',
    )
  }

  validateNonNegativeNumber(
    model.durationSeconds,
    'durationSeconds',
    issues,
  )

  if (
    model.profilePoints.length <
    2
  ) {
    addIssue(
      issues,
      'profile_points',
      'profilePoints',
      'At least two profile points are required.',
    )
  }

  let previousProfileKm =
    Number.NEGATIVE_INFINITY

  model.profilePoints.forEach(
    (
      point,
      pointIndex,
    ) => {
      const pointPath =
        `profilePoints[${pointIndex}]`

      validateDistance(
        point.kilometre,
        model.distanceKm,
        `${pointPath}.kilometre`,
        issues,
      )

      if (
        !Number.isFinite(
          point.elevationMetres,
        )
      ) {
        addIssue(
          issues,
          'profile_elevation',
          `${pointPath}.elevationMetres`,
          'Profile elevation must be finite.',
        )
      }

      if (
        point.kilometre <=
        previousProfileKm
      ) {
        addIssue(
          issues,
          'profile_order',
          `${pointPath}.kilometre`,
          'Profile kilometres must be strictly increasing.',
        )
      }

      previousProfileKm =
        point.kilometre
    },
  )

  if (
    model.frames.length === 0
  ) {
    addIssue(
      issues,
      'missing_frames',
      'frames',
      'At least one replay frame is required.',
    )
  }

  const expectedRiderIds =
    new Set<string>(
      model.frames[0]?.riders.map(
        (rider) =>
          rider.riderId,
      ) ?? [],
    )

  const identityByRiderId =
    new Map<
      string,
      string
    >()

  model.frames.forEach(
    (
      frame,
      frameIndex,
    ) => {
      validateFrame(
        frame,
        frameIndex,
        model,
        issues,
      )

      const previousFrame =
        model.frames[
          frameIndex - 1
        ]

      if (previousFrame) {
        if (
          frame.frameNumber <=
          previousFrame.frameNumber
        ) {
          addIssue(
            issues,
            'frame_order',
            `frames[${frameIndex}].frameNumber`,
            'Frame numbers must be strictly increasing.',
          )
        }

        if (
          frame.raceSecond <=
          previousFrame.raceSecond
        ) {
          addIssue(
            issues,
            'frame_time_order',
            `frames[${frameIndex}].raceSecond`,
            'Frame times must be strictly increasing.',
          )
        }

        if (
          frame.progress <
          previousFrame.progress
        ) {
          addIssue(
            issues,
            'frame_progress_order',
            `frames[${frameIndex}].progress`,
            'Frame progress cannot decrease.',
          )
        }

        if (
          frame.leaderDistanceKm <
          previousFrame
            .leaderDistanceKm
        ) {
          addIssue(
            issues,
            'leader_distance_order',
            `frames[${frameIndex}].leaderDistanceKm`,
            'Leader distance cannot decrease.',
          )
        }
      }

      const currentRiderIds =
        new Set<string>(
          frame.riders.map(
            (rider) =>
              rider.riderId,
          ),
        )

      if (
        currentRiderIds.size !==
          expectedRiderIds.size ||
        Array.from(
          expectedRiderIds,
        ).some(
          (riderId) =>
            !currentRiderIds.has(
              riderId,
            ),
        )
      ) {
        addIssue(
          issues,
          'frame_rider_coverage',
          `frames[${frameIndex}].riders`,
          'Every frame must contain the same riders.',
        )
      }

      frame.riders.forEach(
        (
          rider,
          riderIndex,
        ) => {
          const identity =
            [
              rider.teamId,
              rider.riderName,
              rider.teamName,
            ].join('|')

          const previousIdentity =
            identityByRiderId.get(
              rider.riderId,
            )

          if (
            previousIdentity &&
            previousIdentity !==
              identity
          ) {
            addIssue(
              issues,
              'unstable_rider_identity',
              `frames[${frameIndex}].riders[${riderIndex}]`,
              `Rider ${rider.riderId} changed team or display identity between frames.`,
            )
          } else {
            identityByRiderId.set(
              rider.riderId,
              identity,
            )
          }
        },
      )
    },
  )

  validateUniqueStrings(
    model.events.map(
      (event) =>
        event.id,
    ),
    'events.*.id',
    issues,
  )

  const eventBySequence =
    new Map<
      number,
      ReplayEvent
    >()

  model.events.forEach(
    (
      event,
      eventIndex,
    ) => {
      validateEvent(
        event,
        eventIndex,
        model,
        issues,
      )

      const previousEvent =
        model.events[
          eventIndex - 1
        ]

      if (previousEvent) {
        if (
          event.sequenceNumber <=
          previousEvent
            .sequenceNumber
        ) {
          addIssue(
            issues,
            'event_order',
            `events[${eventIndex}].sequenceNumber`,
            'Event sequences must increase.',
          )
        }

        if (
          event.raceSecond <
          previousEvent.raceSecond
        ) {
          addIssue(
            issues,
            'event_time_order',
            `events[${eventIndex}].raceSecond`,
            'Event times cannot decrease.',
          )
        }
      }

      if (
        eventBySequence.has(
          event.sequenceNumber,
        )
      ) {
        addIssue(
          issues,
          'duplicate_event_sequence',
          `events[${eventIndex}].sequenceNumber`,
          `Duplicate event sequence: ${event.sequenceNumber}.`,
        )
      }

      eventBySequence.set(
        event.sequenceNumber,
        event,
      )
    },
  )

  model.frames.forEach(
    (
      frame,
      frameIndex,
    ) => {
      const seenSequences =
        new Set<number>()

      frame
        .eventSequenceNumbers
        .forEach(
          (
            sequenceNumber,
            sequenceIndex,
          ) => {
            const sequencePath =
              `frames[${frameIndex}].eventSequenceNumbers[${sequenceIndex}]`

            if (
              !Number.isInteger(
                sequenceNumber,
              ) ||
              sequenceNumber <= 0
            ) {
              addIssue(
                issues,
                'frame_event_sequence',
                sequencePath,
                'Event references must be positive integers.',
              )

              return
            }

            if (
              seenSequences.has(
                sequenceNumber,
              )
            ) {
              addIssue(
                issues,
                'duplicate_frame_event',
                sequencePath,
                `Duplicate event reference: ${sequenceNumber}.`,
              )
            }

            seenSequences.add(
              sequenceNumber,
            )

            const event =
              eventBySequence.get(
                sequenceNumber,
              )

            if (!event) {
              addIssue(
                issues,
                'unknown_frame_event',
                sequencePath,
                `Unknown event sequence: ${sequenceNumber}.`,
              )

              return
            }

            if (
              event.raceSecond >
              frame.raceSecond
            ) {
              addIssue(
                issues,
                'future_frame_event',
                sequencePath,
                'A frame cannot reference a future event.',
              )
            }
          },
        )
    },
  )

  const finalRiderIds =
    validateUniqueStrings(
      model.finalResults.map(
        (result) =>
          result.riderId,
      ),
      'finalResults.*.riderId',
      issues,
    )

  const finishPositions =
    new Set<number>()

  let latestFinishTime =
    0

  model.finalResults.forEach(
    (
      result,
      resultIndex,
    ) => {
      validateFinalResult(
        result,
        resultIndex,
        issues,
      )

      if (
        result.finishPosition !==
        null
      ) {
        if (
          finishPositions.has(
            result.finishPosition,
          )
        ) {
          addIssue(
            issues,
            'duplicate_finish_position',
            `finalResults[${resultIndex}].finishPosition`,
            `Duplicate finish position: ${result.finishPosition}.`,
          )
        }

        finishPositions.add(
          result.finishPosition,
        )
      }

      if (
        result.finishTimeSeconds !==
        null
      ) {
        latestFinishTime =
          Math.max(
            latestFinishTime,
            result.finishTimeSeconds,
          )
      }
    },
  )

  if (
    finalRiderIds.size !==
      expectedRiderIds.size ||
    Array.from(
      expectedRiderIds,
    ).some(
      (riderId) =>
        !finalRiderIds.has(
          riderId,
        ),
    )
  ) {
    addIssue(
      issues,
      'final_result_coverage',
      'finalResults',
      'Final results must contain exactly one row for every replay rider.',
    )
  }

  const lastFrame =
    model.frames[
      model.frames.length - 1
    ]

  if (
    lastFrame &&
    model.durationSeconds <
      lastFrame.raceSecond
  ) {
    addIssue(
      issues,
      'duration_before_last_frame',
      'durationSeconds',
      'Replay duration cannot be shorter than the last frame time.',
    )
  }

  if (
    model.durationSeconds <
    latestFinishTime
  ) {
    addIssue(
      issues,
      'duration_before_finish',
      'durationSeconds',
      'Replay duration cannot be shorter than the latest finish time.',
    )
  }

  return {
    valid:
      issues.length === 0,

    issues,
  }
}

/**
 * Throw a readable error when validation fails.
 */
export function assertValidReplayStageModel(
  model: ReplayStageModel,
): void {
  const result =
    validateReplayStageModel(
      model,
    )

  if (result.valid) {
    return
  }

  const messages =
    result.issues.map(
      (
        validationIssue,
      ) =>
        `${validationIssue.path}: ${validationIssue.message}`,
    )

  throw new Error(
    [
      'Invalid replay stage model:',
      ...messages,
    ].join('\n'),
  )
}