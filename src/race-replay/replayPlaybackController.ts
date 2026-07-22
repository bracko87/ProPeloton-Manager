/**
 * replayPlaybackController.ts
 *
 * Pure playback state transitions and display-safe interpolation for an
 * already-calculated ReplayStageModel.
 *
 * This module does not import React, run the race engine, access Supabase,
 * read the database, create timers, or mutate the replay model.
 */

import type {
  ReplayEvent,
  ReplayFrame,
  ReplayGroupFrame,
  ReplayGroupType,
  ReplayPlaybackSpeed,
  ReplayPlaybackState,
  ReplayRiderFrame,
  ReplayRiderStatus,
  ReplayStageModel,
} from './replayTypes'

export interface CreateReplayPlaybackStateOptions {
  readonly initialSpeed?: ReplayPlaybackSpeed
  readonly initialRaceSecond?: number
  readonly autoPlay?: boolean
}

export interface ReplayInterpolatedRider {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string

  readonly status: ReplayRiderStatus
  readonly fromGroupId: string | null
  readonly toGroupId: string | null

  readonly distanceKm: number
  readonly speedKmh: number | null
  readonly gapToLeaderSeconds: number | null
  readonly gapToPreviousRiderSeconds: number | null
  readonly position: number | null
  readonly staminaPercent: number | null
  readonly fatiguePercent: number | null
  readonly finishTimeSeconds: number | null
  readonly finishPosition: number | null
}

export interface ReplayInterpolatedGroup {
  readonly groupId: string
  readonly type: ReplayGroupType
  readonly label: string
  readonly order: number
  readonly riderIds: readonly string[]

  readonly distanceKm: number
  readonly speedKmh: number | null
  readonly gapToLeaderSeconds: number
  readonly gapToPreviousGroupSeconds: number | null

  readonly active: boolean
  readonly remainsPresentInNextFrame: boolean
}

export interface ReplayPlaybackView {
  readonly currentFrame: ReplayFrame
  readonly nextFrame: ReplayFrame | null
  readonly frameInterpolation: number

  readonly displayRaceSecond: number
  readonly displayProgress: number
  readonly displayLeaderDistanceKm: number

  readonly riders: readonly ReplayInterpolatedRider[]
  readonly groups: readonly ReplayInterpolatedGroup[]

  readonly visibleEvents: readonly ReplayEvent[]
  readonly currentFrameEvents: readonly ReplayEvent[]
}

const PLAYBACK_SPEEDS: readonly ReplayPlaybackSpeed[] = [
  1,
  2,
  4,
  8,
]

