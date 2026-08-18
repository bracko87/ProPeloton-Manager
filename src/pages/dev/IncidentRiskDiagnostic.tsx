/**
 * IncidentRiskDiagnostic.tsx
 *
 * Phase 8H.1 browser-only diagnostic for deterministic incident eligibility,
 * causes, probability, rolls, and candidate selection.
 *
 * No incident is applied to SimulationState in this phase.
 */

import {
  useMemo,
  type ReactNode,
} from 'react'

import type {
  StageWeatherInput,
} from '../../race-engine/domain/StageInput'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  evaluateRaceIncidentRisk,
  selectDeterministicIncidentCandidate,
  type RaceIncidentRiskInput,
  type RaceIncidentRiskResult,
} from '../../race-engine/simulation/incidentRisk'
import {
  calculateWeatherPerformanceEffects,
} from '../../race-engine/simulation/weatherPerformanceEffects'

interface Check {
  readonly label: string
  readonly passed: boolean
}

interface Scenario {
  readonly label: string
  readonly result:
    RaceIncidentRiskResult
}

const neutralWeather:
  StageWeatherInput = {
    authority:
      'stage_weather_snapshot',
    source:
      'incident_diagnostic',
    condition:
      'clear',
    summary: null,
    averageTemperatureC: 20,
    minimumTemperatureC: 18,
    maximumTemperatureC: 22,
    windSpeedKmh: 5,
    precipitationMm: 0,
    hostCity: null,
    countryCode: null,
  }

const strongWindWeather:
  StageWeatherInput = {
    ...neutralWeather,
    condition:
      'clear',
    windSpeedKmh: 35,
  }

const rainWeather:
  StageWeatherInput = {
    ...neutralWeather,
    condition:
      'rain',
    windSpeedKmh: 8,
    precipitationMm: 8,
  }

const severeWeather:
  StageWeatherInput = {
    ...neutralWeather,
    condition:
      'heavy rain',
    averageTemperatureC: 34,
    minimumTemperatureC: 31,
    maximumTemperatureC: 38,
    windSpeedKmh: 35,
    precipitationMm: 18,
  }

function baseInput():
  RaceIncidentRiskInput {
  const effects =
    calculateWeatherPerformanceEffects(
      neutralWeather,
    )

  return {
    raceId:
      'incident-risk-diagnostic-race',
    stageId:
      'incident-risk-diagnostic-stage',
    seed:
      'incident-risk-seed-v1',

    incidentKind:
      'individual_crash',
    occurrenceIndex: 0,

    raceSecond: 1800,
    tickSeconds: 30,
    stageDistanceKm: 150,
    distanceKm: 70,

    entityId:
      'rider_neutral',
    riderId:
      'rider_neutral',
    groupId:
      'peloton_main',
    stageStatus:
      'racing',

    currentSpeedKmh: 38,
    gradientPercent: 1,
    groupSize: 20,

    runtimeFatigue: 10,
    resistance: 70,
    raceIq: 70,

    weatherIncidentProbabilityMultiplier:
      effects
        .incidentProbabilityMultiplier,
    weatherReasons:
      effects.reasons,

    equipmentCondition: null,

    incidentCooldownSecondsRemaining:
      0,
  }
}

function withWeather(
  input:
    RaceIncidentRiskInput,
  weather:
    StageWeatherInput,
): RaceIncidentRiskInput {
  const effects =
    calculateWeatherPerformanceEffects(
      weather,
    )

  return {
    ...input,
    weatherIncidentProbabilityMultiplier:
      effects
        .incidentProbabilityMultiplier,
    weatherReasons:
      effects.reasons,
  }
}

function formatProbability(
  probability: number,
): string {
  return `${(
    probability *
    100
  ).toFixed(5)}%`
}

function formatMultiplier(
  value: number,
): string {
  return `${value.toFixed(3)}x`
}

function findTriggered(
  input:
    RaceIncidentRiskInput,
): RaceIncidentRiskResult {
  for (
    let occurrenceIndex = 0;
    occurrenceIndex <
    100_000;
    occurrenceIndex += 1
  ) {
    const result =
      evaluateRaceIncidentRisk({
        ...input,
        occurrenceIndex,
      })

    if (result.triggered) {
      return result
    }
  }

  throw new Error(
    'IncidentRiskDiagnostic: unable to find a deterministic triggered candidate.',
  )
}

