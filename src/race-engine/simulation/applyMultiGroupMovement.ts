/**
 * applyMultiGroupMovement.ts
 *
 * Pure deterministic application of a previously calculated multi-group
 * movement proposal.
 *
 * This utility updates group and rider positions for exactly one simulation
 * tick. It does not finish riders, calculate energy cost, create events, or
 * activate any runtime execution.
 */

import type { GroupState } from '../domain/GroupState'
import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import type {
  MultiGroupMovementProposal,
  MultiGroupMovementResult,
} from './multiGroupMovement'

export interface ApplyMultiGroupMovementInput {
  readonly state: SimulationState
  readonly movement: MultiGroupMovementResult
}

export interface ApplyMultiGroupMovementResult {
  readonly state: SimulationState
  readonly previousRaceSecond: number
  readonly nextRaceSecond: number
  readonly previousCurrentKm: number
  readonly nextCurrentKm: number
  readonly appliedGroupIds: readonly string[]
}

/**
 * assertFiniteNonNegative
 *
 * Ensures a numeric value is finite and non-negative.
 */
function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `applyMultiGroupMovement: ${fieldName} must be finite and non-negative.`,
    )
  }
}

/**
 * getProposalByGroupId
 *
 * Builds a lookup map of proposals by groupId and rejects duplicates.
 */
function getProposalByGroupId(
  proposals: readonly MultiGroupMovementProposal[],
): Readonly<Record<string, MultiGroupMovementProposal>> {
  const entries:
    Array<[string, MultiGroupMovementProposal]> = []

  for (const proposal of proposals) {
    if (
      entries.some(
        ([groupId]) =>
          groupId === proposal.groupId,
      )
    ) {
      throw new Error(
        `applyMultiGroupMovement: duplicate proposal for group ${proposal.groupId}.`,
      )
    }

    entries.push([
      proposal.groupId,
      proposal,
    ])
  }

  return Object.fromEntries(entries)
}

/**
 * applyMultiGroupMovement
 *
 * Applies a previously-calculated MultiGroupMovementResult to the provided
 * SimulationState, returning a new SimulationState and metadata about the
 * tick application.
 */
export function applyMultiGroupMovement(
  input: ApplyMultiGroupMovementInput,
): ApplyMultiGroupMovementResult {
  const {
    state,
    movement,
  } = input

  if (state.completed) {
    throw new Error(
      'applyMultiGroupMovement: cannot apply movement to a completed simulation.',
    )
  }

  assertFiniteNonNegative(
    movement.tickSeconds,
    'movement.tickSeconds',
  )

  if (movement.tickSeconds <= 0) {
    throw new Error(
      'applyMultiGroupMovement: movement.tickSeconds must be greater than 0.',
    )
  }

  if (
    movement.tickSeconds !==
    state.input.settings.tickSeconds
  ) {
    throw new Error(
      'applyMultiGroupMovement: movement tick duration does not match the simulation settings.',
    )
  }

  assertFiniteNonNegative(
    movement.leaderDistanceKm,
    'movement.leaderDistanceKm',
  )

  if (
    movement.leaderDistanceKm >
    state.stageDistanceKm
  ) {
    throw new Error(
      'applyMultiGroupMovement: leader distance exceeds the stage distance.',
    )
  }

  const activeGroups =
    Object.values(state.groups)
      .filter((group) => group.active)

  const proposalByGroupId =
    getProposalByGroupId(
      movement.proposals,
    )

  if (
    movement.proposals.length !==
    activeGroups.length
  ) {
    throw new Error(
      'applyMultiGroupMovement: proposal count must equal the active-group count.',
    )
  }

  const nextGroupsEntries:
    Array<[string, GroupState]> = []

  for (
    const [groupId, group] of
    Object.entries(state.groups)
  ) {
    if (!group.active) {
      nextGroupsEntries.push([
        groupId,
        group,
      ])
      continue
    }

    const proposal =
      proposalByGroupId[groupId]

    if (!proposal) {
      throw new Error(
        `applyMultiGroupMovement: missing proposal for active group ${groupId}.`,
      )
    }

    if (
      proposal.groupType !==
      group.groupType
    ) {
      throw new Error(
        `applyMultiGroupMovement: group type mismatch for ${groupId}.`,
      )
    }

    if (
      JSON.stringify(
        proposal.riderIds,
      ) !==
      JSON.stringify(
        group.riderIds
          .slice()
          .sort(
            (riderIdA, riderIdB) =>
              riderIdA.localeCompare(
                riderIdB,
              ),
          ),
      )
    ) {
      throw new Error(
        `applyMultiGroupMovement: rider membership mismatch for ${groupId}.`,
      )
    }

    if (
      proposal.previousDistanceKm !==
      group.distanceKm
    ) {
      throw new Error(
        `applyMultiGroupMovement: previous distance mismatch for ${groupId}.`,
      )
    }

    if (
      proposal.nextDistanceKm <
      proposal.previousDistanceKm
    ) {
      throw new Error(
        `applyMultiGroupMovement: group ${groupId} cannot move backwards.`,
      )
    }

    if (
      proposal.nextDistanceKm >
      state.stageDistanceKm
    ) {
      throw new Error(
        `applyMultiGroupMovement: group ${groupId} exceeds the stage distance.`,
      )
    }

    nextGroupsEntries.push([
      groupId,
      {
        ...group,
        distanceKm:
          proposal.nextDistanceKm,
        speedKmh:
          proposal.appliedSpeedKmh,
        gapFromLeaderSeconds:
          proposal.gapFromLeaderSeconds,
      },
    ])
  }

  if (!proposalByGroupId[movement.leaderGroupId]) {
    throw new Error(
      `applyMultiGroupMovement: leader group ${movement.leaderGroupId} has no proposal.`,
    )
  }

  const nextRidersEntries:
    Array<[string, RiderState]> =
    Object.entries(state.riders).map(
      ([riderId, rider]) => {
        if (
          rider.stageStatus !== 'racing'
        ) {
          return [riderId, rider]
        }

        const currentGroupId =
          rider.currentGroupId

        if (!currentGroupId) {
          throw new Error(
            `applyMultiGroupMovement: racing rider ${riderId} has no current group.`,
          )
        }

        const proposal =
          proposalByGroupId[
            currentGroupId
          ]

        if (!proposal) {
          throw new Error(
            `applyMultiGroupMovement: racing rider ${riderId} has no movement proposal for group ${currentGroupId}.`,
          )
        }

        return [
          riderId,
          {
            ...rider,
            distanceKm:
              proposal.nextDistanceKm,
            speedKmh:
              proposal.appliedSpeedKmh,
          },
        ]
      },
    )

  const previousRaceSecond =
    state.raceSecond

  const nextRaceSecond =
    previousRaceSecond +
    movement.tickSeconds

  const nextState: SimulationState = {
    ...state,
    raceSecond:
      nextRaceSecond,
    currentKm:
      movement.leaderDistanceKm,
    groups:
      Object.fromEntries(
        nextGroupsEntries,
      ),
    riders:
      Object.fromEntries(
        nextRidersEntries,
      ),
  }

  return {
    state:
      nextState,
    previousRaceSecond,
    nextRaceSecond,
    previousCurrentKm:
      state.currentKm,
    nextCurrentKm:
      movement.leaderDistanceKm,
    appliedGroupIds:
      movement.proposals
        .map(
          (proposal) =>
            proposal.groupId,
        )
        .slice(),
  }
}