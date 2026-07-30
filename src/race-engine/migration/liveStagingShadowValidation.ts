/**
 * liveStagingShadowValidation.ts
 *
 * Phase 8J.8A live, read-only shadow evidence builder.
 *
 * The caller supplies a source bundle returned by the existing authenticated
 * read-only RPC. This module:
 *
 * - converts the source bundle into canonical StageInput rows;
 * - runs the real deterministic engine twice in memory;
 * - creates and validates the real generic replay model twice;
 * - compares deterministic classifications with persisted official legacy
 *   result rows;
 * - produces evidence only.
 *
 * It does not call Supabase, write a result, mutate race state, change a route,
 * expose player UI, or deploy.
 */

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
  type ParticipantRiderSourceRow,
  type ParticipantTeamSourceRow,
  type ProfilePointSourceRow,
  type RiderSourceRow,
  type StagePlanSourceRow,
} from '../integration/createStageInputFromSourceRows'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'
import {
  runDeterministicRoadRace,
} from '../simulation/runDeterministicRoadRace'
import {
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
  type ReplayStageModel,
} from '../../race-replay'

export type LiveShadowStageProfile =
  | 'flat'
  | 'hilly'
  | 'mountain'

export interface LiveShadowStageDefinition {
  readonly stageId: string
  readonly profile:
    LiveShadowStageProfile
  readonly label: string

  readonly maximumFinishTimeDifferenceSeconds:
    number
}

export const LIVE_STAGING_SHADOW_STAGES:
  readonly LiveShadowStageDefinition[] = [
    {
      stageId:
        '24709c46-b258-4db3-a3aa-fd92dc37630e',
      profile:
        'flat',
      label:
        'Rio Tour Stage 1 · Flat · 142.00 km',
      maximumFinishTimeDifferenceSeconds:
        300,
    },
    {
      stageId:
        '3ca7d3dd-6a45-4829-b08e-6b118309fdd8',
      profile:
        'hilly',
      label:
        'Japan Road Cup Stage 1 · Hilly · 144.20 km',
      maximumFinishTimeDifferenceSeconds:
        300,
    },
    {
      stageId:
        '2d33de11-3a34-412a-b90a-847d4839c8d9',
      profile:
        'mountain',
      label:
        'Mentougou International Road Race Stage 3 · Zhaitang Mountain Circuit',
      maximumFinishTimeDifferenceSeconds:
        600,
    },
  ]

type JsonObject =
  Record<string, unknown>

export interface LiveShadowSourceBundle {
  readonly status: string
  readonly bundle_version: string
  readonly generated_at?:
    unknown

  readonly race_id: string
  readonly stage_id: string
  readonly stage_format: string

  readonly stage: JsonObject
  readonly profile_detail:
    JsonObject

  readonly teams:
    readonly JsonObject[]
  readonly participants:
    readonly JsonObject[]
  readonly rider_inputs:
    readonly JsonObject[]
  readonly phase_commands:
    readonly JsonObject[]

  readonly official_results:
    readonly JsonObject[]
  readonly official_simulation_runs:
    readonly JsonObject[]

  readonly counts:
    JsonObject
  readonly safety:
    JsonObject
}

export interface LiveShadowClassification {
  readonly riderId: string
  readonly riderName:
    string | null
  readonly teamName:
    string | null

  readonly finishPosition:
    number | null
  readonly finishTimeSeconds:
    number | null
  readonly finished: boolean
}

export interface LiveShadowRiderDifference {
  readonly riderId: string
  readonly officialPosition:
    number | null
  readonly deterministicPosition:
    number | null
  readonly officialTimeSeconds:
    number | null
  readonly deterministicTimeSeconds:
    number | null
  readonly absoluteTimeDifferenceSeconds:
    number | null
}

export interface LiveStagingShadowStageExecution {
  readonly report:
    LiveStagingShadowStageReport
  readonly replayModel:
    ReplayStageModel
  readonly simulationOutput:
    ReturnType<
      typeof runDeterministicRoadRace
    >
}

export interface LiveStagingShadowStageReport {
  readonly reportVersion:
    'phase_8j8a_live_shadow_stage_report_v1'

  readonly stageId: string
  readonly profile:
    LiveShadowStageProfile
  readonly label: string

  readonly sourceBundleVersion:
    string
  readonly raceName: string
  readonly stageName: string
  readonly distanceKm: number

  readonly sourceRowCount: number
  readonly executableTeamCount:
    number
  readonly executableRiderCount:
    number
  readonly profilePointCount:
    number
  readonly orderCount: number

