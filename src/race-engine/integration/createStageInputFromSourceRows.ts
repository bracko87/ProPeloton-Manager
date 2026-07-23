/**
 * createStageInputFromSourceRows.ts
 *
 * Pure deterministic adapter that converts already-loaded database source
 * rows into the canonical StageInput contract.
 *
 * This module:
 * - performs no database calls
 * - performs no RPC calls
 * - performs no HTTP requests
 * - performs no writes
 * - uses no current date
 * - uses no randomness
 */

import type {
  StageFormat,
  StageInput,
  StageProfilePoint,
  StageRiderInput,
  StageSimulationSettings,
  StageTeamInput,
} from '../domain/StageInput'
import type {
  RiderAttributes,
  RiderRole,
} from '../domain/RiderState'

export interface RaceSourceRow {
  readonly id: string
  readonly name: string
}

export interface StageSourceRow {
  readonly id: string
  readonly race_id: string
  readonly name: string
  readonly stage_format: string
  readonly distance_km: number
}

export interface ParticipantTeamSourceRow {
  readonly team_id: string
  readonly status: string
  readonly team_name_snapshot: string | null
}

export interface ParticipantRiderSourceRow {
  readonly rider_id: string
  readonly team_id: string
  readonly start_number: number | null
  readonly role_snapshot: string | null
}

export interface RiderSourceRow {
  readonly id: string

  readonly first_name: string | null
  readonly last_name: string | null
  readonly display_name: string | null

  readonly flat: number
  readonly climbing?: number
  readonly sprint: number
  readonly time_trial?: number
  readonly endurance: number
  readonly resistance: number
  readonly recovery: number
  readonly race_iq: number
  readonly teamwork: number
}

export interface StagePlanMetadataSource {
  readonly default_race_captain_rider_id?: string | null
}

export interface StagePlanSourceRow {
  readonly id: string
  readonly club_id: string | null
  readonly participating_club_id: string | null
  readonly status: string

  readonly metadata: StagePlanMetadataSource | null

  readonly rider_roles_json:
    | Readonly<Record<string, string>>
    | null
}

export interface ProfilePointSourceRow {
  readonly km: number
  readonly elevation_m?: number | null
  readonly elevation?: number | null
}

export interface CreateStageInputFromSourceRowsParams {
  readonly race: RaceSourceRow
  readonly stage: StageSourceRow

  readonly participantTeams:
    readonly ParticipantTeamSourceRow[]

  readonly participantRiders:
    readonly ParticipantRiderSourceRow[]

  readonly riders:
    readonly RiderSourceRow[]

  readonly stagePlans:
    readonly StagePlanSourceRow[]

  readonly profilePoints:
    readonly ProfilePointSourceRow[]
}

const SETTINGS: StageSimulationSettings = {
  tickSeconds: 30,
  replaySnapshotIntervalSeconds: 30,
  maximumBreakawaySize: 8,
  minimumSpeedKmh: 36,
  maximumSpeedKmh: 60,
}

const SUPPORTED_STAGE_FORMATS:
  readonly StageFormat[] = [
    'road_race',
    'individual_time_trial',
    'team_time_trial',
    'pair_time_trial',
    'prologue',
  ]

const PARTICIPANT_ROLE_MAP:
  Readonly<Record<string, RiderRole>> = {
    Leader: 'captain',
    Sprinter: 'sprinter',
    Domestique: 'domestique',
    Breakaway: 'breakaway',

    'All-rounder': 'free_role',
    Climber: 'free_role',
    TT: 'free_role',
    selected: 'free_role',
  }

const STAGE_PLAN_ROLE_MAP:
  Readonly<Record<string, RiderRole>> = {
    team_leader_gc: 'captain',
    sprinter: 'sprinter',
    lead_out_rider: 'leadout',
    sprint_train_rider: 'leadout',
    helper_domestique: 'domestique',
    mountain_domestique: 'domestique',
    breakaway_rider: 'breakaway',

    free_role: 'free_role',
    protected_rider: 'free_role',
    breakaway_chaser: 'free_role',
    climber: 'free_role',
    rouleur: 'rouleur',
  }

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    )
  }

  return value.trim()
}

function requireFiniteNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${fieldName} must be a finite number.`,
    )
  }

  return value
}

function normalizeAttribute(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    requireFiniteNumber(
      value,
      fieldName,
    )

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(numericValue),
    ),
  )
}

/**
 * Deterministic acceleration derivation.
 *
 * acceleration =
 *   sprint * 0.60 +
 *   flat * 0.25 +
 *   raceIq * 0.15
 */
function deriveAcceleration(
  sprint: number,
  flat: number,
  raceIq: number,
): number {
  return normalizeAttribute(
    sprint * 0.6 +
      flat * 0.25 +
      raceIq * 0.15,
    'derived acceleration',
  )
}

function parseStageFormat(
  value: string,
): StageFormat {
  if (
    !SUPPORTED_STAGE_FORMATS.includes(
      value as StageFormat,
    )
  ) {
    throw new Error(
      `Unsupported stage format: ${value}.`,
    )
  }

  return value as StageFormat
}

function createRiderName(
  rider: RiderSourceRow,
): string {
  const displayName =
    rider.display_name?.trim()

  if (displayName) {
    return displayName
  }

  const combinedName = [
    rider.first_name?.trim(),
    rider.last_name?.trim(),
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value === 'string' &&
        value.length > 0,
    )
    .join(' ')

  if (combinedName.length === 0) {
    throw new Error(
      `Rider ${rider.id} has no usable name.`,
    )
  }

  return combinedName
}

function createAttributes(
  rider: RiderSourceRow,
): RiderAttributes {
  const flat =
    normalizeAttribute(
      rider.flat,
      `rider ${rider.id} flat`,
    )

  const climbing =
    normalizeAttribute(
      rider.climbing,
      `rider ${rider.id} climbing`,
    )

  const sprint =
    normalizeAttribute(
      rider.sprint,
      `rider ${rider.id} sprint`,
    )

  const timeTrial =
    normalizeAttribute(
      rider.time_trial,
      `rider ${rider.id} time_trial`,
    )

  const stamina =
    normalizeAttribute(
      rider.endurance,
      `rider ${rider.id} endurance`,
    )

  const resistance =
    normalizeAttribute(
      rider.resistance,
      `rider ${rider.id} resistance`,
    )

  const recovery =
    normalizeAttribute(
      rider.recovery,
      `rider ${rider.id} recovery`,
    )

  const teamwork =
    normalizeAttribute(
      rider.teamwork,
      `rider ${rider.id} teamwork`,
    )

  const raceIq =
    normalizeAttribute(
      rider.race_iq,
      `rider ${rider.id} race_iq`,
    )

  return {
    flat,
    climbing,
    sprint,
    timeTrial,
    acceleration:
      deriveAcceleration(
        sprint,
        flat,
        raceIq,
      ),
    stamina,
    resistance,
    recovery,
    raceIq,
    teamwork,
  }
}

function getTeamIdForPlan(
  plan: StagePlanSourceRow,
): string | null {
  return (
    plan.participating_club_id ??
    plan.club_id
  )
}

function mapParticipantRole(
  value: string | null,
): RiderRole {
  if (!value) {
    return 'free_role'
  }

  return (
    PARTICIPANT_ROLE_MAP[value] ??
    'free_role'
  )
}

function getStagePlanRole(
  plans: readonly StagePlanSourceRow[],
  teamId: string,
  riderId: string,
): RiderRole | null {
  const matchingPlans = plans
    .filter(
      (plan) =>
        getTeamIdForPlan(plan) ===
        teamId,
    )
    .slice()
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id),
    )

  for (const plan of matchingPlans) {
    const sourceRole =
      plan.rider_roles_json?.[riderId]

    if (!sourceRole) {
      continue
    }

    const mappedRole =
      STAGE_PLAN_ROLE_MAP[sourceRole]

    if (mappedRole) {
      return mappedRole
    }
  }

  return null
}

function getValidStoredCaptain(
  plans: readonly StagePlanSourceRow[],
  teamId: string,
  teamRiderIds: ReadonlySet<string>,
): string | null {
  const candidates = plans
    .filter(
      (plan) =>
        getTeamIdForPlan(plan) ===
        teamId,
    )
    .map(
      (plan) =>
        plan.metadata
          ?.default_race_captain_rider_id ??
        null,
    )
    .filter(
      (
        riderId,
      ): riderId is string =>
        typeof riderId === 'string' &&
        teamRiderIds.has(riderId),
    )
    .sort(
      (left, right) =>
        left.localeCompare(right),
    )

  return candidates[0] ?? null
}

function determineCaptainRiderId(
  teamId: string,
  teamParticipants:
    readonly ParticipantRiderSourceRow[],
  stagePlans:
    readonly StagePlanSourceRow[],
): string {
  const riderIds = new Set(
    teamParticipants.map(
      (participant) =>
        participant.rider_id,
    ),
  )

  const storedCaptain =
    getValidStoredCaptain(
      stagePlans,
      teamId,
      riderIds,
    )

  if (storedCaptain) {
    return storedCaptain
  }

  const mappedCaptains =
    teamParticipants
      .filter(
        (participant) =>
          mapParticipantRole(
            participant.role_snapshot,
          ) === 'captain',
      )
      .map(
        (participant) =>
          participant.rider_id,
      )
      .sort(
        (left, right) =>
          left.localeCompare(right),
      )

  if (mappedCaptains.length > 0) {
    return mappedCaptains[0]
  }

  const orderedByStartNumber =
    teamParticipants
      .filter(
        (participant) =>
          participant.start_number !==
          null,
      )
      .slice()
      .sort(
        (left, right) => {
          const leftNumber =
            left.start_number as number

          const rightNumber =
            right.start_number as number

          if (
            leftNumber !==
            rightNumber
          ) {
            return (
              leftNumber -
              rightNumber
            )
          }

          return left.rider_id
            .localeCompare(
              right.rider_id,
            )
        },
      )

  if (
    orderedByStartNumber.length > 0
  ) {
    return orderedByStartNumber[0]
      .rider_id
  }

  const orderedRiderIds =
    [...riderIds].sort(
      (left, right) =>
        left.localeCompare(right),
    )

  const fallbackCaptain =
    orderedRiderIds[0]

  if (!fallbackCaptain) {
    throw new Error(
      `Team ${teamId} has no riders from which to derive a captain.`,
    )
  }

  return fallbackCaptain
}

function createProfilePoints(
  sourcePoints:
    readonly ProfilePointSourceRow[],
  distanceKm: number,
): readonly StageProfilePoint[] {
  if (sourcePoints.length < 2) {
    throw new Error(
      'At least two profile points are required.',
    )
  }

  const points = sourcePoints
    .map(
      (
        sourcePoint,
        index,
      ): StageProfilePoint => {
        const kilometre =
          requireFiniteNumber(
            sourcePoint.km,
            `profilePoints[${index}].km`,
          )

        const rawElevation =
          sourcePoint.elevation_m ??
          sourcePoint.elevation

        const elevationMetres =
          requireFiniteNumber(
            rawElevation,
            `profilePoints[${index}].elevation`,
          )

        if (kilometre < 0) {
          throw new Error(
            'Profile kilometre cannot be negative.',
          )
        }

        return {
          kilometre,
          elevationMetres,
        }
      },
    )
    .sort(
      (left, right) =>
        left.kilometre -
        right.kilometre,
    )

  for (
    let index = 1;
    index < points.length;
    index += 1
  ) {
    if (
      points[index].kilometre <=
      points[index - 1].kilometre
    ) {
      throw new Error(
        'Profile kilometres must be strictly increasing.',
      )
    }
  }

  const firstPoint = points[0]
  const finalPoint =
    points[points.length - 1]

  if (firstPoint.kilometre !== 0) {
    throw new Error(
      'The first profile point must be at kilometre 0.',
    )
  }

  if (
    Math.abs(
      finalPoint.kilometre -
      distanceKm,
    ) > 0.000001
  ) {
    throw new Error(
      'The final profile point must equal the stage distance.',
    )
  }

  return points
}

export function createStageInputFromSourceRows(
  params:
    CreateStageInputFromSourceRowsParams,
): StageInput {
  const raceId =
    requireNonEmptyString(
      params.race.id,
      'race.id',
    )

  const stageId =
    requireNonEmptyString(
      params.stage.id,
      'stage.id',
    )

  const stageRaceId =
    requireNonEmptyString(
      params.stage.race_id,
      'stage.race_id',
    )

  if (stageRaceId !== raceId) {
    throw new Error(
      'The stage does not belong to the supplied race.',
    )
  }

  const stageName =
    requireNonEmptyString(
      params.stage.name,
      'stage.name',
    )

  const stageFormat =
    parseStageFormat(
      requireNonEmptyString(
        params.stage.stage_format,
        'stage.stage_format',
      ),
    )

  if (stageFormat !== 'road_race') {
    throw new Error(
      'The first deterministic integration boundary supports road_race only.',
    )
  }

  const distanceKm =
    requireFiniteNumber(
      params.stage.distance_km,
      'stage.distance_km',
    )

  if (distanceKm <= 0) {
    throw new Error(
      'Stage distance must be greater than zero.',
    )
  }

  const riderById =
    new Map<string, RiderSourceRow>()

  for (const rider of params.riders) {
    const riderId =
      requireNonEmptyString(
        rider.id,
        'rider.id',
      )

    if (riderById.has(riderId)) {
      throw new Error(
        `Duplicate rider source row: ${riderId}.`,
      )
    }

    riderById.set(
      riderId,
      rider,
    )
  }

  const participantByRiderId =
    new Map<
      string,
      ParticipantRiderSourceRow
    >()

  const participantsByTeam =
    new Map<
      string,
      ParticipantRiderSourceRow[]
    >()

  for (
    const participant
    of params.participantRiders
  ) {
    const riderId =
      requireNonEmptyString(
        participant.rider_id,
        'participant rider_id',
      )

    const teamId =
      requireNonEmptyString(
        participant.team_id,
        'participant team_id',
      )

    if (
      participantByRiderId.has(
        riderId,
      )
    ) {
      throw new Error(
        `Rider ${riderId} appears more than once in the start list.`,
      )
    }

    participantByRiderId.set(
      riderId,
      participant,
    )

    const current =
      participantsByTeam.get(
        teamId,
      ) ?? []

    current.push(participant)

    participantsByTeam.set(
      teamId,
      current,
    )
  }

  const executableTeamRows =
    params.participantTeams
      .filter(
        (team) =>
          team.status === 'accepted',
      )
      .filter(
        (team) =>
          (
            participantsByTeam.get(
              team.team_id,
            ) ?? []
          ).length > 0,
      )
      .slice()
      .sort(
        (left, right) =>
          left.team_id.localeCompare(
            right.team_id,
          ),
      )

  const seenTeamIds =
    new Set<string>()

  const teams:
    StageTeamInput[] = []

  const riders:
    StageRiderInput[] = []

  for (
    const teamRow
    of executableTeamRows
  ) {
    const teamId =
      requireNonEmptyString(
        teamRow.team_id,
        'participant team_id',
      )

    if (seenTeamIds.has(teamId)) {
      throw new Error(
        `Duplicate participant team: ${teamId}.`,
      )
    }

    seenTeamIds.add(teamId)

    const teamName =
      requireNonEmptyString(
        teamRow.team_name_snapshot,
        `team ${teamId} snapshot name`,
      )

    const teamParticipants =
      (
        participantsByTeam.get(
          teamId,
        ) ?? []
      )
        .slice()
        .sort(
          (left, right) =>
            left.rider_id.localeCompare(
              right.rider_id,
            ),
        )

    const captainRiderId =
      determineCaptainRiderId(
        teamId,
        teamParticipants,
        params.stagePlans,
      )

    const teamRiderIds =
      teamParticipants.map(
        (participant) =>
          participant.rider_id,
      )

    teams.push({
      teamId,
      teamName,
      captainRiderId,
      riderIds: teamRiderIds,
    })

    for (
      const participant
      of teamParticipants
    ) {
      const rider =
        riderById.get(
          participant.rider_id,
        )

      if (!rider) {
        throw new Error(
          `Missing rider source row for ${participant.rider_id}.`,
        )
      }

      const stagePlanRole =
        getStagePlanRole(
          params.stagePlans,
          teamId,
          participant.rider_id,
        )

      const participantRole =
        mapParticipantRole(
          participant.role_snapshot,
        )

      const role =
        participant.rider_id ===
        captainRiderId
          ? 'captain'
          : (
              stagePlanRole ??
              participantRole
            )

      riders.push({
        riderId:
          participant.rider_id,
        teamId,
        riderName:
          createRiderName(rider),
        teamName,
        role,
        attributes:
          createAttributes(rider),
      })
    }
  }

  teams.sort(
    (left, right) =>
      left.teamId.localeCompare(
        right.teamId,
      ),
  )

  riders.sort(
    (left, right) =>
      left.riderId.localeCompare(
        right.riderId,
      ),
  )

  if (teams.length < 2) {
    throw new Error(
      'At least two executable teams are required.',
    )
  }

  if (riders.length < 2) {
    throw new Error(
      'At least two executable riders are required.',
    )
  }

  const includedRiderIds =
    new Set(
      riders.map(
        (rider) =>
          rider.riderId,
      ),
    )

  for (const team of teams) {
    if (
      !includedRiderIds.has(
        team.captainRiderId,
      )
    ) {
      throw new Error(
        `Captain ${team.captainRiderId} is missing from the executable rider list.`,
      )
    }

    for (
      const riderId
      of team.riderIds
    ) {
      if (
        !includedRiderIds.has(
          riderId,
        )
      ) {
        throw new Error(
          `Team ${team.teamId} references missing rider ${riderId}.`,
        )
      }
    }
  }

  const profilePoints =
    createProfilePoints(
      params.profilePoints,
      distanceKm,
    )

  return {
    raceId,
    stageId,
    stageName,
    stageFormat,
    distanceKm,

    seed:
      `race_engine_ts_v1:${raceId}:${stageId}`,

    settings: SETTINGS,

    teams,
    riders,
    profilePoints,

    orders: [],
  }
}