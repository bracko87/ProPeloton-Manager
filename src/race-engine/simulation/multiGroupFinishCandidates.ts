/**
 * multiGroupFinishCandidates.ts
 *
 * Pure deterministic detection of riders whose current group has reached the
 * stage finish.
 *
 * Optional sub-tick interpolation uses the movement proposal from the crossing
 * tick. Existing one-argument callers preserve the original tick-end rule.
 *
 * This utility does not mutate SimulationState, mark riders as finished,
 * create events, create final results, or complete the race.
 */

import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RiderState,
} from '../domain/RiderState'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  MultiGroupMovementProposal,
  MultiGroupMovementResult,
} from './multiGroupMovement'

export type MultiGroupFinishTimingRule =
  | 'tick_end_v1'
  | 'sub_tick_group_crossing_v1'

export interface DetectMultiGroupFinishCandidatesOptions {
  /**
   * Required when subTickInterpolationEnabled is true.
   */
  readonly movement?:
    MultiGroupMovementResult

  /**
   * Disabled by default for backward compatibility.
   */
  readonly subTickInterpolationEnabled?:
    boolean
}

export interface MultiGroupFinishCandidate {
  readonly riderId: string
  readonly riderName: string
  readonly teamId: string
  readonly teamName: string
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly groupDistanceKm: number
  readonly groupGapFromLeaderSeconds: number

  /**
   * Tick-end simulation clock. Race events continue using this integer clock.
   */
  readonly raceSecond: number

  readonly sprintScore: number
  readonly accelerationScore: number
  readonly energy: number

  /**
   * Optional-compatible finish timing fields.
   *
   * Existing callers receive tick-end values. Interpolation-enabled callers
   * receive the exact group crossing estimate inside the current tick.
   */
  readonly finishTimingRule?:
    MultiGroupFinishTimingRule
  readonly finishTimeSeconds?: number
  readonly previousRaceSecond?: number
  readonly tickSeconds?: number
  readonly previousDistanceKm?: number
  readonly projectedNextDistanceKm?: number
  readonly crossingFraction?: number
}

export interface MultiGroupFinishCandidateResult {
  readonly stageDistanceKm: number
  readonly raceSecond: number
  readonly previousRaceSecond?: number
  readonly tickSeconds?: number
  readonly finishTimingRule?:
    MultiGroupFinishTimingRule
  readonly finishedGroupIds:
    readonly string[]
  readonly candidateRiderIds:
    readonly string[]
  readonly candidates:
    readonly MultiGroupFinishCandidate[]
}

interface GroupFinishTiming {
  readonly finishTimingRule:
    MultiGroupFinishTimingRule
  readonly finishTimeSeconds: number
  readonly previousRaceSecond: number
  readonly tickSeconds: number
  readonly previousDistanceKm: number
  readonly projectedNextDistanceKm: number
  readonly crossingFraction: number
}

const PRECISION_DIGITS =
  9

function normalizePrecision(
  value: number,
): number {
  return Number(
    value.toFixed(
      PRECISION_DIGITS,
    ),
  )
}

function clamp01(
  value: number,
): number {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  )
}

/**
 * Legacy ordering remains unchanged when interpolation is disabled.
 *
 * Interpolated ordering:
 * - earlier exact finish time;
 * - higher sprint;
 * - higher acceleration;
 * - higher remaining energy;
 * - riderId lexical fallback.
 */
function compareCandidates(
  candidateA:
    MultiGroupFinishCandidate,
  candidateB:
    MultiGroupFinishCandidate,
): number {
  const interpolated =
    candidateA.finishTimingRule ===
      'sub_tick_group_crossing_v1' ||
    candidateB.finishTimingRule ===
      'sub_tick_group_crossing_v1'

  if (interpolated) {
    if (
      (
        candidateA.finishTimeSeconds ??
        candidateA.raceSecond
      ) !==
      (
        candidateB.finishTimeSeconds ??
        candidateB.raceSecond
      )
    ) {
      return (
        (
          candidateA.finishTimeSeconds ??
          candidateA.raceSecond
        ) -
        (
          candidateB.finishTimeSeconds ??
          candidateB.raceSecond
        )
      )
    }

    if (
      candidateA.sprintScore !==
      candidateB.sprintScore
    ) {
      return (
        candidateB.sprintScore -
        candidateA.sprintScore
      )
    }

    if (
      candidateA.accelerationScore !==
      candidateB.accelerationScore
    ) {
      return (
        candidateB.accelerationScore -
        candidateA.accelerationScore
      )
    }

    if (
      candidateA.energy !==
      candidateB.energy
    ) {
      return (
        candidateB.energy -
        candidateA.energy
      )
    }

    return candidateA.riderId
      .localeCompare(
        candidateB.riderId,
      )
  }

  if (
    candidateA.groupDistanceKm !==
    candidateB.groupDistanceKm
  ) {
    return (
      candidateB.groupDistanceKm -
      candidateA.groupDistanceKm
    )
  }

  if (
    candidateA.groupGapFromLeaderSeconds !==
    candidateB.groupGapFromLeaderSeconds
  ) {
    return (
      candidateA.groupGapFromLeaderSeconds -
      candidateB.groupGapFromLeaderSeconds
    )
  }

  if (
    candidateA.groupId !==
    candidateB.groupId
  ) {
    return candidateA.groupId
      .localeCompare(
        candidateB.groupId,
      )
  }

  if (
    candidateA.sprintScore !==
    candidateB.sprintScore
  ) {
    return (
      candidateB.sprintScore -
      candidateA.sprintScore
    )
  }

  if (
    candidateA.accelerationScore !==
    candidateB.accelerationScore
  ) {
    return (
      candidateB.accelerationScore -
      candidateA.accelerationScore
    )
  }

  if (
    candidateA.energy !==
    candidateB.energy
  ) {
    return (
      candidateB.energy -
      candidateA.energy
    )
  }

  return candidateA.riderId
    .localeCompare(
      candidateB.riderId,
    )
}

