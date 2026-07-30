/**
 * selectEligibleTeamOrders.ts
 *
 * Pure deterministic selection of pre-race team orders that are eligible at
 * the current simulation kilometre.
 *
 * This helper does not mutate SimulationState, change order statuses, create
 * groups, alter movement, consume energy, append events, or persist anything.
 */

import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  TeamOrder,
} from '../domain/TeamOrder'

export interface EligibleTeamOrderSelection {
  readonly selectedOrders:
    readonly TeamOrder[]

  readonly selectedOrderByRiderId:
    Readonly<
      Record<
        string,
        TeamOrder
      >
    >

  readonly eligibleOrderIds:
    readonly string[]

  readonly ignoredOrderIds:
    readonly string[]
}

function isActiveOrderStatus(
  order: TeamOrder,
): boolean {
  return (
    order.status ===
      'loaded' ||
    order.status ===
      'accepted' ||
    order.status ===
      'scheduled'
  )
}

function isOrderInsideWindow(
  order: TeamOrder,
  currentKm: number,
): boolean {
  return (
    currentKm >=
      order.eligibleFromKm &&
    currentKm <
      order.eligibleUntilKm
  )
}

function compareEligibleOrders(
  left: TeamOrder,
  right: TeamOrder,
): number {
  if (
    left.priority !==
    right.priority
  ) {
    return (
      right.priority -
      left.priority
    )
  }

  if (
    left.eligibleFromKm !==
    right.eligibleFromKm
  ) {
    return (
      left.eligibleFromKm -
      right.eligibleFromKm
    )
  }

  return left.orderId.localeCompare(
    right.orderId,
  )
}

/**
 * Selects at most one currently eligible order per rider.
 *
 * Conflict resolution:
 * 1. highest priority;
 * 2. earliest eligible kilometre;
 * 3. stable orderId ordering.
 */
export function selectEligibleTeamOrders(
  state: SimulationState,
): EligibleTeamOrderSelection {
  const sortedOrders =
    Object.values(
      state.orders,
    )
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

  const eligibleOrders =
    sortedOrders
      .filter(
        (order) =>
          isActiveOrderStatus(
            order,
          ),
      )
      .filter(
        (order) =>
          isOrderInsideWindow(
            order,
            state.currentKm,
          ),
      )
      .filter(
        (order) => {
          const rider =
            state.riders[
              order.riderId
            ]

          return (
            rider !==
              undefined &&
            rider.stageStatus ===
              'racing'
          )
        },
      )
      .sort(
        compareEligibleOrders,
      )

  const selectedOrderByRiderId:
    Record<
      string,
      TeamOrder
    > = {}

  for (
    const order of
    eligibleOrders
  ) {
    if (
      selectedOrderByRiderId[
        order.riderId
      ]
    ) {
      continue
    }

    selectedOrderByRiderId[
      order.riderId
    ] =
      order
  }

  const selectedOrders =
    Object.values(
      selectedOrderByRiderId,
    )
      .slice()
      .sort(
        (
          left,
          right,
        ) => {
          const riderComparison =
            left.riderId.localeCompare(
              right.riderId,
            )

          if (
            riderComparison !==
            0
          ) {
            return riderComparison
          }

          return compareEligibleOrders(
            left,
            right,
          )
        },
      )

  const selectedOrderIds =
    new Set(
      selectedOrders.map(
        (order) =>
          order.orderId,
      ),
    )

  const eligibleOrderIds =
    eligibleOrders.map(
      (order) =>
        order.orderId,
    )

  const ignoredOrderIds =
    eligibleOrders
      .filter(
        (order) =>
          !selectedOrderIds.has(
            order.orderId,
          ),
      )
      .map(
        (order) =>
          order.orderId,
      )

  return {
    selectedOrders,
    selectedOrderByRiderId,
    eligibleOrderIds,
    ignoredOrderIds,
  }
}