  readonly officialResultCount:
    number
  readonly officialSimulationRunCount:
    number

  readonly sourceRowsHash: string
  readonly repeatedSourceRowsHash:
    string
  readonly stageInputHash: string
  readonly repeatedStageInputHash:
    string
  readonly deterministicOutputHash:
    string
  readonly repeatedDeterministicOutputHash:
    string
  readonly replayModelHash: string
  readonly repeatedReplayModelHash:
    string

  readonly deterministicSnapshotCount:
    number
  readonly deterministicEventCount:
    number
  readonly replayFrameCount:
    number
  readonly replayValidationIssues:
    readonly string[]

  readonly officialClassifications:
    readonly LiveShadowClassification[]
  readonly deterministicClassifications:
    readonly LiveShadowClassification[]

  readonly riderCoverageMatches:
    boolean
  readonly officialWinnerRiderId:
    string | null
  readonly deterministicWinnerRiderId:
    string | null
  readonly winnerMatches: boolean
  readonly exactFinishOrderMatches:
    boolean

  readonly comparedTimeCount:
    number
  readonly maximumTimeDifferenceSeconds:
    number | null
  readonly averageTimeDifferenceSeconds:
    number | null
  readonly configuredTimeToleranceSeconds:
    number
  readonly finishTimeTolerancePassed:
    boolean

  readonly riderDifferences:
    readonly LiveShadowRiderDifference[]

  readonly executionPassed:
    boolean
  readonly strictMigrationComparisonPassed:
    boolean

  readonly checks:
    readonly {
      readonly label: string
      readonly passed: boolean
    }[]

  readonly sourceReadOnly:
    boolean
  readonly databaseWritesPerformed:
    false
  readonly deterministicWriterCalls:
    0
  readonly officialResultMutationAllowed:
    false
  readonly replayPersisted:
    false
  readonly routeChanged:
    false
  readonly playerUiExposed:
    false

  readonly reportHash: string
}

export interface LiveStagingShadowBatchReport {
  readonly reportVersion:
    'phase_8j8a_live_shadow_batch_report_v1'

  readonly stageCount: number
  readonly flatCount: number
  readonly hillyCount: number
  readonly mountainCount:
    number

  readonly executionPassingStageCount:
    number
  readonly strictComparisonPassingStageCount:
    number

  readonly executionPassed:
    boolean
  readonly strictMigrationAcceptancePassed:
    boolean

  readonly environmentAttested:
    boolean
  readonly connectedProjectHostHash:
    string

  readonly stages:
    readonly LiveStagingShadowStageReport[]

  readonly checks:
    readonly {
      readonly label: string
      readonly passed: boolean
    }[]

  readonly databaseWritesPerformed:
    false
  readonly persistenceEnabled:
    false
  readonly productionRouteChanged:
    false
  readonly playerUiExposed:
    false
  readonly deploymentPerformed:
    false

  readonly reportHash: string
}

function asObject(
  value: unknown,
): JsonObject {
  return (
    value !== null &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {}
}

function asArray(
  value: unknown,
): readonly unknown[] {
  return Array.isArray(value)
    ? value
    : []
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    )
  }

  return value.trim()
}

function nullableString(
  value: unknown,
): string | null {
  return (
    typeof value ===
      'string' &&
    value.trim().length >
      0
  )
    ? value.trim()
    : null
}

function requireNumber(
  value: unknown,
  fieldName: string,
): number {
  const numeric =
    typeof value ===
      'number'
      ? value
      : Number(value)

  if (!Number.isFinite(numeric)) {
    throw new Error(
      `${fieldName} must be a finite number.`,
    )
  }

  return numeric
}

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const numeric =
    typeof value ===
      'number'
      ? value
      : Number(value)

  return Number.isFinite(numeric)
    ? numeric
    : null
}

function nullableInteger(
  value: unknown,
): number | null {
  const numeric =
    nullableNumber(value)

  if (
    numeric === null ||
    !Number.isInteger(numeric)
  ) {
    return null
  }

  return numeric
}

