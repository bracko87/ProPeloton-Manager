/**
 * applyEligibleTeamOrders.ts
 *
 * Deterministic lifecycle application for currently eligible pre-race orders.
 *
 * This helper:
 * - selects at most one eligible order per rider;
 * - changes the selected order status to executed;
 * - records executionRaceSecond;
 * - removes executed orders from team active-order lists;
 * - adds order IDs to rider accepted-order tracking;
 * - appends deterministic ORDER_EXECUTED events.
 *
 * It deliberately does not yet:
 * - change movement;
 * - create or move groups;
 * - consume additional energy;
 * - increment attack attempts;
 * - complete tactical orders;
 * - persist any result.
 */

import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  RiderState,
} from '../domain/RiderState'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  TeamOrder,
} from '../domain/TeamOrder'
import type {
  TeamState,
} from '../domain/TeamState'
import {
  selectEligibleTeamOrders,
  type EligibleTeamOrderSelection,
} from './selectEligibleTeamOrders'

export interface ApplyEligibleTeamOrdersResult {
  readonly previousState:
    SimulationState

  readonly state:
    SimulationState

  readonly selection:
    EligibleTeamOrderSelection

  readonly executedOrders:
    readonly TeamOrder[]

  readonly events:
    readonly RaceEvent[]
}

function appendUniqueSorted(
  values: readonly string[],
  value: string,
): readonly string[] {
  return Array.from(
    new Set([
      ...values,
      value,
    ]),
  ).sort(
    (
      left,
      right,
    ) =>
      left.localeCompare(
        right,
      ),
  )
}

function removeValue(
  values: readonly string[],
  value: string,
): readonly string[] {
  return values
    .filter(
      (candidate) =>
        candidate !== value,
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        left.localeCompare(
          right,
        ),
    )
}

function createExecutedOrder(
  order: TeamOrder,
  raceSecond: number,
): TeamOrder {
  return {
    ...order,
    status:
      'executed',
    executionRaceSecond:
      raceSecond,
  }
}

function createUpdatedRider(
  rider: RiderState,
  orderId: string,
): RiderState {
  return {
    ...rider,
    acceptedOrderIds:
      appendUniqueSorted(
        rider.acceptedOrderIds,
        orderId,
      ),
  }
}

function createUpdatedTeam(
  team: TeamState,
  orderId: string,
): TeamState {
  return {
    ...team,
    activeOrderIds:
      removeValue(
        team.activeOrderIds,
        orderId,
      ),
  }
}

function createOrderExecutedEvent(
  state: SimulationState,
  order: TeamOrder,
  sequenceNumber: number,
): RaceEvent {
  const rider =
    state.riders[
      order.riderId
    ]

  return {
    sequenceNumber,
    eventType:
      'ORDER_EXECUTED',
    raceSecond:
      state.raceSecond,
    kmMarker:
      state.currentKm,
    actorRiderId:
      order.riderId,
    teamId:
      order.teamId,
    sourceGroupId:
      rider
        ?.currentGroupId ??
      null,
    targetGroupId:
      null,
    relatedRiderIds: [
      order.riderId,
      ...(
        order.targetRiderId &&
        order.targetRiderId !==
          order.riderId
          ? [
              order.targetRiderId,
            ]
          : []
      ),
    ],
    payload: {
      orderId:
        order.orderId,
      orderType:
        order.type,
      previousStatus:
        order.status,
      currentStatus:
        'executed',
      eligibleFromKm:
        order.eligibleFromKm,
      eligibleUntilKm:
        order.eligibleUntilKm,
      priority:
        order.priority,
      targetRiderId:
        order.targetRiderId ??
        null,
      maximumFollowers:
        order.maximumFollowers ??
        null,
    },
    commentaryText:
      null,
  }
}

/**
 * Applies lifecycle execution to all currently selected orders.
 *
 * Calling this function again with the returned state is idempotent for those
 * orders because executed orders are no longer eligible for selection.
 */
export function applyEligibleTeamOrders(
  state: SimulationState,
): ApplyEligibleTeamOrdersResult {
  const selection =
    selectEligibleTeamOrders(
      state,
    )

  if (
    selection
      .selectedOrders
      .length === 0
  ) {
    return {
      previousState:
        state,
      state,
      selection,
      executedOrders: [],
      events: [],
    }
  }

  const nextOrders = {
    ...state.orders,
  }

  const nextRiders = {
    ...state.riders,
  }

  const nextTeams = {
    ...state.teams,
  }

  const executionEvents:
    RaceEvent[] = []

  let nextSequenceNumber =
    state.nextEventSequenceNumber

  for (
    const selectedOrder of
    selection.selectedOrders
  ) {
    const rider =
      nextRiders[
        selectedOrder.riderId
      ]

    const team =
      nextTeams[
        selectedOrder.teamId
      ]

    if (
      !rider ||
      !team
    ) {
      continue
    }

    const executedOrder =
      createExecutedOrder(
        selectedOrder,
        state.raceSecond,
      )

    nextOrders[
      executedOrder.orderId
    ] =
      executedOrder

    nextRiders[
      rider.riderId
    ] =
      createUpdatedRider(
        rider,
        executedOrder.orderId,
      )

    nextTeams[
      team.teamId
    ] =
      createUpdatedTeam(
        team,
        executedOrder.orderId,
      )

    executionEvents.push(
      createOrderExecutedEvent(
        state,
        executedOrder,
        nextSequenceNumber,
      ),
    )

    nextSequenceNumber +=
      1
  }

  const executedOrderIds =
    new Set(
      executionEvents.map(
        (event) =>
          String(
            event.payload
              .orderId,
          ),
      ),
    )

  const executedOrders =
    selection
      .selectedOrders
      .filter(
        (order) =>
          executedOrderIds.has(
            order.orderId,
          ),
      )
      .map(
        (order) =>
          nextOrders[
            order.orderId
          ],
      )

  const nextState:
    SimulationState = {
      ...state,
      riders:
        nextRiders,
      teams:
        nextTeams,
      orders:
        nextOrders,
      events: [
        ...state.events,
        ...executionEvents,
      ],
      nextEventSequenceNumber:
        nextSequenceNumber,
    }

  return {
    previousState:
      state,
    state:
      nextState,
    selection,
    executedOrders,
    events:
      executionEvents,
  }
}