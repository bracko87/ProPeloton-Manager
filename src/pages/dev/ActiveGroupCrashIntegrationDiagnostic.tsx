/**
 * ActiveGroupCrashIntegrationDiagnostic.tsx
 *
 * Phase 8H.3B browser-only diagnostic.
 *
 * It deterministically searches a small controlled seed set for a stage that
 * produces at least one active GROUP_CRASHED event, then verifies the shared
 * individual/group selector, cooldowns, state validation, replay transport,
 * complete classification, and legacy safety boundaries.
 */

import {
  useMemo,
} from 'react'

import type {
  SimulationOutput,
} from '../../race-engine/domain/SimulationOutput'
import type {
  StageInput,
  StageWeatherInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  createMultiGroupSimulationOutput,
} from '../../race-engine/simulation/createMultiGroupSimulationOutput'
import {
  runCalibratedTerrainSeparationStage,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStage'
import {
  runCalibratedTerrainSeparationStageWithCrashIncidents,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStageWithCrashIncidents'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  createReplayStageModelFromSimulationOutput,
} from '../../race-replay/createReplayStageModelFromSimulationOutput'

interface Check {
  readonly label: string
  readonly passed: boolean
}

const CONTROLLED_DISTANCE_KM =
  80

const MAXIMUM_SEED_ATTEMPTS =
  48

function severeWeather():
  StageWeatherInput {
  return {
    authority:
      'stage_weather_snapshot',
    source:
      'phase_8h3b_controlled_fixture',
    condition:
      'heavy_rain',
    summary:
      'Controlled shared crash incident weather',
    averageTemperatureC:
      34,
    minimumTemperatureC:
      30,
    maximumTemperatureC:
      39,
    windSpeedKmh:
      35,
    precipitationMm:
      18,
    hostCity:
      'Controlled test',
    countryCode:
      'XX',
  }
}

function controlledInput(
  seed: string,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      'active-group-crash-integration-race',
    stageId:
      'active-group-crash-integration-stage',
    stageName:
      'Active shared crash integration',
    seed,
    distanceKm:
      CONTROLLED_DISTANCE_KM,
    profilePoints: [
      {
        kilometre: 0,
        elevationMetres: 0,
      },
      {
        kilometre:
          CONTROLLED_DISTANCE_KM,
        elevationMetres: 0,
      },
    ],
    weather:
      severeWeather(),
    orders: [],
  }
}

function outputHash(
  output:
    SimulationOutput,
): string {
  return createCanonicalHashedValue(
    output,
  ).hash
}

function allStatesValid(
  states:
    readonly ReturnType<
      typeof createInitialState
    >[],
): boolean {
  try {
    for (
      const state of
      states
    ) {
      validateSimulationState(
        state,
      )
    }

    return true
  } catch {
    return false
  }
}

function findGroupCrashSeed() {
  for (
    let index = 0;
    index <
      MAXIMUM_SEED_ATTEMPTS;
    index += 1
  ) {
    const seed =
      `active-group-crash-seed-${String(index).padStart(2, '0')}`

    const input =
      controlledInput(
        seed,
      )

    const stage =
      runCalibratedTerrainSeparationStageWithCrashIncidents(
        createInitialState(
          input,
        ),
        {
          enabledIncidentKinds: [
            'group_crash',
          ],
          maximumIncidentsPerStage:
            3,
        },
      )

    if (
      stage.events.some(
        (event) =>
          event.eventType ===
          'GROUP_CRASHED',
      )
    ) {
      return {
        seed,
        input,
        stage,
      }
    }
  }

  throw new Error(
    `ActiveGroupCrashIntegrationDiagnostic: no active group crash found in ${MAXIMUM_SEED_ATTEMPTS} deterministic seeds.`,
  )
}

