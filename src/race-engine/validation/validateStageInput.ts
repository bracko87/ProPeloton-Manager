/**
 * validateStageInput.ts
 *
 * Validation for immutable StageInput domain data.
 *
 * This validator checks:
 * - stage identity and scalar settings;
 * - rider and team identity relationships;
 * - captain and team membership;
 * - profile-point integrity;
 * - basic input-array structure.
 */

import type {
  StageInput,
  StageProfilePoint,
  StageRiderInput,
  StageTeamInput,
} from '../domain/StageInput'

/**
 * Error containing every StageInput validation issue found.
 */
export class StageInputValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      `Invalid StageInput:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    )

    this.name = 'StageInputValidationError'
    this.issues = issues
  }
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
  )
}

function validateProfilePoints(
  profilePoints: readonly StageProfilePoint[],
  distanceKm: number,
  issues: string[],
): void {
  if (!Array.isArray(profilePoints)) {
    issues.push('profilePoints must be an array.')
    return
  }

  if (profilePoints.length < 2) {
    issues.push('profilePoints must contain at least two points.')
    return
  }

  for (let index = 0; index < profilePoints.length; index += 1) {
    const point = profilePoints[index]

    if (!isFiniteNumber(point.kilometre)) {
      issues.push(
        `profilePoints[${index}].kilometre must be finite.`,
      )
    }

    if (!isFiniteNumber(point.elevationMetres)) {
      issues.push(
        `profilePoints[${index}].elevationMetres must be finite.`,
      )
    }

    if (
      isFiniteNumber(point.kilometre) &&
      (point.kilometre < 0 || point.kilometre > distanceKm)
    ) {
      issues.push(
        `profilePoints[${index}].kilometre must be between 0 and distanceKm.`,
      )
    }

    if (index > 0) {
      const previousPoint = profilePoints[index - 1]

      if (
        isFiniteNumber(previousPoint.kilometre) &&
        isFiniteNumber(point.kilometre) &&
        point.kilometre <= previousPoint.kilometre
      ) {
        issues.push(
          `profilePoints[${index}].kilometre must be strictly greater than the previous point.`,
        )
      }
    }
  }

  const firstPoint = profilePoints[0]
  const lastPoint = profilePoints[profilePoints.length - 1]

  if (
    isFiniteNumber(firstPoint.kilometre) &&
    firstPoint.kilometre !== 0
  ) {
    issues.push('The first profile point must be at kilometre 0.')
  }

  if (
    isFiniteNumber(lastPoint.kilometre) &&
    lastPoint.kilometre !== distanceKm
  ) {
    issues.push(
      'The final profile point must be at exactly distanceKm.',
    )
  }
}

function validateRiderCondition(
  rider: StageRiderInput,
  riderIndex: number,
  issues: string[],
): void {
  const condition =
    rider.condition

  if (condition === undefined) {
    return
  }

  if (
    condition === null ||
    typeof condition !== 'object'
  ) {
    issues.push(
      `riders[${riderIndex}].condition must be an object when provided.`,
    )
    return
  }

  const boundedValues:
    ReadonlyArray<
      readonly [
        fieldName: string,
        value: unknown,
      ]
    > = [
      [
        'startingEnergy',
        condition.startingEnergy,
      ],
      [
        'fatigueBeforeStage',
        condition.fatigueBeforeStage,
      ],
      [
        'morale',
        condition.morale,
      ],
    ]

  for (
    const [
      fieldName,
      value,
    ] of boundedValues
  ) {
    if (
      !isFiniteNumber(value) ||
      value < 0 ||
      value > 100
    ) {
      issues.push(
        `riders[${riderIndex}].condition.${fieldName} must be finite and between 0 and 100.`,
      )
    }
  }

  if (
    !isNonBlankString(
      condition.availabilityStatus,
    )
  ) {
    issues.push(
      `riders[${riderIndex}].condition.availabilityStatus must not be blank.`,
    )
  }
}

const EQUIPMENT_CATEGORIES:
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

function isNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    isFiniteNumber(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function validateRiderEquipment(
  rider:
    StageRiderInput,
  riderIndex: number,
  issues: string[],
): void {
  const equipment =
    rider.equipment

  if (!equipment) {
    return
  }

  const prefix =
    `riders[${riderIndex}].equipment`

  if (
    equipment.conditionSource !==
    'race_engine_resolve_stage_rider_equipment_condition_v1'
  ) {
    issues.push(
      `${prefix}.conditionSource is unsupported.`,
    )
  }

  if (
    equipment.preparationSource !==
    'race_engine_get_stage_rider_preparation_modifiers_v2'
  ) {
    issues.push(
      `${prefix}.preparationSource is unsupported.`,
    )
  }

  if (
    equipment.equipmentSetupId !==
      null &&
    !isNonBlankString(
      equipment.equipmentSetupId,
    )
  ) {
    issues.push(
      `${prefix}.equipmentSetupId must be null or a non-blank string.`,
    )
  }

  if (
    !isIntegerInRange(
      equipment
        .selectedComponentCount,
      0,
      6,
    )
  ) {
    issues.push(
      `${prefix}.selectedComponentCount must be an integer between 0 and 6.`,
    )
  }

  if (
    !isIntegerInRange(
      equipment
        .matchedComponentCount,
      0,
      6,
    )
  ) {
    issues.push(
      `${prefix}.matchedComponentCount must be an integer between 0 and 6.`,
    )
  }

  if (
    isIntegerInRange(
      equipment
        .selectedComponentCount,
      0,
      6,
    ) &&
    isIntegerInRange(
      equipment
        .matchedComponentCount,
      0,
      6,
    ) &&
    equipment
      .matchedComponentCount >
    equipment
      .selectedComponentCount
  ) {
    issues.push(
      `${prefix}.matchedComponentCount may not exceed selectedComponentCount.`,
    )
  }

  if (
    typeof equipment
      .completeSource !==
    'boolean'
  ) {
    issues.push(
      `${prefix}.completeSource must be boolean.`,
    )
  }

  const derivedCompleteSource =
    equipment
      .selectedComponentCount >
      0 &&
    equipment
      .matchedComponentCount ===
      equipment
        .selectedComponentCount

  if (
    typeof equipment
      .completeSource ===
      'boolean' &&
    equipment.completeSource !==
      derivedCompleteSource
  ) {
    issues.push(
      `${prefix}.completeSource does not match component counts.`,
    )
  }

  if (
    equipment
      .minimumConditionPercent !==
      null &&
    !isNumberInRange(
      equipment
        .minimumConditionPercent,
      0,
      100,
    )
  ) {
    issues.push(
      `${prefix}.minimumConditionPercent must be null or between 0 and 100.`,
    )
  }

  if (
    !isNumberInRange(
      equipment
        .effectiveConditionPercent,
      0,
      100,
    )
  ) {
    issues.push(
      `${prefix}.effectiveConditionPercent must be between 0 and 100.`,
    )
  }

  if (
    !Array.isArray(
      equipment
        .missingComponentCategories,
    )
  ) {
    issues.push(
      `${prefix}.missingComponentCategories must be an array.`,
    )
  } else {
    const categorySet =
      new Set<string>()

    for (
      const category of
      equipment
        .missingComponentCategories
    ) {
      if (
        !EQUIPMENT_CATEGORIES.has(
          category,
        )
      ) {
        issues.push(
          `${prefix}.missingComponentCategories contains unsupported category "${String(category)}".`,
        )
      }

      if (
        categorySet.has(
          category,
        )
      ) {
        issues.push(
          `${prefix}.missingComponentCategories must not contain duplicates.`,
        )
      }

      categorySet.add(
        category,
      )
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
        `${prefix}.effectiveConditionPercent must equal minimumConditionPercent for a complete source.`,
      )
    }

    if (
      equipment
        .missingComponentCategories
        .length >
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
      `${prefix}.incomplete source must use neutral effectiveConditionPercent 100.`,
    )
  }

  if (
    !isNumberInRange(
      equipment
        .mechanicalIncidentRiskMultiplier,
      0.75,
      1,
    )
  ) {
    issues.push(
      `${prefix}.mechanicalIncidentRiskMultiplier must be between 0.75 and 1.`,
    )
  }

  if (
    !isNumberInRange(
      equipment
        .mechanicalTimeLossMultiplier,
      0.82,
      1,
    )
  ) {
    issues.push(
      `${prefix}.mechanicalTimeLossMultiplier must be between 0.82 and 1.`,
    )
  }
}

function validateRiders(
  riders: readonly StageRiderInput[],
  issues: string[],
): Map<string, StageRiderInput> {
  const riderById = new Map<string, StageRiderInput>()

  if (!Array.isArray(riders)) {
    issues.push('riders must be an array.')
    return riderById
  }

  if (riders.length === 0) {
    issues.push('At least one rider is required.')
  }

  for (let index = 0; index < riders.length; index += 1) {
    const rider = riders[index]

    if (!isNonBlankString(rider.riderId)) {
      issues.push(`riders[${index}].riderId must not be blank.`)
    } else if (riderById.has(rider.riderId)) {
      issues.push(`Duplicate riderId "${rider.riderId}".`)
    } else {
      riderById.set(rider.riderId, rider)
    }

    if (!isNonBlankString(rider.teamId)) {
      issues.push(`riders[${index}].teamId must not be blank.`)
    }

    if (!isNonBlankString(rider.riderName)) {
      issues.push(`riders[${index}].riderName must not be blank.`)
    }

    if (!isNonBlankString(rider.teamName)) {
      issues.push(`riders[${index}].teamName must not be blank.`)
    }

    if (
      rider.attributes === null ||
      typeof rider.attributes !== 'object'
    ) {
      issues.push(`riders[${index}].attributes must be an object.`)
    }


    validateRiderEquipment(
      rider,
      index,
      issues,
    )

    validateRiderCondition(
      rider,
      index,
      issues,
    )
  }

  return riderById
}

function validateTeams(
  teams: readonly StageTeamInput[],
  riderById: ReadonlyMap<string, StageRiderInput>,
  issues: string[],
): void {
  if (!Array.isArray(teams)) {
    issues.push('teams must be an array.')
    return
  }

  if (teams.length === 0) {
    issues.push('At least one team is required.')
  }

  const teamById = new Map<string, StageTeamInput>()
  const riderMembershipCounts = new Map<string, number>()

  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index]

    if (!isNonBlankString(team.teamId)) {
      issues.push(`teams[${index}].teamId must not be blank.`)
    } else if (teamById.has(team.teamId)) {
      issues.push(`Duplicate teamId "${team.teamId}".`)
    } else {
      teamById.set(team.teamId, team)
    }

    if (!isNonBlankString(team.teamName)) {
      issues.push(`teams[${index}].teamName must not be blank.`)
    }

    if (!Array.isArray(team.riderIds)) {
      issues.push(`teams[${index}].riderIds must be an array.`)
      continue
    }

    if (team.riderIds.length === 0) {
      issues.push(`Team "${team.teamId}" must contain at least one rider.`)
    }

    const riderIdsSeenInTeam = new Set<string>()

    for (const riderId of team.riderIds) {
      riderMembershipCounts.set(
        riderId,
        (riderMembershipCounts.get(riderId) ?? 0) + 1,
      )

      if (riderIdsSeenInTeam.has(riderId)) {
        issues.push(
          `Team "${team.teamId}" contains duplicate riderId "${riderId}".`,
        )
        continue
      }

      riderIdsSeenInTeam.add(riderId)

      const rider = riderById.get(riderId)

      if (!rider) {
        issues.push(
          `Team "${team.teamId}" references missing riderId "${riderId}".`,
        )
      } else {
        if (rider.teamId !== team.teamId) {
          issues.push(
            `Rider "${riderId}" belongs to team "${rider.teamId}" but is listed by team "${team.teamId}".`,
          )
        }

        if (rider.teamName !== team.teamName) {
          issues.push(
            `Rider "${riderId}" has teamName "${rider.teamName}" but team "${team.teamId}" has teamName "${team.teamName}".`,
          )
        }
      }
    }

    const captain = riderById.get(team.captainRiderId)

    if (!captain) {
      issues.push(
        `Team "${team.teamId}" captainRiderId "${team.captainRiderId}" does not reference an existing rider.`,
      )
    } else {
      if (captain.teamId !== team.teamId) {
        issues.push(
          `Captain "${captain.riderId}" does not belong to team "${team.teamId}".`,
        )
      }

      if (!team.riderIds.includes(team.captainRiderId)) {
        issues.push(
          `Captain "${team.captainRiderId}" must appear in team "${team.teamId}" riderIds.`,
        )
      }
    }
  }

  for (const rider of riderById.values()) {
    const team = teamById.get(rider.teamId)

    if (!team) {
      issues.push(
        `Rider "${rider.riderId}" references missing teamId "${rider.teamId}".`,
      )
    }

    const membershipCount =
      riderMembershipCounts.get(rider.riderId) ?? 0

    if (membershipCount === 0) {
      issues.push(
        `Rider "${rider.riderId}" does not appear in any team riderIds list.`,
      )
    } else if (membershipCount > 1) {
      issues.push(
        `Rider "${rider.riderId}" appears in multiple team riderIds lists.`,
      )
    }
  }
}


function validateOptionalBoundedNumber(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
  issues: string[],
): void {
  if (value === null) {
    return
  }

  if (
    !isFiniteNumber(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push(
      `${fieldName} must be null or a finite number between ${minimum} and ${maximum}.`,
    )
  }
}

function validateWeather(
  weather: StageInput['weather'],
  issues: string[],
): void {
  if (weather === undefined) {
    return
  }

  if (
    weather === null ||
    typeof weather !== 'object'
  ) {
    issues.push(
      'weather must be an object when provided.',
    )
    return
  }

  if (
    weather.authority !==
      'stage_weather_snapshot' &&
    weather.authority !==
      'profile_weather_snapshot'
  ) {
    issues.push(
      'weather.authority must be stage_weather_snapshot or profile_weather_snapshot.',
    )
  }

  if (!isNonBlankString(weather.source)) {
    issues.push(
      'weather.source must not be blank.',
    )
  }

  if (!isNonBlankString(weather.condition)) {
    issues.push(
      'weather.condition must not be blank.',
    )
  }

  if (
    weather.summary !== null &&
    typeof weather.summary !== 'string'
  ) {
    issues.push(
      'weather.summary must be a string or null.',
    )
  }

  validateOptionalBoundedNumber(
    weather.averageTemperatureC,
    'weather.averageTemperatureC',
    -100,
    100,
    issues,
  )

  validateOptionalBoundedNumber(
    weather.minimumTemperatureC,
    'weather.minimumTemperatureC',
    -100,
    100,
    issues,
  )

  validateOptionalBoundedNumber(
    weather.maximumTemperatureC,
    'weather.maximumTemperatureC',
    -100,
    100,
    issues,
  )

  validateOptionalBoundedNumber(
    weather.windSpeedKmh,
    'weather.windSpeedKmh',
    0,
    500,
    issues,
  )

  validateOptionalBoundedNumber(
    weather.precipitationMm,
    'weather.precipitationMm',
    0,
    1000,
    issues,
  )

  if (
    isFiniteNumber(
      weather.minimumTemperatureC,
    ) &&
    isFiniteNumber(
      weather.maximumTemperatureC,
    ) &&
    weather.maximumTemperatureC <
      weather.minimumTemperatureC
  ) {
    issues.push(
      'weather.maximumTemperatureC must be greater than or equal to weather.minimumTemperatureC.',
    )
  }

  for (
    const [
      fieldName,
      value,
    ] of [
      [
        'hostCity',
        weather.hostCity,
      ],
      [
        'countryCode',
        weather.countryCode,
      ],
    ] as const
  ) {
    if (
      value !== null &&
      !isNonBlankString(value)
    ) {
      issues.push(
        `weather.${fieldName} must be a non-blank string or null.`,
      )
    }
  }
}

/**
 * Validate a complete StageInput.
 */
export function validateStageInput(stageInput: StageInput): void {
  const issues: string[] = []

  if (!isNonBlankString(stageInput.raceId)) {
    issues.push('raceId must not be blank.')
  }

  if (!isNonBlankString(stageInput.stageId)) {
    issues.push('stageId must not be blank.')
  }

  if (!isNonBlankString(stageInput.stageName)) {
    issues.push('stageName must not be blank.')
  }

  if (stageInput.stageFormat !== 'road_race') {
    issues.push(
      `stageFormat "${stageInput.stageFormat}" is not supported by the current engine.`,
    )
  }

  if (
    !isFiniteNumber(stageInput.distanceKm) ||
    stageInput.distanceKm <= 0
  ) {
    issues.push('distanceKm must be a positive finite number.')
  }

  if (!isNonBlankString(stageInput.seed)) {
    issues.push('seed must not be blank.')
  }

  const settings = stageInput.settings

  if (!settings || typeof settings !== 'object') {
    issues.push('settings must be an object.')
  } else {
    if (!isPositiveInteger(settings.tickSeconds)) {
      issues.push('settings.tickSeconds must be a positive integer.')
    }

    if (!isPositiveInteger(settings.replaySnapshotIntervalSeconds)) {
      issues.push(
        'settings.replaySnapshotIntervalSeconds must be a positive integer.',
      )
    }

    if (!isPositiveInteger(settings.maximumBreakawaySize)) {
      issues.push(
        'settings.maximumBreakawaySize must be a positive integer.',
      )
    }

    if (
      !isFiniteNumber(settings.minimumSpeedKmh) ||
      settings.minimumSpeedKmh <= 0
    ) {
      issues.push(
        'settings.minimumSpeedKmh must be a positive finite number.',
      )
    }

    if (
      !isFiniteNumber(settings.maximumSpeedKmh) ||
      settings.maximumSpeedKmh <= 0
    ) {
      issues.push(
        'settings.maximumSpeedKmh must be a positive finite number.',
      )
    }

    if (
      isFiniteNumber(settings.minimumSpeedKmh) &&
      isFiniteNumber(settings.maximumSpeedKmh) &&
      settings.maximumSpeedKmh < settings.minimumSpeedKmh
    ) {
      issues.push(
        'settings.maximumSpeedKmh must be greater than or equal to settings.minimumSpeedKmh.',
      )
    }
  }

  validateWeather(
    stageInput.weather,
    issues,
  )

  const riderById = validateRiders(stageInput.riders, issues)
  validateTeams(stageInput.teams, riderById, issues)

  if (!Array.isArray(stageInput.orders)) {
    issues.push('orders must be an array.')
  }

  if (
    isFiniteNumber(stageInput.distanceKm) &&
    stageInput.distanceKm > 0
  ) {
    validateProfilePoints(
      stageInput.profilePoints,
      stageInput.distanceKm,
      issues,
    )
  }

  if (issues.length > 0) {
    throw new StageInputValidationError(issues)
  }
}