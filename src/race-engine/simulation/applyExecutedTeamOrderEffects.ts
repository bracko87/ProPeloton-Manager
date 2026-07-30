/**
 * applyExecutedTeamOrderEffects.ts
 *
 * Applies deterministic tactical state changes for team orders that executed
 * during the current simulation tick.
 *
 * Initial supported tactical slice:
 * - attack: move the attacking rider into a new breakaway group.
 *
 * Unsupported order types remain lifecycle-only for now.
 *
 * This helper:
 * - does not advance the race clock;
 * - does not calculate movement;
 * - does not calculate energy;
 * - does not persist output;
 * - does not mutate the supplied state.
 */

import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  TeamOrder,
} from '../domain/TeamOrder'
import {
  createBreakawayGroup,
  type CreateBreakawayGroupResult,
} from './createBreakawayGroup'
import {
  calculateAttackLaunchSpeed,
  type AttackLaunchSpeedResult,
} from './attackLaunchSpeed'
import {
  getStageTerrainSample,
} from './stageProfile'

export interface AppliedAttackOrderEffect {
  readonly order:
    TeamOrder

  readonly separation:
    CreateBreakawayGroupResult

  /**
   * Present only when controlled attack-launch speed is enabled.
   */
  readonly attackLaunchResult?:
    AttackLaunchSpeedResult

  readonly events:
    readonly RaceEvent[]
}

export interface ApplyExecutedTeamOrderEffectsResult {
  readonly previousState:
    SimulationState

  readonly state:
    SimulationState

  readonly attackEffects:
    readonly AppliedAttackOrderEffect[]

  readonly ignoredOrders:
    readonly TeamOrder[]

  readonly events:
    readonly RaceEvent[]
}

function createAttackEvents(
  state: SimulationState,
  order: TeamOrder,
  separation:
    CreateBreakawayGroupResult,
): readonly RaceEvent[] {
  const attackStarted:
    RaceEvent = {
    sequenceNumber:
      state.nextEventSequenceNumber,
    eventType:
      'ATTACK_STARTED',
    raceSecond:
      state.raceSecond,
    kmMarker:
      state.currentKm,
    actorRiderId:
      order.riderId,
    teamId:
      order.teamId,
    sourceGroupId:
      separation.sourceGroupId,
    targetGroupId:
      separation.breakawayGroupId,
    relatedRiderIds:
      separation.movedRiderIds,
    payload: {
      orderId:
        order.orderId,
      orderType:
        order.type,
      breakawayGroupId:
        separation.breakawayGroupId,
    },
    commentaryText:
      null,
  }

  const groupCreated:
    RaceEvent = {
    sequenceNumber:
      state.nextEventSequenceNumber +
      1,
    eventType:
      'GROUP_CREATED',
    raceSecond:
      state.raceSecond,
    kmMarker:
      state.currentKm,
    actorRiderId:
      order.riderId,
    teamId:
      order.teamId,
    sourceGroupId:
      separation.sourceGroupId,
    targetGroupId:
      separation.breakawayGroupId,
    relatedRiderIds:
      separation.movedRiderIds,
    payload: {
      orderId:
        order.orderId,
      groupId:
        separation.breakawayGroupId,
      groupType:
        'breakaway',
      riderIds:
        separation.movedRiderIds,
    },
    commentaryText:
      null,
  }

  return [
    attackStarted,
    groupCreated,
  ]
}

function canCreateSoloBreakaway(
  state: SimulationState,
  order: TeamOrder,
): boolean {
  const rider =
    state.riders[
      order.riderId
    ]

  if (
    !rider ||
    rider.stageStatus !==
      'racing' ||
    !rider.currentGroupId
  ) {
    return false
  }

  const sourceGroup =
    state.groups[
      rider.currentGroupId
    ]

  if (
    !sourceGroup ||
    !sourceGroup.active
  ) {
    return false
  }

  /*
   * createBreakawayGroup requires at least one rider to remain in the source
   * group. A solo rider cannot attack away from a one-rider group.
   */
  return (
    sourceGroup.riderIds.length >
    1
  )
}

