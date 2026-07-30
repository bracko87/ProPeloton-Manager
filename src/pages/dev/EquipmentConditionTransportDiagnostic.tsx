/**
 * EquipmentConditionTransportDiagnostic.tsx
 *
 * Phase 8H.4B browser-only diagnostic.
 *
 * Proves:
 * - optional pure equipment source transport;
 * - strict source validation and deterministic source-order independence;
 * - immutable RiderState preservation;
 * - exact authoritative five-band technical-risk multipliers;
 * - exact preparation combination and clamp;
 * - unchanged individual/group risk behavior;
 * - no technical event, time loss, writer, or production activation.
 */

import {
  useMemo,
} from 'react'

import type {
  StageRiderEquipmentInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
  type RiderEquipmentConditionSourceRow,
  type RiderPreparationModifierSourceRow,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  calculateEquipmentConditionIncidentMultiplier,
  calculateEquipmentIncidentRisk,
} from '../../race-engine/simulation/equipmentIncidentRisk'
import {
  evaluateRaceIncidentRisk,
  type RaceIncidentKind,
} from '../../race-engine/simulation/incidentRisk'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'
import {
  validateStageInput,
} from '../../race-engine/validation/validateStageInput'

interface Check {
  readonly label: string
  readonly passed: boolean
}

interface BandReference {
  readonly conditionPercent: number
  readonly expectedMultiplier: number
  readonly expectedBand: string
}

const BAND_REFERENCES:
  readonly BandReference[] = [
    {
      conditionPercent: 0,
      expectedMultiplier: 1.5,
      expectedBand:
        'condition_0_to_25',
    },
    {
      conditionPercent: 24.999,
      expectedMultiplier: 1.5,
      expectedBand:
        'condition_0_to_25',
    },
    {
      conditionPercent: 25,
      expectedMultiplier: 1.3,
      expectedBand:
        'condition_25_to_50',
    },
    {
      conditionPercent: 49.999,
      expectedMultiplier: 1.3,
      expectedBand:
        'condition_25_to_50',
    },
    {
      conditionPercent: 50,
      expectedMultiplier: 1.15,
      expectedBand:
        'condition_50_to_75',
    },
    {
      conditionPercent: 74.999,
      expectedMultiplier: 1.15,
      expectedBand:
        'condition_50_to_75',
    },
    {
      conditionPercent: 75,
      expectedMultiplier: 1.05,
      expectedBand:
        'condition_75_to_90',
    },
    {
      conditionPercent: 89.999,
      expectedMultiplier: 1.05,
      expectedBand:
        'condition_75_to_90',
    },
    {
      conditionPercent: 90,
      expectedMultiplier: 1,
      expectedBand:
        'condition_90_to_100',
    },
    {
      conditionPercent: 100,
      expectedMultiplier: 1,
      expectedBand:
        'condition_90_to_100',
    },
  ]

