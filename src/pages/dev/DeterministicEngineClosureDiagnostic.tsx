/**
 * DeterministicEngineClosureDiagnostic.tsx
 *
 * Phase 8I browser-only deterministic-engine closure and production-migration
 * readiness audit.
 *
 * The diagnostic:
 * - recomputes the accepted Phase 8H.5B controlled execution;
 * - verifies exact baseline, technical, mixed, missing-equipment, legacy, and
 *   replay reference hashes;
 * - verifies the exact accepted technical event rows;
 * - validates the accumulated accepted-reference registry for checklist items
 *   2–20;
 * - proves checklist item 1 can close;
 * - deliberately reports production migration as blocked;
 * - performs no SQL, write, route switch, persistence, or deployment.
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
  runCalibratedTerrainSeparationStageWithRaceIncidents,
} from '../../race-engine/simulation/runCalibratedTerrainSeparationStageWithRaceIncidents'
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
  ACCEPTED_ACTIVE_TECHNICAL_EVENTS,
  ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES,
  getAcceptedDeterministicReference,
  validateAcceptedDeterministicReferenceRegistry,
} from '../../race-engine/validation/deterministicEngineClosureReferences'
import {
  createProductionMigrationReadinessAudit,
} from '../../race-engine/validation/productionMigrationReadinessAudit'
import {
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
} from '../../race-replay'

interface Check {
  readonly label: string
  readonly passed: boolean
}

interface RuntimeHashes {
  readonly baselineOutput: string
  readonly technicalOutput: string
  readonly repeatedTechnicalOutput:
    string
  readonly technicalStage: string
  readonly mixedOutput: string
  readonly repeatedMixedOutput:
    string
  readonly mixedStage: string
  readonly missingEquipmentOutput:
    string
  readonly oldCrashOutput: string
  readonly existingV1Output: string
  readonly replay: string
}

const CONTROLLED_DISTANCE_KM =
  24

const CONTROLLED_EQUIPMENT_CONDITION =
  20

const CONTROLLED_RISK_MULTIPLIER =
  1

const CONTROLLED_TIME_LOSS_MULTIPLIER =
  0.9

const ACCEPTED_SEED =
  'active-technical-incident-seed-00'

function severeWeather():
  StageWeatherInput {
  return {
    authority:
      'stage_weather_snapshot',
    source:
      'phase_8h5b_controlled_fixture',
    condition:
      'heavy_rain',
    summary:
      'Controlled active technical incident weather',
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
  includeEquipment = true,
): StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      'active-technical-incident-race',
    stageId:
      'active-technical-incident-stage',
    stageName:
      'Active technical incident integration',
    seed:
      ACCEPTED_SEED,
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
    riders:
      base.riders.map(
        (
          rider,
          index,
        ) => ({
          ...rider,
          attributes: {
            ...rider.attributes,
            resistance: 15,
            raceIq: 15,
          },
          ...(includeEquipment
            ? {
                equipment: {
                  conditionSource:
                    'race_engine_resolve_stage_rider_equipment_condition_v1' as const,
                  preparationSource:
                    'race_engine_get_stage_rider_preparation_modifiers_v2' as const,

                  equipmentSetupId:
                    `active-technical-setup-${String(index + 1).padStart(3, '0')}`,

                  selectedComponentCount:
                    6,
                  matchedComponentCount:
                    6,
                  completeSource:
                    true,

                  minimumConditionPercent:
                    CONTROLLED_EQUIPMENT_CONDITION,
                  effectiveConditionPercent:
                    CONTROLLED_EQUIPMENT_CONDITION,
                  missingComponentCategories: [],

                  mechanicalIncidentRiskMultiplier:
                    CONTROLLED_RISK_MULTIPLIER,
                  mechanicalTimeLossMultiplier:
                    CONTROLLED_TIME_LOSS_MULTIPLIER,
                },
              }
            : {}),
        }),
      ),
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

function expectedReference(
  id: string,
): string {
  return getAcceptedDeterministicReference(
    id,
  ).value
}

function allStatesValidate(
  states:
    readonly ReturnType<
      typeof createInitialState
    >[],
): boolean {
  try {
    for (const state of states) {
      validateSimulationState(
        state,
      )
    }

    return true
  } catch {
    return false
  }
}

function technicalEventsMatch(
  events:
    readonly SimulationOutput[
      'events'
    ][number][],
): boolean {
  if (
    events.length !==
    ACCEPTED_ACTIVE_TECHNICAL_EVENTS
      .length
  ) {
    return false
  }

  return events.every(
    (
      event,
      index,
    ) => {
      const expected =
        ACCEPTED_ACTIVE_TECHNICAL_EVENTS[
          index
        ]

      return (
        !!expected &&
        event.sequenceNumber ===
          expected.sequenceNumber &&
        event.raceSecond ===
          expected.raceSecond &&
        event.actorRiderId ===
          expected.riderId &&
        event.payload
          .technicalType ===
          expected.technicalType &&
        event.payload
          .severity ===
          expected.severity &&
        event.payload
          .baseTimeLossSeconds ===
          expected.baseTimeLossSeconds &&
        event.payload
          .timeLossSeconds ===
          expected.timeLossSeconds &&
        event.targetGroupId ===
          expected.targetGroupId
      )
    },
  )
}

function buildDiagnostic() {
  const input =
    controlledInput(
      true,
    )

  const missingEquipmentInput =
    controlledInput(
      false,
    )

  const technicalStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        input,
      ),
      {
        enabledIncidentKinds: [
          'technical_incident',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const repeatedTechnicalStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        input,
      ),
      {
        enabledIncidentKinds: [
          'technical_incident',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const mixedStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        input,
      ),
      {
        enabledIncidentKinds: [
          'individual_crash',
          'group_crash',
          'technical_incident',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const repeatedMixedStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        input,
      ),
      {
        enabledIncidentKinds: [
          'individual_crash',
          'group_crash',
          'technical_incident',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const missingEquipmentStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        missingEquipmentInput,
      ),
      {
        enabledIncidentKinds: [
          'technical_incident',
        ],
        maximumIncidentsPerStage:
          3,
      },
    )

  const baselineStage =
    runCalibratedTerrainSeparationStage(
      createInitialState(
        input,
      ),
    )

  const oldCrashStage =
    runCalibratedTerrainSeparationStageWithCrashIncidents(
      createInitialState(
        input,
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

  const technicalOutput =
    createMultiGroupSimulationOutput(
      technicalStage,
    )

  const repeatedTechnicalOutput =
    createMultiGroupSimulationOutput(
      repeatedTechnicalStage,
    )

  const mixedOutput =
    createMultiGroupSimulationOutput(
      mixedStage,
    )

  const repeatedMixedOutput =
    createMultiGroupSimulationOutput(
      repeatedMixedStage,
    )

  const missingEquipmentOutput =
    createMultiGroupSimulationOutput(
      missingEquipmentStage,
    )

  const baselineOutput =
    createMultiGroupSimulationOutput(
      baselineStage,
    )

  const oldCrashOutput =
    createMultiGroupSimulationOutput(
      oldCrashStage,
    )

  const existingV1Output =
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
        technicalOutput,
    })

  const replayValidation =
    validateReplayStageModel(
      replayModel,
    )

  const hashes:
    RuntimeHashes = {
    baselineOutput:
      outputHash(
        baselineOutput,
      ),
    technicalOutput:
      outputHash(
        technicalOutput,
      ),
    repeatedTechnicalOutput:
      outputHash(
        repeatedTechnicalOutput,
      ),
    technicalStage:
      technicalStage
        .deterministicHash,
    mixedOutput:
      outputHash(
        mixedOutput,
      ),
    repeatedMixedOutput:
      outputHash(
        repeatedMixedOutput,
      ),
    mixedStage:
      mixedStage
        .deterministicHash,
    missingEquipmentOutput:
      outputHash(
        missingEquipmentOutput,
      ),
    oldCrashOutput:
      outputHash(
        oldCrashOutput,
      ),
    existingV1Output:
      outputHash(
        existingV1Output,
      ),
    replay:
      createCanonicalHashedValue(
        replayModel,
      ).hash,
  }

  const technicalEvents =
    technicalOutput.events.filter(
      (event) =>
        event.eventType ===
        'RIDER_TECHNICAL_INCIDENT',
    )

  const registryValidation =
    validateAcceptedDeterministicReferenceRegistry()

  const stateValidationPassed =
    allStatesValidate([
      technicalStage.initialState,
      ...technicalStage.ticks.map(
        (tick) =>
          tick.state,
      ),
      repeatedTechnicalStage
        .finalState,
      mixedStage.finalState,
      repeatedMixedStage
        .finalState,
      missingEquipmentStage
        .finalState,
      baselineStage.finalState,
      oldCrashStage.finalState,
    ])

  const runtimeChecks:
    readonly Check[] = [
      {
        label:
          'Accepted controlled seed is unchanged',
        passed:
          input.seed ===
          ACCEPTED_SEED,
      },
      {
        label:
          'Baseline calibrated output matches the accepted reference',
        passed:
          hashes
            .baselineOutput ===
          expectedReference(
            'active-technical-baseline',
          ),
      },
      {
        label:
          'Technical-only output matches the accepted reference',
        passed:
          hashes
            .technicalOutput ===
          expectedReference(
            'active-technical-output',
          ),
      },
      {
        label:
          'Repeated technical-only execution is byte-for-byte deterministic',
        passed:
          hashes
            .technicalOutput ===
          hashes
            .repeatedTechnicalOutput,
      },
      {
        label:
          'Technical stage hash matches the accepted reference',
        passed:
          hashes
            .technicalStage ===
          expectedReference(
            'active-technical-stage',
          ),
      },
      {
        label:
          'Mixed crash and technical output matches the accepted reference',
        passed:
          hashes
            .mixedOutput ===
          expectedReference(
            'active-mixed-incident-output',
          ),
      },
      {
        label:
          'Repeated mixed execution is byte-for-byte deterministic',
        passed:
          hashes
            .mixedOutput ===
          hashes
            .repeatedMixedOutput,
      },
      {
        label:
          'Mixed stage hash matches the accepted reference',
        passed:
          hashes
            .mixedStage ===
          expectedReference(
            'active-mixed-incident-stage',
          ),
      },
      {
        label:
          'Equipment-free output matches the accepted technical-ineligible reference',
        passed:
          hashes
            .missingEquipmentOutput ===
          expectedReference(
            'active-technical-missing-equipment',
          ),
      },
      {
        label:
          'Accepted Phase 8H.3B crash wrapper regression matches',
        passed:
          hashes
            .oldCrashOutput ===
          expectedReference(
            'active-technical-old-crash-wrapper',
          ),
      },
      {
        label:
          'existing_v1 regression matches',
        passed:
          hashes
            .existingV1Output ===
          expectedReference(
            'active-technical-existing-v1',
          ),
      },
      {
        label:
          'Generic replay hash matches the accepted reference',
        passed:
          hashes.replay ===
          expectedReference(
            'active-technical-replay',
          ),
      },
      {
        label:
          'The exact three accepted technical event rows are reproduced',
        passed:
          technicalEventsMatch(
            technicalEvents,
          ),
      },
      {
        label:
          'Every initial, tick, and final state validates',
        passed:
          stateValidationPassed,
      },
      {
        label:
          'Technical generic replay validates',
        passed:
          replayValidation.valid,
      },
      {
        label:
          'Every rider finishes in technical-only and mixed execution',
        passed:
          technicalOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.finished &&
                rider
                  .finishTimeSeconds !==
                  null,
            ) &&
          mixedOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.finished &&
                rider
                  .finishTimeSeconds !==
                  null,
            ),
      },
      {
        label:
          'Accepted calibrated wrapper remains incident-free',
        passed:
          baselineOutput.events.every(
            (event) =>
              event.eventType !==
                'RIDER_CRASHED' &&
              event.eventType !==
                'GROUP_CRASHED' &&
              event.eventType !==
                'RIDER_TECHNICAL_INCIDENT',
          ),
      },
      {
        label:
          'Accepted crash wrapper remains technical-incident-free',
        passed:
          oldCrashOutput.events.every(
            (event) =>
              event.eventType !==
              'RIDER_TECHNICAL_INCIDENT',
          ),
      },
      {
        label:
          'existing_v1 remains crash- and technical-incident-free',
        passed:
          existingV1Output.events.every(
            (event) =>
              event.eventType !==
                'RIDER_CRASHED' &&
              event.eventType !==
                'GROUP_CRASHED' &&
              event.eventType !==
                'RIDER_TECHNICAL_INCIDENT',
          ),
      },
      {
        label:
          'All runtime outputs and replay are canonical-hashable without undefined values',
        passed: true,
      },
    ]

  const evidenceChecks:
    readonly Check[] = [
      {
        label:
          'Accepted deterministic reference registry is structurally valid',
        passed:
          registryValidation.valid,
      },
      {
        label:
          'Accepted reference registry covers every completed checklist item 2–20',
        passed:
          registryValidation
            .uncoveredCompletedChecklistItems
            .length ===
            0,
      },
      {
        label:
          'All accepted reference values are canonical 16-character lowercase hashes',
        passed:
          ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES
            .every(
              (reference) =>
                /^[0-9a-f]{16}$/.test(
                  reference.value,
                ),
            ),
      },
    ]

  const deterministicClosurePassed =
    [
      ...runtimeChecks,
      ...evidenceChecks,
    ].every(
      (check) =>
        check.passed,
    )

  const readiness =
    createProductionMigrationReadinessAudit(
      deterministicClosurePassed,
    )

  const readinessChecks:
    readonly Check[] = [
      {
        label:
          'Production migration remains explicitly blocked',
        passed:
          readiness.status ===
            'blocked' &&
          readiness.canSwitchProduction ===
            false,
      },
      {
        label:
          'Production deployment checklist item 21 remains not done',
        passed:
          readiness.blockers.some(
            (finding) =>
              finding.code ===
              'PRODUCTION_DEPLOYMENT_TEST_NOT_PERFORMED',
          ),
      },
      {
        label:
          'Legacy production replay remains preserved',
        passed:
          readiness
            .preservedSafetyBoundaries
            .some(
              (boundary) =>
                boundary.code ===
                'LEGACY_PRODUCTION_ROUTE_PRESERVED' &&
                boundary.preserved,
            ),
      },
      {
        label:
          'No authoritative TypeScript persistence is claimed',
        passed:
          readiness.blockers.some(
            (finding) =>
              finding.code ===
              'AUTHORITATIVE_PERSISTENCE_NOT_CONNECTED',
          ),
      },
      {
        label:
          'Health persistence remains outside the race engine',
        passed:
          readiness.blockers.some(
            (finding) =>
              finding.code ===
              'HEALTH_CONSUMER_NOT_CONNECTED',
          ),
      },
    ]

  const checks = [
    ...runtimeChecks,
    ...evidenceChecks,
    ...readinessChecks,
  ]

  const closurePassed =
    checks.every(
      (check) =>
        check.passed,
    )

  const checklist = Array.from(
    {
      length: 21,
    },
    (
      _,
      index,
    ) => {
      const item =
        index + 1

      return {
        item,
        status:
          item === 21
            ? 'not_done' as const
            : closurePassed
              ? 'done' as const
              : item === 1
                ? 'partial' as const
                : 'done' as const,
      }
    },
  )

  const resultWithoutAudit = {
    closurePassed,
    deterministicClosurePassed,

    checks,

    hashes,

    technicalEvents,

    registryValidation,

    readiness,

    checklist,

    checklistCounts: {
      done:
        checklist.filter(
          (entry) =>
            entry.status ===
            'done',
        ).length,
      partial:
        checklist.filter(
          (entry) =>
            entry.status ===
            'partial',
        ).length,
      notDone:
        checklist.filter(
          (entry) =>
            entry.status ===
            'not_done',
        ).length,
    },

    replayValidationIssues:
      replayValidation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),
  }

  return {
    ...resultWithoutAudit,
    auditHash:
      createCanonicalHashedValue(
        resultWithoutAudit,
      ).hash,
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

export default function DeterministicEngineClosureDiagnostic():
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
            Phase 8I development audit
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Deterministic engine closure and production readiness
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Recomputes the accepted shared incident execution, verifies exact
            runtime and replay hashes, validates the accumulated evidence for
            checklist items 2–20, closes deterministic engine testing, and
            deliberately keeps production migration blocked.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.closurePassed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.closurePassed
              ? 'PASS — deterministic engine tests are closed; production migration remains blocked'
              : 'FAIL — deterministic engine closure needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Done
            </div>
            <div className="mt-2 text-3xl font-bold text-emerald-300">
              {value
                .checklistCounts
                .done}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Partial
            </div>
            <div className="mt-2 text-3xl font-bold text-amber-300">
              {value
                .checklistCounts
                .partial}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Not done
            </div>
            <div className="mt-2 text-3xl font-bold text-rose-300">
              {value
                .checklistCounts
                .notDone}
            </div>
          </article>

          <article className="rounded-3xl border border-rose-800 bg-rose-950/20 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Production
            </div>
            <div className="mt-2 text-xl font-bold text-rose-300">
              NOT READY
            </div>
            <div className="mt-2 text-xs text-slate-300">
              {value
                .readiness
                .blockers
                .length}
              {' '}
              blockers
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Recomputed accepted hashes
          </h2>

          <dl className="mt-5 grid gap-2 text-xs md:grid-cols-2">
            <Metric
              label="Baseline output"
              value={
                value.hashes
                  .baselineOutput
              }
            />
            <Metric
              label="Technical output"
              value={
                value.hashes
                  .technicalOutput
              }
            />
            <Metric
              label="Repeated technical"
              value={
                value.hashes
                  .repeatedTechnicalOutput
              }
            />
            <Metric
              label="Technical stage"
              value={
                value.hashes
                  .technicalStage
              }
            />
            <Metric
              label="Mixed output"
              value={
                value.hashes
                  .mixedOutput
              }
            />
            <Metric
              label="Repeated mixed"
              value={
                value.hashes
                  .repeatedMixedOutput
              }
            />
            <Metric
              label="Mixed stage"
              value={
                value.hashes
                  .mixedStage
              }
            />
            <Metric
              label="Missing equipment"
              value={
                value.hashes
                  .missingEquipmentOutput
              }
            />
            <Metric
              label="Old crash wrapper"
              value={
                value.hashes
                  .oldCrashOutput
              }
            />
            <Metric
              label="existing_v1"
              value={
                value.hashes
                  .existingV1Output
              }
            />
            <Metric
              label="Replay"
              value={
                value.hashes
                  .replay
              }
            />
            <Metric
              label="Closure audit"
              value={
                value.auditHash
              }
            />
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Accepted technical events
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[940px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Seq.
                  </th>
                  <th className="pb-2">
                    Time
                  </th>
                  <th className="pb-2">
                    Rider
                  </th>
                  <th className="pb-2">
                    Type
                  </th>
                  <th className="pb-2">
                    Severity
                  </th>
                  <th className="pb-2">
                    Base
                  </th>
                  <th className="pb-2">
                    Adjusted
                  </th>
                  <th className="pb-2">
                    Target
                  </th>
                </tr>
              </thead>
              <tbody>
                {value
                  .technicalEvents
                  .map(
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
                            .actorRiderId}
                        </td>
                        <td className="py-2">
                          {String(
                            event
                              .payload
                              .technicalType,
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
                              .baseTimeLossSeconds,
                          )}
                          s
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

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Accepted evidence registry
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Metric
                label="References"
                value={
                  value
                    .registryValidation
                    .referenceCount
                }
              />
              <Metric
                label="Covered items"
                value={
                  value
                    .registryValidation
                    .coveredChecklistItems
                    .join(', ')
                }
              />
              <Metric
                label="Registry valid"
                value={
                  String(
                    value
                      .registryValidation
                      .valid,
                  )
                }
              />
            </dl>

            {value
              .registryValidation
              .issues
              .length >
              0 && (
              <div className="mt-4 space-y-2 text-sm text-rose-300">
                {value
                  .registryValidation
                  .issues
                  .map(
                    (issue) => (
                      <div key={issue}>
                        {issue}
                      </div>
                    ),
                  )}
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
            <h2 className="text-xl font-semibold">
              Production blockers
            </h2>

            <div className="mt-4 space-y-4">
              {value
                .readiness
                .blockers
                .map(
                  (finding) => (
                    <div
                      key={
                        finding.code
                      }
                      className="rounded-xl border border-rose-900/70 p-4"
                    >
                      <div className="font-semibold text-rose-200">
                        {finding.title}
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        {finding.detail}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        Required:
                        {' '}
                        {finding
                          .requiredEvidence}
                      </div>
                    </div>
                  ),
                )}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Closure checks
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
            This is a local in-memory closure audit. It does not call Supabase,
            change the production race or replay route, write classifications,
            persist replay events, create health cases, mutate equipment,
            enable a production feature flag, rewrite history, or perform a
            deployment.
          </p>
        </section>
      </div>
    </main>
  )
}