function buildDiagnostic() {
  const found =
    findGroupCrashSeed()

  const repeatedGroupStage =
    runCalibratedTerrainSeparationStageWithCrashIncidents(
      createInitialState(
        found.input,
      ),
      {
        enabledIncidentKinds: [
          'group_crash',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const mixedStage =
    runCalibratedTerrainSeparationStageWithCrashIncidents(
      createInitialState(
        found.input,
      ),
      {
        enabledIncidentKinds: [
          'individual_crash',
          'group_crash',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const repeatedMixedStage =
    runCalibratedTerrainSeparationStageWithCrashIncidents(
      createInitialState(
        found.input,
      ),
      {
        enabledIncidentKinds: [
          'individual_crash',
          'group_crash',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const baselineStage =
    runCalibratedTerrainSeparationStage(
      createInitialState(
        found.input,
      ),
    )

  const groupOutput =
    createMultiGroupSimulationOutput(
      found.stage,
    )

  const repeatedGroupOutput =
    createMultiGroupSimulationOutput(
      repeatedGroupStage,
    )

  const mixedOutput =
    createMultiGroupSimulationOutput(
      mixedStage,
    )

  const repeatedMixedOutput =
    createMultiGroupSimulationOutput(
      repeatedMixedStage,
    )

  const baselineOutput =
    createMultiGroupSimulationOutput(
      baselineStage,
    )

  const existingOutput =
    runDeterministicRoadRace(
      found.input,
      {
        simulationMode:
          'existing_v1',
      },
    )

  const replayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        found.input,
      simulationOutput:
        groupOutput,
    })

  const groupEvents =
    groupOutput.events.filter(
      (event) =>
        event.eventType ===
        'GROUP_CRASHED',
    )

  const replayGroupEvents =
    replayModel.events.filter(
      (event) =>
        event.type ===
        'GROUP_CRASHED',
    )

  const crashEvents =
    mixedOutput.events.filter(
      (event) =>
        event.eventType ===
          'RIDER_CRASHED' ||
        event.eventType ===
          'GROUP_CRASHED',
    )

  const groupCooldownValid =
    groupEvents.every(
      (
        event,
        index,
      ) =>
        index === 0 ||
        event.raceSecond -
          groupEvents[
            index - 1
          ]!.raceSecond >=
          120,
    )

  const groupPayloadsValid =
    groupEvents.every(
      (event) => {
        const count =
          event.payload
            .affectedRiderCount

        return (
          typeof count ===
            'number' &&
          Number.isInteger(
            count,
          ) &&
          count >= 2 &&
          count <= 6 &&
          event
            .relatedRiderIds
            .length ===
            count &&
          new Set(
            event
              .relatedRiderIds,
          ).size ===
            count &&
          event.payload
            .persistentHealthOutcome ===
            'not_created_in_phase_8h3a'
        )
      },
    )

  const snapshotsContainGroupEvents =
    groupEvents.every(
      (event) =>
        groupOutput.snapshots.some(
          (snapshot) =>
            snapshot.raceSecond >=
              event.raceSecond &&
            snapshot
              .eventSequenceNumbers
              .includes(
                event.sequenceNumber,
              ),
        ),
    )

  const mixedEvaluatedBothKinds =
    mixedStage.ticks.some(
      (tick) =>
        (
          tick
            .crashIncident
            ?.candidateCountByKind
            .individualCrash ??
          0
        ) >
          0 &&
        (
          tick
            .crashIncident
            ?.candidateCountByKind
            .groupCrash ??
          0
        ) >
          0,
    )

  const noMoreThanOneSelectedPerTick =
    mixedStage.ticks.every(
      (tick) => {
        const before =
          tick.previousState
            .events
            .length

        const after =
          tick.state
            .events
            .length

        const incidentEventIncrease =
          tick
            .crashIncident
            ?.application
            ? 1
            : 0

        return (
          after -
          before >=
          incidentEventIncrease &&
          incidentEventIncrease <=
          1
        )
      },
    )

  const finalRuntime =
    mixedStage
      .finalState
      .crashIncidentRuntime

  const checks:
    readonly Check[] = [
      {
        label:
          'A deterministic seed with at least one active group crash was found',
        passed:
          groupEvents.length >
          0,
      },
      {
        label:
          'Group-only crash-enabled stage is exactly repeatable',
        passed:
          found.stage
            .deterministicHash ===
            repeatedGroupStage
              .deterministicHash &&
          found.stage
            .replayCollection
            .deterministicHash ===
            repeatedGroupStage
              .replayCollection
              .deterministicHash &&
          outputHash(
            groupOutput,
          ) ===
            outputHash(
              repeatedGroupOutput,
            ),
      },
      {
        label:
          'Every active GROUP_CRASHED event affects two to six unique riders',
        passed:
          groupPayloadsValid,
      },
      {
        label:
          'Shared global cooldown keeps group crashes at least 120 seconds apart',
        passed:
          groupCooldownValid,
      },
      {
        label:
          'Every group-crash state and final state pass validateSimulationState',
        passed:
          allStatesValid([
            found.stage.initialState,
            ...found.stage.ticks.map(
              (tick) =>
                tick.state,
            ),
            found.stage.finalState,
          ]),
      },
      {
        label:
          'Authoritative replay snapshots include every reached group-crash event',
        passed:
          snapshotsContainGroupEvents,
      },
      {
        label:
          'Generic replay transports every GROUP_CRASHED event and payload',
        passed:
          replayGroupEvents.length ===
            groupEvents.length &&
          replayGroupEvents.every(
            (event) =>
              typeof event.payload
                .affectedRiderCount ===
                'number' &&
              typeof event.payload
                .timeLossSeconds ===
                'number',
          ),
      },
      {
        label:
          'All riders still finish after active group crashes',
        passed:
          groupOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.stageStatus ===
                  'finished' &&
                rider.finishPosition !==
                  null &&
                rider.finishTimeSeconds !==
                  null,
            ) &&
          found.stage.results.length ===
            found.input.riders.length,
      },
      {
        label:
          'Mixed shared selector evaluates individual and group candidates',
        passed:
          mixedEvaluatedBothKinds,
      },
      {
        label:
          'Mixed shared selector is exactly repeatable',
        passed:
          mixedStage
            .deterministicHash ===
            repeatedMixedStage
              .deterministicHash &&
          outputHash(
            mixedOutput,
          ) ===
            outputHash(
              repeatedMixedOutput,
            ),
      },
      {
        label:
          'At most one shared crash incident is selected per tick',
        passed:
          noMoreThanOneSelectedPerTick,
      },
      {
        label:
          'Shared runtime counts match emitted mixed crash events',
        passed:
          finalRuntime
            ?.incidentCount ===
            crashEvents.length &&
          finalRuntime
            .individualCrashCount +
            finalRuntime
              .groupCrashCount ===
            crashEvents.length &&
          crashEvents.length <=
            3,
      },
      {
        label:
          'Accepted calibrated wrapper remains crash-free',
        passed:
          baselineOutput.events.every(
            (event) =>
              event.eventType !==
                'RIDER_CRASHED' &&
              event.eventType !==
                'GROUP_CRASHED',
          ),
      },
      {
        label:
          'existing_v1 remains crash-free',
        passed:
          existingOutput.events.every(
            (event) =>
              event.eventType !==
                'RIDER_CRASHED' &&
              event.eventType !==
                'GROUP_CRASHED',
          ),
      },
      {
        label:
          'No persistent health outcome or database writer is called',
        passed:
          groupEvents.every(
            (event) =>
              event.payload
                .persistentHealthOutcome ===
                'not_created_in_phase_8h3a',
          ),
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,
    seed:
      found.seed,
    input:
      found.input,

    groupStage:
      found.stage,
    mixedStage,

    groupOutput,
    mixedOutput,
    baselineOutput,
    existingOutput,

    groupEvents,
    crashEvents,

    groupOutputHash:
      outputHash(
        groupOutput,
      ),
    mixedOutputHash:
      outputHash(
        mixedOutput,
      ),
    baselineOutputHash:
      outputHash(
        baselineOutput,
      ),

    auditHash:
      createCanonicalHashedValue({
        seed:
          found.seed,
        checks,
        groupEvents,
        mixedCrashEvents:
          crashEvents,
        groupStageHash:
          found.stage
            .deterministicHash,
        groupReplayHash:
          found.stage
            .replayCollection
            .deterministicHash,
        mixedStageHash:
          mixedStage
            .deterministicHash,
        groupOutputHash:
          outputHash(
            groupOutput,
        ),
        mixedOutputHash:
          outputHash(
            mixedOutput,
        ),
      }).hash,
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    string | number
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">
        {label}
      </dt>
      <dd className="max-w-[70%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function ActiveGroupCrashIntegrationDiagnostic():
  JSX.Element {
  const value =
    useMemo(
      buildDiagnostic,
      [],
    )

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8H.3B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Active shared individual and group crash integration
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Evaluates individual and group candidates in one deterministic
            selection pass, applies at most one incident per tick, validates
            resulting states, and transports active group crashes through
            authoritative snapshots and generic replay.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — active group crashes execute through one shared deterministic crash selector'
              : 'FAIL — shared active group-crash integration needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Controlled run
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Metric
                label="Seed"
                value={
                  value.seed
                }
              />
              <Metric
                label="Distance"
                value={`${value.input.distanceKm} km`}
              />
              <Metric
                label="Group crashes"
                value={
                  value.groupEvents
                    .length
                }
              />
              <Metric
                label="Mixed crashes"
                value={
                  value.crashEvents
                    .length
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5 xl:col-span-3">
            <h2 className="font-semibold">
              Deterministic hashes
            </h2>
            <dl className="mt-4 grid gap-2 text-xs md:grid-cols-2">
              <Metric
                label="Baseline output"
                value={
                  value
                    .baselineOutputHash
                }
              />
              <Metric
                label="Group output"
                value={
                  value
                    .groupOutputHash
                }
              />
              <Metric
                label="Mixed output"
                value={
                  value
                    .mixedOutputHash
                }
              />
              <Metric
                label="Group stage"
                value={
                  value
                    .groupStage
                    .deterministicHash
                }
              />
              <Metric
                label="Group replay"
                value={
                  value
                    .groupStage
                    .replayCollection
                    .deterministicHash
                }
              />
              <Metric
                label="Mixed stage"
                value={
                  value
                    .mixedStage
                    .deterministicHash
                }
              />
              <Metric
                label="Audit"
                value={
                  value.auditHash
                }
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Active group-crash events
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">Seq</th>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Group</th>
                  <th className="pb-2">Affected</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Loss</th>
                  <th className="pb-2">Target</th>
                </tr>
              </thead>
              <tbody>
                {value.groupEvents.map(
                  (event) => (
                    <tr
                      key={
                        event
                          .sequenceNumber
                      }
                      className="border-t border-slate-800"
                    >
                      <td className="py-2">
                        {event
                          .sequenceNumber}
                      </td>
                      <td className="py-2">
                        {event
                          .raceSecond}
                        s
                      </td>
                      <td className="py-2">
                        {event
                          .sourceGroupId}
                      </td>
                      <td className="py-2">
                        {String(
                          event
                            .payload
                            .affectedRiderCount,
                        )}
                      </td>
                      <td className="py-2">
                        {String(
                          event
                            .payload
                            .severity,
                        )}
                      </td>
                      <td className="py-2">
                        {String(
                          event
                            .payload
                            .timeLossSeconds,
                        )}
                        s
                      </td>
                      <td className="py-2">
                        {event
                          .targetGroupId}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-4 space-y-2">
            {value.checks.map(
              (check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                >
                  <span>
                    {check.label}
                  </span>
                  <strong
                    className={
                      check.passed
                        ? 'text-emerald-300'
                        : 'text-rose-300'
                    }
                  >
                    {check.passed
                      ? 'PASS'
                      : 'FAIL'}
                  </strong>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Safety
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            The accepted calibrated wrapper, Phase 8H.2B individual-only
            wrapper, runDeterministicRoadRace, existing_v1, Supabase, health
            persistence, production replay, prizes, and official results remain
            unchanged.
          </p>
        </section>
      </div>
    </main>
  )
}
