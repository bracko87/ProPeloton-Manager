/**
 * reconcileBreakawayGroups.ts
 *
 * Pure deterministic reconciliation of active breakaway groups after movement
 * and energy application.
 *
 * Initial structural rules:
 * - a breakaway at or behind the active peloton rejoins the peloton;
 * - remaining breakaways whose leader gaps fit inside one 10-second window
 *   merge into one cooperative breakaway group;
 * - the foremost breakaway becomes the deterministic surviving group;
 * - absorbed and merged source groups remain in state but become inactive.
 *
 * This helper:
 * - does not advance the race clock;
 * - does not calculate movement;
 * - does not calculate energy;
 * - does not finish riders;
 * - does not emit events;
 * - does not mutate the supplied state.
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
import {
  validateSimulationState,
} from '../validation/validateSimulationState'

const BREAKAWAY_MERGE_WINDOW_SECONDS =
  10

const PELOTON_REABSORPTION_WINDOW_SECONDS =
  5

export interface ReconcileBreakawayGroupsResult {
  readonly previousState:
    SimulationState

  readonly state:
    SimulationState

  readonly pelotonGroupId:
    string | null

  readonly reabsorbedBreakawayGroupIds:
    readonly string[]

  readonly reclassifiedDroppedGroupIds:
    readonly string[]

  readonly mergedBreakawayGroupIds:
    readonly string[]

  readonly survivingBreakawayGroupIds:
    readonly string[]

  readonly changed:
    boolean
}

function activePeloton(
  state:
    SimulationState,
): GroupState | null {
  return Object.values(
    state.groups,
  )
    .filter(
      (
        group,
      ) =>
        group.active &&
        group.groupType ===
          'peloton',
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        right.distanceKm -
          left.distanceKm ||
        left.groupId.localeCompare(
          right.groupId,
        ),
    )[0] ??
    null
}

function activeBreakaways(
  groups:
    Readonly<
      Record<
        string,
        GroupState
      >
    >,
): readonly GroupState[] {
  return Object.values(
    groups,
  )
    .filter(
      (
        group,
      ) =>
        group.active &&
        group.groupType ===
          'breakaway',
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        left
          .gapFromLeaderSeconds -
          right
            .gapFromLeaderSeconds ||
        right.distanceKm -
          left.distanceKm ||
        left.groupId.localeCompare(
          right.groupId,
        ),
    )
}

function activePelotonReconciliationGroups(
  groups:
    Readonly<
      Record<
        string,
        GroupState
      >
    >,
): readonly GroupState[] {
  return Object.values(
    groups,
  )
    .filter(
      (
        group,
      ) =>
        group.active &&
        (
          group.groupType ===
            'breakaway' ||
          group.groupType ===
            'chase' ||
          group.groupType ===
            'dropped'
        ),
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        left
          .gapFromLeaderSeconds -
          right
            .gapFromLeaderSeconds ||
        right.distanceKm -
          left.distanceKm ||
        left.groupId.localeCompare(
          right.groupId,
        ),
    )
}

function gapToPelotonSeconds(
  group:
    GroupState,
  peloton:
    GroupState,
): number {
  return Math.abs(
    group
      .gapFromLeaderSeconds -
    peloton
      .gapFromLeaderSeconds,
  )
}

function updateRiderGroup(
  rider:
    RiderState,
  targetGroup:
    GroupState,
): RiderState {
  return {
    ...rider,
    currentGroupId:
      targetGroup.groupId,
    distanceKm:
      targetGroup.distanceKm,
    speedKmh:
      targetGroup.speedKmh,
  }
}

function inactiveEmptyGroup(
  group:
    GroupState,
  targetGroup:
    GroupState,
): GroupState {
  return {
    ...group,
    riderIds: [],
    distanceKm:
      targetGroup.distanceKm,
    speedKmh:
      targetGroup.speedKmh,
    gapFromLeaderSeconds:
      targetGroup
        .gapFromLeaderSeconds,
    active:
      false,
  }
}

/**
 * Builds deterministic clusters where every group in a cluster remains within
 * ten seconds of the cluster's foremost group.
 *
 * This avoids chain-merging groups whose total spread exceeds ten seconds.
 */
