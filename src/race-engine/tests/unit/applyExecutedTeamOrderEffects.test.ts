
/**
 * applyExecutedTeamOrderEffects.test.ts
 *
 * Unit expectations for deterministic tactical effects produced by newly
 * executed team orders.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  StageInput,
} from '../../domain/StageInput'
import type {
  TeamOrder,
} from '../../domain/TeamOrder'
import {
  createInitialState,
} from '../../simulation/createInitialState'
import {
  applyExecutedTeamOrderEffects,
} from '../../simulation/applyExecutedTeamOrderEffects'

const stageInput:
  StageInput = {
    raceId:
      'executed-order-effects-race',
    stageId:
      'executed-order-effects-stage',
    stageName:
      'Executed Order Effects Test',
    stageFormat:
      'road_race',
    distanceKm:
      10,
    seed:
      'executed-order-effects-seed',
    settings: {
      tickSeconds:
        30,
      replaySnapshotIntervalSeconds:
        30,
      maximumBreakawaySize:
        8,
      minimumSpeedKmh:
        36,
      maximumSpeedKmh:
        60,
    },
    teams: [
      {
        teamId:
          'team-a',
        teamName:
          'Team A',
        captainRiderId:
          'rider-a1',
        riderIds: [
          'rider-a1',
          'rider-a2',
        ],
      },
      {
        teamId:
          'team-b',
        teamName:
          'Team B',
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
        riderId:
          'rider-a1',
        teamId:
          'team-a',
        riderName:
          'A1',
        teamName:
          'Team A',
        role:
          'captain',
        attributes: {
          flat: 80,
          sprint: 80,
          acceleration: 90,
          stamina: 80,
          resistance: 80,
          recovery: 80,
          teamwork: 80,
        },
      },
      {
        riderId:
          'rider-a2',
        teamId:
          'team-a',
        riderName:
          'A2',
        teamName:
          'Team A',
        role:
          'rouleur',
        attributes: {
          flat: 82,
          sprint: 70,
          acceleration: 72,
          stamina: 84,
          resistance: 83,
          recovery: 80,
          teamwork: 85,
        },
      },
      {
        riderId:
          'rider-b1',
        teamId:
          'team-b',
        riderName:
          'B1',
        teamName:
          'Team B',
        role:
          'captain',
        attributes: {
          flat: 79,
          sprint: 82,
          acceleration: 88,
          stamina: 79,
          resistance: 79,
          recovery: 79,
          teamwork: 79,
        },
      },
      {
        riderId:
          'rider-b2',
        teamId:
          'team-b',
        riderName:
          'B2',
        teamName:
          'Team B',
        role:
          'domestique',
        attributes: {
          flat: 81,
          sprint: 65,
          acceleration: 68,
          stamina: 86,
          resistance: 85,
          recovery: 82,
          teamwork: 90,
        },
      },
    ],
    profilePoints: [
      {
        kilometre:
          0,
        elevationMetres:
          100,
      },
      {
        kilometre:
          10,
        elevationMetres:
          100,
      },
    ],
    orders: [],
  }

const executedAttackOrder:
  TeamOrder = {
    orderId:
      'order-rider-a1-attack',
    teamId:
      'team-a',
    riderId:
      'rider-a1',
    type:
      'attack',
    status:
      'executed',
    eligibleFromKm:
      0,
    eligibleUntilKm:
      5,
    priority:
      100,
    targetRiderId:
      null,
    maximumFollowers:
      null,
    metadata: {
      source:
        'applyExecutedTeamOrderEffects.test',
    },
    executionRaceSecond:
      0,
  }

const executedHoldOrder:
  TeamOrder = {
    orderId:
      'order-rider-a1-hold',
    teamId:
      'team-a',
    riderId:
      'rider-a1',
    type:
      'hold_position',
    status:
      'executed',
    eligibleFromKm:
      0,
    eligibleUntilKm:
      5,
    priority:
      50,
    targetRiderId:
      null,
    maximumFollowers:
      null,
    metadata: {
      source:
        'applyExecutedTeamOrderEffects.test',
    },
    executionRaceSecond:
      0,
  }

describe(
  'applyExecutedTeamOrderEffects',
  () => {
    it(
      'creates a breakaway for an executed attack order',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const result =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        expect(
          result.attackEffects,
        ).toHaveLength(
          1,
        )

        expect(
          result.ignoredOrders,
        ).toStrictEqual([])

        expect(
          result.state.groups[
            'breakaway_1'
          ].groupType,
        ).toBe(
          'breakaway',
        )

        expect(
          result.state.groups[
            'breakaway_1'
          ].riderIds,
        ).toStrictEqual([
          'rider-a1',
        ])

        expect(
          result.state.groups
            .peloton_main
            .riderIds,
        ).toStrictEqual([
          'rider-a2',
          'rider-b1',
          'rider-b2',
        ])

        expect(
          result.state.riders[
            'rider-a1'
          ].currentGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.state.raceSecond,
        ).toBe(
          state.raceSecond,
        )

        expect(
          result.state.currentKm,
        ).toBe(
          state.currentKm,
        )
      },
    )

    it(
      'emits one attack event and one group-created event',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const result =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        expect(
          result.events.map(
            (event) =>
              event.eventType,
          ),
        ).toStrictEqual([
          'ATTACK_STARTED',
          'GROUP_CREATED',
        ])

        expect(
          result.events.map(
            (event) =>
              event.sequenceNumber,
          ),
        ).toStrictEqual([
          state.nextEventSequenceNumber,
          state.nextEventSequenceNumber +
            1,
        ])

        expect(
          result.events[0]
            .payload.orderId,
        ).toBe(
          'order-rider-a1-attack',
        )

        expect(
          result.events[0]
            .targetGroupId,
        ).toBe(
          'breakaway_1',
        )

        expect(
          result.events[1]
            .payload.groupType,
        ).toBe(
          'breakaway',
        )

        expect(
          result.state
            .nextEventSequenceNumber,
        ).toBe(
          state.nextEventSequenceNumber +
            2,
        )
      },
    )

    it(
      'keeps unsupported executed orders lifecycle-only',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const result =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedHoldOrder,
            ],
          )

        expect(
          result.attackEffects,
        ).toStrictEqual([])

        expect(
          result.ignoredOrders.map(
            (order) =>
              order.orderId,
          ),
        ).toStrictEqual([
          'order-rider-a1-hold',
        ])

        expect(
          result.events,
        ).toStrictEqual([])

        expect(
          result.state,
        ).toBe(
          state,
        )
      },
    )

    it(
      'does not mutate the source state',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const before =
          JSON.stringify(
            state,
          )

        applyExecutedTeamOrderEffects(
          state,
          [
            executedAttackOrder,
          ],
        )

        expect(
          JSON.stringify(
            state,
          ),
        ).toBe(
          before,
        )
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const resultA =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        const resultB =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        expect(
          resultA,
        ).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'uses bounded attack launch speed when explicitly enabled',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const sourceSpeedKmh =
          state.groups
            .peloton_main
            .speedKmh

        const legacyResult =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        const controlledResult =
          applyExecutedTeamOrderEffects(
            {
              ...state,
              controlledAttackLaunchEnabled:
                true,
            },
            [
              executedAttackOrder,
            ],
          )

        const legacyEffect =
          legacyResult
            .attackEffects[0]

        const controlledEffect =
          controlledResult
            .attackEffects[0]

        expect(
          legacyEffect
            .attackLaunchResult,
        ).toBeUndefined()

        expect(
          controlledEffect
            .attackLaunchResult,
        ).toBeDefined()

        expect(
          controlledEffect
            .attackLaunchResult!
            .launchBonusKmh,
        ).toBeGreaterThan(0)

        expect(
          controlledEffect
            .attackLaunchResult!
            .launchBonusKmh,
        ).toBeLessThanOrEqual(4)

        expect(
          controlledEffect
            .attackLaunchResult!
            .launchSpeedKmh,
        ).toBeGreaterThan(
          sourceSpeedKmh,
        )

        expect(
          controlledEffect
            .attackLaunchResult!
            .launchSpeedKmh,
        ).toBeLessThanOrEqual(
          stageInput.settings
            .maximumSpeedKmh,
        )

        expect(
          controlledResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        ).toBe(
          controlledEffect
            .attackLaunchResult!
            .launchSpeedKmh,
        )

        expect(
          controlledResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        ).toBeLessThanOrEqual(
          legacyResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        )
      },
    )

    it(
      'returns deterministic controlled attack diagnostics',
      () => {
        const state = {
          ...createInitialState(
            stageInput,
          ),
          controlledAttackLaunchEnabled:
            true,
        }

        const resultA =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        const resultB =
          applyExecutedTeamOrderEffects(
            state,
            [
              executedAttackOrder,
            ],
          )

        expect(
          resultA
            .attackEffects[0]
            .attackLaunchResult,
        ).toStrictEqual(
          resultB
            .attackEffects[0]
            .attackLaunchResult,
        )

        expect(
          resultA
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        ).toBe(
          resultB
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        )
      },
    )

    it(
      'reduces controlled attack launch advantage on steep terrain',
      () => {
        const uphillStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'executed-order-effects-uphill-stage',
            profilePoints: [
              {
                kilometre: 0,
                elevationMetres: 100,
              },
              {
                kilometre: 10,
                elevationMetres: 1100,
              },
            ],
          }

        const downhillStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'executed-order-effects-downhill-stage',
            profilePoints: [
              {
                kilometre: 0,
                elevationMetres: 1100,
              },
              {
                kilometre: 10,
                elevationMetres: 100,
              },
            ],
          }

        const flatResult =
          applyExecutedTeamOrderEffects(
            {
              ...createInitialState(
                stageInput,
              ),
              controlledAttackLaunchEnabled:
                true,
            },
            [
              executedAttackOrder,
            ],
          )

        const uphillResult =
          applyExecutedTeamOrderEffects(
            {
              ...createInitialState(
                uphillStageInput,
              ),
              controlledAttackLaunchEnabled:
                true,
            },
            [
              executedAttackOrder,
            ],
          )

        const downhillResult =
          applyExecutedTeamOrderEffects(
            {
              ...createInitialState(
                downhillStageInput,
              ),
              controlledAttackLaunchEnabled:
                true,
            },
            [
              executedAttackOrder,
            ],
          )

        const flatLaunch =
          flatResult
            .attackEffects[0]
            .attackLaunchResult!

        const uphillLaunch =
          uphillResult
            .attackEffects[0]
            .attackLaunchResult!

        const downhillLaunch =
          downhillResult
            .attackEffects[0]
            .attackLaunchResult!

        expect(
          flatLaunch.gradientPercent,
        ).toBe(0)

        expect(
          uphillLaunch.gradientPercent,
        ).toBe(10)

        expect(
          downhillLaunch.gradientPercent,
        ).toBe(-10)

        expect(
          uphillLaunch.terrainFactor,
        ).toBeLessThan(
          flatLaunch.terrainFactor,
        )

        expect(
          downhillLaunch.terrainFactor,
        ).toBeLessThan(
          flatLaunch.terrainFactor,
        )

        expect(
          uphillLaunch.launchBonusKmh,
        ).toBeLessThan(
          flatLaunch.launchBonusKmh,
        )

        expect(
          downhillLaunch.launchBonusKmh,
        ).toBeLessThan(
          flatLaunch.launchBonusKmh,
        )

        expect(
          uphillResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        ).toBeLessThan(
          flatResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        )

        expect(
          downhillResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        ).toBeLessThan(
          flatResult
            .state.groups[
              'breakaway_1'
            ].speedKmh,
        )
      },
    )

    it(
      'does nothing when no executed orders are supplied',
      () => {
        const state =
          createInitialState(
            stageInput,
          )

        const result =
          applyExecutedTeamOrderEffects(
            state,
            [],
          )

        expect(
          result.state,
        ).toBe(
          state,
        )

        expect(
          result.attackEffects,
        ).toStrictEqual([])

        expect(
          result.ignoredOrders,
        ).toStrictEqual([])

        expect(
          result.events,
        ).toStrictEqual([])
      },
    )
  },
)

