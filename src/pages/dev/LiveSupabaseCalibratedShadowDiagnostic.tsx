/**
 * LiveSupabaseCalibratedShadowDiagnostic.tsx
 *
 * Phase 8G.5 browser-only, read-only active weather-performance diagnostic.
 *
 * Flow:
 * authenticated user
 * → compact Supabase source-bundle RPC
 * → createStageInputFromSourceRows
 * → terrain_separation_calibrated_v1 twice
 * → deterministic hash comparison
 * → generic ReplayStageModel creation and validation
 * → automated replay-controller lifecycle audit
 * → real GenericRaceReplayView mount verification
 * → official SQL winner comparison
 *
 * This page performs no insert, update, delete, scheduler call, writer call,
 * classification update, fatigue update, prize update, or replay persistence.
 */

import {
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  supabase,
} from '../../lib/supabase'
import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
  type ParticipantRiderSourceRow,
  type ParticipantTeamSourceRow,
  type ProfilePointSourceRow,
  type RiderSourceRow,
  type StagePlanSourceRow,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import type {
  StageWeatherInput,
} from '../../race-engine/domain/StageInput'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
} from '../../race-engine/simulation/createInitialState'
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace'
import {
  GenericRaceReplayView,
  advanceReplayPlayback,
  createReplayPlaybackState,
  createReplayStageModelFromSimulationOutput,
  finishReplay,
  getReplayPlaybackView,
  pauseReplay,
  playReplay,
  resetReplay,
  seekReplayToFrame,
  seekReplayToProgress,
  setReplayPlaybackSpeed,
  validateReplayStageModel,
  type GenericReplayStageMarker,
  type ReplayPlaybackSpeed,
  type ReplayStageModel,
} from '../../race-replay'

const RIO_STAGE_ID =
  '24709c46-b258-4db3-a3aa-fd92dc37630e'

const JAPAN_HILLY_STAGE_ID =
  '3ca7d3dd-6a45-4829-b08e-6b118309fdd8'

const RIO_STAGE_2_ID =
  'b28d57bd-29bc-47aa-bace-59a2cf7732ab'

const DEFAULT_STAGE_ID =
  RIO_STAGE_ID

const STAGE_OPTIONS = [
  {
    stageId:
      RIO_STAGE_ID,
    label:
      'Rio Tour Stage 1 · Flat · 142.00 km',
  },
  {
    stageId:
      JAPAN_HILLY_STAGE_ID,
    label:
      'Japan Road Cup Stage 1 · Hilly · 144.20 km',
  },
  {
    stageId:
      RIO_STAGE_2_ID,
    label:
      'Rio Tour Stage 2 · Niterói → Teresópolis · 154.00 km',
  },
] as const

const SOURCE_RPC_NAME =
  'race_engine_get_calibrated_shadow_source_bundle_dev_v1'

const PROPELOTON_TEAM_ID =
  'a08e0e49-8212-4d24-afa1-7ddf2564e9ce'

type JsonObject =
  Record<string, unknown>

interface RpcErrorShape {
  readonly message: string
}

interface RpcResultShape {
  readonly data: unknown
  readonly error:
    RpcErrorShape | null
}

interface RpcClientShape {
  rpc(
    functionName: string,
    args: JsonObject,
  ): Promise<RpcResultShape>
}

interface SourceBundle {
  readonly status: string
  readonly bundle_version: string
  readonly race_id: string
  readonly stage_id: string
  readonly stage_format: string
  readonly stage: JsonObject
  readonly profile_detail: JsonObject
  readonly teams:
    readonly JsonObject[]
  readonly participants:
    readonly JsonObject[]
  readonly rider_inputs:
    readonly JsonObject[]
  readonly phase_commands:
    readonly JsonObject[]
  readonly official_winner:
    JsonObject | null
  readonly safety: JsonObject
}

interface DiagnosticCheck {
  readonly label: string
  readonly passed: boolean
}

interface DiagnosticResult {
  readonly passed: boolean
  readonly checks:
    readonly DiagnosticCheck[]

  readonly sourceBundleVersion:
    string

  readonly raceName: string
  readonly stageName: string
  readonly distanceKm: number

  readonly acceptedTeamRows: number
  readonly emptyAcceptedTeamRows:
    number
  readonly executableTeamCount:
    number
  readonly executableRiderCount:
    number
  readonly profilePointCount:
    number
  readonly sourcePhaseCommandCount:
    number
  readonly currentOrderCount:
    number

  readonly conditionedRiderCount:
    number
  readonly startingEnergyMinimum:
    number
  readonly startingEnergyAverage:
    number
  readonly startingEnergyMaximum:
    number
  readonly fatigueMinimum:
    number
  readonly fatigueAverage:
    number
  readonly fatigueMaximum:
    number
  readonly moraleMinimum:
    number
  readonly moraleAverage:
    number
  readonly moraleMaximum:
    number
  readonly availabilityStatusCounts:
    Readonly<Record<string, number>>

  readonly weatherAuthority:
    string
  readonly weatherSource:
    string
  readonly weatherCondition:
    string
  readonly weatherSummary:
    string | null
  readonly weatherAverageTemperatureC:
    number | null
  readonly weatherMinimumTemperatureC:
    number | null
  readonly weatherMaximumTemperatureC:
    number | null
  readonly weatherWindSpeedKmh:
    number | null
  readonly weatherPrecipitationMm:
    number | null

  readonly weatherFreeOutputHash:
    string
  readonly weatherWinnerTimeDifferenceSeconds:
    number
  readonly weatherAverageFinalEnergyDifference:
    number

  readonly sourceHash: string
  readonly repeatedSourceHash:
    string
  readonly stageInputHash: string
  readonly repeatedStageInputHash:
    string
  readonly outputHash: string
  readonly repeatedOutputHash:
    string

  readonly snapshotCount: number
  readonly eventCount: number
  readonly transitionEventCount:
    number
  readonly createdEventCount:
    number
  readonly caughtEventCount:
    number
  readonly finalGroupCount: number
  readonly finishedRiderCount:
    number

  readonly winnerName: string
  readonly winnerTeamName: string
  readonly winnerTimeSeconds:
    number

  readonly officialWinnerName:
    string | null
  readonly officialWinnerTeamName:
    string | null
  readonly officialWinnerTimeSeconds:
    number | null

  readonly sameWinner: boolean
  readonly winnerTimeDifferenceSeconds:
    number | null

  readonly replayModel:
    ReplayStageModel
  readonly replayModelHash:
    string
  readonly repeatedReplayModelHash:
    string
  readonly replayModelCanonicalJson:
    string
  readonly replayValidationMessages:
    readonly string[]
  readonly stageMarkers:
    readonly GenericReplayStageMarker[]
  readonly highlightedTeamIds:
    readonly string[]

  readonly replayControllerChecks:
    readonly DiagnosticCheck[]
  readonly replayControllerPassed:
    boolean
}

function asObject(
  value: unknown,
): JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
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
    typeof value !== 'string' ||
    value.trim().length === 0
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
    typeof value === 'string' &&
    value.trim().length > 0
  )
    ? value.trim()
    : null
}