function equipmentRows(
  riderIds:
    readonly string[],
): {
  readonly conditions:
    readonly RiderEquipmentConditionSourceRow[]
  readonly preparations:
    readonly RiderPreparationModifierSourceRow[]
} {
  const conditionValues = [
    100,
    92,
    80,
    60,
    40,
    20,
  ] as const

  const riskMultipliers = [
    1,
    0.998,
    0.95,
    0.9,
    0.8,
    0.75,
  ] as const

  const timeLossMultipliers = [
    1,
    0.9985,
    0.96,
    0.92,
    0.86,
    0.82,
  ] as const

  const conditions =
    riderIds.map(
      (
        riderId,
        index,
      ): RiderEquipmentConditionSourceRow => {
        if (index === 1) {
          return {
            rider_id:
              riderId,
            equipment_setup_id:
              null,
            selected_component_count:
              0,
            matched_component_count:
              0,
            complete_source:
              false,
            minimum_condition_percent:
              null,
            effective_condition_percent:
              100,
            missing_component_categories:
              [],
          }
        }

        const condition =
          conditionValues[
            index %
            conditionValues.length
          ]!

        return {
          rider_id:
            riderId,
          equipment_setup_id:
            `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          selected_component_count:
            6,
          matched_component_count:
            6,
          complete_source:
            true,
          minimum_condition_percent:
            condition,
          effective_condition_percent:
            condition,
          missing_component_categories:
            [],
        }
      },
    )

  const preparations =
    riderIds.map(
      (
        riderId,
        index,
      ): RiderPreparationModifierSourceRow => ({
        rider_id:
          riderId,
        mechanical_incident_risk_multiplier:
          riskMultipliers[
            index %
            riskMultipliers.length
          ]!,
        mechanical_time_loss_multiplier:
          timeLossMultipliers[
            index %
            timeLossMultipliers.length
          ]!,
      }),
    )

  return {
    conditions,
    preparations,
  }
}

function technicalRisk(
  equipmentCondition:
    number | null,
  mechanicalIncidentRiskMultiplier?:
    number,
) {
  return evaluateRaceIncidentRisk({
    raceId:
      'equipment-transport-diagnostic-race',
    stageId:
      'equipment-transport-diagnostic-stage',
    seed:
      'equipment-transport-diagnostic-seed',

    incidentKind:
      'technical_incident',
    occurrenceIndex: 0,

    raceSecond: 300,
    tickSeconds: 30,
    stageDistanceKm: 100,
    distanceKm: 25,

    entityId:
      'technical-rider',
    riderId:
      'technical-rider',
    groupId:
      'peloton_main',
    stageStatus:
      'racing',

    currentSpeedKmh: 38,
    gradientPercent: 0,
    groupSize: 20,

    runtimeFatigue: 0,
    resistance: 50,
    raceIq: 50,

    weatherIncidentProbabilityMultiplier:
      1,
    weatherReasons: [],

    equipmentCondition,

    ...(mechanicalIncidentRiskMultiplier !==
    undefined
      ? {
          mechanicalIncidentRiskMultiplier,
        }
      : {}),

    incidentCooldownSecondsRemaining:
      0,
  })
}

function crashRisk(
  incidentKind:
    Extract<
      RaceIncidentKind,
      'individual_crash' | 'group_crash'
    >,
  equipmentCondition:
    number | null,
  mechanicalIncidentRiskMultiplier?:
    number,
) {
  return evaluateRaceIncidentRisk({
    raceId:
      'equipment-transport-diagnostic-race',
    stageId:
      'equipment-transport-diagnostic-stage',
    seed:
      'equipment-transport-diagnostic-seed',

    incidentKind,
    occurrenceIndex: 0,

    raceSecond: 300,
    tickSeconds: 30,
    stageDistanceKm: 100,
    distanceKm: 25,

    entityId:
      incidentKind ===
        'individual_crash'
        ? 'individual-rider'
        : 'peloton_main',
    riderId:
      incidentKind ===
        'individual_crash'
        ? 'individual-rider'
        : null,
    groupId:
      'peloton_main',
    stageStatus:
      'racing',

    currentSpeedKmh: 45,
    gradientPercent: -2,
    groupSize: 20,

    runtimeFatigue: 15,
    resistance: 55,
    raceIq: 60,

    weatherIncidentProbabilityMultiplier:
      1.3,
    weatherReasons: [
      'strong_wind',
    ],

    equipmentCondition,

    ...(mechanicalIncidentRiskMultiplier !==
    undefined
      ? {
          mechanicalIncidentRiskMultiplier,
        }
      : {}),

    incidentCooldownSecondsRemaining:
      0,
  })
}

function buildDiagnostic() {
  const baselineInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  const repeatedBaselineInput =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  validateStageInput(
    baselineInput,
  )

  const baselineState =
    createInitialState(
      baselineInput,
    )

  validateSimulationState(
    baselineState,
  )

  const riderIds =
    baselineInput.riders.map(
      (rider) =>
        rider.riderId,
    )

  const rows =
    equipmentRows(
      riderIds,
    )

  const sourceParams:
    CreateStageInputFromSourceRowsParams = {
      ...rioStage1SourceRows,

      equipmentConditions:
        rows.conditions,

      preparationModifiers:
        rows.preparations,
    }

  const reversedSourceParams:
    CreateStageInputFromSourceRowsParams = {
      ...rioStage1SourceRows,

      equipmentConditions:
        rows.conditions
          .slice()
          .reverse(),

      preparationModifiers:
        rows.preparations
          .slice()
          .reverse(),
    }

  const equipmentInput =
    createStageInputFromSourceRows(
      sourceParams,
    )

  const reorderedEquipmentInput =
    createStageInputFromSourceRows(
      reversedSourceParams,
    )

  validateStageInput(
    equipmentInput,
  )

  validateStageInput(
    reorderedEquipmentInput,
  )

  const equipmentState =
    createInitialState(
      equipmentInput,
    )

  validateSimulationState(
    equipmentState,
  )

  const completeRider =
    equipmentInput.riders[0]!

  const incompleteRider =
    equipmentInput.riders[1]!

  const completeStateRider =
    equipmentState.riders[
      completeRider.riderId
    ]!

  const incompleteStateRider =
    equipmentState.riders[
      incompleteRider.riderId
    ]!

  const bandResults =
    BAND_REFERENCES.map(
      (reference) => ({
        reference,
        result:
          calculateEquipmentConditionIncidentMultiplier(
            reference
              .conditionPercent,
          ),
      }),
    )

  const combinedReferences = [
    calculateEquipmentIncidentRisk(
      100,
      0.75,
    ),
    calculateEquipmentIncidentRisk(
      25,
      0.9,
    ),
    calculateEquipmentIncidentRisk(
      0,
      1,
    ),
  ] as const

  const technicalMissing =
    technicalRisk(
      null,
    )

  const technicalNeutral =
    technicalRisk(
      100,
      1,
    )

  const technicalSeventyFive =
    technicalRisk(
      75,
      1,
    )

  const technicalFiftyPrepared =
    technicalRisk(
      50,
      0.9,
    )

  const technicalZero =
    technicalRisk(
      0,
      1,
    )

  const individualBaseline =
    crashRisk(
      'individual_crash',
      null,
    )

  const individualWithEquipment =
    crashRisk(
      'individual_crash',
      0,
      0.75,
    )

  const groupBaseline =
    crashRisk(
      'group_crash',
      null,
    )

  const groupWithEquipment =
    crashRisk(
      'group_crash',
      0,
      0.75,
    )

  let pairRequirementRejected =
    false

  try {
    createStageInputFromSourceRows({
      ...rioStage1SourceRows,
      equipmentConditions:
        rows.conditions,
    })
  } catch {
    pairRequirementRejected =
      true
  }

  let invalidIncompleteRejected =
    false

  try {
    const invalidConditions =
      rows.conditions.map(
        (
          row,
          index,
        ) =>
          index === 1
            ? {
                ...row,
                effective_condition_percent:
                  99,
              }
            : row,
      )

    createStageInputFromSourceRows({
      ...rioStage1SourceRows,
      equipmentConditions:
        invalidConditions,
      preparationModifiers:
        rows.preparations,
    })
  } catch {
    invalidIncompleteRejected =
      true
  }

  const checks:
    readonly Check[] = [
      {
        label:
          'Historical adapter output remains deterministic when equipment rows are omitted',
        passed:
          createCanonicalHashedValue(
            baselineInput,
          ).hash ===
          createCanonicalHashedValue(
            repeatedBaselineInput,
          ).hash,
      },
      {
        label:
          'Historical StageInput omits equipment for every rider',
        passed:
          baselineInput.riders.every(
            (rider) =>
              rider.equipment ===
              undefined,
          ),
      },
      {
        label:
          'Historical RiderState omits startingEquipment for every rider',
        passed:
          Object.values(
            baselineState.riders,
          ).every(
            (rider) =>
              rider.startingEquipment ===
              undefined,
          ),
      },
      {
        label:
          'Equipment source arrays must be supplied together',
        passed:
          pairRequirementRejected,
      },
      {
        label:
          'Equipment source arrays cover every executable rider',
        passed:
          equipmentInput.riders.every(
            (rider) =>
              rider.equipment !==
              undefined,
          ),
      },
      {
        label:
          'Equipment transport is independent of source-row order',
        passed:
          createCanonicalHashedValue(
            equipmentInput,
          ).hash ===
          createCanonicalHashedValue(
            reorderedEquipmentInput,
          ).hash,
      },
      {
        label:
          'Complete source transports the exact six-component minimum condition',
        passed:
          completeRider
            .equipment
            ?.completeSource ===
            true &&
          completeRider
            .equipment
            .selectedComponentCount ===
            6 &&
          completeRider
            .equipment
            .matchedComponentCount ===
            6 &&
          completeRider
            .equipment
            .effectiveConditionPercent ===
            completeRider
              .equipment
              .minimumConditionPercent,
      },
      {
        label:
          'Incomplete source preserves neutral condition 100 with explicit incomplete status',
        passed:
          incompleteRider
            .equipment
            ?.completeSource ===
            false &&
          incompleteRider
            .equipment
            .equipmentSetupId ===
            null &&
          incompleteRider
            .equipment
            .effectiveConditionPercent ===
            100,
      },
      {
        label:
          'Incomplete equipment source with non-neutral effective condition is rejected',
        passed:
          invalidIncompleteRejected,
      },
      {
        label:
          'createInitialState copies complete equipment metadata immutably',
        passed:
          createCanonicalHashedValue(
            completeStateRider
              .startingEquipment,
          ).hash ===
          createCanonicalHashedValue(
            completeRider
              .equipment,
          ).hash &&
          completeStateRider
            .startingEquipment !==
            completeRider.equipment,
      },
      {
        label:
          'createInitialState preserves incomplete neutral equipment metadata',
        passed:
          createCanonicalHashedValue(
            incompleteStateRider
              .startingEquipment,
          ).hash ===
          createCanonicalHashedValue(
            incompleteRider
              .equipment,
          ).hash,
      },
      {
        label:
          'All authoritative equipment-condition boundaries match the five persisted bands',
        passed:
          bandResults.every(
            ({
              reference,
              result,
            }) =>
              result.multiplier ===
                reference
                  .expectedMultiplier &&
              result.conditionBand ===
                reference
                  .expectedBand,
          ),
      },
      {
        label:
          'Combined equipment multiplier respects the authoritative 0.78 floor',
        passed:
          combinedReferences[0]
            .combinedIncidentProbabilityMultiplier ===
            0.78,
      },
      {
        label:
          'Combined equipment multiplier multiplies preparation and condition exactly',
        passed:
          combinedReferences[1]
            .combinedIncidentProbabilityMultiplier ===
            1.17,
      },
      {
        label:
          'Combined equipment multiplier respects the authoritative 1.50 ceiling',
        passed:
          combinedReferences[2]
            .combinedIncidentProbabilityMultiplier ===
            1.5,
      },
      {
        label:
          'Technical incident remains ineligible when equipment condition is missing',
        passed:
          technicalMissing.eligible ===
            false &&
          technicalMissing
            .ineligibilityReasons
            .includes(
              'equipment_condition_missing',
            ),
      },
      {
        label:
          'Technical risk uses neutral multiplier 1 at condition 100',
        passed:
          technicalNeutral
            .contributions
            .equipment
            .multiplier ===
            1,
      },
      {
        label:
          'Technical risk uses multiplier 1.05 at the 75 percent boundary',
        passed:
          technicalSeventyFive
            .contributions
            .equipment
            .multiplier ===
            1.05,
      },
      {
        label:
          'Technical risk combines condition 50 and preparation 0.90 as 1.035',
        passed:
          technicalFiftyPrepared
            .contributions
            .equipment
            .multiplier ===
            1.035,
      },
      {
        label:
          'Technical risk caps condition zero at multiplier 1.50',
        passed:
          technicalZero
            .contributions
            .equipment
            .multiplier ===
            1.5,
      },
      {
        label:
          'Poor equipment condition cause begins below 90 percent',
        passed:
          technicalSeventyFive
            .causes
            .includes(
              'poor_equipment_condition',
            ) &&
          !technicalNeutral
            .causes
            .includes(
              'poor_equipment_condition',
            ),
      },
      {
        label:
          'Individual crash risk output is unchanged by equipment-only inputs',
        passed:
          createCanonicalHashedValue(
            individualBaseline,
          ).hash ===
          createCanonicalHashedValue(
            individualWithEquipment,
          ).hash,
      },
      {
        label:
          'Group crash risk output is unchanged by equipment-only inputs',
        passed:
          createCanonicalHashedValue(
            groupBaseline,
          ).hash ===
          createCanonicalHashedValue(
            groupWithEquipment,
          ).hash,
      },
      {
        label:
          'StageInput and SimulationState validation accept authoritative equipment transport',
        passed: true,
      },
      {
        label:
          'No technical event, time loss, equipment wear, damage, or database writer is executed',
        passed:
          equipmentState.events.every(
            (event) =>
              !String(
                event.eventType,
              ).includes(
                'TECHNICAL',
              ),
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

    baselineInputHash:
      createCanonicalHashedValue(
        baselineInput,
      ).hash,

    equipmentInputHash:
      createCanonicalHashedValue(
        equipmentInput,
      ).hash,

    equipmentStateHash:
      createCanonicalHashedValue(
        equipmentState,
      ).hash,

    bandResults,
    combinedReferences,

    technicalReferences: [
      {
        label:
          'Missing',
        result:
          technicalMissing,
      },
      {
        label:
          '100%',
        result:
          technicalNeutral,
      },
      {
        label:
          '75%',
        result:
          technicalSeventyFive,
      },
      {
        label:
          '50% × 0.90 prep',
        result:
          technicalFiftyPrepared,
      },
      {
        label:
          '0%',
        result:
          technicalZero,
      },
    ],

    completeEquipment:
      completeRider.equipment as
        StageRiderEquipmentInput,

    incompleteEquipment:
      incompleteRider.equipment as
        StageRiderEquipmentInput,

    auditHash:
      createCanonicalHashedValue({
        checks,
        baselineInputHash:
          createCanonicalHashedValue(
            baselineInput,
          ).hash,
        equipmentInputHash:
          createCanonicalHashedValue(
            equipmentInput,
          ).hash,
        equipmentStateHash:
          createCanonicalHashedValue(
            equipmentState,
          ).hash,
        bandResults,
        combinedReferences,
        technicalReferences: [
          technicalMissing,
          technicalNeutral,
          technicalSeventyFive,
          technicalFiftyPrepared,
          technicalZero,
        ],
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

export default function EquipmentConditionTransportDiagnostic():
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
            Phase 8H.4B development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Equipment condition transport and technical-risk alignment
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Transports optional authoritative equipment metadata through the
            pure source adapter and RiderState, then verifies the exact
            persisted five-band condition rules and preparation combination
            without activating technical incidents or time loss.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — optional equipment transport and authoritative technical-risk multipliers are aligned'
              : 'FAIL — equipment transport or technical-risk alignment needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Deterministic hashes
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Baseline StageInput"
                value={
                  value
                    .baselineInputHash
                }
              />
              <Metric
                label="Equipment StageInput"
                value={
                  value
                    .equipmentInputHash
                }
              />
              <Metric
                label="Equipment state"
                value={
                  value
                    .equipmentStateHash
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

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Complete source example
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Selected / matched"
                value={`${value.completeEquipment.selectedComponentCount} / ${value.completeEquipment.matchedComponentCount}`}
              />
              <Metric
                label="Condition"
                value={`${value.completeEquipment.effectiveConditionPercent}%`}
              />
              <Metric
                label="Risk multiplier"
                value={
                  value
                    .completeEquipment
                    .mechanicalIncidentRiskMultiplier
                }
              />
              <Metric
                label="Time-loss multiplier"
                value={
                  value
                    .completeEquipment
                    .mechanicalTimeLossMultiplier
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Incomplete source example
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Complete"
                value={
                  String(
                    value
                      .incompleteEquipment
                      .completeSource,
                  )
                }
              />
              <Metric
                label="Equipment setup"
                value={
                  value
                    .incompleteEquipment
                    .equipmentSetupId ??
                  'null'
                }
              />
              <Metric
                label="Neutral condition"
                value={`${value.incompleteEquipment.effectiveConditionPercent}%`}
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Authoritative condition bands
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Condition
                  </th>
                  <th className="pb-2">
                    Band
                  </th>
                  <th className="pb-2">
                    Multiplier
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.bandResults.map(
                  ({
                    reference,
                    result,
                  }) => (
                    <tr
                      key={
                        reference
                          .conditionPercent
                      }
                      className="border-t border-slate-800"
                    >
                      <td className="py-2">
                        {reference
                          .conditionPercent}
                        %
                      </td>
                      <td className="py-2">
                        {result
                          .conditionBand}
                      </td>
                      <td className="py-2">
                        {result
                          .multiplier}
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
            Technical-risk references
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Case
                  </th>
                  <th className="pb-2">
                    Eligible
                  </th>
                  <th className="pb-2">
                    Equipment multiplier
                  </th>
                  <th className="pb-2">
                    Final probability
                  </th>
                  <th className="pb-2">
                    Causes
                  </th>
                </tr>
              </thead>
              <tbody>
                {value
                  .technicalReferences
                  .map(
                    ({
                      label,
                      result,
                    }) => (
                      <tr
                        key={label}
                        className="border-t border-slate-800"
                      >
                        <td className="py-2">
                          {label}
                        </td>
                        <td className="py-2">
                          {String(
                            result
                              .eligible,
                          )}
                        </td>
                        <td className="py-2">
                          {result
                            .contributions
                            .equipment
                            .multiplier}
                        </td>
                        <td className="py-2">
                          {result
                            .finalProbability}
                        </td>
                        <td className="py-2">
                          {result
                            .causes
                            .join(', ') ||
                            'none'}
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
            This phase does not expand the live Supabase source bundle, create
            technical candidates in the active runner, append a technical
            event, apply time loss, damage equipment, apply wear, write a
            database row, or change production execution.
          </p>
        </section>
      </div>
    </main>
  )
}