function fail(message: string): never {
  throw new Error(`replayPlaybackController: ${message}`)
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  )
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${fieldName} must be finite and non-negative.`)
  }
}

function assertPlaybackModel(
  model: ReplayStageModel,
): void {
  if (model.frames.length === 0) {
    fail('ReplayStageModel must contain at least one frame.')
  }

  assertFiniteNonNegative(
    model.durationSeconds,
    'model.durationSeconds',
  )
}

function assertPlaybackSpeed(
  speed: ReplayPlaybackSpeed,
): void {
  if (!PLAYBACK_SPEEDS.includes(speed)) {
    fail(`unsupported playback speed ${String(speed)}.`)
  }
}

function getNormalisedProgress(
  model: ReplayStageModel,
  raceSecond: number,
): number {
  if (model.durationSeconds <= 0) {
    return 1
  }

  return clamp(
    raceSecond / model.durationSeconds,
    0,
    1,
  )
}

function createStateAtRaceSecond(
  model: ReplayStageModel,
  raceSecond: number,
  speed: ReplayPlaybackSpeed,
  playing: boolean,
): ReplayPlaybackState {
  assertPlaybackModel(model)
  assertPlaybackSpeed(speed)
  assertFiniteNonNegative(
    raceSecond,
    'raceSecond',
  )

  const clampedRaceSecond = clamp(
    raceSecond,
    0,
    model.durationSeconds,
  )

  const completed =
    model.durationSeconds <= 0 ||
    clampedRaceSecond >= model.durationSeconds

  return {
    playing:
      playing && !completed,
    speed,
    currentFrameIndex:
      getReplayFrameIndexAtRaceSecond(
        model,
        clampedRaceSecond,
      ),
    currentRaceSecond:
      clampedRaceSecond,
    progress:
      getNormalisedProgress(
        model,
        clampedRaceSecond,
      ),
    completed,
  }
}

/**
 * Resolve the latest authoritative frame whose raceSecond is not later than
 * the supplied playback time.
 */
export function getReplayFrameIndexAtRaceSecond(
  model: ReplayStageModel,
  raceSecond: number,
): number {
  assertPlaybackModel(model)
  assertFiniteNonNegative(
    raceSecond,
    'raceSecond',
  )

  const target = clamp(
    raceSecond,
    0,
    model.durationSeconds,
  )

  let low = 0
  let high = model.frames.length - 1
  let answer = 0

  while (low <= high) {
    const middle = Math.floor(
      (low + high) / 2,
    )

    const frame = model.frames[middle]
    if (!frame) {
      fail(`missing frame at index ${middle}.`)
    }

    if (frame.raceSecond <= target) {
      answer = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return answer
}

/** Create the initial immutable playback state. */
export function createReplayPlaybackState(
  model: ReplayStageModel,
  options: CreateReplayPlaybackStateOptions = {},
): ReplayPlaybackState {
  const speed =
    options.initialSpeed ?? 1

  const initialRaceSecond =
    options.initialRaceSecond ?? 0

  return createStateAtRaceSecond(
    model,
    initialRaceSecond,
    speed,
    options.autoPlay ?? false,
  )
}

/** Start or resume playback. Replaying from the end starts again at zero. */
export function playReplay(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
): ReplayPlaybackState {
  const raceSecond = state.completed
    ? 0
    : state.currentRaceSecond

  return createStateAtRaceSecond(
    model,
    raceSecond,
    state.speed,
    true,
  )
}

/** Pause playback without moving the replay clock. */
export function pauseReplay(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
): ReplayPlaybackState {
  return createStateAtRaceSecond(
    model,
    state.currentRaceSecond,
    state.speed,
    false,
  )
}

/** Change between the supported literal 1x, 2x, 4x, and 8x speeds. */
export function setReplayPlaybackSpeed(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
  speed: ReplayPlaybackSpeed,
): ReplayPlaybackState {
  assertPlaybackSpeed(speed)

  return createStateAtRaceSecond(
    model,
    state.currentRaceSecond,
    speed,
    state.playing,
  )
}

/** Seek to an exact replay time while preserving play/pause state. */
export function seekReplayToRaceSecond(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
  raceSecond: number,
): ReplayPlaybackState {
  return createStateAtRaceSecond(
    model,
    raceSecond,
    state.speed,
    state.playing,
  )
}

/** Seek to a normalised 0..1 replay progress value. */
export function seekReplayToProgress(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
  progress: number,
): ReplayPlaybackState {
  if (!Number.isFinite(progress)) {
    fail('progress must be finite.')
  }

  return seekReplayToRaceSecond(
    model,
    state,
    clamp(progress, 0, 1) *
      model.durationSeconds,
  )
}

/** Seek to one authoritative frame while preserving play/pause state. */
export function seekReplayToFrame(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
  frameIndex: number,
): ReplayPlaybackState {
  if (!Number.isInteger(frameIndex)) {
    fail('frameIndex must be an integer.')
  }

  const clampedFrameIndex = clamp(
    frameIndex,
    0,
    model.frames.length - 1,
  )

  const frame =
    model.frames[clampedFrameIndex]

  if (!frame) {
    fail(`missing frame at index ${clampedFrameIndex}.`)
  }

  return seekReplayToRaceSecond(
    model,
    state,
    frame.raceSecond,
  )
}

/** Jump to the completed end state. */
export function finishReplay(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
): ReplayPlaybackState {
  return createStateAtRaceSecond(
    model,
    model.durationSeconds,
    state.speed,
    false,
  )
}

/** Return to the beginning while preserving the selected speed. */
export function resetReplay(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
): ReplayPlaybackState {
  return createStateAtRaceSecond(
    model,
    0,
    state.speed,
    false,
  )
}

/**
 * Advance an already-playing replay by real elapsed seconds.
 *
 * The race engine is never called here. One real second advances the replay by
 * speed race seconds, so 8x advances eight replay seconds per real second.
 */
export function advanceReplayPlayback(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
  realElapsedSeconds: number,
): ReplayPlaybackState {
  assertFiniteNonNegative(
    realElapsedSeconds,
    'realElapsedSeconds',
  )

  if (
    !state.playing ||
    state.completed ||
    realElapsedSeconds === 0
  ) {
    return state
  }

  const nextRaceSecond =
    state.currentRaceSecond +
    realElapsedSeconds * state.speed

  return createStateAtRaceSecond(
    model,
    nextRaceSecond,
    state.speed,
    true,
  )
}

function interpolateNumber(
  start: number,
  end: number,
  fraction: number,
): number {
  return start +
    (end - start) * fraction
}

function interpolateNullableNumber(
  start: number | null,
  end: number | null,
  fraction: number,
): number | null {
  if (start === null || end === null) {
    return null
  }

  return interpolateNumber(
    start,
    end,
    fraction,
  )
}

function createInterpolatedRiders(
  currentFrame: ReplayFrame,
  nextFrame: ReplayFrame | null,
  fraction: number,
): readonly ReplayInterpolatedRider[] {
  const nextByRiderId = new Map(
    nextFrame?.riders.map(
      (rider) => [
        rider.riderId,
        rider,
      ] as const,
    ) ?? [],
  )

  return currentFrame.riders.map(
    (
      currentRider: ReplayRiderFrame,
    ) => {
      const nextRider =
        nextByRiderId.get(
          currentRider.riderId,
        ) ?? currentRider

      return {
        riderId:
          currentRider.riderId,
        teamId:
          currentRider.teamId,
        riderName:
          currentRider.riderName,
        teamName:
          currentRider.teamName,
        status:
          currentRider.status,
        fromGroupId:
          currentRider.groupId,
        toGroupId:
          nextRider.groupId,
        distanceKm:
          interpolateNumber(
            currentRider.distanceKm,
            nextRider.distanceKm,
            fraction,
          ),
        speedKmh:
          interpolateNullableNumber(
            currentRider.speedKmh,
            nextRider.speedKmh,
            fraction,
          ),
        gapToLeaderSeconds:
          interpolateNullableNumber(
            currentRider
              .gapToLeaderSeconds,
            nextRider
              .gapToLeaderSeconds,
            fraction,
          ),
        gapToPreviousRiderSeconds:
          interpolateNullableNumber(
            currentRider
              .gapToPreviousRiderSeconds,
            nextRider
              .gapToPreviousRiderSeconds,
            fraction,
          ),
        position:
          currentRider.position,
        staminaPercent:
          interpolateNullableNumber(
            currentRider
              .staminaPercent,
            nextRider
              .staminaPercent,
            fraction,
          ),
        fatiguePercent:
          interpolateNullableNumber(
            currentRider
              .fatiguePercent,
            nextRider
              .fatiguePercent,
            fraction,
          ),
        finishTimeSeconds:
          currentRider
            .finishTimeSeconds,
        finishPosition:
          currentRider
            .finishPosition,
      }
    },
  )
}

function createInterpolatedGroups(
  currentFrame: ReplayFrame,
  nextFrame: ReplayFrame | null,
  fraction: number,
): readonly ReplayInterpolatedGroup[] {
  const nextByGroupId = new Map(
    nextFrame?.groups.map(
      (group) => [
        group.groupId,
        group,
      ] as const,
    ) ?? [],
  )

  return currentFrame.groups.map(
    (
      currentGroup: ReplayGroupFrame,
    ) => {
      const nextGroup =
        nextByGroupId.get(
          currentGroup.groupId,
        )

      const interpolationTarget =
        nextGroup ?? currentGroup

      return {
        groupId:
          currentGroup.groupId,
        type:
          currentGroup.type,
        label:
          currentGroup.label,
        order:
          currentGroup.order,
        riderIds:
          currentGroup.riderIds.slice(),
        distanceKm:
          interpolateNumber(
            currentGroup.distanceKm,
            interpolationTarget
              .distanceKm,
            fraction,
          ),
        speedKmh:
          interpolateNullableNumber(
            currentGroup.speedKmh,
            interpolationTarget
              .speedKmh,
            fraction,
          ),
        gapToLeaderSeconds:
          interpolateNumber(
            currentGroup
              .gapToLeaderSeconds,
            interpolationTarget
              .gapToLeaderSeconds,
            fraction,
          ),
        gapToPreviousGroupSeconds:
          interpolateNullableNumber(
            currentGroup
              .gapToPreviousGroupSeconds,
            interpolationTarget
              .gapToPreviousGroupSeconds,
            fraction,
          ),
        active:
          currentGroup.active,
        remainsPresentInNextFrame:
          nextGroup !== undefined,
      }
    },
  )
}

/**
 * Build the presentation-facing view for the current playback time.
 *
 * Continuous numeric display values are linearly interpolated only between two
 * authoritative snapshots. Identity, status, membership, ranking, and finish
 * fields remain anchored to the current authoritative frame.
 */
export function getReplayPlaybackView(
  model: ReplayStageModel,
  state: ReplayPlaybackState,
): ReplayPlaybackView {
  assertPlaybackModel(model)

  const currentFrame =
    model.frames[
      getReplayFrameIndexAtRaceSecond(
        model,
        state.currentRaceSecond,
      )
    ]

  if (!currentFrame) {
    fail('could not resolve the current frame.')
  }

  const nextFrame =
    model.frames[
      getReplayFrameIndexAtRaceSecond(
        model,
        state.currentRaceSecond,
      ) + 1
    ] ?? null

  let frameInterpolation = 0

  if (nextFrame) {
    const frameDuration =
      nextFrame.raceSecond -
      currentFrame.raceSecond

    if (frameDuration > 0) {
      frameInterpolation = clamp(
        (
          state.currentRaceSecond -
          currentFrame.raceSecond
        ) / frameDuration,
        0,
        1,
      )
    }
  }

  const displayProgress = nextFrame
    ? interpolateNumber(
        currentFrame.progress,
        nextFrame.progress,
        frameInterpolation,
      )
    : state.completed
      ? 1
      : currentFrame.progress

  const displayLeaderDistanceKm = nextFrame
    ? interpolateNumber(
        currentFrame.leaderDistanceKm,
        nextFrame.leaderDistanceKm,
        frameInterpolation,
      )
    : currentFrame.leaderDistanceKm

  const eventBySequence = new Map(
    model.events.map(
      (event) => [
        event.sequenceNumber,
        event,
      ] as const,
    ),
  )

  return {
    currentFrame,
    nextFrame,
    frameInterpolation,
    displayRaceSecond:
      state.currentRaceSecond,
    displayProgress,
    displayLeaderDistanceKm,
    riders:
      createInterpolatedRiders(
        currentFrame,
        nextFrame,
        frameInterpolation,
      ),
    groups:
      createInterpolatedGroups(
        currentFrame,
        nextFrame,
        frameInterpolation,
      ),
    visibleEvents:
      model.events.filter(
        (event) =>
          event.raceSecond <=
          state.currentRaceSecond,
      ),
    currentFrameEvents:
      currentFrame
        .eventSequenceNumbers
        .map(
          (sequenceNumber) =>
            eventBySequence.get(
              sequenceNumber,
            ),
        )
        .filter(
          (
            event,
          ): event is ReplayEvent =>
            event !== undefined,
        ),
  }
}
