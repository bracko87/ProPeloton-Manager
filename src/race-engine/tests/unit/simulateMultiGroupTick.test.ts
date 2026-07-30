/**
 * simulateMultiGroupTick.test.ts
 *
 * Unit expectations for deterministic one-tick multi-group orchestration.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { simulateMultiGroupTick } from '../../simulation/simulateMultiGroupTick'

const stageInput: StageInput = {
  raceId:
    'multi-group-tick-race',
  stageId:
    'multi-group-tick-stage',
  stageName:
    'Multi Group Tick Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed:
    'multi-group-tick-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds:
      30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 36,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Team A',
      captainRiderId:
        'rider-a1',
      riderIds: [
        'rider-a1',
        'rider-a2',
      ],
    },
    {
      teamId: 'team-b',
      teamName: 'Team B',
      captainRiderId:
        'rider-b1',
      riderIds: [
        'rider-b1',
        'rider-b2',
      ],
    },
  ],
  riders: [
    {
      riderId: 'rider-a1',
      teamId: 'team-a',
      riderName: 'A1',
      teamName: 'Team A',
      role: 'captain',
      attributes: {
        flat: 75,
        sprint: 90,
        acceleration: 88,
        stamina: 74,
        resistance: 72,
        recovery: 70,
        teamwork: 78,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'rouleur',
      attributes: {
        flat: 86,
        sprint: 68,
        acceleration: 70,
        stamina: 84,
        resistance: 83,
        recovery: 78,
        teamwork: 82,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 78,
        sprint: 87,
        acceleration: 91,
        stamina: 76,
        resistance: 74,
        recovery: 73,
        teamwork: 77,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 82,
        sprint: 64,
        acceleration: 65,
        stamina: 87,
        resistance: 86,
        recovery: 81,
        teamwork: 89,
      },
    },
  ],
  profilePoints: [
    {
      kilometre: 0,
      elevationMetres: 100,
    },
    {
      kilometre: 0.3,
      elevationMetres: 100,
    },
    {
      kilometre: 0.7,
      elevationMetres: 120,
    },
    {
      kilometre: 1,
      elevationMetres: 105,
    },
  ],
  orders: [],
}

const orderedStageInput:
  StageInput = {
    ...stageInput,
    orders: [
      {
        orderId:
          'order-rider-a1-attack',
        teamId:
          'team-a',
        riderId:
          'rider-a1',
        type:
          'attack',
        status:
          'scheduled',
        eligibleFromKm:
          0.2,
        eligibleUntilKm:
          0.8,
        priority:
          100,
        targetRiderId:
          null,
        maximumFollowers:
          null,
        metadata: {
          source:
            'simulateMultiGroupTick.test',
          phase:
            'phase_2',
        },
      },
    ],
  }

const conflictingOrdersStageInput:
  StageInput = {
    ...stageInput,
    orders: [
      {
        orderId:
          'order-low-priority',
        teamId:
          'team-a',
        riderId:
          'rider-a1',
        type:
          'hold_position',
        status:
          'scheduled',
        eligibleFromKm:
          0.1,
        eligibleUntilKm:
          0.9,
        priority:
          10,
        targetRiderId:
          null,
        maximumFollowers:
          null,
        metadata: {
          source:
            'simulateMultiGroupTick.test',
        },
      },
      {
        orderId:
          'order-high-priority',
        teamId:
          'team-a',
        riderId:
          'rider-a1',
        type:
          'attack',
        status:
          'scheduled',
        eligibleFromKm:
          0.2,
        eligibleUntilKm:
          0.8,
        priority:
          100,
        targetRiderId:
          null,
        maximumFollowers:
          null,
        metadata: {
          source:
            'simulateMultiGroupTick.test',
        },
      },
    ],
  }

function createSeparatedState() {
  return createDroppedGroup({
    state:
      createInitialState(
        stageInput,
      ),
    sourceGroupId:
      'peloton_main',
    riderIds: [
      'rider-a2',
      'rider-b2',
    ],
    speedKmh: 34,
  }).state
}

function createOrderedState(
  currentKm: number,
) {
  const state =
    createInitialState(
      orderedStageInput,
    )

  return {
    ...state,
    currentKm,
    groups: {
      ...state.groups,
      peloton_main: {
        ...state.groups
          .peloton_main,
        distanceKm:
          currentKm,
      },
    },
    riders:
      Object.fromEntries(
        Object.entries(
          state.riders,
        ).map(
          (
            [
              riderId,
              rider,
            ],
          ) => [
            riderId,
            {
              ...rider,
              distanceKm:
                currentKm,
            },
          ],
        ),
      ),
  }
}

function createConflictingOrdersState(
  currentKm: number,
) {
  const state =
    createInitialState(
      conflictingOrdersStageInput,
    )

  return {
    ...state,
    currentKm,
    groups: {
      ...state.groups,
      peloton_main: {
        ...state.groups
          .peloton_main,
        distanceKm:
          currentKm,
      },
    },
    riders:
      Object.fromEntries(
        Object.entries(
          state.riders,
        ).map(
          (
            [
              riderId,
              rider,
            ],
          ) => [
            riderId,
            {
              ...rider,
              distanceKm:
                currentKm,
            },
          ],
        ),
      ),
  }
}

describe(
  'simulateMultiGroupTick',
  () => {
    it(
      'runs movement and energy in the correct order',
      () => {
        const state =
          createSeparatedState()

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result.state.raceSecond,
        ).toBe(30)

        expect(
          result.appliedMovement
            .state.riders[
              'rider-a1'
            ].energy,
        ).toBe(100)

        expect(
          result.appliedEnergy
            .state.riders[
              'rider-a1'
            ].energy,
        ).toBeLessThan(100)

        expect(
          result.finishedRiderIds,
        ).toStrictEqual([])

        expect(
          result.appliedFinish,
        ).toBeNull()
      },
    )

    it(
      'returns group-aware movement for both active groups',
      () => {
        const state =
          createSeparatedState()

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result.movement.proposals
            .map(
              (proposal) =>
                proposal.groupId,
            ),
        ).toStrictEqual([
          'dropped_1',
          'peloton_main',
        ])

        expect(
          result.state.groups
            .dropped_1.distanceKm,
        ).toBeGreaterThan(0)

        expect(
          result.state.groups
            .peloton_main.distanceKm,
        ).toBeGreaterThan(0)
      },
    )

    it(
      'applies finish candidates when a group reaches the finish',
      () => {
        const separatedState =
          createSeparatedState()

        const nearFinishState = {
          ...separatedState,
          raceSecond: 90,
          currentKm: 0.99,
          groups: {
            ...separatedState.groups,
            dropped_1: {
              ...separatedState
                .groups.dropped_1,
              distanceKm: 0.99,
            },
            peloton_main: {
              ...separatedState
                .groups.peloton_main,
              distanceKm: 0.5,
            },
          },
          riders: {
            ...separatedState.riders,
            'rider-a2': {
              ...separatedState
                .riders['rider-a2'],
              distanceKm: 0.99,
            },
            'rider-b2': {
              ...separatedState
                .riders['rider-b2'],
              distanceKm: 0.99,
            },
            'rider-a1': {
              ...separatedState
                .riders['rider-a1'],
              distanceKm: 0.5,
            },
            'rider-b1': {
              ...separatedState
                .riders['rider-b1'],
              distanceKm: 0.5,
            },
          },
        }

        const result =
          simulateMultiGroupTick(
            nearFinishState,
          )

        expect(
          result.appliedFinish,
        ).not.toBeNull()

        expect(
          result.finishedRiderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b2',
        ])

        expect(
          result.state.groups
            .dropped_1.active,
        ).toBe(false)

        expect(
          result.state.groups
            .peloton_main.active,
        ).toBe(true)

        expect(
          result.completedThisTick,
        ).toBe(false)
      },
    )

    it(
      'does not mutate the source state',
      () => {
        const state =
          createSeparatedState()

        const before =
          JSON.stringify(state)

        simulateMultiGroupTick(
          state,
        )

        expect(
          JSON.stringify(state),
        ).toBe(before)
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const state =
          createSeparatedState()

        const resultA =
          simulateMultiGroupTick(
            state,
          )

        const resultB =
          simulateMultiGroupTick(
            state,
          )

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'does not execute an order before its eligible kilometre',
      () => {
        const state =
          createOrderedState(
            0.1,
          )

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result.appliedOrders
            .executedOrders,
        ).toStrictEqual([])

        expect(
          result.state.orders[
            'order-rider-a1-attack'
          ].status,
        ).toBe(
          'scheduled',
        )

        expect(
          result.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ORDER_EXECUTED',
            ),
        ).toStrictEqual([])
      },
    )

    it(
      'executes an eligible order exactly once',
      () => {
        const state =
          createOrderedState(
            0.2,
          )

        const firstResult =
          simulateMultiGroupTick(
            state,
          )

        expect(
          firstResult
            .appliedOrders
            .executedOrders
            .map(
              (order) =>
                order.orderId,
            ),
        ).toStrictEqual([
          'order-rider-a1-attack',
        ])

        expect(
          firstResult.state.orders[
            'order-rider-a1-attack'
          ].status,
        ).toBe(
          'executed',
        )

        expect(
          firstResult.state.orders[
            'order-rider-a1-attack'
          ].executionRaceSecond,
        ).toBe(
          state.raceSecond,
        )

        expect(
          firstResult.state.teams[
            'team-a'
          ].activeOrderIds,
        ).not.toContain(
          'order-rider-a1-attack',
        )

        expect(
          firstResult.state.riders[
            'rider-a1'
          ].acceptedOrderIds,
        ).toContain(
          'order-rider-a1-attack',
        )

        const firstExecutionEvents =
          firstResult.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ORDER_EXECUTED',
            )

        expect(
          firstExecutionEvents,
        ).toHaveLength(1)

        expect(
          firstExecutionEvents[0]
            .payload.orderId,
        ).toBe(
          'order-rider-a1-attack',
        )

        const secondResult =
          simulateMultiGroupTick(
            firstResult.state,
          )

        expect(
          secondResult
            .appliedOrders
            .executedOrders,
        ).toStrictEqual([])

        expect(
          secondResult.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ORDER_EXECUTED',
            ),
        ).toHaveLength(1)
      },
    )

    it(
      'creates and moves a breakaway for an eligible attack order',
      () => {
        const state =
          createOrderedState(
            0.2,
          )

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result
            .appliedOrderEffects
            .attackEffects,
        ).toHaveLength(
          1,
        )

        expect(
          result
            .appliedOrderEffects
            .attackEffects[0]
            .order.orderId,
        ).toBe(
          'order-rider-a1-attack',
        )

        expect(
          result
            .appliedOrderEffects
            .attackEffects[0]
            .separation
            .breakawayGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result
            .appliedOrderEffects
            .state.groups[
              'breakaway_1'
            ].distanceKm,
        ).toBe(
          0.2555555555555556,
        )

        expect(
          result.movement.proposals
            .map(
              (proposal) =>
                proposal.groupId,
            ),
        ).toContain(
          'breakaway_1',
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].distanceKm,
        ).toBeGreaterThan(
          result
            .appliedOrderEffects
            .state.groups[
              'breakaway_1'
            ].distanceKm,
        )

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.state.groups
            .peloton_main
            .riderIds,
        ).not.toContain(
          'rider-a1',
        )

        expect(
          result.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ATTACK_STARTED',
            ),
        ).toHaveLength(
          1,
        )

        expect(
          result.state.events
            .filter(
              (event) =>
                event.eventType ===
                'GROUP_CREATED',
            ),
        ).toHaveLength(
          1,
        )

        const nextResult =
          simulateMultiGroupTick(
            result.state,
          )

        expect(
          nextResult
            .appliedOrderEffects
            .attackEffects,
        ).toStrictEqual([])

        expect(
          nextResult.state.groups[
            'breakaway_2'
          ],
        ).toBeUndefined()

        expect(
          nextResult.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ATTACK_STARTED',
            ),
        ).toHaveLength(
          1,
        )
      },
    )

    it(
      'does not execute an order at its exclusive upper kilometre boundary',
      () => {
        const state =
          createOrderedState(
            0.8,
          )

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result.appliedOrders
            .executedOrders,
        ).toStrictEqual([])

        expect(
          result.state.orders[
            'order-rider-a1-attack'
          ].status,
        ).toBe(
          'scheduled',
        )
      },
    )

    it(
      'keeps order lifecycle application deterministic',
      () => {
        const state =
          createOrderedState(
            0.4,
          )

        const resultA =
          simulateMultiGroupTick(
            state,
          )

        const resultB =
          simulateMultiGroupTick(
            state,
          )

        expect(
          resultA.appliedOrders,
        ).toStrictEqual(
          resultB.appliedOrders,
        )

        expect(
          resultA.state.orders,
        ).toStrictEqual(
          resultB.state.orders,
        )
      },
    )

    it(
      'selects the highest-priority eligible order for a rider',
      () => {
        const state =
          createConflictingOrdersState(
            0.4,
          )

        const result =
          simulateMultiGroupTick(
            state,
          )

        expect(
          result.appliedOrders
            .selection
            .eligibleOrderIds,
        ).toStrictEqual([
          'order-high-priority',
          'order-low-priority',
        ])

        expect(
          result.appliedOrders
            .selection
            .selectedOrders
            .map(
              (order) =>
                order.orderId,
            ),
        ).toStrictEqual([
          'order-high-priority',
        ])

        expect(
          result.appliedOrders
            .selection
            .ignoredOrderIds,
        ).toStrictEqual([
          'order-low-priority',
        ])

        expect(
          result.state.orders[
            'order-high-priority'
          ].status,
        ).toBe(
          'executed',
        )

        expect(
          result.state.orders[
            'order-low-priority'
          ].status,
        ).toBe(
          'scheduled',
        )

        expect(
          result.state.events
            .filter(
              (event) =>
                event.eventType ===
                'ORDER_EXECUTED',
            )
            .map(
              (event) =>
                event.payload.orderId,
            ),
        ).toStrictEqual([
          'order-high-priority',
        ])
      },
    )

    it(
      'rejects completed simulations',
      () => {
        const state = {
          ...createSeparatedState(),
          completed: true,
        }

        expect(() =>
          simulateMultiGroupTick(
            state,
          ),
        ).toThrow(
          'cannot advance a completed simulation',
        )
      },
    )
  },
)