function normalizeStagePlanRole(
  value: unknown,
): string {
  const source =
    String(value ?? '')
      .trim()
      .toLowerCase()

  const roleMap:
    Readonly<
      Record<string, string>
    > = {
      leader:
        'team_leader_gc',
      captain:
        'team_leader_gc',
      gc_leader:
        'team_leader_gc',
      team_leader_gc:
        'team_leader_gc',

      sprinter:
        'sprinter',

      lead_out:
        'lead_out_rider',
      lead_out_rider:
        'lead_out_rider',
      sprint_train:
        'sprint_train_rider',
      sprint_train_rider:
        'sprint_train_rider',

      domestique:
        'helper_domestique',
      helper:
        'helper_domestique',
      helper_domestique:
        'helper_domestique',
      mountain_domestique:
        'mountain_domestique',

      breakaway:
        'breakaway_rider',
      breakaway_rider:
        'breakaway_rider',
      breakaway_chaser:
        'breakaway_chaser',

      protected:
        'protected_rider',
      protected_rider:
        'protected_rider',

      climber:
        'climber',
      rouleur:
        'rouleur',
      free_role:
        'free_role',
      selected:
        'free_role',
    }

  return roleMap[source] ??
    'free_role'
}

const ROAD_PHASE_1_TO_3_INDIVIDUAL_COMMANDS =
  new Set([
    'follow_team_plan',
    'protect_leader',
    'stay_near_front',
    'conserve_energy',
    'control_tempo',
    'chase_breakaway',
    'attack',
    'join_breakaway',
    'fight_sprint_points',
    'fight_kom_points',
    'avoid_risks',
  ])

const ROAD_PHASE_4_INDIVIDUAL_COMMANDS =
  new Set([
    'follow_team_plan',
    'protect_leader',
    'stay_near_front',
    'fight_sprint_points',
    'fight_kom_points',
    'sprint_train_rider',
    'lead_out_rider',
    'final_sprint',
    'avoid_risks',
  ])

type LiveRoadPhase =
  | 'phase_1'
  | 'phase_2'
  | 'phase_3'
  | 'phase_4'

function normalizeLiveIndividualPhaseCommand(
  value:
    unknown,
  phase:
    LiveRoadPhase,
): string {
  const normalized =
    String(
      value ?? '',
    )
      .trim()
      .toLowerCase()

  const allowedCommands =
    phase ===
      'phase_4'
      ? ROAD_PHASE_4_INDIVIDUAL_COMMANDS
      : ROAD_PHASE_1_TO_3_INDIVIDUAL_COMMANDS

  /*
   * The read-only RPC currently returns resolved phase values. Those values
   * may contain an inherited legacy team-plan fallback such as balanced,
   * aggressive, breakaway, or gc_protection.
   *
   * Such values are not current Individual Tactics. The current UI default is
   * Follow Stage Role, stored under the legacy code follow_team_plan.
   */
  return allowedCommands.has(
    normalized,
  )
    ? normalized
    : 'follow_team_plan'
}

function createStagePlans(
  stageId: string,
  phaseCommands:
    readonly JsonObject[],
): readonly StagePlanSourceRow[] {
  const rolesByTeam =
    new Map<
      string,
      Record<string, string>
    >()

  const phaseCommandsByTeam =
    new Map<
      string,
      Record<
        string,
        {
          readonly phase_1:
            string | null
          readonly phase_2:
            string | null
          readonly phase_3:
            string | null
          readonly phase_4:
            string | null
        }
      >
    >()

  for (
    const command of
    phaseCommands
  ) {
    const teamId =
      requireString(
        command.team_id,
        'phase command team_id',
      )

    const riderId =
      requireString(
        command.rider_id,
        'phase command rider_id',
      )

    const roles =
      rolesByTeam.get(teamId) ??
      {}

    roles[riderId] =
      normalizeStagePlanRole(
        command.role_code,
      )

    rolesByTeam.set(
      teamId,
      roles,
    )

    const riderPhaseCommands =
      phaseCommandsByTeam.get(
        teamId,
      ) ?? {}

    riderPhaseCommands[
      riderId
    ] = {
      phase_1:
        normalizeLiveIndividualPhaseCommand(
          command.phase_1_command,
          'phase_1',
        ),

      phase_2:
        normalizeLiveIndividualPhaseCommand(
          command.phase_2_command,
          'phase_2',
        ),

      phase_3:
        normalizeLiveIndividualPhaseCommand(
          command.phase_3_command,
          'phase_3',
        ),

      phase_4:
        normalizeLiveIndividualPhaseCommand(
          command.phase_4_command,
          'phase_4',
        ),
    }

    phaseCommandsByTeam.set(
      teamId,
      riderPhaseCommands,
    )
  }

  return Array.from(
    rolesByTeam.entries(),
  )
    .sort(
      (
        [left],
        [right],
      ) =>
        left.localeCompare(
          right,
        ),
    )
    .map(
      (
        [
          teamId,
          riderRoles,
        ],
      ) => ({
        id:
          `live-shadow:${stageId}:${teamId}`,
        club_id:
          teamId,
        participating_club_id:
          teamId,
        status:
          'submitted',
        metadata:
          null,
        rider_roles_json:
          riderRoles,

        rider_phase_commands_json:
          phaseCommandsByTeam.get(
            teamId,
          ) ?? {},
      }),
    )
}

