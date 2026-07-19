/**
 * createInitialState.ts
 * Deterministic construction of the initial SimulationState for a road-race stage.
 *
 * Responsibilities:
 * - Validate the provided StageInput.
 * - Build deterministic rider, team, group, order, and event structures.
 * - Ensure all initial data is immutable by type (readonly) and independent of randomness.
 */

import type { StageInput } from '../domain/StageInput'
import type { RiderState } from '../domain/RiderState'
import type { TeamState } from '../domain/TeamState'
import type { GroupState } from '../domain/GroupState'
import type { SimulationState } from '../domain/SimulationState'
import type { RaceEvent } from '../domain/RaceEvent'
import type { TeamOrder } from '../domain/TeamOrder'
import { validateStageInput } from '../validation/validateStageInput'
import { validateSimulationState } from '../validation/validateSimulationState'

/**
 * INITIAL_PELOTON_GROUP_ID
 * Stable identifier for the main peloton group at simulation start.
 */
export const INITIAL_PELOTON_GROUP_ID = 'peloton_main'

/**
 * createInitialState
 * Builds the initial deterministic SimulationState from a validated StageInput.
 *
 * Notes:
 * - Does not mutate the input.
 * - Does not consume any randomness.
 * - Uses deterministic sorting rules for teams, riders, and orders.
 *
 * @param input - Immutable stage configuration for the simulation.
 * @returns Initial SimulationState ready for ticking.
 */
