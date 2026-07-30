/**
 * TechnicalIncidentDiagnostic.tsx
 *
 * Phase 8H.5A browser-only diagnostic for the isolated deterministic
 * technical-incident outcome and realistic time-loss model.
 *
 * No active incident-risk loop, shared incident runtime, database access,
 * equipment damage, wear, maintenance, or production execution occurs here.
 */

import {
  useMemo,
} from 'react'

import type {
  RaceEvent,
} from '../../race-engine/domain/RaceEvent'
import type {
  SimulationOutput,
} from '../../race-engine/domain/SimulationOutput'
import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  applyOptionalTechnicalIncident,
  applyTechnicalIncident,
} from '../../race-engine/simulation/applyTechnicalIncident'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  calculateTechnicalIncidentOutcome,
  TECHNICAL_INCIDENT_SPECIFICATIONS,
  type TechnicalIncidentSeverity,
  type TechnicalIncidentType,
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

interface RangeReference {
  readonly technicalType:
    TechnicalIncidentType
  readonly severity:
    TechnicalIncidentSeverity
  readonly minimum: number
  readonly maximum: number
  readonly actual: number
}

const CONTROLLED_RACE_SECOND =
  300

const CONTROLLED_DISTANCE_KM =
  5

const CONTROLLED_SPEED_KMH =
  42

const CONTROLLED_CONDITION =
  72

const CONTROLLED_TIME_LOSS_MULTIPLIER =
  0.9

function controlledInput():
  StageInput {
  const base =
    createStageInputFromSourceRows({
      ...rioStage1SourceRows,

      race: {
        ...rioStage1SourceRows
          .race,
        id:
          'technical-incident-diagnostic-race',
        name:
          'Technical incident diagnostic race',
      },

      stage: {
        ...rioStage1SourceRows
          .stage,
        id:
          'technical-incident-diagnostic-stage',
        race_id:
          'technical-incident-diagnostic-race',
        name:
          'Technical incident diagnostic',
        distance_km: 12,
      },

      profilePoints: [
        {
          km: 0,
          elevation_m: 10,
        },
        {
          km: 6,
          elevation_m: 10,
        },
        {
          km: 12,
          elevation_m: 10,
        },
      ],
    })

  return {
    ...base,
    seed:
      'technical-incident-diagnostic-seed-v1',
    riders:
      base.riders.map(
        (
          rider,
          index,
        ) => ({
          ...rider,
          equipment: {
            conditionSource:
              'race_engine_resolve_stage_rider_equipment_condition_v1' as const,
            preparationSource:
              'race_engine_get_stage_rider_preparation_modifiers_v2' as const,

            equipmentSetupId:
              `technical-equipment-setup-${String(index + 1).padStart(3, '0')}`,

            selectedComponentCount:
              6,
            matchedComponentCount:
              6,
            completeSource:
              true,

            minimumConditionPercent:
              CONTROLLED_CONDITION,
            effectiveConditionPercent:
              CONTROLLED_CONDITION,
            missingComponentCategories: [],

            mechanicalIncidentRiskMultiplier:
              1,
            mechanicalTimeLossMultiplier:
              CONTROLLED_TIME_LOSS_MULTIPLIER,
          },
        }),
      ),
    orders: [],
  }
}

function controlledState():
  SimulationState {
  const initial =
    createInitialState(
      controlledInput(),
    )

  const riders =
    Object.fromEntries(
      Object.values(
        initial.riders,
      ).map(
        (rider) => [
          rider.riderId,
          {
            ...rider,
            currentGroupId:
              INITIAL_PELOTON_GROUP_ID,
            distanceKm:
              CONTROLLED_DISTANCE_KM,
            speedKmh:
              CONTROLLED_SPEED_KMH,
            stageStatus:
              'racing' as const,
            finished: false,
            finishTimeSeconds: null,
            finishPosition: null,
          },
        ],
      ),
    )

  const riderIds =
    Object.keys(
      riders,
    ).sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )

  const groups = {
    ...initial.groups,

    [INITIAL_PELOTON_GROUP_ID]: {
      ...initial.groups[
        INITIAL_PELOTON_GROUP_ID
      ]!,
      riderIds,
      distanceKm:
        CONTROLLED_DISTANCE_KM,
      speedKmh:
        CONTROLLED_SPEED_KMH,
      gapFromLeaderSeconds: 0,
      active: true,
    },
  }

  const separationPressureSecondsByRiderId =
    Object.fromEntries(
      riderIds.map(
        (riderId) => [
          riderId,
          30,
        ],
      ),
    )

  return {
    ...initial,
    raceSecond:
      CONTROLLED_RACE_SECOND,
    currentKm:
      CONTROLLED_DISTANCE_KM,
    riders,
    groups,
    separationPressureSecondsByRiderId,
  }
}

