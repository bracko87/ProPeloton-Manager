/**
 * validateSimulationState.ts
 *
 * Structural and logical validation for SimulationState.
 *
 * Responsibilities:
 * - Enforce general invariants on identifiers, timing, and distance.
 * - Validate riders, teams, groups, orders, and events.
 * - Enforce completion rules and pre-/post-completion group membership semantics.
 */

import type { SimulationState } from '../domain/SimulationState'

/**
 * SimulationStateValidationError
 * Error type containing a list of human-readable validation issues.
 */
export class SimulationStateValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      `Invalid simulation state:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    )

    this.name = 'SimulationStateValidationError'
    this.issues = issues
  }
}

/**
 * isNonNegativeInteger
 * Utility to check for non-negative integers.
 */
function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * isPositiveInteger
 * Utility to check for positive integers.
 */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/**
 * isFiniteNumber
 * Utility to check that a value is finite.
 */
function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

/**
 * terminalStageStatuses
 * Set of rider stage statuses that are considered terminal.
 */
const terminalStageStatuses: ReadonlySet<string> = new Set([
  'finished',
  'dnf',
  'dns',
  'otl',
])

const technicalIncidentTypes:
  ReadonlySet<string> = new Set([
    'dropped_chain',
    'puncture',
    'wheel_damage',
    'drivetrain_failure',
    'bike_change',
  ])

const technicalIncidentSeverities:
  ReadonlySet<string> = new Set([
    'minor',
    'moderate',
    'serious',
  ])

const equipmentCategories:
  ReadonlySet<string> = new Set([
    'frame',
    'wheelset',
    'tires',
    'groupset',
    'helmet',
    'shoes',
  ])

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value ===
      'number' &&
    Number.isInteger(
      value,
    ) &&
    value >= minimum &&
    value <= maximum
  )
}

function validateStartingEquipment(
  riderId: string,
  equipment:
    NonNullable<
      SimulationState[
        'riders'
      ][string][
        'startingEquipment'
      ]
    >,
  issues: string[],
): void {
  const prefix =
    `RIDERS: rider ${riderId} startingEquipment`

  if (
    equipment.conditionSource !==
    'race_engine_resolve_stage_rider_equipment_condition_v1'
  ) {
    issues.push(
      `${prefix} has unsupported conditionSource.`,
    )
  }

  if (
    equipment.preparationSource !==
    'race_engine_get_stage_rider_preparation_modifiers_v2'
  ) {
    issues.push(
      `${prefix} has unsupported preparationSource.`,
    )
  }

  if (
    equipment.equipmentSetupId !==
      null &&
    (
      typeof equipment
        .equipmentSetupId !==
        'string' ||
      !equipment
        .equipmentSetupId
        .trim()
    )
  ) {
    issues.push(
      `${prefix}.equipmentSetupId must be null or non-blank.`,
    )
  }

  if (
    !isIntegerInRange(
      equipment
        .selectedComponentCount,
      0,
      6,
    ) ||
    !isIntegerInRange(
      equipment
        .matchedComponentCount,
      0,
      6,
    )
  ) {
    issues.push(
      `${prefix} component counts must be integers between 0 and 6.`,
    )
  } else if (
    equipment
      .matchedComponentCount >
    equipment
      .selectedComponentCount
  ) {
    issues.push(
      `${prefix}.matchedComponentCount may not exceed selectedComponentCount.`,
    )
  }

  const derivedComplete =
    equipment
      .selectedComponentCount >
      0 &&
    equipment
      .matchedComponentCount ===
      equipment
        .selectedComponentCount

  if (
    equipment.completeSource !==
    derivedComplete
  ) {
    issues.push(
      `${prefix}.completeSource does not match component counts.`,
    )
  }

  if (
    equipment
      .minimumConditionPercent !==
      null &&
    (
      !isFiniteNumber(
        equipment
          .minimumConditionPercent,
      ) ||
      equipment
        .minimumConditionPercent <
        0 ||
      equipment
        .minimumConditionPercent >
        100
    )
  ) {
    issues.push(
      `${prefix}.minimumConditionPercent must be null or between 0 and 100.`,
    )
  }

  if (
    !isFiniteNumber(
      equipment
        .effectiveConditionPercent,
    ) ||
    equipment
      .effectiveConditionPercent <
      0 ||
    equipment
      .effectiveConditionPercent >
      100
  ) {
    issues.push(
      `${prefix}.effectiveConditionPercent must be between 0 and 100.`,
    )
  }

  const missingCategories =
    equipment
      .missingComponentCategories

  if (!Array.isArray(missingCategories)) {
    issues.push(
      `${prefix}.missingComponentCategories must be an array.`,
    )
  } else {
    const seen =
      new Set<string>()

    for (
      const category of
      missingCategories
    ) {
      if (
        !equipmentCategories.has(
          category,
        )
      ) {
        issues.push(
          `${prefix}.missingComponentCategories contains unsupported category "${String(category)}".`,
        )
      }

      if (seen.has(category)) {
        issues.push(
          `${prefix}.missingComponentCategories must not contain duplicates.`,
        )
      }

      seen.add(category)
    }
  }

  if (equipment.completeSource) {
    if (
      equipment
        .equipmentSetupId ===
      null
    ) {
      issues.push(
        `${prefix}.completeSource requires equipmentSetupId.`,
      )
    }

    if (
      equipment
        .minimumConditionPercent ===
      null
    ) {
      issues.push(
        `${prefix}.completeSource requires minimumConditionPercent.`,
      )
    }

    if (
      equipment
        .minimumConditionPercent !==
        null &&
      Math.abs(
        equipment
          .effectiveConditionPercent -
        equipment
          .minimumConditionPercent
      ) >
      0.000001
    ) {
      issues.push(
        `${prefix}.effectiveConditionPercent must equal minimumConditionPercent for complete source.`,
      )
    }

    if (
      missingCategories.length >
      0
    ) {
      issues.push(
        `${prefix}.completeSource may not list missing component categories.`,
      )
    }
  } else if (
    equipment
      .effectiveConditionPercent !==
    100
  ) {
    issues.push(
      `${prefix}.incomplete source must use neutral effective condition 100.`,
    )
  }

  if (
    !isFiniteNumber(
      equipment
        .mechanicalIncidentRiskMultiplier,
    ) ||
    equipment
      .mechanicalIncidentRiskMultiplier <
      0.75 ||
    equipment
      .mechanicalIncidentRiskMultiplier >
      1
  ) {
    issues.push(
      `${prefix}.mechanicalIncidentRiskMultiplier must be between 0.75 and 1.`,
    )
  }

  if (
    !isFiniteNumber(
      equipment
        .mechanicalTimeLossMultiplier,
    ) ||
    equipment
      .mechanicalTimeLossMultiplier <
      0.82 ||
    equipment
      .mechanicalTimeLossMultiplier >
      1
  ) {
    issues.push(
      `${prefix}.mechanicalTimeLossMultiplier must be between 0.82 and 1.`,
    )
  }
}

/**
 * validateSimulationState
 * Performs a comprehensive validation of a SimulationState.
 * Collects all issues and throws SimulationStateValidationError if any exist.
 */
export function validateSimulationState(state: SimulationState): void {
  const issues: string[] = []

  // GENERAL
  if (!state.raceId || state.raceId.trim() === '') {
    issues.push('GENERAL: raceId must not be blank.')
  }

  if (!state.stageId || state.stageId.trim() === '') {
    issues.push('GENERAL: stageId must not be blank.')
  }

  if (!state.seed || state.seed.trim() === '') {
    issues.push('GENERAL: seed must not be blank.')
  }

  if (!isNonNegativeInteger(state.raceSecond)) {
    issues.push(
      'GENERAL: raceSecond must be a non-negative integer.',
    )
  }

  if (!isFiniteNumber(state.stageDistanceKm) || state.stageDistanceKm <= 0) {
    issues.push(
      'GENERAL: stageDistanceKm must be a finite number greater than zero.',
    )
  }

  if (
    !isFiniteNumber(state.currentKm) ||
    state.currentKm < 0 ||
    state.currentKm > state.stageDistanceKm
  ) {
    issues.push(
      'GENERAL: currentKm must be finite and between 0 and stageDistanceKm.',
    )
  }

  if (!isPositiveInteger(state.nextEventSequenceNumber)) {
    issues.push(
      'GENERAL: nextEventSequenceNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextBreakawayNumber)) {
    issues.push(
      'GENERAL: nextBreakawayNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextChaseNumber)) {
    issues.push(
      'GENERAL: nextChaseNumber must be a positive integer.',
    )
  }

  if (!isPositiveInteger(state.nextDroppedGroupNumber)) {
    issues.push(
      'GENERAL: nextDroppedGroupNumber must be a positive integer.',
    )
  }

  // Shortcuts
  const riders = state.riders
  const teams = state.teams
  const groups = state.groups
  const orders = state.orders
  const events = state.events

  const riderIds = Object.keys(riders)
  const teamIds = Object.keys(teams)
  const groupIds = Object.keys(groups)
  const orderIds = Object.keys(orders)

  const riderIdSet = new Set(riderIds)
  const teamIdSet = new Set(teamIds)
  const groupIdSet = new Set(groupIds)

  // AUTHORITATIVE SEPARATION PRESSURE
  const separationPressure =
    state
      .separationPressureSecondsByRiderId

  if (
    !separationPressure ||
    typeof separationPressure !==
      'object' ||
    Array.isArray(
      separationPressure,
    )
  ) {
    issues.push(
      'SEPARATION_PRESSURE: separationPressureSecondsByRiderId must be a record.',
    )
  } else {
    const pressureRiderIds =
      Object.keys(
        separationPressure,
      )

    const pressureRiderIdSet =
      new Set(
        pressureRiderIds,
      )

    for (
      const riderId of
      riderIds
    ) {
      if (
        !pressureRiderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: missing pressure entry for rider ${riderId}.`,
        )
      }
    }

    for (
      const riderId of
      pressureRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: pressure record contains unknown riderId "${riderId}".`,
        )
        continue
      }

      const seconds =
        separationPressure[
          riderId
        ]

      if (
        !isNonNegativeInteger(
          seconds,
        )
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} pressure must be a non-negative integer.`,
        )
        continue
      }

      if (
        seconds >
        state.raceSecond
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} pressure may not exceed raceSecond.`,
        )
      }

      const rider =
        riders[
          riderId
        ]

      const group =
        rider
          ? groups[
              rider
                .currentGroupId
            ]
          : null

      if (
        rider &&
        terminalStageStatuses.has(
          rider.stageStatus,
        ) &&
        seconds !== 0
      ) {
        issues.push(
          `SEPARATION_PRESSURE: terminal rider ${riderId} must have zero pressure.`,
        )
      }

      if (
        rider &&
        group &&
        (
          group.groupType ===
            'dropped' ||
          group.groupType ===
            'finished'
        ) &&
        seconds !== 0
      ) {
        issues.push(
          `SEPARATION_PRESSURE: rider ${riderId} in ${group.groupType} group "${group.groupId}" must have zero pressure.`,
        )
      }
    }

    if (
      pressureRiderIds.length !==
      riderIds.length
    ) {
      issues.push(
        `SEPARATION_PRESSURE: pressure entry count ${pressureRiderIds.length} must equal rider count ${riderIds.length}.`,
      )
    }
  }

  // INDIVIDUAL CRASH RUNTIME
  const crashRuntime =
    state.individualCrashRuntime

  if (crashRuntime) {
    if (
      crashRuntime.enabled !==
      true
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: enabled must be true when runtime is present.',
      )
    }

    if (
      !isNonNegativeInteger(
        crashRuntime
          .occurrenceIndex,
      )
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: occurrenceIndex must be a non-negative integer.',
      )
    }

    if (
      !isNonNegativeInteger(
        crashRuntime
          .crashCount,
      )
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: crashCount must be a non-negative integer.',
      )
    }

    if (
      !isPositiveInteger(
        crashRuntime
          .maximumCrashesPerStage,
      )
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: maximumCrashesPerStage must be a positive integer.',
      )
    }

    if (
      crashRuntime.crashCount >
      crashRuntime
        .maximumCrashesPerStage
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: crashCount may not exceed maximumCrashesPerStage.',
      )
    }

    if (
      crashRuntime
        .occurrenceIndex !==
      crashRuntime.crashCount
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: occurrenceIndex must equal crashCount in Phase 8H.2B.',
      )
    }

    if (
      !isPositiveInteger(
        crashRuntime
          .globalCooldownSeconds,
      ) ||
      !isPositiveInteger(
        crashRuntime
          .riderCooldownSeconds,
      )
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: configured cooldowns must be positive integers.',
      )
    }

    if (
      !isNonNegativeInteger(
        crashRuntime
          .globalCooldownSecondsRemaining,
      ) ||
      crashRuntime
        .globalCooldownSecondsRemaining >
      crashRuntime
        .globalCooldownSeconds
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: global cooldown remaining must be within its configured bound.',
      )
    }

    const crashCooldownRiderIds =
      Object.keys(
        crashRuntime
          .cooldownSecondsRemainingByRiderId,
      )

    if (
      crashCooldownRiderIds.length !==
      riderIds.length
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: rider cooldown record must cover every rider exactly once.',
      )
    }

    for (
      const riderId of
      crashCooldownRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `INDIVIDUAL_CRASH_RUNTIME: cooldown record contains unknown riderId "${riderId}".`,
        )
        continue
      }

      const seconds =
        crashRuntime
          .cooldownSecondsRemainingByRiderId[
            riderId
          ]

      if (
        !isNonNegativeInteger(
          seconds,
        ) ||
        seconds >
        crashRuntime
          .riderCooldownSeconds
      ) {
        issues.push(
          `INDIVIDUAL_CRASH_RUNTIME: rider ${riderId} cooldown must be within its configured bound.`,
        )
      }
    }

    const crashedRiderIdSet =
      new Set(
        crashRuntime
          .crashedRiderIds,
      )

    if (
      crashedRiderIdSet.size !==
      crashRuntime
        .crashedRiderIds
        .length
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: crashedRiderIds must not contain duplicates.',
      )
    }

    if (
      crashRuntime
        .crashedRiderIds
        .length !==
      crashRuntime.crashCount
    ) {
      issues.push(
        'INDIVIDUAL_CRASH_RUNTIME: crashed rider count must equal crashCount.',
      )
    }

    for (
      const riderId of
      crashRuntime
        .crashedRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `INDIVIDUAL_CRASH_RUNTIME: crashedRiderIds contains unknown riderId "${riderId}".`,
        )
      }
    }
  }

  // SHARED CRASH INCIDENT RUNTIME
  const sharedCrashRuntime =
    state.crashIncidentRuntime

  if (sharedCrashRuntime) {
    if (
      sharedCrashRuntime.enabled !==
      true
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: enabled must be true when runtime is present.',
      )
    }

    const enabledKindSet =
      new Set(
        sharedCrashRuntime
          .enabledIncidentKinds,
      )

    if (
      enabledKindSet.size ===
        0 ||
      enabledKindSet.size !==
        sharedCrashRuntime
          .enabledIncidentKinds
          .length
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: enabledIncidentKinds must be non-empty and unique.',
      )
    }

    for (
      const incidentKind of
      sharedCrashRuntime
        .enabledIncidentKinds
    ) {
      if (
        incidentKind !==
          'individual_crash' &&
        incidentKind !==
          'group_crash'
      ) {
        issues.push(
          `CRASH_INCIDENT_RUNTIME: unsupported incident kind "${String(incidentKind)}".`,
        )
      }
    }

    if (
      !isNonNegativeInteger(
        sharedCrashRuntime
          .occurrenceIndex,
      ) ||
      !isNonNegativeInteger(
        sharedCrashRuntime
          .incidentCount,
      ) ||
      sharedCrashRuntime
        .occurrenceIndex !==
        sharedCrashRuntime
          .incidentCount
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: occurrenceIndex and incidentCount must be equal non-negative integers.',
      )
    }

    if (
      !isNonNegativeInteger(
        sharedCrashRuntime
          .individualCrashCount,
      ) ||
      !isNonNegativeInteger(
        sharedCrashRuntime
          .groupCrashCount,
      ) ||
      sharedCrashRuntime
        .individualCrashCount +
        sharedCrashRuntime
          .groupCrashCount !==
        sharedCrashRuntime
          .incidentCount
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: kind counts must be non-negative and sum to incidentCount.',
      )
    }

    if (
      !isPositiveInteger(
        sharedCrashRuntime
          .maximumIncidentsPerStage,
      ) ||
      sharedCrashRuntime
        .incidentCount >
        sharedCrashRuntime
          .maximumIncidentsPerStage
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: incident count must stay within the positive stage maximum.',
      )
    }

    if (
      !isPositiveInteger(
        sharedCrashRuntime
          .globalCooldownSeconds,
      ) ||
      !isPositiveInteger(
        sharedCrashRuntime
          .riderCooldownSeconds,
      )
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: configured cooldowns must be positive integers.',
      )
    }

    if (
      !isNonNegativeInteger(
        sharedCrashRuntime
          .globalCooldownSecondsRemaining,
      ) ||
      sharedCrashRuntime
        .globalCooldownSecondsRemaining >
        sharedCrashRuntime
          .globalCooldownSeconds
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: global cooldown remaining is outside its configured bound.',
      )
    }

    const sharedCooldownRiderIds =
      Object.keys(
        sharedCrashRuntime
          .cooldownSecondsRemainingByRiderId,
      )

    if (
      sharedCooldownRiderIds.length !==
      riderIds.length
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: rider cooldown record must cover every rider exactly once.',
      )
    }

    for (
      const riderId of
      sharedCooldownRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `CRASH_INCIDENT_RUNTIME: cooldown record contains unknown riderId "${riderId}".`,
        )
        continue
      }

      const seconds =
        sharedCrashRuntime
          .cooldownSecondsRemainingByRiderId[
            riderId
          ]

      if (
        !isNonNegativeInteger(
          seconds,
        ) ||
        seconds >
        sharedCrashRuntime
          .riderCooldownSeconds
      ) {
        issues.push(
          `CRASH_INCIDENT_RUNTIME: rider ${riderId} cooldown is outside its configured bound.`,
        )
      }
    }

    const affectedRiderIdSet =
      new Set(
        sharedCrashRuntime
          .affectedRiderIds,
      )

    if (
      affectedRiderIdSet.size !==
      sharedCrashRuntime
        .affectedRiderIds
        .length
    ) {
      issues.push(
        'CRASH_INCIDENT_RUNTIME: affectedRiderIds must not contain duplicates.',
      )
    }

    for (
      const riderId of
      sharedCrashRuntime
        .affectedRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `CRASH_INCIDENT_RUNTIME: affectedRiderIds contains unknown riderId "${riderId}".`,
        )
      }
    }
  }

  // SHARED CRASH / TECHNICAL INCIDENT RUNTIME
  const sharedRaceRuntime =
    state.raceIncidentRuntime

  if (sharedRaceRuntime) {
    if (
      sharedRaceRuntime.enabled !==
      true
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: enabled must be true when runtime is present.',
      )
    }

    const enabledKindSet =
      new Set(
        sharedRaceRuntime
          .enabledIncidentKinds,
      )

    if (
      enabledKindSet.size ===
        0 ||
      enabledKindSet.size !==
        sharedRaceRuntime
          .enabledIncidentKinds
          .length
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: enabledIncidentKinds must be non-empty and unique.',
      )
    }

    for (
      const incidentKind of
      sharedRaceRuntime
        .enabledIncidentKinds
    ) {
      if (
        incidentKind !==
          'individual_crash' &&
        incidentKind !==
          'group_crash' &&
        incidentKind !==
          'technical_incident'
      ) {
        issues.push(
          `RACE_INCIDENT_RUNTIME: unsupported incident kind "${String(incidentKind)}".`,
        )
      }
    }

    if (
      !isNonNegativeInteger(
        sharedRaceRuntime
          .occurrenceIndex,
      ) ||
      !isNonNegativeInteger(
        sharedRaceRuntime
          .incidentCount,
      ) ||
      sharedRaceRuntime
        .occurrenceIndex !==
        sharedRaceRuntime
          .incidentCount
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: occurrenceIndex and incidentCount must be equal non-negative integers.',
      )
    }

    if (
      !isNonNegativeInteger(
        sharedRaceRuntime
          .individualCrashCount,
      ) ||
      !isNonNegativeInteger(
        sharedRaceRuntime
          .groupCrashCount,
      ) ||
      !isNonNegativeInteger(
        sharedRaceRuntime
          .technicalIncidentCount,
      ) ||
      sharedRaceRuntime
        .individualCrashCount +
        sharedRaceRuntime
          .groupCrashCount +
        sharedRaceRuntime
          .technicalIncidentCount !==
        sharedRaceRuntime
          .incidentCount
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: kind counts must be non-negative and sum to incidentCount.',
      )
    }

    if (
      !isPositiveInteger(
        sharedRaceRuntime
          .maximumIncidentsPerStage,
      ) ||
      sharedRaceRuntime
        .incidentCount >
        sharedRaceRuntime
          .maximumIncidentsPerStage
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: incident count must stay within the positive stage maximum.',
      )
    }

    if (
      !isPositiveInteger(
        sharedRaceRuntime
          .globalCooldownSeconds,
      ) ||
      !isPositiveInteger(
        sharedRaceRuntime
          .riderCooldownSeconds,
      )
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: configured cooldowns must be positive integers.',
      )
    }

    if (
      !isNonNegativeInteger(
        sharedRaceRuntime
          .globalCooldownSecondsRemaining,
      ) ||
      sharedRaceRuntime
        .globalCooldownSecondsRemaining >
        sharedRaceRuntime
          .globalCooldownSeconds
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: global cooldown remaining is outside its configured bound.',
      )
    }

    const cooldownRiderIds =
      Object.keys(
        sharedRaceRuntime
          .cooldownSecondsRemainingByRiderId,
      )

    if (
      cooldownRiderIds.length !==
      riderIds.length
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: rider cooldown record must cover every rider exactly once.',
      )
    }

    for (const riderId of cooldownRiderIds) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `RACE_INCIDENT_RUNTIME: cooldown record contains unknown riderId "${riderId}".`,
        )
        continue
      }

      const seconds =
        sharedRaceRuntime
          .cooldownSecondsRemainingByRiderId[
            riderId
          ]

      if (
        !isNonNegativeInteger(
          seconds,
        ) ||
        seconds >
        sharedRaceRuntime
          .riderCooldownSeconds
      ) {
        issues.push(
          `RACE_INCIDENT_RUNTIME: rider ${riderId} cooldown is outside its configured bound.`,
        )
      }
    }

    const affectedRiderIdSet =
      new Set(
        sharedRaceRuntime
          .affectedRiderIds,
      )

    if (
      affectedRiderIdSet.size !==
      sharedRaceRuntime
        .affectedRiderIds
        .length
    ) {
      issues.push(
        'RACE_INCIDENT_RUNTIME: affectedRiderIds must not contain duplicates.',
      )
    }

    for (
      const riderId of
      sharedRaceRuntime
        .affectedRiderIds
    ) {
      if (
        !riderIdSet.has(
          riderId,
        )
      ) {
        issues.push(
          `RACE_INCIDENT_RUNTIME: affectedRiderIds contains unknown riderId "${riderId}".`,
        )
      }
    }
  }

  // RIDERS
  if (riderIds.length < 2) {
    issues.push('RIDERS: at least two riders must exist.')
  }

  const riderTeamMembershipCount = new Map<string, number>()
  const nonTerminalRiderIds = new Set<string>()

  for (const [recordKey, rider] of Object.entries(riders)) {
    if (recordKey !== rider.riderId) {
      issues.push(
        `RIDERS: rider record key "${recordKey}" does not match rider.riderId "${rider.riderId}".`,
      )
    }

    if (!teamIdSet.has(rider.teamId)) {
      issues.push(
        `RIDERS: rider ${rider.riderId} references missing teamId "${rider.teamId}".`,
      )
    }

    const isTerminal =
      terminalStageStatuses.has(
        rider.stageStatus,
      )

    const group =
      groups[
        rider.currentGroupId
      ]

    if (!group) {
      issues.push(
        `RIDERS: rider ${rider.riderId} references missing currentGroupId "${rider.currentGroupId}".`,
      )
    } else if (
      !group.active &&
      !state.completed &&
      !isTerminal
    ) {
      issues.push(
        `RIDERS: non-terminal rider ${rider.riderId} references inactive group "${rider.currentGroupId}" before completion.`,
      )
    }

    if (
      !isFiniteNumber(rider.distanceKm) ||
      rider.distanceKm < 0 ||
      rider.distanceKm > state.stageDistanceKm
    ) {
      issues.push(
        `RIDERS: rider ${rider.riderId} distanceKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (!isFiniteNumber(rider.speedKmh) || rider.speedKmh < 0) {
      issues.push(
        `RIDERS: rider ${rider.riderId} speedKmh must be finite and not negative.`,
      )
    }

    if (
      !isFiniteNumber(rider.energy) ||
      rider.energy < 0 ||
      rider.energy > 100
    ) {
      issues.push(
        `RIDERS: rider ${rider.riderId} energy must be finite and between 0 and 100.`,
      )
    }

    if (
      rider.startingEquipment !==
      undefined
    ) {
      validateStartingEquipment(
        rider.riderId,
        rider.startingEquipment,
        issues,
      )
    }

    if (
      rider.runtimeFatigue !==
        undefined &&
      (
        !isFiniteNumber(
          rider.runtimeFatigue,
        ) ||
        rider.runtimeFatigue < 0 ||
        rider.runtimeFatigue > 100
      )
    ) {
      issues.push(
        `RIDERS: rider ${rider.riderId} runtimeFatigue must be finite and between 0 and 100 when present.`,
      )
    }

    if (!isNonNegativeInteger(rider.attackAttempts)) {
      issues.push(
        `RIDERS: rider ${rider.riderId} attackAttempts must be a non-negative integer.`,
      )
    }

    if (!isTerminal) {
      nonTerminalRiderIds.add(
        rider.riderId,
      )
    }

    // Finished flag and status consistency.
    if (rider.finished && rider.stageStatus !== 'finished') {
      issues.push(
        `RIDERS: rider ${rider.riderId} finished=true requires stageStatus "finished".`,
      )
    }

    if (rider.stageStatus === 'finished' && !rider.finished) {
      issues.push(
        `RIDERS: rider ${rider.riderId} stageStatus "finished" requires finished=true.`,
      )
    }

    if (rider.stageStatus === 'finished') {
      if (
        typeof rider.finishPosition !== 'number' ||
        rider.finishPosition <= 0
      ) {
        issues.push(
          `RIDERS: finished rider ${rider.riderId} must have a positive finishPosition.`,
        )
      }

      if (
        typeof rider.finishTimeSeconds !== 'number' ||
        rider.finishTimeSeconds < 0
      ) {
        issues.push(
          `RIDERS: finished rider ${rider.riderId} must have non-negative finishTimeSeconds.`,
        )
      }
    } else {
      if (rider.finishPosition !== null) {
        issues.push(
          `RIDERS: unfinished rider ${rider.riderId} must have finishPosition = null.`,
        )
      }
      if (rider.finishTimeSeconds !== null) {
        issues.push(
          `RIDERS: unfinished rider ${rider.riderId} must have finishTimeSeconds = null.`,
        )
      }
    }

    // Note: team membership counts are accumulated from teams (not from riders).
  }

  // TEAMS
  if (teamIds.length < 2) {
    issues.push('TEAMS: at least two teams must exist.')
  }

  const orderIdSet = new Set(orderIds)

  for (const [teamKey, team] of Object.entries(teams)) {
    if (teamKey !== team.teamId) {
      issues.push(
        `TEAMS: team record key "${teamKey}" does not match team.teamId "${team.teamId}".`,
      )
    }

    if (!Array.isArray(team.riderIds) || team.riderIds.length === 0) {
      issues.push(
        `TEAMS: team ${team.teamId} must have at least one rider.`,
      )
    }

    // Captain must exist and belong to the team.
    const captain = riders[team.captainRiderId]
    if (!captain) {
      issues.push(
        `TEAMS: team ${team.teamId} has captainRiderId "${team.captainRiderId}" that does not exist.`,
      )
    } else if (captain.teamId !== team.teamId) {
      issues.push(
        `TEAMS: captain ${captain.riderId} for team ${team.teamId} does not belong to that team.`,
      )
    }

    // Every riderId in team.riderIds exists and belongs to that team.
    const seenTeamRiderIds = new Set<string>()
    for (const riderId of team.riderIds) {
      // Increment membership count even when rider not found so we can detect duplicates and multi-team listing.
      riderTeamMembershipCount.set(
        riderId,
        (riderTeamMembershipCount.get(riderId) ?? 0) + 1,
      )

      if (seenTeamRiderIds.has(riderId)) {
        issues.push(
          `TEAMS: team ${team.teamId} contains duplicate riderId "${riderId}".`,
        )
      } else {
        seenTeamRiderIds.add(riderId)
      }

      const rider = riders[riderId]
      if (!rider) {
        issues.push(
          `TEAMS: team ${team.teamId} lists non-existent riderId "${riderId}".`,
        )
        continue
      }
      if (rider.teamId !== team.teamId) {
        issues.push(
          `TEAMS: rider ${rider.riderId} is listed for team ${team.teamId} but has teamId "${rider.teamId}".`,
        )
      }
    }

    // Validate order lists.
    const activeOrderSet = new Set(team.activeOrderIds)

    for (const orderId of team.activeOrderIds) {
      const order = orders[orderId]
      if (!order) {
        issues.push(
          `TEAMS: team ${team.teamId} references missing activeOrderId "${orderId}".`,
        )
        continue
      }
      if (order.teamId !== team.teamId) {
        issues.push(
          `TEAMS: active order ${orderId} does not belong to team ${team.teamId}.`,
        )
      }
    }

    for (const orderId of team.completedOrderIds) {
      const order = orders[orderId]
      if (!order) {
        issues.push(
          `TEAMS: team ${team.teamId} references missing completedOrderId "${orderId}".`,
        )
        continue
      }
      if (order.teamId !== team.teamId) {
        issues.push(
          `TEAMS: completed order ${orderId} does not belong to team ${team.teamId}.`,
        )
      }
      if (activeOrderSet.has(orderId)) {
        issues.push(
          `TEAMS: order ${orderId} appears in both activeOrderIds and completedOrderIds for team ${team.teamId}.`,
        )
      }
    }
  }

  // Every rider must appear in exactly one team.riderIds list.
  // (We counted memberships via riderTeamMembershipCount.)
  for (const riderId of riderIds) {
    const count = riderTeamMembershipCount.get(riderId) ?? 0
    if (count === 0) {
      issues.push(
        `TEAMS: rider ${riderId} does not appear in any team.riderIds list.`,
      )
    } else if (count > 1) {
      issues.push(
        `TEAMS: rider ${riderId} appears in multiple team.riderIds lists.`,
      )
    }
  }

  // GROUPS
  if (groupIds.length === 0) {
    issues.push('GROUPS: at least one group must exist.')
  }

  const riderToGroups = new Map<string, string[]>()
  const activeGroupIds: string[] = []

  for (const [groupKey, group] of Object.entries(groups)) {
    if (groupKey !== group.groupId) {
      issues.push(
        `GROUPS: group record key "${groupKey}" does not match group.groupId "${group.groupId}".`,
      )
    }

    if (
      !isFiniteNumber(group.distanceKm) ||
      group.distanceKm < 0 ||
      group.distanceKm > state.stageDistanceKm
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} distanceKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (!isFiniteNumber(group.speedKmh) || group.speedKmh < 0) {
      issues.push(
        `GROUPS: group ${group.groupId} speedKmh must be finite and not negative.`,
      )
    }

    if (
      !isFiniteNumber(group.gapFromLeaderSeconds) ||
      group.gapFromLeaderSeconds < 0
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} gapFromLeaderSeconds must be finite and non-negative.`,
      )
    }

    if (!isNonNegativeInteger(group.createdAtRaceSecond)) {
      issues.push(
        `GROUPS: group ${group.groupId} createdAtRaceSecond must be a non-negative integer.`,
      )
    }

    if (
      !isFiniteNumber(group.createdAtKm) ||
      group.createdAtKm < 0 ||
      group.createdAtKm > state.stageDistanceKm
    ) {
      issues.push(
        `GROUPS: group ${group.groupId} createdAtKm must be finite and between 0 and stageDistanceKm.`,
      )
    }

    if (group.active) {
      activeGroupIds.push(group.groupId)
      if (!Array.isArray(group.riderIds) || group.riderIds.length === 0) {
        issues.push(
          `GROUPS: active group ${group.groupId} must contain at least one rider.`,
        )
      }
    }

    const seenGroupRiders = new Set<string>()
    for (const riderId of group.riderIds) {
      if (!riderIdSet.has(riderId)) {
        issues.push(
          `GROUPS: group ${group.groupId} references non-existent riderId "${riderId}".`,
        )
        continue
      }

      if (seenGroupRiders.has(riderId)) {
        issues.push(
          `GROUPS: group ${group.groupId} contains duplicate riderId "${riderId}".`,
        )
      } else {
        seenGroupRiders.add(riderId)
      }

      const list = riderToGroups.get(riderId)
      if (list) {
        list.push(group.groupId)
      } else {
        riderToGroups.set(riderId, [group.groupId])
      }
    }
  }

  // Pre-completion: at least one active group must exist.
  if (!state.completed && activeGroupIds.length === 0) {
    issues.push('GROUPS: at least one active group must exist before completion.')
  }

  // Every rider must belong to at least one group; and never more than one.
  for (const riderId of riderIds) {
    const membership = riderToGroups.get(riderId) ?? []
    if (membership.length === 0) {
      issues.push(
        `GROUPS: rider ${riderId} does not belong to any group.`,
      )
    } else if (membership.length > 1) {
      issues.push(
        `GROUPS: rider ${riderId} appears in multiple groups: [${membership.join(', ')}].`,
      )
    }
  }

  // RIDER/GROUP cross-checks conditioned on completion.
  for (const rider of Object.values(riders)) {
    const membership = riderToGroups.get(rider.riderId) ?? []
    const currentGroup = groups[rider.currentGroupId]

    if (!currentGroup) {
      // Already recorded above; skip further checks here.
      continue
    }

    if (!membership.includes(currentGroup.groupId)) {
      issues.push(
        `GROUPS: rider ${rider.riderId} currentGroupId "${currentGroup.groupId}" does not match their group membership.`,
      )
    }

    if (
      !state.completed &&
      !terminalStageStatuses.has(
        rider.stageStatus,
      )
    ) {
      // Before completion, every non-terminal rider must be in an active group.
      if (!currentGroup.active) {
        issues.push(
          `GROUPS: non-terminal rider ${rider.riderId} is assigned to inactive group "${currentGroup.groupId}" before completion.`,
        )
      }
    }
  }

  if (state.completed) {
    // After completion:
    // - Every rider.currentGroupId must reference an existing group (already checked).
    // - No rider may appear in more than one group (already enforced above).
    // - Active groups may exist only if they contain at least one non-terminal rider.
    for (const groupId of activeGroupIds) {
      const group = groups[groupId]
      const hasNonTerminal = group.riderIds.some((riderId) =>
        nonTerminalRiderIds.has(riderId),
      )
      if (!hasNonTerminal) {
        issues.push(
          `GROUPS: active group ${group.groupId} has no non-terminal riders in completed simulation.`,
        )
      }
    }
  }

  // ORDERS
  for (const [orderKey, order] of Object.entries(orders)) {
    if (orderKey !== order.orderId) {
      issues.push(
        `ORDERS: order record key "${orderKey}" does not match order.orderId "${order.orderId}".`,
      )
    }

    if (!teamIdSet.has(order.teamId)) {
      issues.push(
        `ORDERS: order ${order.orderId} references missing teamId "${order.teamId}".`,
      )
    }

    if (!riderIdSet.has(order.riderId)) {
      issues.push(
        `ORDERS: order ${order.orderId} references missing riderId "${order.riderId}".`,
      )
    } else {
      const rider = riders[order.riderId]
      if (rider.teamId !== order.teamId) {
        issues.push(
          `ORDERS: order ${order.orderId} rider ${order.riderId} does not belong to team ${order.teamId}.`,
        )
      }
    }

    if (
      !isFiniteNumber(order.eligibleFromKm) ||
      order.eligibleFromKm < 0 ||
      order.eligibleFromKm > state.stageDistanceKm
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleFromKm must be within stage bounds.`,
      )
    }

    if (
      !isFiniteNumber(order.eligibleUntilKm) ||
      order.eligibleUntilKm < 0 ||
      order.eligibleUntilKm > state.stageDistanceKm
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleUntilKm must be within stage bounds.`,
      )
    }

    if (order.eligibleUntilKm < order.eligibleFromKm) {
      issues.push(
        `ORDERS: order ${order.orderId} eligibleUntilKm cannot be lower than eligibleFromKm.`,
      )
    }

    if (!isFiniteNumber(order.priority) || order.priority < 0) {
      issues.push(
        `ORDERS: order ${order.orderId} priority must be finite and non-negative.`,
      )
    }

    if (
      order.maximumFollowers !== null &&
      (!isNonNegativeInteger(order.maximumFollowers))
    ) {
      issues.push(
        `ORDERS: order ${order.orderId} maximumFollowers must be null or a non-negative integer.`,
      )
    }
  }

  // EVENTS
  if (events.length > 0) {
    const firstSequence = events[0].sequenceNumber
    if (firstSequence !== 1) {
      issues.push(
        'EVENTS: event sequence numbers must start at 1.',
      )
    }

    for (let i = 0; i < events.length; i += 1) {
      const expected = i + 1
      const actual = events[i].sequenceNumber
      if (actual !== expected) {
        issues.push(
          `EVENTS: event sequence numbers must be contiguous starting at 1 (expected ${expected}, got ${actual}).`,
        )
      }
    }
  }

  if (state.nextEventSequenceNumber !== events.length + 1) {
    issues.push(
      'EVENTS: nextEventSequenceNumber must equal events.length + 1.',
    )
  }

  let simulationStartedCount = 0
  const orderLoadedCounts = new Map<string, number>()

  for (const event of events) {
    if (!isNonNegativeInteger(event.raceSecond)) {
      issues.push(
        `EVENTS: event ${event.sequenceNumber} raceSecond must be a non-negative integer.`,
      )
    }

    if (
      !isFiniteNumber(event.kmMarker) ||
      event.kmMarker < 0 ||
      event.kmMarker > state.stageDistanceKm
    ) {
      issues.push(
        `EVENTS: event ${event.sequenceNumber} kmMarker must be finite and within stage bounds.`,
      )
    }

    if (event.actorRiderId !== null) {
      if (!riderIdSet.has(event.actorRiderId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing actorRiderId "${event.actorRiderId}".`,
        )
      }
    }

    if (event.teamId !== null) {
      if (!teamIdSet.has(event.teamId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing teamId "${event.teamId}".`,
        )
      }
    }

    if (event.sourceGroupId !== null) {
      if (!groupIdSet.has(event.sourceGroupId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing sourceGroupId "${event.sourceGroupId}".`,
        )
      }
    }

    if (event.targetGroupId !== null) {
      if (!groupIdSet.has(event.targetGroupId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} references missing targetGroupId "${event.targetGroupId}".`,
        )
      }
    }

    for (const riderId of event.relatedRiderIds) {
      if (!riderIdSet.has(riderId)) {
        issues.push(
          `EVENTS: event ${event.sequenceNumber} relatedRiderIds contains missing riderId "${riderId}".`,
        )
      }
    }

    if (
      event.eventType ===
      'RIDER_CRASHED'
    ) {
      if (
        event.actorRiderId ===
        null
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires actorRiderId.`,
        )
      }

      if (
        event.sourceGroupId ===
          null ||
        event.targetGroupId ===
          null
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires sourceGroupId and targetGroupId.`,
        )
      }

      if (
        event.actorRiderId !==
          null &&
        (
          event
            .relatedRiderIds
            .length !==
            1 ||
          event
            .relatedRiderIds[0] !==
            event.actorRiderId
        )
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} must relate exactly its actor rider.`,
        )
      }

      const crashPayload =
        event.payload as
          Readonly<
            Record<
              string,
              unknown
            >
          >

      if (
        crashPayload
          .incidentKind !==
        'individual_crash'
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires incidentKind "individual_crash".`,
        )
      }

      if (
        crashPayload.severity !==
          'minor' &&
        crashPayload.severity !==
          'moderate' &&
        crashPayload.severity !==
          'serious'
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} has invalid severity.`,
        )
      }

      if (
        typeof crashPayload
          .incidentId !==
          'string' ||
        !crashPayload
          .incidentId
          .trim()
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires a non-empty incidentId.`,
        )
      }

      if (
        typeof crashPayload
          .timeLossSeconds !==
          'number' ||
        !isFiniteNumber(
          crashPayload
            .timeLossSeconds,
        ) ||
        crashPayload
          .timeLossSeconds <=
          0
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires positive finite timeLossSeconds.`,
        )
      }

      if (
        typeof crashPayload
          .distanceLossKm !==
          'number' ||
        !isFiniteNumber(
          crashPayload
            .distanceLossKm,
        ) ||
        crashPayload
          .distanceLossKm <
          0
      ) {
        issues.push(
          `EVENTS: RIDER_CRASHED event ${event.sequenceNumber} requires non-negative finite distanceLossKm.`,
        )
      }
    }

    if (
      event.eventType ===
      'GROUP_CRASHED'
    ) {
      if (
        event.actorRiderId !==
        null
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} must have actorRiderId = null.`,
        )
      }

      if (
        event.teamId !==
        null
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} must have teamId = null.`,
        )
      }

      if (
        event.sourceGroupId ===
          null ||
        event.targetGroupId ===
          null
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} requires sourceGroupId and targetGroupId.`,
        )
      } else if (
        event.sourceGroupId ===
        event.targetGroupId
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} source and target groups must differ.`,
        )
      }

      const relatedRiderIdSet =
        new Set(
          event
            .relatedRiderIds,
        )

      if (
        event
          .relatedRiderIds
          .length <
        2
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} must relate at least two riders.`,
        )
      }

      if (
        relatedRiderIdSet.size !==
        event
          .relatedRiderIds
          .length
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} relatedRiderIds must not contain duplicates.`,
        )
      }

      const crashPayload =
        event.payload as
          Readonly<
            Record<
              string,
              unknown
            >
          >

      if (
        crashPayload
          .incidentKind !==
        'group_crash'
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} requires incidentKind "group_crash".`,
        )
      }

      if (
        crashPayload.severity !==
          'minor' &&
        crashPayload.severity !==
          'moderate' &&
        crashPayload.severity !==
          'serious'
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} has invalid severity.`,
        )
      }

      if (
        typeof crashPayload
          .incidentId !==
          'string' ||
        !crashPayload
          .incidentId
          .trim()
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} requires a non-empty incidentId.`,
        )
      }

      if (
        typeof crashPayload
          .affectedRiderCount !==
          'number' ||
        !Number.isInteger(
          crashPayload
            .affectedRiderCount,
        ) ||
        crashPayload
          .affectedRiderCount !==
          event
            .relatedRiderIds
            .length
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} affectedRiderCount must equal relatedRiderIds length.`,
        )
      }

      const payloadAffectedRiderIds =
        crashPayload
          .affectedRiderIds

      if (
        !Array.isArray(
          payloadAffectedRiderIds,
        ) ||
        payloadAffectedRiderIds
          .length !==
          event
            .relatedRiderIds
            .length ||
        payloadAffectedRiderIds
          .some(
            (
              riderId,
              index,
            ) =>
              riderId !==
              event
                .relatedRiderIds[
                  index
                ],
          )
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} affectedRiderIds must exactly match relatedRiderIds.`,
        )
      }

      if (
        typeof crashPayload
          .timeLossSeconds !==
          'number' ||
        !isFiniteNumber(
          crashPayload
            .timeLossSeconds,
        ) ||
        crashPayload
          .timeLossSeconds <=
          0
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} requires positive finite timeLossSeconds.`,
        )
      }

      if (
        typeof crashPayload
          .distanceLossKm !==
          'number' ||
        !isFiniteNumber(
          crashPayload
            .distanceLossKm,
        ) ||
        crashPayload
          .distanceLossKm <
          0
      ) {
        issues.push(
          `EVENTS: GROUP_CRASHED event ${event.sequenceNumber} requires non-negative finite distanceLossKm.`,
        )
      }
    }

    if (
      event.eventType ===
      'RIDER_TECHNICAL_INCIDENT'
    ) {
      if (
        event.actorRiderId ===
        null
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires actorRiderId.`,
        )
      }

      if (
        event.teamId ===
        null
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires teamId.`,
        )
      }

      if (
        event.actorRiderId !==
          null &&
        event.teamId !==
          null &&
        riders[
          event.actorRiderId
        ] &&
        riders[
          event.actorRiderId
        ]!.teamId !==
          event.teamId
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} teamId must match the actor rider team.`,
        )
      }

      if (
        event.sourceGroupId ===
          null ||
        event.targetGroupId ===
          null
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires sourceGroupId and targetGroupId.`,
        )
      } else if (
        event.sourceGroupId ===
        event.targetGroupId
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} source and target groups must differ.`,
        )
      }

      if (
        event.actorRiderId !==
          null &&
        (
          event
            .relatedRiderIds
            .length !==
            1 ||
          event
            .relatedRiderIds[0] !==
            event.actorRiderId
        )
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} must relate exactly its actor rider.`,
        )
      }

      const technicalPayload =
        event.payload as
          Readonly<
            Record<
              string,
              unknown
            >
          >

      if (
        technicalPayload
          .incidentKind !==
        'technical_incident'
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires incidentKind "technical_incident".`,
        )
      }

      if (
        typeof technicalPayload
          .technicalType !==
          'string' ||
        !technicalIncidentTypes.has(
          technicalPayload
            .technicalType,
        )
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} has invalid technicalType.`,
        )
      }

      if (
        typeof technicalPayload
          .severity !==
          'string' ||
        !technicalIncidentSeverities.has(
          technicalPayload
            .severity,
        )
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} has invalid severity.`,
        )
      }

      if (
        typeof technicalPayload
          .incidentId !==
          'string' ||
        !technicalPayload
          .incidentId
          .trim()
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires a non-empty incidentId.`,
        )
      }

      if (
        technicalPayload
          .timeLossModelVersion !==
        'technical_incident_time_loss_v1'
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} has invalid timeLossModelVersion.`,
        )
      }

      if (
        typeof technicalPayload
          .equipmentConditionPercent !==
          'number' ||
        !isFiniteNumber(
          technicalPayload
            .equipmentConditionPercent,
        ) ||
        technicalPayload
          .equipmentConditionPercent <
          0 ||
        technicalPayload
          .equipmentConditionPercent >
          100
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires equipmentConditionPercent between 0 and 100.`,
        )
      }

      if (
        technicalPayload
          .equipmentConditionAppliedToTimeLoss !==
        false
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} must not apply equipment condition a second time to time loss.`,
        )
      }

      if (
        typeof technicalPayload
          .mechanicalTimeLossMultiplier !==
          'number' ||
        !isFiniteNumber(
          technicalPayload
            .mechanicalTimeLossMultiplier,
        ) ||
        technicalPayload
          .mechanicalTimeLossMultiplier <
          0.82 ||
        technicalPayload
          .mechanicalTimeLossMultiplier >
          1
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires mechanicalTimeLossMultiplier between 0.82 and 1.`,
        )
      }

      const rawBaseTimeLoss =
        technicalPayload
          .baseTimeLossSeconds

      if (
        typeof rawBaseTimeLoss !==
          'number' ||
        !Number.isInteger(
          rawBaseTimeLoss,
        ) ||
        rawBaseTimeLoss <=
          0
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires positive integer baseTimeLossSeconds.`,
        )
      }

      const rawTimeLoss =
        technicalPayload
          .timeLossSeconds

      if (
        typeof rawTimeLoss !==
          'number' ||
        !Number.isInteger(
          rawTimeLoss,
        ) ||
        rawTimeLoss <=
          0
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires positive integer timeLossSeconds.`,
        )
      }

      const rawMultiplier =
        technicalPayload
          .mechanicalTimeLossMultiplier

      if (
        typeof rawBaseTimeLoss ===
          'number' &&
        Number.isInteger(
          rawBaseTimeLoss,
        ) &&
        rawBaseTimeLoss >
          0 &&
        typeof rawMultiplier ===
          'number' &&
        isFiniteNumber(
          rawMultiplier,
        ) &&
        rawMultiplier >=
          0.82 &&
        rawMultiplier <=
          1 &&
        typeof rawTimeLoss ===
          'number' &&
        Number.isInteger(
          rawTimeLoss,
        ) &&
        rawTimeLoss !==
          Math.max(
            1,
            Math.round(
              rawBaseTimeLoss *
                rawMultiplier,
            ),
          )
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} timeLossSeconds must equal rounded base time multiplied by mechanicalTimeLossMultiplier.`,
        )
      }

      if (
        typeof technicalPayload
          .responseSavingsSeconds !==
          'number' ||
        !Number.isInteger(
          technicalPayload
            .responseSavingsSeconds,
        ) ||
        (
          typeof rawBaseTimeLoss ===
            'number' &&
          typeof rawTimeLoss ===
            'number' &&
          technicalPayload
            .responseSavingsSeconds !==
            rawBaseTimeLoss -
              rawTimeLoss
        )
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} responseSavingsSeconds must equal baseTimeLossSeconds minus timeLossSeconds.`,
        )
      }

      const affectedCategories =
        technicalPayload
          .affectedEquipmentCategories

      if (
        !Array.isArray(
          affectedCategories,
        ) ||
        affectedCategories.length ===
          0
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires affectedEquipmentCategories.`,
        )
      } else {
        const categorySet =
          new Set<string>()

        for (
          const category of
          affectedCategories
        ) {
          if (
            typeof category !==
              'string' ||
            !equipmentCategories.has(
              category,
            )
          ) {
            issues.push(
              `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} contains unsupported equipment category "${String(category)}".`,
            )
          }

          if (
            typeof category ===
              'string' &&
            categorySet.has(
              category,
            )
          ) {
            issues.push(
              `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} affectedEquipmentCategories must not contain duplicates.`,
            )
          }

          if (
            typeof category ===
            'string'
          ) {
            categorySet.add(
              category,
            )
          }
        }
      }

      const rawDistanceLoss =
        technicalPayload
          .distanceLossKm

      if (
        typeof rawDistanceLoss !==
          'number' ||
        !isFiniteNumber(
          rawDistanceLoss,
        ) ||
        rawDistanceLoss <
          0
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} requires non-negative finite distanceLossKm.`,
        )
      }

      const rawSourceDistance =
        technicalPayload
          .sourceDistanceKm

      const rawTargetDistance =
        technicalPayload
          .targetDistanceKm

      if (
        typeof rawSourceDistance !==
          'number' ||
        !isFiniteNumber(
          rawSourceDistance,
        ) ||
        rawSourceDistance <
          0 ||
        typeof rawTargetDistance !==
          'number' ||
        !isFiniteNumber(
          rawTargetDistance,
        ) ||
        rawTargetDistance <
          0 ||
        rawTargetDistance >
          rawSourceDistance
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} has invalid source or target distance.`,
        )
      } else if (
        typeof rawDistanceLoss ===
          'number' &&
        Math.abs(
          (
            rawSourceDistance -
            rawTargetDistance
          ) -
          rawDistanceLoss
        ) >
        0.000001
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} distanceLossKm must equal sourceDistanceKm minus targetDistanceKm.`,
        )
      }

      const rawSourceGap =
        technicalPayload
          .sourceGapFromLeaderSeconds

      const rawTargetGap =
        technicalPayload
          .targetGapFromLeaderSeconds

      if (
        typeof rawSourceGap !==
          'number' ||
        !isFiniteNumber(
          rawSourceGap,
        ) ||
        rawSourceGap <
          0 ||
        typeof rawTargetGap !==
          'number' ||
        !isFiniteNumber(
          rawTargetGap,
        ) ||
        rawTargetGap <
          rawSourceGap
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} has invalid source or target gap.`,
        )
      } else if (
        typeof rawTimeLoss ===
          'number' &&
        Math.abs(
          (
            rawTargetGap -
            rawSourceGap
          ) -
          rawTimeLoss
        ) >
        0.000001
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} target gap must increase by timeLossSeconds.`,
        )
      }

      if (
        technicalPayload
          .equipmentDamagePersistence !==
        'not_applied_in_phase_8h5a'
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} must not persist equipment damage in Phase 8H.5A.`,
        )
      }

      if (
        technicalPayload
          .equipmentWearPersistence !==
        'not_applied_in_phase_8h5a'
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} must not persist equipment wear in Phase 8H.5A.`,
        )
      }

      if (
        technicalPayload
          .technicalRunnerIntegration !==
        'not_active_in_phase_8h5a'
      ) {
        issues.push(
          `EVENTS: RIDER_TECHNICAL_INCIDENT event ${event.sequenceNumber} must remain isolated from the active runner in Phase 8H.5A.`,
        )
      }
    }

    if (event.eventType === 'SIMULATION_STARTED') {
      simulationStartedCount += 1
    }

    if (event.eventType === 'ORDER_LOADED') {
      // Payload must reference an existing order.
      const payload = event.payload as Readonly<Record<string, unknown>>
      const rawOrderId = payload.orderId

      const payloadOrderId =
        typeof rawOrderId === 'string'
          ? rawOrderId
          : null

      if (payloadOrderId === null) {
        issues.push(
          `EVENTS: ORDER_LOADED event ${event.sequenceNumber} payload must contain string orderId.`,
        )
      } else if (!orderIdSet.has(payloadOrderId)) {
        issues.push(
          `EVENTS: ORDER_LOADED event ${event.sequenceNumber} references non-existent orderId "${payloadOrderId}".`,
        )
      } else {
        orderLoadedCounts.set(
          payloadOrderId,
          (orderLoadedCounts.get(payloadOrderId) ?? 0) + 1,
        )
      }
    }
  }

  if (simulationStartedCount === 0) {
    issues.push(
      'EVENTS: exactly one SIMULATION_STARTED event must exist (found 0).',
    )
  } else if (simulationStartedCount > 1) {
    issues.push(
      'EVENTS: exactly one SIMULATION_STARTED event must exist (found more than 1).',
    )
  } else if (events.length > 0 && events[0].eventType !== 'SIMULATION_STARTED') {
    issues.push(
      'EVENTS: the first event must be SIMULATION_STARTED.',
    )
  }

  // Exactly one ORDER_LOADED event per order.
  for (const orderId of orderIds) {
    const count = orderLoadedCounts.get(orderId) ?? 0
    if (count === 0) {
      issues.push(
        `EVENTS: order ${orderId} must have exactly one ORDER_LOADED event (found 0).`,
      )
    } else if (count > 1) {
      issues.push(
        `EVENTS: order ${orderId} must have exactly one ORDER_LOADED event (found ${count}).`,
      )
    }
  }

  // COMPLETION
  if (state.completed) {
    if (state.currentKm !== state.stageDistanceKm) {
      issues.push(
        'COMPLETION: completed=true requires currentKm to equal stageDistanceKm.',
      )
    }

    for (const rider of Object.values(riders)) {
      if (!terminalStageStatuses.has(rider.stageStatus)) {
        issues.push(
          `COMPLETION: completed=true requires rider ${rider.riderId} to have a terminal or finished status.`,
        )
      }
    }
  }

  if (state.currentKm === 0 && state.finalSprintStarted) {
    issues.push(
      'COMPLETION: finalSprintStarted may not be true when currentKm is zero.',
    )
  }

  if (issues.length > 0) {
    throw new SimulationStateValidationError(issues)
  }
}