function createProfilePoints(
  profileDetail: JsonObject,
): readonly ProfilePointSourceRow[] {
  return asArray(
    profileDetail.profile_points,
  )
    .map(
      (
        value,
        index,
      ):
        ProfilePointSourceRow => {
        const point =
          asObject(value)

        return {
          km:
            requireNumber(
              point.km ??
                point.kilometre ??
                point.distance_km,
              `profile point ${index} km`,
            ),

          elevation_m:
            requireNumber(
              point.elevation_m ??
                point.elevation ??
                point.elevationMetres,
              `profile point ${index} elevation`,
            ),
        }
      },
    )
}

function createParticipantTeams(
  rows:
    readonly JsonObject[],
): readonly ParticipantTeamSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      team_id:
        requireString(
          row.team_id,
          `team ${index} team_id`,
        ),

      status:
        requireString(
          row.status,
          `team ${index} status`,
        ),

      team_name_snapshot:
        nullableString(
          row.team_name_snapshot,
        ),
    }),
  )
}

function createParticipantRiders(
  rows:
    readonly JsonObject[],
): readonly ParticipantRiderSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      rider_id:
        requireString(
          row.rider_id,
          `participant ${index} rider_id`,
        ),

      team_id:
        requireString(
          row.team_id,
          `participant ${index} team_id`,
        ),

      start_number:
        nullableNumber(
          row.start_number,
        ),

      role_snapshot:
        nullableString(
          row.role_snapshot,
        ),
    }),
  )
}

function createRiders(
  rows:
    readonly JsonObject[],
): readonly RiderSourceRow[] {
  return rows.map(
    (
      row,
      index,
    ) => ({
      id:
        requireString(
          row.rider_id,
          `rider ${index} rider_id`,
        ),

      first_name:
        null,
      last_name:
        null,

      display_name:
        requireString(
          row.rider_name,
          `rider ${index} rider_name`,
        ),

      flat:
        requireNumber(
          row.flat,
          `rider ${index} flat`,
        ),

      climbing:
        requireNumber(
          row.climbing,
          `rider ${index} climbing`,
        ),

      sprint:
        requireNumber(
          row.sprint,
          `rider ${index} sprint`,
        ),

      time_trial:
        requireNumber(
          row.time_trial,
          `rider ${index} time_trial`,
        ),

      endurance:
        requireNumber(
          row.endurance,
          `rider ${index} endurance`,
        ),

      resistance:
        requireNumber(
          row.resistance,
          `rider ${index} resistance`,
        ),

      recovery:
        requireNumber(
          row.recovery,
          `rider ${index} recovery`,
        ),

      race_iq:
        requireNumber(
          row.race_iq,
          `rider ${index} race_iq`,
        ),

      teamwork:
        requireNumber(
          row.teamwork,
          `rider ${index} teamwork`,
        ),

      fatigue:
        nullableNumber(
          row.fatigue,
        ),

      fatigue_before_stage:
        nullableNumber(
          row.fatigue_before_stage,
        ),

      start_stamina:
        nullableNumber(
          row.start_stamina,
        ),

      morale:
        nullableNumber(
          row.morale,
        ),

      availability_status:
        nullableString(
          row.availability_status,
        ),
    }),
  )
}

export function createLiveShadowSourceRows(
  bundle:
    LiveShadowSourceBundle,
): CreateStageInputFromSourceRowsParams {
  const stage =
    bundle.stage

  const profileDetail =
    bundle.profile_detail

  return {
    race: {
      id:
        requireString(
          bundle.race_id,
          'bundle race_id',
        ),

      name:
        requireString(
          stage.race_name,
          'stage race_name',
        ),
    },

    stage: {
      id:
        requireString(
          bundle.stage_id,
          'bundle stage_id',
        ),

      race_id:
        requireString(
          bundle.race_id,
          'bundle race_id',
        ),

      name:
        requireString(
          stage.name,
          'stage name',
        ),

      stage_format:
        requireString(
          bundle.stage_format,
          'bundle stage_format',
        ),

      distance_km:
        requireNumber(
          stage.distance_km,
          'stage distance_km',
        ),
    },

    weather: {
      stageSnapshot:
        asObject(
          stage.weather_snapshot,
        ),

      stageSummary:
        nullableString(
          stage.weather_summary,
        ),

      profileSnapshot:
        asObject(
          profileDetail
            .weather_snapshot,
        ),

      profileSummary:
        nullableString(
          profileDetail
            .weather_summary,
        ),
    },

    participantTeams:
      createParticipantTeams(
        bundle.teams,
      ),

    participantRiders:
      createParticipantRiders(
        bundle.participants,
      ),

    riders:
      createRiders(
        bundle.rider_inputs,
      ),

    stagePlans:
      createStagePlans(
        bundle.stage_id,
        bundle.phase_commands,
      ),

    profilePoints:
      createProfilePoints(
        profileDetail,
      ),
  }
}

