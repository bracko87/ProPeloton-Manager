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