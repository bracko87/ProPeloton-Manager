/**
 * validateReplayStageModel.ts
 *
 * Pure runtime validation for the generic replay view model.
 * No database reads, engine execution, mutation, or UI calculations.
 */

import type {
  ReplayEvent,
  ReplayFinalResult,
  ReplayFrame,
  ReplayStageModel,
  ReplayValidationIssue,
  ReplayValidationResult,
} from './replayTypes'

function issue(
  issues: ReplayValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message })
}

function requiredText(
  value: string,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (!value.trim()) {
    issue(issues, 'required_text', path, 'A non-empty string is required.')
  }
}

function nonNegative(
  value: number,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0) {
    issue(
      issues,
      'non_negative_number',
      path,
      'A finite number greater than or equal to zero is required.',
    )
  }
}

function nullableNonNegative(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (value !== null) nonNegative(value, path, issues)
}

function nullablePercent(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (
    value !== null &&
    (!Number.isFinite(value) || value < 0 || value > 100)
  ) {
    issue(
      issues,
      'percentage_range',
      path,
      'A percentage must be null or between 0 and 100.',
    )
  }
}

function nullablePosition(
  value: number | null,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    issue(
      issues,
      'positive_integer',
      path,
      'A position must be null or a positive integer.',
    )
  }
}

function distance(
  value: number,
  maximum: number,
  path: string,
  issues: ReplayValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0 || value > maximum + 0.001) {
    issue(
      issues,
      'distance_range',
      path,
      `Distance must be between 0 and ${maximum} km.`,
    )
  }
}

