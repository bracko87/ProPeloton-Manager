/**
 * createInitialState.ts
 * Deterministic construction of the initial SimulationState for a road-race stage.
 *
 * Responsibilities:
 * - Validate the provided StageInput.
 * - Build deterministic rider, team, group, order, event, and pressure structures.
 * - Transport optional live starting condition and equipment metadata without changing legacy fixtures.
 * - Ensure all initial data is immutable by type (readonly) and independent of randomness.
 */

import type {
  StageInput,
} from '../domain/StageInput'
import type {
  RiderState,
} from '../domain/RiderState'
import type {
  TeamState,
} from '../domain/TeamState'
import type {
  GroupState,
} from '../domain/GroupState'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  TeamOrder,
} from '../domain/TeamOrder'
import {
  validateStageInput,
} from '../validation/validateStageInput'
import {
  validateSimulationState,
} from '../validation/validateSimulationState'

/**
 * INITIAL_PELOTON_GROUP_ID
 * Stable identifier for the main peloton group at simulation start.
 */
export const INITIAL_PELOTON_GROUP_ID =
  'peloton_main'

/**
 * createInitialState
 * Builds the initial deterministic SimulationState from a validated StageInput.
 *
 * Notes:
 * - Does not mutate the input.
 * - Does not consume any randomness.
 * - Uses deterministic sorting rules for teams, riders, orders, and pressure.
 * - Uses rider.condition.startingEnergy when condition is present.
 * - Preserves the historic 100-energy start when condition is absent.
 *
 * @param input - Immutable stage configuration for the simulation.
 * @returns Initial SimulationState ready for ticking.
 */