function buildDiagnostic() {
  const neutral =
    evaluateRaceIncidentRisk(
      baseInput(),
    )

  const neutralRepeated =
    evaluateRaceIncidentRisk(
      baseInput(),
    )

  const strongWind =
    evaluateRaceIncidentRisk(
      withWeather(
        {
          ...baseInput(),
          entityId:
            'rider_strong_wind',
          riderId:
            'rider_strong_wind',
        },
        strongWindWeather,
      ),
    )

  const wetDescent =
    evaluateRaceIncidentRisk(
      withWeather(
        {
          ...baseInput(),
          entityId:
            'rider_wet_descent',
          riderId:
            'rider_wet_descent',
          currentSpeedKmh: 72,
          gradientPercent: -10,
          runtimeFatigue: 55,
          resistance: 42,
          raceIq: 38,
        },
        rainWeather,
      ),
    )

  const fitHighControl =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      entityId:
        'rider_fit_high_control',
      riderId:
        'rider_fit_high_control',
      runtimeFatigue: 5,
      resistance: 90,
      raceIq: 90,
    })

  const tiredLowControl =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      entityId:
        'rider_tired_low_control',
      riderId:
        'rider_tired_low_control',
      runtimeFatigue: 80,
      resistance: 25,
      raceIq: 25,
    })

  const drySmallGroup =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      incidentKind:
        'group_crash',
      entityId:
        'group_small',
      riderId: null,
      groupId:
        'group_small',
      groupSize: 5,
    })

  const dryDenseGroup =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      incidentKind:
        'group_crash',
      entityId:
        'group_dense_dry',
      riderId: null,
      groupId:
        'group_dense_dry',
      groupSize: 42,
      currentSpeedKmh: 50,
    })

  const windyDenseGroup =
    evaluateRaceIncidentRisk(
      withWeather(
        {
          ...baseInput(),
          incidentKind:
            'group_crash',
          entityId:
            'group_dense_windy',
          riderId: null,
          groupId:
            'group_dense_windy',
          groupSize: 42,
          currentSpeedKmh: 50,
        },
        strongWindWeather,
      ),
    )

  const technicalMissing =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      incidentKind:
        'technical_incident',
      entityId:
        'rider_technical_missing',
      riderId:
        'rider_technical_missing',
      equipmentCondition: null,
    })

  const technicalGood =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      incidentKind:
        'technical_incident',
      entityId:
        'rider_technical_good',
      riderId:
        'rider_technical_good',
      equipmentCondition: 95,
    })

  const technicalPoor =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      incidentKind:
        'technical_incident',
      entityId:
        'rider_technical_poor',
      riderId:
        'rider_technical_poor',
      equipmentCondition: 20,
    })

  const openingNeutral =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      entityId:
        'rider_opening',
      riderId:
        'rider_opening',
      raceSecond: 30,
      distanceKm: 0.5,
    })

  const finishingNeutral =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      entityId:
        'rider_finishing',
      riderId:
        'rider_finishing',
      distanceKm: 149.7,
    })

  const cooldown =
    evaluateRaceIncidentRisk({
      ...baseInput(),
      entityId:
        'rider_cooldown',
      riderId:
        'rider_cooldown',
      incidentCooldownSecondsRemaining:
        120,
    })

  const severeIndividualInput =
    withWeather(
      {
        ...baseInput(),
        entityId:
          'rider_trigger_a',
        riderId:
          'rider_trigger_a',
        tickSeconds: 120,
        currentSpeedKmh: 80,
        gradientPercent: -12,
        groupSize: 45,
        runtimeFatigue: 95,
        resistance: 15,
        raceIq: 15,
      },
      severeWeather,
    )

  const severeGroupInput =
    withWeather(
      {
        ...baseInput(),
        incidentKind:
          'group_crash',
        entityId:
          'group_trigger_b',
        riderId: null,
        groupId:
          'group_trigger_b',
        tickSeconds: 120,
        currentSpeedKmh: 75,
        gradientPercent: -11,
        groupSize: 60,
        runtimeFatigue: 90,
        resistance: 20,
        raceIq: 20,
      },
      severeWeather,
    )

  const triggeredA =
    findTriggered(
      severeIndividualInput,
    )

  const triggeredB =
    findTriggered(
      severeGroupInput,
    )

  const selectionA =
    selectDeterministicIncidentCandidate([
      triggeredA,
      triggeredB,
    ])

  const selectionB =
    selectDeterministicIncidentCandidate([
      triggeredB,
      triggeredA,
    ])

  const scenarios:
    readonly Scenario[] = [
      {
        label:
          'Neutral individual crash',
        result:
          neutral,
      },
      {
        label:
          'Strong-wind individual crash',
        result:
          strongWind,
      },
      {
        label:
          'Wet high-speed descent',
        result:
          wetDescent,
      },
      {
        label:
          'Fit high-control rider',
        result:
          fitHighControl,
      },
      {
        label:
          'Fatigued low-control rider',
        result:
          tiredLowControl,
      },
      {
        label:
          'Dry dense group crash',
        result:
          dryDenseGroup,
      },
      {
        label:
          'Strong-wind dense group crash',
        result:
          windyDenseGroup,
      },
      {
        label:
          'Good-condition technical incident',
        result:
          technicalGood,
      },
      {
        label:
          'Poor-condition technical incident',
        result:
          technicalPoor,
      },
    ]

  const checks:
    readonly Check[] = [
      {
        label:
          'Repeated evaluation has identical hash, roll, probability, and trigger result',
        passed:
          neutral
            .deterministicKeyHash ===
            neutralRepeated
              .deterministicKeyHash &&
          neutral
            .deterministicRoll ===
            neutralRepeated
              .deterministicRoll &&
          neutral
            .finalProbability ===
            neutralRepeated
              .finalProbability &&
          neutral.triggered ===
            neutralRepeated
              .triggered,
      },
      {
        label:
          'Opening neutral zone blocks incidents',
        passed:
          !openingNeutral.eligible &&
          openingNeutral
            .ineligibilityReasons
            .includes(
              'opening_neutral_zone',
            ),
      },
      {
        label:
          'Finishing neutral zone blocks incidents',
        passed:
          !finishingNeutral
            .eligible &&
          finishingNeutral
            .ineligibilityReasons
            .includes(
              'finishing_neutral_zone',
            ),
      },
      {
        label:
          'Incident cooldown blocks a new incident',
        passed:
          !cooldown.eligible &&
          cooldown
            .ineligibilityReasons
            .includes(
              'incident_cooldown',
            ),
      },
      {
        label:
          'Group crashes require at least six riders',
        passed:
          !drySmallGroup
            .eligible &&
          drySmallGroup
            .ineligibilityReasons
            .includes(
              'group_too_small',
            ),
      },
      {
        label:
          'Technical incidents require equipment condition',
        passed:
          !technicalMissing
            .eligible &&
          technicalMissing
            .ineligibilityReasons
            .includes(
              'equipment_condition_missing',
            ),
      },
      {
        label:
          'Strong wind increases individual crash probability',
        passed:
          strongWind
            .finalProbability >
          neutral
            .finalProbability,
      },
      {
        label:
          'Strong wind increases group crash probability',
        passed:
          windyDenseGroup
            .finalProbability >
          dryDenseGroup
            .finalProbability,
      },
      {
        label:
          'Wet high-speed descent is riskier than strong wind alone',
        passed:
          wetDescent
            .finalProbability >
          strongWind
            .finalProbability,
      },
      {
        label:
          'Runtime fatigue and low rider control increase incident probability',
        passed:
          tiredLowControl
            .finalProbability >
          fitHighControl
            .finalProbability,
      },
      {
        label:
          'Poor equipment condition increases technical-incident probability',
        passed:
          technicalPoor
            .finalProbability >
          technicalGood
            .finalProbability,
      },
      {
        label:
          'Incident causes explain active risk inputs',
        passed:
          wetDescent.causes.includes(
            'wet_road',
          ) &&
          wetDescent.causes.includes(
            'high_speed',
          ) &&
          wetDescent.causes.includes(
            'descending',
          ) &&
          wetDescent.causes.includes(
            'runtime_fatigue',
          ) &&
          technicalPoor.causes.includes(
            'poor_equipment_condition',
          ),
      },
      {
        label:
          'Every probability remains bounded by its incident-kind maximum',
        passed:
          scenarios.every(
            ({ result }) =>
              result
                .finalProbability >=
                0 &&
              result
                .finalProbability <=
                (
                  result
                    .incidentKind ===
                    'individual_crash'
                    ? 0.08
                    : result
                        .incidentKind ===
                        'group_crash'
                      ? 0.04
                      : 0.05
                ),
          ),
      },
      {
        label:
          'Deterministic candidate selection is independent of input order',
        passed:
          selectionA.selected
            ?.entityId ===
            selectionB.selected
              ?.entityId &&
          selectionA
            .triggeredCandidateCount ===
            selectionB
              .triggeredCandidateCount &&
          JSON.stringify(
            selectionA
              .orderedTriggeredEntityIds,
          ) ===
            JSON.stringify(
              selectionB
                .orderedTriggeredEntityIds,
            ),
      },
      {
        label:
          'Definition phase selects at most one candidate without applying state or events',
        passed:
          selectionA.selected !==
            null &&
          selectionA
            .triggeredCandidateCount >=
            2,
      },
    ]

  const audit =
    createCanonicalHashedValue({
      scenarios:
        scenarios.map(
          ({ label, result }) => ({
            label,
            result,
          }),
        ),
      checks,
      selectionA,
      selectionB,
    })

  return {
    scenarios,
    checks,
    selectionA,
    selectionB,
    auditHash:
      audit.hash,
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
  }
}