function createMergeClusters(
  breakaways:
    readonly GroupState[],
): readonly (
  readonly GroupState[]
)[] {
  const clusters:
    GroupState[][] = []

  for (
    const breakaway of
    breakaways
  ) {
    const currentCluster =
      clusters[
        clusters.length -
          1
      ]

    if (
      !currentCluster ||
      currentCluster.length ===
        0
    ) {
      clusters.push([
        breakaway,
      ])
      continue
    }

    const clusterLeader =
      currentCluster[0]

    const gapFromClusterLeader =
      breakaway
        .gapFromLeaderSeconds -
      clusterLeader
        .gapFromLeaderSeconds

    if (
      gapFromClusterLeader <=
      BREAKAWAY_MERGE_WINDOW_SECONDS
    ) {
      currentCluster.push(
        breakaway,
      )
      continue
    }

    clusters.push([
      breakaway,
    ])
  }

  return clusters
}

/**
 * Reconciles active breakaway structure after one completed movement and
 * energy tick.
 */
export function reconcileBreakawayGroups(
  state:
    SimulationState,
): ReconcileBreakawayGroupsResult {
  validateSimulationState(
    state,
  )

  if (
    state.completed
  ) {
    throw new Error(
      'reconcileBreakawayGroups: cannot reconcile a completed simulation.',
    )
  }

  const peloton =
    activePeloton(
      state,
    )

  if (
    !peloton
  ) {
    return {
      previousState:
        state,
      state,
      pelotonGroupId:
        null,
      reabsorbedBreakawayGroupIds:
        [],
      reclassifiedDroppedGroupIds:
        [],
      mergedBreakawayGroupIds:
        [],
      survivingBreakawayGroupIds:
        activeBreakaways(
          state.groups,
        ).map(
          (
            group,
          ) =>
            group.groupId,
        ),
      changed:
        false,
    }
  }

  let nextGroups:
    Record<
      string,
      GroupState
    > = {
      ...state.groups,
    }

  let nextRiders:
    Record<
      string,
      RiderState
    > = {
      ...state.riders,
    }

  const reabsorbedBreakawayGroupIds:
    string[] = []

  const reclassifiedDroppedGroupIds:
    string[] = []

  /*
   * A group within five seconds of the peloton is physically part of the
   * peloton and must be reabsorbed.
   *
   * Breakaway and chase groups that have already fallen behind the peloton are
   * also caught, regardless of their stale calculated gap.
   *
   * A genuine dropped group remains separate when it is more than five seconds
   * behind the peloton.
   */
  const pelotonReconciliationGroups =
    activePelotonReconciliationGroups(
      nextGroups,
    )

  /*
   * Breakaways that already fit inside one merge cluster must first be allowed
   * to form their cooperative breakaway. Otherwise trailing attackers can be
   * incorrectly absorbed by the peloton before reaching the leading attackers.
   */
  const mergeableBreakawayGroupIds =
    new Set(
      createMergeClusters(
        activeBreakaways(
          nextGroups,
        ),
      ).flatMap(
        (
          cluster,
        ) =>
          cluster.length > 1
            ? cluster.map(
                (
                  group,
                ) =>
                  group.groupId,
              )
            : [],
      ),
    )

  const caughtGroups =
    pelotonReconciliationGroups
      .filter(
        (
          group,
        ) => {
          /*
           * A breakaway or chase that is already at or behind the peloton has been
           * physically caught. Fresh-launch protection cannot override this.
           *
           * A dropped group may remain behind the peloton when its separation is
           * greater than the catch window.
           */
          const physicallyCaught =
            group.groupType !==
              'dropped' &&
            group.distanceKm <=
              peloton.distanceKm

          if (
            physicallyCaught
          ) {
            return true
          }

          /*
           * Allow nearby attacking groups to merge with one another before
           * considering peloton proximity.
           */
          if (
            group.groupType ===
              'breakaway' &&
            mergeableBreakawayGroupIds.has(
              group.groupId,
            )
          ) {
            return false
          }

          /*
           * A newly launched breakaway receives one complete movement tick while it
           * remains physically ahead of the peloton.
           */
          const isFreshBreakaway =
            group.groupType ===
              'breakaway' &&
            state.raceSecond -
              group.createdAtRaceSecond <=
              state.input.settings
                .tickSeconds

          if (
            isFreshBreakaway
          ) {
            return false
          }

          /*
           * Any breakaway, chase, or dropped group closer than five seconds to the
           * peloton is treated as part of the peloton.
           */
          const withinCatchWindow =
            gapToPelotonSeconds(
              group,
              peloton,
            ) <
            PELOTON_REABSORPTION_WINDOW_SECONDS

          return withinCatchWindow
        },
      )

  /*
   * A group cannot be classified as dropped while it remains physically ahead
   * of the peloton. Such a group is an intermediate chase/race group.
   */
  for (
    const group of
    pelotonReconciliationGroups
  ) {
    if (
      group.groupType !==
        'dropped' ||
      group.distanceKm <=
        peloton.distanceKm ||
      caughtGroups.some(
        (
          caughtGroup,
        ) =>
          caughtGroup.groupId ===
          group.groupId,
      )
    ) {
      continue
    }

    reclassifiedDroppedGroupIds.push(
      group.groupId,
    )

    nextGroups[
      group.groupId
    ] = {
      ...group,
      groupType:
        'chase',
    }
  }

  let pelotonRiderIds =
    peloton.riderIds
      .slice()

  for (
    const caughtGroup of
    caughtGroups
  ) {
    reabsorbedBreakawayGroupIds.push(
      caughtGroup.groupId,
    )

    pelotonRiderIds.push(
      ...caughtGroup.riderIds,
    )

    for (
      const riderId of
      caughtGroup.riderIds
    ) {
      const rider =
        nextRiders[
          riderId
        ]

      if (
        !rider
      ) {
        throw new Error(
          `reconcileBreakawayGroups: missing rider ${riderId}.`,
        )
      }

      nextRiders[
        riderId
      ] =
        updateRiderGroup(
          rider,
          peloton,
        )
    }

    nextGroups[
      caughtGroup.groupId
    ] =
      inactiveEmptyGroup(
        caughtGroup,
        peloton,
      )
  }

  pelotonRiderIds =
    Array.from(
      new Set(
        pelotonRiderIds,
      ),
    ).sort(
      (
        left,
        right,
      ) =>
        left.localeCompare(
          right,
        ),
    )

  nextGroups[
    peloton.groupId
  ] = {
    ...peloton,
    riderIds:
      pelotonRiderIds,
  }

  /*
   * Only breakaways still physically ahead of the peloton participate in
   * breakaway merging.
   */
  const remainingBreakaways =
    activeBreakaways(
      nextGroups,
    )

  const clusters =
    createMergeClusters(
      remainingBreakaways,
    )

  const mergedBreakawayGroupIds:
    string[] = []

  for (
    const cluster of
    clusters
  ) {
    if (
      cluster.length <=
      1
    ) {
      continue
    }

    /*
     * Clusters are already sorted foremost-first. The foremost group becomes
     * the deterministic surviving breakaway.
     */
    const survivor =
      cluster[0]

    const mergedGroups =
      cluster.slice(
        1,
      )

    const mergedRiderIds =
      Array.from(
        new Set(
          cluster.flatMap(
            (
              group,
            ) =>
              group.riderIds,
          ),
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )

    nextGroups[
      survivor.groupId
    ] = {
      ...survivor,
      riderIds:
        mergedRiderIds,
    }

    for (
      const riderId of
      mergedRiderIds
    ) {
      const rider =
        nextRiders[
          riderId
        ]

      if (
        !rider
      ) {
        throw new Error(
          `reconcileBreakawayGroups: missing rider ${riderId}.`,
        )
      }

      nextRiders[
        riderId
      ] =
        updateRiderGroup(
          rider,
          survivor,
        )
    }

    for (
      const mergedGroup of
      mergedGroups
    ) {
      mergedBreakawayGroupIds.push(
        mergedGroup.groupId,
      )

      nextGroups[
        mergedGroup.groupId
      ] =
        inactiveEmptyGroup(
          mergedGroup,
          survivor,
        )
    }
  }

  const nextState:
    SimulationState = {
    ...state,
    groups:
      nextGroups,
    riders:
      nextRiders,
  }

  validateSimulationState(
    nextState,
  )

  const changed =
    reabsorbedBreakawayGroupIds
      .length >
      0 ||
    reclassifiedDroppedGroupIds
      .length >
      0 ||
    mergedBreakawayGroupIds
      .length >
      0

  return {
    previousState:
      state,
    state:
      changed
        ? nextState
        : state,
    pelotonGroupId:
      peloton.groupId,
    reabsorbedBreakawayGroupIds:
      reabsorbedBreakawayGroupIds
        .slice()
        .sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        ),
    reclassifiedDroppedGroupIds:
      reclassifiedDroppedGroupIds
        .slice()
        .sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        ),
    mergedBreakawayGroupIds:
      mergedBreakawayGroupIds
        .slice()
        .sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        ),
    survivingBreakawayGroupIds:
      activeBreakaways(
        changed
          ? nextState.groups
          : state.groups,
      ).map(
        (
          group,
        ) =>
          group.groupId,
      ),
    changed,
  }
}