function getRacingRider(
  state: SimulationState,
  group: GroupState,
  riderId: string,
): RiderState | null {
  const rider =
    state.riders[
      riderId
    ]

  if (!rider) {
    throw new Error(
      `detectMultiGroupFinishCandidates: group ${group.groupId} references missing rider ${riderId}.`,
    )
  }

  if (
    rider.currentGroupId !==
    group.groupId
  ) {
    throw new Error(
      `detectMultiGroupFinishCandidates: rider ${riderId} membership does not match group ${group.groupId}.`,
    )
  }

  if (
    rider.stageStatus !==
    'racing'
  ) {
    return null
  }

  return rider
}

function createProposalMap(
  movement:
    MultiGroupMovementResult,
): Readonly<
  Record<
    string,
    MultiGroupMovementProposal
  >
> {
  const map:
    Record<
      string,
      MultiGroupMovementProposal
    > = {}

  for (
    const proposal of
    movement.proposals
  ) {
    if (
      map[
        proposal.groupId
      ]
    ) {
      throw new Error(
        `detectMultiGroupFinishCandidates: duplicate movement proposal for ${proposal.groupId}.`,
      )
    }

    map[
      proposal.groupId
    ] =
      proposal
  }

  return map
}

function legacyTiming(
  state:
    SimulationState,
): GroupFinishTiming {
  const tickSeconds =
    state.input.settings
      .tickSeconds

  return {
    finishTimingRule:
      'tick_end_v1',
    finishTimeSeconds:
      state.raceSecond,
    previousRaceSecond:
      Math.max(
        0,
        state.raceSecond -
          tickSeconds,
      ),
    tickSeconds,
    previousDistanceKm:
      state.stageDistanceKm,
    projectedNextDistanceKm:
      state.stageDistanceKm,
    crossingFraction: 1,
  }
}

function interpolatedTiming(
  state:
    SimulationState,
  movement:
    MultiGroupMovementResult,
  proposal:
    MultiGroupMovementProposal,
): GroupFinishTiming {
  if (
    !Number.isFinite(
      movement.tickSeconds,
    ) ||
    movement.tickSeconds <= 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: movement.tickSeconds must be finite and positive.',
    )
  }

  if (
    movement.tickSeconds !==
    state.input.settings
      .tickSeconds
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: movement tick duration does not match the simulation setting.',
    )
  }

  const previousRaceSecond =
    state.raceSecond -
    movement.tickSeconds

  if (
    !Number.isFinite(
      previousRaceSecond,
    ) ||
    previousRaceSecond < 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: interpolated previousRaceSecond is invalid.',
    )
  }

  const previousDistanceKm =
    proposal.previousDistanceKm

  const projectedNextDistanceKm =
    previousDistanceKm +
    proposal.appliedSpeedKmh *
      (
        movement.tickSeconds /
        3600
      )

  if (
    !Number.isFinite(
      previousDistanceKm,
    ) ||
    !Number.isFinite(
      projectedNextDistanceKm,
    )
  ) {
    throw new Error(
      `detectMultiGroupFinishCandidates: movement distances are invalid for ${proposal.groupId}.`,
    )
  }

  if (
    projectedNextDistanceKm +
      0.000000001 <
    state.stageDistanceKm
  ) {
    throw new Error(
      `detectMultiGroupFinishCandidates: proposal ${proposal.groupId} did not project across the finish.`,
    )
  }

  const projectedAdvanceKm =
    projectedNextDistanceKm -
    previousDistanceKm

  const crossingFraction =
    previousDistanceKm >=
      state.stageDistanceKm
      ? 0
      : (
          projectedAdvanceKm >
          0
            ? clamp01(
                (
                  state.stageDistanceKm -
                  previousDistanceKm
                ) /
                  projectedAdvanceKm,
              )
            : 1
        )

  const finishTimeSeconds =
    previousRaceSecond +
    movement.tickSeconds *
      crossingFraction

  return {
    finishTimingRule:
      'sub_tick_group_crossing_v1',
    finishTimeSeconds:
      normalizePrecision(
        finishTimeSeconds,
      ),
    previousRaceSecond,
    tickSeconds:
      movement.tickSeconds,
    previousDistanceKm:
      normalizePrecision(
        previousDistanceKm,
      ),
    projectedNextDistanceKm:
      normalizePrecision(
        projectedNextDistanceKm,
      ),
    crossingFraction:
      normalizePrecision(
        crossingFraction,
      ),
  }
}

