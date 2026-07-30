import {
  useMemo,
} from 'react'

import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  createMultiGroupSimulationOutput,
} from '../../race-engine/simulation/createMultiGroupSimulationOutput'
import {
  runIntegratedTerrainSeparationStage,
} from '../../race-engine/simulation/runIntegratedTerrainSeparationStage'
import {
  GenericRaceReplayView,
  createReplayStageModelFromSimulationOutput,
} from '../../race-replay'

interface Check {
  readonly label: string
  readonly passed: boolean
  readonly actual: string
}

interface CompatibleEvent {
  readonly eventType?: string
  readonly type?: string
}

function getEventType(
  event: unknown,
): string {
  if (
    typeof event !== 'object' ||
    event === null
  ) {
    return ''
  }

  const compatible =
    event as CompatibleEvent

  return (
    compatible.eventType ??
    compatible.type ??
    ''
  )
}

function createControlledInput():
  StageInput {
  return {
    raceId:
      'controlled-breakaway-race',
    stageId:
      'controlled-breakaway-stage',
    stageName:
      'Controlled breakaway and peloton response',
    stageFormat:
      'road_race',
    distanceKm:
      12,
    seed:
      'controlled-breakaway-final-salvage-v1',

    settings: {
      tickSeconds:
        30,
      replaySnapshotIntervalSeconds:
        30,
      maximumBreakawaySize:
        4,
      minimumSpeedKmh:
        20,
      maximumSpeedKmh:
        65,
    },

    teams: [
      {
        teamId:
          'team-a',
        teamName:
          'North Star',
        captainRiderId:
          'rider-a1',
        riderIds: [
          'rider-a1',
          'rider-a2',
          'rider-a3',
          'rider-a4',
        ],
      },
      {
        teamId:
          'team-b',
        teamName:
          'Blue Line',
        captainRiderId:
          'rider-b1',
        riderIds: [
          'rider-b1',
          'rider-b2',
          'rider-b3',
          'rider-b4',
        ],
      },
      {
        teamId:
          'team-c',
        teamName:
          'Red Road',
        captainRiderId:
          'rider-c1',
        riderIds: [
          'rider-c1',
          'rider-c2',
          'rider-c3',
          'rider-c4',
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
          'Alex Attack',
        teamName:
          'North Star',
        role:
          'captain',
        attributes: {
          flat: 72,
          sprint: 70,
          acceleration: 100,
          stamina: 76,
          resistance: 75,
          recovery: 76,
          teamwork: 68,
        },
      },
      {
        riderId:
          'rider-a2',
        teamId:
          'team-a',
        riderName:
          'Adam North',
        teamName:
          'North Star',
        role:
          'rouleur',
        attributes: {
          flat: 84,
          sprint: 68,
          acceleration: 76,
          stamina: 86,
          resistance: 84,
          recovery: 82,
          teamwork: 90,
        },
      },
      {
        riderId:
          'rider-a3',
        teamId:
          'team-a',
        riderName:
          'Aaron Hill',
        teamName:
          'North Star',
        role:
          'domestique',
        attributes: {
          flat: 82,
          sprint: 65,
          acceleration: 73,
          stamina: 85,
          resistance: 84,
          recovery: 81,
          teamwork: 92,
        },
      },
      {
        riderId:
          'rider-a4',
        teamId:
          'team-a',
        riderName:
          'Andre Fast',
        teamName:
          'North Star',
        role:
          'sprinter',
        attributes: {
          flat: 83,
          sprint: 90,
          acceleration: 88,
          stamina: 79,
          resistance: 78,
          recovery: 79,
          teamwork: 82,
        },
      },

      {
        riderId:
          'rider-b1',
        teamId:
          'team-b',
        riderName:
          'Ben Blue',
        teamName:
          'Blue Line',
        role:
          'captain',
        attributes: {
          flat: 85,
          sprint: 75,
          acceleration: 82,
          stamina: 87,
          resistance: 85,
          recovery: 83,
          teamwork: 88,
        },
      },
      {
        riderId:
          'rider-b2',
        teamId:
          'team-b',
        riderName:
          'Boris Tempo',
        teamName:
          'Blue Line',
        role:
          'rouleur',
        attributes: {
          flat: 86,
          sprint: 66,
          acceleration: 74,
          stamina: 88,
          resistance: 87,
          recovery: 84,
          teamwork: 93,
        },
      },
      {
        riderId:
          'rider-b3',
        teamId:
          'team-b',
        riderName:
          'Bruno Work',
        teamName:
          'Blue Line',
        role:
          'domestique',
        attributes: {
          flat: 84,
          sprint: 64,
          acceleration: 72,
          stamina: 89,
          resistance: 88,
          recovery: 83,
          teamwork: 94,
        },
      },
      {
        riderId:
          'rider-b4',
        teamId:
          'team-b',
        riderName:
          'Bastian Sprint',
        teamName:
          'Blue Line',
        role:
          'sprinter',
        attributes: {
          flat: 82,
          sprint: 89,
          acceleration: 87,
          stamina: 79,
          resistance: 78,
          recovery: 79,
          teamwork: 83,
        },
      },

      {
        riderId:
          'rider-c1',
        teamId:
          'team-c',
        riderName:
          'Carlos Red',
        teamName:
          'Red Road',
        role:
          'captain',
        attributes: {
          flat: 84,
          sprint: 77,
          acceleration: 81,
          stamina: 86,
          resistance: 85,
          recovery: 82,
          teamwork: 89,
        },
      },
      {
        riderId:
          'rider-c2',
        teamId:
          'team-c',
        riderName:
          'Ciro Chase',
        teamName:
          'Red Road',
        role:
          'rouleur',
        attributes: {
          flat: 87,
          sprint: 67,
          acceleration: 75,
          stamina: 89,
          resistance: 87,
          recovery: 84,
          teamwork: 94,
        },
      },
      {
        riderId:
          'rider-c3',
        teamId:
          'team-c',
        riderName:
          'Chris Work',
        teamName:
          'Red Road',
        role:
          'domestique',
        attributes: {
          flat: 85,
          sprint: 65,
          acceleration: 72,
          stamina: 88,
          resistance: 88,
          recovery: 83,
          teamwork: 95,
        },
      },
      {
        riderId:
          'rider-c4',
        teamId:
          'team-c',
        riderName:
          'Claudio Sprint',
        teamName:
          'Red Road',
        role:
          'sprinter',
        attributes: {
          flat: 83,
          sprint: 88,
          acceleration: 86,
          stamina: 80,
          resistance: 79,
          recovery: 80,
          teamwork: 84,
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
          6,
        elevationMetres:
          100,
      },
      {
        kilometre:
          12,
        elevationMetres:
          100,
      },
    ],

    orders: [
      {
        orderId:
          'controlled-rider-a1-attack',
        teamId:
          'team-a',
        riderId:
          'rider-a1',
        type:
          'attack',
        status:
          'scheduled',
        eligibleFromKm:
          0.1,
        eligibleUntilKm:
          1.5,
        priority:
          100,
        targetRiderId:
          null,
        maximumFollowers:
          null,
        metadata: {
          source:
            'ControlledBreakawayReplayDiagnostic',
          purpose:
            'final_salvage_vertical_slice',
        },
      },
    ],
  }
}

function buildDiagnostic() {
  const rawStageInput =
    createControlledInput()

  const stageInput:
    StageInput = {
    ...rawStageInput,

    riders:
      rawStageInput.riders.map(
        (rider) => ({
          ...rider,

          attributes: {
            ...rider.attributes,

            climbing:
              rider.attributes
                .climbing ??
              rider.attributes
                .flat,

            timeTrial:
              rider.attributes
                .timeTrial ??
              rider.attributes
                .flat,

            raceIq:
              rider.attributes
                .raceIq ??
              rider.attributes
                .teamwork,
          },
        }),
      ),
  }

  const initialState = {
    ...createInitialState(
      stageInput,
    ),

    groupShelterEnergyEnabled:
      true,

    groupCooperationPaceEnabled:
      true,

    controlledAttackLaunchEnabled:
      true,

    finalStagePelotonEffortEnabled:
      true,

    flatStageChaseEffortEnabled:
      true,
  }

  const stage =
    runIntegratedTerrainSeparationStage(
      initialState,
      {
        maximumTickCount:
          2000,
      },
    )

  const simulationOutput =
    createMultiGroupSimulationOutput(
      stage,
    )

  const model =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    })

  const eventTypes =
    simulationOutput.events.map(
      getEventType,
    )

  const activeGroupCounts =
    model.frames.map(
      (frame) =>
        frame.groups.filter(
          (group) =>
            group.active,
        ).length,
    )

  const maximumActiveGroupCount =
    Math.max(
      0,
      ...activeGroupCounts,
    )

  const multiGroupFrames =
    model.frames.filter(
      (frame) =>
        frame.groups.filter(
          (group) =>
            group.active,
        ).length >= 2,
    )

  const gapValues =
    multiGroupFrames.map(
      (frame) => {
        const activeGroups =
          frame.groups.filter(
            (group) =>
              group.active,
          )

        return Math.max(
          0,
          ...activeGroups.map(
            (group) =>
              group
                .gapToLeaderSeconds,
          ),
        )
      },
    )

  const maximumGapSeconds =
    Math.max(
      0,
      ...gapValues,
    )

  const distinctGapValues =
    new Set(
      gapValues.map(
        (value) =>
          value.toFixed(
            1,
          ),
      ),
    )

  const pelotonSpeeds =
    model.frames
      .map(
        (frame) =>
          frame.groups.find(
            (group) =>
              group.groupId ===
              'peloton_main' &&
              group.active,
          )?.speedKmh ??
          null,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      )

  const distinctPelotonSpeeds =
    new Set(
      pelotonSpeeds.map(
        (value) =>
          value.toFixed(
            2,
          ),
      ),
    )

  const attackerResult =
    model.finalResults.find(
      (result) =>
        result.riderId ===
        'rider-a1',
    )

  const hadBreakaway =
    model.frames.some(
      (frame) =>
        frame.groups.some(
          (group) =>
            group.type ===
              'breakaway' &&
            group.riderIds.includes(
              'rider-a1',
            ),
        ),
    )

  const lastActiveFrame =
    model.frames
      .slice()
      .reverse()
      .find(
        (frame) =>
          frame.groups.some(
            (group) =>
              group.active,
          ),
      )

  const breakawayActiveAtLastRaceFrame =
    lastActiveFrame
      ?.groups.some(
        (group) =>
          group.type ===
            'breakaway' &&
          group.active &&
          group.riderIds.includes(
            'rider-a1',
          ),
      ) ??
    false

  const caughtEvent =
    eventTypes.includes(
      'GROUP_CAUGHT',
    )

  const attackerFinishedFirst =
    attackerResult
      ?.finishPosition ===
    1

  const completedOutcome =
    caughtEvent ||
    attackerFinishedFirst ||
    (
      hadBreakaway &&
      !breakawayActiveAtLastRaceFrame
    )

  const checks:
    readonly Check[] = [
      {
        label:
          '1. Attack order executed',
        passed:
          eventTypes.includes(
            'ORDER_EXECUTED',
          ),
        actual:
          eventTypes.includes(
            'ORDER_EXECUTED',
          )
            ? 'ORDER_EXECUTED present'
            : 'ORDER_EXECUTED missing',
      },
      {
        label:
          '2. Attack and breakaway group created',
        passed:
          eventTypes.includes(
            'ATTACK_STARTED',
          ) &&
          eventTypes.includes(
            'GROUP_CREATED',
          ) &&
          hadBreakaway,
        actual:
          `attack=${String(
            eventTypes.includes(
              'ATTACK_STARTED',
            ),
          )}, group=${String(
            eventTypes.includes(
              'GROUP_CREATED',
            ),
          )}, replay breakaway=${String(
            hadBreakaway,
          )}`,
      },
      {
        label:
          '3. Replay contains at least two moving groups',
        passed:
          maximumActiveGroupCount >=
          2,
        actual:
          `maximum active groups: ${maximumActiveGroupCount}`,
      },
      {
        label:
          '4. Gap becomes positive and changes',
        passed:
          maximumGapSeconds > 0 &&
          distinctGapValues.size >
            1,
        actual:
          `maximum gap: ${maximumGapSeconds.toFixed(
            1,
          )}s; distinct gaps: ${distinctGapValues.size}`,
      },
      {
        label:
          '5. Peloton speed reacts during the race',
        passed:
          distinctPelotonSpeeds.size >
          1,
        actual:
          `distinct peloton speeds: ${distinctPelotonSpeeds.size}`,
      },
      {
        label:
          '6. Breakaway reaches a clear outcome',
        passed:
          completedOutcome,
        actual:
          caughtEvent
            ? 'breakaway caught'
            : attackerFinishedFirst
              ? 'attacker finished first'
              : hadBreakaway &&
                  !breakawayActiveAtLastRaceFrame
                ? 'breakaway no longer active before completion'
                : 'no catch or survival outcome',
      },
    ]

  const passed =
    checks.every(
      (check) =>
        check.passed,
    )

  return {
    stageInput,
    simulationOutput,
    model,
    eventTypes,
    checks,
    passed,
    maximumActiveGroupCount,
    maximumGapSeconds,
  }
}

