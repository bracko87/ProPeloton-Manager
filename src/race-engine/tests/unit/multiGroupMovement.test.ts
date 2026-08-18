/**
 * multiGroupMovement.test.ts
 *
 * Unit expectations for deterministic multi-group movement proposals.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createInitialState } from '../../simulation/createInitialState'
import { calculateMultiGroupMovement } from '../../simulation/multiGroupMovement'

const stageInput: StageInput = {
  raceId: 'multi-group-test-race',
  stageId: 'multi-group-test-stage',
  stageName: 'Multi Group Movement Test',
  stageFormat: 'road_race',
  distanceKm: 10,
  seed: 'multi-group-test-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds: 30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 30,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Team A',
      captainRiderId: 'rider-a1',
      riderIds: [
        'rider-a1',
        'rider-a2',
      ],
    },
    {
      teamId: 'team-b',
      teamName: 'Team B',
      captainRiderId: 'rider-b1',
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
        flat: 90,
        sprint: 80,
        acceleration: 80,
        stamina: 90,
        resistance: 90,
        recovery: 90,
        teamwork: 90,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'domestique',
      attributes: {
        flat: 60,
        sprint: 60,
        acceleration: 60,
        stamina: 60,
        resistance: 60,
        recovery: 60,
        teamwork: 60,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 88,
        sprint: 80,
        acceleration: 80,
        stamina: 88,
        resistance: 88,
        recovery: 88,
        teamwork: 88,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 58,
        sprint: 58,
        acceleration: 58,
        stamina: 58,
        resistance: 58,
        recovery: 58,
        teamwork: 58,
      },
    },
  ],
  profilePoints: [
    {
      kilometre: 0,
      elevationMetres: 100,
    },
    {
      kilometre: 10,
      elevationMetres: 100,
    },
  ],
  orders: [],
}

function createMultiGroupState() {
  const initialState =
    createInitialState(stageInput)

  return createDroppedGroup({
    state: initialState,
    sourceGroupId: 'peloton_main',
    riderIds: [
      'rider-a2',
      'rider-b2',
    ],
    speedKmh: 34,
  }).state
}

describe(
  'calculateMultiGroupMovement',
  () => {
    it(
      'returns one proposal per active group in stable order',
      () => {
        const result =
          calculateMultiGroupMovement(
            createMultiGroupState(),
          )

        expect(
          result.proposals.map(
            (proposal) =>
              proposal.groupId,
          ),
        ).toStrictEqual([
          'dropped_1',
          'peloton_main',
        ])
      },
    )

    it(
      'moves the stronger peloton farther than the dropped group',
      () => {
        const result =
          calculateMultiGroupMovement(
            createMultiGroupState(),
          )

        const dropped =
          result.proposals.find(
            (proposal) =>
              proposal.groupId ===
              'dropped_1',
          )

        const peloton =
          result.proposals.find(
            (proposal) =>
              proposal.groupId ===
              'peloton_main',
          )

        expect(dropped).toBeDefined()
        expect(peloton).toBeDefined()

        expect(
          peloton!.nextDistanceKm,
        ).toBeGreaterThan(
          dropped!.nextDistanceKm,
        )

        expect(
          result.leaderGroupId,
        ).toBe('peloton_main')

        expect(
          dropped!.gapFromLeaderSeconds,
        ).toBeGreaterThan(0)

        expect(
          peloton!.gapFromLeaderSeconds,
        ).toBe(0)
      },
    )

    it(
      'does not mutate the input state',
      () => {
        const state =
          createMultiGroupState()

        const before =
          JSON.stringify(state)

        calculateMultiGroupMovement(
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
          createMultiGroupState()

        const resultA =
          calculateMultiGroupMovement(
            state,
          )

        const resultB =
          calculateMultiGroupMovement(
            state,
          )

        expect(resultA).toStrictEqual(
          resultB,
        )
      },
    )

    it(
      'increases organized-group pace when cooperation is enabled',
      () => {
        const state =
          createMultiGroupState()

        const baseline =
          calculateMultiGroupMovement(
            state,
          )

        const withCooperation =
          calculateMultiGroupMovement({
            ...state,
            groupCooperationPaceEnabled:
              true,
          })

        for (
          const proposal of
          withCooperation.proposals
        ) {
          const baselineProposal =
            baseline.proposals.find(
              (
                candidate,
              ) =>
                candidate.groupId ===
                proposal.groupId,
            )

          expect(
            baselineProposal,
          ).toBeDefined()

          expect(
            proposal.baseSpeedKmh,
          ).toBeGreaterThan(
            baselineProposal!
              .baseSpeedKmh,
          )

          expect(
            proposal.appliedSpeedKmh,
          ).toBeGreaterThan(
            baselineProposal!
              .appliedSpeedKmh,
          )

          expect(
            proposal.nextDistanceKm,
          ).toBeGreaterThan(
            baselineProposal!
              .nextDistanceKm,
          )
        }
      },
    )

    it(
      'exposes cooperation diagnostics only when enabled',
      () => {
        const state =
          createMultiGroupState()

        const baseline =
          calculateMultiGroupMovement(
            state,
          )

        const withCooperation =
          calculateMultiGroupMovement({
            ...state,
            groupCooperationPaceEnabled:
              true,
          })

        for (
          const proposal of
          baseline.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeCooperationKmh,
          ).toBeUndefined()

          expect(
            proposal
              .cooperationPaceBonusPercent,
          ).toBeUndefined()

          expect(
            proposal
              .cooperationPaceMultiplier,
          ).toBeUndefined()

          expect(
            proposal
              .cooperationResult,
          ).toBeUndefined()
        }

        for (
          const proposal of
          withCooperation.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeCooperationKmh,
          ).toBeDefined()

          expect(
            proposal
              .cooperationPaceBonusPercent,
          ).toBeGreaterThan(
            0,
          )

          expect(
            proposal
              .cooperationPaceMultiplier,
          ).toBeGreaterThan(
            1,
          )

          expect(
            proposal
              .cooperationResult,
          ).toBeDefined()

          expect(
            proposal.baseSpeedKmh,
          ).toBeGreaterThan(
            proposal
              .baseSpeedBeforeCooperationKmh!,
          )
        }
      },
    )

    it(
      'preserves exact movement for a solo group with cooperation enabled',
      () => {
        const initialState =
          createInitialState(
            stageInput,
          )

        const soloSeparatedState =
          createDroppedGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
            ],
            speedKmh:
              34,
          }).state

        const baseline =
          calculateMultiGroupMovement(
            soloSeparatedState,
          )

        const withCooperation =
          calculateMultiGroupMovement({
            ...soloSeparatedState,
            groupCooperationPaceEnabled:
              true,
          })

        const baselineSolo =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )

        const cooperationSolo =
          withCooperation
            .proposals
            .find(
              (
                proposal,
              ) =>
                proposal.groupId ===
                'dropped_1',
            )

        expect(
          baselineSolo,
        ).toBeDefined()

        expect(
          cooperationSolo,
        ).toBeDefined()

        expect(
          cooperationSolo!
            .cooperationPaceBonusPercent,
        ).toBe(
          0,
        )

        expect(
          cooperationSolo!
            .cooperationPaceMultiplier,
        ).toBe(
          1,
        )

        expect(
          cooperationSolo!
            .baseSpeedKmh,
        ).toBe(
          baselineSolo!
            .baseSpeedKmh,
        )

        expect(
          cooperationSolo!
            .appliedSpeedKmh,
        ).toBe(
          baselineSolo!
            .appliedSpeedKmh,
        )

        expect(
          cooperationSolo!
            .nextDistanceKm,
        ).toBe(
          baselineSolo!
            .nextDistanceKm,
        )
      },
    )

    it(
      'keeps cooperation-adjusted descent speed within configured limits',
      () => {
        const downhillStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'multi-group-steep-downhill-stage',
            profilePoints: [
              {
                kilometre: 0,
                elevationMetres: 3100,
              },
              {
                kilometre: 10,
                elevationMetres: 100,
              },
            ],
          }

        const initialState =
          createInitialState(
            downhillStageInput,
          )

        const downhillState =
          createDroppedGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
              'rider-b2',
            ],
            speedKmh:
              34,
          }).state

        const result =
          calculateMultiGroupMovement({
            ...downhillState,
            groupCooperationPaceEnabled:
              true,
          })

        for (
          const proposal of
          result.proposals
        ) {
          expect(
            proposal.gradientPercent,
          ).toBe(-30)

          expect(
            proposal.terrainMultiplier,
          ).toBeLessThanOrEqual(
            1.35,
          )

          expect(
            proposal.appliedSpeedKmh,
          ).toBeLessThanOrEqual(
            downhillStageInput
              .settings
              .maximumSpeedKmh,
          )

          expect(
            proposal.nextDistanceKm,
          ).toBeLessThanOrEqual(
            downhillStageInput
              .distanceKm,
          )
        }
      },
    )

    it(
      'increases only peloton pace during the final thirty percent',
      () => {
        const longStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'multi-group-final-stage-effort',
            distanceKm:
              100,
            profilePoints: [
              {
                kilometre: 0,
                elevationMetres: 100,
              },
              {
                kilometre: 100,
                elevationMetres: 100,
              },
            ],
          }

        const initialState =
          createInitialState(
            longStageInput,
          )

        const separatedState =
          createDroppedGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
              'rider-b2',
            ],
            speedKmh:
              34,
          }).state

        const lateStage = {
          ...separatedState,
          currentKm:
            80,
          groups:
            Object.fromEntries(
              Object.entries(
                separatedState.groups,
              ).map(
                (
                  [
                    groupId,
                    group,
                  ],
                ) => [
                  groupId,
                  {
                    ...group,
                    distanceKm:
                      80,
                  },
                ],
              ),
            ),
          riders:
            Object.fromEntries(
              Object.entries(
                separatedState.riders,
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
                      80,
                  },
                ],
              ),
            ),
        }

        const baseline =
          calculateMultiGroupMovement(
            lateStage,
          )

        const withFinalEffort =
          calculateMultiGroupMovement({
            ...lateStage,
            finalStagePelotonEffortEnabled:
              true,
          })

        const baselinePeloton =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'peloton_main',
          )!

        const finalEffortPeloton =
          withFinalEffort
            .proposals
            .find(
              (
                proposal,
              ) =>
                proposal.groupId ===
                'peloton_main',
            )!

        const baselineDropped =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        const finalEffortDropped =
          withFinalEffort
            .proposals
            .find(
              (
                proposal,
              ) =>
                proposal.groupId ===
                'dropped_1',
            )!

        expect(
          finalEffortPeloton
            .finalStageEffortBonusPercent,
        ).toBeGreaterThan(0)

        expect(
          finalEffortPeloton
            .baseSpeedKmh,
        ).toBeGreaterThan(
          baselinePeloton
            .baseSpeedKmh,
        )

        expect(
          finalEffortPeloton
            .appliedSpeedKmh,
        ).toBeGreaterThan(
          baselinePeloton
            .appliedSpeedKmh,
        )

        expect(
          finalEffortPeloton
            .nextDistanceKm,
        ).toBeGreaterThan(
          baselinePeloton
            .nextDistanceKm,
        )

        expect(
          finalEffortDropped
            .finalStageEffortBonusPercent,
        ).toBe(0)

        expect(
          finalEffortDropped
            .baseSpeedKmh,
        ).toBe(
          baselineDropped
            .baseSpeedKmh,
        )

        expect(
          finalEffortDropped
            .appliedSpeedKmh,
        ).toBe(
          baselineDropped
            .appliedSpeedKmh,
        )
      },
    )

    it(
      'does not increase peloton pace before seventy percent',
      () => {
        const longStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'multi-group-before-final-stage',
            distanceKm:
              100,
            profilePoints: [
              {
                kilometre: 0,
                elevationMetres: 100,
              },
              {
                kilometre: 100,
                elevationMetres: 100,
              },
            ],
          }

        const initialState =
          createInitialState(
            longStageInput,
          )

        const earlyState = {
          ...initialState,
          currentKm:
            60,
          groups: {
            ...initialState.groups,
            peloton_main: {
              ...initialState
                .groups
                .peloton_main,
              distanceKm:
                60,
            },
          },
          riders:
            Object.fromEntries(
              Object.entries(
                initialState.riders,
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
                      60,
                  },
                ],
              ),
            ),
        }

        const baseline =
          calculateMultiGroupMovement(
            earlyState,
          )

        const withFinalEffort =
          calculateMultiGroupMovement({
            ...earlyState,
            finalStagePelotonEffortEnabled:
              true,
          })

        const baselinePeloton =
          baseline.proposals[0]

        const finalEffortPeloton =
          withFinalEffort
            .proposals[0]

        expect(
          finalEffortPeloton
            .finalStageEffortBonusPercent,
        ).toBe(0)

        expect(
          finalEffortPeloton
            .finalStageEffortMultiplier,
        ).toBe(1)

        expect(
          finalEffortPeloton
            .baseSpeedKmh,
        ).toBe(
          baselinePeloton
            .baseSpeedKmh,
        )

        expect(
          finalEffortPeloton
            .appliedSpeedKmh,
        ).toBe(
          baselinePeloton
            .appliedSpeedKmh,
        )

        expect(
          finalEffortPeloton
            .nextDistanceKm,
        ).toBe(
          baselinePeloton
            .nextDistanceKm,
        )
      },
    )

    it(
      'exposes final-stage diagnostics only when enabled',
      () => {
        const state =
          createMultiGroupState()

        const baseline =
          calculateMultiGroupMovement(
            state,
          )

        const enabled =
          calculateMultiGroupMovement({
            ...state,
            finalStagePelotonEffortEnabled:
              true,
          })

        for (
          const proposal of
          baseline.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeFinalStageEffortKmh,
          ).toBeUndefined()

          expect(
            proposal
              .finalStageEffortBonusPercent,
          ).toBeUndefined()

          expect(
            proposal
              .finalStageEffortMultiplier,
          ).toBeUndefined()

          expect(
            proposal
              .finalStageEffortResult,
          ).toBeUndefined()
        }

        for (
          const proposal of
          enabled.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeFinalStageEffortKmh,
          ).toBeDefined()

          expect(
            proposal
              .finalStageEffortBonusPercent,
          ).toBeDefined()

          expect(
            proposal
              .finalStageEffortMultiplier,
          ).toBeDefined()

          expect(
            proposal
              .finalStageEffortResult,
          ).toBeDefined()
        }
      },
    )

    it(
      'increases only chase-group pace on a flat stage when enabled',
      () => {
        const separatedState =
          createMultiGroupState()

        const chaseState = {
          ...separatedState,
          groups: {
            ...separatedState.groups,
            dropped_1: {
              ...separatedState
                .groups
                .dropped_1,
              groupType:
                'chase' as const,
              gapFromLeaderSeconds:
                120,
            },
          },
        }

        const baseline =
          calculateMultiGroupMovement(
            chaseState,
          )

        const enabled =
          calculateMultiGroupMovement({
            ...chaseState,
            flatStageChaseEffortEnabled:
              true,
          })

        const baselineChase =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        const enabledChase =
          enabled.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        const baselinePeloton =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'peloton_main',
          )!

        const enabledPeloton =
          enabled.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'peloton_main',
          )!

        expect(
          enabledChase
            .chaseEffortBonusPercent,
        ).toBeGreaterThan(0)

        expect(
          enabledChase
            .chaseEffortMultiplier,
        ).toBeGreaterThan(1)

        expect(
          enabledChase
            .baseSpeedKmh,
        ).toBeGreaterThan(
          baselineChase
            .baseSpeedKmh,
        )

        expect(
          enabledChase
            .appliedSpeedKmh,
        ).toBeGreaterThan(
          baselineChase
            .appliedSpeedKmh,
        )

        expect(
          enabledChase
            .nextDistanceKm,
        ).toBeGreaterThan(
          baselineChase
            .nextDistanceKm,
        )

        expect(
          enabledChase
            .appliedSpeedKmh,
        ).toBeLessThanOrEqual(
          stageInput
            .settings
            .maximumSpeedKmh,
        )

        expect(
          enabledPeloton
            .chaseEffortBonusPercent,
        ).toBe(0)

        expect(
          enabledPeloton
            .chaseEffortMultiplier,
        ).toBe(1)

        expect(
          enabledPeloton
            .baseSpeedKmh,
        ).toBe(
          baselinePeloton
            .baseSpeedKmh,
        )

        expect(
          enabledPeloton
            .appliedSpeedKmh,
        ).toBe(
          baselinePeloton
            .appliedSpeedKmh,
        )

        expect(
          enabledPeloton
            .nextDistanceKm,
        ).toBe(
          baselinePeloton
            .nextDistanceKm,
        )
      },
    )

    it(
      'does not increase chase pace on a non-flat stage',
      () => {
        const hillyStageInput:
          StageInput = {
            ...stageInput,
            stageId:
              'multi-group-hilly-chase-stage',
            distanceKm:
              100,
            profilePoints: [
              {
                kilometre:
                  0,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  25,
                elevationMetres:
                  500,
              },
              {
                kilometre:
                  50,
                elevationMetres:
                  100,
              },
              {
                kilometre:
                  75,
                elevationMetres:
                  500,
              },
              {
                kilometre:
                  100,
                elevationMetres:
                  100,
              },
            ],
          }

        const initialState =
          createInitialState(
            hillyStageInput,
          )

        const separatedState =
          createDroppedGroup({
            state:
              initialState,
            sourceGroupId:
              'peloton_main',
            riderIds: [
              'rider-a2',
              'rider-b2',
            ],
            speedKmh:
              34,
          }).state

        const chaseState = {
          ...separatedState,
          groups: {
            ...separatedState.groups,
            dropped_1: {
              ...separatedState
                .groups
                .dropped_1,
              groupType:
                'chase' as const,
              gapFromLeaderSeconds:
                120,
            },
          },
        }

        const baseline =
          calculateMultiGroupMovement(
            chaseState,
          )

        const enabled =
          calculateMultiGroupMovement({
            ...chaseState,
            flatStageChaseEffortEnabled:
              true,
          })

        const baselineChase =
          baseline.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        const enabledChase =
          enabled.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        expect(
          enabledChase
            .chaseEffortBonusPercent,
        ).toBe(0)

        expect(
          enabledChase
            .chaseEffortMultiplier,
        ).toBe(1)

        expect(
          enabledChase
            .baseSpeedKmh,
        ).toBe(
          baselineChase
            .baseSpeedKmh,
        )

        expect(
          enabledChase
            .appliedSpeedKmh,
        ).toBe(
          baselineChase
            .appliedSpeedKmh,
        )

        expect(
          enabledChase
            .nextDistanceKm,
        ).toBe(
          baselineChase
            .nextDistanceKm,
        )
      },
    )

    it(
      'exposes chase diagnostics only when enabled and preserves modifier order',
      () => {
        const separatedState =
          createMultiGroupState()

        const chaseState = {
          ...separatedState,
          groups: {
            ...separatedState.groups,
            dropped_1: {
              ...separatedState
                .groups
                .dropped_1,
              groupType:
                'chase' as const,
              gapFromLeaderSeconds:
                120,
            },
          },
        }

        const baseline =
          calculateMultiGroupMovement(
            chaseState,
          )

        const enabled =
          calculateMultiGroupMovement({
            ...chaseState,
            groupCooperationPaceEnabled:
              true,
            flatStageChaseEffortEnabled:
              true,
            finalStagePelotonEffortEnabled:
              true,
          })

        for (
          const proposal of
          baseline.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeChaseEffortKmh,
          ).toBeUndefined()

          expect(
            proposal
              .chaseEffortBonusPercent,
          ).toBeUndefined()

          expect(
            proposal
              .chaseEffortMultiplier,
          ).toBeUndefined()

          expect(
            proposal
              .chaseEffortResult,
          ).toBeUndefined()
        }

        for (
          const proposal of
          enabled.proposals
        ) {
          expect(
            proposal
              .baseSpeedBeforeChaseEffortKmh,
          ).toBeDefined()

          expect(
            proposal
              .chaseEffortBonusPercent,
          ).toBeDefined()

          expect(
            proposal
              .chaseEffortMultiplier,
          ).toBeDefined()

          expect(
            proposal
              .chaseEffortResult,
          ).toBeDefined()

          expect(
            proposal
              .baseSpeedBeforeFinalStageEffortKmh,
          ).toBe(
            proposal
              .baseSpeedBeforeChaseEffortKmh! *
            proposal
              .chaseEffortMultiplier!,
          )
        }

        const chase =
          enabled.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'dropped_1',
          )!

        const peloton =
          enabled.proposals.find(
            (
              proposal,
            ) =>
              proposal.groupId ===
              'peloton_main',
          )!

        expect(
          chase
            .chaseEffortBonusPercent,
        ).toBeGreaterThan(0)

        expect(
          chase
            .finalStageEffortBonusPercent,
        ).toBe(0)

        expect(
          peloton
            .chaseEffortBonusPercent,
        ).toBe(0)

        expect(
          peloton
            .finalStageEffortBonusPercent,
        ).toBe(0)
      },
    )

    it(
      'clamps movement at the stage distance',
      () => {
        const state =
          createMultiGroupState()

        const nearFinishState = {
          ...state,
          currentKm: 9.99,
          groups:
            Object.fromEntries(
              Object.entries(
                state.groups,
              ).map(
                ([groupId, group]) => [
                  groupId,
                  {
                    ...group,
                    distanceKm: 9.99,
                  },
                ],
              ),
            ),
          riders:
            Object.fromEntries(
              Object.entries(
                state.riders,
              ).map(
                ([riderId, rider]) => [
                  riderId,
                  {
                    ...rider,
                    distanceKm: 9.99,
                  },
                ],
              ),
            ),
        }

        const result =
          calculateMultiGroupMovement(
            nearFinishState,
          )

        for (
          const proposal of
          result.proposals
        ) {
          expect(
            proposal.nextDistanceKm,
          ).toBeLessThanOrEqual(10)
        }
      },
    )
  },
)