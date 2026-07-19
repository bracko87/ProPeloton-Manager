/**
 * validateStageInput.ts
 *
 * Validation utilities for deterministic race-engine StageInput values.
 *
 * Responsibilities:
 * - Validate the complete input contract before simulation state is created.
 * - Collect every detected issue before throwing.
 * - Avoid mutating any input object or array.
 */

import type { StageInput } from '../domain/StageInput'

/**
 * StageInputValidationError
 *
 * Thrown when one or more StageInput validation issues are detected.
 */
export class StageInputValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      `Invalid stage input:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
    )

    this.name = 'StageInputValidationError'
    this.issues = issues
  }
}

/**
 * Checks whether a value is a finite number.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Checks whether a value is a positive integer.
 */
function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
  )
}

/**
 * Checks whether a value is a non-negative integer.
 */
function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  )
}

/**
 * Checks whether a string is blank.
 */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/**
 * validateStageInput
 *
 * Validates all StageInput invariants and throws only after every check has
 * completed.
 */
export function validateStageInput(input: StageInput): void {
  const issues: string[] = []

  /**
   * BASIC STAGE DATA
   */

  if (isBlank(input.raceId)) {
    issues.push('raceId must not be blank')
  }

  if (isBlank(input.stageId)) {
    issues.push('stageId must not be blank')
  }

  if (isBlank(input.seed)) {
    issues.push('seed must not be blank')
  }

  if (input.stageFormat !== 'road_race') {
    issues.push('stageFormat must be exactly "road_race"')
  }

  if (!isFiniteNumber(input.distanceKm) || input.distanceKm <= 0) {
    issues.push('distanceKm must be finite and greater than zero')
  }

  /**
   * COLLECTION REQUIREMENTS
   */

  if (!Array.isArray(input.teams) || input.teams.length < 2) {
    issues.push('At least two teams must exist')
  }

  if (!Array.isArray(input.riders) || input.riders.length < 2) {
    issues.push('At least two riders must exist')
  }

  if (!Array.isArray(input.orders)) {
    issues.push('orders must be an array')
  }

  /**
   * BUILD LOOKUP MAPS
   */

  const teamById = new Map<
    string,
    StageInput['teams'][number]
  >()

  const riderById = new Map<
    string,
    StageInput['riders'][number]
  >()

  const duplicateTeamIds = new Set<string>()
  const duplicateRiderIds = new Set<string>()
  const duplicateOrderIds = new Set<string>()

  /**
   * TEAM ID VALIDATION
   */

  for (const team of input.teams) {
    if (isBlank(team.teamId)) {
      issues.push('Every team must have a non-blank teamId')
      continue
    }

    if (teamById.has(team.teamId)) {
      duplicateTeamIds.add(team.teamId)
    } else {
      teamById.set(team.teamId, team)
    }
  }

  for (const duplicateTeamId of duplicateTeamIds) {
    issues.push(`Duplicate team ID "${duplicateTeamId}"`)
  }

  /**
   * RIDER ID VALIDATION
   */

  for (const rider of input.riders) {
    if (isBlank(rider.riderId)) {
      issues.push('Every rider must have a non-blank riderId')
      continue
    }

    if (riderById.has(rider.riderId)) {
      duplicateRiderIds.add(rider.riderId)
    } else {
      riderById.set(rider.riderId, rider)
    }
  }

  for (const duplicateRiderId of duplicateRiderIds) {
    issues.push(`Duplicate rider ID "${duplicateRiderId}"`)
  }

  /**
   * RIDER VALIDATION
   */

  const attributeNames = [
    'flat',
    'sprint',
    'acceleration',
    'stamina',
    'resistance',
    'recovery',
    'teamwork',
  ] as const

  for (const rider of input.riders) {
    if (!teamById.has(rider.teamId)) {
      issues.push(
        `Rider "${rider.riderId}" references missing team "${rider.teamId}"`,
      )
    }

    for (const attributeName of attributeNames) {
      const value = rider.attributes[attributeName]

      if (
        !isFiniteNumber(value) ||
        value < 0 ||
        value > 100
      ) {
        issues.push(
          `Rider "${rider.riderId}" attribute "${attributeName}" must be finite and between 0 and 100`,
        )
      }
    }
  }

  /**
   * TEAM MEMBERSHIP VALIDATION
   */

  const riderMembershipCount = new Map<string, number>()

  for (const team of input.teams) {
    if (
      !Array.isArray(team.riderIds) ||
      team.riderIds.length === 0
    ) {
      issues.push(
        `Team "${team.teamId}" must have at least one rider`,
      )
    }

    const seenTeamRiderIds = new Set<string>()

    for (const riderId of team.riderIds) {
      riderMembershipCount.set(
        riderId,
        (riderMembershipCount.get(riderId) ?? 0) + 1,
      )

      if (seenTeamRiderIds.has(riderId)) {
        issues.push(
          `Team "${team.teamId}" contains duplicate riderId "${riderId}"`,
        )
      } else {
        seenTeamRiderIds.add(riderId)
      }

      const rider = riderById.get(riderId)

      if (!rider) {
        issues.push(
          `Team "${team.teamId}" references missing rider "${riderId}"`,
        )
      } else if (rider.teamId !== team.teamId) {
        issues.push(
          `Rider "${riderId}" is listed in team "${team.teamId}" but belongs to team "${rider.teamId}"`,
        )
      }
    }

    const captain = riderById.get(team.captainRiderId)

    if (!captain) {
      issues.push(
        `Team "${team.teamId}" captain "${team.captainRiderId}" does not exist`,
      )
    } else if (captain.teamId !== team.teamId) {
      issues.push(
        `Team "${team.teamId}" captain "${team.captainRiderId}" does not belong to that team`,
      )
    }

    if (!team.riderIds.includes(team.captainRiderId)) {
      issues.push(
        `Team "${team.teamId}" captain "${team.captainRiderId}" is not listed in team.riderIds`,
      )
    }
  }

  for (const rider of input.riders) {
    const count =
      riderMembershipCount.get(rider.riderId) ?? 0

    if (count === 0) {
      issues.push(
        `Rider "${rider.riderId}" does not appear in any team.riderIds list`,
      )
    } else if (count > 1) {
      issues.push(
        `Rider "${rider.riderId}" appears in more than one team.riderIds list`,
      )
    }
  }

  /**
   * ORDER VALIDATION
   */

  const orderIdSet = new Set<string>()

  for (const order of input.orders) {
    if (isBlank(order.orderId)) {
      issues.push('Every order must have a non-blank orderId')
    } else if (orderIdSet.has(order.orderId)) {
      duplicateOrderIds.add(order.orderId)
    } else {
      orderIdSet.add(order.orderId)
    }

    const team = teamById.get(order.teamId)
    const rider = riderById.get(order.riderId)

    if (!team) {
      issues.push(
        `Order "${order.orderId}" references missing team "${order.teamId}"`,
      )
    }

    if (!rider) {
      issues.push(
        `Order "${order.orderId}" references missing rider "${order.riderId}"`,
      )
    } else if (rider.teamId !== order.teamId) {
      issues.push(
        `Order "${order.orderId}" rider "${order.riderId}" does not belong to team "${order.teamId}"`,
      )
    }

    if (
      !isFiniteNumber(order.eligibleFromKm) ||
      order.eligibleFromKm < 0
    ) {
      issues.push(
        `Order "${order.orderId}" eligibleFromKm must be finite and not below zero`,
      )
    }

    if (
      !isFiniteNumber(order.eligibleUntilKm) ||
      order.eligibleUntilKm > input.distanceKm
    ) {
      issues.push(
        `Order "${order.orderId}" eligibleUntilKm must be finite and not greater than stage distance`,
      )
    }

    if (
      isFiniteNumber(order.eligibleFromKm) &&
      isFiniteNumber(order.eligibleUntilKm) &&
      order.eligibleUntilKm < order.eligibleFromKm
    ) {
      issues.push(
        `Order "${order.orderId}" eligibleUntilKm must not be lower than eligibleFromKm`,
      )
    }

    if (
      !isFiniteNumber(order.priority) ||
      order.priority < 0
    ) {
      issues.push(
        `Order "${order.orderId}" priority must be finite and non-negative`,
      )
    }

    if (
      order.maximumFollowers !== null &&
      !isNonNegativeInteger(order.maximumFollowers)
    ) {
      issues.push(
        `Order "${order.orderId}" maximumFollowers must be null or a non-negative integer`,
      )
    }

    if (
      order.targetRiderId !== null &&
      !riderById.has(order.targetRiderId)
    ) {
      issues.push(
        `Order "${order.orderId}" targetRiderId "${order.targetRiderId}" does not reference an existing rider`,
      )
    }
  }

  for (const duplicateOrderId of duplicateOrderIds) {
    issues.push(`Duplicate order ID "${duplicateOrderId}"`)
  }

  /**
   * SETTINGS VALIDATION
   */

  const settings = input.settings

  if (!isPositiveInteger(settings.tickSeconds)) {
    issues.push('tickSeconds must be a positive integer')
  }

  if (
    !isPositiveInteger(
      settings.replaySnapshotIntervalSeconds,
    )
  ) {
    issues.push(
      'replaySnapshotIntervalSeconds must be a positive integer',
    )
  }

  if (
    !isPositiveInteger(settings.maximumBreakawaySize)
  ) {
    issues.push(
      'maximumBreakawaySize must be a positive integer',
    )
  }

  if (
    !isFiniteNumber(settings.minimumSpeedKmh) ||
    settings.minimumSpeedKmh <= 0
  ) {
    issues.push(
      'minimumSpeedKmh must be finite and greater than zero',
    )
  }

  if (
    !isFiniteNumber(settings.maximumSpeedKmh) ||
    settings.maximumSpeedKmh <=
      settings.minimumSpeedKmh
  ) {
    issues.push(
      'maximumSpeedKmh must be finite and greater than minimumSpeedKmh',
    )
  }

  /**
   * THROW AFTER ALL CHECKS
   */

  if (issues.length > 0) {
    throw new StageInputValidationError(issues)
  }
}