type DiagnosticBuildResult =
  | {
      readonly ok: true
      readonly value:
        ReturnType<
          typeof buildDiagnostic
        >
    }
  | {
      readonly ok: false
      readonly error: string
    }

export default function ControlledBreakawayReplayDiagnostic() {
  const result =
    useMemo<
      DiagnosticBuildResult
    >(
      () => {
        try {
          return {
            ok: true,
            value:
              buildDiagnostic(),
          }
        } catch (
          error
        ) {
          return {
            ok: false,
            error:
              error instanceof
              Error
                ? error.message
                : String(
                    error,
                  ),
          }
        }
      },
      [],
    )

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-xl border border-red-500 bg-red-950 p-6">
          <h1 className="text-2xl font-bold">
            Option A failed to build
          </h1>

          <pre className="mt-4 whitespace-pre-wrap text-sm text-red-100">
            {result.error}
          </pre>
        </div>
      </main>
    )
  }

  const diagnostic =
    result.value

  return (
    <main className="min-h-screen bg-slate-100 py-6">
      <section className="mx-auto mb-6 max-w-7xl px-4">
        <div
          className={
            diagnostic.passed
              ? 'rounded-xl border border-emerald-500 bg-emerald-50 p-5'
              : 'rounded-xl border border-red-500 bg-red-50 p-5'
          }
        >
          <h1 className="text-2xl font-bold text-slate-950">
            Final Option A:
            Controlled Breakaway Replay
          </h1>

          <p className="mt-2 text-sm text-slate-700">
            Twelve riders, one scheduled attack,
            no Supabase, no weather, and no Rio fixture.
          </p>

          <p
            className={
              diagnostic.passed
                ? 'mt-4 text-xl font-bold text-emerald-700'
                : 'mt-4 text-xl font-bold text-red-700'
            }
          >
            {diagnostic.passed
              ? 'PASS — all six acceptance criteria are present'
              : 'FAIL — Option A does not satisfy all six acceptance criteria'}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {diagnostic.checks.map(
              (
                check,
              ) => (
                <div
                  key={
                    check.label
                  }
                  className="rounded-lg border border-slate-300 bg-white p-4"
                >
                  <div
                    className={
                      check.passed
                        ? 'font-semibold text-emerald-700'
                        : 'font-semibold text-red-700'
                    }
                  >
                    {check.passed
                      ? 'PASS'
                      : 'FAIL'}
                    {' — '}
                    {check.label}
                  </div>

                  <div className="mt-1 text-sm text-slate-600">
                    {check.actual}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-white p-3">
              <strong>
                Frames
              </strong>
              <div>
                {
                  diagnostic
                    .model
                    .frames
                    .length
                }
              </div>
            </div>

            <div className="rounded-lg bg-white p-3">
              <strong>
                Events
              </strong>
              <div>
                {
                  diagnostic
                    .model
                    .events
                    .length
                }
              </div>
            </div>

            <div className="rounded-lg bg-white p-3">
              <strong>
                Maximum groups
              </strong>
              <div>
                {
                  diagnostic
                    .maximumActiveGroupCount
                }
              </div>
            </div>

            <div className="rounded-lg bg-white p-3">
              <strong>
                Maximum gap
              </strong>
              <div>
                {
                  diagnostic
                    .maximumGapSeconds
                    .toFixed(
                      1,
                    )
                }
                s
              </div>
            </div>
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer font-semibold text-slate-800">
              Authoritative event types
            </summary>

            <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              {
                diagnostic
                  .eventTypes
                  .join(
                    '\n',
                  )
              }
            </pre>
          </details>
        </div>
      </section>

      <GenericRaceReplayView
        model={
          diagnostic.model
        }
        displayMode="page"
        raceName="Final Option A"
        stageLabel="12 km controlled breakaway"
        highlightedTeamIds={[
          'team-a',
        ]}
      />
    </main>
  )
}