function expectedDistanceLoss(
  speedKmh: number,
  timeLossSeconds: number,
): number {
  return Number(
    (
      speedKmh *
      (
        timeLossSeconds /
        3600
      )
    ).toFixed(9),
  )
}

function insertTechnicalEventIntoOutput(
  output:
    SimulationOutput,
  sourceEvent:
    RaceEvent,
): SimulationOutput {
  const merged =
    [
      ...output.events.map(
        (event) => ({
          event,
          originalSequence:
            event.sequenceNumber,
          injected: false,
        }),
      ),
      {
        event:
          sourceEvent,
        originalSequence:
          Number.MAX_SAFE_INTEGER,
        injected: true,
      },
    ]
      .sort(
        (
          left,
          right,
        ) =>
          left.event.raceSecond -
            right.event.raceSecond ||
          Number(
            left.injected,
          ) -
            Number(
              right.injected,
            ) ||
          left.originalSequence -
            right.originalSequence,
      )

  const originalToNew =
    new Map<
      number,
      number
    >()

  let injectedSequence =
    -1

  const events =
    merged.map(
      (
        entry,
        index,
      ) => {
        const sequenceNumber =
          index + 1

        if (entry.injected) {
          injectedSequence =
            sequenceNumber
        } else {
          originalToNew.set(
            entry.originalSequence,
            sequenceNumber,
          )
        }

        return {
          ...entry.event,
          sequenceNumber,
        }
      },
    )

  if (injectedSequence < 1) {
    throw new Error(
      'Technical replay insertion did not resolve an event sequence.',
    )
  }

  let injectionSnapshotIndex =
    output.snapshots.findIndex(
      (snapshot) =>
        snapshot.raceSecond >=
        sourceEvent.raceSecond,
    )

  if (injectionSnapshotIndex < 0) {
    injectionSnapshotIndex =
      output.snapshots.length -
      1
  }

  const snapshots =
    output.snapshots.map(
      (
        snapshot,
        index,
      ) => {
        const remapped =
          snapshot
            .eventSequenceNumbers
            .map(
              (sequenceNumber) => {
                const mapped =
                  originalToNew.get(
                    sequenceNumber,
                  )

                if (!mapped) {
                  throw new Error(
                    `Missing remapped sequence for source event ${sequenceNumber}.`,
                  )
                }

                return mapped
              },
            )

        if (
          index ===
          injectionSnapshotIndex
        ) {
          remapped.push(
            injectedSequence,
          )
        }

        return {
          ...snapshot,
          eventSequenceNumbers:
            Array.from(
              new Set(
                remapped,
              ),
            ).sort(
              (left, right) =>
                left - right,
            ),
        }
      },
    )

  return {
    ...output,
    events,
    snapshots,
  }
}