function ScenarioCard({
  scenario,
}: {
  readonly scenario:
    Scenario
}): JSX.Element {
  const {
    result,
  } = scenario

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold text-white">
        {scenario.label}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <Row
          label="Kind"
          value={result.incidentKind}
        />
        <Row
          label="Eligible"
          value={
            result.eligible
              ? 'YES'
              : 'NO'
          }
        />
        <Row
          label="Probability"
          value={formatProbability(
            result.finalProbability,
          )}
        />
        <Row
          label="Deterministic roll"
          value={result.deterministicRoll.toFixed(
            9,
          )}
        />
        <Row
          label="Triggered"
          value={
            result.triggered
              ? 'YES'
              : 'NO'
          }
        />
        <Row
          label="Weather"
          value={formatMultiplier(
            result.contributions
              .weather
              .multiplier,
          )}
        />
        <Row
          label="Speed / descent"
          value={`${formatMultiplier(result.contributions.speed.multiplier)} / ${formatMultiplier(result.contributions.descent.multiplier)}`}
        />
        <Row
          label="Density / fatigue"
          value={`${formatMultiplier(result.contributions.groupDensity.multiplier)} / ${formatMultiplier(result.contributions.runtimeFatigue.multiplier)}`}
        />
        <Row
          label="Control / equipment"
          value={`${formatMultiplier(result.contributions.riderControl.multiplier)} / ${formatMultiplier(result.contributions.equipment.multiplier)}`}
        />
        <Row
          label="Causes"
          value={
            result.causes.length >
            0
              ? result.causes.join(
                  ', ',
                )
              : 'neutral'
          }
        />
        <Row
          label="Ineligible because"
          value={
            result
              .ineligibilityReasons
              .length >
            0
              ? result
                  .ineligibilityReasons
                  .join(', ')
              : '—'
          }
        />
        <Row
          label="Key hash"
          value={
            <span className="font-mono text-xs">
              {result.deterministicKeyHash}
            </span>
          }
        />
      </dl>
    </article>
  )
}

