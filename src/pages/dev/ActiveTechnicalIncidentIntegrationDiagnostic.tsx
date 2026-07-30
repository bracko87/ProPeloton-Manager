/**
 * ActiveTechnicalIncidentIntegrationDiagnostic.tsx
 *
 * Phase 8H.5B browser-only diagnostic.
 *
 * It searches a small deterministic seed set for at least one active technical
 * incident, verifies one shared individual/group/technical selector, confirms
 * authoritative equipment and preparation use, validates every state and
 * replay payload, and preserves all earlier runners.
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
  TECHNICAL_INCIDENT_SPECIFICATIONS,
} from '../../race-engine/simulation/technicalIncidentOutcome'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
} from '../../race-replay'

interface Check {
  readonly label: string
  readonly passed: boolean
}

const CONTROLLED_DISTANCE_KM =
  24

const CONTROLLED_EQUIPMENT_CONDITION =
  20

const CONTROLLED_RISK_MULTIPLIER =
  1

const CONTROLLED_TIME_LOSS_MULTIPLIER =
  0.9

const MAXIMUM_SEED_ATTEMPTS =
  64

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
  seed: string,
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

function allStatesValid(
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

function findTechnicalSeed() {
  for (
    let index = 0;
    index <
      MAXIMUM_SEED_ATTEMPTS;
    index += 1
  ) {
    const seed =
      `active-technical-incident-seed-${String(index).padStart(2, '0')}`

    const input =
      controlledInput(
        seed,
      )

    const stage =
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

    if (
      stage.events.some(
        (event) =>
          event.eventType ===
          'RIDER_TECHNICAL_INCIDENT',
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
    `ActiveTechnicalIncidentIntegrationDiagnostic: no active technical incident found in ${MAXIMUM_SEED_ATTEMPTS} deterministic seeds.`,
  )
}

function buildDiagnostic() {
  const found =
    findTechnicalSeed()

  const repeatedTechnicalStage =
    runCalibratedTerrainSeparationStageWithRaceIncidents(
      createInitialState(
        found.input,
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
        found.input,
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
        found.input,
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

  const missingEquipmentInput =
    controlledInput(
      found.seed,
      false,
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
        found.input,
      ),
    )

  const oldCrashStage =
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

  const technicalOutput =
    createMultiGroupSimulationOutput(
      found.stage,
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
        technicalOutput,
    })

  const replayValidation =
    validateReplayStageModel(
      replayModel,
    )

  const technicalEvents =
    technicalOutput.events.filter(
      (event) =>
        event.eventType ===
        'RIDER_TECHNICAL_INCIDENT',
    )

  const replayTechnicalEvents =
    replayModel.events.filter(
      (event) =>
        event.type ===
        'RIDER_TECHNICAL_INCIDENT',
    )

  const technicalCooldownValid =
    technicalEvents.every(
      (
        event,
        index,
      ) =>
        index === 0 ||
        event.raceSecond -
          technicalEvents[
            index - 1
          ]!.raceSecond >=
          120,
    )

  const technicalPayloadsValid =
    technicalEvents.every(
      (event) => {
        const technicalType =
          event.payload
            .technicalType

        const severity =
          event.payload
            .severity

        const baseTime =
          event.payload
            .baseTimeLossSeconds

        const adjustedTime =
          event.payload
            .timeLossSeconds

        const multiplier =
          event.payload
            .mechanicalTimeLossMultiplier

        if (
          typeof technicalType !==
            'string' ||
          !(
            technicalType in
            TECHNICAL_INCIDENT_SPECIFICATIONS
          ) ||
          (
            severity !==
              'minor' &&
            severity !==
              'moderate' &&
            severity !==
              'serious'
          ) ||
          typeof baseTime !==
            'number' ||
          typeof adjustedTime !==
            'number' ||
          typeof multiplier !==
            'number'
        ) {
          return false
        }

        const range =
          TECHNICAL_INCIDENT_SPECIFICATIONS[
            technicalType as
              keyof typeof TECHNICAL_INCIDENT_SPECIFICATIONS
          ].timeLossRanges[
            severity
          ]

        return (
          Number.isInteger(
            baseTime,
          ) &&
          baseTime >=
            range.minimumSeconds &&
          baseTime <=
            range.maximumSeconds &&
          adjustedTime ===
            Math.max(
              1,
              Math.round(
                baseTime *
                  multiplier,
              ),
            ) &&
          event.payload
            .equipmentConditionPercent ===
            CONTROLLED_EQUIPMENT_CONDITION &&
          event.payload
            .equipmentConditionAppliedToTimeLoss ===
            false &&
          event.payload
            .equipmentDamagePersistence ===
            'not_applied_in_phase_8h5a' &&
          event.payload
            .equipmentWearPersistence ===
            'not_applied_in_phase_8h5a'
        )
      },
    )

  const runtime =
    found.stage
      .finalState
      .raceIncidentRuntime

  const allIncidentEvents =
    mixedOutput.events.filter(
      (event) =>
        event.eventType ===
          'RIDER_CRASHED' ||
        event.eventType ===
          'GROUP_CRASHED' ||
        event.eventType ===
          'RIDER_TECHNICAL_INCIDENT',
    )

  const incidentCountByRaceSecond =
    new Map<
      number,
      number
    >()

  for (const event of allIncidentEvents) {
    incidentCountByRaceSecond.set(
      event.raceSecond,
      (
        incidentCountByRaceSecond.get(
          event.raceSecond,
        ) ??
        0
      ) +
      1,
    )
  }

  const oneIncidentPerTick =
    Array.from(
      incidentCountByRaceSecond.values(),
    ).every(
      (count) =>
        count <= 1,
    )

  const mixedCandidateTotals =
    mixedStage.ticks.reduce(
      (
        totals,
        tick,
      ) => {
        const incident =
          tick.raceIncident

        if (!incident) {
          return totals
        }

        return {
          individualCrash:
            totals.individualCrash +
            incident
              .candidateCountByKind
              .individualCrash,
          groupCrash:
            totals.groupCrash +
            incident
              .candidateCountByKind
              .groupCrash,
          technicalIncident:
            totals.technicalIncident +
            incident
              .candidateCountByKind
              .technicalIncident,
        }
      },
      {
        individualCrash: 0,
        groupCrash: 0,
        technicalIncident: 0,
      },
    )

  const applicationTicks =
    found.stage.ticks.filter(
      (tick) =>
        tick.raceIncident
          ?.application !==
        null &&
        tick.raceIncident
          ?.application !==
        undefined,
    )

  const applicationStatesValid =
    applicationTicks.every(
      (tick) => {
        const application =
          tick.raceIncident
            ?.application

        if (
          !application ||
          application
            .incidentKind !==
            'technical_incident'
        ) {
          return false
        }

        const event =
          application
            .result
            .event

        const riderId =
          event.actorRiderId

        const targetGroupId =
          event.targetGroupId

        if (
          !riderId ||
          !targetGroupId
        ) {
          return false
        }

        const targetGroup =
          application
            .result
            .state
            .groups[
              targetGroupId
            ]

        const rider =
          application
            .result
            .state
            .riders[
              riderId
            ]

        return (
          !!targetGroup &&
          !!rider &&
          targetGroup
            .riderIds
            .length ===
            1 &&
          targetGroup
            .riderIds[0] ===
            riderId &&
          rider
            .currentGroupId ===
            targetGroupId &&
          rider.speedKmh ===
            0
        )
      },
    )

  const stageStates = [
    found.stage.initialState,
    ...found.stage.ticks.map(
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
  ]

  const replayPayloadsMatch =
    replayTechnicalEvents.length ===
      technicalEvents.length &&
    replayTechnicalEvents.every(
      (
        replayEvent,
        index,
      ) => {
        const source =
          technicalEvents[index]

        return (
          !!source &&
          replayEvent
            .actorRiderId ===
            source.actorRiderId &&
          replayEvent
            .payload
            .technicalType ===
            source.payload
              .technicalType &&
          replayEvent
            .payload
            .severity ===
            source.payload
              .severity &&
          replayEvent
            .payload
            .timeLossSeconds ===
            source.payload
              .timeLossSeconds
        )
      },
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'A deterministic seed with an active technical incident was found',
        passed:
          technicalEvents.length >
          0,
      },
      {
        label:
          'Technical-only execution is exactly deterministic',
        passed:
          outputHash(
            technicalOutput,
          ) ===
          outputHash(
            repeatedTechnicalOutput,
          ) &&
          found.stage
            .deterministicHash ===
          repeatedTechnicalStage
            .deterministicHash,
      },
      {
        label:
          'Every active technical event has valid type, severity, equipment evidence, and preparation-adjusted time loss',
        passed:
          technicalPayloadsValid,
      },
      {
        label:
          'Technical incidents respect the 120-second global cooldown',
        passed:
          technicalCooldownValid,
      },
      {
        label:
          'Technical-only runtime never exceeds the configured three-incident stage limit',
        passed:
          technicalEvents.length <=
            3 &&
          runtime
            ?.incidentCount ===
            technicalEvents.length &&
          runtime
            .technicalIncidentCount ===
            technicalEvents.length &&
          runtime
            .individualCrashCount ===
            0 &&
          runtime
            .groupCrashCount ===
            0,
      },
      {
        label:
          'Every technical application moves exactly one rider into a valid dropped group at zero speed',
        passed:
          applicationStatesValid,
      },
      {
        label:
          'Removing equipment keeps every technical candidate ineligible and produces no technical event',
        passed:
          missingEquipmentOutput
            .events
            .every(
              (event) =>
                event.eventType !==
                'RIDER_TECHNICAL_INCIDENT',
            ) &&
          missingEquipmentStage
            .ticks
            .every(
              (tick) =>
                (
                  tick.raceIncident
                    ?.eligibleCandidateCountByKind
                    .technicalIncident ??
                  0
                ) ===
                0,
            ),
      },
      {
        label:
          'Mixed execution evaluates individual, group, and technical candidates through one runtime',
        passed:
          mixedCandidateTotals
            .individualCrash >
            0 &&
          mixedCandidateTotals
            .groupCrash >
            0 &&
          mixedCandidateTotals
            .technicalIncident >
            0,
      },
      {
        label:
          'Mixed execution applies at most one incident across all kinds per tick',
        passed:
          oneIncidentPerTick,
      },
      {
        label:
          'Mixed individual/group/technical execution is exactly deterministic',
        passed:
          outputHash(
            mixedOutput,
          ) ===
          outputHash(
            repeatedMixedOutput,
          ) &&
          mixedStage
            .deterministicHash ===
          repeatedMixedStage
            .deterministicHash,
      },
      {
        label:
          'All initial, tick, and final states pass validateSimulationState',
        passed:
          allStatesValid(
            stageStates,
          ),
      },
      {
        label:
          'Generic replay transports every technical event and its authoritative payload',
        passed:
          replayPayloadsMatch,
      },
      {
        label:
          'Technical-event generic replay model validates',
        passed:
          replayValidation.valid,
      },
      {
        label:
          'All riders finish in technical-only and mixed execution',
        passed:
          technicalOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.finished &&
                rider.finishTimeSeconds !==
                  null,
            ) &&
          mixedOutput
            .finalRiderStates
            .every(
              (rider) =>
                rider.finished &&
                rider.finishTimeSeconds !==
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
          ) &&
          baselineStage
            .finalState
            .raceIncidentRuntime ===
            undefined,
      },
      {
        label:
          'Accepted Phase 8H.3B crash wrapper remains technical-incident-free',
        passed:
          oldCrashOutput.events.every(
            (event) =>
              event.eventType !==
              'RIDER_TECHNICAL_INCIDENT',
          ) &&
          oldCrashStage
            .finalState
            .raceIncidentRuntime ===
            undefined,
      },
      {
        label:
          'existing_v1 remains incident-free and has no shared race runtime',
        passed:
          existingOutput.events.every(
            (event) =>
              event.eventType !==
                'RIDER_CRASHED' &&
              event.eventType !==
                'GROUP_CRASHED' &&
              event.eventType !==
                'RIDER_TECHNICAL_INCIDENT',
          ) &&
          existingOutput
            .finalRiderStates
            .every(
              (rider) =>
                (
                  rider as unknown as
                    Record<
                      string,
                      unknown
                    >
                ).raceIncidentRuntime ===
                undefined,
            ),
      },
      {
        label:
          'No equipment damage, wear, health case, database writer, or production path is used',
        passed:
          technicalEvents.every(
            (event) =>
              event.payload
                .equipmentDamagePersistence ===
                'not_applied_in_phase_8h5a' &&
              event.payload
                .equipmentWearPersistence ===
                'not_applied_in_phase_8h5a',
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

    technicalEventCount:
      technicalEvents.length,

    mixedIncidentCount:
      allIncidentEvents.length,

    technicalEvents,

    mixedCandidateTotals,

    baselineOutputHash:
      outputHash(
        baselineOutput,
      ),

    technicalOutputHash:
      outputHash(
        technicalOutput,
      ),

    repeatedTechnicalOutputHash:
      outputHash(
        repeatedTechnicalOutput,
      ),

    mixedOutputHash:
      outputHash(
        mixedOutput,
      ),

    repeatedMixedOutputHash:
      outputHash(
        repeatedMixedOutput,
      ),

    missingEquipmentOutputHash:
      outputHash(
        missingEquipmentOutput,
      ),

    oldCrashOutputHash:
      outputHash(
        oldCrashOutput,
      ),

    existingOutputHash:
      outputHash(
        existingOutput,
      ),

    technicalStageHash:
      found.stage
        .deterministicHash,

    mixedStageHash:
      mixedStage
        .deterministicHash,

    replayHash:
      createCanonicalHashedValue(
        replayModel,
      ).hash,

    auditHash:
      createCanonicalHashedValue({
        checks,
        seed:
          found.seed,
        technicalEvents,
        mixedCandidateTotals,
        baselineOutputHash:
          outputHash(
            baselineOutput,
          ),
        technicalOutputHash:
          outputHash(
            technicalOutput,
          ),
        mixedOutputHash:
          outputHash(
            mixedOutput,
          ),
        missingEquipmentOutputHash:
          outputHash(
            missingEquipmentOutput,
          ),
        oldCrashOutputHash:
          outputHash(
            oldCrashOutput,
          ),
        existingOutputHash:
          outputHash(
            existingOutput,
          ),
        technicalStageHash:
          found.stage
            .deterministicHash,
        mixedStageHash:
          mixedStage
            .deterministicHash,
        replayHash:
          createCanonicalHashedValue(
            replayModel,
          ).hash,
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

export default function ActiveTechnicalIncidentIntegrationDiagnostic():
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
            Phase 8H.5B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Active technical incident integration
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Evaluates individual crashes, group crashes, and equipment-driven
            technical incidents through one deterministic selector, applies at
            most one event per tick, transports technical events into generic
            replay, and keeps every production and persistence path unchanged.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — active technical incidents execute through one shared deterministic race-incident selector'
              : 'FAIL — active technical incident integration needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Controlled execution
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Seed"
                value={
                  value.seed
                }
              />
              <Metric
                label="Technical events"
                value={
                  value
                    .technicalEventCount
                }
              />
              <Metric
                label="Mixed incidents"
                value={
                  value
                    .mixedIncidentCount
                }
              />
              <Metric
                label="Equipment condition"
                value={`${CONTROLLED_EQUIPMENT_CONDITION}%`}
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Shared candidate totals
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Individual crash"
                value={
                  value
                    .mixedCandidateTotals
                    .individualCrash
                }
              />
              <Metric
                label="Group crash"
                value={
                  value
                    .mixedCandidateTotals
                    .groupCrash
                }
              />
              <Metric
                label="Technical"
                value={
                  value
                    .mixedCandidateTotals
                    .technicalIncident
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Key hashes
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Technical output"
                value={
                  value
                    .technicalOutputHash
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
                label="Replay"
                value={
                  value.replayHash
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
              label="Technical output"
              value={
                value
                  .technicalOutputHash
              }
            />
            <Metric
              label="Repeated technical output"
              value={
                value
                  .repeatedTechnicalOutputHash
              }
            />
            <Metric
              label="Technical stage"
              value={
                value
                  .technicalStageHash
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
              label="Repeated mixed output"
              value={
                value
                  .repeatedMixedOutputHash
              }
            />
            <Metric
              label="Mixed stage"
              value={
                value
                  .mixedStageHash
              }
            />
            <Metric
              label="Missing equipment output"
              value={
                value
                  .missingEquipmentOutputHash
              }
            />
            <Metric
              label="Old crash wrapper output"
              value={
                value
                  .oldCrashOutputHash
              }
            />
            <Metric
              label="existing_v1 output"
              value={
                value
                  .existingOutputHash
              }
            />
            <Metric
              label="Replay"
              value={
                value.replayHash
              }
            />
            <Metric
              label="Audit"
              value={
                value.auditHash
              }
            />
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Technical events
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Sequence
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
                    Target group
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
            This development wrapper is isolated from the accepted calibrated
            wrapper, the accepted crash wrapper, existing_v1, Supabase,
            equipment damage and wear, health persistence, replay persistence,
            official results, and production execution.
          </p>
        </section>
      </div>
    </main>
  )
}