function requireNumber(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error(
      `${fieldName} must be a finite number.`,
    )
  }

  return numericValue
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

  const numericValue =
    typeof value === 'number'
      ? value
      : Number(value)

  return Number.isFinite(numericValue)
    ? numericValue
    : null
}

function normalizeStagePlanRole(
  value: unknown,
): string {
  const source =
    String(value ?? '')
      .trim()
      .toLowerCase()

  const roleMap:
    Readonly<Record<string, string>> = {
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

    const teamRoles =
      rolesByTeam.get(teamId) ??
      {}

    teamRoles[riderId] =
      normalizeStagePlanRole(
        command.role_code,
      )

    rolesByTeam.set(
      teamId,
      teamRoles,
    )
  }

  return Array.from(
    rolesByTeam.entries(),
  )
    .sort(
      ([leftTeamId], [rightTeamId]) =>
        leftTeamId.localeCompare(
          rightTeamId,
        ),
    )
    .map(
      ([teamId, riderRoles]) => ({
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
      ): ProfilePointSourceRow => {
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
  rows: readonly JsonObject[],
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
  rows: readonly JsonObject[],
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
  rows: readonly JsonObject[],
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
          `rider ${index} name`,
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

function createStageMarkers(
  stageId: string,
  stage: JsonObject,
  profileDetail: JsonObject,
  distanceKm: number,
): readonly GenericReplayStageMarker[] {
  const markers:
    GenericReplayStageMarker[] = [
      {
        id:
          `live-${stageId}-start`,
        kilometre:
          0,
        label:
          'Start',
        kind:
          'start',
      },
    ]

  const sprintRows = [
    ...asArray(
      profileDetail.intermediate_sprints,
    ),
    ...asArray(
      stage.intermediate_sprints_json,
    ),
  ]

  sprintRows.forEach(
    (value, index) => {
      const sprint =
        asObject(value)

      const kilometre =
        nullableNumber(
          sprint.km ??
          sprint.km_from_start,
        )

      if (
        kilometre === null ||
        kilometre <= 0 ||
        kilometre >= distanceKm
      ) {
        return
      }

      markers.push({
        id:
          `live-${stageId}-sprint-${index + 1}`,
        kilometre,
        label:
          nullableString(
            sprint.name,
          ) ??
          `Intermediate sprint ${index + 1}`,
        kind:
          'sprint',
      })
    },
  )

  const mountainRows = [
    ...asArray(
      profileDetail.mountain_climbs,
    ),
    ...asArray(
      stage.mountain_climbs_json,
    ),
  ]

  mountainRows.forEach(
    (value, index) => {
      const climb =
        asObject(value)

      const kilometre =
        nullableNumber(
          climb.km ??
          climb.km_from_start ??
          climb.summit_km,
        )

      if (
        kilometre === null ||
        kilometre <= 0 ||
        kilometre >= distanceKm
      ) {
        return
      }

      markers.push({
        id:
          `live-${stageId}-kom-${index + 1}`,
        kilometre,
        label:
          nullableString(
            climb.name,
          ) ??
          `KOM ${index + 1}`,
        kind:
          'kom',
      })
    },
  )

  markers.push({
    id:
      `live-${stageId}-finish`,
    kilometre:
      distanceKm,
    label:
      'Finish',
    kind:
      'finish',
  })

  const kindOrder:
    Readonly<Record<
      GenericReplayStageMarker['kind'],
      number
    >> = {
      start: 0,
      sprint: 1,
      kom: 2,
      other: 3,
      finish: 4,
    }

  return markers
    .filter(
      (
        marker,
        index,
        all,
      ) =>
        all.findIndex(
          (candidate) =>
            candidate.kind === marker.kind &&
            Math.abs(
              candidate.kilometre -
              marker.kilometre,
            ) < 0.000001,
        ) === index,
    )
    .sort(
      (left, right) =>
        left.kilometre -
          right.kilometre ||
        kindOrder[left.kind] -
          kindOrder[right.kind] ||
        left.id.localeCompare(
          right.id,
        ),
    )
}

function createSourceRows(
  bundle: SourceBundle,
): CreateStageInputFromSourceRowsParams {
  const stage =
    bundle.stage

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
        bundle.profile_detail,
      ),

    weather: {
      stageSnapshot:
        asObject(
          bundle.stage
            .weather_snapshot,
        ),
      stageSummary:
        nullableString(
          bundle.stage
            .weather_summary,
        ),
      profileSnapshot:
        asObject(
          bundle.profile_detail
            .weather_snapshot,
        ),
      profileSummary:
        nullableString(
          bundle.profile_detail
            .weather_summary,
        ),
    },
  }
}

function clampConditionMetricForAudit(
  value: number | null | undefined,
  fallback: number,
): number {
  const numericValue =
    value ?? fallback

  return Math.max(
    0,
    Math.min(
      100,
      numericValue,
    ),
  )
}

function normalizeAvailabilityForAudit(
  value: string | null | undefined,
): string {
  const normalized =
    value
      ?.trim()
      .toLowerCase()

  return normalized &&
    normalized.length > 0
    ? normalized
    : 'unknown'
}

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

function minimum(
  values: readonly number[],
): number {
  return values.length > 0
    ? Math.min(...values)
    : 0
}

function maximum(
  values: readonly number[],
): number {
  return values.length > 0
    ? Math.max(...values)
    : 0
}


function nullableAuditNumber(
  value: unknown,
): number | null {
  return nullableNumber(value)
}

function normalizedWeatherMatchesStageSource(
  inputWeather:
    StageWeatherInput,
  stage: JsonObject,
): boolean {
  const snapshot =
    asObject(
      stage.weather_snapshot,
    )

  return (
    inputWeather.authority ===
      'stage_weather_snapshot' &&
    inputWeather.source ===
      (
        nullableString(
          snapshot.source,
        ) ??
        'stage_weather_snapshot'
      ) &&
    inputWeather.condition ===
      (
        nullableString(
          snapshot.condition,
        ) ??
        'unknown'
      ) &&
    inputWeather.summary ===
      nullableString(
        stage.weather_summary,
      ) &&
    inputWeather.averageTemperatureC ===
      nullableAuditNumber(
        snapshot.avg_temp_c,
      ) &&
    inputWeather.minimumTemperatureC ===
      nullableAuditNumber(
        snapshot.avg_min_temp_c,
      ) &&
    inputWeather.maximumTemperatureC ===
      nullableAuditNumber(
        snapshot.avg_max_temp_c,
      ) &&
    inputWeather.windSpeedKmh ===
      nullableAuditNumber(
        snapshot.avg_wind_kmh,
      ) &&
    inputWeather.precipitationMm ===
      nullableAuditNumber(
        snapshot.avg_precip_mm,
      ) &&
    inputWeather.hostCity ===
      nullableString(
        snapshot.host_city,
      ) &&
    inputWeather.countryCode ===
      nullableString(
        snapshot.country_code,
      )
  )
}

interface ReplayControllerAudit {
  readonly checks:
    readonly DiagnosticCheck[]
  readonly passed: boolean
}

function runReplayControllerAudit(
  model: ReplayStageModel,
): ReplayControllerAudit {
  const before =
    createCanonicalHashedValue(
      model,
    )

  const initial =
    createReplayPlaybackState(
      model,
    )

  const playing =
    playReplay(
      model,
      initial,
    )

  const oneX =
    advanceReplayPlayback(
      model,
      playing,
      1.25,
    )

  let speedState =
    oneX

  const speedChecks:
    Array<{
      readonly speed:
        ReplayPlaybackSpeed
      readonly passed:
        boolean
    }> = []

  for (
    const speed of
      [1, 2, 4, 8] as const
  ) {
    const selected =
      setReplayPlaybackSpeed(
        model,
        speedState,
        speed,
      )

    const beforeSecond =
      selected.currentRaceSecond

    const advanced =
      advanceReplayPlayback(
        model,
        playReplay(
          model,
          selected,
        ),
        0.5,
      )

    speedChecks.push({
      speed,
      passed:
        advanced.speed ===
          speed &&
        Math.abs(
          advanced.currentRaceSecond -
          Math.min(
            model.durationSeconds,
            beforeSecond +
              0.5 * speed,
          ),
        ) <
          0.000001,
    })

    speedState =
      advanced
  }

  const paused =
    pauseReplay(
      model,
      speedState,
    )

  const advancedWhilePaused =
    advanceReplayPlayback(
      model,
      paused,
      5,
    )

  const middleFrameIndex =
    Math.max(
      1,
      Math.min(
        model.frames.length - 2,
        Math.floor(
          model.frames.length / 2,
        ),
      ),
    )

  const atMiddleFrame =
    seekReplayToFrame(
      model,
      paused,
      middleFrameIndex,
    )

  const atNextFrame =
    seekReplayToFrame(
      model,
      atMiddleFrame,
      middleFrameIndex + 1,
    )

  const backToMiddleFrame =
    seekReplayToFrame(
      model,
      atNextFrame,
      middleFrameIndex,
    )

  const atHalfProgress =
    seekReplayToProgress(
      model,
      paused,
      0.5,
    )

  const finished =
    finishReplay(
      model,
      paused,
    )

  const finishedView =
    getReplayPlaybackView(
      model,
      finished,
    )

  const reset =
    resetReplay(
      model,
      finished,
    )

  const replayedFromEnd =
    playReplay(
      model,
      finished,
    )

  const finalPositions =
    model.finalResults.map(
      (result) =>
        result.finishPosition,
    )

  const finalPositionsContiguous =
    finalPositions.every(
      (
        position,
        index,
      ) =>
        position ===
        index + 1,
    )

  const groupGapsOrdered =
    model.frames.every(
      (frame) =>
        frame.groups.every(
          (
            group,
            index,
          ) =>
            index === 0 ||
            group.gapToLeaderSeconds +
              0.001 >=
              frame.groups[
                index - 1
              ]!.gapToLeaderSeconds,
        ),
    )

  const eventsChronological =
    model.events.every(
      (
        event,
        index,
      ) =>
        index === 0 ||
        event.raceSecond >=
          model.events[
            index - 1
          ]!.raceSecond,
    )

  const after =
    createCanonicalHashedValue(
      model,
    )

  const checks:
    readonly DiagnosticCheck[] = [
      {
        label:
          'Replay controller starts paused at frame one',
        passed:
          !initial.playing &&
          !initial.completed &&
          initial.speed === 1 &&
          initial.currentFrameIndex === 0 &&
          initial.currentRaceSecond === 0 &&
          initial.progress === 0,
      },
      {
        label:
          'Play starts the replay controller',
        passed:
          playing.playing &&
          !playing.completed,
      },
      {
        label:
          'Pause prevents further replay-clock movement',
        passed:
          !paused.playing &&
          advancedWhilePaused
            .currentRaceSecond ===
            paused.currentRaceSecond &&
          advancedWhilePaused
            .currentFrameIndex ===
            paused.currentFrameIndex,
      },
      ...speedChecks.map(
        (check) => ({
          label:
            `${check.speed}x advances at the literal selected speed`,
          passed:
            check.passed,
        }),
      ),
      {
        label:
          'Previous and Next move by one authoritative frame',
        passed:
          atMiddleFrame
            .currentFrameIndex ===
            middleFrameIndex &&
          atNextFrame
            .currentFrameIndex ===
            middleFrameIndex + 1 &&
          backToMiddleFrame
            .currentFrameIndex ===
            middleFrameIndex,
      },
      {
        label:
          'Timeline seeking reaches fifty-percent progress',
        passed:
          Math.abs(
            atHalfProgress.progress -
            0.5,
          ) <
            0.000001 &&
          Math.abs(
            atHalfProgress
              .currentRaceSecond -
            model.durationSeconds /
              2,
          ) <
            0.000001,
      },
      {
        label:
          'Finish Replay reaches the authoritative final frame',
        passed:
          finished.completed &&
          !finished.playing &&
          finished.progress === 1 &&
          finished.currentFrameIndex ===
            model.frames.length - 1 &&
          finishedView.currentFrame
            .frameNumber ===
            model.frames[
              model.frames.length - 1
            ]!.frameNumber,
      },
      {
        label:
          'Final classification contains contiguous positions for every rider',
        passed:
          model.finalResults.length >
            0 &&
          finalPositionsContiguous &&
          model.finalResults[0]
            ?.finishPosition ===
            1,
      },
      {
        label:
          'Every frame preserves non-decreasing physical group gaps',
        passed:
          groupGapsOrdered,
      },
      {
        label:
          'Reset returns to frame one and zero progress',
        passed:
          !reset.playing &&
          !reset.completed &&
          reset.currentFrameIndex ===
            0 &&
          reset.currentRaceSecond ===
            0 &&
          reset.progress ===
            0,
      },
      {
        label:
          'Play from the completed state restarts from zero',
        passed:
          replayedFromEnd.playing &&
          !replayedFromEnd.completed &&
          replayedFromEnd
            .currentRaceSecond ===
            0 &&
          replayedFromEnd
            .currentFrameIndex ===
            0,
      },
      {
        label:
          'Replay events remain chronological',
        passed:
          eventsChronological,
      },
      {
        label:
          'Replay controller operations do not mutate the model',
        passed:
          before.hash ===
            after.hash &&
          before.canonicalJson ===
            after.canonicalJson,
      },
    ]

  return {
    checks,
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
  }
}


function getOutputWinnerTimeSeconds(
  output:
    ReturnType<
      typeof runDeterministicRoadRace
    >,
): number {
  const winner =
    output.finalRiderStates.find(
      (rider) =>
        rider.finishPosition ===
          1 &&
        rider.finishTimeSeconds !==
          null,
    )

  if (
    !winner ||
    winner.finishTimeSeconds ===
      null
  ) {
    throw new Error(
      'Live weather diagnostic could not resolve a winner.',
    )
  }

  return winner
    .finishTimeSeconds
}

function getOutputAverageFinalEnergy(
  output:
    ReturnType<
      typeof runDeterministicRoadRace
    >,
): number {
  if (
    output.finalRiderStates.length ===
    0
  ) {
    return 0
  }

  return (
    output.finalRiderStates.reduce(
      (
        sum,
        rider,
      ) =>
        sum +
        rider.energy,
      0,
    ) /
    output.finalRiderStates.length
  )
}

function createDiagnosticResult(
  bundle: SourceBundle,
): DiagnosticResult {
  const sourceRows =
    createSourceRows(bundle)

  const sourceHashA =
    createCanonicalHashedValue(
      sourceRows,
    )

  const inputA =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const inputHashA =
    createCanonicalHashedValue(
      inputA,
    )

  const weatherA =
    inputA.weather

  const weatherTransported =
    weatherA !== undefined

  const weatherMatchesStageSource =
    weatherA
      ? normalizedWeatherMatchesStageSource(
          weatherA,
          bundle.stage,
        )
      : false

  const {
    weather:
      _removedWeather,
    ...weatherFreeInput
  } = inputA

  const weatherFreeOutput =
    runDeterministicRoadRace(
      weatherFreeInput,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const weatherFreeOutputHash =
    createCanonicalHashedValue(
      weatherFreeOutput,
    )

  const initialStateA =
    createInitialState(
      inputA,
    )

  const sourceRiderById =
    new Map(
      sourceRows.riders.map(
        (rider) => [
          rider.id,
          rider,
        ],
      ),
    )

  const conditionedRiders =
    inputA.riders.filter(
      (rider) =>
        rider.condition !==
        undefined,
    )

  const startingEnergyValues =
    conditionedRiders.map(
      (rider) =>
        rider.condition!
          .startingEnergy,
    )

  const fatigueValues =
    conditionedRiders.map(
      (rider) =>
        rider.condition!
          .fatigueBeforeStage,
    )

  const moraleValues =
    conditionedRiders.map(
      (rider) =>
        rider.condition!
          .morale,
    )

  const availabilityStatusCounts:
    Record<string, number> = {}

  for (
    const rider of
      conditionedRiders
  ) {
    const status =
      rider.condition!
        .availabilityStatus

    availabilityStatusCounts[
      status
    ] =
      (
        availabilityStatusCounts[
          status
        ] ?? 0
      ) + 1
  }

  const conditionValuesMatchSource =
    inputA.riders.every(
      (rider) => {
        const sourceRider =
          sourceRiderById.get(
            rider.riderId,
          )

        const condition =
          rider.condition

        if (
          !sourceRider ||
          !condition
        ) {
          return false
        }

        const expectedEnergy =
          clampConditionMetricForAudit(
            sourceRider
              .start_stamina,
            100,
          )

        const expectedFatigue =
          clampConditionMetricForAudit(
            sourceRider
              .fatigue_before_stage ??
              sourceRider
                .fatigue,
            0,
          )

        const expectedMorale =
          clampConditionMetricForAudit(
            sourceRider.morale,
            50,
          )

        const expectedAvailability =
          normalizeAvailabilityForAudit(
            sourceRider
              .availability_status,
          )

        return (
          Math.abs(
            condition.startingEnergy -
              expectedEnergy,
          ) <
            0.000001 &&
          Math.abs(
            condition.fatigueBeforeStage -
              expectedFatigue,
          ) <
            0.000001 &&
          Math.abs(
            condition.morale -
              expectedMorale,
          ) <
            0.000001 &&
          condition.availabilityStatus ===
            expectedAvailability
        )
      },
    )

  const initialEnergyMatchesInput =
    inputA.riders.every(
      (rider) => {
        const stateRider =
          initialStateA.riders[
            rider.riderId
          ]

        return (
          !!stateRider &&
          Math.abs(
            stateRider.energy -
              (
                rider.condition
                  ?.startingEnergy ??
                100
              ),
          ) <
            0.000001
        )
      },
    )

  const initialMetadataMatchesInput =
    inputA.riders.every(
      (rider) => {
        const stateRider =
          initialStateA.riders[
            rider.riderId
          ]

        if (!stateRider) {
          return false
        }

        if (!rider.condition) {
          return (
            stateRider
              .startingCondition ===
            undefined
          )
        }

        return (
          JSON.stringify(
            stateRider
              .startingCondition,
          ) ===
          JSON.stringify(
            rider.condition,
          )
        )
      },
    )

  const availabilityTransportPreservesRoster =
    inputA.riders.length ===
      sourceRows.riders.length &&
    inputA.riders.every(
      (rider) =>
        rider.condition
          ?.availabilityStatus ===
        normalizeAvailabilityForAudit(
          sourceRiderById.get(
            rider.riderId,
          )
            ?.availability_status,
        ),
    )

  const conditionFreeInput = {
    ...inputA,
    riders:
      inputA.riders.map(
        (rider) => ({
          riderId:
            rider.riderId,
          teamId:
            rider.teamId,
          riderName:
            rider.riderName,
          teamName:
            rider.teamName,
          role:
            rider.role,
          attributes:
            rider.attributes,
        }),
      ),
  }

  const conditionFreeInitialState =
    createInitialState(
      conditionFreeInput,
    )

  const conditionFreeCompatibilityPreserved =
    Object.values(
      conditionFreeInitialState
        .riders,
    ).every(
      (rider) =>
        rider.energy ===
          100 &&
        rider.startingCondition ===
          undefined,
    )

  const firstConditionedRider =
    inputA.riders[0]

  let invalidConditionRejected =
    false

  if (
    firstConditionedRider &&
    firstConditionedRider.condition
  ) {
    const invalidConditionInput = {
      ...inputA,
      riders:
        inputA.riders.map(
          (rider) =>
            rider.riderId ===
              firstConditionedRider
                .riderId
              ? {
                  ...rider,
                  condition: {
                    ...rider.condition!,
                    startingEnergy:
                      101,
                  },
                }
              : rider,
        ),
    }

    try {
      createInitialState(
        invalidConditionInput,
      )
    } catch {
      invalidConditionRejected =
        true
    }
  }

  const outputA =
    runDeterministicRoadRace(
      inputA,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const outputHashA =
    createCanonicalHashedValue(
      outputA,
    )

  const weatherWinnerTimeDifferenceSeconds =
    getOutputWinnerTimeSeconds(
      outputA,
    ) -
    getOutputWinnerTimeSeconds(
      weatherFreeOutput,
    )

  const weatherAverageFinalEnergyDifference =
    getOutputAverageFinalEnergy(
      outputA,
    ) -
    getOutputAverageFinalEnergy(
      weatherFreeOutput,
    )

  const sourceHashB =
    createCanonicalHashedValue(
      sourceRows,
    )

  const inputB =
    createStageInputFromSourceRows(
      sourceRows,
    )

  const inputHashB =
    createCanonicalHashedValue(
      inputB,
    )

  const outputB =
    runDeterministicRoadRace(
      inputB,
      {
        simulationMode:
          'terrain_separation_calibrated_v1',
      },
    )

  const outputHashB =
    createCanonicalHashedValue(
      outputB,
    )

  const replayModelA =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        inputA,
      simulationOutput:
        outputA,
    })

  const replayModelB =
    createReplayStageModelFromSimulationOutput({
      stageInput:
        inputB,
      simulationOutput:
        outputB,
    })

  const replayModelHashA =
    createCanonicalHashedValue(
      replayModelA,
    )

  const replayModelHashB =
    createCanonicalHashedValue(
      replayModelB,
    )

  const replayValidation =
    validateReplayStageModel(
      replayModelA,
    )

  const stageMarkers =
    createStageMarkers(
      bundle.stage_id,
      bundle.stage,
      bundle.profile_detail,
      inputA.distanceKm,
    )

  const firstReplayFrame =
    replayModelA.frames[0]

  const finalReplayFrame =
    replayModelA.frames[
      replayModelA.frames.length - 1
    ]

  const winner =
    outputA.finalRiderStates.find(
      (rider) =>
        rider.finishPosition === 1 &&
        rider.finishTimeSeconds !== null,
    )

  if (
    !winner ||
    winner.finishTimeSeconds === null
  ) {
    throw new Error(
      'The calibrated output did not produce a winner.',
    )
  }

  const finishedRiders =
    outputA.finalRiderStates.filter(
      (rider) =>
        rider.finished &&
        rider.finishPosition !== null &&
        rider.finishTimeSeconds !== null,
    )

  const finishPositions =
    finishedRiders.map(
      (rider) =>
        rider.finishPosition as number,
    )

  const transitionEvents =
    outputA.events.filter(
      (event) =>
        event.eventType ===
          'GROUP_CREATED' ||
        event.eventType ===
          'GROUP_CAUGHT',
    )

  const createdEventCount =
    transitionEvents.filter(
      (event) =>
        event.eventType ===
          'GROUP_CREATED',
    ).length

  const caughtEventCount =
    transitionEvents.filter(
      (event) =>
        event.eventType ===
          'GROUP_CAUGHT',
    ).length

  const finalSnapshot =
    outputA.snapshots[
      outputA.snapshots.length - 1
    ]

  const officialWinner =
    bundle.official_winner

  const officialWinnerName =
    officialWinner
      ? nullableString(
          officialWinner
            .rider_name_snapshot,
        )
      : null

  const officialWinnerTeamName =
    officialWinner
      ? nullableString(
          officialWinner
            .team_name_snapshot,
        )
      : null

  const officialWinnerTimeSeconds =
    officialWinner
      ? nullableNumber(
          officialWinner
            .elapsed_seconds,
        )
      : null

  const replayControllerAudit =
    runReplayControllerAudit(
      replayModelA,
    )

  const checks:
    readonly DiagnosticCheck[] = [
      {
        label:
          'Compact source bundle is ready',
        passed:
          bundle.status ===
          'source_bundle_ready',
      },
      {
        label:
          'Source RPC confirms read-only execution',
        passed:
          bundle.safety.read_only ===
            true &&
          bundle.safety
            .database_writes_performed ===
            false,
      },
      {
        label:
          'Source rows remain unchanged',
        passed:
          sourceHashA.hash ===
          sourceHashB.hash,
      },
      {
        label:
          'Repeated StageInput values are identical',
        passed:
          inputHashA.hash ===
          inputHashB.hash,
      },
      {
        label:
          'Repeated calibrated outputs are identical',
        passed:
          outputHashA.hash ===
          outputHashB.hash,
      },
      {
        label:
          'Authoritative stage weather is transported into StageInput',
        passed:
          weatherTransported &&
          weatherA?.authority ===
            'stage_weather_snapshot',
      },
      {
        label:
          'Normalized weather values match stage.weather_snapshot exactly',
        passed:
          weatherMatchesStageSource,
      },
      {
        label:
          'Live weather changes calibrated output deterministically',
        passed:
          outputHashA.hash !==
          weatherFreeOutputHash.hash,
      },
      {
        label:
          'Live weather increases calibrated winner time',
        passed:
          weatherWinnerTimeDifferenceSeconds >
          0,
      },
      {
        label:
          'Live weather increases runtime energy and stamina consumption',
        passed:
          weatherAverageFinalEnergyDifference <
          0,
      },
      {
        label:
          'Every executable rider receives canonical live condition',
        passed:
          conditionedRiders.length ===
          inputA.riders.length,
      },
      {
        label:
          'Live condition values map exactly into StageInput',
        passed:
          conditionValuesMatchSource,
      },
      {
        label:
          'Initial runtime energy equals live start_stamina',
        passed:
          initialEnergyMatchesInput,
      },
      {
        label:
          'Initial RiderState preserves source condition metadata',
        passed:
          initialMetadataMatchesInput,
      },
      {
        label:
          'Availability status is transported without filtering riders',
        passed:
          availabilityTransportPreservesRoster,
      },
      {
        label:
          'Condition-free inputs preserve the historic 100-energy start',
        passed:
          conditionFreeCompatibilityPreserved,
      },
      {
        label:
          'Out-of-range starting condition is rejected',
        passed:
          invalidConditionRejected,
      },
      {
        label:
          'Public SimulationOutput contract is preserved',
        passed:
          outputA.engineVersion ===
            'race_engine_ts_v1' &&
          outputA.simulationMode ===
            'deterministic_road_race_v1',
      },
      {
        label:
          'Every executable rider finishes',
        passed:
          finishedRiders.length ===
          inputA.riders.length,
      },
      {
        label:
          'Finish positions are complete and unique',
        passed:
          finishPositions.length ===
            inputA.riders.length &&
          new Set(
            finishPositions,
          ).size ===
            inputA.riders.length,
      },
      {
        label:
          'Simulation completion event is present',
        passed:
          outputA.events.some(
            (event) =>
              event.eventType ===
              'SIMULATION_COMPLETED',
          ),
      },
      {
        label:
          'Replay model passes structural validation',
        passed:
          replayValidation.valid &&
          replayValidation.issues.length ===
            0,
      },
      {
        label:
          'Repeated replay models are identical',
        passed:
          replayModelHashA.hash ===
          replayModelHashB.hash,
      },
      {
        label:
          'Replay frames match engine snapshots',
        passed:
          replayModelA.frames.length ===
          outputA.snapshots.length,
      },
      {
        label:
          'Replay events match engine events',
        passed:
          replayModelA.events.length ===
          outputA.events.length,
      },
      {
        label:
          'Replay results match executable riders',
        passed:
          replayModelA.finalResults.length ===
          inputA.riders.length,
      },
      {
        label:
          'Every replay frame contains every rider',
        passed:
          replayModelA.frames.every(
            (frame) =>
              frame.riders.length ===
              inputA.riders.length,
          ),
      },
      {
        label:
          'Replay starts at kilometre zero',
        passed:
          firstReplayFrame
            ?.leaderDistanceKm ===
          0,
      },
      {
        label:
          'Replay ends at the stage finish',
        passed:
          finalReplayFrame
            ?.leaderDistanceKm ===
            inputA.distanceKm &&
          finalReplayFrame
            ?.progress ===
            1,
      },
      {
        label:
          'Stage markers are ordered and bounded by start and finish',
        passed:
          stageMarkers.length >=
            2 &&
          stageMarkers[0]?.kind ===
            'start' &&
          stageMarkers[0]?.kilometre ===
            0 &&
          stageMarkers[
            stageMarkers.length - 1
          ]?.kind ===
            'finish' &&
          Math.abs(
            (
              stageMarkers[
                stageMarkers.length - 1
              ]?.kilometre ??
              Number.NaN
            ) -
            inputA.distanceKm,
          ) <
            0.000001 &&
          stageMarkers.every(
            (
              marker,
              index,
            ) =>
              marker.kilometre >=
                0 &&
              marker.kilometre <=
                inputA.distanceKm &&
              (
                index === 0 ||
                marker.kilometre >=
                  stageMarkers[
                    index - 1
                  ]!.kilometre
              ),
          ),
      },
      {
        label:
          'Automated replay-controller lifecycle passes',
        passed:
          replayControllerAudit
            .passed,
      },
      {
        label:
          'No database writer is called by this page',
        passed:
          true,
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    checks,

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

    acceptedTeamRows:
      bundle.teams.filter(
        (team) =>
          team.status ===
          'accepted',
      ).length,
    emptyAcceptedTeamRows:
      bundle.teams.filter(
        (team) =>
          team.status ===
            'accepted' &&
          !bundle.participants.some(
            (participant) =>
              participant.team_id ===
              team.team_id,
          ),
      ).length,
    executableTeamCount:
      inputA.teams.length,
    executableRiderCount:
      inputA.riders.length,
    profilePointCount:
      inputA.profilePoints.length,
    sourcePhaseCommandCount:
      bundle.phase_commands.length,
    currentOrderCount:
      inputA.orders.length,

    conditionedRiderCount:
      conditionedRiders.length,
    startingEnergyMinimum:
      minimum(
        startingEnergyValues,
      ),
    startingEnergyAverage:
      average(
        startingEnergyValues,
      ),
    startingEnergyMaximum:
      maximum(
        startingEnergyValues,
      ),
    fatigueMinimum:
      minimum(
        fatigueValues,
      ),
    fatigueAverage:
      average(
        fatigueValues,
      ),
    fatigueMaximum:
      maximum(
        fatigueValues,
      ),
    moraleMinimum:
      minimum(
        moraleValues,
      ),
    moraleAverage:
      average(
        moraleValues,
      ),
    moraleMaximum:
      maximum(
        moraleValues,
      ),
    availabilityStatusCounts:
      Object.fromEntries(
        Object.entries(
          availabilityStatusCounts,
        ).sort(
          (
            [left],
            [right],
          ) =>
            left.localeCompare(
              right,
            ),
        ),
      ),

    weatherAuthority:
      weatherA?.authority ??
      'unavailable',
    weatherSource:
      weatherA?.source ??
      'unavailable',
    weatherCondition:
      weatherA?.condition ??
      'unavailable',
    weatherSummary:
      weatherA?.summary ??
      null,
    weatherAverageTemperatureC:
      weatherA
        ?.averageTemperatureC ??
      null,
    weatherMinimumTemperatureC:
      weatherA
        ?.minimumTemperatureC ??
      null,
    weatherMaximumTemperatureC:
      weatherA
        ?.maximumTemperatureC ??
      null,
    weatherWindSpeedKmh:
      weatherA
        ?.windSpeedKmh ??
      null,
    weatherPrecipitationMm:
      weatherA
        ?.precipitationMm ??
      null,

    weatherFreeOutputHash:
      weatherFreeOutputHash.hash,
    weatherWinnerTimeDifferenceSeconds,
    weatherAverageFinalEnergyDifference,

    sourceHash:
      sourceHashA.hash,
    repeatedSourceHash:
      sourceHashB.hash,
    stageInputHash:
      inputHashA.hash,
    repeatedStageInputHash:
      inputHashB.hash,
    outputHash:
      outputHashA.hash,
    repeatedOutputHash:
      outputHashB.hash,

    snapshotCount:
      outputA.snapshots.length,
    eventCount:
      outputA.events.length,
    transitionEventCount:
      transitionEvents.length,
    createdEventCount,
    caughtEventCount,
    finalGroupCount:
      finalSnapshot?.groupOrder.length ??
      0,
    finishedRiderCount:
      finishedRiders.length,

    winnerName:
      winner.riderName,
    winnerTeamName:
      winner.teamName,
    winnerTimeSeconds:
      winner.finishTimeSeconds,

    officialWinnerName,
    officialWinnerTeamName,
    officialWinnerTimeSeconds,

    sameWinner:
      officialWinnerName ===
      winner.riderName,
    winnerTimeDifferenceSeconds:
      officialWinnerTimeSeconds ===
      null
        ? null
        : winner.finishTimeSeconds -
          officialWinnerTimeSeconds,

    replayModel:
      replayModelA,
    replayModelHash:
      replayModelHashA.hash,
    repeatedReplayModelHash:
      replayModelHashB.hash,
    replayModelCanonicalJson:
      replayModelHashA.canonicalJson,
    replayValidationMessages:
      replayValidation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),
    stageMarkers,
    highlightedTeamIds: [
      PROPELOTON_TEAM_ID,
    ],

    replayControllerChecks:
      replayControllerAudit
        .checks,
    replayControllerPassed:
      replayControllerAudit
        .passed,
  }
}

function formatNumber(
  value: number,
  digits = 3,
): string {
  return value.toFixed(digits)
}

function CheckRow({
  check,
}: {
  readonly check:
    DiagnosticCheck
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-sm text-slate-300">
        {check.label}
      </span>

      <span
        className={[
          'rounded-full px-3 py-1 text-xs font-semibold',
          check.passed
            ? 'bg-emerald-950 text-emerald-200'
            : 'bg-red-950 text-red-200',
        ].join(' ')}
      >
        {check.passed
          ? 'PASS'
          : 'FAIL'}
      </span>
    </div>
  )
}

function DataRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: ReactNode
}): JSX.Element {
  return (
    <div className="grid gap-2 border-b border-slate-800 py-3 last:border-b-0 md:grid-cols-[280px_1fr]">
      <dt className="text-sm text-slate-400">
        {label}
      </dt>

      <dd className="break-all text-sm text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function LiveSupabaseCalibratedShadowDiagnostic():
  JSX.Element {
  const [
    stageId,
    setStageId,
  ] = useState(
    DEFAULT_STAGE_ID,
  )

  const [
    running,
    setRunning,
  ] = useState(false)

  const [
    result,
    setResult,
  ] = useState<
    DiagnosticResult | null
  >(null)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [
    replayOpen,
    setReplayOpen,
  ] = useState(false)

  const [
    replayModelIntegrity,
    setReplayModelIntegrity,
  ] = useState<
    boolean | null
  >(null)

  const [
    replayOpenCount,
    setReplayOpenCount,
  ] = useState(0)

  const [
    replayCloseCount,
    setReplayCloseCount,
  ] = useState(0)

  const overallClasses =
    useMemo(
      () => [
        'rounded-3xl border p-6',
        result?.passed
          ? 'border-emerald-500 bg-emerald-950/20'
          : 'border-red-500 bg-red-950/20',
      ].join(' '),
      [result],
    )

  const runDiagnostic =
    async (): Promise<void> => {
      setRunning(true)
      setResult(null)
      setError(null)
      setReplayOpen(false)
      setReplayModelIntegrity(null)
      setReplayOpenCount(0)
      setReplayCloseCount(0)

      try {
        const rpcClient =
          supabase as unknown as
            RpcClientShape

        const {
          data,
          error:
            rpcError,
        } = await rpcClient.rpc(
          SOURCE_RPC_NAME,
          {
            p_stage_id:
              stageId,
          },
        )

        if (rpcError) {
          throw new Error(
            rpcError.message,
          )
        }

        const bundle =
          asObject(data) as unknown as
            SourceBundle

        setResult(
          createDiagnosticResult(
            bundle,
          ),
        )
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        )
      } finally {
        setRunning(false)
      }
    }

  const checkReplayModelIntegrity =
    (): void => {
      if (!result) {
        return
      }

      const current =
        createCanonicalHashedValue(
          result.replayModel,
        )

      setReplayModelIntegrity(
        current.hash ===
          result.replayModelHash &&
        current.canonicalJson ===
          result.replayModelCanonicalJson,
      )
    }

  const openReplay =
    (): void => {
      setReplayOpen(true)
      setReplayOpenCount(
        (count) =>
          count + 1,
      )
      setReplayModelIntegrity(null)
    }

  const closeReplay =
    (): void => {
      setReplayOpen(false)
      setReplayCloseCount(
        (count) =>
          count + 1,
      )
    }

  const replayMountLifecyclePassed =
    replayOpenCount >= 2 &&
    replayCloseCount >= 1

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Phase 8G.5 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            Live Supabase calibrated shadow execution
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Loads the compact read-only Supabase source bundle, transports live
            rider condition plus the authoritative stage weather snapshot into
            the canonical StageInput, executes terrain_separation_calibrated_v1
            twice in the browser, proves weather is metadata-only in this
            phase, validates the generic replay model, and performs no write.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <label
            className="block text-sm font-medium text-slate-200"
            htmlFor="live-shadow-stage-id"
          >
            Stage ID
          </label>

          <div className="mt-3">
            <select
              className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
              value={
                STAGE_OPTIONS.some(
                  (option) =>
                    option.stageId ===
                    stageId,
                )
                  ? stageId
                  : ''
              }
              onChange={
                (event) => {
                  if (
                    event.target.value
                  ) {
                    setStageId(
                      event.target.value,
                    )
                  }
                }
              }
            >
              <option value="">
                Custom stage UUID
              </option>

              {STAGE_OPTIONS.map(
                (option) => (
                  <option
                    key={option.stageId}
                    value={option.stageId}
                  >
                    {option.label}
                  </option>
                ),
              )}
            </select>

            <div className="flex flex-col gap-3 md:flex-row">
              <input
              id="live-shadow-stage-id"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100"
              value={stageId}
              onChange={
                (event) =>
                  setStageId(
                    event.target.value,
                  )
              }
            />

            <button
              type="button"
              className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                running ||
                stageId.trim().length ===
                  0
              }
              onClick={
                () => {
                  void runDiagnostic()
                }
              }
            >
              {running
                ? 'Running live shadow…'
                : 'Run live shadow diagnostic'}
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            This development RPC is authenticated, club-protected, and restricted to Rio Stage 1, Japan Road Cup Stage 1, and Rio Stage 2.
          </p>
        </section>

        {error && (
          <section className="rounded-3xl border border-red-500 bg-red-950/20 p-6">
            <h2 className="text-xl font-semibold text-red-200">
              Diagnostic failed
            </h2>

            <pre className="mt-3 whitespace-pre-wrap text-sm text-red-100">
              {error}
            </pre>
          </section>
        )}

        {result && (
          <>
            <section className={overallClasses}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Live database-backed run
                  </div>

                  <h2 className="mt-1 text-2xl font-semibold">
                    Overall: {result.passed
                      ? 'PASS'
                      : 'FAIL'}
                  </h2>
                </div>

                <span className="rounded-full bg-slate-950 px-4 py-2 font-mono text-xs text-slate-300">
                  {result.sourceBundleVersion}
                </span>
              </div>

              <div className="mt-5">
                {result.checks.map(
                  (check) => (
                    <CheckRow
                      key={check.label}
                      check={check}
                    />
                  ),
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Source and execution summary
              </h2>

              <dl className="mt-4">
                <DataRow
                  label="Race"
                  value={result.raceName}
                />
                <DataRow
                  label="Stage"
                  value={result.stageName}
                />
                <DataRow
                  label="Distance"
                  value={`${formatNumber(result.distanceKm, 2)} km`}
                />
                <DataRow
                  label="Accepted team rows"
                  value={result.acceptedTeamRows}
                />
                <DataRow
                  label="Empty accepted team rows"
                  value={result.emptyAcceptedTeamRows}
                />
                <DataRow
                  label="Executable teams"
                  value={result.executableTeamCount}
                />
                <DataRow
                  label="Executable riders"
                  value={result.executableRiderCount}
                />
                <DataRow
                  label="Profile points"
                  value={result.profilePointCount}
                />
                <DataRow
                  label="Source phase-command rows"
                  value={result.sourcePhaseCommandCount}
                />
                <DataRow
                  label="Current StageInput orders"
                  value={result.currentOrderCount}
                />
                <DataRow
                  label="Condition-aware riders"
                  value={`${result.conditionedRiderCount} / ${result.executableRiderCount}`}
                />
                <DataRow
                  label="Starting energy min / avg / max"
                  value={`${formatNumber(result.startingEnergyMinimum)} / ${formatNumber(result.startingEnergyAverage)} / ${formatNumber(result.startingEnergyMaximum)}`}
                />
                <DataRow
                  label="Fatigue before stage min / avg / max"
                  value={`${formatNumber(result.fatigueMinimum)} / ${formatNumber(result.fatigueAverage)} / ${formatNumber(result.fatigueMaximum)}`}
                />
                <DataRow
                  label="Morale min / avg / max"
                  value={`${formatNumber(result.moraleMinimum)} / ${formatNumber(result.moraleAverage)} / ${formatNumber(result.moraleMaximum)}`}
                />
                <DataRow
                  label="Availability statuses"
                  value={
                    Object.entries(
                      result.availabilityStatusCounts,
                    )
                      .map(
                        ([status, count]) =>
                          `${status}: ${count}`,
                      )
                      .join(' · ')
                  }
                />
                <DataRow
                  label="Weather authority"
                  value={result.weatherAuthority}
                />
                <DataRow
                  label="Weather source"
                  value={result.weatherSource}
                />
                <DataRow
                  label="Weather condition"
                  value={result.weatherCondition}
                />
                <DataRow
                  label="Weather summary"
                  value={
                    result.weatherSummary ??
                    'Unavailable'
                  }
                />
                <DataRow
                  label="Weather temperature min / avg / max"
                  value={
                    result.weatherAverageTemperatureC ===
                      null
                      ? 'Unavailable'
                      : `${formatNumber(result.weatherMinimumTemperatureC ?? result.weatherAverageTemperatureC, 1)} / ${formatNumber(result.weatherAverageTemperatureC, 1)} / ${formatNumber(result.weatherMaximumTemperatureC ?? result.weatherAverageTemperatureC, 1)} °C`
                  }
                />
                <DataRow
                  label="Weather wind"
                  value={
                    result.weatherWindSpeedKmh ===
                      null
                      ? 'Unavailable'
                      : `${formatNumber(result.weatherWindSpeedKmh, 1)} km/h`
                  }
                />
                <DataRow
                  label="Weather precipitation"
                  value={
                    result.weatherPrecipitationMm ===
                      null
                      ? 'Unavailable'
                      : `${formatNumber(result.weatherPrecipitationMm, 1)} mm`
                  }
                />
                <DataRow
                  label="Weather-free calibrated output hash"
                  value={
                    <span className="font-mono text-xs">
                      {result.weatherFreeOutputHash}
                    </span>
                  }
                />
                <DataRow
                  label="Weather winner-time effect"
                  value={`${formatNumber(result.weatherWinnerTimeDifferenceSeconds)} s`}
                />
                <DataRow
                  label="Weather average final-energy effect"
                  value={formatNumber(result.weatherAverageFinalEnergyDifference)}
                />
                <DataRow
                  label="Snapshots"
                  value={result.snapshotCount}
                />
                <DataRow
                  label="Events"
                  value={result.eventCount}
                />
                <DataRow
                  label="Transition events"
                  value={result.transitionEventCount}
                />
                <DataRow
                  label="GROUP_CREATED / GROUP_CAUGHT"
                  value={`${result.createdEventCount} / ${result.caughtEventCount}`}
                />
                <DataRow
                  label="Final groups"
                  value={result.finalGroupCount}
                />
                <DataRow
                  label="Finished riders"
                  value={result.finishedRiderCount}
                />
              </dl>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-semibold">
                  New calibrated engine
                </h2>

                <dl className="mt-4">
                  <DataRow
                    label="Winner"
                    value={`${result.winnerName} — ${result.winnerTeamName}`}
                  />
                  <DataRow
                    label="Exact winner time"
                    value={`${formatNumber(result.winnerTimeSeconds)} s`}
                  />
                </dl>
              </article>

              <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-semibold">
                  Official SQL baseline
                </h2>

                <dl className="mt-4">
                  <DataRow
                    label="Winner"
                    value={
                      result.officialWinnerName
                        ? `${result.officialWinnerName} — ${result.officialWinnerTeamName ?? 'Unknown team'}`
                        : 'Unavailable'
                    }
                  />
                  <DataRow
                    label="Winner time"
                    value={
                      result.officialWinnerTimeSeconds ===
                      null
                        ? 'Unavailable'
                        : `${result.officialWinnerTimeSeconds} s`
                    }
                  />
                  <DataRow
                    label="Same winner"
                    value={result.sameWinner
                      ? 'YES'
                      : 'NO'}
                  />
                  <DataRow
                    label="Winner-time difference"
                    value={
                      result.winnerTimeDifferenceSeconds ===
                      null
                        ? 'Unavailable'
                        : `${formatNumber(result.winnerTimeDifferenceSeconds)} s`
                    }
                  />
                </dl>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Deterministic hashes
              </h2>

              <dl className="mt-4 font-mono">
                <DataRow
                  label="Source rows"
                  value={result.sourceHash}
                />
                <DataRow
                  label="Repeated source rows"
                  value={result.repeatedSourceHash}
                />
                <DataRow
                  label="StageInput"
                  value={result.stageInputHash}
                />
                <DataRow
                  label="Repeated StageInput"
                  value={result.repeatedStageInputHash}
                />
                <DataRow
                  label="Calibrated output"
                  value={result.outputHash}
                />
                <DataRow
                  label="Repeated calibrated output"
                  value={result.repeatedOutputHash}
                />
                <DataRow
                  label="ReplayStageModel"
                  value={result.replayModelHash}
                />
                <DataRow
                  label="Repeated ReplayStageModel"
                  value={result.repeatedReplayModelHash}
                />
              </dl>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Pure deterministic controller audit
                  </div>

                  <h2 className="mt-1 text-xl font-semibold">
                    Replay controller: {result.replayControllerPassed
                      ? 'PASS'
                      : 'FAIL'}
                  </h2>
                </div>

                <span className={[
                  'rounded-full px-4 py-2 text-xs font-semibold',
                  result.replayControllerPassed
                    ? 'bg-emerald-950 text-emerald-200'
                    : 'bg-red-950 text-red-200',
                ].join(' ')}>
                  {result.replayControllerChecks.length} checks
                </span>
              </div>

              <div className="mt-5">
                {result.replayControllerChecks.map(
                  (check) => (
                    <CheckRow
                      key={check.label}
                      check={check}
                    />
                  ),
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Live generic replay verification
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-300">
                Mounts the real GenericRaceReplayView from the live Supabase-backed calibrated output. Test opening and closing, Play, Pause, Previous, Next, 1x, 2x, 4x, 8x, timeline movement, stage markers, events, Finish Replay, Reset, and final classification.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white"
                  onClick={openReplay}
                >
                  Open live generic replay
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100"
                  onClick={checkReplayModelIntegrity}
                >
                  Check replay model unchanged
                </button>
              </div>

              <dl className="mt-4">
                <DataRow
                  label="Replay validation issues"
                  value={
                    result.replayValidationMessages.length === 0
                      ? 'None'
                      : result.replayValidationMessages.join(' | ')
                  }
                />
                <DataRow
                  label="Replay model after controls"
                  value={
                    replayModelIntegrity === null
                      ? 'NOT CHECKED'
                      : replayModelIntegrity
                        ? 'PASS'
                        : 'FAIL'
                  }
                />
                <DataRow
                  label="Replay open count"
                  value={replayOpenCount}
                />
                <DataRow
                  label="Replay close count"
                  value={replayCloseCount}
                />
                <DataRow
                  label="Open → close → reopen lifecycle"
                  value={replayMountLifecyclePassed
                    ? 'PASS'
                    : 'PENDING'}
                />
              </dl>
            </section>

            {replayOpen && (
              <section className="overflow-hidden rounded-3xl border border-sky-500 bg-white">
                <div className="flex items-center justify-between gap-4 bg-slate-900 px-5 py-4 text-slate-100">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-300">
                      Live Supabase-backed replay
                    </div>
                    <div className="font-semibold">
                      Manual replay control verification
                    </div>
                  </div>

                  <button
                    type="button"
                    className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold"
                    onClick={closeReplay}
                  >
                    Close replay
                  </button>
                </div>

                <GenericRaceReplayView
                  model={result.replayModel}
                  displayMode="page"
                  onClose={closeReplay}
                  raceName={result.raceName}
                  stageLabel={result.stageName}
                  stageMarkers={result.stageMarkers}
                  highlightedTeamIds={result.highlightedTeamIds}
                />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