/**
 * Detects currently racing riders whose active group reached the finish line.
 *
 * Existing callers may continue to pass only state. To enable interpolation,
 * pass the crossing tick's MultiGroupMovementResult.
 */
export function detectMultiGroupFinishCandidates(
  state: SimulationState,
  options:
    DetectMultiGroupFinishCandidatesOptions = {},
): MultiGroupFinishCandidateResult {
  if (
    !Number.isFinite(
      state.stageDistanceKm,
    ) ||
    state.stageDistanceKm <= 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: stage distance must be finite and greater than 0.',
    )
  }

  if (
    !Number.isFinite(
      state.raceSecond,
    ) ||
    state.raceSecond < 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: raceSecond must be finite and non-negative.',
    )
  }

  const subTickInterpolationEnabled =
    options
      .subTickInterpolationEnabled ??
    false

  if (
    subTickInterpolationEnabled &&
    !options.movement
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: movement is required when sub-tick interpolation is enabled.',
    )
  }

  const proposalByGroupId:
    Readonly<
      Record<
        string,
        MultiGroupMovementProposal
      >
    > =
    subTickInterpolationEnabled &&
    options.movement
      ? createProposalMap(
          options.movement,
        )
      : {}

  const finishedGroups =
    Object.values(
      state.groups,
    )
      .filter(
        (group) =>
          group.active &&
          group.distanceKm >=
            state.stageDistanceKm,
      )
      .slice()
      .sort(
        (
          groupA,
          groupB,
        ) =>
          groupA.groupId
            .localeCompare(
              groupB.groupId,
            ),
      )

  const candidates:
    MultiGroupFinishCandidate[] =
      []

  for (
    const group of
    finishedGroups
  ) {
    const timing =
      subTickInterpolationEnabled &&
      options.movement
        ? (() => {
            const proposal =
              proposalByGroupId[
                group.groupId
              ]

            if (!proposal) {
              throw new Error(
                `detectMultiGroupFinishCandidates: missing crossing proposal for ${group.groupId}.`,
              )
            }

            return interpolatedTiming(
              state,
              options.movement,
              proposal,
            )
          })()
        : legacyTiming(
            state,
          )

    const riderIds =
      group.riderIds
        .slice()
        .sort(
          (
            riderIdA,
            riderIdB,
          ) =>
            riderIdA.localeCompare(
              riderIdB,
            ),
        )

    for (
      const riderId of
      riderIds
    ) {
      const rider =
        getRacingRider(
          state,
          group,
          riderId,
        )

      if (!rider) {
        continue
      }

      candidates.push({
        riderId:
          rider.riderId,
        riderName:
          rider.riderName,
        teamId:
          rider.teamId,
        teamName:
          rider.teamName,
        groupId:
          group.groupId,
        groupType:
          group.groupType,
        groupDistanceKm:
          group.distanceKm,
        groupGapFromLeaderSeconds:
          group
            .gapFromLeaderSeconds,
        raceSecond:
          state.raceSecond,
        sprintScore:
          rider.attributes
            .sprint,
        accelerationScore:
          rider.attributes
            .acceleration,
        energy:
          rider.energy,

        finishTimingRule:
          timing
            .finishTimingRule,
        finishTimeSeconds:
          timing
            .finishTimeSeconds,
        previousRaceSecond:
          timing
            .previousRaceSecond,
        tickSeconds:
          timing.tickSeconds,
        previousDistanceKm:
          timing
            .previousDistanceKm,
        projectedNextDistanceKm:
          timing
            .projectedNextDistanceKm,
        crossingFraction:
          timing
            .crossingFraction,
      })
    }
  }

  candidates.sort(
    compareCandidates,
  )

  const firstTiming =
    candidates[0] ??
    null

  const defaultTickSeconds =
    state.input.settings
      .tickSeconds

  return {
    stageDistanceKm:
      state.stageDistanceKm,
    raceSecond:
      state.raceSecond,
    previousRaceSecond:
      firstTiming
        ?.previousRaceSecond ??
      Math.max(
        0,
        state.raceSecond -
          defaultTickSeconds,
      ),
    tickSeconds:
      firstTiming
        ?.tickSeconds ??
      defaultTickSeconds,
    finishTimingRule:
      subTickInterpolationEnabled
        ? 'sub_tick_group_crossing_v1'
        : 'tick_end_v1',
    finishedGroupIds:
      finishedGroups.map(
        (group) =>
          group.groupId,
      ),
    candidateRiderIds:
      candidates.map(
        (candidate) =>
          candidate.riderId,
      ),
    candidates,
  }
}