function Row({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function IncidentRiskDiagnostic():
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
            Phase 8H.1 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Deterministic incident eligibility and probability
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Defines when and why individual crashes, group crashes, and
            technical incidents may occur. This page evaluates eligibility,
            bounded probability, deterministic rolls, causes, and one-candidate
            selection without mutating race state or creating events.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — incident eligibility, causes, probability, rolls, and deterministic selection are fully defined'
              : 'FAIL — deterministic incident-risk definition needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {value.scenarios.map(
            (scenario) => (
              <ScenarioCard
                key={scenario.label}
                scenario={scenario}
              />
            ),
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Deterministic one-candidate selection
          </h2>

          <dl className="mt-4 space-y-2 text-sm text-slate-300">
            <Row
              label="Selected entity"
              value={
                value.selectionA
                  .selected
                  ?.entityId ??
                'none'
              }
            />
            <Row
              label="Triggered candidates"
              value={
                value.selectionA
                  .triggeredCandidateCount
              }
            />
            <Row
              label="Ordered triggered entities"
              value={
                value.selectionA
                  .orderedTriggeredEntityIds
                  .join(', ')
              }
            />
            <Row
              label="Audit hash"
              value={
                <span className="font-mono text-xs">
                  {value.auditHash}
                </span>
              }
            />
          </dl>
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
            No SimulationState field, RaceEvent type, replay frame, rider
            position, group membership, finish time, classification, equipment
            record, Supabase row, scheduler, RPC, or production route is
            changed. Technical incidents remain ineligible when equipment
            condition is unavailable.
          </p>
        </section>
      </div>
    </main>
  )
}
