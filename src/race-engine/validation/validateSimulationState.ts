/**
 * validateSimulationState.ts
 *
 * Structural and logical validation for SimulationState.
 *
 * Responsibilities:
 * - Enforce general invariants on identifiers, timing, and distance.
 * - Validate riders, teams, groups, orders, and events.
 * - Enforce completion rules and pre-/post-completion group membership semantics.
 */

import type { SimulationState } from '../domain/SimulationState'

/**
 * SimulationStateValidationError
 * Error type containing a list of human-readable validation issues.
 */
export class SimulationStateValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      `Invalid simulation state:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    )

    this.name = 'SimulationStateValidationError'
    this.issues = issues
  }
}

/**
 * isNonNegativeInteger
 * Utility to check for non-negative integers.
 */
function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * isPositiveInteger
 * Utility to check for positive integers.
 */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/**
 * isFiniteNumber
 * Utility to check that a value is finite.
 */
function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

/**
 * terminalStageStatuses
 * Set of rider stage statuses that are considered terminal.
 */
const terminalStageStatuses: ReadonlySet<string> = new Set([
  'finished',
  'dnf',
  'dns',
  'otl',
])

/**
 * validateSimulationState
 * Performs a comprehensive validation of a SimulationState.
 * Collects all issues and throws SimulationStateValidationError if any exist.
 */
export function validateSimulationState(state: SimulationState): void {
  const issues: string[] = []

  // GENERAL
  if (!state.raceId || state.raceId.trim() === '') {
    issues.push('GENERAL: raceId must not be blank.')
  }

  if (!state.stageId || state.stageId.trim() === '') {
    issues.push('GENERAL: stageId must not be blank.')
  }

  if (!state.seed || state.seed.trim() === '') {
    issues.push('GENERAL: seed must not be blank.')
  }

  if (!isNonNegativeInteger(state.raceSecond)) {
    issues.push(
      'GENERAL: raceSecond must be a non-negative integer.',
    )
  }

  if (!isFiniteNumber(state.stageDistanceKm) || state.stageDistanceKm <= 0) {
    issues.push(
      'GENERAL: stageDistanceKm must be a finite number greater than zero.',
    )
  }

  if (
    !isFiniteNumber(state.currentKm) ||
    state.currentKm < 0 ||
    state.currentKm > state.stageDistanceKm
  ) {
    issues.push(
      'GENERAL: currentKm must be finite and between 0 and stageDistanceKm.',
    )
  }

  if (!isPositiveInteger(state.nextEventSequenceNumber)) {
    issues.push(
      'GENERAL: nextEventSequenceNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextBreakawayNumber)) {
    issues.push(
      'GENERAL: nextBreakawayNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextChaseNumber)) {
    issues.push(
      'GENERAL: nextChaseNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextDroppedGroupNumber)) {
    issues.push(
      'GENERAL: nextDroppedGroupNumber must be a positive integer.',
    )
  }

  // Shortcuts
  const riders = state.riders
  const teams = state.teams
  const groups = state.groups
  const orders = state.orders
  const events = state.events

  const riderIds = Object.keys(riders)
  const teamIds = Object.keys(teams)
  const groupIds = Object.keys(groups)
  const orderIds = Object.keys(orders)

  const riderIdSet = new Set(riderIds)
  const teamIdSet = new Set(teamIds)
  const groupIdSet = new Set(groupIds)

  // AUTHORITATIVE SEPARATION PRESSURE
  const separationPressure =
    state
      .separationPressureSecondsByRiderId

  if (
    !separationPressure ||
    typeof separationPressure !==
      'object' ||
    Array.isArray(
      separationPressure,
    )
  ) {
    issues.push(
      'SEPARATION_PRESSURE: separationPressureSecondsByRiderId must be a record.',
    )
  } else {
    const pressureRiderIds =
      Object.keys(
        separationPressure,
      )

    const pressureRiderIdSet =
      new Set(
        pressureRiderIds,
      )

    for (
      const riderId of
      riderIds
    ) {
      if (
        !pressureRiderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: missing pressure entry for rider ${riderId}.`,
        )
      }
    }

    for (
      const riderId of
      pressureRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: pressure record contains unknown riderId "${riderId}".`,
        )
        continue
      }

      const seconds =
        separationPressure[
          riderId
        ]

      if (
        !isNonNegativeInteger(
          seconds,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} pressure must be a non-negative integer.`,
        )
        continue
      }

      if (
        seconds >
        state.raceSecond
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} pressure may not exceed raceSecond.`,
        )
      }

      const rider =
        riders[
          riderId
        ]

      const group =
        rider
          ? groups[
              rider
                .currentGroupId
            ]
          : null

      if (
        rider &&
        terminalStageStatuses.has(
          rider.stageStatus,
        ) &&
        seconds !== 0
      ) {
        issues.push(
          `SEPARATION_PRESSURE: terminal rider ${riderId} must have zero pressure.`,
        )
      }

      if (
        rider &&
        group &&
        (
          group.groupType ===
            'dropped' ||
          group.groupType ===
            'finished'
        ) &&
        seconds !== 0
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} in ${group.groupType} group "${group.groupId}" must have zero pressure.`,
        )
      }
    }

    if (
      pressureRiderIds.length !==
      riderIds.length
    ) {
      issues.push(
        `SEPARATION_PRESSURE: pressure entry count ${pressureRiderIds.length} must equal rider count ${riderIds.length}.`,
      )
    }
  }

  // RIDERS
  if (riderIds.length < 2) {
    issues.push('RIDERS: at least two riders must exist.')
  }

  const riderTeamMembershipCount = new Map<string, number>()
  const nonTerminalRiderIds = new Set<string>()

  for (const [recordKey, rider] of Object.entries(riders)) {
    if (recordKey !== rider.riderId) {
      issues.push(
        `RIDERS: rider record key "${recordKey}" does not match rider.riderId "${rider.riderId}".`,
      )
    }

    if (!teamIdSet.has(rider.teamId)) {
      issues.push(
        `RIDERS: rider ${rider.riderId} references missing teamId "${rider.teamId}".`,
      )
    }

    const isTerminal =
      terminalStageStatuses.has(
        rider.stageStatus,
      )

    const group =
      groups[
        rider.currentGroupId
      ]

    if (!group) {
      issues.push(
        `RIDERS: rider ${rider.riderId} references missing currentGroupId "${rider.currentGroupId}".`,
      )
    } else if (
      !group.active &&
      !state.completed &&
      !isTerminal
    ) {
      issues.push(
        `RIDERS: non-terminal rider ${rider.riderId} references inactive group "${rider.currentGroupId}" before completion.`,
      )
    }

    if (
      !isFiniteNumber(rider.distanceKm) ||
      rider.distanceKm < 0 ||
      rider.distanceKm > state.stageDistanceKm
    ) {
      issues.push(
        `RIDERS: rider ${rider.riderId} distanceKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (!isFiniteNumber(rider.speedKmh) || rider.speedKmh < 0) {
      issues.push(
        `RIDERS: rider ${rider.riderId} speedKmh must be finite and not negative.`,
      )
    }

    if (
      !isFiniteNumber(rider.energy) ||
      rider.energy < 0 ||
      rider.energy > 100
    ) {
      issues.push(
        `RIDERS: rider ${rider.riderId} energy must be finite and between 0 and 100.`,
      )
    }

    if (!isNonNegativeInteger(rider.attackAttempts)) {
      issues.push(
        `RIDERS: rider ${rider.riderId} attackAttempts must be a non-negative integer.`,
      )
    }

    if (!isTerminal) {
      nonTerminalRiderIds.add(
        rider.riderId,
      )
    }

    // Finished flag and status consistency.
    if (rider.finished && rider.stageStatus !== 'finished') {
      issues.push(
        `RIDERS: rider ${rider.riderId} finished=true requires stageStatus "finished".`,
      )
    }

    if (rider.stageStatus === 'finished' && !rider.finished) {
      issues.push(
        `RIDERS: rider ${rider.riderId} stageStatus "finished" requires finished=true.`,
      )
    }

    if (rider.stageStatus === 'finished') {
      if (
        typeof rider.finishPosition !== 'number' ||
        rider.finishPosition <= 0
      ) {
        issues.push(
          `RIDERS: finished rider ${rider.riderId} must have a positive finishPosition.`,
        )
      }

      if (
        typeof rider.finishTimeSeconds !== 'number' ||
        rider.finishTimeSeconds < 0
      ) {
        issues.push(
          `RIDERS: finished rider ${rider.riderId} must have non-negative finishTimeSeconds.`,
        )
      }
    } else {
      if (rider.finishPosition !== null) {
        issues.push(
          `RIDERS: unfinished rider ${rider.riderId} must have finishPosition = null.`,
        )
      }
      if (rider.finishTimeSeconds !== null) {
        issues.push(
          `RIDERS: unfinished rider ${rider.riderId} must have finishTimeSeconds = null.`,
        )
      }
    }

    // Note: team membership counts are accumulated from teams (not from riders).
  }

  // TEAMS
  if (teamIds.length < 2) {
    issues.push('TEAMS: at least two teams must exist.')
  }

  const orderIdSet = new Set(orderIds)

  for (const [teamKey, team] of Object.entries(teams)) {
    if (teamKey !== team.teamId) {
      issues.push(
        `TEAMS: team record key "${teamKey}" does not match team.teamId "${team.teamId}".`,
      )
    }

    if (!Array.isArray(team.riderIds) || team.riderIds.length === 0) {
      issues.push(
        `TEAMS: team ${team.teamId} must have at least one rider.`,
      )
    }

    // Captain must exist and belong to the team.
    const captain = riders[team.captainRiderId]
    if (!captain) {
      issues.push(
        `TEAMS: team ${team.teamId} has captainRiderId "${team.captainRiderId}" that does not exist.`,
      )
    } else if (captain.teamId !== team.teamId) {
      issues.push(
        `TEAMS: captain ${captain.riderId} for team ${team.teamId} does not belong to that team.`,
      )
    }

    // Every riderId in team.riderIds exists and belongs to that team.
    const seenTeamRiderIds = new Set<string>()
    for (const riderId of team.riderIds) {
      // Increment membership count even when rider not found so we can detect duplicates and multi-team listing.
      riderTeamMembershipCount.set(
        riderId,
        (riderTeamMembershipCount.get(riderId) ?? 0) + 1,
      )

      if (seenTeamRiderIds.has(riderId)) {
        issues.push(
          `TEAMS: team ${team.teamId} contains duplicate riderId "${riderId}".`,
        )
      } else {
        seenTeamRiderIds.add(riderId)
      }

      const rider = riders[riderId]
      if (!rider) {
        issues.push(
          `TEAMS: team ${team.teamId} lists non-existent riderId "${riderId}".`,
        )
        continue
      }
      if (rider.teamId !== team.teamId) {
        issues.push(
          `TEAMS: rider ${rider.riderId} is listed for team ${team.teamId} but has teamId "${rider.teamId}".`,
        )
      }
    }

    // Validate order lists.
    const activeOrderSet = new Set(team.activeOrderIds)

    for (const orderId of team.activeOrderIds) {
      const order = orders[orderId]
      if (!order) {
        issues.push(
          `TEAMS: team ${team.teamId} references missing activeOrderId "${orderId}".`,
        )
        continue
      }
      if (order.teamId !== team.teamId) {
        issues.push(
          `TEAMS: active order ${orderId} does not belong to team ${team.teamId}.`,
        )
      }
    }

    for (const orderId of team.completedOrderIds) {
      const order = orders[orderId]
      if (!order) {
        issues.push(
          `TEAMS: team ${team.teamId} references missing completedOrderId "${orderId}".`,
        )
        continue
      }
      if (order.teamId !== team.teamId) {
        issues.push(
          `TEAMS: completed order ${orderId} does not belong to team ${team.teamId}.`,
        )
      }
      if (activeOrderSet.has(orderId)) {
        issues.push(
          `TEAMS: order ${orderId} appears in both activeOrderIds and completedOrderIds for team ${team.teamId}.`,
        )
      }
    }
  }

  // Every rider must appear in exactly one team.riderIds list.
  // (We counted memberships via riderTeamMembershipCount.)
  for (const riderId of riderIds) {
    const count = riderTeamMembershipCount.get(riderId) ?? 0
    if (count === 0) {
      issues.push(
        `TEAMS: rider ${riderId} does not appear in any team.riderIds list.`,
      )
    } else if (count > 1) {
      issues.push(
        `TEAMS: rider ${riderId} appears in multiple team.riderIds lists.`,
      )
    }
  }

  // GROUPS
  if (groupIds.length === 0) {
    issues.push('GROUPS: at least one group must exist.')
  }

  const riderToGroups = new Map<string, string[]>()
  const activeGroupIds: string[] = []

  for (const [groupKey, group] of Object.entries(groups)) {
    if (groupKey !== group.groupId) {
      issues.push(
        `GROUPS: group record key "${groupKey}" does not match group.groupId "${group.groupId}".`,
      )
    }

    if (
      !isFiniteNumber(group.distanceKm) ||
      group.distanceKm < 0 ||
      group.distanceKm > state.stageDistanceKm
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} distanceKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (!isFiniteNumber(group.speedKmh) || group.speedKmh < 0) {
      issues.push(
        `GROUPS: group ${group.groupId} speedKmh must be finite and not negative.`,
      )
    }

    if (
      !isFiniteNumber(group.gapFromLeaderSeconds) ||
      group.gapFromLeaderSeconds < 0
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} gapFromLeaderSeconds must be finite and non-negative.`,
      )
    }

    if (!isNonNegativeInteger(group.createdAtRaceSecond)) {
      issues.push(
        `GROUPS: group ${group.groupId} createdAtRaceSecond must be a non-negative integer.`,
      )
    }

    if (
      !isFiniteNumber(group.createdAtKm) ||
      group.createdAtKm < 0 ||
      group.createdAtKm > state.stageDistanceKm
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} createdAtKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (group.active) {
      activeGroupIds.push(group.groupId)
      if (!Array.isArray(group.riderIds) || group.riderIds.length === 0) {
        issues.push(
          `GROUPS: active group ${group.groupId} must contain at least one rider.`,
        )
      }
    }

    const seenGroupRiders = new Set<string>()
    for (const riderId of group.riderIds) {
      if (!riderIdSet.has(riderId)) {
        issues.push(
          `GROUPS: group ${group.groupId} references non-existent riderId "${riderId}".`,
        )
        continue
      }

      if (seenGroupRiders.has(riderId)) {
        issues.push(
          `GROUPS: group ${group.groupId} contains duplicate riderId "${riderId}".`,
        )
      } else {
        seenGroupRiders.add(riderId)
      }

      const list = riderToGroups.get(riderId)
      if (list) {
        list.push(group.groupId)
      } else {
        riderToGroups.set(riderId, [group.groupId])
      }
    }
  }

  // Pre-completion: at least one active group must exist.
  if (!state.completed && activeGroupIds.length === 0) {
    issues.push('GROUPS: at least one active group must exist before completion.')
  }

  // Every rider must belong to at least one group; and never more than one.
  for (const riderId of riderIds) {
    const membership = riderToGroups.get(riderId) ?? []
    if (membership.length === 0) {
      issues.push(
        `GROUPS: rider ${riderId} does not belong to any group.`,
      )
    } else if (membership.length > 1) {
      issues.push(
        `GROUPS: rider ${riderId} appears in multiple groups: [${membership.join(', ')}].`,
      )
    }
  }

  // RIDER/GROUP cross-checks conditioned on completion.
  for (const rider of Object.values(riders)) {
    const membership = riderToGroups.get(rider.riderId) ?? []
    const currentGroup = groups[rider.currentGroupId]

    if (!currentGroup) {
      // Already recorded above; skip further checks here.
      continue
    }

    if (!membership.includes(currentGroup.groupId)) {
      issues.push(
        `GROUPS: rider ${rider.riderId} currentGroupId "${currentGroup.groupId}" does not match their group membership.`,
      )
    }

    if (
      !state.completed &&
      !terminalStageStatuses.has(
        rider.stageStatus,
      )
    ) {
      // Before completion, every non-terminal rider must be in an active group.
      if (!currentGroup.active) {
        issues.push(
          `GROUPS: non-terminal rider ${rider.riderId} is assigned to inactive group "${currentGroup.groupId}" before completion.`,
        )
      }
    }
  }

  if (state.completed) {
    // After completion:
    // - Every rider.currentGroupId must reference an existing group (already checked).
    // - No rider may appear in more than one group (already enforced above).
    // - Active groups may exist only if they contain at least one non-terminal rider.
    for (const groupId of activeGroupIds) {
      const group = groups[groupId]
      const hasNonTerminal = group.riderIds.some((riderId) =>
        nonTerminalRiderIds.has(riderId),
      )
      if (!hasNonTerminal) {
        issues.push(
          `GROUPS: active group ${group.groupId} has no non-terminal riders in completed simulation.`,
        )
      }
    }
  }

  // ORDERS
  for (const [orderKey, order] of Object.entries(orders)) {
    if (orderKey !== order.orderId) {
      issues.push(
        `ORDERS: order record key "${orderKey}" does not match order.orderId "${order.orderId}".`,
      )
    }

    if (!teamIdSet.has(order.teamId)) {
      issues.push(
        `ORDERS: order ${order.orderId} references missing teamId "${order.teamId}".`,
      )
    }

    if (!riderIdSet.has(order.riderId)) {
      issues.push(
        `ORDERS: order ${order.orderId} references missing riderId "${order.riderId}".`,
      )
    } else {
      const rider = riders[order.riderId]
      if (rider.teamId !== order.teamId) {
        issues.push(
          `ORDERS: order ${order.orderId} rider ${order.riderId} does not belong to team ${order.teamId}.`,
        )
      }
    }

    if (
      !isFiniteNumber(order.eligibleFromKm) ||
      order.eligibleFromKm < 0 ||
      order.eligibleFromKm > state.stageDistanceKm
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleFromKm must be within stage bounds.`,
      )
    }

    if (
      !isFiniteNumber(order.eligibleUntilKm) ||
      order.eligibleUntilKm < 0 ||
      order.eligibleUntilKm > state.stageDistanceKm
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleUntilKm must be within stage bounds.`,
      )
    }

    if (order.eligibleUntilKm < order.eligibleFromKm) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleUntilKm cannot be lower than eligibleFromKm.`,
      )
    }

    if (!isFiniteNumber(order.priority) || order.priority < 0) {
      issues.push(
        `ORDERS: order ${order.orderId} priority must be finite and non-negative.`,
      )
    }

    if (
      order.maximumFollowers !== null &&
      (!isNonNegativeInteger(order.maximumFollowers))
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} maximumFollowers must be null or a non-negative integer.`,
      )
    }
  }

  // EVENTS
  if (events.length > 0) {
    const firstSequence = events[0].sequenceNumber
    if (firstSequence !== 1) {
      issues.push(
        'EVENTS: event sequence numbers must start at 1.',
      )
    }

    for (let i = 0; i < events.length; i += 1) {
      const expected = i + 1
      const actual = events[i].sequenceNumber
      if (actual !== expected) {
        issues.push(
          `EVENTS: event sequence numbers must be contiguous starting at 1 (expected ${expected}, got ${actual}).`,
        )
      }
    }
  }

  if (state.nextEventSequenceNumber !== events.length + 1) {
    issues.push(
      'EVENTS: nextEventSequenceNumber must equal events.length + 1.',
    )
  }

  let simulationStartedCount = 0
  const orderLoadedCounts = new Map<string, number>()

  for (const event of events) {
    if (!isNonNegativeInteger(event.raceSecond)) {
      issues.push(
        `EVENTS: event ${event.sequenceNumber} raceSecond must be a non-negative integer.`,
      )
    }

    if (
      !isFiniteNumber(event.kmMarker) ||
      event.kmMarker < 0 ||
      event.kmMarker > state.stageDistanceKm
    ) {
      issues.push(
        `EVENTS: event ${event.sequenceNumber} kmMarker must be finite and within stage bounds.`,
      )
    }

    if (event.actorRiderId !== null) {
      if (!riderIdSet.has(event.actorRiderId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing actorRiderId "${event.actorRiderId}".`,
        )
      }
    }

    if (event.teamId !== null) {
      if (!teamIdSet.has(event.teamId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing teamId "${event.teamId}".`,
        )
      }
    }

    if (event.sourceGroupId !== null) {
      if (!groupIdSet.has(event.sourceGroupId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing sourceGroupId "${event.sourceGroupId}".`,
        )
      }
    }

    if (event.targetGroupId !== null) {
      if (!groupIdSet.has(event.targetGroupId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing targetGroupId "${event.targetGroupId}".`,
        )
      }
    }

    for (const riderId of event.relatedRiderIds) {
      if (!riderIdSet.has(riderId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} relatedRiderIds contains missing riderId "${riderId}".`,
        )
      }
    }

    if (event.eventType === 'SIMULATION_STARTED') {
      simulationStartedCount += 1
    }

    if (event.eventType === 'ORDER_LOADED') {
      // Payload must reference an existing order.
      const payload = event.payload as Readonly<Record<string, unknown>>
      const rawOrderId = payload.orderId

      const payloadOrderId =
        typeof rawOrderId === 'string'
          ? rawOrderId
          : null

      if (payloadOrderId === null) {
        issues.push(
          `EVENTS: ORDER_LOADED event ${event.sequenceNumber} payload must contain string orderId.`,
        )
      } else if (!orderIdSet.has(payloadOrderId)) {
        issues.push(
          `EVENTS: ORDER_LOADED event ${event.sequenceNumber} references non-existent orderId "${payloadOrderId}".`,
        )
      } else {
        orderLoadedCounts.set(
          payloadOrderId,
          (orderLoadedCounts.get(payloadOrderId) ?? 0) + 1,
        )
      }
    }
  }

  if (simulationStartedCount === 0) {
    issues.push(
      'EVENTS: exactly one SIMULATION_STARTED event must exist (found 0).',
    )
  } else if (simulationStartedCount > 1) {
    issues.push(
      'EVENTS: exactly one SIMULATION_STARTED event must exist (found more than 1).',
    )
  } else if (events.length > 0 && events[0].eventType !== 'SIMULATION_STARTED') {
    issues.push(
      'EVENTS: the first event must be SIMULATION_STARTED.',
    )
  }

  // Exactly one ORDER_LOADED event per order.
  for (const orderId of orderIds) {
    const count = orderLoadedCounts.get(orderId) ?? 0
    if (count === 0) {
      issues.push(
        `EVENTS: order ${orderId} must have exactly one ORDER_LOADED event (found 0).`,
      )
    } else if (count > 1) {
      issues.push(
        `EVENTS: order ${orderId} must have exactly one ORDER_LOADED event (found ${count}).`,
      )
    }
  }

  // COMPLETION
  if (state.completed) {
    if (state.currentKm !== state.stageDistanceKm) {
      issues.push(
        'COMPLETION: completed=true requires currentKm to equal stageDistanceKm.',
      )
    }

    for (const rider of Object.values(riders)) {
      if (!terminalStageStatuses.has(rider.stageStatus)) {
        issues.push(
          `COMPLETION: completed=true requires rider ${rider.riderId} to have a terminal or finished status.`,
        )
      }
    }
  }

  if (state.currentKm === 0 && state.finalSprintStarted) {
    issues.push(
      'COMPLETION: finalSprintStarted may not be true when currentKm is zero.',
    )
  }

  if (issues.length > 0) {
    throw new SimulationStateValidationError(issues)
  }
}