export function createInitialState(
  input: StageInput,
): SimulationState {
  validateStageInput(
    input,
  )

  const sortedTeams = [
    ...input.teams,
  ].sort(
    (
      left,
      right,
    ) =>
      left.teamId.localeCompare(
        right.teamId,
      ),
  )

  const sortedRiders = [
    ...input.riders,
  ].sort(
    (
      left,
      right,
    ) =>
      left.riderId.localeCompare(
        right.riderId,
      ),
  )

  const sortedOrders = [
    ...input.orders,
  ].sort(
    (
      left,
      right,
    ) =>
      left.orderId.localeCompare(
        right.orderId,
      ),
  )

  const minimumSpeedKmh =
    input.settings
      .minimumSpeedKmh

  const ridersRecord:
    Record<
      string,
      RiderState
    > = {}

  for (
    const rider of
    sortedRiders
  ) {
    const startingCondition =
      rider.condition
        ? {
            startingEnergy:
              rider.condition
                .startingEnergy,
            fatigueBeforeStage:
              rider.condition
                .fatigueBeforeStage,
            morale:
              rider.condition
                .morale,
            availabilityStatus:
              rider.condition
                .availabilityStatus,
          }
        : null

    const startingEquipment =
      rider.equipment
        ? {
            conditionSource:
              rider.equipment
                .conditionSource,
            preparationSource:
              rider.equipment
                .preparationSource,

            equipmentSetupId:
              rider.equipment
                .equipmentSetupId,

            selectedComponentCount:
              rider.equipment
                .selectedComponentCount,
            matchedComponentCount:
              rider.equipment
                .matchedComponentCount,
            completeSource:
              rider.equipment
                .completeSource,

            minimumConditionPercent:
              rider.equipment
                .minimumConditionPercent,
            effectiveConditionPercent:
              rider.equipment
                .effectiveConditionPercent,

            missingComponentCategories:
              rider.equipment
                .missingComponentCategories
                .slice(),

            mechanicalIncidentRiskMultiplier:
              rider.equipment
                .mechanicalIncidentRiskMultiplier,
            mechanicalTimeLossMultiplier:
              rider.equipment
                .mechanicalTimeLossMultiplier,
          }
        : null

    const riderState:
      RiderState = {
        riderId:
          rider.riderId,
        teamId:
          rider.teamId,
        riderName:
          rider.riderName,
        teamName:
          rider.teamName,
        role:
          rider.role,
        attributes:
          rider.attributes,

        ...(startingCondition
          ? {
              startingCondition,
            }
          : {}),

        ...(startingEquipment
          ? {
              startingEquipment,
            }
          : {}),

        currentGroupId:
          INITIAL_PELOTON_GROUP_ID,
        distanceKm: 0,
        speedKmh:
          minimumSpeedKmh,
        energy:
          startingCondition
            ?.startingEnergy ??
          100,
        attackAttempts: 0,
        acceptedOrderIds: [],
        completedOrderIds: [],
        stageStatus:
          'racing',
        finished: false,
        finishPosition: null,
        finishTimeSeconds: null,
      }

    ridersRecord[
      rider.riderId
    ] =
      riderState
  }

  const separationPressureSecondsByRiderId:
    Record<
      string,
      number
    > =
      Object.fromEntries(
        sortedRiders.map(
          (rider) => [
            rider.riderId,
            0,
          ],
        ),
      )

  const ordersRecord:
    Record<
      string,
      TeamOrder
    > = {}

  for (
    const order of
    sortedOrders
  ) {
    ordersRecord[
      order.orderId
    ] = {
      orderId:
        order.orderId,
      teamId:
        order.teamId,
      riderId:
        order.riderId,
      type:
        order.type,
      status:
        order.status,
      eligibleFromKm:
        order.eligibleFromKm,
      eligibleUntilKm:
        order.eligibleUntilKm,
      priority:
        order.priority,
      targetRiderId:
        order.targetRiderId,
      maximumFollowers:
        order.maximumFollowers,
      metadata:
        order.metadata,
    }
  }

  const ordersByTeam:
    Record<
      string,
      TeamOrder[]
    > = {}

  for (
    const order of
    sortedOrders
  ) {
    if (
      !ordersByTeam[
        order.teamId
      ]
    ) {
      ordersByTeam[
        order.teamId
      ] = []
    }

    ordersByTeam[
      order.teamId
    ].push(
      order,
    )
  }

  const teamStatesRecord:
    Record<
      string,
      TeamState
    > = {}

  for (
    const teamInput of
    sortedTeams
  ) {
    const teamOrders =
      ordersByTeam[
        teamInput.teamId
      ] ?? []

    const activeOrderIds =
      teamOrders
        .filter(
          (order) =>
            order.status ===
              'loaded' ||
            order.status ===
              'accepted' ||
            order.status ===
              'scheduled',
        )
        .map(
          (order) =>
            order.orderId,
        )
        .sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        )

    const completedOrderIds =
      teamOrders
        .filter(
          (order) =>
            order.status ===
            'completed',
        )
        .map(
          (order) =>
            order.orderId,
        )
        .sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        )

    const sortedRiderIds = [
      ...teamInput.riderIds,
    ].sort(
      (
        left,
        right,
      ) =>
        left.localeCompare(
          right,
        ),
    )

    const teamState:
      TeamState = {
        teamId:
          teamInput.teamId,
        teamName:
          teamInput.teamName,
        riderIds:
          sortedRiderIds,
        captainRiderId:
          teamInput
            .captainRiderId,
        activeOrderIds,
        completedOrderIds,
      }

    teamStatesRecord[
      teamInput.teamId
    ] =
      teamState
  }

  const allRiderIdsSorted =
    sortedRiders.map(
      (rider) =>
        rider.riderId,
    )

  const pelotonGroup:
    GroupState = {
      groupId:
        INITIAL_PELOTON_GROUP_ID,
      groupType:
        'peloton',
      riderIds:
        allRiderIdsSorted,
      distanceKm: 0,
      speedKmh:
        minimumSpeedKmh,
      gapFromLeaderSeconds: 0,
      createdAtRaceSecond: 0,
      createdAtKm: 0,
      active: true,
    }

  const groupsRecord:
    Record<
      string,
      GroupState
    > = {
      [INITIAL_PELOTON_GROUP_ID]:
        pelotonGroup,
    }

  const teamCount =
    input.teams.length

  const riderCount =
    input.riders.length

  const orderCount =
    input.orders.length

  const events:
    RaceEvent[] = []

  let sequenceNumber = 1

  const simulationStartedEvent:
    RaceEvent = {
      sequenceNumber,
      eventType:
        'SIMULATION_STARTED',
      raceSecond: 0,
      kmMarker: 0,
      actorRiderId: null,
      teamId: null,
      sourceGroupId: null,
      targetGroupId:
        INITIAL_PELOTON_GROUP_ID,
      relatedRiderIds:
        allRiderIdsSorted,
      payload: {
        raceId:
          input.raceId,
        stageId:
          input.stageId,
        seed:
          input.seed,
        teamCount,
        riderCount,
        orderCount,
      },
      commentaryText: null,
    }

  events.push(
    simulationStartedEvent,
  )

  for (
    const order of
    sortedOrders
  ) {
    sequenceNumber +=
      1

    const orderLoadedEvent:
      RaceEvent = {
        sequenceNumber,
        eventType:
          'ORDER_LOADED',
        raceSecond: 0,
        kmMarker: 0,
        actorRiderId:
          order.riderId,
        teamId:
          order.teamId,
        sourceGroupId:
          INITIAL_PELOTON_GROUP_ID,
        targetGroupId: null,
        relatedRiderIds: [
          order.riderId,
        ],
        payload: {
          orderId:
            order.orderId,
          orderType:
            order.type,
          currentStatus:
            order.status,
          eligibleFromKm:
            order.eligibleFromKm,
          eligibleUntilKm:
            order.eligibleUntilKm,
          priority:
            order.priority,
          maximumFollowers:
            order.maximumFollowers,
        },
        commentaryText: null,
      }

    events.push(
      orderLoadedEvent,
    )
  }

  const simulationState:
    SimulationState = {
      input,
      raceId:
        input.raceId,
      stageId:
        input.stageId,
      seed:
        input.seed,
      raceSecond: 0,
      currentKm: 0,
      stageDistanceKm:
        input.distanceKm,
      riders:
        ridersRecord,
      teams:
        teamStatesRecord,
      groups:
        groupsRecord,
      orders:
        ordersRecord,
      events,

      separationPressureSecondsByRiderId,

      nextEventSequenceNumber:
        events.length + 1,
      nextBreakawayNumber: 1,
      nextChaseNumber: 1,
      nextDroppedGroupNumber: 1,
      finalSprintStarted: false,
      completed: false,
    }

  validateSimulationState(
    simulationState,
  )

  return simulationState
}