function uniqueStrings(
  values: readonly string[],
  path: string,
  issues: ReplayValidationIssue[],
): Set<string> {
  const seen = new Set<string>()

  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`

    if (!value.trim()) {
      issue(issues, 'required_identifier', itemPath, 'A non-empty identifier is required.')
    } else if (seen.has(value)) {
      issue(issues, 'duplicate_identifier', itemPath, `Duplicate identifier: ${value}.`)
    } else {
      seen.add(value)
    }
  })

  return seen
}

function validateFrame(
  frame: ReplayFrame,
  frameIndex: number,
  model: ReplayStageModel,
  issues: ReplayValidationIssue[],
): void {
  const path = `frames[${frameIndex}]`

  if (!Number.isInteger(frame.frameNumber) || frame.frameNumber < 0) {
    issue(issues, 'frame_number', `${path}.frameNumber`, 'Frame number must be a non-negative integer.')
  }

  nonNegative(frame.raceSecond, `${path}.raceSecond`, issues)

  if (frame.raceSecond > model.durationSeconds) {
    issue(issues, 'frame_after_duration', `${path}.raceSecond`, 'Frame time cannot exceed replay duration.')
  }

  if (!Number.isFinite(frame.progress) || frame.progress < 0 || frame.progress > 1) {
    issue(issues, 'frame_progress', `${path}.progress`, 'Frame progress must be between 0 and 1.')
  }

  distance(frame.leaderDistanceKm, model.distanceKm, `${path}.leaderDistanceKm`, issues)

  const riderIds = uniqueStrings(
    frame.riders.map((rider) => rider.riderId),
    `${path}.riders.*.riderId`,
    issues,
  )

  const groupIds = uniqueStrings(
    frame.groups.map((group) => group.groupId),
    `${path}.groups.*.groupId`,
    issues,
  )

  const positions = new Set<number>()

  frame.riders.forEach((rider, riderIndex) => {
    const riderPath = `${path}.riders[${riderIndex}]`

    requiredText(rider.riderId, `${riderPath}.riderId`, issues)
    requiredText(rider.teamId, `${riderPath}.teamId`, issues)
    requiredText(rider.riderName, `${riderPath}.riderName`, issues)
    requiredText(rider.teamName, `${riderPath}.teamName`, issues)

    distance(rider.distanceKm, model.distanceKm, `${riderPath}.distanceKm`, issues)
    nullableNonNegative(rider.speedKmh, `${riderPath}.speedKmh`, issues)
    nullableNonNegative(rider.gapToLeaderSeconds, `${riderPath}.gapToLeaderSeconds`, issues)
    nullableNonNegative(
      rider.gapToPreviousRiderSeconds,
      `${riderPath}.gapToPreviousRiderSeconds`,
      issues,
    )
    nullablePosition(rider.position, `${riderPath}.position`, issues)
    nullablePercent(rider.staminaPercent, `${riderPath}.staminaPercent`, issues)
    nullablePercent(rider.fatiguePercent, `${riderPath}.fatiguePercent`, issues)
    nullableNonNegative(rider.finishTimeSeconds, `${riderPath}.finishTimeSeconds`, issues)
    nullablePosition(rider.finishPosition, `${riderPath}.finishPosition`, issues)

    if (rider.status === 'racing' && rider.groupId === null) {
      issue(
        issues,
        'racing_rider_missing_group',
        `${riderPath}.groupId`,
        'A racing rider must belong to an authoritative group.',
      )
    }

    if (rider.groupId !== null && !groupIds.has(rider.groupId)) {
      issue(
        issues,
        'unknown_rider_group',
        `${riderPath}.groupId`,
        `Rider references unknown group ${rider.groupId}.`,
      )
    }

    if (
      rider.status === 'finished' &&
      (rider.finishTimeSeconds === null || rider.finishPosition === null)
    ) {
      issue(
        issues,
        'finished_rider_missing_result',
        riderPath,
        'A finished rider must have finish time and finish position.',
      )
    }

    if (rider.position !== null) {
      if (positions.has(rider.position)) {
        issue(
          issues,
          'duplicate_frame_position',
          `${riderPath}.position`,
          `Duplicate rider position: ${rider.position}.`,
        )
      }
      positions.add(rider.position)
    }
  })

  const groupOrders = new Set<number>()
  const membershipByRiderId = new Map<string, string>()

  frame.groups.forEach((group, groupIndex) => {
    const groupPath = `${path}.groups[${groupIndex}]`

    requiredText(group.groupId, `${groupPath}.groupId`, issues)
    requiredText(group.label, `${groupPath}.label`, issues)

    if (!Number.isInteger(group.order) || group.order <= 0) {
      issue(issues, 'group_order', `${groupPath}.order`, 'Group order must be a positive integer.')
    } else if (groupOrders.has(group.order)) {
      issue(issues, 'duplicate_group_order', `${groupPath}.order`, `Duplicate group order: ${group.order}.`)
    }
    groupOrders.add(group.order)

    distance(group.distanceKm, model.distanceKm, `${groupPath}.distanceKm`, issues)
    nullableNonNegative(group.speedKmh, `${groupPath}.speedKmh`, issues)
    nonNegative(group.gapToLeaderSeconds, `${groupPath}.gapToLeaderSeconds`, issues)
    nullableNonNegative(
      group.gapToPreviousGroupSeconds,
      `${groupPath}.gapToPreviousGroupSeconds`,
      issues,
    )

    uniqueStrings(group.riderIds, `${groupPath}.riderIds`, issues)

    group.riderIds.forEach((riderId, riderIndex) => {
      const riderPath = `${groupPath}.riderIds[${riderIndex}]`

      if (!riderIds.has(riderId)) {
        issue(issues, 'unknown_group_rider', riderPath, `Group references unknown rider ${riderId}.`)
      }

      const existingGroupId = membershipByRiderId.get(riderId)
      if (existingGroupId && existingGroupId !== group.groupId) {
        issue(
          issues,
          'rider_in_multiple_groups',
          riderPath,
          `Rider ${riderId} appears in groups ${existingGroupId} and ${group.groupId}.`,
        )
      }

      membershipByRiderId.set(riderId, group.groupId)
    })
  })

  frame.riders.forEach((rider, riderIndex) => {
    const membership = membershipByRiderId.get(rider.riderId) ?? null

    if (membership !== rider.groupId) {
      issue(
        issues,
        'group_membership_mismatch',
        `${path}.riders[${riderIndex}].groupId`,
        `Rider group ${String(rider.groupId)} does not match group membership ${String(membership)}.`,
      )
    }
  })
}

function validateEvent(
  event: ReplayEvent,
  eventIndex: number,
  model: ReplayStageModel,
  issues: ReplayValidationIssue[],
): void {
  const path = `events[${eventIndex}]`

  requiredText(event.id, `${path}.id`, issues)
  requiredText(event.type, `${path}.type`, issues)

  if (!Number.isInteger(event.sequenceNumber) || event.sequenceNumber <= 0) {
    issue(issues, 'event_sequence', `${path}.sequenceNumber`, 'Event sequence must be a positive integer.')
  }

  nonNegative(event.raceSecond, `${path}.raceSecond`, issues)
  distance(event.kilometre, model.distanceKm, `${path}.kilometre`, issues)
  uniqueStrings(event.riderIds, `${path}.riderIds`, issues)

  if (event.raceSecond > model.durationSeconds) {
    issue(issues, 'event_after_duration', `${path}.raceSecond`, 'Event time cannot exceed replay duration.')
  }
}

function validateFinalResult(
  result: ReplayFinalResult,
  resultIndex: number,
  issues: ReplayValidationIssue[],
): void {
  const path = `finalResults[${resultIndex}]`

  requiredText(result.riderId, `${path}.riderId`, issues)
  requiredText(result.teamId, `${path}.teamId`, issues)
  requiredText(result.riderName, `${path}.riderName`, issues)
  requiredText(result.teamName, `${path}.teamName`, issues)
  nullableNonNegative(result.finishTimeSeconds, `${path}.finishTimeSeconds`, issues)
  nullablePosition(result.finishPosition, `${path}.finishPosition`, issues)

  if (
    result.status === 'finished' &&
    (result.finishTimeSeconds === null || result.finishPosition === null)
  ) {
    issue(
      issues,
      'finished_result_incomplete',
      path,
      'A finished result must have finish time and finish position.',
    )
  }

  if (result.status !== 'finished' && result.finishPosition !== null) {
    issue(
      issues,
      'non_finisher_has_position',
      `${path}.finishPosition`,
      'Only finished riders may have a finish position.',
    )
  }
}

/** Validate the complete generic replay model and return every discovered issue. */
export function validateReplayStageModel(
  model: ReplayStageModel,
): ReplayValidationResult {
  const issues: ReplayValidationIssue[] = []

  if (model.contractVersion !== 'race_replay_view_model_v1') {
    issue(issues, 'contract_version', 'contractVersion', 'Unsupported replay contract version.')
  }

  requiredText(model.raceId, 'raceId', issues)
  requiredText(model.stageId, 'stageId', issues)
  requiredText(model.stageName, 'stageName', issues)
  requiredText(model.engineVersion, 'engineVersion', issues)
  requiredText(model.simulationMode, 'simulationMode', issues)
  requiredText(model.seed, 'seed', issues)

  if (!Number.isFinite(model.distanceKm) || model.distanceKm <= 0) {
    issue(issues, 'stage_distance', 'distanceKm', 'Stage distance must be greater than zero.')
  }

  nonNegative(model.durationSeconds, 'durationSeconds', issues)

  if (model.profilePoints.length < 2) {
    issue(issues, 'profile_points', 'profilePoints', 'At least two profile points are required.')
  }

  let previousProfileKm = Number.NEGATIVE_INFINITY
  model.profilePoints.forEach((point, pointIndex) => {
    const path = `profilePoints[${pointIndex}]`
    distance(point.kilometre, model.distanceKm, `${path}.kilometre`, issues)

    if (!Number.isFinite(point.elevationMetres)) {
      issue(issues, 'profile_elevation', `${path}.elevationMetres`, 'Profile elevation must be finite.')
    }

    if (point.kilometre <= previousProfileKm) {
      issue(issues, 'profile_order', `${path}.kilometre`, 'Profile kilometres must be strictly increasing.')
    }

    previousProfileKm = point.kilometre
  })

  if (model.frames.length === 0) {
    issue(issues, 'missing_frames', 'frames', 'At least one replay frame is required.')
  }

  const expectedRiderIds = new Set(
    model.frames[0]?.riders.map((rider) => rider.riderId) ?? [],
  )
  const identityByRiderId = new Map<string, string>()

  model.frames.forEach((frame, frameIndex) => {
    validateFrame(frame, frameIndex, model, issues)

    const previousFrame = model.frames[frameIndex - 1]
    if (previousFrame) {
      if (frame.frameNumber <= previousFrame.frameNumber) {
        issue(issues, 'frame_order', `frames[${frameIndex}].frameNumber`, 'Frame numbers must be strictly increasing.')
      }
      if (frame.raceSecond <= previousFrame.raceSecond) {
        issue(issues, 'frame_time_order', `frames[${frameIndex}].raceSecond`, 'Frame times must be strictly increasing.')
      }
      if (frame.progress < previousFrame.progress) {
        issue(issues, 'frame_progress_order', `frames[${frameIndex}].progress`, 'Frame progress cannot decrease.')
      }
      if (frame.leaderDistanceKm < previousFrame.leaderDistanceKm) {
        issue(issues, 'leader_distance_order', `frames[${frameIndex}].leaderDistanceKm`, 'Leader distance cannot decrease.')
      }
    }

    const currentRiderIds = new Set(frame.riders.map((rider) => rider.riderId))
    if (
      currentRiderIds.size !== expectedRiderIds.size ||
      Array.from(expectedRiderIds).some((riderId) => !currentRiderIds.has(riderId))
    ) {
      issue(
        issues,
        'frame_rider_coverage',
        `frames[${frameIndex}].riders`,
        'Every frame must contain the same riders.',
      )
    }

    frame.riders.forEach((rider, riderIndex) => {
      const identity = `${rider.teamId}|${rider.riderName}|${rider.teamName}`
      const previousIdentity = identityByRiderId.get(rider.riderId)

      if (previousIdentity && previousIdentity !== identity) {
        issue(
          issues,
          'unstable_rider_identity',
          `frames[${frameIndex}].riders[${riderIndex}]`,
          `Rider ${rider.riderId} changed team or display identity between frames.`,
        )
      } else {
        identityByRiderId.set(rider.riderId, identity)
      }
    })
  })

  uniqueStrings(model.events.map((event) => event.id), 'events.*.id', issues)

  const eventBySequence = new Map<number, ReplayEvent>()
  model.events.forEach((event, eventIndex) => {
    validateEvent(event, eventIndex, model, issues)

    const previousEvent = model.events[eventIndex - 1]
    if (previousEvent) {
      if (event.sequenceNumber <= previousEvent.sequenceNumber) {
        issue(issues, 'event_order', `events[${eventIndex}].sequenceNumber`, 'Event sequences must increase.')
      }
      if (event.raceSecond < previousEvent.raceSecond) {
        issue(issues, 'event_time_order', `events[${eventIndex}].raceSecond`, 'Event times cannot decrease.')
      }
    }

    if (eventBySequence.has(event.sequenceNumber)) {
      issue(
        issues,
        'duplicate_event_sequence',
        `events[${eventIndex}].sequenceNumber`,
        `Duplicate event sequence: ${event.sequenceNumber}.`,
      )
    }

    eventBySequence.set(event.sequenceNumber, event)
  })

  model.frames.forEach((frame, frameIndex) => {
    const seenSequences = new Set<number>()

    frame.eventSequenceNumbers.forEach((sequenceNumber, sequenceIndex) => {
      const path = `frames[${frameIndex}].eventSequenceNumbers[${sequenceIndex}]`

      if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
        issue(issues, 'frame_event_sequence', path, 'Event references must be positive integers.')
        return
      }

      if (seenSequences.has(sequenceNumber)) {
        issue(issues, 'duplicate_frame_event', path, `Duplicate event reference: ${sequenceNumber}.`)
      }
      seenSequences.add(sequenceNumber)

      const event = eventBySequence.get(sequenceNumber)
      if (!event) {
        issue(issues, 'unknown_frame_event', path, `Unknown event sequence: ${sequenceNumber}.`)
      } else if (event.raceSecond > frame.raceSecond) {
        issue(issues, 'future_frame_event', path, 'A frame cannot reference a future event.')
      }
    })
  })

  const finalRiderIds = uniqueStrings(
    model.finalResults.map((result) => result.riderId),
    'finalResults.*.riderId',
    issues,
  )
  const finishPositions = new Set<number>()
  let latestFinishTime = 0

  model.finalResults.forEach((result, resultIndex) => {
    validateFinalResult(result, resultIndex, issues)

    if (result.finishPosition !== null) {
      if (finishPositions.has(result.finishPosition)) {
        issue(
          issues,
          'duplicate_finish_position',
          `finalResults[${resultIndex}].finishPosition`,
          `Duplicate finish position: ${result.finishPosition}.`,
        )
      }
      finishPositions.add(result.finishPosition)
    }

    if (result.finishTimeSeconds !== null) {
      latestFinishTime = Math.max(latestFinishTime, result.finishTimeSeconds)
    }
  })

  if (
    finalRiderIds.size !== expectedRiderIds.size ||
    Array.from(expectedRiderIds).some((riderId) => !finalRiderIds.has(riderId))
  ) {
    issue(
      issues,
      'final_result_coverage',
      'finalResults',
      'Final results must contain exactly one row for every replay rider.',
    )
  }

  const lastFrame = model.frames[model.frames.length - 1]
  if (lastFrame && model.durationSeconds < lastFrame.raceSecond) {
    issue(
      issues,
      'duration_before_last_frame',
      'durationSeconds',
      'Replay duration cannot be shorter than the last frame time.',
    )
  }

  if (model.durationSeconds < latestFinishTime) {
    issue(
      issues,
      'duration_before_finish',
      'durationSeconds',
      'Replay duration cannot be shorter than the latest finish time.',
    )
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

/** Throw a readable error when runtime validation fails. */
export function assertValidReplayStageModel(model: ReplayStageModel): void {
  const result = validateReplayStageModel(model)
  if (result.valid) return

  throw new Error(
    `Invalid replay stage model:\n${result.issues
      .map((validationIssue) => `${validationIssue.path}: ${validationIssue.message}`)
      .join('\n')}`,
  )
}
