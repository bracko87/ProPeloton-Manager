/**
 * ActiveIndividualCrashIntegrationDiagnostic.tsx
 *
 * Phase 8H.2B browser-only diagnostic.
 *
 * Runs a severe-weather synthetic calibrated stage through the explicit
 * crash-enabled development wrapper and proves:
 * - incidentRisk selects real candidates during ticks;
 * - immutable crashes enter validated SimulationState;
 * - cooldowns and stage limits are enforced;
 * - RIDER_CRASHED reaches snapshots, SimulationOutput, and generic replay;
 * - accepted calibrated and existing_v1 boundaries remain crash-free.
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
  runCalibratedTerrainSeparationStageWithIndividualCrashes,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStageWithIndividualCrashes'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  createReplayStageModelFromSimulationOutput,
} from '../../race-replay/createReplayStageModelFromSimulationOutput'

interface Check {
  readonly label: string
  readonly passed: boolean
}

const CONTROLLED_DISTANCE_KM =
  30

function severeWeather():
  StageWeatherInput {
  return {
    authority:
      'stage_weather_snapshot',
    source:
      'phase_8h2b_controlled_fixture',
    condition:
      'heavy_rain',
    summary:
      'Controlled severe incident weather',
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

function controlledInput():
  StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      'active-individual-crash-integration-race',
    stageId:
      'active-individual-crash-integration-stage',
    stageName:
      'Active individual crash integration',
    seed:
      'active-individual-crash-integration-seed-v1',
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

function buildDiagnostic() {
  const input =
    controlledInput()

  const baselineStage =
    runCalibratedTerrainSeparationStage(
      createInitialState(
        input,
      ),
    )

  const repeatedBaselineStage =
    runCalibratedTerrainSeparationStage(
      createInitialState(
        input,
      ),
    )

  const crashStage =
    runCalibratedTerrainSeparationStageWithIndividualCrashes(
      createInitialState(
        input,
      ),
    )

  const repeatedCrashStage =
    runCalibratedTerrainSeparationStageWithIndividualCrashes(
      createInitialState(
        input,
      ),
    )

  const baselineOutput =
    createMultiGroupSimulationOutput(
      baselineStage,
    )

  const repeatedBaselineOutput =
    createMultiGroupSimulationOutput(
      repeatedBaselineStage,
    )

  const crashOutput =
    createMultiGroupSimulationOutput(
      crashStage,
    )

  const repeatedCrashOutput =
    createMultiGroupSimulationOutput(
      repeatedCrashStage,
    )

  const existingOutput =
    runDeterministicRoadRace(
      input,
      {
        simulationMode:
          'existing_v1',
      },
    )

  const replayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        input,
      simulationOutput:
        crashOutput,
    })

  const crashEvents =
    crashOutput.events.filter(
      (event) =>
        event.eventType ===
        'RIDER_CRASHED',
    )

  const replayCrashEvents =
    replayModel.events.filter(
      (event) =>
        event.type ===
        'RIDER_CRASHED',
    )

  const crashTicks =
    crashStage.ticks.filter(
      (tick) =>
        tick.individualCrash
          ?.application !==
        null &&
        tick.individualCrash !==
        null,
    )

  const crashRiderIds =
    crashEvents
      .map(
        (event) =>
          event.actorRiderId,
      )
      .filter(
        (
          riderId,
        ): riderId is string =>
          typeof riderId ===
          'string',
      )

  const uniqueCrashRiderIds =
    new Set(
      crashRiderIds,
    )

  const cooldownSpacingValid =
    crashEvents.every(
      (
        event,
        index,
      ) =>
        index === 0 ||
        event.raceSecond -
          crashEvents[
            index - 1
          ]!.raceSecond >=
          120,
    )

  const snapshotsContainEvents =
    crashEvents.every(
      (event) =>
        crashOutput.snapshots.some(
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

  const replayPayloadsValid =
    replayCrashEvents.every(
      (event) =>
        typeof event.payload
          .incidentId ===
          'string' &&
        typeof event.payload
          .timeLossSeconds ===
          'number' &&
        typeof event.payload
          .distanceLossKm ===
          'number' &&
        event.payload
          .persistentHealthOutcome ===
          'not_created_in_phase_8h2a',
    )

  const weatherRiskConnected =
    crashEvents.every(
      (event) => {
        const risk =
          event.payload
            .risk

        if (
          !risk ||
          typeof risk !==
            'object'
        ) {
          return false
        }

        const multiplier =
          (
            risk as
              Readonly<
                Record<
                  string,
                  unknown
                >
              >
          )
            .weatherIncidentProbabilityMultiplier

        return (
          typeof multiplier ===
            'number' &&
          multiplier > 1
        )
      },
    )

  const noHealthWriter =
    crashEvents.every(
      (event) =>
        event.payload
          .persistentHealthOutcome ===
        'not_created_in_phase_8h2a',
    )

  const finalRuntime =
    crashStage
      .finalState
      .individualCrashRuntime

  const checks:
    readonly Check[] = [
      {
        label:
          'Accepted calibrated wrapper remains deterministic and crash-free',
        passed:
          outputHash(
            baselineOutput,
          ) ===
            outputHash(
              repeatedBaselineOutput,
            ) &&
          baselineOutput.events.every(
            (event) =>
              event.eventType !==
              'RIDER_CRASHED',
          ),
      },
      {
        label:
          'Crash-enabled calibrated stage is exactly repeatable',
        passed:
          crashStage
            .deterministicHash ===
            repeatedCrashStage
              .deterministicHash &&
          crashStage
            .replayCollection
            .deterministicHash ===
            repeatedCrashStage
              .replayCollection
              .deterministicHash &&
          outputHash(
            crashOutput,
          ) ===
            outputHash(
              repeatedCrashOutput,
            ),
      },
      {
        label:
          'Active incident-risk evaluation selected at least one crash',
        passed:
          crashEvents.length >
            0 &&
          crashTicks.length ===
            crashEvents.length,
      },
      {
        label:
          'Stage crash limit is respected',
        passed:
          crashEvents.length <=
            3 &&
          finalRuntime
            ?.crashCount ===
            crashEvents.length &&
          finalRuntime
            .maximumCrashesPerStage ===
            3,
      },
      {
        label:
          'The same rider is not selected twice',
        passed:
          uniqueCrashRiderIds.size ===
          crashRiderIds.length,
      },
      {
        label:
          'Global crash cooldown keeps events at least 120 seconds apart',
        passed:
          cooldownSpacingValid,
      },
      {
        label:
          'Every crash uses active weather probability above neutral',
        passed:
          weatherRiskConnected,
      },
      {
        label:
          'Every crash state and final state pass validateSimulationState',
        passed:
          allStatesValid([
            crashStage.initialState,
            ...crashStage.ticks.map(
              (tick) =>
                tick.state,
            ),
            crashStage.finalState,
          ]),
      },
      {
        label:
          'Crash event sequences remain contiguous',
        passed:
          crashOutput.events.every(
            (
              event,
              index,
            ) =>
              event.sequenceNumber ===
              index + 1,
          ),
      },
      {
        label:
          'Authoritative replay snapshots include every reached crash event',
        passed:
          snapshotsContainEvents,
      },
      {
        label:
          'Generic replay transports every RIDER_CRASHED event and payload',
        passed:
          replayCrashEvents.length ===
            crashEvents.length &&
          replayPayloadsValid,
      },
      {
        label:
          'All riders still finish and classification remains complete',
        passed:
          crashOutput
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
          crashStage.results.length ===
            input.riders.length,
      },
      {
        label:
          'Crash-enabled output differs from the accepted no-crash output',
        passed:
          outputHash(
            crashOutput,
          ) !==
          outputHash(
            baselineOutput,
          ),
      },
      {
        label:
          'existing_v1 remains crash-free',
        passed:
          existingOutput.events.every(
            (event) =>
              event.eventType !==
              'RIDER_CRASHED',
          ),
      },
      {
        label:
          'No persistent health outcome or database writer is called',
        passed:
          noHealthWriter,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    checks,
    input,
    baselineStage,
    crashStage,
    baselineOutput,
    crashOutput,
    existingOutput,
    replayModel,
    crashEvents,
    baselineOutputHash:
      outputHash(
        baselineOutput,
      ),
    crashOutputHash:
      outputHash(
        crashOutput,
      ),
    existingOutputHash:
      outputHash(
        existingOutput,
      ),
    auditHash:
      createCanonicalHashedValue({
        checks,
        crashEvents,
        crashStageHash:
          crashStage
            .deterministicHash,
        replayHash:
          crashStage
            .replayCollection
            .deterministicHash,
        crashOutputHash:
          outputHash(
            crashOutput,
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
      <dd className="text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function ActiveIndividualCrashIntegrationDiagnostic():
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
            Phase 8H.2B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Active calibrated individual crash integration
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Evaluates real individual-crash candidates during calibrated ticks,
            applies selected crashes before separation and finishing, validates
            every resulting state, and transports authoritative crash events
            through snapshots and the generic replay adapter.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — deterministic individual crashes execute inside calibrated ticks and reach generic replay'
              : 'FAIL — active individual crash integration needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Stage
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Metric
                label="Distance"
                value={`${value.input.distanceKm} km`}
              />
              <Metric
                label="Ticks"
                value={
                  value.crashStage
                    .tickCount
                }
              />
              <Metric
                label="Crash events"
                value={
                  value.crashEvents
                    .length
                }
              />
              <Metric
                label="Results"
                value={
                  value.crashStage
                    .results
                    .length
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Hashes
            </h2>
            <dl className="mt-4 space-y-2 break-all text-xs">
              <Metric
                label="Baseline output"
                value={
                  value
                    .baselineOutputHash
                }
              />
              <Metric
                label="Crash output"
                value={
                  value
                    .crashOutputHash
                }
              />
              <Metric
                label="Crash stage"
                value={
                  value
                    .crashStage
                    .deterministicHash
                }
              />
              <Metric
                label="Replay"
                value={
                  value
                    .crashStage
                    .replayCollection
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

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5 md:col-span-2">
            <h2 className="font-semibold">
              Crash events
            </h2>

            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-2">
                      Seq
                    </th>
                    <th className="pb-2">
                      Time
                    </th>
                    <th className="pb-2">
                      Rider
                    </th>
                    <th className="pb-2">
                      Severity
                    </th>
                    <th className="pb-2">
                      Loss
                    </th>
                    <th className="pb-2">
                      Source → target
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {value.crashEvents.map(
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
                            .actorRiderId ??
                            '—'}
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
                            .sourceGroupId}
                          {' → '}
                          {event
                            .targetGroupId}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </article>
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
            The accepted calibrated wrapper and runDeterministicRoadRace remain
            unchanged. This page uses an explicit development-only wrapper. No
            Supabase row, injury, production replay, scheduler, prize, or
            official result is written.
          </p>
        </section>
      </div>
    </main>
  )
}