function officialClassifications(
  rows:
    readonly JsonObject[],
): readonly LiveShadowClassification[] {
  return rows
    .map(
      (
        row,
        index,
      ):
        LiveShadowClassification => {
        const riderId =
          requireString(
            row.rider_id,
            `official result ${index} rider_id`,
          )

        const rank =
          nullableInteger(
            row.rank ??
              row.finish_position,
          )

        const elapsed =
          nullableNumber(
            row.elapsed_seconds ??
              row.finish_time_seconds,
          )

        return {
          riderId,

          riderName:
            nullableString(
              row.rider_name_snapshot ??
                row.rider_name,
            ),

          teamName:
            nullableString(
              row.team_name_snapshot ??
                row.team_name,
            ),

          finishPosition:
            rank,

          finishTimeSeconds:
            elapsed,

          finished:
            rank !== null &&
            elapsed !== null,
        }
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        (
          left.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) -
        (
          right.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) ||
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
}

function deterministicClassifications(
  output:
    ReturnType<
      typeof runDeterministicRoadRace
    >,
): readonly LiveShadowClassification[] {
  return output.finalRiderStates
    .map(
      (
        rider,
      ):
        LiveShadowClassification => ({
        riderId:
          rider.riderId,

        riderName:
          rider.riderName,

        teamName:
          rider.teamName,

        finishPosition:
          rider.finishPosition,

        finishTimeSeconds:
          rider.finishTimeSeconds,

        finished:
          rider.finished,
      }),
    )
    .sort(
      (
        left,
        right,
      ) =>
        (
          left.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) -
        (
          right.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) ||
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
}

function riderSet(
  classifications:
    readonly LiveShadowClassification[],
): ReadonlySet<string> {
  return new Set(
    classifications.map(
      (
        classification,
      ) =>
        classification.riderId,
    ),
  )
}

function setsEqual(
  left:
    ReadonlySet<string>,
  right:
    ReadonlySet<string>,
): boolean {
  if (
    left.size !==
    right.size
  ) {
    return false
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }

  return true
}

function finishOrder(
  classifications:
    readonly LiveShadowClassification[],
): readonly string[] {
  return classifications
    .filter(
      (
        classification,
      ) =>
        classification.finished &&
        classification
          .finishPosition !==
          null,
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        (
          left.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) -
        (
          right.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) ||
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
    .map(
      (
        classification,
      ) =>
        classification.riderId,
    )
}

function mapByRider(
  classifications:
    readonly LiveShadowClassification[],
): ReadonlyMap<
  string,
  LiveShadowClassification
> {
  const map =
    new Map<
      string,
      LiveShadowClassification
    >()

  for (
    const classification of
    classifications
  ) {
    if (
      map.has(
        classification.riderId,
      )
    ) {
      throw new Error(
        `Duplicate classification rider ${classification.riderId}.`,
      )
    }

    map.set(
      classification.riderId,
      classification,
    )
  }

  return map
}

function sumSourceRows(
  bundle:
    LiveShadowSourceBundle,
): number {
  return (
    bundle.teams.length +
    bundle.participants.length +
    bundle.rider_inputs.length +
    bundle.phase_commands.length +
    asArray(
      bundle
        .profile_detail
        .profile_points,
    ).length +
    bundle.official_results.length +
    bundle
      .official_simulation_runs
      .length
  )
}

export function executeLiveStagingShadowStageValidation(
  input: {
    readonly definition:
      LiveShadowStageDefinition
    readonly bundle:
      LiveShadowSourceBundle
  },
): LiveStagingShadowStageExecution {
  const {
    definition,
    bundle,
  } = input

  if (
    bundle.stage_id !==
    definition.stageId
  ) {
    throw new Error(
      `Expected stage ${definition.stageId}, received ${bundle.stage_id}.`,
    )
  }

  if (
    bundle.status !==
    'source_bundle_ready'
  ) {
    throw new Error(
      `Source bundle status is ${bundle.status}.`,
    )
  }

  const sourceRows =
    createLiveShadowSourceRows(
      bundle,
    )

  const sourceRowsHashA =
    createCanonicalHashedValue(
      sourceRows,
    )

  const stageInputA =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const stageInputHashA =
    createCanonicalHashedValue(
      stageInputA,
    )

  const outputA =
    runDeterministicRoadRace(
      stageInputA,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const outputHashA =
    createCanonicalHashedValue(
      outputA,
    )

  const replayModelA =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        stageInputA,
      simulationOutput:
        outputA,
    })

  const replayModelHashA =
    createCanonicalHashedValue(
      replayModelA,
    )

  const replayValidation =
    validateReplayStageModel(
      replayModelA,
    )

  const sourceRowsHashB =
    createCanonicalHashedValue(
      sourceRows,
    )

  const stageInputB =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const stageInputHashB =
    createCanonicalHashedValue(
      stageInputB,
    )

  const outputB =
    runDeterministicRoadRace(
      stageInputB,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const outputHashB =
    createCanonicalHashedValue(
      outputB,
    )

  const replayModelB =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        stageInputB,
      simulationOutput:
        outputB,
    })

  const replayModelHashB =
    createCanonicalHashedValue(
      replayModelB,
    )

  const official =
    officialClassifications(
      bundle.official_results,
    )

  const deterministic =
    deterministicClassifications(
      outputA,
    )

  const officialMap =
    mapByRider(official)

  const deterministicMap =
    mapByRider(
      deterministic,
    )

  const allRiderIds =
    Array.from(
      new Set([
        ...officialMap.keys(),
        ...deterministicMap.keys(),
      ]),
    ).sort(
      (
        left,
        right,
      ) =>
        left.localeCompare(
          right,
        ),
    )

  const riderDifferences:
    readonly LiveShadowRiderDifference[] =
      allRiderIds.map(
        (
          riderId,
        ) => {
          const officialRow =
            officialMap.get(
              riderId,
            )

          const deterministicRow =
            deterministicMap.get(
              riderId,
            )

          const officialTime =
            officialRow
              ?.finishTimeSeconds ??
            null

          const deterministicTime =
            deterministicRow
              ?.finishTimeSeconds ??
            null

          return {
            riderId,

            officialPosition:
              officialRow
                ?.finishPosition ??
              null,

            deterministicPosition:
              deterministicRow
                ?.finishPosition ??
              null,

            officialTimeSeconds:
              officialTime,

            deterministicTimeSeconds:
              deterministicTime,

            absoluteTimeDifferenceSeconds:
              officialTime !==
                  null &&
                deterministicTime !==
                  null
                ? Math.abs(
                    officialTime -
                    deterministicTime,
                  )
                : null,
          }
        },
      )

  const comparedTimeDifferences =
    riderDifferences
      .map(
        (
          difference,
        ) =>
          difference
            .absoluteTimeDifferenceSeconds,
      )
      .filter(
        (
          value,
        ):
          value is number =>
          value !== null,
      )

  const maximumTimeDifferenceSeconds =
    comparedTimeDifferences.length >
    0
      ? Math.max(
          ...comparedTimeDifferences,
        )
      : null

  const averageTimeDifferenceSeconds =
    comparedTimeDifferences.length >
    0
      ? (
          comparedTimeDifferences.reduce(
            (
              total,
              value,
            ) =>
              total + value,
            0,
          ) /
          comparedTimeDifferences.length
        )
      : null

  const officialOrder =
    finishOrder(official)

  const deterministicOrder =
    finishOrder(
      deterministic,
    )

  const officialWinnerRiderId =
    officialOrder[0] ??
    null

  const deterministicWinnerRiderId =
    deterministicOrder[0] ??
    null

  const riderCoverageMatches =
    setsEqual(
      riderSet(official),
      riderSet(
        deterministic,
      ),
    )

  const exactFinishOrderMatches =
    JSON.stringify(
      officialOrder,
    ) ===
    JSON.stringify(
      deterministicOrder,
    )

  const winnerMatches =
    officialWinnerRiderId !==
      null &&
    officialWinnerRiderId ===
      deterministicWinnerRiderId

  const finishTimeTolerancePassed =
    maximumTimeDifferenceSeconds !==
      null &&
    maximumTimeDifferenceSeconds <=
      definition
        .maximumFinishTimeDifferenceSeconds

  const sourceReadOnly =
    bundle.safety.read_only ===
      true &&
    bundle
      .safety
      .database_writes_performed ===
      false

  const sourceDeterministic =
    sourceRowsHashA.hash ===
    sourceRowsHashB.hash

  const inputDeterministic =
    stageInputHashA.hash ===
    stageInputHashB.hash

  const outputDeterministic =
    outputHashA.hash ===
    outputHashB.hash

  const replayDeterministic =
    replayModelHashA.hash ===
    replayModelHashB.hash

  const deterministicClassificationsComplete =
    deterministic.length ===
      stageInputA.riders.length &&
    deterministic.every(
      (
        classification,
      ) =>
        classification.finished &&
        classification
          .finishPosition !==
          null &&
        classification
          .finishTimeSeconds !==
          null,
    )

  const checks = [
    {
      label:
        'Source bundle is read-only and reports zero database writes',
      passed:
        sourceReadOnly,
    },
    {
      label:
        'Source rows remain unchanged across repeated execution',
      passed:
        sourceDeterministic,
    },
    {
      label:
        'Repeated StageInput values are identical',
      passed:
        inputDeterministic,
    },
    {
      label:
        'Repeated deterministic outputs are identical',
      passed:
        outputDeterministic,
    },
    {
      label:
        'Repeated generic replay models are identical',
      passed:
        replayDeterministic,
    },
    {
      label:
        'Public deterministic SimulationOutput contract is preserved',
      passed:
        outputA.engineVersion ===
          'race_engine_ts_v1' &&
        outputA.simulationMode ===
          'deterministic_road_race_v1',
    },
    {
      label:
        'Every executable rider has a complete deterministic classification',
      passed:
        deterministicClassificationsComplete,
    },
    {
      label:
        'Generic replay model validates and contains frames',
      passed:
        replayValidation.valid &&
        replayValidation.issues.length ===
          0 &&
        replayModelA.frames.length >
          0,
    },
    {
      label:
        'Persisted official legacy classifications are available',
      passed:
        official.length >
        0,
    },
    {
      label:
        'Official and deterministic rider coverage matches',
      passed:
        riderCoverageMatches,
    },
  ] as const

  const executionPassed =
    checks.every(
      (
        check,
      ) =>
        check.passed,
    )

  const strictMigrationComparisonPassed =
    executionPassed &&
    winnerMatches &&
    exactFinishOrderMatches &&
    finishTimeTolerancePassed

  const withoutHash = {
    reportVersion:
      'phase_8j8a_live_shadow_stage_report_v1' as const,

    stageId:
      definition.stageId,
    profile:
      definition.profile,
    label:
      definition.label,

    sourceBundleVersion:
      bundle.bundle_version,

    raceName:
      requireString(
        bundle.stage.race_name,
        'race name',
      ),

    stageName:
      requireString(
        bundle.stage.name,
        'stage name',
      ),

    distanceKm:
      requireNumber(
        bundle.stage.distance_km,
        'distance km',
      ),

    sourceRowCount:
      sumSourceRows(bundle),

    executableTeamCount:
      stageInputA.teams.length,

    executableRiderCount:
      stageInputA.riders.length,

    profilePointCount:
      stageInputA
        .profilePoints
        .length,

    orderCount:
      stageInputA.orders.length,

    officialResultCount:
      official.length,

    officialSimulationRunCount:
      bundle
        .official_simulation_runs
        .length,

    sourceRowsHash:
      sourceRowsHashA.hash,

    repeatedSourceRowsHash:
      sourceRowsHashB.hash,

    stageInputHash:
      stageInputHashA.hash,

    repeatedStageInputHash:
      stageInputHashB.hash,

    deterministicOutputHash:
      outputHashA.hash,

    repeatedDeterministicOutputHash:
      outputHashB.hash,

    replayModelHash:
      replayModelHashA.hash,

    repeatedReplayModelHash:
      replayModelHashB.hash,

    deterministicSnapshotCount:
      outputA.snapshots.length,

    deterministicEventCount:
      outputA.events.length,

    replayFrameCount:
      replayModelA.frames.length,

    replayValidationIssues:
      replayValidation.issues.map(
        (
          issue,
        ) =>
          issue.message,
      ),

    officialClassifications:
      official,

    deterministicClassifications:
      deterministic,

    riderCoverageMatches,

    officialWinnerRiderId,
    deterministicWinnerRiderId,
    winnerMatches,
    exactFinishOrderMatches,

    comparedTimeCount:
      comparedTimeDifferences.length,

    maximumTimeDifferenceSeconds,

    averageTimeDifferenceSeconds,

    configuredTimeToleranceSeconds:
      definition
        .maximumFinishTimeDifferenceSeconds,

    finishTimeTolerancePassed,

    riderDifferences,

    executionPassed,
    strictMigrationComparisonPassed,

    checks,

    sourceReadOnly,

    databaseWritesPerformed:
      false as const,

    deterministicWriterCalls:
      0 as const,

    officialResultMutationAllowed:
      false as const,

    replayPersisted:
      false as const,

    routeChanged:
      false as const,

    playerUiExposed:
      false as const,
  }

  const report:
    LiveStagingShadowStageReport = {
    ...withoutHash,

    reportHash:
      createCanonicalHashedValue(
        withoutHash,
      ).hash,
  }

  return {
    report,
    replayModel:
      replayModelA,
    simulationOutput:
      outputA,
  }
}

export function createLiveStagingShadowStageReport(
  input: {
    readonly definition:
      LiveShadowStageDefinition
    readonly bundle:
      LiveShadowSourceBundle
  },
): LiveStagingShadowStageReport {
  return executeLiveStagingShadowStageValidation(
    input,
  ).report
}

export function createLiveStagingShadowBatchReport(
  input: {
    readonly stages:
      readonly LiveStagingShadowStageReport[]
    readonly environmentAttested:
      boolean
    readonly connectedProjectHost:
      string
  },
): LiveStagingShadowBatchReport {
  const host =
    input
      .connectedProjectHost
      .trim()
      .toLowerCase()

  const connectedProjectHostHash =
    createCanonicalHashedValue({
      contract:
        'phase_8j8a_connected_project_host_v1',
      host,
    }).hash

  const flatCount =
    input.stages.filter(
      (
        report,
      ) =>
        report.profile ===
        'flat',
    ).length

  const hillyCount =
    input.stages.filter(
      (
        report,
      ) =>
        report.profile ===
        'hilly',
    ).length

  const mountainCount =
    input.stages.filter(
      (
        report,
      ) =>
        report.profile ===
        'mountain',
    ).length

  const executionPassingStageCount =
    input.stages.filter(
      (
        report,
      ) =>
        report.executionPassed,
    ).length

  const strictComparisonPassingStageCount =
    input.stages.filter(
      (
        report,
      ) =>
        report
          .strictMigrationComparisonPassed,
    ).length

  const uniqueStageIds =
    new Set(
      input.stages.map(
        (
          report,
        ) =>
          report.stageId,
      ),
    )

  const checks = [
    {
      label:
        'The operator explicitly attested that the connected Supabase project is staging',
      passed:
        input.environmentAttested,
    },
    {
      label:
        'Exactly three unique live stage reports are present',
      passed:
        input.stages.length ===
          3 &&
        uniqueStageIds.size ===
          3,
    },
    {
      label:
        'Flat, hilly, and mountain profile coverage is complete',
      passed:
        flatCount ===
          1 &&
        hillyCount ===
          1 &&
        mountainCount ===
          1,
    },
    {
      label:
        'Every live stage completes deterministic and generic replay validation',
      passed:
        executionPassingStageCount ===
        input.stages.length,
    },
    {
      label:
        'Every live stage reports read-only source access and zero writes',
      passed:
        input.stages.every(
          (
            report,
          ) =>
            report.sourceReadOnly &&
            !report
              .databaseWritesPerformed &&
            report
              .deterministicWriterCalls ===
              0,
        ),
    },
    {
      label:
        'No report persists replay, mutates official output, changes routes, or exposes player UI',
      passed:
        input.stages.every(
          (
            report,
          ) =>
            !report.replayPersisted &&
            !report
              .officialResultMutationAllowed &&
            !report.routeChanged &&
            !report.playerUiExposed,
        ),
    },
  ] as const

  const executionPassed =
    checks.every(
      (
        check,
      ) =>
        check.passed,
    )

  const strictMigrationAcceptancePassed =
    executionPassed &&
    strictComparisonPassingStageCount ===
      input.stages.length

  const withoutHash = {
    reportVersion:
      'phase_8j8a_live_shadow_batch_report_v1' as const,

    stageCount:
      input.stages.length,
    flatCount,
    hillyCount,
    mountainCount,

    executionPassingStageCount,
    strictComparisonPassingStageCount,

    executionPassed,
    strictMigrationAcceptancePassed,

    environmentAttested:
      input.environmentAttested,
    connectedProjectHostHash,

    stages:
      input.stages,

    checks,

    databaseWritesPerformed:
      false as const,

    persistenceEnabled:
      false as const,

    productionRouteChanged:
      false as const,

    playerUiExposed:
      false as const,

    deploymentPerformed:
      false as const,
  }

  return {
    ...withoutHash,

    reportHash:
      createCanonicalHashedValue(
        withoutHash,
      ).hash,
  }
}