function buildDiagnostic() {
  const initialState =
    controlledState()

  validateSimulationState(
    initialState,
  )

  const riderId =
    Object.keys(
      initialState.riders,
    ).sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )[0]!

  const riderBefore =
    initialState.riders[
      riderId
    ]!

  const applicationA =
    applyTechnicalIncident({
      state:
        initialState,
      riderId,

      technicalType:
        'puncture',
      severity:
        'moderate',
      occurrenceIndex: 0,

      equipmentConditionPercent:
        CONTROLLED_CONDITION,
      mechanicalTimeLossMultiplier:
        CONTROLLED_TIME_LOSS_MULTIPLIER,

      causes: [
        'poor_equipment_condition',
      ],
    })

  const applicationB =
    applyTechnicalIncident({
      state:
        initialState,
      riderId,

      technicalType:
        'puncture',
      severity:
        'moderate',
      occurrenceIndex: 0,

      equipmentConditionPercent:
        CONTROLLED_CONDITION,
      mechanicalTimeLossMultiplier:
        CONTROLLED_TIME_LOSS_MULTIPLIER,

      causes: [
        'poor_equipment_condition',
      ],
    })

  validateSimulationState(
    applicationA.state,
  )

  const sourceGroupBefore =
    initialState.groups[
      INITIAL_PELOTON_GROUP_ID
    ]!

  const sourceGroupAfter =
    applicationA.state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]!

  const targetGroup =
    applicationA.state.groups[
      applicationA.targetGroupId
    ]!

  const riderAfter =
    applicationA.state.riders[
      riderId
    ]!

  const expectedLoss =
    expectedDistanceLoss(
      CONTROLLED_SPEED_KMH,
      applicationA
        .outcome
        .timeLossSeconds,
    )

  const neutralPreparationOutcome =
    calculateTechnicalIncidentOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,

      riderId,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,

      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        CONTROLLED_DISTANCE_KM,
      sourceGapFromLeaderSeconds: 0,
      sourceSpeedKmh:
        CONTROLLED_SPEED_KMH,

      technicalType:
        'puncture',
      severity:
        'moderate',

      equipmentConditionPercent:
        100,
      mechanicalTimeLossMultiplier:
        1,
    })

  const preparedOutcome =
    calculateTechnicalIncidentOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,

      riderId,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,

      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        CONTROLLED_DISTANCE_KM,
      sourceGapFromLeaderSeconds: 0,
      sourceSpeedKmh:
        CONTROLLED_SPEED_KMH,

      technicalType:
        'puncture',
      severity:
        'moderate',

      equipmentConditionPercent:
        20,
      mechanicalTimeLossMultiplier:
        0.82,
    })

  const types =
    Object.keys(
      TECHNICAL_INCIDENT_SPECIFICATIONS,
    ) as
      TechnicalIncidentType[]

  const severities:
    readonly TechnicalIncidentSeverity[] = [
      'minor',
      'moderate',
      'serious',
    ]

  const rangeReferences:
    readonly RangeReference[] =
      types.flatMap(
        (
          technicalType,
          typeIndex,
        ) =>
          severities.map(
            (
              severity,
              severityIndex,
            ) => {
              const specification =
                TECHNICAL_INCIDENT_SPECIFICATIONS[
                  technicalType
                ]

              const range =
                specification
                  .timeLossRanges[
                    severity
                  ]

              const outcome =
                calculateTechnicalIncidentOutcome({
                  raceId:
                    initialState.raceId,
                  stageId:
                    initialState.stageId,
                  seed:
                    `${initialState.seed}:${technicalType}:${severity}`,
                  occurrenceIndex:
                    typeIndex * 3 +
                    severityIndex,

                  riderId,
                  sourceGroupId:
                    INITIAL_PELOTON_GROUP_ID,

                  raceSecond:
                    initialState.raceSecond,
                  sourceDistanceKm:
                    CONTROLLED_DISTANCE_KM,
                  sourceGapFromLeaderSeconds:
                    0,
                  sourceSpeedKmh:
                    CONTROLLED_SPEED_KMH,

                  technicalType,
                  severity,

                  equipmentConditionPercent:
                    CONTROLLED_CONDITION,
                  mechanicalTimeLossMultiplier:
                    1,
                })

              return {
                technicalType,
                severity,
                minimum:
                  range.minimumSeconds,
                maximum:
                  range.maximumSeconds,
                actual:
                  outcome
                    .baseTimeLossSeconds,
              }
            },
          ),
      )

  const noSelection =
    applyOptionalTechnicalIncident({
      state:
        initialState,
      selectedRiderId:
        null,

      technicalType:
        'puncture',
      severity:
        'moderate',
      occurrenceIndex: 0,

      equipmentConditionPercent:
        CONTROLLED_CONDITION,
      mechanicalTimeLossMultiplier:
        CONTROLLED_TIME_LOSS_MULTIPLIER,
    })

  let completedRejected =
    false

  try {
    applyTechnicalIncident({
      state: {
        ...initialState,
        completed: true,
      },
      riderId,

      technicalType:
        'puncture',
      severity:
        'moderate',
      occurrenceIndex: 0,

      equipmentConditionPercent:
        CONTROLLED_CONDITION,
      mechanicalTimeLossMultiplier:
        CONTROLLED_TIME_LOSS_MULTIPLIER,
    })
  } catch {
    completedRejected =
      true
  }

  let soloGroupRejected =
    false

  try {
    applyTechnicalIncident({
      state: {
        ...initialState,
        groups: {
          ...initialState.groups,
          [INITIAL_PELOTON_GROUP_ID]: {
            ...sourceGroupBefore,
            riderIds: [
              riderId,
            ],
          },
        },
      },
      riderId,

      technicalType:
        'puncture',
      severity:
        'moderate',
      occurrenceIndex: 0,

      equipmentConditionPercent:
        CONTROLLED_CONDITION,
      mechanicalTimeLossMultiplier:
        CONTROLLED_TIME_LOSS_MULTIPLIER,
    })
  } catch {
    soloGroupRejected =
      true
  }

  let invalidConditionRejected =
    false

  try {
    calculateTechnicalIncidentOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,

      riderId,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,

      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        CONTROLLED_DISTANCE_KM,
      sourceGapFromLeaderSeconds:
        0,
      sourceSpeedKmh:
        CONTROLLED_SPEED_KMH,

      technicalType:
        'puncture',
      severity:
        'moderate',

      equipmentConditionPercent:
        101,
      mechanicalTimeLossMultiplier:
        1,
    })
  } catch {
    invalidConditionRejected =
      true
  }

  let invalidMultiplierRejected =
    false

  try {
    calculateTechnicalIncidentOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,

      riderId,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,

      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        CONTROLLED_DISTANCE_KM,
      sourceGapFromLeaderSeconds:
        0,
      sourceSpeedKmh:
        CONTROLLED_SPEED_KMH,

      technicalType:
        'puncture',
      severity:
        'moderate',

      equipmentConditionPercent:
        100,
      mechanicalTimeLossMultiplier:
        0.81,
    })
  } catch {
    invalidMultiplierRejected =
      true
  }

  const stageInput =
    controlledInput()

  const baselineOutput =
    runDeterministicRoadRace(
      stageInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const technicalOutput =
    insertTechnicalEventIntoOutput(
      baselineOutput,
      applicationA.event,
    )

  const replayModel =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput:
        technicalOutput,
    })

  const replayValidation =
    validateReplayStageModel(
      replayModel,
    )

  const replayTechnicalEvent =
    replayModel.events.find(
      (event) =>
        event.type ===
        'RIDER_TECHNICAL_INCIDENT',
    )

  const eventFrameCount =
    replayModel.frames.filter(
      (frame) =>
        replayTechnicalEvent
          ? frame
              .eventSequenceNumbers
              .includes(
                replayTechnicalEvent
                  .sequenceNumber,
              )
          : false,
    ).length

  const unaffectedRidersUnchanged =
    Object.values(
      initialState.riders,
    )
      .filter(
        (rider) =>
          rider.riderId !==
          riderId,
      )
      .every(
        (rider) =>
          createCanonicalHashedValue(
            rider,
          ).hash ===
          createCanonicalHashedValue(
            applicationA
              .state
              .riders[
                rider.riderId
              ],
          ).hash,
      )

  const checks:
    readonly Check[] = [
      {
        label:
          'Exact repeated application is deterministic',
        passed:
          createCanonicalHashedValue(
            applicationA,
          ).hash ===
          createCanonicalHashedValue(
            applicationB,
          ).hash,
      },
      {
        label:
          'All fifteen technical type and severity references stay inside their configured ranges',
        passed:
          rangeReferences.every(
            (reference) =>
              reference.actual >=
                reference.minimum &&
              reference.actual <=
                reference.maximum,
          ),
      },
      {
        label:
          'Equipment condition is evidence only and does not change the base incident roll',
        passed:
          neutralPreparationOutcome
            .incidentIdentityHash ===
            preparedOutcome
              .incidentIdentityHash &&
          neutralPreparationOutcome
            .baseTimeLossSeconds ===
            preparedOutcome
              .baseTimeLossSeconds,
      },
      {
        label:
          'Preparation time-loss multiplier is applied exactly once',
        passed:
          preparedOutcome
            .timeLossSeconds ===
            Math.max(
              1,
              Math.round(
                preparedOutcome
                  .baseTimeLossSeconds *
                  0.82,
              ),
            ),
      },
      {
        label:
          'Better preparation never increases technical time loss',
        passed:
          preparedOutcome
            .timeLossSeconds <=
            neutralPreparationOutcome
              .timeLossSeconds &&
          preparedOutcome
            .responseSavingsSeconds >=
            0,
      },
      {
        label:
          'Exactly one rider moves from the source group into dropped_1',
        passed:
          sourceGroupAfter
            .riderIds
            .length ===
            sourceGroupBefore
              .riderIds
              .length -
              1 &&
          !sourceGroupAfter
            .riderIds
            .includes(
              riderId,
            ) &&
          targetGroup.groupId ===
            'dropped_1' &&
          JSON.stringify(
            targetGroup.riderIds,
          ) ===
          JSON.stringify([
            riderId,
          ]),
      },
      {
        label:
          'Affected rider remains racing at zero speed in the target group',
        passed:
          riderAfter
            .stageStatus ===
            'racing' &&
          riderAfter
            .currentGroupId ===
            'dropped_1' &&
          riderAfter.speedKmh ===
            0 &&
          riderAfter.distanceKm ===
            applicationA
              .outcome
              .targetDistanceKm,
      },
      {
        label:
          'Every unaffected rider remains unchanged',
        passed:
          unaffectedRidersUnchanged,
      },
      {
        label:
          'Affected rider separation pressure resets to zero',
        passed:
          applicationA
            .state
            .separationPressureSecondsByRiderId[
              riderId
            ] ===
            0,
      },
      {
        label:
          'Physical distance loss equals source speed multiplied by adjusted time loss',
        passed:
          Math.abs(
            applicationA
              .outcome
              .distanceLossKm -
            expectedLoss
          ) <
          0.000001,
      },
      {
        label:
          'Target gap increases by the exact adjusted time loss',
        passed:
          applicationA
            .outcome
            .targetGapFromLeaderSeconds -
          applicationA
            .outcome
            .sourceGapFromLeaderSeconds ===
          applicationA
            .outcome
            .timeLossSeconds,
      },
      {
        label:
          'RIDER_TECHNICAL_INCIDENT uses the active event contract',
        passed:
          applicationA
            .event
            .eventType ===
            'RIDER_TECHNICAL_INCIDENT' &&
          applicationA
            .event
            .actorRiderId ===
            riderId &&
          applicationA
            .event
            .teamId ===
            riderBefore.teamId &&
          applicationA
            .event
            .sourceGroupId ===
            INITIAL_PELOTON_GROUP_ID &&
          applicationA
            .event
            .targetGroupId ===
            'dropped_1' &&
          JSON.stringify(
            applicationA
              .event
              .relatedRiderIds,
          ) ===
          JSON.stringify([
            riderId,
          ]),
      },
      {
        label:
          'Technical event payload contains exact type, severity, equipment evidence, and time-loss values',
        passed:
          applicationA
            .event
            .payload
            .incidentKind ===
            'technical_incident' &&
          applicationA
            .event
            .payload
            .technicalType ===
            'puncture' &&
          applicationA
            .event
            .payload
            .severity ===
            'moderate' &&
          applicationA
            .event
            .payload
            .equipmentConditionPercent ===
            CONTROLLED_CONDITION &&
          applicationA
            .event
            .payload
            .baseTimeLossSeconds ===
            applicationA
              .outcome
              .baseTimeLossSeconds &&
          applicationA
            .event
            .payload
            .timeLossSeconds ===
            applicationA
              .outcome
              .timeLossSeconds,
      },
      {
        label:
          'Affected equipment categories are deterministic and type-specific',
        passed:
          JSON.stringify(
            applicationA
              .outcome
              .affectedEquipmentCategories,
          ) ===
          JSON.stringify([
            'tires',
            'wheelset',
          ]),
      },
      {
        label:
          'Starting equipment metadata remains unchanged',
        passed:
          createCanonicalHashedValue(
            riderBefore
              .startingEquipment,
          ).hash ===
          createCanonicalHashedValue(
            riderAfter
              .startingEquipment,
          ).hash,
      },
      {
        label:
          'Event and dropped-group counters increment exactly once',
        passed:
          applicationA
            .state
            .nextEventSequenceNumber ===
            initialState
              .nextEventSequenceNumber +
              1 &&
          applicationA
            .state
            .nextDroppedGroupNumber ===
            initialState
              .nextDroppedGroupNumber +
              1,
      },
      {
        label:
          'Null technical selection preserves the exact state reference',
        passed:
          noSelection.state ===
            initialState &&
          noSelection.application ===
            null,
      },
      {
        label:
          'Completed simulations reject technical application',
        passed:
          completedRejected,
      },
      {
        label:
          'A technical incident cannot empty a solo source group',
        passed:
          soloGroupRejected,
      },
      {
        label:
          'Equipment condition outside 0–100 is rejected',
        passed:
          invalidConditionRejected,
      },
      {
        label:
          'Mechanical time-loss multiplier outside 0.82–1.00 is rejected',
        passed:
          invalidMultiplierRejected,
      },
      {
        label:
          'Initial and resulting states pass validateSimulationState',
        passed: true,
      },
      {
        label:
          'Generic replay adapter transports RIDER_TECHNICAL_INCIDENT and its payload',
        passed:
          !!replayTechnicalEvent &&
          replayTechnicalEvent
            .actorRiderId ===
            riderId &&
          replayTechnicalEvent
            .payload
            .technicalType ===
            'puncture' &&
          replayTechnicalEvent
            .payload
            .timeLossSeconds ===
            applicationA
              .outcome
              .timeLossSeconds,
      },
      {
        label:
          'Technical replay event is attached to exactly one authoritative frame',
        passed:
          eventFrameCount ===
            1,
      },
      {
        label:
          'Technical-event generic replay model validates',
        passed:
          replayValidation.valid,
      },
      {
        label:
          'No equipment damage, wear, health case, database writer, or active technical runner is used',
        passed:
          applicationA
            .event
            .payload
            .equipmentDamagePersistence ===
            'not_applied_in_phase_8h5a' &&
          applicationA
            .event
            .payload
            .equipmentWearPersistence ===
            'not_applied_in_phase_8h5a' &&
          applicationA
            .event
            .payload
            .technicalRunnerIntegration ===
            'not_active_in_phase_8h5a',
      },
    ]

  const replayHash =
    createCanonicalHashedValue(
      replayModel,
    ).hash

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    riderId,

    outcome:
      applicationA.outcome,

    event:
      applicationA.event,

    rangeReferences,

    neutralPreparationOutcome,
    preparedOutcome,

    initialStateHash:
      createCanonicalHashedValue(
        initialState,
      ).hash,

    resultingStateHash:
      createCanonicalHashedValue(
        applicationA.state,
      ).hash,

    outcomeHash:
      createCanonicalHashedValue(
        applicationA.outcome,
      ).hash,

    eventHash:
      createCanonicalHashedValue(
        applicationA.event,
      ).hash,

    replayHash,

    replayValidationMessages:
      replayValidation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),

    auditHash:
      createCanonicalHashedValue({
        checks,
        riderId,
        outcome:
          applicationA.outcome,
        event:
          applicationA.event,
        rangeReferences,
        neutralPreparationOutcome,
        preparedOutcome,
        initialStateHash:
          createCanonicalHashedValue(
            initialState,
          ).hash,
        resultingStateHash:
          createCanonicalHashedValue(
            applicationA.state,
          ).hash,
        replayHash,
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

export default function TechnicalIncidentDiagnostic():
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
            Phase 8H.5A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Isolated technical incident and realistic time loss
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Applies one already-selected rider technical incident, calculates
            deterministic type- and severity-specific time loss, applies the
            authoritative preparation time-loss multiplier once, moves the
            rider into a dropped group, emits one authoritative replay event,
            and performs no persistence.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — one isolated deterministic technical incident applies realistic preparation-adjusted time loss'
              : 'FAIL — technical incident outcome or application needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Incident
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Rider"
                value={
                  value.riderId
                }
              />
              <Metric
                label="Type"
                value={
                  value
                    .outcome
                    .technicalType
                }
              />
              <Metric
                label="Severity"
                value={
                  value
                    .outcome
                    .severity
                }
              />
              <Metric
                label="Incident ID"
                value={
                  value
                    .outcome
                    .incidentId
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Time loss
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Base range"
                value={`${value.outcome.minimumBaseTimeLossSeconds}–${value.outcome.maximumBaseTimeLossSeconds}s`}
              />
              <Metric
                label="Base time"
                value={`${value.outcome.baseTimeLossSeconds}s`}
              />
              <Metric
                label="Preparation multiplier"
                value={
                  value
                    .outcome
                    .mechanicalTimeLossMultiplier
                }
              />
              <Metric
                label="Adjusted time"
                value={`${value.outcome.timeLossSeconds}s`}
              />
              <Metric
                label="Response saving"
                value={`${value.outcome.responseSavingsSeconds}s`}
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">
              Physical outcome
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Equipment condition"
                value={`${value.outcome.equipmentConditionPercent}%`}
              />
              <Metric
                label="Affected categories"
                value={
                  value
                    .outcome
                    .affectedEquipmentCategories
                    .join(', ')
                }
              />
              <Metric
                label="Distance loss"
                value={`${value.outcome.distanceLossKm.toFixed(6)} km`}
              />
              <Metric
                label="Target gap"
                value={`${value.outcome.targetGapFromLeaderSeconds}s`}
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
              label="Initial state"
              value={
                value
                  .initialStateHash
              }
            />
            <Metric
              label="Resulting state"
              value={
                value
                  .resultingStateHash
              }
            />
            <Metric
              label="Outcome"
              value={
                value.outcomeHash
              }
            />
            <Metric
              label="Event"
              value={
                value.eventHash
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
            Type and severity ranges
          </h2>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">
                    Type
                  </th>
                  <th className="pb-2">
                    Severity
                  </th>
                  <th className="pb-2">
                    Minimum
                  </th>
                  <th className="pb-2">
                    Maximum
                  </th>
                  <th className="pb-2">
                    Deterministic result
                  </th>
                </tr>
              </thead>
              <tbody>
                {value
                  .rangeReferences
                  .map(
                    (
                      reference,
                    ) => (
                      <tr
                        key={`${reference.technicalType}:${reference.severity}`}
                        className="border-t border-slate-800"
                      >
                        <td className="py-2">
                          {reference
                            .technicalType}
                        </td>
                        <td className="py-2">
                          {reference
                            .severity}
                        </td>
                        <td className="py-2">
                          {reference
                            .minimum}
                          s
                        </td>
                        <td className="py-2">
                          {reference
                            .maximum}
                          s
                        </td>
                        <td className="py-2">
                          {reference
                            .actual}
                          s
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
            Preparation comparison
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <dl className="rounded-2xl border border-slate-800 p-4 text-xs">
              <Metric
                label="Neutral multiplier"
                value={
                  value
                    .neutralPreparationOutcome
                    .mechanicalTimeLossMultiplier
                }
              />
              <Metric
                label="Base"
                value={`${value.neutralPreparationOutcome.baseTimeLossSeconds}s`}
              />
              <Metric
                label="Adjusted"
                value={`${value.neutralPreparationOutcome.timeLossSeconds}s`}
              />
            </dl>

            <dl className="rounded-2xl border border-slate-800 p-4 text-xs">
              <Metric
                label="Prepared multiplier"
                value={
                  value
                    .preparedOutcome
                    .mechanicalTimeLossMultiplier
                }
              />
              <Metric
                label="Base"
                value={`${value.preparedOutcome.baseTimeLossSeconds}s`}
              />
              <Metric
                label="Adjusted"
                value={`${value.preparedOutcome.timeLossSeconds}s`}
              />
            </dl>
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
            This phase does not select technical incidents in the active race
            runner, alter equipment condition, apply equipment damage or wear,
            create a health case, call Supabase, write replay data, change
            official results, or activate production execution.
          </p>
        </section>
      </div>
    </main>
  )
}