function applyAttackOrder(
  state: SimulationState,
  order: TeamOrder,
): AppliedAttackOrderEffect | null {
  if (
    !canCreateSoloBreakaway(
      state,
      order,
    )
  ) {
    return null
  }

  const rider =
    state.riders[
      order.riderId
    ]

  if (
    !rider ||
    !rider.currentGroupId
  ) {
    return null
  }

  const sourceGroup =
    state.groups[
      rider.currentGroupId
    ]

  if (
    !sourceGroup
  ) {
    return null
  }

  const controlledAttackLaunchEnabled =
    state
      .controlledAttackLaunchEnabled ===
    true

  const terrainSample =
    controlledAttackLaunchEnabled
      ? getStageTerrainSample(
          state.input,
          sourceGroup.distanceKm,
        )
      : null

  const attackLaunchResult =
    controlledAttackLaunchEnabled
      ? calculateAttackLaunchSpeed({
          sourceSpeedKmh:
            sourceGroup.speedKmh,
          maximumSpeedKmh:
            state.input.settings
              .maximumSpeedKmh,
          gradientPercent:
            terrainSample!
              .gradientPercent,
          acceleration:
            rider.attributes
              .acceleration,
          currentEnergy:
            rider.energy,
        })
      : null

  const launchSpeedKmh =
    attackLaunchResult
      ? attackLaunchResult
          .launchSpeedKmh
      : Math.min(
          state.input.settings
            .maximumSpeedKmh,
          sourceGroup.speedKmh +
            4,
        )

  const separation =
    createBreakawayGroup({
      state,
      sourceGroupId:
        sourceGroup.groupId,
      riderIds: [
        order.riderId,
      ],
      speedKmh:
        launchSpeedKmh,
      initialGapSeconds:
        5,
    })

  const events =
    createAttackEvents(
      state,
      order,
      separation,
    )

  return {
    order,
    separation,
    ...(attackLaunchResult
      ? {
          attackLaunchResult,
        }
      : {}),
    events,
  }
}

/**
 * Applies tactical effects in stable orderId order.
 *
 * Only orders executed during the current lifecycle application should be
 * supplied. An already-executed historical order must not be supplied again.
 */
export function applyExecutedTeamOrderEffects(
  state: SimulationState,
  executedOrders:
    readonly TeamOrder[],
): ApplyExecutedTeamOrderEffectsResult {
  if (
    executedOrders.length ===
    0
  ) {
    return {
      previousState:
        state,
      state,
      attackEffects: [],
      ignoredOrders: [],
      events: [],
    }
  }

  let nextState =
    state

  const attackEffects:
    AppliedAttackOrderEffect[] =
    []

  const ignoredOrders:
    TeamOrder[] =
    []

  const emittedEvents:
    RaceEvent[] =
    []

  const sortedOrders =
    executedOrders
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.orderId.localeCompare(
            right.orderId,
          ),
      )

  for (
    const order of
    sortedOrders
  ) {
    if (
      order.type !==
      'attack'
    ) {
      ignoredOrders.push(
        order,
      )
      continue
    }

    const effect =
      applyAttackOrder(
        nextState,
        order,
      )

    if (
      !effect
    ) {
      ignoredOrders.push(
        order,
      )
      continue
    }

    const eventsWithCurrentSequence =
      effect.events.map(
        (
          event,
          index,
        ) => ({
          ...event,
          sequenceNumber:
            nextState
              .nextEventSequenceNumber +
            index,
        }),
      )

    nextState = {
      ...effect.separation.state,
      events: [
        ...effect.separation
          .state.events,
        ...eventsWithCurrentSequence,
      ],
      nextEventSequenceNumber:
        nextState
          .nextEventSequenceNumber +
        eventsWithCurrentSequence
          .length,
    }

    const appliedEffect:
      AppliedAttackOrderEffect = {
      ...effect,
      separation: {
        ...effect.separation,
        state:
          nextState,
      },
      events:
        eventsWithCurrentSequence,
    }

    attackEffects.push(
      appliedEffect,
    )

    emittedEvents.push(
      ...eventsWithCurrentSequence,
    )
  }

  return {
    previousState:
      state,
    state:
      nextState,
    attackEffects,
    ignoredOrders,
    events:
      emittedEvents,
  }
}