export function createInitialState(input: StageInput): SimulationState {
  // 1. Validate input before creating any state.
  validateStageInput(input)

  // 2. Deterministic ordering without mutating input arrays.
  const sortedTeams = [...input.teams].sort((a, b) => a.teamId.localeCompare(b.teamId))
  const sortedRiders = [...input.riders].sort((a, b) => a.riderId.localeCompare(b.riderId))
  const sortedOrders = [...input.orders].sort((a, b) => a.orderId.localeCompare(b.orderId))

  const minimumSpeedKmh = input.settings.minimumSpeedKmh

  // 4. Build riders record keyed by riderId.
  const ridersRecord: Record<string, RiderState> = {}
  for (const rider of sortedRiders) {
    const riderState: RiderState = {
      riderId: rider.riderId,
      teamId: rider.teamId,
      riderName: rider.riderName,
      teamName: rider.teamName,
      role: rider.role,
      attributes: rider.attributes,
      currentGroupId: INITIAL_PELOTON_GROUP_ID,
      distanceKm: 0,
      speedKmh: minimumSpeedKmh,
      energy: 100,
      attackAttempts: 0,
      acceptedOrderIds: [],
      completedOrderIds: [],
      stageStatus: 'racing',
      finished: false,
      finishPosition: null,
      finishTimeSeconds: null,
    }

    ridersRecord[rider.riderId] = riderState
  }

  // 6. Build orders record keyed by orderId.
  const ordersRecord: Record<string, TeamOrder> = {}
  for (const order of sortedOrders) {
    // Shallow copy to avoid mutating input orders.
    ordersRecord[order.orderId] = {
      orderId: order.orderId,
      teamId: order.teamId,
      riderId: order.riderId,
      type: order.type,
      status: order.status,
      eligibleFromKm: order.eligibleFromKm,
      eligibleUntilKm: order.eligibleUntilKm,
      priority: order.priority,
      targetRiderId: order.targetRiderId,
      maximumFollowers: order.maximumFollowers,
      metadata: order.metadata,
    }
  }

  // Helper sets for team-based queries.
  const ordersByTeam: Record<string, TeamOrder[]> = {}
  for (const order of sortedOrders) {
    if (!ordersByTeam[order.teamId]) {
      ordersByTeam[order.teamId] = []
    }
    ordersByTeam[order.teamId].push(order)
  }

  // 5. Build team states.
  const teamStatesRecord: Record<string, TeamState> = {}
  for (const teamInput of sortedTeams) {
    const teamOrders = ordersByTeam[teamInput.teamId] ?? []

    const activeOrderIds = teamOrders
      .filter(
        order =>
          order.status === 'loaded' ||
          order.status === 'accepted' ||
          order.status === 'scheduled',
      )
      .map(order => order.orderId)
      .sort((a, b) => a.localeCompare(b))

    const completedOrderIds = teamOrders
      .filter(order => order.status === 'completed')
      .map(order => order.orderId)
      .sort((a, b) => a.localeCompare(b))

    const sortedRiderIds = [...teamInput.riderIds].sort((a, b) => a.localeCompare(b))

    const teamState: TeamState = {
      teamId: teamInput.teamId,
      teamName: teamInput.teamName,
      riderIds: sortedRiderIds,
      captainRiderId: teamInput.captainRiderId,
      activeOrderIds,
      completedOrderIds,
    }

    teamStatesRecord[teamInput.teamId] = teamState
  }

  // 7. Create the initial peloton group.
  const allRiderIdsSorted = sortedRiders.map(rider => rider.riderId)

  const pelotonGroup: GroupState = {
    groupId: INITIAL_PELOTON_GROUP_ID,
    groupType: 'peloton',
    riderIds: allRiderIdsSorted,
    distanceKm: 0,
    speedKmh: minimumSpeedKmh,
    gapFromLeaderSeconds: 0,
    createdAtRaceSecond: 0,
    createdAtKm: 0,
    active: true,
  }

  const groupsRecord: Record<string, GroupState> = {
    [INITIAL_PELOTON_GROUP_ID]: pelotonGroup,
  }

  // 8. Create initial events.
  const teamCount = input.teams.length
  const riderCount = input.riders.length
  const orderCount = input.orders.length

  const events: RaceEvent[] = []

  let sequenceNumber = 1

  const simulationStartedEvent: RaceEvent = {
    sequenceNumber,
    eventType: 'SIMULATION_STARTED',
    raceSecond: 0,
    kmMarker: 0,
    actorRiderId: null,
    teamId: null,
    sourceGroupId: null,
    targetGroupId: INITIAL_PELOTON_GROUP_ID,
    relatedRiderIds: allRiderIdsSorted,
    payload: {
      raceId: input.raceId,
      stageId: input.stageId,
      seed: input.seed,
      teamCount,
      riderCount,
      orderCount,
    },
    commentaryText: null,
  }

  events.push(simulationStartedEvent)

  for (const order of sortedOrders) {
    sequenceNumber += 1

    const orderLoadedEvent: RaceEvent = {
      sequenceNumber,
      eventType: 'ORDER_LOADED',
      raceSecond: 0,
      kmMarker: 0,
      actorRiderId: order.riderId,
      teamId: order.teamId,
      sourceGroupId: INITIAL_PELOTON_GROUP_ID,
      targetGroupId: null,
      relatedRiderIds: [order.riderId],
      payload: {
        orderId: order.orderId,
        orderType: order.type,
        currentStatus: order.status,
        eligibleFromKm: order.eligibleFromKm,
        eligibleUntilKm: order.eligibleUntilKm,
        priority: order.priority,
        maximumFollowers: order.maximumFollowers,
      },
      commentaryText: null,
    }

    events.push(orderLoadedEvent)
  }

  // 9. Assemble SimulationState (readonly by type).
  const simulationState: SimulationState = {
    raceId: input.raceId,
    stageId: input.stageId,
    seed: input.seed,
    raceSecond: 0,
    currentKm: 0,
    stageDistanceKm: input.distanceKm,
    riders: ridersRecord,
    teams: teamStatesRecord,
    groups: groupsRecord,
    orders: ordersRecord,
    events,
    nextEventSequenceNumber: events.length + 1,
    nextBreakawayNumber: 1,
    nextChaseNumber: 1,
    nextDroppedGroupNumber: 1,
    finalSprintStarted: false,
    completed: false,
  }

  // Validate the constructed state before returning.
  validateSimulationState(simulationState)

  return simulationState
}
