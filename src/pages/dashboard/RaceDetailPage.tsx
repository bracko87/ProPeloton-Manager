'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { supabase } from '../../lib/supabase'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import { raceDetailTutorialSteps } from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import {
  createDeterministicStageResults,
} from '../../race-simulator-v2/core/deterministicStageResults'
import {
  runB1TerrainRoadStageSimulation,
} from '../../race-simulator-v2/core/runB1TerrainRoadStageSimulation'
import {
  buildStagePlanRoadStageDefinition,
  type StagePlanSimulationPlanSource,
  type StagePlanSimulationRiderSource,
} from '../../race-simulator-v2/core/buildStagePlanRoadStageDefinition'
import type {
  B1RoadStageSimulationDefinition,
} from '../../race-simulator-v2/core/runB1RoadStageSimulation'
import type {
  BreakawayOutcome,
} from '../../race-simulator-v2/core/breakawayOutcomeCheckpointSequence'
import {
  createCanonicalRoadStageProfile,
} from '../../race-simulator-v2/core/canonicalRoadStageProfile'
import {
  calculateTerrainSpeedMultiplier,
} from '../../race-simulator-v2/core/terrainMovement'
import {
  createRoadStageProfile,
  getTerrainPhaseAtKm,
} from '../../race-simulator-v2/core/roadStageProfile'
import type {
  Checkpoint,
} from '../../race-simulator-v2/types/checkpoint'
import type {
  CanonicalRoadStageProfileKey,
  CanonicalRoadStageProfileSnapshot,
  CanonicalRoadStageReference,
} from '../../race-simulator-v2/types/canonicalRoadStageProfile'
import type {
  RoadStageFinishType,
  RoadStageProfile,
  RoadStageType,
} from '../../race-simulator-v2/types/stageProfile'
import {
  flatStageFixture,
} from '../../race-simulator-v2/fixtures/flatStage1'
import {
  RIO_TOUR_RACE_ID,
} from '../../race-simulator-v2/fixtures/rioCanonicalRoadStages'


type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

type ClassificationView = 'general' | 'points' | 'mountain' | 'young' | 'team'
type StageResultView = 'stage_general' | 'stage_sprint' | 'stage_mountain'
type StagePointAggregateView = 'sprint' | 'mountain'
type RaceInfoTab = 'participants' | 'results'

type Race = {
  id: string
  name: string
  short_name?: string | null
  start_date: string
  end_date: string
  country_code?: string | null
  host_city?: string | null
  category: string
  race_type: 'one_day' | 'stage_race' | string
  is_stage_race: boolean
  stage_count: number
  status: string
  start_time_region_code?: string | null
  planned_start_hour_number?: number | string | null
  planned_start_minute?: number | string | null
  planned_start_time_label?: string | null
  profile_image_url?: string | null
  logo_url?: string | null
  description?: string | null
  metadata?: JsonObject | null
  applications_status?: string | null
  applications_open_game_date?: string | null
  applications_open_display?: string | null
  applications_open_season_number?: number | null
  applications_open_month_number?: number | null
  applications_open_day_number?: number | null
  applications_close_game_date?: string | null
  applications_close_display?: string | null
  applications_close_season_number?: number | null
  applications_close_month_number?: number | null
  applications_close_day_number?: number | null
  min_teams?: number | null
  target_teams?: number | null
  max_teams?: number | null
  min_riders_per_team?: number | null
  max_riders_per_team?: number | null
  prize_fund_cash?: number | null
  accepted_teams?: number | null
  existing_application_status?: string | null
  team_list_announcement_game_date?: string | null
  team_list_announcement_display?: string | null
  team_list_announcement_season_number?: number | null
  team_list_announcement_month_number?: number | null
  team_list_announcement_day_number?: number | null
  rider_submission_deadline_game_date?: string | null
  rider_submission_deadline_display?: string | null
  rider_submission_deadline_season_number?: number | null
  rider_submission_deadline_month_number?: number | null
  rider_submission_deadline_day_number?: number | null
}

type RaceStagePoint = {
  id: string
  stage_id: string
  point_type: 'START' | 'INTERMEDIATE_SPRINT' | 'KOM' | 'BONUS_SPRINT' | 'FINISH' | string
  km_from_start: number | string
  name?: string | null
  kom_category?: 'HC' | '1' | '2' | '3' | '4' | string | null
  points_scheme?: JsonValue[] | null
  time_bonus_seconds?: JsonValue[] | null
  is_finish_point: boolean
  sort_order: number
  metadata?: JsonObject | null
}

type RaceStageSprint = {
  number?: number | string | null
  km?: number | string | null
  points?: number | string | null
}

type RaceStageMountainClimb = {
  number?: number | string | null
  name?: string | null
  category?: string | null
  km?: number | string | null
  length_km?: number | string | null
  avg_gradient?: number | string | null
}

type RaceTerrainSplit = {
  flat?: number | string | null
  hilly?: number | string | null
  mountain?: number | string | null
  cobbled?: number | string | null
}

const DEFAULT_TERRAIN_SPLIT: Required<RaceTerrainSplit> = {
  flat: 0,
  hilly: 0,
  mountain: 0,
  cobbled: 0,
}

type RaceStage = {
  id: string
  race_id: string
  stage_number: number
  stage_date?: string | null
  name?: string | null
  route_label?: string | null
  notes?: string | null
  profile_type?: string | null
  stage_format?: string | null
  intermediate_sprints_json?: RaceStageSprint[] | null
  mountain_climbs_json?: RaceStageMountainClimb[] | null
  weather_summary?: string | null
  weather_cancelled?: boolean | null
  weather_cancellation_reason?: string | null
  weather_cancelled_at?: string | null
  start_city: string
  finish_city: string
  host_city?: string | null
  host_country_code?: string | null
  start_time_region_code?: string | null
  planned_start_hour_number?: number | string | null
  planned_start_minute?: number | string | null
  planned_start_time_label?: string | null
  distance_km: number | string
  terrain_type:
    | 'flat'
    | 'hilly'
    | 'mountain'
    | 'individual_time_trial'
    | 'team_time_trial'
    | 'prologue'
    | 'cobbled'
    | string
  finish_type: string
  is_summit_finish: boolean
  flat_pct: number | string
  hilly_pct: number | string
  mountain_pct: number | string
  cobbled_pct: number | string
  elevation_gain_m?: number | null
  profile_image_url?: string | null
  weather_snapshot?: JsonObject | null
  rules_snapshot?: JsonObject | null
  metadata?: JsonObject | null
  points?: RaceStagePoint[]
}

type RaceStageStartTimeRow = {
  id: string
  start_time_region_code?: string | null
  planned_start_hour_number?: number | string | null
  planned_start_minute?: number | string | null
  planned_start_time_label?: string | null
  weather_summary?: string | null
  weather_snapshot?: JsonObject | null
  weather_cancelled?: boolean | null
  weather_cancellation_reason?: string | null
  weather_cancelled_at?: string | null
}

type RaceDetailResponse = {
  race: Race | null
  entry?: RaceRewardsEntryOverview | null
  stages: RaceStage[]
  terrain_split?: RaceTerrainSplit | null
  applications_status?: string | null
  accepted_teams?: number | null
  existing_application_status?: string | null
}

type RaceEntryRulesRow = Pick<
  RaceRewardsEntryOverview,
  | 'applications_status'
  | 'applications_open_season_number'
  | 'applications_open_month_number'
  | 'applications_open_day_number'
  | 'applications_close_season_number'
  | 'applications_close_month_number'
  | 'applications_close_day_number'
  | 'team_list_announcement_season_number'
  | 'team_list_announcement_month_number'
  | 'team_list_announcement_day_number'
  | 'rider_submission_deadline_season_number'
  | 'rider_submission_deadline_month_number'
  | 'rider_submission_deadline_day_number'
  | 'min_riders_per_team'
  | 'max_riders_per_team'
  | 'min_teams'
  | 'target_teams'
  | 'max_teams'
  | 'prize_fund_cash'
>

type RaceParticipantRider = {
  id: string
  race_id: string
  team_id: string
  rider_id: string
  rider_name_snapshot: string | null
  rider_full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
  team_name_snapshot: string | null
  country_code_snapshot: string | null
  country_code?: string | null
  age_snapshot: number | null
  is_young_rider: boolean | null
  start_number: number | null
  display_start_number?: number | null
  role_snapshot?: string | null
  overall_snapshot?: number | null
  can_view_exact_overall?: boolean | null
  overall_range_label?: string | null
}

type RacePreparationSimulationRow = {
  id: string
  club_id: string | null
  participating_club_id: string | null
  status: string | null
  startlist_status: string | null
}

type RaceStagePlanSimulationRow = {
  id: string
  race_preparation_id: string
  race_id: string
  stage_id: string | null
  stage_number: number | null
  status: string | null
  team_tactic_json: JsonObject | null
  rider_roles_json: JsonObject | null
  rider_individual_tactics_json: JsonObject | null
}

type RoadStageReplayInputMode =
  | 'real_stage_orders'
  | 'controlled_catch'
  | 'controlled_survival'

type RaceParticipantTeam = {
  id: string
  race_id: string
  team_id: string
  club_id?: string | null
  owner_club_id?: string | null
  participating_club_id?: string | null
  parent_club_id?: string | null
  club_type?: string | null
  race_team_entry_id?: string | null
  status: string
  club_name: string | null
  country_code: string | null
  club_tier: string | null
  world_tier: string | null
  assigned_riders_count: number | null
  team_name_snapshot: string | null
  logo_url_snapshot: string | null
  jersey_url_snapshot?: string | null
  country_code_snapshot: string | null
  ranking_snapshot: number | null
  competition_display?: string | null
  competition_rank?: number | null
  competition_points?: number | null
  division_key?: string | null
  riders: RaceParticipantRider[]
}

type RaceFavoriteRow = {
  favorite_rank: number | null
  rider_id: string | null
  rider_name: string | null
  team_id: string | null
  team_name: string | null
  country_code: string | null
  start_number: number | null
  role_snapshot: string | null
  favorite_score: number | string | null
  skill_score: number | string | null
  season_points: number | string | null
  reason: string | null
}

type RaceStageResultRow = {
  rank: number | null
  rider_id: string | null
  team_id: string | null
  rider_name_snapshot: string | null
  team_name_snapshot: string | null
  elapsed_seconds: number | null
  gap_seconds: number | null
  bonus_seconds: number | null
  penalty_seconds: number | null
  finish_points: number | null
  sprint_points: number | null
  mountain_points: number | null
  status: string | null
  full_name?: string | null
  rider_full_name?: string | null
  display_name?: string | null
  rider_name?: string | null
  rider_country_code?: string | null
  nationality_code?: string | null
  country_code?: string | null
}

type RacePointResultRow = {
  point_id: string | null
  point_type: string | null
  point_name: string | null
  km_from_start: number | string | null
  kom_category: string | null
  sort_order: number | null
  rank: number | null
  rider_id: string | null
  team_id: string | null
  rider_name_snapshot: string | null
  team_name_snapshot: string | null
  points_awarded: number | null
  bonus_seconds_awarded: number | null
}

type RaceStageReportEvent = {
  id: string
  race_id: string
  stage_id: string
  event_order: number
  km_marker: number | null
  race_time_label: string | null
  event_type: string
  title: string
  description: string
  rider_id: string | null
  team_id: string | null
  rider_name_snapshot: string | null
  team_name_snapshot: string | null
  metadata: Record<string, unknown> | null
}


const RACE_DETAIL_FORBIDDEN_ENGINE_RPC_NAMES = new Set([
  'run_race_stage_simulation_v1',
  'run_race_stage_road_race_v1',
  'run_race_stage_individual_time_trial_v1',
  'run_race_stage_team_time_trial_v1',

  'race_engine_admin_scheduler_tick_v1',
  'race_engine_admin_process_next_due_stage_once_v1',
  'race_engine_admin_process_stage_once_v1',
  'race_engine_admin_process_stage_once_unlocked_v1',

  'race_engine_process_stage_runner_only_v1',
  'race_engine_process_stage_tail_repair_v1',
  'race_engine_closeout_stage_after_tail_v1',
  'race_engine_process_time_trial_stage_once_v1',

  'race_engine_write_replay_frames_v1',
  'race_engine_write_stage_results_v1',
  'race_engine_write_stage_point_results_v1',
  'race_engine_write_cumulative_classifications_v1',
  'race_engine_write_replay_commentary_v1',

  'race_engine_apply_stage_fatigue_v1',
  'race_engine_finalize_time_trial_stage_v1',

  'generate_race_ranking_point_awards_v1',
  'generate_race_prize_awards_v1',
  'race_engine_pay_prize_awards_v1',
])

function assertRaceDetailReadOnlyRpc(functionName: string) {
  const normalizedName = functionName.trim()

  const looksLikeForbiddenEngineMutation =
    normalizedName.startsWith('run_race_stage_') ||
    normalizedName.startsWith('race_engine_admin_') ||
    normalizedName.startsWith('race_engine_process_') ||
    normalizedName.startsWith('race_engine_closeout_') ||
    normalizedName.startsWith('race_engine_write_') ||
    normalizedName.startsWith('race_engine_apply_') ||
    normalizedName.startsWith('race_engine_finalize_') ||
    normalizedName.startsWith('race_engine_pay_') ||
    normalizedName.startsWith('generate_race_ranking_') ||
    normalizedName.startsWith('generate_race_prize_') ||
    normalizedName === 'sync_race_stage_points_from_stage_json_v1'

  if (
    RACE_DETAIL_FORBIDDEN_ENGINE_RPC_NAMES.has(normalizedName) ||
    looksLikeForbiddenEngineMutation
  ) {
    throw new Error(
      `RaceDetailPage is read-only. Forbidden race-engine RPC blocked: ${normalizedName}`
    )
  }
}

function raceDetailReadRpc(
  functionName: string,
  args?: Record<string, unknown>
) {
  assertRaceDetailReadOnlyRpc(functionName)

  return (supabase['rpc'] as unknown as (
    fn: string,
    rpcArgs?: Record<string, unknown>
  ) => any)(functionName, args)
}


type RaceStageLiveState = {
  stage_id: string
  has_simulation: boolean
  simulation_run_id: string | null
  live_started_at: string | null
  live_ends_at: string | null
  is_live: boolean
  results_visible: boolean
  speed_locked: boolean
  progress: number
}


type AggregatedStagePointResultRow = {
  rank: number | null
  rider_id: string | null
  team_id: string | null
  rider_name_snapshot: string | null
  team_name_snapshot: string | null
  points_awarded: number
  bonus_seconds_awarded: number
}

type RaceClassificationRow = {
  classification_type: ClassificationView | string
  entity_type: 'rider' | 'team' | string
  rank: number | null
  previous_rank: number | null
  rider_id: string | null
  team_id: string | null
  display_name_snapshot: string | null
  team_name_snapshot: string | null
  total_time_seconds: number | null
  gap_seconds: number | null
  points: number | null
}


type RaceResultsViewPayload = {
  race_id?: string | null
  stage_id?: string | null
  stage_results: RaceStageResultRow[]
  point_results: RacePointResultRow[]
  classifications: RaceClassificationRow[]
  leader_snapshot: Record<string, unknown>
}

const TERRAIN_LABELS: Record<string, string> = {
  flat: 'Flat',
  hilly: 'Hilly',
  mountain: 'Mountain',
  individual_time_trial: 'Individual time trial',
  team_time_trial: 'Team time trial',
  prologue: 'Prologue',
  cobbled: 'Cobbled',
}

const DEFAULT_CURRENT_CLUB_ID = '49caba57-9a5e-4820-b4bf-06cfc684e8b2'

const RACE_PROFILE_RETURN_STORAGE_KEY = 'pro_peloton_race_profile_return_state_v1'
const RACE_DETAIL_SOURCE_RETURN_STORAGE_KEY =
  'pro_peloton_race_detail_source_return_state_v1'

type RaceDetailReturnState = {
  from?: string
  returnTo?: string
  returnLabel?: string
  returnScrollY?: number
  returnScrollX?: number
  restoreScrollY?: number
  restoreScrollX?: number
  returnRaceId?: string
  returnCalendarView?: string
  returnMonthNumber?: number
  raceInfoExpanded?: boolean
  restoreRaceInfoExpanded?: boolean
  raceInfoTab?: RaceInfoTab
  sourceRaceId?: string
  createdAtMs?: number
}

const VIEWER_TEAM_ROW_HIGHLIGHT_CLASS =
  'bg-yellow-100/80 shadow-[inset_4px_0_0_rgba(234,179,8,0.65)]'

const RESULT_TEAM_NAME_TRUNCATE_CLASS =
  'block max-w-full truncate whitespace-nowrap text-left'

const RESULT_RIDER_NAME_ONE_LINE_CLASS =
  'block whitespace-nowrap text-left font-semibold text-slate-900 transition hover:text-slate-950'

type ViewerTeamComparableRow = {
  team_id?: string | null
  club_id?: string | null
  teamId?: string | null
  clubId?: string | null
  race_team_entry_id?: string | null
  team?: { id?: string | null } | null
}

type ViewerTeamIdSource =
  | string
  | null
  | undefined
  | Array<string | null | undefined>
  | Set<string>

function getViewerTeamId(currentClubId?: string | null): string {
  return currentClubId ?? DEFAULT_CURRENT_CLUB_ID
}

function normalizeViewerTeamIds(
  viewerTeamIds?: ViewerTeamIdSource
): Set<string> {
  const rawValues =
    viewerTeamIds instanceof Set
      ? Array.from(viewerTeamIds)
      : Array.isArray(viewerTeamIds)
        ? viewerTeamIds
        : [viewerTeamIds]

  return new Set(
    rawValues
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  )
}

function getViewerTeamIds(
  currentClubId?: string | null,
  viewerClubFamilyIds?: Array<string | null | undefined>
): string[] {
  return Array.from(
    normalizeViewerTeamIds([
      currentClubId ?? DEFAULT_CURRENT_CLUB_ID,
      ...(viewerClubFamilyIds ?? []),
    ])
  )
}

function getComparableTeamIds(row: ViewerTeamComparableRow): string[] {
  return Array.from(
    normalizeViewerTeamIds([
      row.team_id,
      row.club_id,
      row.teamId,
      row.clubId,
      row.race_team_entry_id,
      row.team?.id,
    ])
  )
}

function isViewerTeamRow(
  row: ViewerTeamComparableRow,
  viewerTeamIds?: ViewerTeamIdSource
): boolean {
  const viewerIds = normalizeViewerTeamIds(viewerTeamIds)
  if (viewerIds.size === 0) return false

  return getComparableTeamIds(row).some((rowTeamId) => viewerIds.has(rowTeamId))
}

function viewerTeamRowClass(
  row: ViewerTeamComparableRow,
  viewerTeamIds?: ViewerTeamIdSource
): string {
  return isViewerTeamRow(row, viewerTeamIds)
    ? VIEWER_TEAM_ROW_HIGHLIGHT_CLASS
    : 'bg-white'
}


function CollapsibleRaceSection({
  eyebrow,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>

        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open ? <div className="border-t border-slate-100 p-6">{children}</div> : null}
    </section>
  )
}


function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function extractUuidFromText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const match = value.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )

  return isUuid(match?.[0]) ? match[0] : null
}

function useRaceIdFromRoute(): string | null {
  const params = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const candidates = [
    params.raceId,
    searchParams.get('raceId'),
    location.pathname,
    location.search,
    location.hash,
  ]

  if (typeof window !== 'undefined') {
    candidates.push(
      window.location.pathname,
      window.location.search,
      window.location.hash,
      window.location.href,
    )
  }

  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate

    const extracted = extractUuidFromText(candidate)
    if (extracted) return extracted
  }

  return null
}

function formatShortDate(value?: string | null): string {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function normalizeCountryCode(code?: string | null): string | null {
  if (!code) return null

  const normalized = code.trim().toUpperCase()

  if (normalized === 'UK') return 'GB'
  if (!/^[A-Z]{2}$/.test(normalized)) return null

  return normalized
}

function getFlagImageUrl(code?: string | null): string | null {
  const normalized = normalizeCountryCode(code)
  if (!normalized) return null

  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
}

function CountryFlag({ code }: { code?: string | null }) {
  const flagUrl = getFlagImageUrl(code)
  const normalized = normalizeCountryCode(code)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [normalized])

  if (!flagUrl || !normalized || hasError) {
    return (
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100 align-middle"
        title={normalized ?? 'Unknown country'}
        aria-label={normalized ?? 'Unknown country'}
      />
    )
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function RaceTitleFlag({ code }: { code?: string | null }) {
  const flagUrl = getFlagImageUrl(code)
  const normalized = normalizeCountryCode(code)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [normalized])

  if (!flagUrl || !normalized || hasError) {
    return (
      <span className="inline-block h-6 w-9 shrink-0 rounded border border-slate-200 bg-slate-100" />
    )
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-6 w-9 shrink-0 rounded border border-slate-200 object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function SmallCountryFlag({ code }: { code?: string | null }) {
  const flagUrl = getFlagImageUrl(code)
  const normalized = normalizeCountryCode(code)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [normalized])

  if (!flagUrl || !normalized || hasError) {
    return (
      <span
        className="inline-block h-3 w-4 shrink-0 rounded-[2px] border border-slate-200 bg-slate-100 align-middle"
        title={normalized ?? 'Unknown country'}
        aria-label={normalized ?? 'Unknown country'}
      />
    )
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-3 w-4 shrink-0 rounded-[2px] border border-slate-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function getTeamInitials(name?: string | null): string {
  const cleanName = name?.trim()

  if (!cleanName) return 'TM'

  const words = cleanName
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function getParticipantTeamName(team: RaceParticipantTeam): string {
  return team.club_name?.trim() || team.team_name_snapshot?.trim() || 'Team'
}

function TeamLogo({
  team,
  className = 'h-12 w-12',
}: {
  team: RaceParticipantTeam
  className?: string
}) {
  const [hasError, setHasError] = useState(false)

  const logoUrl =
    team.logo_url_snapshot && team.logo_url_snapshot.trim() !== '' && !hasError
      ? team.logo_url_snapshot.trim()
      : null
  const teamName = getParticipantTeamName(team)

  useEffect(() => {
    setHasError(false)
  }, [team.logo_url_snapshot])

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm font-bold text-slate-700 ${className}`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${teamName} logo`}
          className="h-full w-full rounded-xl object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span>{getTeamInitials(teamName)}</span>
      )}
    </div>
  )
}

function TeamJerseyImage({
  team,
  className = 'h-12 w-12',
}: {
  team: RaceParticipantTeam
  className?: string
}) {
  const [hasError, setHasError] = useState(false)
  const teamName = getParticipantTeamName(team)
  const jerseyUrl =
    team.jersey_url_snapshot && team.jersey_url_snapshot.trim() !== '' && !hasError
      ? team.jersey_url_snapshot.trim()
      : null

  useEffect(() => {
    setHasError(false)
  }, [team.jersey_url_snapshot])

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-center text-xs font-semibold text-slate-400 ${className}`}
    >
      {jerseyUrl ? (
        <img
          src={jerseyUrl}
          alt={`${teamName} jersey`}
          className="h-full w-full scale-[1.12] object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span>Jersey preview unavailable</span>
      )}
    </div>
  )
}

function normalizeResultTeamLookupName(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

const ORPHAN_RESULT_TEAM_GENERIC_JERSEY_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit37.png'

function getResultParticipantTeam(
  participantTeams: RaceParticipantTeam[],
  teamId?: string | null,
  teamName?: string | null
): RaceParticipantTeam | null {
  const normalizedTeamId = teamId?.trim() ?? ''
  const normalizedTeamName = normalizeResultTeamLookupName(teamName)

  if (normalizedTeamId) {
    const teamById = participantTeams.find((team) =>
      [
        team.id,
        team.team_id,
        team.club_id,
        team.owner_club_id,
        team.participating_club_id,
        team.parent_club_id,
        team.race_team_entry_id,
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .includes(normalizedTeamId)
    )

    if (teamById) return teamById
  }

  if (!normalizedTeamName) return null

  return (
    participantTeams.find((team) =>
      [
        getParticipantTeamName(team),
        team.club_name,
        team.team_name_snapshot,
      ]
        .map((value) => normalizeResultTeamLookupName(value))
        .filter(Boolean)
        .includes(normalizedTeamName)
    ) ?? null
  )
}

function ResultTeamJerseyCell({
  teamId,
  teamName,
  participantTeams,
  onOpenTeamProfile,
}: {
  teamId?: string | null
  teamName?: string | null
  participantTeams: RaceParticipantTeam[]
  onOpenTeamProfile: (teamId: string) => void
}) {
  const participantTeam = getResultParticipantTeam(
    participantTeams,
    teamId,
    teamName
  )
  const isOrphanResultTeam =
    !participantTeam && Boolean(teamId?.trim() || teamName?.trim())
  const resolvedTeamName =
    teamName?.trim() ||
    (participantTeam ? getParticipantTeamName(participantTeam) : '') ||
    '—'
  /*
   * Result rows can carry a race-entry id, a snapshot team id or the real
   * club id. A profile link is allowed only after the row resolves to a team
   * from the official Teams & riders participant list. Never trust the raw
   * result team_id as a profile destination on its own.
   */
  const resolvedTeamId = participantTeam
    ? participantTeam.participating_club_id?.trim() ||
      participantTeam.club_id?.trim() ||
      participantTeam.owner_club_id?.trim() ||
      participantTeam.team_id?.trim() ||
      participantTeam.id?.trim() ||
      participantTeam.parent_club_id?.trim() ||
      null
    : null
  /*
   * Defensive fallback for old/test race data: a result can reference a team
   * that is not present in the official Teams & riders participant list.
   * Such a row gets the neutral generic jersey and deliberately receives no
   * team-profile link, even when the result contains a raw team_id.
   */
  const rawJerseyUrl =
    participantTeam?.jersey_url_snapshot?.trim() ||
    (isOrphanResultTeam ? ORPHAN_RESULT_TEAM_GENERIC_JERSEY_URL : null)
  const teamCellTitle = isOrphanResultTeam
    ? `${resolvedTeamName} · profile unavailable because this team is not in the race participant list`
    : resolvedTeamName
  const [jerseyLoadFailed, setJerseyLoadFailed] = useState(false)
  const jerseyUrl = jerseyLoadFailed ? null : rawJerseyUrl

  useEffect(() => {
    setJerseyLoadFailed(false)
  }, [rawJerseyUrl])

  if (!jerseyUrl) {
    if (!resolvedTeamId) {
      return (
        <span className={RESULT_TEAM_NAME_TRUNCATE_CLASS} title={teamCellTitle}>
          {resolvedTeamName}
        </span>
      )
    }

    return (
      <button
        type="button"
        onClick={() => onOpenTeamProfile(resolvedTeamId)}
        className={`${RESULT_TEAM_NAME_TRUNCATE_CLASS} text-slate-600 transition hover:text-slate-950`}
        title={teamCellTitle}
      >
        {resolvedTeamName}
      </button>
    )
  }

  const jerseyPreview = (
    <>
      <img
        src={jerseyUrl}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[5] object-contain opacity-95 transition-transform duration-500 ease-out group-hover:scale-[5.2] group-focus-visible:scale-[5.2]"
        style={{
          objectPosition: '50% 37%',
          transformOrigin: '50% 37%',
        }}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setJerseyLoadFailed(true)}
      />

      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-slate-950/5" />

      <span className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-gradient-to-l from-white via-white/95 to-transparent transition-all duration-500 ease-out group-hover:w-[90%] group-focus-visible:w-[90%]" />

      <span className="pointer-events-none absolute inset-y-0 left-[10%] right-0 flex translate-x-3 items-center justify-end px-3 text-right text-xs font-semibold text-slate-900 opacity-0 transition-all duration-500 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
        <span className="block max-w-full truncate">{resolvedTeamName}</span>
      </span>

      <span className="sr-only">{resolvedTeamName}</span>
    </>
  )

  const sharedClassName =
    'group relative block h-9 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm outline-none transition duration-300 hover:border-slate-300 hover:shadow-md focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-200'

  if (!resolvedTeamId) {
    return (
      <div className={`${sharedClassName} cursor-default`} title={teamCellTitle}>
        {jerseyPreview}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpenTeamProfile(resolvedTeamId)}
      className={sharedClassName}
      title={teamCellTitle}
      aria-label={`Open ${resolvedTeamName} team profile`}
    >
      {jerseyPreview}
    </button>
  )
}

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null

  return date
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDaysToDateOnly(value: string | null | undefined, days: number): string | null {
  const startDate = parseDateOnly(value)
  if (!startDate) return null

  const nextDate = new Date(startDate)
  nextDate.setDate(nextDate.getDate() + days)

  return formatDateOnly(nextDate)
}

function getStageDateOrFallback(stage: RaceStage, race: Race | null): string | null {
  const existingStageDate = stage.stage_date?.trim()
  if (existingStageDate) return existingStageDate

  const stageNumber = Number(stage.stage_number)
  if (!Number.isFinite(stageNumber) || stageNumber < 1) return null

  return addDaysToDateOnly(race?.start_date, stageNumber - 1)
}

function hydrateStageDates(race: Race | null, stages: RaceStage[]): RaceStage[] {
  return stages.map((stage) => {
    const stageDate = getStageDateOrFallback(stage, race)

    return stageDate && stageDate !== stage.stage_date
      ? { ...stage, stage_date: stageDate }
      : stage
  })
}

function getStageForCurrentGameDate(
  race: Race | null,
  stages: RaceStage[],
  currentGameDateValue: string | null | undefined
): RaceStage | null {
  if (stages.length === 0) return null

  const hydratedStages = hydrateStageDates(
    race,
    [...stages].sort(
      (a, b) => Number(a.stage_number) - Number(b.stage_number)
    )
  )

  const currentDate = parseDateOnly(currentGameDateValue)

  if (!currentDate) return hydratedStages[0] ?? null

  const exactStage = hydratedStages.find((stage) => {
    const stageDate = parseDateOnly(stage.stage_date)
    return stageDate?.getTime() === currentDate.getTime()
  })

  if (exactStage) return exactStage

  const firstUpcomingStage = hydratedStages.find((stage) => {
    const stageDate = parseDateOnly(stage.stage_date)
    return stageDate ? stageDate > currentDate : false
  })

  if (firstUpcomingStage) return firstUpcomingStage

  return hydratedStages[hydratedStages.length - 1] ?? null
}

function startOfDay(value: string | null | undefined): Date | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  date.setHours(0, 0, 0, 0)
  return date
}

function shouldShowStageWeather(
  stageDateValue: string | null | undefined,
  currentGameDateValue: string | null | undefined
): boolean {
  const stageDate = startOfDay(stageDateValue)
  const currentGameDate = startOfDay(currentGameDateValue)

  if (!stageDate || !currentGameDate) return false

  const revealDate = new Date(stageDate)
  revealDate.setDate(revealDate.getDate() - 7)

  return currentGameDate >= revealDate
}

function differenceInDays(a: Date, b: Date): number {
  const left = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const right = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((left - right) / 86400000)
}

const GAME_MONTH_LENGTH = 30

const GAME_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const GAME_MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function getGameDatePartsFromCanonical(
  canonicalDate: string,
  currentMonthStart: Date,
  currentSeasonNumber: number,
  currentMonthNumber: number
) {
  const target = parseDateOnly(canonicalDate)
  if (!target) {
    return {
      seasonNumber: currentSeasonNumber,
      monthNumber: currentMonthNumber,
      dayNumber: 1,
    }
  }

  const diff = differenceInDays(target, currentMonthStart)
  const monthOffset = Math.floor(diff / GAME_MONTH_LENGTH)
  const absoluteMonthIndex =
    (currentSeasonNumber - 1) * 12 + (currentMonthNumber - 1) + monthOffset

  const seasonNumber = Math.floor(absoluteMonthIndex / 12) + 1
  const monthNumber = ((absoluteMonthIndex % 12) + 12) % 12 + 1
  const dayNumber = diff - monthOffset * GAME_MONTH_LENGTH + 1

  return {
    seasonNumber,
    monthNumber,
    dayNumber,
  }
}

function formatGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number
): string {
  const monthName = GAME_MONTH_NAMES[monthNumber - 1] ?? `Month ${monthNumber}`
  return `Season ${seasonNumber} - ${monthName} ${dayNumber}`
}

function getGameMonthShortName(monthNumber: number): string {
  return GAME_MONTH_SHORT_NAMES[monthNumber - 1] ?? `M${monthNumber}`
}

function formatCompactGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number
): string {
  return `S${seasonNumber} · ${getGameMonthShortName(monthNumber)} ${String(dayNumber).padStart(2, '0')}`
}

function getWeekdayShortName(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

const BASE_GAME_SEASON_YEAR = 2000

function getGameDatePartsFromStoredRaceDate(
  canonicalDate?: string | null
): GameDateParts | null {
  const date = parseDateOnly(canonicalDate)

  if (!date) return null

  return {
    seasonNumber: Math.max(1, date.getFullYear() - BASE_GAME_SEASON_YEAR + 1),
    monthNumber: date.getMonth() + 1,
    dayNumber: date.getDate(),
  }
}

function formatRaceDateRangeLabel(
  race: Race | null,
  currentMonthStart: Date | null,
  currentSeasonNumber: number,
  currentMonthNumber: number
): string {
  void currentMonthStart
  void currentSeasonNumber
  void currentMonthNumber

  if (!race) return 'Race dates: —'

  const startParts = getGameDatePartsFromStoredRaceDate(race.start_date)
  const endParts = getGameDatePartsFromStoredRaceDate(race.end_date ?? race.start_date)

  if (!startParts || !endParts) return 'Race dates: —'

  const startLabel = formatCompactGameDateDisplay(
    startParts.seasonNumber,
    startParts.monthNumber,
    startParts.dayNumber
  )

  const endLabel = formatCompactGameDateDisplay(
    endParts.seasonNumber,
    endParts.monthNumber,
    endParts.dayNumber
  )

  const sameDay =
    startParts.seasonNumber === endParts.seasonNumber &&
    startParts.monthNumber === endParts.monthNumber &&
    startParts.dayNumber === endParts.dayNumber

  return sameDay ? `Race date: ${startLabel}` : `Race dates: ${startLabel} → ${endLabel}`
}

function formatRaceHeaderHostLine(
  race: Race | null,
  currentMonthStart: Date | null,
  currentSeasonNumber: number,
  currentMonthNumber: number
): string {
  const raceDateLabel = formatRaceDateRangeLabel(
    race,
    currentMonthStart,
    currentSeasonNumber,
    currentMonthNumber
  )

  const host = race?.host_city?.trim()

  return host ? `${raceDateLabel} — ${host}` : raceDateLabel
}

type GameDateParts = {
  seasonNumber: number
  monthNumber: number
  dayNumber: number
}

function normalizeGameDateParts(parts: GameDateParts): GameDateParts {
  const rawOrdinal = getGameDateOrdinal(parts)
  return getGameDatePartsFromOrdinal(rawOrdinal)
}

function getGameDateOrdinal(parts: GameDateParts): number {
  return (
    (parts.seasonNumber - 1) * 12 * GAME_MONTH_LENGTH +
    (parts.monthNumber - 1) * GAME_MONTH_LENGTH +
    (parts.dayNumber - 1)
  )
}

function getGameDatePartsFromOrdinal(ordinal: number): GameDateParts {
  const monthIndex = Math.floor(ordinal / GAME_MONTH_LENGTH)
  const dayNumber = ordinal - monthIndex * GAME_MONTH_LENGTH + 1

  return {
    seasonNumber: Math.floor(monthIndex / 12) + 1,
    monthNumber: ((monthIndex % 12) + 12) % 12 + 1,
    dayNumber,
  }
}

function subtractGameDays(parts: GameDateParts, days: number): GameDateParts {
  return getGameDatePartsFromOrdinal(getGameDateOrdinal(parts) - days)
}

function getCurrentGameDateParts(
  currentSeasonNumber: number,
  currentMonthNumber: number,
  currentDayNumber: number
): GameDateParts {
  return normalizeGameDateParts({
    seasonNumber: currentSeasonNumber,
    monthNumber: currentMonthNumber,
    dayNumber: currentDayNumber,
  })
}

function getRaceApplicationOpenParts(raceStartParts: GameDateParts): GameDateParts {
  if (raceStartParts.monthNumber >= 4) {
    return subtractGameDays(raceStartParts, 90)
  }

  return {
    seasonNumber: raceStartParts.seasonNumber,
    monthNumber: 1,
    dayNumber: 1,
  }
}

function getRaceApplicationWindowParts(
  race: Race | null,
  currentMonthStart: Date | null,
  currentSeasonNumber: number,
  currentMonthNumber: number
): { openParts: GameDateParts; closeParts: GameDateParts; startParts: GameDateParts } | null {
  if (!race || !currentMonthStart) return null

  const startParts = getGameDatePartsFromCanonical(
    race.start_date,
    currentMonthStart,
    currentSeasonNumber,
    currentMonthNumber
  )

  return {
    openParts: getRaceApplicationOpenParts(startParts),
    closeParts: startParts,
    startParts,
  }
}

function formatApplicationWindowDate(parts?: GameDateParts | null): string {
  if (!parts) return '—'

  return formatGameDateDisplay(parts.seasonNumber, parts.monthNumber, parts.dayNumber)
}

function getMonthStartFromGameDate(currentGameDate: string, currentDayNumber: number): Date {
  const current = parseDateOnly(currentGameDate) ?? new Date()
  const next = new Date(current)
  next.setDate(next.getDate() - (currentDayNumber - 1))
  return next
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null

  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function toKmNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatKm(value: number | string | null | undefined): string {
  const parsed = asNumber(value)

  if (parsed === null) return '—'

  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)} km`
}

function formatPct(value: number | string | null | undefined): string {
  const parsed = asNumber(value)

  if (parsed === null) return '0%'

  return `${parsed.toFixed(0)}%`
}

function formatMeters(value?: number | null): string {
  if (value === null || value === undefined) return '—'

  return `${value.toLocaleString()} m`
}

function humanizeCode(value?: string | null): string {
  if (!value) return '—'

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRiderRole(role?: string | null): string {
  if (!role) return 'Role —'

  return humanizeCode(role)
}


function hasWeather(stage: RaceStage): boolean {
  const weather = stage.weather_snapshot ?? {}

  return Object.keys(weather).length > 0 && weather.source !== 'missing_country_code'
}


function getRaceWeatherCancellationStatus(race?: Race | null): string | null {
  const metadata = race?.metadata ?? {}
  const value = metadata.weather_cancellation_status

  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null
}

function getRaceWeatherCanceledStageCount(race?: Race | null): number {
  const metadata = race?.metadata ?? {}
  const value = metadata.weather_cancelled_stage_count

  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function getRaceWeatherTotalStageCount(race?: Race | null): number {
  const metadata = race?.metadata ?? {}
  const value = metadata.weather_total_stage_count

  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return Number(race?.stage_count ?? 0)
}

function isRaceAllWeatherCanceled(race?: Race | null): boolean {
  const metadata = race?.metadata ?? {}
  const explicitValue = metadata.weather_all_stages_cancelled

  if (typeof explicitValue === 'boolean') return explicitValue
  if (typeof explicitValue === 'string') return explicitValue.toLowerCase() === 'true'

  return getRaceWeatherCancellationStatus(race) === 'all_stages_weather_cancelled'
}

function isRacePartlyWeatherCanceled(race?: Race | null): boolean {
  return getRaceWeatherCancellationStatus(race) === 'partly_weather_cancelled'
}

function getRaceWeatherCancellationDisplayStatus(race?: Race | null): string | null {
  if (isRaceAllWeatherCanceled(race)) return 'Race canceled'
  if (isRacePartlyWeatherCanceled(race)) return 'Weather affected'

  return null
}

function isStageWeatherCanceled(stage?: RaceStage | null): boolean {
  return stage?.weather_cancelled === true
}

function getWeatherCancellationReasonLabel(reason?: string | null): string {
  switch (reason) {
    case 'snow':
      return 'Snow'
    case 'temperature_below_5c':
      return 'Average temperature below 5°C'
    default:
      return reason ? humanizeCode(reason) : 'Unsafe weather'
  }
}

function getStageWeatherCancellationReasonLabel(stage?: RaceStage | null): string {
  return getWeatherCancellationReasonLabel(stage?.weather_cancellation_reason ?? null)
}

function getStageWeatherCancellationRiskReason(stage?: RaceStage | null): string | null {
  if (!stage || !hasWeather(stage)) return null

  const weather = stage.weather_snapshot ?? {}
  const conditionText = String(
    weather.condition ??
      weather.condition_label ??
      weather.label ??
      weather.name ??
      ''
  )
    .trim()
    .toLowerCase()

  const avgTemp = asNumber(
    (weather.avg_temp_c ??
      weather.average_temp_c ??
      weather.temperature_c ??
      weather.temp_c) as number | string | null | undefined
  )

  if (conditionText === 'snow' || conditionText.includes('snow')) {
    return 'snow'
  }

  if (avgTemp !== null && avgTemp < 5) {
    return 'temperature_below_5c'
  }

  return null
}

function getStageWeatherDecisionText(stage?: RaceStage | null): string {
  if (isStageWeatherCanceled(stage)) {
    return 'The stage has already been canceled by the race engine.'
  }

  if (!stage || !hasWeather(stage)) {
    return 'Weather is not generated yet, so no cancellation decision can be made.'
  }

  return 'Cancellation is decided automatically 24 in-game hours before the stage start, using the generated stage weather. Snow or an average temperature below 5°C cancels the stage.'
}

function getWeatherCancellationNoticeText(stage?: RaceStage | null, race?: Race | null): string {
  if (!stage) {
    if (isRaceAllWeatherCanceled(race)) {
      return 'The race was canceled due to weather. No race result was generated.'
    }

    return 'This race has weather cancellation metadata.'
  }

  const reason = getStageWeatherCancellationReasonLabel(stage)

  if (race?.is_stage_race) {
    return `Stage ${stage.stage_number} was canceled due to weather (${reason}). No results, points, prize money, fatigue or replay were generated for this stage. The stage race continues with the next runnable stage.`
  }

  return `This one-day race was canceled due to weather (${reason}). No results, points, prize money, fatigue or replay were generated.`
}

function WeatherCancellationNotice({
  stage,
  race,
  compact = false,
}: {
  stage?: RaceStage | null
  race?: Race | null
  compact?: boolean
}) {
  const raceStatus = getRaceWeatherCancellationStatus(race)
  const shouldRender =
    isStageWeatherCanceled(stage) ||
    raceStatus === 'all_stages_weather_cancelled' ||
    raceStatus === 'partly_weather_cancelled'

  if (!shouldRender) return null

  const title = isStageWeatherCanceled(stage)
    ? 'Stage canceled due to weather'
    : raceStatus === 'all_stages_weather_cancelled'
      ? 'Race canceled due to weather'
      : 'Race partly canceled by weather'

  return (
    <div
      className={[
        'rounded-2xl border border-red-200 bg-red-50 text-red-900',
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm',
      ].join(' ')}
    >
      <div className="font-semibold">{title}</div>
      <div className={compact ? 'mt-1 leading-5' : 'mt-1 leading-6'}>
        {getWeatherCancellationNoticeText(stage, race)}
      </div>
    </div>
  )
}

function StageWeatherRiskNotice({ stage }: { stage: RaceStage }) {
  if (isStageWeatherCanceled(stage)) return null

  const riskReason = getStageWeatherCancellationRiskReason(stage)
  if (!riskReason) return null

  return (
    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
      <div className="font-semibold">
        Weather cancellation likely: {getWeatherCancellationReasonLabel(riskReason)}
      </div>
      <div className="mt-1 leading-6">
        This is only a warning before the lock point. The final cancellation decision is made automatically 24 in-game hours before stage start.
      </div>
    </div>
  )
}

function getWeatherIcon(condition: string | null | undefined): string {
  switch (condition) {
    case 'clear':
      return '☀️'
    case 'partly_cloudy':
      return '⛅'
    case 'overcast':
      return '☁️'
    case 'foggy':
      return '🌫️'
    case 'drizzle':
      return '🌦️'
    case 'rain':
      return '🌧️'
    case 'heavy_rain':
      return '🌧️'
    case 'thunderstorm':
      return '⛈️'
    case 'snow':
      return '❄️'
    case 'sleet':
      return '🌨️'
    default:
      return '☁️'
  }
}

function getRaceApplicationBadgeLabel(status?: string | null): string {
  switch (status) {
    case 'not_open':
      return 'Applications not open'
    case 'open':
      return 'Open for Applications'
    case 'closed':
      return 'Applications closed'
    case 'race_active':
      return 'Race active'
    case 'race_finished':
      return 'Race finished'
    case 'cancelled':
      return 'Race canceled'
    default:
      return 'Applications closed'
  }
}

function canApplyForRace(
  applicationsStatus?: string | null,
  existingApplicationStatus?: string | null,
  raceStatus?: string | null
): boolean {
  const normalizedRaceStatus = raceStatus?.toLowerCase() ?? null
  const normalizedEntryStatus = existingApplicationStatus?.toLowerCase() ?? null

  if (
    normalizedRaceStatus === 'active' ||
    normalizedRaceStatus === 'completed' ||
    normalizedRaceStatus === 'archived' ||
    normalizedRaceStatus === 'cancelled'
  ) {
    return false
  }

  if (applicationsStatus !== 'open') return false

  return !normalizedEntryStatus || normalizedEntryStatus === 'withdrawn'
}

function getTeamRaceEntryStatusLabel(status?: string | null): string | null {
  switch (status?.toLowerCase()) {
    case 'applied':
    case 'application_submitted':
    case 'application submitted':
    case 'pending':
      return 'Application submitted'
    case 'accepted':
      return 'Accepted'
    case 'declined':
      return 'Declined'
    case 'withdrawn':
      return 'Withdrawn'
    case 'missed_startlist':
      return 'Missed startlist'
    case 'cancelled':
      return 'Canceled'
    default:
      return null
  }
}

function isPendingRaceApplicationStatus(status?: string | null): boolean {
  const normalized = status?.toLowerCase().trim() ?? ''

  return (
    normalized === 'applied' ||
    normalized === 'pending' ||
    normalized === 'application_submitted' ||
    normalized === 'application submitted'
  )
}

function getRaceDetailStatusLabel(
  applicationsStatus?: string | null,
  raceStatus?: string | null,
  existingApplicationStatus?: string | null
): string {
  const normalizedRaceStatus = raceStatus?.toLowerCase() ?? null

  if (normalizedRaceStatus === 'active') return 'Race active'
  if (normalizedRaceStatus === 'completed' || normalizedRaceStatus === 'archived') {
    return 'Race finished'
  }
  if (normalizedRaceStatus === 'cancelled') return 'Canceled'

  return (
    getTeamRaceEntryStatusLabel(existingApplicationStatus) ??
    getRaceApplicationBadgeLabel(applicationsStatus)
  )
}

function isRaceStartlistLocked(raceStatus?: string | null): boolean {
  const normalizedRaceStatus = raceStatus?.toLowerCase() ?? null

  return (
    normalizedRaceStatus === 'active' ||
    normalizedRaceStatus === 'completed' ||
    normalizedRaceStatus === 'archived' ||
    normalizedRaceStatus === 'cancelled'
  )
}

function getRaceLifecycleNotice(raceStatus?: string | null): string | null {
  const normalizedRaceStatus = raceStatus?.toLowerCase() ?? null

  if (normalizedRaceStatus === 'active') {
    return 'Race active. The startlist is locked and this race is awaiting race simulation.'
  }

  if (normalizedRaceStatus === 'completed' || normalizedRaceStatus === 'archived') {
    return 'Race finished. Applications and rider submissions are closed.'
  }

  if (normalizedRaceStatus === 'cancelled') {
    return 'Race cancelled. Applications and rider submissions are closed.'
  }

  return null
}

function getRaceDetailStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Open for Applications':
      return 'bg-sky-100 text-sky-700'
    case 'Applications not open':
      return 'bg-slate-100 text-slate-600'
    case 'Applications closed':
      return 'bg-gray-100 text-gray-600'
    case 'Application submitted':
      return 'bg-sky-100 text-sky-700'
    case 'Accepted':
      return 'bg-green-100 text-green-700'
    case 'Declined':
      return 'bg-red-100 text-red-700'
    case 'Withdrawn':
      return 'bg-slate-100 text-slate-600'
    case 'Missed startlist':
      return 'bg-orange-100 text-orange-700'
    case 'Race active':
      return 'bg-green-100 text-green-700'
    case 'Race finished':
      return 'bg-gray-200 text-gray-700'
    case 'Race canceled':
    case 'Canceled':
      return 'bg-red-100 text-red-700 ring-1 ring-red-200'
    case 'Partly canceled':
    case 'Weather affected':
      return 'bg-orange-100 text-orange-700 ring-1 ring-orange-200'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getStageDateLabel(
  stage: RaceStage,
  race: Race | null,
  currentMonthStart: Date | null,
  currentSeasonNumber: number,
  currentMonthNumber: number
): string {
  void currentMonthStart
  void currentSeasonNumber
  void currentMonthNumber

  let stageDate = stage.stage_date

  if (!stageDate && race?.start_date && stage.stage_number) {
    stageDate = addDaysToDateOnly(race.start_date, Number(stage.stage_number) - 1)
  }

  const stageDateObject = parseDateOnly(stageDate)
  const parts = getGameDatePartsFromStoredRaceDate(stageDate)

  if (!stageDateObject || !parts) return '—'

  const weekdayLabel = getWeekdayShortName(stageDateObject)
  const monthLabel = getGameMonthShortName(parts.monthNumber)
  const dayLabel = String(parts.dayNumber).padStart(2, '0')

  return `S${parts.seasonNumber} · ${weekdayLabel} · ${monthLabel} ${dayLabel}`
}

function formatTimeLabelFromParts(
  hourValue?: number | string | null,
  minuteValue?: number | string | null
): string | null {
  const hour = asNumber(hourValue)
  const minute = asNumber(minuteValue)

  if (hour === null || minute === null) return null

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getStageStartTimeLabel(stage: RaceStage, race: Race | null): string | null {
  const storedStageLabel = stage.planned_start_time_label?.trim()

  if (storedStageLabel) return storedStageLabel

  const stageTimeLabel = formatTimeLabelFromParts(
    stage.planned_start_hour_number,
    stage.planned_start_minute
  )

  if (stageTimeLabel) return stageTimeLabel

  const stageNumber = Number(stage.stage_number)

  if (stageNumber === 1) {
    const storedRaceLabel = race?.planned_start_time_label?.trim()

    if (storedRaceLabel) return storedRaceLabel

    return formatTimeLabelFromParts(
      race?.planned_start_hour_number,
      race?.planned_start_minute
    )
  }

  return null
}

function getStageDateTimeLabel(
  stage: RaceStage,
  race: Race | null,
  currentMonthStart: Date | null,
  currentSeasonNumber: number,
  currentMonthNumber: number
): string {
  const dateLabel = getStageDateLabel(
    stage,
    race,
    currentMonthStart,
    currentSeasonNumber,
    currentMonthNumber
  )
  const timeLabel = getStageStartTimeLabel(stage, race)

  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
}

function formatStageRoute(stage: RaceStage): string {
  const routeLabel = stage.route_label?.trim()

  if (routeLabel) return routeLabel

  const start = stage.start_city?.trim() || 'Start TBD'
  const finish = stage.finish_city?.trim() || 'Finish TBD'

  if (start === finish) return `${start} circuit`

  return `${start} → ${finish}`
}

function getStageProfileLabel(stage: RaceStage): string {
  return TERRAIN_LABELS[stage.terrain_type] ?? humanizeCode(stage.terrain_type)
}

type StageProfilePoint = {
  km: number
  elevation_m: number
}


function getTerrainMinimumVerticalSpanMeters(terrainType: string | null | undefined): number {
  switch (terrainType) {
    case 'mountain':
      return 1400

    case 'hilly':
      return 800

    case 'cobbled':
      return 600

    case 'individual_time_trial':
    case 'team_time_trial':
    case 'prologue':
    case 'flat':
    default:
      return 500
  }
}

function getNiceElevationAxisBounds(
  points: StageProfilePoint[],
  terrainType: string | null | undefined
): { minElevation: number; maxElevation: number } {
  const rawMin = Math.min(...points.map((point) => point.elevation_m))
  const rawMax = Math.max(...points.map((point) => point.elevation_m))

  const dataSpan = Math.max(rawMax - rawMin, 1)
  const minimumSpan = getTerrainMinimumVerticalSpanMeters(terrainType)

  const targetSpan = Math.max(dataSpan * 1.25, minimumSpan)
  const midpoint = (rawMin + rawMax) / 2

  const minElevation = Math.max(0, Math.floor((midpoint - targetSpan / 2) / 100) * 100)
  const maxElevation = Math.ceil((midpoint + targetSpan / 2) / 100) * 100

  return {
    minElevation,
    maxElevation: Math.max(maxElevation, minElevation + 100),
  }
}

function getElevationTickValues(minElevation: number, maxElevation: number): number[] {
  const values: number[] = []

  for (let value = maxElevation; value >= minElevation; value -= 100) {
    values.push(value)
  }

  return values
}

function buildStageProfilePath(
  points: StageProfilePoint[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  terrainType: string | null | undefined
) {
  if (points.length < 2) return ''

  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const minKm = Math.min(...points.map((point) => point.km))
  const maxKm = Math.max(...points.map((point) => point.km))

  const { minElevation, maxElevation } = getNiceElevationAxisBounds(points, terrainType)

  const kmSpan = Math.max(maxKm - minKm, 1)
  const elevationSpan = Math.max(maxElevation - minElevation, 1)

  const coordinates = points.map((point) => {
    const x = padding.left + ((point.km - minKm) / kmSpan) * innerWidth
    const y =
      padding.top +
      innerHeight -
      ((point.elevation_m - minElevation) / elevationSpan) * innerHeight

    return { x, y, km: point.km, elevation_m: point.elevation_m }
  })

  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`
    }

    const previous = coordinates[index - 1]
    const controlX = (previous.x + point.x) / 2

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, '')

  const areaPath = [
    linePath,
    `L ${coordinates[coordinates.length - 1].x} ${height - padding.bottom}`,
    `L ${coordinates[0].x} ${height - padding.bottom}`,
    'Z',
  ].join(' ')

  return JSON.stringify({
    linePath,
    areaPath,
    coordinates,
    minElevation,
    maxElevation,
    minKm,
    maxKm,
  })
}


/*
 * Visual-only gap scaling for the profile replay.
 *
 * This does not change race data, standings, timing, or backend groups.
 * It only prevents groups with real gaps like +1:18 from being drawn
 * almost on top of the front group.
 */


function getRoadGroupVisualGapKm(gapSeconds: number, currentKm: number, maxKm: number): number {
  if (!Number.isFinite(gapSeconds) || gapSeconds <= 0) return 0

  /*
   * Visual-only road gap spacing.
   * The database km_marker stays unchanged. This only separates markers on the
   * stage profile so a B1/P group with +30–40s does not render as one dot.
   */
  const rawGapKm = gapSeconds * 0.035
  const minimumVisibleGapKm =
    gapSeconds >= 90 ? 2.25 :
    gapSeconds >= 45 ? 1.45 :
    gapSeconds >= 20 ? 0.9 :
    0.35

  const cappedGapKm = Math.min(8, Math.max(minimumVisibleGapKm, rawGapKm))

  /*
   * Near the start, do not push the group fully outside the visible profile.
   * Keep at least a small part of the actual progress visible.
   */
  const earlyRaceCap = currentKm < 8 ? Math.max(0.25, currentKm * 0.65) : cappedGapKm
  const safeGapKm = Math.min(cappedGapKm, earlyRaceCap)

  return Math.max(0, Math.min(safeGapKm, Math.max(0, maxKm)))
}


function getRoadGroupProfileKmFromGap({
  actualKm,
  leaderKm,
  gapSeconds,
  avgSpeedKmh,
  previousGroupKm,
  maxKm,
  backendNormalized = false,
}: {
  actualKm: number
  leaderKm: number
  gapSeconds: number
  avgSpeedKmh?: number
  previousGroupKm?: number | null
  maxKm: number
  backendNormalized?: boolean
}): number {
  if (!Number.isFinite(actualKm)) return 0

  /*
   * V13 visual-only profile spacing.
   *
   * Backend v12 now keeps rider gaps, km movement, Peloton identity, and
   * internal group span stable. The remaining problem is visual: a group with
   * +10 to +25 minutes can still look too close to the leader if the profile
   * marker trusts backend km too much or caps the visible offset too tightly.
   *
   * This function does not rewrite race data. It only places the dot on the
   * stage profile so the marker distance better matches the displayed time gap.
   */
  if (!Number.isFinite(gapSeconds) || gapSeconds <= 0) {
    return Math.max(0, Math.min(maxKm, actualKm))
  }

  const speedKmh = Math.max(22, Math.min(50, Number(avgSpeedKmh ?? 38)))
  const physicalGapKm = (gapSeconds * speedKmh) / 3600

  const minimumVisibleGapKm =
    gapSeconds >= 1500 ? 14.0 :
    gapSeconds >= 1200 ? 11.5 :
    gapSeconds >= 900 ? 9.0 :
    gapSeconds >= 600 ? 6.5 :
    gapSeconds >= 420 ? 4.8 :
    gapSeconds >= 300 ? 3.5 :
    gapSeconds >= 180 ? 2.2 :
    gapSeconds >= 90 ? 1.2 :
    gapSeconds >= 30 ? 0.5 :
    0.15

  const maximumVisibleGapKm = Math.max(
    0.4,
    Math.min(
      // Keep the dot on the visible profile but allow very large gaps to look
      // genuinely far behind, especially around 90–140 km.
      Math.max(0.4, leaderKm - 0.35),
      gapSeconds >= 1500 ? 24.0 :
      gapSeconds >= 1200 ? 20.0 :
      gapSeconds >= 900 ? 16.0 :
      gapSeconds >= 600 ? 12.0 :
      gapSeconds >= 420 ? 9.0 :
      gapSeconds >= 300 ? 7.0 :
      gapSeconds >= 180 ? 5.0 :
      gapSeconds >= 90 ? 3.2 :
      gapSeconds >= 30 ? 1.8 :
      0.8
    )
  )

  const gapKm = Math.min(
    maximumVisibleGapKm,
    Math.max(minimumVisibleGapKm, physicalGapKm)
  )

  let displayKm = leaderKm - gapKm

  if (previousGroupKm !== null && previousGroupKm !== undefined) {
    // Maintain visual order and prevent groups with similar marker positions
    // from drawing on top of each other.
    displayKm = Math.min(displayKm, previousGroupKm - 0.28)
  }

  return Math.max(0, Math.min(maxKm, displayKm))
}


function isTimeTrialLikeStage(
  stage: RaceStage | null | undefined
): boolean {
  if (!stage) return false

  const stageFormat = String(
    (stage as RaceStage & { stage_format?: string | null }).stage_format ?? ''
  ).toLowerCase()

  const values = [
    stageFormat,
    stage.profile_type,
    stage.terrain_type,
    stage.finish_type,
    stage.name,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')

  return (
    values.includes('prologue') ||
    values.includes('individual_time_trial') ||
    values.includes('team_time_trial') ||
    values.includes('individual time trial') ||
    values.includes('team time trial') ||
    values.includes('time_trial')
  )
}

function isTeamTimeTrialLikeStage(
  stage: RaceStage | null | undefined
): boolean {
  if (!stage) return false

  const stageFormat = String(
    (stage as RaceStage & { stage_format?: string | null }).stage_format ?? ''
  ).toLowerCase()

  const values = [
    stageFormat,
    stage.profile_type,
    stage.terrain_type,
    stage.finish_type,
    stage.name,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')

  return (
    values.includes('team_time_trial') ||
    values.includes('team time trial')
  )
}

function isPrologueOrIndividualTimeTrialStage(
  stage: RaceStage | null | undefined
): boolean {
  return isTimeTrialLikeStage(stage) && !isTeamTimeTrialLikeStage(stage)
}




function WeatherCard({ stage }: { stage: RaceStage }) {
  const weather = stage.weather_snapshot ?? {}
  const condition = String(weather.condition ?? '')

  const avgTemp = asNumber(weather.avg_temp_c as number | string | undefined)
  const minTemp = asNumber(weather.avg_min_temp_c as number | string | undefined)
  const maxTemp = asNumber(weather.avg_max_temp_c as number | string | undefined)
  const wind = asNumber(weather.avg_wind_kmh as number | string | undefined)
  const rain = asNumber(weather.avg_precip_mm as number | string | undefined)

  const avgTempLabel = avgTemp === null ? '—' : `${avgTemp.toFixed(1)}°C`
  const minMaxTempLabel =
    minTemp === null || maxTemp === null
      ? '—'
      : `${minTemp.toFixed(1)} / ${maxTemp.toFixed(1)}°C`
  const windKmhLabel = wind === null ? '—' : `${wind.toFixed(0)} km/h`
  const rainMmLabel = rain === null ? '—' : `${rain.toFixed(1)} mm`

  if (!hasWeather(stage)) {
    return (
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Weather is not generated for this stage yet. Add a host country code, then run
        <span className="font-mono"> generate_race_stage_weather_v1(stage_id)</span>.
      </div>
    )
  }

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <WeatherCancellationNotice stage={stage} compact />
      <div className={isStageWeatherCanceled(stage) ? 'mt-4 flex items-start justify-between gap-4' : 'flex items-start justify-between gap-4'}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stage weather
          </div>

          <div className="mt-3 text-xl font-semibold text-slate-950">
            {humanizeCode(condition)}
          </div>
        </div>

        <div className="flex h-14 w-14 items-center justify-center text-4xl leading-none">
          {getWeatherIcon(condition)}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_1.25fr_1fr_1fr] gap-x-5 text-xs">
        <div className="min-w-0">
          <div className="text-slate-500">Average</div>
          <div className="mt-1 whitespace-nowrap text-[13px] font-semibold text-slate-950">
            {avgTempLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-slate-500">Min / max</div>
          <div className="mt-1 whitespace-nowrap text-[12px] font-semibold text-slate-950">
            {minMaxTempLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-slate-500">Wind</div>
          <div className="mt-1 whitespace-nowrap text-[13px] font-semibold text-slate-950">
            {windKmhLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-slate-500">Rain</div>
          <div className="mt-1 whitespace-nowrap text-[13px] font-semibold text-slate-950">
            {rainMmLabel}
          </div>
        </div>
      </div>

      <StageWeatherRiskNotice stage={stage} />

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        {getStageWeatherDecisionText(stage)}
      </div>
    </div>
  )
}
function TerrainBars({ stage }: { stage: RaceStage }) {
  const rows = [
    ['Flat', stage.flat_pct],
    ['Hilly', stage.hilly_pct],
    ['Mountain', stage.mountain_pct],
    ['Cobbled', stage.cobbled_pct],
  ] as const

  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => {
        const pct = Math.max(0, Math.min(100, asNumber(value) ?? 0))

        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>{label}</span>
              <span>{pct.toFixed(0)}%</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}


function TerrainSplitCard({
  terrainSplit,
}: {
  terrainSplit: RaceTerrainSplit
}) {
  const terrainRows = [
    { label: 'Flat', value: terrainSplit.flat ?? 0 },
    { label: 'Hilly', value: terrainSplit.hilly ?? 0 },
    { label: 'Mountain', value: terrainSplit.mountain ?? 0 },
    { label: 'Cobbled', value: terrainSplit.cobbled ?? 0 },
  ]

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Terrain split
      </div>

      <div className="mt-4 space-y-3">
        {terrainRows.map((row) => {
          const value = Math.max(0, Math.min(100, asNumber(row.value) ?? 0))

          return (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>{row.label}</span>
                <span>{value.toFixed(0)}%</span>
              </div>

              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-slate-800"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function StageWeatherCard({
  stage,
  currentGameDate,
}: {
  stage: RaceStage
  currentGameDate: string | null
}) {
  if (shouldShowStageWeather(stage.stage_date, currentGameDate)) {
    return <WeatherCard stage={stage} />
  }

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Stage weather
      </div>

      <div className="mt-4 text-sm text-slate-600">
        Weather forecast becomes visible 7 days before this stage.
      </div>
    </div>
  )
}


type StageProfileEventPoint = RaceStagePoint & {
  km: number
}


function getStagePointPointsLabel(point: StageProfileEventPoint): string {
  if (point.point_type === 'INTERMEDIATE_SPRINT') return 'Sprint points'
  if (point.point_type === 'BONUS_SPRINT') return 'Bonus sprint bonuses'
  if (point.point_type === 'KOM') return 'KOM points'
  if (point.point_type === 'FINISH') return 'Finish points'
  return 'Points'
}


function getStagePointCounts(points: StageProfileEventPoint[]) {
  return {
    komCount: points.filter((point) => point.point_type === 'KOM').length,
    sprintCount: points.filter(
      (point) =>
        point.point_type === 'INTERMEDIATE_SPRINT' ||
        point.point_type === 'BONUS_SPRINT'
    ).length,
  }
}

function renderScheme(value: unknown): string {
  if (value === null || value === undefined) return '—'

  if (Array.isArray(value)) {
    return value.length ? value.map(String).join(' / ') : '—'
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => `${humanizeCode(key)}: ${renderScheme(entryValue)}`)
      .join(' · ')
  }

  return String(value)
}


function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeRaceResultsPayload(value: unknown): RaceResultsViewPayload {
  const record = getRecord(value)

  return {
    race_id: typeof record.race_id === 'string' ? record.race_id : null,
    stage_id: typeof record.stage_id === 'string' ? record.stage_id : null,
    stage_results: arrayOrEmpty<RaceStageResultRow>(record.stage_results),
    point_results: arrayOrEmpty<RacePointResultRow>(record.point_results),
    classifications: arrayOrEmpty<RaceClassificationRow>(record.classifications),
    leader_snapshot: getRecord(record.leader_snapshot),
  }
}

function formatRaceClock(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '—'
  }

  const total = Math.max(0, Math.round(Number(seconds)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}


function formatPreciseRaceClock(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '—'
  }

  const totalMilliseconds = Math.max(0, Math.round(Number(seconds) * 1000))
  const wholeSeconds = Math.floor(totalMilliseconds / 1000)
  const milliseconds = totalMilliseconds % 1000
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const secs = wholeSeconds % 60

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

function formatTerrainModelLabel(value: string): string {
  return value.length === 0
    ? value
    : `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function formatSignedTerrainValue(value: number, digits = 1): string {
  const prefix = value > 0 ? '+' : ''

  return `${prefix}${value.toFixed(digits)}`
}


function formatGapValue(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '—'
  }

  const total = Math.max(0, Math.round(Number(seconds)))

  if (total === 0) return '0s'
  if (total < 60) return `${total}s`

  const minutes = Math.floor(total / 60)
  const secs = total % 60

  if (minutes < 60) return `${minutes}:${String(secs).padStart(2, '0')}`

  return formatRaceClock(total)
}

function formatStageGap(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  if (Number(seconds) === 0) return 's.t.'
  return `+${formatGapValue(seconds)}`
}

function formatClassificationGap(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  if (Number(seconds) === 0) return 'Leader'
  return `+${formatGapValue(seconds)}`
}


function formatResultPoints(points?: number | null): string {
  if (points === null || points === undefined) return '0'
  return String(points)
}

function sortRankedRows<T extends { rank: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })
}


function getPositiveNumber(value?: number | null): number {
  if (value === null || value === undefined) return 0

  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getStageResultPointTotals(
  row: RaceStageResultRow,
  view: StagePointAggregateView
): { points: number; bonusSeconds: number } {
  if (view === 'mountain') {
    return {
      points: getPositiveNumber(row.mountain_points),
      bonusSeconds: 0,
    }
  }

  return {
    points:
      getPositiveNumber(row.finish_points) +
      getPositiveNumber(row.sprint_points),
    bonusSeconds: getPositiveNumber(row.bonus_seconds),
  }
}

type StagePointAggregateSeed = Omit<AggregatedStagePointResultRow, 'rank'> & {
  bestSourceRank: number
}

function getStagePointAggregateKey(
  riderId?: string | null,
  teamId?: string | null,
  riderName?: string | null,
  teamName?: string | null
): string {
  return [
    riderId || 'no-rider-id',
    teamId || 'no-team-id',
    riderName || 'no-rider-name',
    teamName || 'no-team-name',
  ].join('|')
}

function addStagePointAggregateSeed(
  map: Map<string, StagePointAggregateSeed>,
  entry: {
    rider_id: string | null
    team_id: string | null
    rider_name_snapshot: string | null
    team_name_snapshot: string | null
    points_awarded: number
    bonus_seconds_awarded: number
    source_rank: number | null
  }
) {
  if (entry.points_awarded <= 0 && entry.bonus_seconds_awarded <= 0) return

  const key = getStagePointAggregateKey(
    entry.rider_id,
    entry.team_id,
    entry.rider_name_snapshot,
    entry.team_name_snapshot
  )
  const existing = map.get(key)
  const sourceRank = entry.source_rank ?? Number.MAX_SAFE_INTEGER

  if (!existing) {
    map.set(key, {
      rider_id: entry.rider_id,
      team_id: entry.team_id,
      rider_name_snapshot: entry.rider_name_snapshot,
      team_name_snapshot: entry.team_name_snapshot,
      points_awarded: entry.points_awarded,
      bonus_seconds_awarded: entry.bonus_seconds_awarded,
      bestSourceRank: sourceRank,
    })
    return
  }

  existing.points_awarded += entry.points_awarded
  existing.bonus_seconds_awarded += entry.bonus_seconds_awarded
  existing.bestSourceRank = Math.min(existing.bestSourceRank, sourceRank)
}

function rankStagePointAggregates(
  rows: StagePointAggregateSeed[]
): AggregatedStagePointResultRow[] {
  const sortedRows = [...rows].sort((a, b) => {
    if (b.points_awarded !== a.points_awarded) {
      return b.points_awarded - a.points_awarded
    }

    if (b.bonus_seconds_awarded !== a.bonus_seconds_awarded) {
      return b.bonus_seconds_awarded - a.bonus_seconds_awarded
    }

    if (a.bestSourceRank !== b.bestSourceRank) {
      return a.bestSourceRank - b.bestSourceRank
    }

    return String(a.rider_name_snapshot ?? '').localeCompare(
      String(b.rider_name_snapshot ?? '')
    )
  })

  let previousScore: string | null = null
  let previousRank = 0

  return sortedRows.map((row, index) => {
    const score = `${row.points_awarded}|${row.bonus_seconds_awarded}`
    const rank = score === previousScore ? previousRank : index + 1

    previousScore = score
    previousRank = rank

    return {
      rank,
      rider_id: row.rider_id,
      team_id: row.team_id,
      rider_name_snapshot: row.rider_name_snapshot,
      team_name_snapshot: row.team_name_snapshot,
      points_awarded: row.points_awarded,
      bonus_seconds_awarded: row.bonus_seconds_awarded,
    }
  })
}

function aggregateStagePointRowsFromStageResults(
  rows: RaceStageResultRow[],
  view: StagePointAggregateView
): AggregatedStagePointResultRow[] {
  const map = new Map<string, StagePointAggregateSeed>()

  sortRankedRows(rows).forEach((row) => {
    const totals = getStageResultPointTotals(row, view)

    addStagePointAggregateSeed(map, {
      rider_id: row.rider_id,
      team_id: row.team_id,
      rider_name_snapshot: row.rider_name_snapshot,
      team_name_snapshot: row.team_name_snapshot,
      points_awarded: totals.points,
      bonus_seconds_awarded: totals.bonusSeconds,
      source_rank: row.rank,
    })
  })

  return rankStagePointAggregates(Array.from(map.values()))
}

function aggregateStagePointRowsFromPointGates(
  rows: RacePointResultRow[],
  view: StagePointAggregateView
): AggregatedStagePointResultRow[] {
  const map = new Map<string, StagePointAggregateSeed>()
  const pointTypes =
    view === 'mountain'
      ? ['KOM']
      : ['FINISH', 'INTERMEDIATE_SPRINT', 'BONUS_SPRINT']

  rows
    .filter((row) => pointTypes.includes(row.point_type ?? ''))
    .forEach((row) => {
      addStagePointAggregateSeed(map, {
        rider_id: row.rider_id,
        team_id: row.team_id,
        rider_name_snapshot: row.rider_name_snapshot,
        team_name_snapshot: row.team_name_snapshot,
        points_awarded: getPositiveNumber(row.points_awarded),
        bonus_seconds_awarded:
          view === 'sprint' ? getPositiveNumber(row.bonus_seconds_awarded) : 0,
        source_rank: row.rank,
      })
    })

  return rankStagePointAggregates(Array.from(map.values()))
}

function buildAggregatedStagePointRows(
  stageRows: RaceStageResultRow[],
  pointGateRows: RacePointResultRow[],
  view: StagePointAggregateView
): AggregatedStagePointResultRow[] {
  const fromPointGates =
    aggregateStagePointRowsFromPointGates(
      pointGateRows,
      view
    )

  if (fromPointGates.length > 0) {
    return fromPointGates
  }

  return aggregateStagePointRowsFromStageResults(
    stageRows,
    view
  )
}

function getStageResultGapSeconds(
  row: RaceStageResultRow,
  winnerElapsedSeconds: number | null
): number | null {
  if (row.gap_seconds !== null && row.gap_seconds !== undefined) {
    const parsedGap = Number(row.gap_seconds)
    return Number.isFinite(parsedGap) ? Math.max(0, parsedGap) : null
  }

  if (
    winnerElapsedSeconds !== null &&
    row.elapsed_seconds !== null &&
    row.elapsed_seconds !== undefined
  ) {
    const elapsed = Number(row.elapsed_seconds)

    if (Number.isFinite(elapsed)) {
      return Math.max(0, elapsed - winnerElapsedSeconds)
    }
  }

  return null
}

function formatStageResultTime(
  row: RaceStageResultRow,
  winnerElapsedSeconds: number | null
): string {
  if (row.rank === 1) return formatRaceClock(row.elapsed_seconds)

  const gapSeconds = getStageResultGapSeconds(row, winnerElapsedSeconds)

  if (gapSeconds === 0) return 's.t.'
  if (gapSeconds !== null) return `+${formatGapValue(gapSeconds)}`

  return formatRaceClock(row.elapsed_seconds)
}

function getUserParticipantTeams(
  participantTeams: RaceParticipantTeam[],
  viewerTeamIds?: ViewerTeamIdSource
): RaceParticipantTeam[] {
  const viewerIds = normalizeViewerTeamIds(viewerTeamIds)
  if (viewerIds.size === 0) return []

  return participantTeams.filter((team) => isViewerTeamRow(team, viewerIds))
}

function getUserParticipantTeam(
  participantTeams: RaceParticipantTeam[],
  viewerTeamIds?: ViewerTeamIdSource
): RaceParticipantTeam | null {
  return getUserParticipantTeams(participantTeams, viewerTeamIds)[0] ?? null
}

function getUserRiderIdSet(
  participantTeams: RaceParticipantTeam[],
  viewerTeamIds?: ViewerTeamIdSource
): Set<string> {
  const userTeams = getUserParticipantTeams(participantTeams, viewerTeamIds)

  return new Set(
    userTeams
      .flatMap((team) => team.riders)
      .map((rider) => rider.rider_id)
      .filter((value): value is string => Boolean(value))
  )
}

function buildTopRowsWithUserExtras<T extends { rank: number | null }>(
  rows: T[],
  isUserRow: (row: T) => boolean,
  limit = 15
): { topRows: T[]; extraUserRows: T[] } {
  const sortedRows = sortRankedRows(rows)
  const topRows = sortedRows.slice(0, limit)
  const extraUserRows = sortedRows.slice(limit).filter(isUserRow)

  return { topRows, extraUserRows }
}

function EllipsisTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td colSpan={colSpan} className="px-3 py-2 text-center text-slate-400">
        …
      </td>
    </tr>
  )
}

function getLeaderSnapshot(race: Race): Record<string, unknown> {
  const raceRecord = race as unknown as Record<string, unknown>
  const direct = getRecord(raceRecord.leaders_snapshot)
  const metadata = getRecord(raceRecord.metadata)
  const fromMetadata = getRecord(metadata.leaders_snapshot)

  return Object.keys(direct).length > 0 ? direct : fromMetadata
}

function getLeaderRow(
  snapshot: Record<string, unknown>,
  key: string
): { name: string; team?: string; value?: string } | null {
  const row = getRecord(snapshot[key])
  const name = typeof row.name === 'string' ? row.name : ''
  const team = typeof row.team === 'string' ? row.team : ''
  const value = typeof row.value === 'string' ? row.value : ''

  if (!name && !team && !value) return null

  return { name, team, value }
}

function RaceLeadersCard({
  race,
  classificationResultsStageId,
}: {
  race: Race
  classificationResultsStageId?: string | null
}) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>(() =>
    getLeaderSnapshot(race)
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadLeaderSnapshot() {
      if (!race.id || !classificationResultsStageId) {
        setSnapshot(getLeaderSnapshot(race))
        return
      }

      setLoading(true)

      const { data, error } = await raceDetailReadRpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: classificationResultsStageId,
      })

      if (!mounted) return

      if (error) {
        console.warn('Could not load current race leader snapshot:', error.message)
        setSnapshot(getLeaderSnapshot(race))
      } else {
        const payload = normalizeRaceResultsPayload(data)
        setSnapshot(payload.leader_snapshot)
      }

      setLoading(false)
    }

    loadLeaderSnapshot()

    return () => {
      mounted = false
    }
  }, [race, race.id, classificationResultsStageId])

  const rows = [
    { key: 'general', label: 'General leader' },
    { key: 'sprinter', label: 'Best sprinter' },
    { key: 'mountain', label: 'Best climber' },
    { key: 'young', label: 'Best young rider' },
    { key: 'team', label: 'Best team' },
  ]

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Leaders / Winners
        </div>

        {loading ? (
          <div className="text-xs text-slate-400">Updating…</div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const leader = getLeaderRow(snapshot, row.key)

          return (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{row.label}</div>

                <div className="truncate text-sm font-semibold text-slate-950">
                  {leader?.name || '—'}
                </div>

                {leader?.team ? (
                  <div className="truncate text-xs text-slate-500">
                    {leader.team}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">—</div>
                )}
              </div>

              <div className="shrink-0 whitespace-nowrap text-right text-xs font-semibold text-slate-700">
                {leader?.value || '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type RaceRewardsEntryOverview = {
  race_id?: string | null
  race_class_code?: string | null
  display_name?: string | null
  race_format?: string | null
  target_teams?: number | null
  min_teams?: number | null
  max_teams?: number | null
  min_riders_per_team?: number | null
  max_riders_per_team?: number | null
  applications_open_game_date?: string | null
  applications_close_game_date?: string | null
  applications_open_display?: string | null
  applications_close_display?: string | null
  applications_status?: string | null
  accepted_teams?: number | null
  participant_teams?: number | null
  accepted_application_teams?: number | null
  submitted_application_teams?: number | null
  available_target_slots?: number | null
  available_max_slots?: number | null
  prize_fund_cash?: number | null
  prize_fund_min_cash?: number | null
  prize_fund_max_cash?: number | null
  prize_fund_source?: string | null
  applications_open_season_number?: number | null
  applications_open_month_number?: number | null
  applications_open_day_number?: number | null
  applications_close_season_number?: number | null
  applications_close_month_number?: number | null
  applications_close_day_number?: number | null
  team_list_announcement_game_date?: string | null
  team_list_announcement_display?: string | null
  team_list_announcement_season_number?: number | null
  team_list_announcement_month_number?: number | null
  team_list_announcement_day_number?: number | null
  rider_submission_deadline_game_date?: string | null
  rider_submission_deadline_display?: string | null
  rider_submission_deadline_season_number?: number | null
  rider_submission_deadline_month_number?: number | null
  rider_submission_deadline_day_number?: number | null
  existing_application_status?: string | null
}


type RaceApplicationQuote = {
  success?: boolean
  error?: string | null
  message?: string | null
  race_id?: string | null
  club_id?: string | null
  race_name?: string | null
  race_status?: string | null
  applications_status?: string | null
  existing_application_status?: string | null
  race_class_code?: string | null
  race_format?: string | null
  commitment_score?: number | null
  acceptance_score_preview?: number | null
  estimated_acceptance_chance_pct?: number | null
  chance_label?: string | null
  chance_summary?: string | null
  competition_pressure_label?: string | null
  accepted_teams?: number | null
  submitted_application_teams?: number | null
  applied_teams?: number | null
  target_teams?: number | null
  min_teams?: number | null
  max_teams?: number | null
  available_target_slots?: number | null
  available_max_slots?: number | null
  min_riders_per_team?: number | null
  max_riders_per_team?: number | null
  applications_open_label?: string | null
  applications_close_label?: string | null
  team_list_announcement_label?: string | null
  rider_submission_deadline_label?: string | null
  can_apply?: boolean | null
}

type RacePrizeAwardRow = {
  id: string
  race_id: string
  stage_id: string | null
  bucket_key: string
  source_type: string
  classification_type: string | null
  rank: number
  recipient_type: 'team' | 'rider' | string
  rider_id: string | null
  team_id: string | null
  display_name_snapshot: string | null
  team_name_snapshot: string | null
  amount_cash: number
  status: string
}

type RaceRankingAwardRow = {
  id: string
  race_id: string
  stage_id: string | null
  source_type: string
  classification_type: string | null
  rank: number
  rider_id: string | null
  team_id: string | null
  display_name_snapshot: string | null
  team_name_snapshot: string | null
  rider_points: number
  team_points: number
}

type RacePrizeBucketSummaryRow = {
  bucket_key: string
  total_amount_cash: number
}

type RaceRewardsOverviewPayload = {
  race_id?: string | null
  stage_id?: string | null
  entry: RaceRewardsEntryOverview
  prize_awards: RacePrizeAwardRow[]
  ranking_awards: RaceRankingAwardRow[]
  prize_bucket_summary: RacePrizeBucketSummaryRow[]
}

function normalizeRaceRewardsOverview(value: unknown): RaceRewardsOverviewPayload {
  const record = getRecord(value)

  return {
    race_id: typeof record.race_id === 'string' ? record.race_id : null,
    stage_id: typeof record.stage_id === 'string' ? record.stage_id : null,
    entry: getRecord(record.entry) as RaceRewardsEntryOverview,
    prize_awards: arrayOrEmpty<RacePrizeAwardRow>(record.prize_awards),
    ranking_awards: arrayOrEmpty<RaceRankingAwardRow>(record.ranking_awards),
    prize_bucket_summary: arrayOrEmpty<RacePrizeBucketSummaryRow>(
      record.prize_bucket_summary
    ),
  }
}

function formatCash(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'

  return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value))}`
}

function formatGameDateFromParts(
  season?: number | null,
  month?: number | null,
  day?: number | null
): string {
  if (!season || !month || !day) return '—'

  const monthNames = [
    '',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  const monthLabel = monthNames[month] ?? `Month ${month}`

  return `Season ${season} · ${monthLabel} ${String(day).padStart(2, '0')}`
}

function formatSeasonChipDate(
  seasonNumber?: number | null,
  monthNumber?: number | null,
  dayNumber?: number | null,
  fallback?: string | null
): string {
  const formattedDate = formatGameDateFromParts(seasonNumber, monthNumber, dayNumber)

  if (formattedDate !== '—') return formattedDate

  if (fallback) {
    const match = fallback.match(/(?:S|Season\s*)(\d+)\D+(\d{2})\.(\d{2})/i)

    if (match) {
      const [, season, day, month] = match
      return formatGameDateFromParts(Number(season), Number(month), Number(day))
    }
  }

  return fallback || '—'
}

function formatSeasonChipLabel(value?: string | null): string {
  if (!value) return '—'

  const match = value.match(/^S(\d+)\s+(\d{2})\.(\d{2})$/)

  if (!match) return value

  return `Season ${match[1]} · ${match[2]}.${match[3]}`
}

function getRaceFormatChipLabel(race: Race | null, entry?: RaceRewardsEntryOverview | null): string {
  const category = String(entry?.race_class_code ?? race?.category ?? '')
  const stageCount = Number(race?.stage_count ?? 0)

  if (category.startsWith('2.') || stageCount > 1 || race?.is_stage_race) {
    return stageCount > 1 ? `${stageCount} stages` : 'Stage race'
  }

  return 'One-day race'
}

function formatBucketLabel(value?: string | null): string {
  switch (value) {
    case 'stage_finish':
      return 'Stage finish'
    case 'oneday_finish':
      return 'Race finish'
    case 'final_gc':
      return 'Final GC'
    case 'final_points':
      return 'Final points'
    case 'final_mountain':
      return 'Final mountain'
    case 'final_young':
      return 'Final young rider'
    case 'final_team':
      return 'Final team'
    case 'oneday_team':
      return 'Team result'
    default:
      return value || '—'
  }
}

function formatSourceLabel(value?: string | null): string {
  switch (value) {
    case 'stage_finish':
      return 'Stage finish'
    case 'oneday_finish':
      return 'Race result'
    case 'final_gc':
      return 'Final GC'
    case 'leader_day':
      return 'Leader jersey day'
    default:
      return value || '—'
  }
}

function RaceEntryHeaderSummary({
  race,
  entry,
  acceptedTeamsCount,
}: {
  race?: Race | null
  entry?: RaceRewardsEntryOverview | null
  acceptedTeamsCount?: number | null
}) {
  const acceptedTeams = acceptedTeamsCount ?? race?.accepted_teams ?? entry?.accepted_teams ?? 0
  const maxTeams = race?.max_teams ?? entry?.max_teams ?? '—'
  const minRidersPerTeam = race?.min_riders_per_team ?? entry?.min_riders_per_team ?? '—'
  const maxRidersPerTeam = race?.max_riders_per_team ?? entry?.max_riders_per_team ?? '—'
  const prizeFundCash = race?.prize_fund_cash ?? entry?.prize_fund_cash ?? null

  const topRowItems = [
    {
      label: 'Teams',
      value: `${acceptedTeams} accepted · max ${maxTeams}`,
    },
    {
      label: 'Riders min/max',
      value: `${minRidersPerTeam}–${maxRidersPerTeam}`,
    },
    {
      label: 'Prize fund',
      value: formatCash(prizeFundCash),
    },
  ]

  const bottomRowItems = [
    {
      label: 'Applications open',
      value: formatSeasonChipDate(
        race?.applications_open_season_number ?? entry?.applications_open_season_number,
        race?.applications_open_month_number ?? entry?.applications_open_month_number,
        race?.applications_open_day_number ?? entry?.applications_open_day_number,
        race?.applications_open_display ??
          race?.applications_open_game_date ??
          entry?.applications_open_display ??
          entry?.applications_open_game_date
      ),
    },
    {
      label: 'Applications close',
      value: formatSeasonChipDate(
        race?.applications_close_season_number ?? entry?.applications_close_season_number,
        race?.applications_close_month_number ?? entry?.applications_close_month_number,
        race?.applications_close_day_number ?? entry?.applications_close_day_number,
        race?.applications_close_display ??
          race?.applications_close_game_date ??
          entry?.applications_close_display ??
          entry?.applications_close_game_date
      ),
    },
    {
      label: 'Team list announcement',
      value: formatGameDateFromParts(
        race?.team_list_announcement_season_number ??
          entry?.team_list_announcement_season_number,
        race?.team_list_announcement_month_number ??
          entry?.team_list_announcement_month_number,
        race?.team_list_announcement_day_number ?? entry?.team_list_announcement_day_number
      ),
    },
    {
      label: 'Rider submission deadline',
      value: formatGameDateFromParts(
        race?.rider_submission_deadline_season_number ??
          entry?.rider_submission_deadline_season_number,
        race?.rider_submission_deadline_month_number ??
          entry?.rider_submission_deadline_month_number,
        race?.rider_submission_deadline_day_number ??
          entry?.rider_submission_deadline_day_number
      ),
    },
  ]

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {topRowItems.map((item) => (
          <div
            key={item.label}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
          >
            <span className="font-medium text-slate-500">{item.label}: </span>
            <span className="font-semibold text-slate-950">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {bottomRowItems.map((item) => (
          <div
            key={item.label}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
          >
            <span className="font-medium text-slate-500">{item.label}: </span>
            <span className="font-semibold text-slate-950">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function useRaceRewardsOverview(
  raceId?: string | null,
  selectedStageId?: string | null
) {
  const [payload, setPayload] = useState<RaceRewardsOverviewPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!raceId) {
        setPayload(null)
        return
      }

      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await raceDetailReadRpc('get_race_rewards_overview_v1', {
        p_race_id: raceId,
        p_stage_id: selectedStageId ?? null,
      })

      if (!mounted) return

      if (error) {
        setPayload(null)
        setErrorMessage(error.message)
      } else {
        setPayload(normalizeRaceRewardsOverview(data))
      }

      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [raceId, selectedStageId])

  return { payload, loading, errorMessage }
}

type RaceRewardsTotalsPayload = {
  race_id: string
  prize_team_totals: Array<{
    rank: number
    team_id: string
    team_name: string
    total_prize_cash: number
    award_rows: number
    is_viewer_team: boolean
  }>
  ranking_team_totals: Array<{
    rank: number
    team_id: string
    team_name: string
    total_team_points: number
    award_rows: number
    is_viewer_team: boolean
  }>
  ranking_rider_totals: Array<{
    rank: number
    rider_id: string
    team_id: string
    rider_name: string
    team_name: string
    total_rider_points: number
    award_rows: number
    is_viewer_team: boolean
  }>
}

function normalizeRaceRewardsTotalsPayload(
  value: unknown
): RaceRewardsTotalsPayload | null {
  const record = getRecord(value)
  const raceId = typeof record.race_id === 'string' ? record.race_id : ''

  if (!raceId) return null

  return {
    race_id: raceId,
    prize_team_totals: arrayOrEmpty<
      RaceRewardsTotalsPayload['prize_team_totals'][number]
    >(record.prize_team_totals),
    ranking_team_totals: arrayOrEmpty<
      RaceRewardsTotalsPayload['ranking_team_totals'][number]
    >(record.ranking_team_totals),
    ranking_rider_totals: arrayOrEmpty<
      RaceRewardsTotalsPayload['ranking_rider_totals'][number]
    >(record.ranking_rider_totals),
  }
}

type RaceRewardTotalsView =
  | 'prize_team'
  | 'ranking_team'
  | 'ranking_rider'

function RaceRewardsTotalsPanel({
  raceId,
  viewerTeamId,
}: {
  raceId: string
  viewerTeamId?: string | null
}) {
  const [payload, setPayload] = useState<RaceRewardsTotalsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [view, setView] = useState<RaceRewardTotalsView>('prize_team')

  useEffect(() => {
    let cancelled = false

    async function loadRewards() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await raceDetailReadRpc('get_race_rewards_totals_v1', {
        p_race_id: raceId,
        p_viewer_team_id: viewerTeamId ?? null,
      })

      if (cancelled) return

      if (error) {
        setPayload(null)
        setErrorMessage(error.message)
      } else {
        setPayload(normalizeRaceRewardsTotalsPayload(data))
      }

      setLoading(false)
    }

    loadRewards()

    return () => {
      cancelled = true
    }
  }, [raceId, viewerTeamId])

  if (loading) {
    return <div className="text-sm text-slate-500">Loading rewards…</div>
  }

  if (errorMessage) {
    return <div className="text-sm text-rose-700">{errorMessage}</div>
  }

  if (!payload) {
    return <div className="text-sm text-slate-500">No reward data available.</div>
  }

  const rowClass = (row: ViewerTeamComparableRow) =>
    viewerTeamRowClass(row, viewerTeamId)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Select which race reward table to view.
        </div>

        <select
          value={view}
          onChange={(event) => setView(event.target.value as RaceRewardTotalsView)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="prize_team">Prize money by team</option>
          <option value="ranking_team">International points by team</option>
          <option value="ranking_rider">International points by rider</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        {view === 'prize_team' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Prize</th>
              </tr>
            </thead>
            <tbody>
              {payload.prize_team_totals.map((row) => (
                <tr key={row.team_id} className={`border-t border-slate-100 ${rowClass(row)}`}>
                  <td className="px-4 py-3 font-semibold">{row.rank}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.team_name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCash(row.total_prize_cash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : view === 'ranking_team' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {payload.ranking_team_totals.map((row) => (
                <tr key={row.team_id} className={`border-t border-slate-100 ${rowClass(row)}`}>
                  <td className="px-4 py-3 font-semibold">{row.rank}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.team_name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.total_team_points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Rider</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {payload.ranking_rider_totals.map((row) => (
                <tr key={row.rider_id} className={`border-t border-slate-100 ${rowClass(row)}`}>
                  <td className="px-4 py-3 font-semibold">{row.rank}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.rider_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.team_name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.total_rider_points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


function getRaceReportEventMetadataText(
  event: RaceStageReportEvent,
  key: string
): string | null {
  const value = event.metadata?.[key]

  return typeof value === 'string' && value.trim() !== ''
    ? value
    : null
}

function isRaceReportTacticalEvent(event: RaceStageReportEvent): boolean {
  return (
    getRaceReportEventMetadataText(event, 'display_event_type') === 'tactical' ||
    getRaceReportEventMetadataText(event, 'source') ===
      'race_engine_tactical_report_events_v1'
  )
}

function getReportBadgeLabel(eventType: string, event?: RaceStageReportEvent) {
  if (event && isRaceReportTacticalEvent(event)) {
    return 'Tactical'
  }

  switch (eventType) {
    case 'start':
      return 'Start'
    case 'neutral_start':
      return 'Neutral'
    case 'attack':
      return 'Attack'
    case 'breakaway':
      return 'Break'
    case 'sprint':
      return 'Sprint'
    case 'kom':
      return 'KOM'
    case 'catch':
      return 'Catch'
    case 'crash':
      return 'Crash'
    case 'mechanical':
      return 'Mechanical'
    case 'weather':
      return 'Weather'
    case 'split':
      return 'Split'
    case 'finish':
      return 'Finish'
    case 'summary':
      return 'Summary'
    default:
      return 'Event'
  }
}

function getRaceReportTacticalMetaLine(event: RaceStageReportEvent): string | null {
  if (!isRaceReportTacticalEvent(event)) return null

  const phaseNumber = getRaceReportEventMetadataText(event, 'phase_number')
  const commandCode = getRaceReportEventMetadataText(event, 'command_code')
  const stageRole = getRaceReportEventMetadataText(event, 'stage_role')
  const stageTactic = getRaceReportEventMetadataText(event, 'stage_tactic')

  const parts = [
    phaseNumber ? `Phase ${phaseNumber}` : null,
    commandCode ? humanizeCode(commandCode) : null,
    stageRole ? formatRiderRole(stageRole) : null,
    stageTactic ? `Team plan: ${humanizeCode(stageTactic)}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}

type RaceReportGroupSummary = {
  code: string
  label: string
  size: number | null
  gapSeconds: number | null
}

function getReportEventDotClass(
  eventType: string,
  event?: RaceStageReportEvent
): string {
  if (event && isRaceReportTacticalEvent(event)) {
    return 'bg-violet-500'
  }

  switch (eventType) {
    case 'start':
    case 'neutral_start':
      return 'bg-sky-500'
    case 'attack':
    case 'breakaway':
      return 'bg-orange-500'
    case 'sprint':
      return 'bg-emerald-500'
    case 'kom':
      return 'bg-rose-500'
    case 'crash':
    case 'mechanical':
      return 'bg-amber-500'
    case 'finish':
      return 'bg-indigo-500'
    case 'split':
      return 'bg-yellow-500'
    case 'summary':
      return 'bg-slate-400'
    default:
      return 'bg-slate-400'
  }
}

function getRaceReportEventRowClass(event: RaceStageReportEvent): string {
  return isRaceReportTacticalEvent(event)
    ? 'bg-violet-50/70 hover:bg-violet-50'
    : 'hover:bg-slate-50'
}

function getRaceReportEventTitleClass(event: RaceStageReportEvent): string {
  return isRaceReportTacticalEvent(event)
    ? 'text-violet-950'
    : 'text-slate-950'
}

function getRaceReportEventBadgeClass(event: RaceStageReportEvent): string {
  return isRaceReportTacticalEvent(event)
    ? 'rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700'
    : 'text-xs font-medium text-slate-400'
}

function getRaceReportKmLabel(event: RaceStageReportEvent): string {
  if (event.km_marker === null || event.km_marker === undefined) return '—'
  return `${Number(event.km_marker).toFixed(Number(event.km_marker) % 1 === 0 ? 0 : 1)} km`
}

function getRaceReportParticipantLine(event: RaceStageReportEvent): string | null {
  if (event.rider_name_snapshot && event.team_name_snapshot) {
    return `${event.rider_name_snapshot} · ${event.team_name_snapshot}`
  }

  if (event.rider_name_snapshot) return event.rider_name_snapshot
  if (event.team_name_snapshot) return event.team_name_snapshot

  return null
}

function getRaceReportGroupColor(code: string): string {
  switch (code) {
    case 'front_group':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'chase_group':
      return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'main_peloton':
      return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'dropped_group':
      return 'border-orange-200 bg-orange-50 text-orange-800'
    case 'outside_group':
      return 'border-slate-200 bg-slate-50 text-slate-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

function extractRaceReportGroups(events: RaceStageReportEvent[]): RaceReportGroupSummary[] {
  return events
    .map((event) => {
      const metadata = event.metadata ?? {}
      const code = typeof metadata.group_code === 'string' ? metadata.group_code : null

      if (!code) return null

      return {
        code,
        label: event.title,
        size:
          typeof metadata.group_size === 'number'
            ? metadata.group_size
            : Number.isFinite(Number(metadata.group_size))
              ? Number(metadata.group_size)
              : null,
        gapSeconds:
          typeof metadata.gap_seconds === 'number'
            ? metadata.gap_seconds
            : Number.isFinite(Number(metadata.gap_seconds))
              ? Number(metadata.gap_seconds)
              : null,
      }
    })
    .filter((group): group is RaceReportGroupSummary => group !== null)
    .sort((a, b) => {
      const order = ['front_group', 'chase_group', 'main_peloton', 'dropped_group', 'outside_group']
      return order.indexOf(a.code) - order.indexOf(b.code)
    })
}

function RaceStageReportCard({
  selectedStageId,
  selectedStageName,
}: {
  selectedStageId: string | null
  selectedStageName: string | null
}) {
  const [events, setEvents] = useState<RaceStageReportEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedStageId) {
      setEvents([])
      setLoading(false)
      setErrorMessage(null)
      return
    }

    let cancelled = false

    async function loadReport() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await raceDetailReadRpc('get_race_stage_report_v1', {
        p_stage_id: selectedStageId,
      })

      if (cancelled) return

      if (error) {
        setEvents([])
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      setEvents(Array.isArray(data) ? (data as RaceStageReportEvent[]) : [])
      setLoading(false)
    }

    loadReport()

    return () => {
      cancelled = true
    }
  }, [selectedStageId])

  const groups = extractRaceReportGroups(events)

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Race report
          </div>

          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            {selectedStageName ?? 'Stage report'}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Compact race commentary and final road groups.
          </p>
        </div>

        <button
          type="button"
          className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Watch replay
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading race report…
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-6 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No race report available for this stage yet.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[72px_28px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div>Km</div>
              <div />
              <div>Commentary</div>
            </div>

            <div className="divide-y divide-slate-100">
              {events.map((event) => {
                const participantLine = getRaceReportParticipantLine(event)
                const tacticalMetaLine = getRaceReportTacticalMetaLine(event)

                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[72px_28px_minmax(0,1fr)] items-start gap-0 px-3 py-2.5 text-sm ${getRaceReportEventRowClass(
                      event
                    )}`}
                  >
                    <div className="pt-0.5 text-xs font-semibold text-slate-500">
                      {getRaceReportKmLabel(event)}
                    </div>

                    <div className="pt-1">
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${getReportEventDotClass(
                          event.event_type,
                          event
                        )}`}
                        title={getReportBadgeLabel(event.event_type, event)}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          className={`text-sm font-semibold ${getRaceReportEventTitleClass(
                            event
                          )}`}
                        >
                          {event.title}
                        </span>

                        <span className={getRaceReportEventBadgeClass(event)}>
                          {getReportBadgeLabel(event.event_type, event)}
                        </span>
                      </div>

                      <div className="mt-0.5 text-sm leading-5 text-slate-700">
                        {event.description}
                      </div>

                      {tacticalMetaLine ? (
                        <div className="mt-1 text-xs font-medium text-violet-700">
                          {tacticalMetaLine}
                        </div>
                      ) : null}

                      {participantLine ? (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {participantLine}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Road groups
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Final race situation from the replay engine.
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                No road group data available yet.
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div
                    key={group.code}
                    className={`rounded-2xl border px-3 py-3 ${getRaceReportGroupColor(
                      group.code
                    )}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold">
                        {group.label}
                      </div>

                      <div className="text-xs font-semibold">
                        {group.gapSeconds === 0
                          ? 'Leader'
                          : group.gapSeconds !== null
                            ? `+${formatGapValue(group.gapSeconds)}`
                            : '—'}
                      </div>
                    </div>

                    <div className="mt-1 text-xs opacity-80">
                      {group.size !== null ? `${group.size} riders` : 'Riders —'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}


type RaceParticipantTeamViewRow = {
  id?: string | null
  race_id?: string | null
  club_id?: string | null
  owner_club_id?: string | null
  participating_club_id?: string | null
  team_id?: string | null
  parent_club_id?: string | null
  club_type?: string | null
  race_team_entry_id?: string | null
  status?: string | null
  club_name?: string | null
  country_code?: string | null
  club_tier?: string | null
  world_tier?: string | number | null
  assigned_riders_count?: number | string | null
  team_name_snapshot?: string | null
  logo_url_snapshot?: string | null
  jersey_url_snapshot?: string | null
  jersey_url?: string | null
  kit_preview_url?: string | null
  kit_image_url?: string | null
  team_jersey_url?: string | null
  ai_kit_preview_url?: string | null
  logo_url?: string | null
  club_logo_url?: string | null
  custom_logo_url?: string | null
  image_logo_url?: string | null
  logo_image_url?: string | null
  team_logo_url?: string | null
  avatar_url?: string | null
  image_url?: string | null
  crest_url?: string | null
  country_code_snapshot?: string | null
  ranking_snapshot?: number | string | null
  competition_display?: string | null
  competition_rank?: number | string | null
  competition_points?: number | string | null
  division_key?: string | null
  riders?: unknown[] | null
  participant_riders?: unknown[] | null
  assigned_riders?: unknown[] | null
  riders_json?: unknown[] | null
  clubs?: Record<string, unknown> | Record<string, unknown>[] | null
}

type RaceParticipantRiderViewRow = {
  id?: string | null
  race_id?: string | null
  team_id?: string | null
  club_id?: string | null
  race_team_entry_id?: string | null
  rider_id?: string | null
  rider_name_snapshot?: string | null
  rider_name?: string | null
  full_name?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
  team_name_snapshot?: string | null
  country_code_snapshot?: string | null
  country_code?: string | null
  age_snapshot?: number | string | null
  age?: number | string | null
  is_young_rider?: boolean | null
  start_number?: number | string | null
  race_number?: number | string | null
  bib_number?: number | string | null
  role_snapshot?: string | null
  rider_type?: string | null
  rider_role?: string | null
  role?: string | null
  overall_snapshot?: number | string | null
  overall?: number | string | null
  overall_rating?: number | string | null
  can_view_exact_overall?: boolean | string | null
  overall_range_label?: string | null
  overall_label?: string | null
}

function getJoinedClubRecord(row: RaceParticipantTeamViewRow): Record<string, unknown> {
  if (Array.isArray(row.clubs)) {
    return getRecord(row.clubs[0])
  }

  return getRecord(row.clubs)
}

function getStringField(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

const TEAM_LOGO_FIELD_KEYS = [
  'custom_logo_url',
  'customLogoUrl',
  'image_logo_url',
  'imageLogoUrl',
  'logo_image_url',
  'logoImageUrl',
  'club_logo_url',
  'clubLogoUrl',
  'team_logo_url',
  'teamLogoUrl',
  'logo_url',
  'logoUrl',
  'logo_url_snapshot',
  'avatar_url',
  'avatarUrl',
  'image_url',
  'imageUrl',
  'crest_url',
  'crestUrl',
  'badge_url',
  'badgeUrl',
  'profile_image_url',
  'profileImageUrl',
  'photo_url',
  'photoUrl',
  'logo_path',
  'logoPath',
  'logo_storage_path',
  'logoStoragePath',
  'custom_logo_path',
  'customLogoPath',
  'image_logo_path',
  'imageLogoPath',
  'logo',
  'avatar',
  'image',
  'crest',
]

const TEAM_LOGO_NESTED_FIELD_KEYS = [
  'url',
  'publicUrl',
  'public_url',
  'signedUrl',
  'signed_url',
  'src',
  'path',
  'fullPath',
  'full_path',
]

const TEAM_JERSEY_FIELD_KEYS = [
  'custom_jersey_url',
  'customJerseyUrl',
  'custom_jersey_image_url',
  'customJerseyImageUrl',
  'jersey_image_url',
  'jerseyImageUrl',
  'jersey_url',
  'jerseyUrl',
  'jersey_url_snapshot',
  'kit_preview_url',
  'kitPreviewUrl',
  'kit_image_url',
  'kitImageUrl',
  'team_jersey_url',
  'teamJerseyUrl',
  'ai_kit_preview_url',
  'aiKitPreviewUrl',
  'image_src',
  'imageSrc',
  'image_data_url',
  'imageDataUrl',
  'generated_image_url',
  'generatedImageUrl',
  'render_url',
  'renderUrl',
  'file_url',
  'fileUrl',
  'preview_url',
  'previewUrl',
  'image_url',
  'imageUrl',
  'url',
  'public_url',
  'publicUrl',
  'path',
]

const TEAM_JERSEY_NESTED_RECORD_KEYS = [
  'config',
  'kit_config',
  'kitConfig',
  'jersey_config',
  'jerseyConfig',
  'kit',
  'jersey',
  'metadata',
]

const TEAM_LOGO_STORAGE_BUCKETS = [
  'team-logos',
  'team_logos',
  'club-logos',
  'club_logos',
  'team-kits',
  'team_kits',
  'club-kits',
  'club_kits',
  'team-jerseys',
  'team_jerseys',
  'jerseys',
  'kits',
  'logos',
  'images',
  'public',
]

function getLogoStringFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>

    for (const key of TEAM_LOGO_NESTED_FIELD_KEYS) {
      const nestedValue = record[key]
      if (typeof nestedValue === 'string' && nestedValue.trim()) {
        return nestedValue.trim()
      }
    }
  }

  return null
}

function getPublicStorageLogoUrl(bucket: string, path: string): string | null {
  const cleanBucket = bucket.trim().replace(/^\/+|\/+$/g, '')
  const cleanPath = path.trim().replace(/^\/+/, '')

  if (!cleanBucket || !cleanPath) return null

  const { data } = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath)

  return data.publicUrl || null
}

function normalizeTeamLogoUrl(value?: string | null): string | null {
  const rawValue = value?.trim()
  if (!rawValue) return null

  if (/^(https?:\/\/|data:image\/|blob:)/i.test(rawValue)) return rawValue
  if (rawValue.startsWith('//')) return `https:${rawValue}`

  const storageMatch = rawValue.match(
    /\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)/i
  )

  if (storageMatch) {
    return getPublicStorageLogoUrl(
      decodeURIComponent(storageMatch[1]),
      decodeURIComponent(storageMatch[2])
    )
  }

  const cleanValue = rawValue
    .replace(/^public\//i, '')
    .replace(/^\/+/, '')

  const [possibleBucket, ...pathParts] = cleanValue.split('/')

  if (possibleBucket && pathParts.length > 0 && TEAM_LOGO_STORAGE_BUCKETS.includes(possibleBucket)) {
    return getPublicStorageLogoUrl(possibleBucket, pathParts.join('/'))
  }

  return rawValue
}

function getTeamLogoUrlFromRecord(record: Record<string, unknown>): string | null {
  for (const key of TEAM_LOGO_FIELD_KEYS) {
    const rawLogoValue = getLogoStringFromUnknown(record[key])
    const logoUrl = normalizeTeamLogoUrl(rawLogoValue)

    if (logoUrl) return logoUrl
  }

  return null
}

function normalizeTeamJerseyColor(
  value: unknown,
  fallback: string
): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback
}

function getGenericTeamJerseyDataUrl(
  record: Record<string, unknown>,
  nestedRecords: Record<string, unknown>[]
): string | null {
  const configRecord = nestedRecords.find((nestedRecord) => {
    const mode = getStringField(nestedRecord, ['mode', 'type', 'kind'])
    return mode?.trim().toLowerCase() === 'generic'
  })

  if (!configRecord) return null

  const primaryColor = normalizeTeamJerseyColor(
    configRecord.primary_color ??
      configRecord.primaryColor ??
      record.primary_color ??
      record.primaryColor,
    '#2563eb'
  )
  const secondaryColor = normalizeTeamJerseyColor(
    configRecord.secondary_color ??
      configRecord.secondaryColor ??
      record.secondary_color ??
      record.secondaryColor,
    '#f8fafc'
  )
  const accentColor = normalizeTeamJerseyColor(
    configRecord.accent_color ??
      configRecord.accentColor ??
      record.accent_color ??
      record.accentColor,
    secondaryColor
  )

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${primaryColor}"/>
          <stop offset="1" stop-color="${accentColor}"/>
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/>
          <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.32"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
      <path d="M176 72 224 44h64l48 28 102 53-46 106-58-27v258H178V204l-58 27-46-106 102-53Z" fill="url(#body)"/>
      <path d="M224 44c6 37 58 37 64 0l48 28c-23 52-137 52-160 0l48-28Z" fill="${secondaryColor}"/>
      <path d="M178 228h156v54H178z" fill="${secondaryColor}" opacity="0.94"/>
      <path d="M178 282h156v18H178z" fill="${accentColor}" opacity="0.95"/>
      <path d="M120 125 74 125l46 106 58-27v-76Z" fill="${secondaryColor}" opacity="0.92"/>
      <path d="M392 125h46l-46 106-58-27v-76Z" fill="${secondaryColor}" opacity="0.92"/>
      <path d="M207 78h98v384h-98z" fill="url(#shine)" opacity="0.55"/>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function getTeamJerseyUrlFromRecord(record: Record<string, unknown>): string | null {
  const nestedRecords = TEAM_JERSEY_NESTED_RECORD_KEYS
    .map((key) => getRecord(record[key]))
    .filter((nestedRecord) => Object.keys(nestedRecord).length > 0)

  for (const candidateRecord of [record, ...nestedRecords]) {
    for (const key of TEAM_JERSEY_FIELD_KEYS) {
      const rawJerseyValue = getLogoStringFromUnknown(candidateRecord[key])
      const jerseyUrl = normalizeTeamLogoUrl(rawJerseyValue)

      if (jerseyUrl) return jerseyUrl
    }
  }

  /*
   * The customization page can save a generated kit as
   * team_kits.config = { mode: 'generic', imageSrc: null }.
   * In that case there is no stored bitmap URL, so create a lightweight
   * deterministic SVG from the saved club/kit colors.
   */
  return getGenericTeamJerseyDataUrl(record, nestedRecords)
}

function getRaceParticipantTeamLogoUrl(
  row: RaceParticipantTeamViewRow,
  club: Record<string, unknown>
): string | null {
  return (
    getTeamLogoUrlFromRecord(row as unknown as Record<string, unknown>) ??
    getTeamLogoUrlFromRecord(club)
  )
}

function normalizeBoolean(value: boolean | string | null | undefined): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()

  if (['true', 't', 'yes', 'y', '1'].includes(normalized)) return true
  if (['false', 'f', 'no', 'n', '0'].includes(normalized)) return false

  return null
}

function normalizeRaceParticipantRiderRow(
  row: RaceParticipantRiderViewRow,
  fallbackTeamId?: string | null,
  fallbackRaceId?: string | null,
  fallbackTeamName?: string | null,
  fallbackCountryCode?: string | null
): RaceParticipantRider | null {
  const riderId = row.rider_id ?? row.id

  if (!riderId) return null

  const startNumber =
    asNumber(row.start_number) ?? asNumber(row.race_number) ?? asNumber(row.bib_number)
  const overall =
    asNumber(row.overall_snapshot) ?? asNumber(row.overall) ?? asNumber(row.overall_rating)

  return {
    id: row.id ?? riderId,
    race_id: row.race_id ?? fallbackRaceId ?? '',
    team_id: row.team_id ?? row.club_id ?? fallbackTeamId ?? '',
    rider_id: riderId,
    rider_name_snapshot:
      row.rider_name_snapshot ?? row.rider_name ?? row.full_name ?? row.name ?? null,
    rider_full_name: row.full_name ?? row.name ?? row.rider_name ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    display_name: row.display_name ?? row.rider_name ?? row.full_name ?? row.name ?? null,
    team_name_snapshot: row.team_name_snapshot ?? fallbackTeamName ?? null,
    country_code_snapshot:
      row.country_code_snapshot ?? row.country_code ?? fallbackCountryCode ?? null,
    age_snapshot: asNumber(row.age_snapshot) ?? asNumber(row.age),
    is_young_rider: row.is_young_rider ?? null,
    start_number: startNumber === null ? null : Math.round(startNumber),
    role_snapshot: row.role_snapshot ?? row.rider_type ?? row.rider_role ?? row.role ?? null,
    overall_snapshot: overall,
    can_view_exact_overall: normalizeBoolean(row.can_view_exact_overall),
    overall_range_label: row.overall_range_label ?? row.overall_label ?? null,
  }
}

function getEmbeddedRiderRows(row: RaceParticipantTeamViewRow): unknown[] {
  if (Array.isArray(row.riders)) return row.riders
  if (Array.isArray(row.participant_riders)) return row.participant_riders
  if (Array.isArray(row.assigned_riders)) return row.assigned_riders
  if (Array.isArray(row.riders_json)) return row.riders_json

  return []
}

function getParticipantRiderLeaderPriority(rider: RaceParticipantRider): number {
  const role = rider.role_snapshot?.toLowerCase().trim() ?? ''

  if (
    role === 'leader' ||
    role === 'team leader' ||
    role === 'team_leader' ||
    role === 'gc leader' ||
    role === 'gc_leader' ||
    role === 'captain' ||
    role === 'race captain' ||
    role.includes('leader') ||
    role.includes('captain')
  ) {
    return 0
  }

  return 1
}

function sortParticipantRiders(riders: RaceParticipantRider[]): RaceParticipantRider[] {
  return [...riders].sort((a, b) => {
    const leaderPriorityA = getParticipantRiderLeaderPriority(a)
    const leaderPriorityB = getParticipantRiderLeaderPriority(b)

    if (leaderPriorityA !== leaderPriorityB) {
      return leaderPriorityA - leaderPriorityB
    }

    const overallA = asNumber(a.overall_snapshot) ?? 0
    const overallB = asNumber(b.overall_snapshot) ?? 0

    if (overallA !== overallB) {
      return overallB - overallA
    }

    const numberA = a.start_number ?? Number.MAX_SAFE_INTEGER
    const numberB = b.start_number ?? Number.MAX_SAFE_INTEGER

    if (numberA !== numberB) return numberA - numberB

    return String(a.rider_name_snapshot ?? '').localeCompare(
      String(b.rider_name_snapshot ?? '')
    )
  })
}

function getParticipantTeamTierOrder(team: RaceParticipantTeam): number {
  const tier = team.club_tier?.toLowerCase().replace(/[\s_-]+/g, '') ?? ''

  if (tier.includes('world')) return 1
  if (tier.includes('pro')) return 2
  if (tier.includes('continental')) return 3
  if (tier.includes('amateur')) return 4

  return 99
}

function getParticipantTeamRankValue(team: RaceParticipantTeam): number {
  return (
    asNumber(team.competition_rank) ??
    asNumber(team.ranking_snapshot) ??
    Number.MAX_SAFE_INTEGER
  )
}

function getParticipantTeamPointsValue(team: RaceParticipantTeam): number {
  return asNumber(team.competition_points) ?? 0
}

function getParticipantTeamWorldTierValue(team: RaceParticipantTeam): number {
  const parsed = asNumber(team.world_tier)

  if (parsed !== null) return parsed

  const digits = team.world_tier?.match(/\d+/)?.[0]
  const parsedDigits = digits ? Number(digits) : null

  return Number.isFinite(parsedDigits) ? Number(parsedDigits) : Number.MAX_SAFE_INTEGER
}

function compareParticipantTeamsByRaceOrder(
  left: RaceParticipantTeam,
  right: RaceParticipantTeam
): number {
  const tierA = getParticipantTeamTierOrder(left)
  const tierB = getParticipantTeamTierOrder(right)

  if (tierA !== tierB) return tierA - tierB

  const rankA = getParticipantTeamRankValue(left)
  const rankB = getParticipantTeamRankValue(right)

  if (rankA !== rankB) return rankA - rankB

  const pointsA = getParticipantTeamPointsValue(left)
  const pointsB = getParticipantTeamPointsValue(right)

  if (pointsA !== pointsB) return pointsB - pointsA

  const worldTierA = getParticipantTeamWorldTierValue(left)
  const worldTierB = getParticipantTeamWorldTierValue(right)

  if (worldTierA !== worldTierB) return worldTierA - worldTierB

  return getParticipantTeamName(left).localeCompare(getParticipantTeamName(right))
}

function buildParticipantTeamsForRaceDisplay(
  teams: RaceParticipantTeam[]
): RaceParticipantTeam[] {
  return [...teams]
    .sort(compareParticipantTeamsByRaceOrder)
    .map((team, teamIndex) => {
      const baseStartNumber = teamIndex * 10 + 1
      const riders = sortParticipantRiders(team.riders).map((rider, riderIndex) => ({
        ...rider,
        display_start_number: baseStartNumber + riderIndex,
      }))

      return {
        ...team,
        riders,
        assigned_riders_count: riders.length,
      }
    })
}

function normalizeRaceParticipantTeamViewRow(
  row: RaceParticipantTeamViewRow
): RaceParticipantTeam | null {
  const club = getJoinedClubRecord(row)
  const joinedClubId = getStringField(club, ['id', 'club_id', 'team_id'])
  const raceTeamEntryId = row.race_team_entry_id ?? row.id ?? null
  const ownerClubId = row.owner_club_id ?? row.club_id ?? joinedClubId ?? null
  const participatingClubId = row.participating_club_id ?? row.team_id ?? ownerClubId ?? null
  const clubId = participatingClubId ?? ownerClubId ?? null
  const rawTeamId = participatingClubId ?? row.team_id ?? clubId ?? raceTeamEntryId

  if (!rawTeamId) return null

  const teamId = String(rawTeamId)
  const normalizedClubId = clubId ? String(clubId) : null
  const normalizedOwnerClubId = ownerClubId ? String(ownerClubId) : null
  const normalizedParticipatingClubId = participatingClubId ? String(participatingClubId) : null
  const normalizedRaceTeamEntryId = raceTeamEntryId ? String(raceTeamEntryId) : null
  const clubName =
    row.club_name ??
    row.team_name_snapshot ??
    getStringField(club, ['name', 'club_name', 'display_name', 'team_name']) ??
    null
  const countryCode =
    row.country_code ??
    row.country_code_snapshot ??
    getStringField(club, ['country_code', 'country']) ??
    null
  const clubTier = row.club_tier ?? getStringField(club, ['club_tier', 'tier']) ?? null
  const logoUrl = getRaceParticipantTeamLogoUrl(row, club)
  const raceId = row.race_id ?? ''
  const embeddedRiders = getEmbeddedRiderRows(row)
    .map((riderRow) =>
      normalizeRaceParticipantRiderRow(
        riderRow as RaceParticipantRiderViewRow,
        teamId,
        raceId,
        clubName,
        countryCode
      )
    )
    .filter((rider): rider is RaceParticipantRider => rider !== null)

  return {
    id: normalizedRaceTeamEntryId ?? teamId,
    race_id: raceId,
    team_id: teamId,
    club_id: normalizedClubId,
    owner_club_id: normalizedOwnerClubId,
    participating_club_id: normalizedParticipatingClubId,
    parent_club_id:
      row.parent_club_id ?? getStringField(club, ['parent_club_id']) ?? null,
    club_type:
      row.club_type ?? getStringField(club, ['club_type']) ?? null,
    race_team_entry_id: normalizedRaceTeamEntryId,
    status: row.status ?? 'accepted',
    club_name: clubName,
    country_code: countryCode,
    club_tier: clubTier,
    world_tier:
      row.world_tier === null || row.world_tier === undefined
        ? getStringField(club, ['world_tier'])
        : String(row.world_tier),
    assigned_riders_count: asNumber(row.assigned_riders_count),
    team_name_snapshot: clubName,
    logo_url_snapshot: logoUrl,
    jersey_url_snapshot:
      getTeamJerseyUrlFromRecord(row as unknown as Record<string, unknown>) ??
      getTeamJerseyUrlFromRecord(club),
    country_code_snapshot: countryCode,
    ranking_snapshot:
      asNumber(row.ranking_snapshot) ?? asNumber(club.ranking as number | string | null),
    competition_display:
      row.competition_display ??
      getStringField(club, ['competition_display', 'division_name', 'league_name']) ??
      undefined,
    competition_rank: asNumber(row.competition_rank) ?? null,
    competition_points: asNumber(row.competition_points) ?? null,
    division_key: row.division_key ?? getStringField(club, ['division_key']) ?? undefined,
    riders: sortParticipantRiders(embeddedRiders),
  }
}

function normalizeRaceParticipantTeamViewRows(rows: unknown): RaceParticipantTeam[] {
  if (!Array.isArray(rows)) return []

  return rows
    .map((row) => normalizeRaceParticipantTeamViewRow(row as RaceParticipantTeamViewRow))
    .filter((team): team is RaceParticipantTeam => team !== null)
    .sort((a, b) =>
      String(getParticipantTeamName(a)).localeCompare(String(getParticipantTeamName(b)))
    )
}

function getParticipantTeamLookupIds(team: RaceParticipantTeam): string[] {
  return Array.from(
    new Set(
      [
        team.participating_club_id,
        team.club_id,
        team.owner_club_id,
        team.parent_club_id,
        team.team_id,
        team.id,
        team.race_team_entry_id,
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function isDevelopingParticipantTeam(team: RaceParticipantTeam): boolean {
  const clubType = team.club_type?.trim().toLowerCase() ?? ''
  const participatingClubId = team.participating_club_id?.trim() ?? ''
  const ownerClubId = team.owner_club_id?.trim() ?? ''
  const parentClubId = team.parent_club_id?.trim() ?? ''

  return (
    clubType === 'developing' ||
    Boolean(
      participatingClubId &&
        ownerClubId &&
        participatingClubId !== ownerClubId &&
        (!parentClubId || parentClubId === ownerClubId)
    )
  )
}

/*
 * Developing/U23 squads are part of the parent organization and intentionally
 * use the First Team's visual identity. Keep the U23 club id for riders,
 * results, highlighting and profile navigation, but resolve logo/kit assets
 * from the parent/owner club first.
 */
function getParticipantTeamAssetLookupIds(
  team: RaceParticipantTeam
): string[] {
  const ownAssetIds = [
    team.participating_club_id,
    team.club_id,
    team.team_id,
    team.id,
    team.race_team_entry_id,
  ]

  const organizationAssetIds = [
    team.parent_club_id,
    team.owner_club_id,
  ]

  const orderedIds = isDevelopingParticipantTeam(team)
    ? [...organizationAssetIds, ...ownAssetIds]
    : [...ownAssetIds, ...organizationAssetIds]

  return Array.from(
    new Set(
      orderedIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function getUniqueParticipantTeamIds(teams: RaceParticipantTeam[]): string[] {
  return Array.from(
    new Set(
      teams.flatMap((team) => [
        ...getParticipantTeamLookupIds(team),
        ...getParticipantTeamAssetLookupIds(team),
      ])
    )
  )
}

function getLogoRecordLookupIds(record: Record<string, unknown>): string[] {
  return Array.from(
    new Set(
      ['id', 'club_id', 'team_id']
        .map((key) => getStringField(record, [key]))
        .filter((value): value is string => Boolean(value))
    )
  )
}

function getTeamAssetRowPriority(record: Record<string, unknown>): number {
  const activeValue = record.is_active ?? record.active
  const activeScore = activeValue === true ? 200 : activeValue === false ? 0 : 100
  const name = getStringField(record, ['name', 'kit_name', 'jersey_name'])
    ?.trim()
    .toLowerCase()
  const homeScore = name === 'home' || name === 'default' ? 20 : 0
  const updatedAtRaw = getStringField(record, [
    'updated_at',
    'generated_at',
    'created_at',
  ])
  const updatedAt = updatedAtRaw ? Date.parse(updatedAtRaw) : 0
  const recencyScore = Number.isFinite(updatedAt)
    ? Math.max(0, Math.min(19, Math.floor(updatedAt / 100000000000)))
    : 0

  return activeScore + homeScore + recencyScore
}

function mergeParticipantTeamLogoUrls(
  teams: RaceParticipantTeam[],
  logoRows: unknown
): RaceParticipantTeam[] {
  if (!Array.isArray(logoRows) || logoRows.length === 0) return teams

  const recordsById = new Map<string, Record<string, unknown>>()
  const sortedRows = [...logoRows].sort((left, right) => {
    const leftRecord = getRecord(left)
    const rightRecord = getRecord(right)
    const priorityDiff =
      getTeamAssetRowPriority(leftRecord) - getTeamAssetRowPriority(rightRecord)

    if (priorityDiff !== 0) return priorityDiff

    const leftUpdatedAt = Date.parse(
      getStringField(leftRecord, ['updated_at', 'generated_at', 'created_at']) ?? ''
    )
    const rightUpdatedAt = Date.parse(
      getStringField(rightRecord, ['updated_at', 'generated_at', 'created_at']) ?? ''
    )

    return (Number.isFinite(leftUpdatedAt) ? leftUpdatedAt : 0) -
      (Number.isFinite(rightUpdatedAt) ? rightUpdatedAt : 0)
  })

  sortedRows.forEach((logoRow) => {
    const record = getRecord(logoRow)

    getLogoRecordLookupIds(record).forEach((lookupId) => {
      recordsById.set(lookupId, record)
    })
  })

  return teams.map((team) => {
    const assetRecords = getParticipantTeamAssetLookupIds(team)
      .map((lookupId) => recordsById.get(lookupId))
      .filter(
        (record): record is Record<string, unknown> =>
          Boolean(record)
      )

    /*
     * Resolve logo and jersey independently. A clubs row can contain a logo
     * while the actual jersey lives in team_kits.config or an AI preview row.
     * Stopping at the first existing record caused U23 teams to miss the
     * parent jersey even though that jersey had been loaded.
     */
    const liveLogoUrl =
      assetRecords
        .map((record) => getTeamLogoUrlFromRecord(record))
        .find((value): value is string => Boolean(value)) ?? null

    const liveJerseyUrl =
      assetRecords
        .map((record) => getTeamJerseyUrlFromRecord(record))
        .find((value): value is string => Boolean(value)) ?? null

    if (
      (!liveLogoUrl || liveLogoUrl === team.logo_url_snapshot) &&
      (!liveJerseyUrl || liveJerseyUrl === team.jersey_url_snapshot)
    ) {
      return team
    }

    return {
      ...team,
      logo_url_snapshot: liveLogoUrl || team.logo_url_snapshot,
      jersey_url_snapshot: liveJerseyUrl || team.jersey_url_snapshot,
    }
  })
}

async function loadParticipantTeamLogos(
  teams: RaceParticipantTeam[],
  raceId?: string | null
): Promise<RaceParticipantTeam[]> {
  const teamIds = getUniqueParticipantTeamIds(teams)

  if (teamIds.length === 0) return teams

  let teamsWithLogos = teams
  let clubRows: Record<string, unknown>[] = []

  const { data: clubData, error: clubError } = await supabase
    .from('clubs')
    .select('*')
    .in('id', teamIds)

  if (clubError) {
    console.warn('Could not load participant club logos:', clubError.message)
  } else {
    clubRows = (clubData ?? []).map((row) => getRecord(row))
    teamsWithLogos = mergeParticipantTeamLogoUrls(teamsWithLogos, clubRows)
  }

  /*
   * Race-entry snapshots remain a useful historical fallback, but current
   * live kit sources below are allowed to override them.
   */
  if (raceId) {
    const { data: entryData, error: entryError } = await supabase
      .from('race_team_entries')
      .select('*')
      .eq('race_id', raceId)
      .in('club_id', teamIds)

    if (entryError) {
      console.warn('Could not load race entry team logos:', entryError.message)
    } else {
      teamsWithLogos = mergeParticipantTeamLogoUrls(teamsWithLogos, entryData)
    }
  }

  /*
   * Do not use maybeSingle/single here. Some AI clubs have several preview
   * generations. The merger deterministically prefers an active/latest row,
   * and still uses the newest available preview when no row is flagged active.
   */
  const { data: aiKitData, error: aiKitError } = await supabase
    .from('ai_team_kit_previews')
    .select('*')
    .in('club_id', teamIds)

  if (aiKitError) {
    console.warn('Could not load participant AI jersey previews:', aiKitError.message)
  } else {
    teamsWithLogos = mergeParticipantTeamLogoUrls(teamsWithLogos, aiKitData)
  }

  /*
   * User-created and later customized jerseys are stored in team_kits.config,
   * not necessarily as a direct clubs.jersey_url column. Load every matching
   * kit row and let the preferred home/active/latest row win.
   *
   * teamIds includes the parent/owner club of every Developing Team. The asset
   * merger then prefers that parent record for U23 squads, so both squads use
   * the same organization logo and home kit without changing U23 identity.
   */
  const { data: teamKitData, error: teamKitError } = await supabase
    .from('team_kits')
    .select('*')
    .in('team_id', teamIds)

  if (teamKitError) {
    console.warn('Could not load participant custom team kits:', teamKitError.message)
  } else {
    const clubRecordById = new Map<string, Record<string, unknown>>()

    clubRows.forEach((clubRecord) => {
      getLogoRecordLookupIds(clubRecord).forEach((lookupId) => {
        clubRecordById.set(lookupId, clubRecord)
      })
    })

    const enrichedTeamKitRows = (teamKitData ?? []).map((teamKitRow) => {
      const kitRecord = getRecord(teamKitRow)
      const teamId = getStringField(kitRecord, ['team_id', 'club_id'])
      const clubRecord = teamId ? clubRecordById.get(teamId) : null

      return {
        ...(clubRecord ?? {}),
        ...kitRecord,
      }
    })

    teamsWithLogos = mergeParticipantTeamLogoUrls(
      teamsWithLogos,
      enrichedTeamKitRows
    )
  }

  return teamsWithLogos
}

type ClubNameLookupRow = {
  id: string
  country_code?: string | null
}

type ClubDisplayNameLookupRow = {
  club_id: string
  display_name: string | null
  original_name?: string | null
  full_display_name?: string | null
}

function getParticipantTeamIdentityLookupIds(team: RaceParticipantTeam): string[] {
  return Array.from(
    new Set(
      [team.participating_club_id, team.club_id, team.owner_club_id, team.team_id, team.id]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function getFirstMappedValue<T>(ids: string[], map: Map<string, T>): T | null {
  for (const id of ids) {
    const value = map.get(id)
    if (value !== undefined) return value
  }

  return null
}

async function loadParticipantTeamDisplayNames(
  clubIds: string[]
): Promise<Map<string, string>> {
  if (clubIds.length === 0) return new Map()

  const { data, error } = await raceDetailReadRpc('get_club_display_names_v1', {
    p_club_ids: clubIds,
  })

  if (error) {
    console.warn('Could not load participant team display names:', error.message)
    return new Map()
  }

  const displayNameByClubId = new Map<string, string>()

  for (const row of (data ?? []) as ClubDisplayNameLookupRow[]) {
    const clubId = row.club_id?.trim()
    const displayName = row.display_name?.trim()

    if (clubId && displayName) {
      displayNameByClubId.set(clubId, displayName)
    }
  }

  return displayNameByClubId
}

function addTeamIdToSet(teamIds: Set<string>, teamId?: string | null) {
  const normalized = teamId?.trim()
  if (normalized) teamIds.add(normalized)
}

function getDisplayNameForTeamId(
  teamId: string | null | undefined,
  displayNameByClubId: Map<string, string>
): string | null {
  const normalized = teamId?.trim()
  if (!normalized) return null

  return displayNameByClubId.get(normalized) ?? null
}

async function hydrateRaceResultsPayloadDisplayNames(
  payload: RaceResultsViewPayload
): Promise<RaceResultsViewPayload> {
  const teamIds = new Set<string>()

  payload.stage_results.forEach((row) => addTeamIdToSet(teamIds, row.team_id))
  payload.point_results.forEach((row) => addTeamIdToSet(teamIds, row.team_id))
  payload.classifications.forEach((row) => addTeamIdToSet(teamIds, row.team_id))

  if (teamIds.size === 0) return payload

  const displayNameByClubId = await loadParticipantTeamDisplayNames(Array.from(teamIds))
  if (displayNameByClubId.size === 0) return payload

  return {
    ...payload,
    stage_results: payload.stage_results.map((row) => {
      const displayName = getDisplayNameForTeamId(row.team_id, displayNameByClubId)
      return displayName ? { ...row, team_name_snapshot: displayName } : row
    }),
    point_results: payload.point_results.map((row) => {
      const displayName = getDisplayNameForTeamId(row.team_id, displayNameByClubId)
      return displayName ? { ...row, team_name_snapshot: displayName } : row
    }),
    classifications: payload.classifications.map((row) => {
      const displayName = getDisplayNameForTeamId(row.team_id, displayNameByClubId)

      if (!displayName) return row

      return {
        ...row,
        team_name_snapshot: displayName,
        display_name_snapshot:
          row.entity_type === 'team' ? displayName : row.display_name_snapshot,
      }
    }),
  }
}

async function hydrateRacePointResultRowsDisplayNames(
  rows: RacePointResultRow[]
): Promise<RacePointResultRow[]> {
  const teamIds = new Set<string>()
  rows.forEach((row) => addTeamIdToSet(teamIds, row.team_id))

  if (teamIds.size === 0) return rows

  const displayNameByClubId = await loadParticipantTeamDisplayNames(Array.from(teamIds))
  if (displayNameByClubId.size === 0) return rows

  return rows.map((row) => {
    const displayName = getDisplayNameForTeamId(row.team_id, displayNameByClubId)
    return displayName ? { ...row, team_name_snapshot: displayName } : row
  })
}


async function hydrateParticipantTeamCurrentNames(
  teams: RaceParticipantTeam[]
): Promise<RaceParticipantTeam[]> {
  const clubIds = Array.from(
    new Set(teams.flatMap((team) => getParticipantTeamIdentityLookupIds(team)))
  )

  if (clubIds.length === 0) return teams

  const [{ data: clubData, error: clubError }, displayNameByClubId] = await Promise.all([
    supabase
      .from('clubs')
      .select('id, country_code')
      .in('id', clubIds),
    loadParticipantTeamDisplayNames(clubIds),
  ])

  if (clubError) {
    console.warn('Could not load current club countries for race participants:', clubError.message)
  }

  const clubsById = new Map<string, ClubNameLookupRow>()

  for (const row of (clubData ?? []) as ClubNameLookupRow[]) {
    if (row.id) clubsById.set(row.id, row)
  }

  return teams.map((team) => {
    const lookupIds = getParticipantTeamIdentityLookupIds(team)
    const club = getFirstMappedValue(lookupIds, clubsById)

    const currentName = getFirstMappedValue(lookupIds, displayNameByClubId) || getParticipantTeamName(team)
    const currentCountryCode = club?.country_code?.trim() || team.country_code || team.country_code_snapshot

    return {
      ...team,
      club_name: currentName,
      team_name_snapshot: currentName,
      country_code: currentCountryCode,
      country_code_snapshot: currentCountryCode,
      riders: team.riders.map((rider) => ({
        ...rider,
        team_name_snapshot: currentName,
      })),
    }
  })
}

function normalizeRaceParticipantRiderRows(rows: unknown): RaceParticipantRider[] {
  if (!Array.isArray(rows)) return []

  return sortParticipantRiders(
    rows
      .map((row) => normalizeRaceParticipantRiderRow(row as RaceParticipantRiderViewRow))
      .filter((rider): rider is RaceParticipantRider => rider !== null)
  )
}

type RiderNameLookupRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
}

function getFullRiderNameFromLookup(row?: RiderNameLookupRow | null): string | null {
  if (!row) return null

  const firstName = row.first_name?.trim() ?? ''
  const lastName = row.last_name?.trim() ?? ''
  const combinedName = `${firstName} ${lastName}`.trim()

  if (combinedName) return combinedName

  return row.display_name?.trim() || null
}

function getRaceParticipantRiderDisplayName(rider: RaceParticipantRider): string {
  const firstName = rider.first_name?.trim() ?? ''
  const lastName = rider.last_name?.trim() ?? ''
  const fullNameFromParts = `${firstName} ${lastName}`.trim()

  return (
    fullNameFromParts ||
    rider.rider_full_name?.trim() ||
    rider.rider_name_snapshot?.trim() ||
    rider.display_name?.trim() ||
    'Unnamed rider'
  )
}

async function hydrateParticipantRiderFullNames(
  riderRows: RaceParticipantRider[]
): Promise<RaceParticipantRider[]> {
  const riderIds = Array.from(
    new Set(
      riderRows
        .map((rider) => rider.rider_id?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )

  if (riderIds.length === 0) return riderRows

  const { data, error } = await supabase
    .from('riders')
    .select('id, first_name, last_name, display_name')
    .in('id', riderIds)

  if (error) {
    console.warn('Could not load full rider names for race participants:', error.message)
    return riderRows
  }

  const namesByRiderId = new Map<string, string>()

  for (const row of (data ?? []) as RiderNameLookupRow[]) {
    const fullName = getFullRiderNameFromLookup(row)
    if (row.id && fullName) namesByRiderId.set(row.id, fullName)
  }

  const lookupByRiderId = new Map<string, RiderNameLookupRow>()

  for (const row of (data ?? []) as RiderNameLookupRow[]) {
    if (row.id) lookupByRiderId.set(row.id, row)
  }

  return riderRows.map((rider) => {
    const lookup = lookupByRiderId.get(rider.rider_id) ?? null
    const fullName = lookup ? getFullRiderNameFromLookup(lookup) : null

    if (!fullName && !lookup) return rider

    return {
      ...rider,
      first_name: lookup?.first_name ?? rider.first_name ?? null,
      last_name: lookup?.last_name ?? rider.last_name ?? null,
      display_name: fullName ?? rider.display_name ?? null,
      rider_name_snapshot: fullName ?? rider.rider_name_snapshot,
      rider_full_name: fullName ?? rider.rider_full_name ?? null,
    }
  })
}


async function hydrateStageResultFullNames(
  stageRows: RaceStageResultRow[]
): Promise<RaceStageResultRow[]> {
  const riderIds = Array.from(
    new Set(
      stageRows
        .map((row) => row.rider_id?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )

  if (riderIds.length === 0) return stageRows

  const { data, error } = await supabase
    .from('riders')
    .select('id, first_name, last_name, display_name')
    .in('id', riderIds)

  if (error) {
    console.warn('Could not load full rider names for stage results:', error.message)
    return stageRows
  }

  const namesByRiderId = new Map<string, string>()

  for (const row of (data ?? []) as RiderNameLookupRow[]) {
    const fullName = getFullRiderNameFromLookup(row)
    if (row.id && fullName) namesByRiderId.set(row.id, fullName)
  }

  return stageRows.map((row) => {
    const fullName = row.rider_id ? namesByRiderId.get(row.rider_id) ?? null : null

    if (!fullName) return row

    return {
      ...row,
      full_name: fullName,
      rider_full_name: fullName,
      display_name: fullName,
    }
  })
}

function attachRidersToParticipantTeams(
  teams: RaceParticipantTeam[],
  riderRows: RaceParticipantRider[]
): RaceParticipantTeam[] {
  const ridersByTeamId = new Map<string, RaceParticipantRider[]>()

  for (const rider of riderRows ?? []) {
    const lookupIds = Array.from(
      new Set(
        [rider.team_id]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )

    for (const lookupId of lookupIds) {
      const teamRiders = ridersByTeamId.get(lookupId) ?? []
      teamRiders.push(rider)
      ridersByTeamId.set(lookupId, teamRiders)
    }
  }

  const matchedRiderIds = new Set<string>()

  const teamsWithRiders = teams.map((team) => {
    const lookupIds = Array.from(
      new Set(
        [
          team.participating_club_id,
          team.club_id,
          team.owner_club_id,
          team.team_id,
          team.id,
          team.race_team_entry_id,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )

    const matchedRidersById = new Map<string, RaceParticipantRider>()

    for (const lookupId of lookupIds) {
      const matchedRiders = ridersByTeamId.get(lookupId) ?? []

      for (const rider of matchedRiders) {
        matchedRidersById.set(rider.id ?? rider.rider_id, rider)
        matchedRiderIds.add(rider.id ?? rider.rider_id)
      }
    }

    const currentTeamName = getParticipantTeamName(team)
    const riders = sortParticipantRiders(
      Array.from(matchedRidersById.values()).map((rider) => ({
        ...rider,
        team_name_snapshot: currentTeamName,
      }))
    )

    return {
      ...team,
      club_name: currentTeamName,
      team_name_snapshot: currentTeamName,
      riders,
      assigned_riders_count: riders.length,
    }
  })

  const missingRiders = (riderRows ?? []).filter(
    (rider) => !matchedRiderIds.has(rider.id ?? rider.rider_id)
  )

  const sortTeamsByRaceOrder = (
    participantTeams: RaceParticipantTeam[]
  ): RaceParticipantTeam[] =>
    [...participantTeams].sort(compareParticipantTeamsByRaceOrder)

  if (missingRiders.length === 0) return sortTeamsByRaceOrder(teamsWithRiders)

  const missingRidersByTeamId = new Map<string, RaceParticipantRider[]>()

  for (const rider of missingRiders) {
    const teamKey =
      rider.team_id?.trim() ||
      rider.team_name_snapshot?.trim() ||
      `unknown-team-${rider.race_id || 'race'}`

    const teamRiders = missingRidersByTeamId.get(teamKey) ?? []
    teamRiders.push(rider)
    missingRidersByTeamId.set(teamKey, teamRiders)
  }

  const syntheticTeams: RaceParticipantTeam[] = Array.from(
    missingRidersByTeamId.entries()
  ).map(([teamKey, teamRiders]) => {
    const firstRider = teamRiders[0]
    const teamName =
      firstRider?.team_name_snapshot?.trim() ||
      'Race team'
    const teamId = firstRider?.team_id?.trim() || teamKey
    const raceId = firstRider?.race_id ?? teams[0]?.race_id ?? ''

    return {
      id: teamId,
      race_id: raceId,
      team_id: teamId,
      club_id: isUuid(teamId) ? teamId : null,
      owner_club_id: isUuid(teamId) ? teamId : null,
      participating_club_id: isUuid(teamId) ? teamId : null,
      parent_club_id: null,
      club_type: null,
      race_team_entry_id: null,
      status: 'accepted',
      club_name: teamName,
      country_code: null,
      club_tier: null,
      world_tier: null,
      assigned_riders_count: teamRiders.length,
      team_name_snapshot: teamName,
      logo_url_snapshot: null,
      jersey_url_snapshot: null,
      country_code_snapshot: null,
      ranking_snapshot: null,
      competition_display: 'Race participant',
      competition_rank: null,
      competition_points: null,
      division_key: null,
      riders: sortParticipantRiders(
        teamRiders.map((rider) => ({
          ...rider,
          team_name_snapshot: teamName,
        }))
      ),
    }
  })

  return sortTeamsByRaceOrder([...teamsWithRiders, ...syntheticTeams])
}

function formatCompetitionName(value?: string | number | null): string | null {
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw) return null

  const normalized = raw.toLowerCase().replace(/[-_\s]+/g, '')

  switch (normalized) {
    case 'worldteam':
    case 'worldtour':
      return 'World Team'
    case 'proteam':
      return 'Pro Team'
    case 'proteama':
      return 'Pro Team A'
    case 'proteamb':
      return 'Pro Team B'
    case 'proteams':
      return 'Pro Team S'
    case 'continental':
    case 'continentalteam':
      return 'Continental Team'
    case 'development':
    case 'developmentteam':
      return 'Development Team'
    case 'amateur':
    case 'amateurteam':
      return 'Amateur Team'
    default:
      return raw
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

function getParticipantCompetitionLabel(team: RaceParticipantTeam): string {
  return (
    team.competition_display?.trim() ||
    formatCompetitionName(team.club_tier) ||
    formatCompetitionName(team.world_tier) ||
    'Competition —'
  )
}

function getRiderOverallDisplay(rider: RaceParticipantRider): string {
  const overall = asNumber(rider.overall_snapshot)

  if (rider.can_view_exact_overall && overall !== null) {
    return `OVR ${Math.round(overall)}`
  }

  return rider.overall_range_label ?? 'OVR —'
}

function RaceFavoritesBox({
  favorites,
  loading,
  error,
  displayStartNumberByRiderId,
  onOpenRiderProfile,
}: {
  favorites: RaceFavoriteRow[]
  loading: boolean
  error: string | null
  displayStartNumberByRiderId: Map<string, number>
  onOpenRiderProfile: (riderId: string) => void
}) {
  if (loading) {
    return (
      <section className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 shadow-sm">
        <div className="text-sm font-semibold text-sky-950">
          Calculating race favorites...
        </div>
        <div className="mt-1 text-xs text-sky-700">
          Based on rider skills, selected race role and this season results.
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
        Top 5 favorites are not available yet: {error}
      </section>
    )
  }

  if (favorites.length === 0) {
    return null
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-white shadow-sm">
      <div className="border-b border-sky-100 px-4 py-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-sky-950">
              Top 5 race favorites
            </div>
            <div className="text-xs text-sky-700">
              Calculated from rider skills, this season results, race profile and assigned role.
            </div>
          </div>

        </div>
      </div>

      <div className="grid gap-2 p-3 lg:grid-cols-5">
        {favorites.map((favorite) => {
          const rank = asNumber(favorite.favorite_rank)
          const startNumber =
            (favorite.rider_id
              ? displayStartNumberByRiderId.get(favorite.rider_id) ?? null
              : null) ?? asNumber(favorite.start_number)
          const riderName = favorite.rider_name?.trim() || 'Unknown rider'
          const teamName = favorite.team_name?.trim() || 'Team'
          const roleLabel = formatRiderRole(favorite.role_snapshot)

          return (
            <button
              key={`${favorite.rider_id ?? riderName}-${rank ?? 0}`}
              type="button"
              onClick={() => {
                if (favorite.rider_id) onOpenRiderProfile(favorite.rider_id)
              }}
              className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                  {rank ? rank : '—'}
                </span>

                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                  {startNumber ? `#${startNumber}` : 'No #'}
                </span>
              </div>

              <div className="truncate text-sm font-semibold text-slate-950 transition group-hover:text-sky-800">
                {riderName}
              </div>

              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                <SmallCountryFlag code={favorite.country_code} />
                <span className="truncate">{teamName}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                  {roleLabel}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RaceParticipantsGrid({
  teams,
  loading,
  error,
  favorites,
  favoritesLoading,
  favoritesError,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  teams: RaceParticipantTeam[]
  loading: boolean
  error: string | null
  favorites: RaceFavoriteRow[]
  favoritesLoading: boolean
  favoritesError: string | null
  onOpenTeamProfile: (teamId: string) => void
  onOpenRiderProfile: (riderId: string) => void
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
        Loading accepted teams and riders...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Could not load participants: {error}
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
        No accepted teams have been confirmed yet. Accepted teams will appear here once
        the official startlist is published.
      </div>
    )
  }

  const displayTeams = buildParticipantTeamsForRaceDisplay(teams)
  const displayStartNumberByRiderId = new Map<string, number>()

  for (const team of displayTeams) {
    for (const rider of team.riders) {
      if (rider.rider_id && rider.display_start_number) {
        displayStartNumberByRiderId.set(rider.rider_id, rider.display_start_number)
      }
    }
  }

  const assignedRiderTotal = displayTeams.reduce(
    (total, team) => total + team.riders.length,
    0
  )

  return (
    <div>
      <RaceFavoritesBox
        favorites={favorites}
        loading={favoritesLoading}
        error={favoritesError}
        displayStartNumberByRiderId={displayStartNumberByRiderId}
        onOpenRiderProfile={onOpenRiderProfile}
      />

      <div className="mb-4 text-sm font-semibold text-slate-700">
        {displayTeams.length} teams · {assignedRiderTotal} assigned riders
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {displayTeams.map((team) => {
          const teamName = getParticipantTeamName(team)
          const countryCode = team.country_code ?? team.country_code_snapshot
          const competitionLabel = getParticipantCompetitionLabel(team)
          const assignedRidersCount = team.riders.length

          return (
            <article
              key={team.race_team_entry_id ?? team.id ?? team.team_id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => onOpenTeamProfile(team.club_id ?? team.team_id)}
                className="group block w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50"
              >
                <div className="truncate text-base font-semibold text-slate-950 transition group-hover:text-slate-700">
                  {teamName}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <SmallCountryFlag code={countryCode} />
                  {countryCode ? <span>{countryCode}</span> : null}
                  <span className="font-semibold text-slate-700">{competitionLabel}</span>
                </div>
              </button>

              <div className="grid min-h-[430px] md:grid-cols-[190px_minmax(0,1fr)]">
                <div className="grid border-b border-slate-100 bg-slate-50/60 md:grid-rows-[180px_1fr] md:border-b-0 md:border-r">
                  <div className="flex min-h-[180px] flex-col items-center justify-center border-b border-slate-100 p-4">
                    <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Team logo
                    </div>
                    <TeamLogo team={team} className="h-32 w-32" />
                  </div>

                  <div className="flex min-h-[250px] flex-col items-center justify-center p-4">
                    <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Team jersey
                    </div>
                    <TeamJerseyImage team={team} className="h-48 w-40" />
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Riders participating in this race
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {assignedRidersCount} assigned riders
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {team.riders.length > 0 ? (
                      team.riders.map((rider) => (
                        <button
                          key={rider.rider_id}
                          type="button"
                          onClick={() => onOpenRiderProfile(rider.rider_id)}
                          className="group flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900 transition group-hover:text-slate-950">
                              {rider.display_start_number ?? rider.start_number ? (
                                <span className="mr-2 text-xs font-semibold text-slate-500">
                                  #{rider.display_start_number ?? rider.start_number}
                                </span>
                              ) : null}
                              {getRaceParticipantRiderDisplayName(rider)}
                            </div>

                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <SmallCountryFlag
                                code={rider.country_code_snapshot ?? countryCode}
                              />

                              {rider.age_snapshot ? <span>{rider.age_snapshot} yrs</span> : null}

                              <span>{formatRiderRole(rider.role_snapshot)}</span>
                            </div>
                          </div>

                          {rider.is_young_rider ? (
                            <span className="shrink-0 rounded-full bg-yellow-50 px-2 py-1 text-[10px] font-semibold text-yellow-700 ring-1 ring-yellow-100">
                              U21
                            </span>
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        {assignedRidersCount > 0
                          ? `${assignedRidersCount} riders assigned. Rider details are not available yet.`
                          : 'No riders assigned yet.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}


function formatPendingApplicationNumber(value?: number | null): string {
  const parsed = asNumber(value)
  return parsed === null ? '—' : parsed.toLocaleString()
}

function formatPendingApplicationChance(value?: number | null): string {
  const parsed = asNumber(value)
  return parsed === null ? '—' : `${Math.round(Math.max(0, Math.min(100, parsed)))}%`
}

function getPendingApplicationChanceBarWidth(value?: number | null): string {
  const parsed = asNumber(value)
  if (parsed === null) return '0%'
  return `${Math.max(0, Math.min(100, parsed))}%`
}

function ApplicationPendingInfoCard({
  quote,
  loading,
  error,
}: {
  quote: RaceApplicationQuote | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm text-sky-800">
        Loading your application estimate…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Your application is submitted. The detailed acceptance estimate could not be loaded: {error}
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm text-sky-800">
        Your application is submitted. Official participants will appear here once the team list is published.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Application submitted
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            Waiting for team selection
          </div>
          <p className="mt-2 max-w-2xl leading-6 text-slate-600">
            Official participants are not confirmed yet. Accepted teams and riders will replace this
            estimate once the team list is published.
          </p>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm ring-1 ring-sky-100">
          <div className="text-xs font-semibold text-slate-500">Estimated chance</div>
          <div className="mt-1 text-2xl font-bold text-slate-950">
            {formatPendingApplicationChance(quote.estimated_acceptance_chance_pct)}
          </div>
          <div className="mt-1 text-xs font-semibold text-sky-700">
            {quote.chance_label ?? 'Application estimate'}
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-sky-600"
          style={{ width: getPendingApplicationChanceBarWidth(quote.estimated_acceptance_chance_pct) }}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-sky-100">
          <div className="text-xs text-slate-500">Applied teams</div>
          <div className="mt-1 font-bold text-slate-950">
            {formatPendingApplicationNumber(quote.applied_teams ?? quote.submitted_application_teams)}
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-sky-100">
          <div className="text-xs text-slate-500">Already accepted</div>
          <div className="mt-1 font-bold text-slate-950">
            {formatPendingApplicationNumber(quote.accepted_teams)}
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-sky-100">
          <div className="text-xs text-slate-500">Target / max teams</div>
          <div className="mt-1 font-bold text-slate-950">
            {formatPendingApplicationNumber(quote.target_teams)} / {formatPendingApplicationNumber(quote.max_teams)}
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-sky-100">
          <div className="text-xs text-slate-500">Application strength</div>
          <div className="mt-1 font-bold text-slate-950">
            {formatPendingApplicationNumber(quote.commitment_score)}
          </div>
        </div>
      </div>

      {quote.chance_summary ? (
        <p className="mt-4 text-xs leading-5 text-slate-500">{quote.chance_summary}</p>
      ) : null}
    </div>
  )
}

function usePublishedRaceStageIds(
  stages: RaceStage[]
): string[] {
  const stageIds = useMemo(
    () => stages.map((stage) => stage.id),
    [stages]
  )

  const stageIdsKey = stageIds.join('|')

  const [
    publishedStageIds,
    setPublishedStageIds,
  ] = useState<string[]>([])

  useEffect(() => {
    if (stageIds.length === 0) {
      setPublishedStageIds((current) =>
        current.length === 0 ? current : []
      )
      return
    }

    let cancelled = false

    async function loadPublishedStages() {
      const results = await Promise.all(
        stageIds.map(async (stageId) => {
          const { data, error } =
            await raceDetailReadRpc(
              'get_race_stage_live_state_v1',
              {
                p_stage_id: stageId,
              }
            )

          if (error) {
            console.error(
              `Could not load live state for stage ${stageId}:`,
              error
            )
            return null
          }

          const value = Array.isArray(data)
            ? data[0]
            : data

          const liveState =
            value &&
            typeof value === 'object'
              ? (value as RaceStageLiveState)
              : null

          return liveState?.results_visible === true
            ? stageId
            : null
        })
      )

      if (cancelled) return

      const nextPublishedStageIds =
        results.filter(
          (stageId): stageId is string =>
            Boolean(stageId)
        )

      /*
       * Keep the existing array reference when the publication
       * state has not changed.
       *
       * This prevents the results effects from restarting every
       * five seconds.
       */
      setPublishedStageIds(
        (currentPublishedStageIds) => {
          const unchanged =
            currentPublishedStageIds.length ===
              nextPublishedStageIds.length &&
            currentPublishedStageIds.every(
              (stageId, index) =>
                stageId ===
                nextPublishedStageIds[index]
            )

          return unchanged
            ? currentPublishedStageIds
            : nextPublishedStageIds
        }
      )
    }

    void loadPublishedStages()

    const interval = window.setInterval(
      () => {
        void loadPublishedStages()
      },
      5000
    )

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [stageIdsKey])

  return publishedStageIds
}

function RaceResultsHub({
  race,
  stages,
  participantTeams,
  participantsLoading,
  participantsError,
  currentClubId,
  viewerClubFamilyIds,
  teamEntryStatus,
  onOpenTeamProfile,
  onOpenRiderProfile,
  restoreRaceInformationOpen = false,
  restoreRaceInformationTab,
  stageResultsOverride = null,
  engineTestModeLabel = null,
}: {
  race: Race
  stages: RaceStage[]
  participantTeams: RaceParticipantTeam[]
  participantsLoading: boolean
  participantsError: string | null
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  teamEntryStatus?: string | null
  onOpenTeamProfile: (teamId: string, context?: { raceInfoExpanded?: boolean; raceInfoTab?: RaceInfoTab }) => void
  onOpenRiderProfile: (riderId: string, context?: { raceInfoExpanded?: boolean; raceInfoTab?: RaceInfoTab }) => void
  restoreRaceInformationOpen?: boolean
  restoreRaceInformationTab?: RaceInfoTab
  stageResultsOverride?: {
    readonly stageId: string
    readonly rows:
      readonly RaceStageResultRow[]
  } | null
  engineTestModeLabel?: string | null
}) {
  const [activeTab, setActiveTab] = useState<RaceInfoTab>(restoreRaceInformationTab ?? 'participants')
  const raceInformationSectionRef = useRef<HTMLElement | null>(null)
  const [classificationView, setClassificationView] =
    useState<ClassificationView>('general')
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? '')
  const [stageResultView, setStageResultView] =
    useState<StageResultView>('stage_general')
  const [isExpanded, setIsExpanded] = useState(Boolean(restoreRaceInformationOpen))

  const [classificationPayload, setClassificationPayload] =
    useState<RaceResultsViewPayload | null>(null)
  const [classificationLoading, setClassificationLoading] = useState(false)
  const [classificationError, setClassificationError] = useState<string | null>(null)
  const [
    availableClassificationStageIds,
    setAvailableClassificationStageIds,
  ] = useState<string[]>([])


  const [stageResultsPayload, setStageResultsPayload] =
    useState<RaceResultsViewPayload | null>(null)
  const [stagePointResults, setStagePointResults] =
    useState<RacePointResultRow[]>([])
  const [stageResultsLoading, setStageResultsLoading] = useState(false)
  const [stageResultsError, setStageResultsError] = useState<string | null>(null)
  const [inlineApplicationQuote, setInlineApplicationQuote] = useState<RaceApplicationQuote | null>(null)
  const [inlineApplicationQuoteLoading, setInlineApplicationQuoteLoading] = useState(false)
  const [inlineApplicationQuoteError, setInlineApplicationQuoteError] = useState<string | null>(null)
  const [raceFavorites, setRaceFavorites] = useState<RaceFavoriteRow[]>([])
  const [raceFavoritesLoading, setRaceFavoritesLoading] = useState(false)
  const [raceFavoritesError, setRaceFavoritesError] = useState<string | null>(null)

  const publishedStageIds =
    usePublishedRaceStageIds(stages)

  const publishedStageIdSet = useMemo(
    () => new Set(publishedStageIds),
    [publishedStageIds]
  )

  const publishedStages = useMemo(
    () =>
      [...stages]
        .filter((stage) =>
          publishedStageIdSet.has(stage.id) || isStageWeatherCanceled(stage)
        )
        .sort(
          (left, right) =>
            Number(left.stage_number) -
            Number(right.stage_number)
        ),
    [stages, publishedStageIdSet]
  )

  const normalizedRaceStatus =
    race.status?.trim().toLowerCase() ?? ''

  const raceHasStarted =
    publishedStages.length > 0 ||
    [
      'active',
      'completed',
      'finished',
      'archived',
    ].includes(normalizedRaceStatus)

  useEffect(() => {
    if (!restoreRaceInformationOpen) return

    setIsExpanded(true)
    setActiveTab(restoreRaceInformationTab ?? 'participants')
  }, [restoreRaceInformationOpen, restoreRaceInformationTab])

  const openProfileContext = useMemo(
    () => ({
      raceInfoExpanded: true,
      raceInfoTab: activeTab,
    }),
    [activeTab]
  )

  function openTeamProfileFromRaceInfo(teamId: string) {
    onOpenTeamProfile(teamId, openProfileContext)
  }

  function openRiderProfileFromRaceInfo(riderId: string) {
    onOpenRiderProfile(riderId, openProfileContext)
  }

  function toggleRaceInformation() {
    setIsExpanded((currentValue) => {
      const nextValue = !currentValue

      /*
       * Before the race starts:
       *   Teams & riders opens first.
       *
       * Once the race starts:
       *   Results opens first whenever the card is expanded.
       */
      if (nextValue) {
        setActiveTab(
          raceHasStarted
            ? 'results'
            : 'participants'
        )
      }

      return nextValue
    })
  }

  function handleRaceInformationTabChange(nextTab: RaceInfoTab) {
    setActiveTab(nextTab)

    window.requestAnimationFrame(() => {
      raceInformationSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  useEffect(() => {
    if (publishedStages.length === 0) {
      setStageId('')
      return
    }

    const selectedStageIsPublished =
      publishedStages.some(
        (stage) => stage.id === stageId
      )

    if (!selectedStageIsPublished) {
      /*
       * Default to the latest published stage.
       */
      setStageId(
        publishedStages[
          publishedStages.length - 1
        ].id
      )
    }
  }, [publishedStages, stageId])

  const selectedStage =
    publishedStages.find(
      (stage) => stage.id === stageId
    ) ??
    publishedStages[
      publishedStages.length - 1
    ] ??
    null
  const selectedStageIsTimeTrialLike =
    isTimeTrialLikeStage(selectedStage)
  const selectedStageIsTeamTimeTrialLike =
    isTeamTimeTrialLikeStage(selectedStage)
  const selectedStageAllowsSprintPointView =
    !selectedStageIsTeamTimeTrialLike
  const selectedStageWeatherCanceled = isStageWeatherCanceled(selectedStage)
  const raceAllStagesWeatherCanceled = isRaceAllWeatherCanceled(race)
  const raceHasWeatherCancellation =
    raceAllStagesWeatherCanceled || isRacePartlyWeatherCanceled(race)

  const viewerTeamId = getViewerTeamId(currentClubId)
  const viewerTeamIds = getViewerTeamIds(viewerTeamId, viewerClubFamilyIds)
  const effectiveEntryStatus = teamEntryStatus ?? race.existing_application_status ?? null
  const showPendingApplicationInfo =
    activeTab === 'participants' &&
    isPendingRaceApplicationStatus(effectiveEntryStatus) &&
    !participantsLoading &&
    !participantsError &&
    participantTeams.length === 0 &&
    !isRaceStartlistLocked(race.status)

  useEffect(() => {
    if (!race.id || !isUuid(race.id)) {
      setRaceFavorites([])
      setRaceFavoritesError(null)
      setRaceFavoritesLoading(false)
      return
    }

    let cancelled = false

    async function loadRaceFavorites() {
      setRaceFavoritesLoading(true)
      setRaceFavoritesError(null)

      const { data, error } = await raceDetailReadRpc('get_race_favorites_v1', {
        p_race_id: race.id,
        p_limit: 5,
      })

      if (cancelled) return

      if (error) {
        console.warn('Could not load race favorites:', error.message)
        setRaceFavorites([])
        setRaceFavoritesError(error.message)
      } else {
        setRaceFavorites(((data ?? []) as RaceFavoriteRow[]).slice(0, 5))
        setRaceFavoritesError(null)
      }

      setRaceFavoritesLoading(false)
    }

    void loadRaceFavorites()

    return () => {
      cancelled = true
    }
  }, [race.id])

  useEffect(() => {
    if (
      !isExpanded ||
      !race.id ||
      activeTab !== 'results'
    ) {
      setAvailableClassificationStageIds([])
      return
    }

    let cancelled = false

    async function loadAvailableClassificationStages() {
      const { data, error } = await supabase
        .from('race_classification_standings')
        .select('after_stage_id')
        .eq('race_id', race.id)
        .eq('classification_type', 'general')
        .eq('entity_type', 'rider')

      if (cancelled) return

      if (error) {
        console.error(
          'Could not load available classification stages:',
          error
        )
        setAvailableClassificationStageIds([])
        return
      }

      setAvailableClassificationStageIds(
        Array.from(
          new Set(
            (data ?? [])
              .map((row) => row.after_stage_id)
              .filter(
                (stageId): stageId is string =>
                  typeof stageId === 'string' &&
                  stageId.length > 0
              )
          )
        )
      )
    }

    loadAvailableClassificationStages()

    return () => {
      cancelled = true
    }
  }, [race.id, activeTab, isExpanded])

  const availableClassificationStageIdSet =
    useMemo(
      () =>
        new Set(
          availableClassificationStageIds
        ),
      [availableClassificationStageIds]
    )

  /*
   * Stage 1 selected → classification after Stage 1
   * Stage 2 selected → classification after Stage 2
   * Stage 3 selected → classification after Stage 3,
   * but only after Stage 3 is published.
   */
  const classificationResultsStageId =
    selectedStage &&
    !isStageWeatherCanceled(selectedStage) &&
    publishedStageIdSet.has(
      selectedStage.id
    ) &&
    availableClassificationStageIdSet.has(
      selectedStage.id
    )
      ? selectedStage.id
      : null

  useEffect(() => {
    if (
      selectedStageIsTeamTimeTrialLike &&
      stageResultView !== 'stage_general'
    ) {
      setStageResultView('stage_general')
    }
  }, [selectedStageIsTeamTimeTrialLike, stageResultView])

  useEffect(() => {
    let mounted = true

    async function loadInlineApplicationQuote() {
      if (!showPendingApplicationInfo || !race.id || !viewerTeamId) {
        setInlineApplicationQuote(null)
        setInlineApplicationQuoteError(null)
        setInlineApplicationQuoteLoading(false)
        return
      }

      setInlineApplicationQuoteLoading(true)
      setInlineApplicationQuoteError(null)

      const { data, error } = await supabase.functions.invoke('quote-race-application', {
        body: {
          race_id: race.id,
          club_id: viewerTeamId,
        },
      })

      if (!mounted) return

      if (error) {
        setInlineApplicationQuote(null)
        setInlineApplicationQuoteError(error.message)
      } else {
        const result = (data ?? {}) as RaceApplicationQuote
        if (result.success === false) {
          setInlineApplicationQuote(null)
          setInlineApplicationQuoteError(result.message ?? result.error ?? 'Could not load application estimate.')
        } else {
          setInlineApplicationQuote(result)
        }
      }

      setInlineApplicationQuoteLoading(false)
    }

    loadInlineApplicationQuote()

    return () => {
      mounted = false
    }
  }, [showPendingApplicationInfo, race.id, viewerTeamId])

  useEffect(() => {
    let mounted = true

    async function loadCurrentClassifications() {
      if (
        !isExpanded ||
        !race.id ||
        activeTab !== 'results'
      ) {
        return
      }

      if (!classificationResultsStageId) {
        setClassificationPayload(null)
        return
      }

      setClassificationLoading(true)
      setClassificationError(null)

      const { data, error } = await raceDetailReadRpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: classificationResultsStageId,
      })

      if (!mounted) return

      if (error) {
        setClassificationPayload(null)
        setClassificationError(error.message)
      } else {
        const normalizedClassificationPayload =
          await hydrateRaceResultsPayloadDisplayNames(
            normalizeRaceResultsPayload(data)
          )

        if (!mounted) return

        setClassificationPayload(normalizedClassificationPayload)
      }

      setClassificationLoading(false)
    }

    loadCurrentClassifications()

    return () => {
      mounted = false
    }
  }, [
    race.id,
    classificationResultsStageId,
    activeTab,
    isExpanded,
  ])

  useEffect(() => {
    let mounted = true

    async function loadStageResults() {
      const stageForResults =
        stages.find((stage) => stage.id === stageId) ?? null

      if (
        !isExpanded ||
        !race.id ||
        !stageId ||
        (!publishedStageIdSet.has(stageId) && !isStageWeatherCanceled(stageForResults)) ||
        activeTab !== 'results'
      ) {
        setStageResultsPayload(null)
        setStagePointResults([])
        return
      }

      if (isStageWeatherCanceled(stageForResults)) {
        setStageResultsPayload({
          race_id: race.id,
          stage_id: stageId,
          stage_results: [],
          point_results: [],
          classifications: [],
          leader_snapshot: {},
        })
        setStagePointResults([])
        setStageResultsError(null)
        setStageResultsLoading(false)
        return
      }

      if (
        stageResultsOverride &&
        stageResultsOverride.stageId === stageId
      ) {
        setStageResultsPayload({
          race_id: race.id,
          stage_id: stageId,
          stage_results: stageResultsOverride.rows.map(
            (row) => ({
              ...row,
            })
          ),
          point_results: [],
          classifications: [],
          leader_snapshot: {},
        })
        setStagePointResults([])
        setStageResultsError(null)
        setStageResultsLoading(false)
        return
      }

      setStageResultsLoading(true)
      setStageResultsError(null)

      const [
        { data: resultsData, error: resultsError },
        { data: pointData, error: pointError },
      ] = await Promise.all([
        raceDetailReadRpc('get_race_results_view_v1', {
          p_race_id: race.id,
          p_after_stage_id: stageId,
        }),

        raceDetailReadRpc('get_race_stage_point_results_v1', {
          p_stage_id: stageId,
        }),
      ])

      if (!mounted) return

      if (resultsError) {
        setStageResultsPayload(null)
        setStagePointResults([])
        setStageResultsError(resultsError.message)
      } else {
        const normalizedStageResultsPayload =
          await hydrateRaceResultsPayloadDisplayNames(
            normalizeRaceResultsPayload(resultsData)
          )
        const hydratedStageResults = await hydrateStageResultFullNames(
          normalizedStageResultsPayload.stage_results
        )
        const hydratedPointRows = await hydrateRacePointResultRowsDisplayNames(
          selectedStageIsTimeTrialLike
            ? []
            : !pointError && Array.isArray(pointData)
              ? (pointData as RacePointResultRow[])
              : []
        )

        if (!mounted) return

        setStageResultsPayload({
          ...normalizedStageResultsPayload,
          stage_results: hydratedStageResults,
        })

        setStagePointResults(hydratedPointRows)

        if (pointError) {
          console.error(
            'Could not load stage point results:',
            pointError
          )
        }
      }

      setStageResultsLoading(false)
    }

    loadStageResults()

    return () => {
      mounted = false
    }
  }, [
    race.id,
    stageId,
    activeTab,
    isExpanded,
    publishedStageIdSet,
    selectedStageIsTimeTrialLike,
    stageResultsOverride,
    stages,
  ])

  const classificationRows = useMemo(() => {
    return (classificationPayload?.classifications ?? []).filter(
      (row) => row.classification_type === classificationView
    )
  }, [classificationPayload, classificationView])

  const classificationViewOptions = useMemo(
    () => {
      const availableClassificationTypes = new Set(
        (classificationPayload?.classifications ?? [])
          .map((row) => row.classification_type)
      )

      const options: Array<{
        value: ClassificationView
        label: string
      }> = [
        { value: 'general', label: 'General classification' },
      ]

      if (availableClassificationTypes.has('points')) {
        options.push({
          value: 'points',
          label: 'Points classification',
        })
      }

      options.push(
        { value: 'mountain', label: 'Mountain classification' },
        { value: 'young', label: 'Young rider classification' },
        { value: 'team', label: 'Team classification' }
      )

      return options
    },
    [classificationPayload]
  )

  useEffect(() => {
    const selectedClassificationStillAvailable =
      classificationViewOptions.some(
        (option) => option.value === classificationView
      )

    if (!selectedClassificationStillAvailable) {
      setClassificationView('general')
    }
  }, [classificationViewOptions, classificationView])

  const stagePointAggregateView: StagePointAggregateView =
    stageResultView === 'stage_mountain' ? 'mountain' : 'sprint'

  const stagePointRows = useMemo(() => {
    if (
      stageResultView === 'stage_general' ||
      selectedStageIsTeamTimeTrialLike
    ) {
      return []
    }

    return buildAggregatedStagePointRows(
      stageResultsPayload?.stage_results ?? [],
      stagePointResults,
      stagePointAggregateView
    )
  }, [
    stageResultsPayload,
    stagePointResults,
    stagePointAggregateView,
    stageResultView,
    selectedStageIsTeamTimeTrialLike,
  ])

  const raceAwaitingSimulation =
    normalizedRaceStatus === 'active'

  function renderResultsState(
    loading: boolean,
    error: string | null,
    label: string,
    hasExistingData = false
  ) {
    /*
     * Never replace an already rendered table during a background
     * synchronization request.
     */
    if (loading && !hasExistingData) {
      return (
        <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
          Loading {label}…
        </div>
      )
    }

    if (error && !hasExistingData) {
      return (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load {label}: {error}
        </div>
      )
    }

    return null
  }

  return (
    <section
      ref={raceInformationSectionRef}
      className="w-full rounded-3xl border border-slate-200 bg-white shadow-sm"
      aria-label={`Race information for ${race.name}`}
    >
      <button
        type="button"
        onClick={toggleRaceInformation}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Race information
          </div>

          <div className="mt-1 text-lg font-semibold text-slate-950">
            Participants and results
          </div>
        </div>

        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          {isExpanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {isExpanded ? (
        <div className="border-t border-slate-100 p-6">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleRaceInformationTabChange('participants')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'participants'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              Teams & riders
            </button>

            <button
              type="button"
              onClick={() => handleRaceInformationTabChange('results')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                activeTab === 'results'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500',
              ].join(' ')}
            >
              Results
            </button>
          </div>

          {raceAwaitingSimulation ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Race active. Teams and riders are locked. Results will appear here after the race simulation engine runs.
        </div>
      ) : null}

      {raceHasWeatherCancellation ? (
        <div className="mt-5">
          <WeatherCancellationNotice race={race} />
        </div>
      ) : null}

      {activeTab === 'participants' ? (
        <div className="mt-6">
          {showPendingApplicationInfo ? (
            <ApplicationPendingInfoCard
              quote={inlineApplicationQuote}
              loading={inlineApplicationQuoteLoading}
              error={inlineApplicationQuoteError}
            />
          ) : (
            <RaceParticipantsGrid
              teams={participantTeams}
              loading={participantsLoading}
              error={participantsError}
              favorites={raceFavorites}
              favoritesLoading={raceFavoritesLoading}
              favoritesError={raceFavoritesError}
              onOpenTeamProfile={openTeamProfileFromRaceInfo}
              onOpenRiderProfile={openRiderProfileFromRaceInfo}
            />
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">
                    Race classifications
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Current tour standings
                  </div>
                </div>

                <select
                  value={classificationView}
                  onChange={(event) =>
                    setClassificationView(event.target.value as ClassificationView)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {classificationViewOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {raceAllStagesWeatherCanceled ? (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  All stages were cancelled due to weather. No race classifications were generated.
                </div>
              ) : renderResultsState(
                classificationLoading,
                classificationError,
                'race classifications',
                classificationPayload !== null
              ) ?? (
                <RaceClassificationTable
                  rows={classificationRows}
                  view={classificationView}
                  participantTeams={participantTeams}
                  currentClubId={viewerTeamId}
                  viewerClubFamilyIds={viewerTeamIds}
                  onOpenTeamProfile={openTeamProfileFromRaceInfo}
                  onOpenRiderProfile={openRiderProfileFromRaceInfo}
                />
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              {engineTestModeLabel ? (
                <div className="mb-4 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  <div className="font-semibold">
                    {engineTestModeLabel}
                  </div>

                  <div className="mt-1 text-xs text-sky-800">
                    Classification and replay are generated in browser memory. Persisted official results have not been changed.
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">
                    Stage results
                  </div>
                  {selectedStage ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      Stage {selectedStage.stage_number} · {formatStageRoute(selectedStage)}
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <select
                    value={stageId}
                    onChange={(event) => setStageId(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {publishedStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        Stage {stage.stage_number}
                      </option>
                    ))}
                  </select>

                  <select
                    value={stageResultView}
                    onChange={(event) =>
                      setStageResultView(event.target.value as StageResultView)
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="stage_general">Stage result</option>
                    {selectedStageAllowsSprintPointView ? (
                      <option value="stage_sprint">Sprint points</option>
                    ) : null}
                    {!selectedStageIsTimeTrialLike ? (
                      <option value="stage_mountain">Mountain points</option>
                    ) : null}
                  </select>
                </div>
              </div>

              {selectedStageWeatherCanceled ? (
                <div className="mt-4">
                  <WeatherCancellationNotice stage={selectedStage} race={race} />
                </div>
              ) : renderResultsState(
                stageResultsLoading,
                stageResultsError,
                'stage results',
                stageResultsPayload !== null
              ) ?? (
                stageResultView === 'stage_general' ? (
                  <StageResultsTable
                    rows={
                      stageResultsPayload?.stage_results ??
                      []
                    }
                    participantTeams={participantTeams}
                    classificationRows={classificationPayload?.classifications ?? []}
                    currentClubId={viewerTeamId}
                    viewerClubFamilyIds={viewerTeamIds}
                    onOpenTeamProfile={openTeamProfileFromRaceInfo}
                    onOpenRiderProfile={openRiderProfileFromRaceInfo}
                  />
                ) : (
                  <StagePointResultsTable
                    rows={stagePointRows}
                    view={stagePointAggregateView}
                    participantTeams={participantTeams}
                    currentClubId={viewerTeamId}
                    viewerClubFamilyIds={viewerTeamIds}
                    onOpenTeamProfile={openTeamProfileFromRaceInfo}
                    onOpenRiderProfile={openRiderProfileFromRaceInfo}
                  />
                )
              )}
            </div>
          </div>

          <CollapsibleRaceSection
            eyebrow="Race rewards"
            title="Prize money and international points"
            description="Prize money, team points, and rider points generated by the race engine."
            defaultOpen={false}
          >
            <RaceRewardsTotalsPanel
              raceId={race.id}
              viewerTeamId={viewerTeamId}
            />
          </CollapsibleRaceSection>
        </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

function RaceClassificationTable({
  rows,
  view,
  participantTeams,
  currentClubId,
  viewerClubFamilyIds,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  rows: RaceClassificationRow[]
  view: ClassificationView
  participantTeams: RaceParticipantTeam[]
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  onOpenTeamProfile: (teamId: string) => void
  onOpenRiderProfile: (riderId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
        No classification data available for this view.
      </div>
    )
  }

  const isPointsView = view === 'points' || view === 'mountain'
  const columnCount = isPointsView ? 4 : 5
  const viewerTeamId = getViewerTeamId(currentClubId)
  const viewerTeamIds = getViewerTeamIds(viewerTeamId, viewerClubFamilyIds)
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamIds)
  const participantRiderById = new Map(
    participantTeams.flatMap((team) =>
      team.riders.map(
        (rider) => [rider.rider_id, rider] as const
      )
    )
  )
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) => {
      if (row.entity_type === 'team') {
        return isViewerTeamRow(row, viewerTeamIds)
      }

      return Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamIds)
      )
    },
    15
  )

  const getFullClassificationRiderName = (row: RaceClassificationRow): string => {
    const participantRider = row.rider_id
      ? participantRiderById.get(row.rider_id)
      : null

    return (
      participantRider?.rider_full_name?.trim() ||
      row.display_name_snapshot?.trim() ||
      participantRider?.rider_name_snapshot?.trim() ||
      '—'
    )
  }

  const renderLinkedRiderName = (row: RaceClassificationRow) => {
    const label = getFullClassificationRiderName(row)

    if (!row.rider_id) {
      return <span className={RESULT_RIDER_NAME_ONE_LINE_CLASS}>{label}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenRiderProfile(row.rider_id as string)}
        className={RESULT_RIDER_NAME_ONE_LINE_CLASS}
        title={label}
      >
        {label}
      </button>
    )
  }

  const renderLinkedTeamName = (teamId?: string | null, label?: string | null) => (
    <ResultTeamJerseyCell
      teamId={teamId}
      teamName={label}
      participantTeams={participantTeams}
      onOpenTeamProfile={onOpenTeamProfile}
    />
  )

  const renderRow = (row: RaceClassificationRow) => (
    <tr
      key={`${row.classification_type}-${row.entity_type}-${row.rank}-${row.rider_id ?? row.team_id ?? row.display_name_snapshot}`}
      className={`${viewerTeamRowClass(row, viewerTeamIds)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
        {row.entity_type === 'team'
          ? renderLinkedTeamName(row.team_id, row.display_name_snapshot)
          : renderLinkedRiderName(row)}
      </td>

      <td className="max-w-0 px-2 py-1.5 text-slate-500">
        {row.entity_type === 'team'
          ? '—'
          : renderLinkedTeamName(row.team_id, row.team_name_snapshot)}
      </td>

      <td className="px-3 py-3 text-right font-semibold text-slate-900">
        {isPointsView
          ? formatResultPoints(row.points)
          : formatRaceClock(row.total_time_seconds)}
      </td>

      {!isPointsView ? (
        <td className="px-3 py-3 text-right text-slate-500">
          {formatClassificationGap(row.gap_seconds)}
        </td>
      ) : null}
    </tr>
  )

  return (
    <div className="mt-4 overflow-x-auto rounded-xl bg-white">
      <table className="min-w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[8%]" />
          <col className={isPointsView ? 'w-[40%]' : 'w-[37%]'} />
          <col className={isPointsView ? 'w-[35%]' : 'w-[32%]'} />
          <col className={isPointsView ? 'w-[17%]' : 'w-[16%]'} />
          {!isPointsView ? <col className="w-[7%]" /> : null}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">{view === 'team' ? 'Team' : 'Rider'}</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3 text-right">
              {isPointsView ? 'Points' : 'Time'}
            </th>
            {!isPointsView ? (
              <th className="px-3 py-3 text-right">Gap</th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {topRows.map(renderRow)}

          {extraUserRows.length > 0 ? (
            <EllipsisTableRow colSpan={columnCount} />
          ) : null}

          {extraUserRows.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}

function StageResultsTable({
  rows,
  participantTeams,
  classificationRows,
  currentClubId,
  viewerClubFamilyIds,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  rows: RaceStageResultRow[]
  participantTeams: RaceParticipantTeam[]
  classificationRows?: RaceClassificationRow[]
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  onOpenTeamProfile: (teamId: string) => void
  onOpenRiderProfile: (riderId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
        No stage result data available.
      </div>
    )
  }

  const participantRiderById = new Map(
    participantTeams.flatMap((team) =>
      team.riders.map(
        (rider) => [rider.rider_id, rider] as const
      )
    )
  )

  const classificationRiderNameById = new Map<string, string>()

  for (const classificationRow of classificationRows ?? []) {
    const riderId = classificationRow.rider_id?.trim()
    const displayName = classificationRow.display_name_snapshot?.trim()

    if (!riderId || !displayName) continue

    const existingName = classificationRiderNameById.get(riderId)

    /*
     * Stage-result rows often only contain short snapshots such as
     * "G. Peeters". The classification payload, however, already has
     * the full display name for the same rider on the same race/stage.
     * Prefer that full-name source so non-user riders are not stuck with
     * initial-only names in the Stage Results table.
     */
    if (!existingName || displayName.length > existingName.length) {
      classificationRiderNameById.set(riderId, displayName)
    }
  }

  function getFullStageResultRiderName(
    row: RaceStageResultRow
  ): string {
    const participantRider = row.rider_id
      ? participantRiderById.get(row.rider_id)
      : null

    const classificationFullName = row.rider_id
      ? classificationRiderNameById.get(row.rider_id)
      : null

    return (
      classificationFullName?.trim() ||
      row.full_name?.trim() ||
      row.rider_full_name?.trim() ||
      participantRider?.rider_full_name?.trim() ||
      row.display_name?.trim() ||
      row.rider_name?.trim() ||
      participantRider?.rider_name_snapshot?.trim() ||
      row.rider_name_snapshot?.trim() ||
      '—'
    )
  }

  const sortedRows = sortRankedRows(rows)
  const winnerElapsedSeconds = (() => {
    const winner = sortedRows.find(
      (row) => row.elapsed_seconds !== null && row.elapsed_seconds !== undefined
    )
    const parsed = Number(winner?.elapsed_seconds)

    return Number.isFinite(parsed) ? parsed : null
  })()
  const viewerTeamId = getViewerTeamId(currentClubId)
  const viewerTeamIds = getViewerTeamIds(viewerTeamId, viewerClubFamilyIds)
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamIds)
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) =>
      Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamIds)
      ),
    15
  )

  const renderLinkedStageResultRiderName = (row: RaceStageResultRow) => {
    const label = getFullStageResultRiderName(row)

    if (!row.rider_id) {
      return <span className={RESULT_RIDER_NAME_ONE_LINE_CLASS}>{label}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenRiderProfile(row.rider_id as string)}
        className={RESULT_RIDER_NAME_ONE_LINE_CLASS}
        title={label}
      >
        {label}
      </button>
    )
  }

  const renderLinkedStageResultTeamName = (row: RaceStageResultRow) => (
    <ResultTeamJerseyCell
      teamId={row.team_id}
      teamName={row.team_name_snapshot}
      participantTeams={participantTeams}
      onOpenTeamProfile={onOpenTeamProfile}
    />
  )

  const renderRow = (row: RaceStageResultRow) => (
    <tr
      key={`${row.rank}-${row.rider_id}`}
      className={`${viewerTeamRowClass(row, viewerTeamIds)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
        {renderLinkedStageResultRiderName(row)}
      </td>

      <td className="max-w-0 px-2 py-1.5 text-slate-500">
        {renderLinkedStageResultTeamName(row)}
      </td>

      <td className="px-3 py-3 text-right">
        <div className="font-semibold text-slate-900">
          {formatStageResultTime(row, winnerElapsedSeconds)}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="mt-4 overflow-x-auto rounded-xl bg-white">
      <table className="min-w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[44%]" />
          <col className="w-[36%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Rider</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3 text-right">Time</th>
          </tr>
        </thead>

        <tbody>
          {topRows.map(renderRow)}

          {extraUserRows.length > 0 ? <EllipsisTableRow colSpan={4} /> : null}

          {extraUserRows.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}

function StagePointResultsTable({
  rows,
  view,
  participantTeams,
  currentClubId,
  viewerClubFamilyIds,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  rows: AggregatedStagePointResultRow[]
  view: StagePointAggregateView
  participantTeams: RaceParticipantTeam[]
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  onOpenTeamProfile: (teamId: string) => void
  onOpenRiderProfile: (riderId: string) => void
}) {
  const label = view === 'mountain' ? 'mountain point' : 'sprint point'

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
        No {label} data available for this stage.
      </div>
    )
  }

  const showBonus = view === 'sprint'
  const columnCount = showBonus ? 5 : 4
  const viewerTeamId = getViewerTeamId(currentClubId)
  const viewerTeamIds = getViewerTeamIds(viewerTeamId, viewerClubFamilyIds)
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamIds)
  const participantRiderById = new Map(
    participantTeams.flatMap((team) =>
      team.riders.map(
        (rider) => [rider.rider_id, rider] as const
      )
    )
  )
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) =>
      Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamIds)
      ),
    15
  )

  const getFullPointRiderName = (row: AggregatedStagePointResultRow): string => {
    const participantRider = row.rider_id
      ? participantRiderById.get(row.rider_id)
      : null

    return (
      participantRider?.rider_full_name?.trim() ||
      row.rider_name_snapshot?.trim() ||
      participantRider?.rider_name_snapshot?.trim() ||
      '—'
    )
  }

  const renderLinkedPointRiderName = (row: AggregatedStagePointResultRow) => {
    const label = getFullPointRiderName(row)

    if (!row.rider_id) {
      return <span className={RESULT_RIDER_NAME_ONE_LINE_CLASS}>{label}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenRiderProfile(row.rider_id as string)}
        className={RESULT_RIDER_NAME_ONE_LINE_CLASS}
        title={label}
      >
        {label}
      </button>
    )
  }

  const renderLinkedPointTeamName = (row: AggregatedStagePointResultRow) => (
    <ResultTeamJerseyCell
      teamId={row.team_id}
      teamName={row.team_name_snapshot}
      participantTeams={participantTeams}
      onOpenTeamProfile={onOpenTeamProfile}
    />
  )

  const renderRow = (row: AggregatedStagePointResultRow) => (
    <tr
      key={`${view}-${row.rank}-${row.rider_id ?? row.rider_name_snapshot}`}
      className={`${viewerTeamRowClass(row, viewerTeamIds)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
        {renderLinkedPointRiderName(row)}
      </td>

      <td className="max-w-0 px-2 py-1.5 text-slate-500">
        {renderLinkedPointTeamName(row)}
      </td>

      <td className="px-3 py-3 text-right font-semibold text-slate-900">
        {row.points_awarded}
      </td>

      {showBonus ? (
        <td className="px-3 py-3 text-right text-slate-500">
          {row.bonus_seconds_awarded > 0 ? `${row.bonus_seconds_awarded}s` : '—'}
        </td>
      ) : null}
    </tr>
  )

  return (
    <div className="mt-4 overflow-x-auto rounded-xl bg-white">
      <table className="min-w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[8%]" />
          <col className={showBonus ? 'w-[38%]' : 'w-[44%]'} />
          <col className={showBonus ? 'w-[34%]' : 'w-[32%]'} />
          <col className={showBonus ? 'w-[10%]' : 'w-[16%]'} />
          {showBonus ? <col className="w-[10%]" /> : null}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Rider</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3 text-right">Pts</th>
            {showBonus ? (
              <th className="px-3 py-3 text-right">Bonus</th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {topRows.map(renderRow)}

          {extraUserRows.length > 0 ? (
            <EllipsisTableRow colSpan={columnCount} />
          ) : null}

          {extraUserRows.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}

type BackendStageProfilePoint = {
  km: number
  elevation: number
}

type StageRouteMarker = {
  type: string
  km: number
  label: string
  category?: string | null
}

type StageProfileDetailItem = Record<string, JsonValue>

type StageProfileDetailPayload = {
  stage_id: string
  race_id: string
  stage_number: number
  stage_title: string | null
  route_label: string | null
  stage_summary: string | null
  weather_summary: string | null
  weather_snapshot: JsonObject | null
  stage_weather?: JsonObject | null
  distance_km: number | null
  elevation_gain_m: number | null
  terrain_type: string | null
  profile_type: string | null
  terrain_split: {
    flat?: number
    hilly?: number
    mountain?: number
    cobbled?: number
  } | null
  profile_points: BackendStageProfilePoint[]
  route_markers: StageRouteMarker[]
  intermediate_sprints: StageProfileDetailItem[]
  mountain_climbs: StageProfileDetailItem[]
  has_profile: boolean
}

function normalizeStageProfilePoint(value: unknown): BackendStageProfilePoint | null {
  const point = getRecord(value)
  const km = Number(point.km)
  const elevation = Number(point.elevation ?? point.elevation_m)

  if (!Number.isFinite(km) || !Number.isFinite(elevation)) return null

  return { km, elevation }
}

function normalizeStageRouteMarker(value: unknown): StageRouteMarker | null {
  const marker = getRecord(value)
  const km = Number(marker.km)

  if (!Number.isFinite(km)) return null

  const categoryValue =
    typeof marker.category === 'string' && marker.category.trim()
      ? marker.category.trim()
      : typeof marker.kom_category === 'string' && marker.kom_category.trim()
        ? marker.kom_category.trim()
        : typeof marker.climb_category === 'string' && marker.climb_category.trim()
          ? marker.climb_category.trim()
          : null

  return {
    type: typeof marker.type === 'string' ? marker.type.toLowerCase() : 'marker',
    km,
    label:
      typeof marker.label === 'string' && marker.label.trim()
        ? marker.label
        : typeof marker.type === 'string'
          ? humanizeCode(marker.type)
          : 'Marker',
    category: categoryValue,
  }
}

function normalizeStageProfileDetailPayload(value: unknown): StageProfileDetailPayload {
  const record = getRecord(value)
  const terrainSplit = getRecord(record.terrain_split)
  const stageWeather = getRecord(record.stage_weather)

  return {
    stage_id: typeof record.stage_id === 'string' ? record.stage_id : '',
    race_id: typeof record.race_id === 'string' ? record.race_id : '',
    stage_number: Number.isFinite(Number(record.stage_number)) ? Number(record.stage_number) : 0,
    stage_title: typeof record.stage_title === 'string' ? record.stage_title : null,
    route_label: typeof record.route_label === 'string' ? record.route_label : null,
    stage_summary: typeof record.stage_summary === 'string' ? record.stage_summary : null,
    weather_summary: typeof record.weather_summary === 'string' ? record.weather_summary : null,
    weather_snapshot: getRecord(record.weather_snapshot) as JsonObject,
    stage_weather: Object.keys(stageWeather).length
      ? (stageWeather as JsonObject)
      : null,
    distance_km: Number.isFinite(Number(record.distance_km)) ? Number(record.distance_km) : null,
    elevation_gain_m: Number.isFinite(Number(record.elevation_gain_m))
      ? Number(record.elevation_gain_m)
      : null,
    terrain_type: typeof record.terrain_type === 'string' ? record.terrain_type : null,
    profile_type: typeof record.profile_type === 'string' ? record.profile_type : null,
    terrain_split: Object.keys(terrainSplit).length
      ? {
          flat: Number.isFinite(Number(terrainSplit.flat)) ? Number(terrainSplit.flat) : 0,
          hilly: Number.isFinite(Number(terrainSplit.hilly)) ? Number(terrainSplit.hilly) : 0,
          mountain: Number.isFinite(Number(terrainSplit.mountain)) ? Number(terrainSplit.mountain) : 0,
          cobbled: Number.isFinite(Number(terrainSplit.cobbled)) ? Number(terrainSplit.cobbled) : 0,
        }
      : null,
    profile_points: arrayOrEmpty<unknown>(record.profile_points)
      .map(normalizeStageProfilePoint)
      .filter((point): point is BackendStageProfilePoint => point !== null)
      .sort((a, b) => a.km - b.km),
    route_markers: arrayOrEmpty<unknown>(record.route_markers)
      .map(normalizeStageRouteMarker)
      .filter((marker): marker is StageRouteMarker => marker !== null)
      .sort((a, b) => a.km - b.km),
    intermediate_sprints: arrayOrEmpty<StageProfileDetailItem>(record.intermediate_sprints),
    mountain_climbs: arrayOrEmpty<StageProfileDetailItem>(record.mountain_climbs),
    has_profile: Boolean(record.has_profile),
  }
}


function formatProfileDetailValue(value: JsonValue | number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'

  if (Array.isArray(value)) {
    return value.length ? value.map((entry) => formatProfileDetailValue(entry)).join(' / ') : '—'
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, JsonValue>)
    return entries.length
      ? entries.map(([key, entryValue]) => `${humanizeCode(key)}: ${formatProfileDetailValue(entryValue)}`).join(' · ')
      : '—'
  }

  return String(value)
}

function formatPointsSchemeLabel(value: JsonValue | undefined): string {
  if (!Array.isArray(value) || value.length === 0) return '—'

  return value.map((entry) => formatProfileDetailValue(entry)).join(' / ')
}

function hasConfiguredPointValues(value: JsonValue | undefined): boolean {
  return Array.isArray(value) && value.length > 0
}

const DEFAULT_FINISH_POINTS_SCHEME: JsonValue[] = [25, 20, 16, 14, 12, 10, 8, 6, 4, 2]
const DEFAULT_TIME_TRIAL_FINISH_POINTS_SCHEME: JsonValue[] = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1]
const DEFAULT_FINISH_TIME_BONUSES: JsonValue[] = [10, 6, 4]

function StagePointCard({
  title,
  subtitle,
  points,
  bonuses,
  variant,
}: {
  title: string
  subtitle: string
  points: JsonValue | undefined
  bonuses: JsonValue | undefined
  variant: 'sprint' | 'mountain'
}) {
  const isSprint = variant === 'sprint'

  return (
    <div
      className={`flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
        isSprint
          ? 'border-green-200 bg-green-50/60'
          : 'border-red-200 bg-red-50/60'
      }`}
    >
      <div className="min-w-0">
        <div className="font-semibold text-slate-950">{title}</div>
        <div className="mt-1 text-slate-600">{subtitle}</div>
      </div>

      <div className="min-w-[220px] text-right text-slate-600">
        <div>
          <span className="font-medium text-slate-500">Points: </span>
          {formatPointsSchemeLabel(points)}
        </div>

        {hasConfiguredPointValues(bonuses) ? (
          <div className="mt-1">
            <span className="font-medium text-slate-500">Time bonuses: </span>
            {formatPointsSchemeLabel(bonuses)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type SprintStagePoint = StageProfileDetailItem & {
  pointType: 'sprint'
  sortKm: number
  sortIndex: number
}

type KOMStagePoint = StageProfileDetailItem & {
  pointType: 'kom'
  sortKm: number
  sortIndex: number
}

function SprintCard({ sprint }: { sprint: SprintStagePoint }) {
  return (
    <StagePointCard
      variant="sprint"
      title={`Sprint ${formatProfileDetailValue(sprint['number'])}`}
      subtitle={`km ${formatProfileDetailValue(sprint['km'])}`}
      points={sprint['points_scheme']}
      bonuses={sprint['time_bonus_seconds']}
    />
  )
}

function KOMCard({ climb }: { climb: KOMStagePoint }) {
  const name = formatProfileDetailValue(climb['name'])
  const category = formatProfileDetailValue(climb['category'])
  const km = formatProfileDetailValue(climb['km'])
  const lengthKm = formatProfileDetailValue(climb['length_km'])
  const avgGradient = formatProfileDetailValue(climb['avg_gradient'])

  return (
    <StagePointCard
      variant="mountain"
      title={`${name} · ${category}`}
      subtitle={`km ${km}${lengthKm !== '—' ? ` · ${lengthKm} km` : ''}${
        avgGradient !== '—' ? ` at ${avgGradient}%` : ''
      }`}
      points={climb['points_scheme']}
      bonuses={climb['time_bonus_seconds']}
    />
  )
}

function getProfileDetailNumber(
  item: StageProfileDetailItem | null | undefined,
  key: string
): number | null {
  const value = item?.[key]

  if (typeof value !== 'number' && typeof value !== 'string') return null

  return asNumber(value)
}

function getProfileDetailBoolean(
  item: StageProfileDetailItem | null | undefined,
  key: string
): boolean {
  const value = item?.[key]

  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  return false
}

const isSameKm = (a: unknown, b: unknown) =>
  Math.abs(Number(a) - Number(b)) < 0.11

function getFinishClimb(
  mountainClimbs: StageProfileDetailItem[],
  finishKm: number | null
): StageProfileDetailItem | null {
  const markedFinishClimb = mountainClimbs.find((climb) =>
    getProfileDetailBoolean(climb, 'is_finish_climb')
  )

  if (markedFinishClimb) return markedFinishClimb

  if (finishKm === null) return null

  return (
    mountainClimbs.find((climb) => {
      const climbKm = getProfileDetailNumber(climb, 'km')
      return climbKm !== null && Math.abs(climbKm - finishKm) <= 0.2
    }) ?? null
  )
}

function StageFinishPointCard({
  isMountainFinish,
  finishKm,
  finishPoint,
  finishClimb,
  suppressTimeBonuses = false,
  allowDefaultFinishPoints = true,
  defaultFinishPointsScheme = DEFAULT_FINISH_POINTS_SCHEME,
}: {
  isMountainFinish: boolean
  finishKm: number | string | null | undefined
  finishPoint?: RaceStagePoint | null
  finishClimb?: StageProfileDetailItem | null
  suppressTimeBonuses?: boolean
  allowDefaultFinishPoints?: boolean
  defaultFinishPointsScheme?: JsonValue[]
}) {
  const configuredFinishBonuses = finishPoint?.time_bonus_seconds
  const finishPointBonuses = suppressTimeBonuses
    ? []
    : configuredFinishBonuses ?? DEFAULT_FINISH_TIME_BONUSES
  const configuredFinishPoints = finishPoint?.points_scheme
  const finishPoints = allowDefaultFinishPoints
    ? configuredFinishPoints ?? defaultFinishPointsScheme
    : configuredFinishPoints ?? []

  if (isMountainFinish) {
    const climbName = formatProfileDetailValue(finishClimb?.['name'])
    const category = formatProfileDetailValue(finishClimb?.['category'])
    const lengthKm = formatProfileDetailValue(finishClimb?.['length_km'])
    const avgGradient = formatProfileDetailValue(finishClimb?.['avg_gradient'])
    const titleDetails = [climbName, category]
      .filter((value) => value && value !== '—')
      .join(' · ')

    return (
      <div className="flex w-full items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm">
        <div className="min-w-0">
          <div className="font-semibold text-slate-950">
            {titleDetails ? `🏁 Mountain finish · ${titleDetails}` : '🏁 Mountain finish'}
          </div>

          <div className="mt-1 text-slate-600">
            km {formatProfileDetailValue(finishKm)}
            {lengthKm !== '—' ? ` · ${lengthKm} km` : ''}
            {avgGradient !== '—' ? ` at ${avgGradient}%` : ''}
          </div>
        </div>

        <div className="min-w-[260px] text-right text-slate-600">
          <div>
            <span className="font-medium text-slate-500">Mountain classification: </span>
            {formatPointsSchemeLabel(finishClimb?.['points_scheme'])}
          </div>

          {hasConfiguredPointValues(finishPointBonuses) ? (
            <div className="mt-1">
              <span className="font-medium text-slate-500">GC time bonuses: </span>
              {formatPointsSchemeLabel(finishPointBonuses)}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full items-start justify-between gap-4 rounded-2xl border border-green-200 bg-green-50/60 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-semibold text-slate-950">🏁 Finish sprint</div>
        <div className="mt-1 text-slate-600">km {formatProfileDetailValue(finishKm)}</div>
      </div>

      <div className="min-w-[260px] text-right text-slate-600">
        {hasConfiguredPointValues(finishPoints) ? (
          <div>
            <span className="font-medium text-slate-500">Points classification finish: </span>
            {formatPointsSchemeLabel(finishPoints)}
          </div>
        ) : null}

        {hasConfiguredPointValues(finishPointBonuses) ? (
          <div className="mt-1">
            <span className="font-medium text-slate-500">GC time bonuses: </span>
            {formatPointsSchemeLabel(finishPointBonuses)}
          </div>
        ) : null}
      </div>
    </div>
  )
}


const STAGE_PROFILE_CHART_MARKER_TYPES = new Set([
  'start',
  'finish',
  'sprint',
  'kom',
  'climb',
  'mountain_climb',
])

type StageProfileChartMarker = StageRouteMarker & {
  chartType: string
  chartLabel: string
}

function getNormalizedChartMarkerType(marker: StageRouteMarker): string {
  return marker.type?.toLowerCase() ?? ''
}

function getClimbCategoryLabel(
  marker: StageRouteMarker,
  mountainClimbs: StageProfileDetailItem[]
): string {
  const matchingClimb = mountainClimbs.find((climb) => {
    const climbKm = getProfileDetailNumber(climb, 'km')
    return climbKm !== null && isSameKm(climbKm, marker.km)
  })
  const climbCategory = formatProfileDetailValue(matchingClimb?.['category'])
  const category =
    climbCategory && climbCategory !== '—'
      ? climbCategory
      : marker.category?.trim()

  if (category) {
    const normalizedCategory = category.toUpperCase()

    if (normalizedCategory === 'HC') return 'HC'

    const categoryMatch = category.match(/^cat(?:egory)?\s*(HC|\d+)$/i)
    if (categoryMatch) {
      const rawCategory = categoryMatch[1].toUpperCase()
      return rawCategory === 'HC' ? 'HC' : `Cat ${rawCategory}`
    }

    if (/^\d+$/.test(category)) return `Cat ${category}`

    return category
  }

  const label = marker.label?.trim() ?? ''
  const catMatch = label.match(/(?:cat(?:egory)?\s*)?(HC|[1-4])\b/i)

  if (!catMatch) return 'KOM'

  const rawCategory = catMatch[1].toUpperCase()
  return rawCategory === 'HC' ? 'HC' : `Cat ${rawCategory}`
}

function buildStageProfileChartMarkers(
  markers: StageRouteMarker[],
  mountainClimbs: StageProfileDetailItem[] = []
): StageProfileChartMarker[] {
  let sprintCount = 0

  return markers
    .filter((marker) => {
      const type = marker.type?.toLowerCase()
      return STAGE_PROFILE_CHART_MARKER_TYPES.has(type ?? '')
    })
    .map((marker) => {
      const chartType = getNormalizedChartMarkerType(marker)

      if (chartType === 'start') {
        return { ...marker, chartType, chartLabel: 'Start' }
      }

      if (chartType === 'finish') {
        return { ...marker, chartType, chartLabel: 'Finish' }
      }

      if (chartType === 'sprint') {
        sprintCount += 1
        return { ...marker, chartType, chartLabel: `Sprint ${sprintCount}` }
      }

      return { ...marker, chartType, chartLabel: getClimbCategoryLabel(marker, mountainClimbs) }
    })
}

function StageProfileChart({
  points,
  markers,
  distanceKm,
  terrainType,
  mountainClimbs = [],
  replayProgressPercent = null,
}: {
  points: BackendStageProfilePoint[]
  markers: StageRouteMarker[]
  distanceKm: number
  terrainType?: string | null
  mountainClimbs?: StageProfileDetailItem[]
  replayProgressPercent?: number | null
}) {
  if (!points.length || !distanceKm) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
        Stage profile chart is not available yet.
      </div>
    )
  }

  const normalizedPoints: StageProfilePoint[] = points.map((point) => ({
    km: Number(point.km),
    elevation_m: Number(point.elevation),
  }))

  const width = 920
  const height = 320
  const padding = { top: 38, right: 18, bottom: 52, left: 70 }
  const safeDistanceKm = Math.max(1, Number(distanceKm))
  const innerHeight = height - padding.top - padding.bottom
  const innerWidth = width - padding.left - padding.right
  const pathPayload = buildStageProfilePath(
    normalizedPoints,
    width,
    height,
    padding,
    terrainType
  )

  if (!pathPayload) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
        Stage profile chart is not available yet.
      </div>
    )
  }

  const parsed = JSON.parse(pathPayload) as {
    linePath: string
    areaPath: string
    coordinates: Array<{ x: number; y: number; km: number; elevation_m: number }>
    minElevation: number
    maxElevation: number
  }

  const rawTickValues = getElevationTickValues(parsed.minElevation, parsed.maxElevation)
  const targetLineCount = 5
  const stepIndex = Math.max(1, Math.ceil(rawTickValues.length / targetLineCount))
  const tickValues = rawTickValues.filter((_, index) => index % stepIndex === 0)
  const minKm = 0
  const maxKm = safeDistanceKm

  const xForKm = (km: number) => {
    const clampedKm = Math.max(minKm, Math.min(maxKm, Number(km)))
    return padding.left + ((clampedKm - minKm) / Math.max(maxKm - minKm, 1)) * innerWidth
  }

  const yForElevation = (elevation: number) =>
    padding.top +
    innerHeight -
    ((Number(elevation) - parsed.minElevation) / Math.max(parsed.maxElevation - parsed.minElevation, 1)) *
      innerHeight

  const filteredChartMarkers = buildStageProfileChartMarkers(markers, mountainClimbs)
  const chartMarkers = filteredChartMarkers.length
    ? filteredChartMarkers
    : buildStageProfileChartMarkers([
        { type: 'start', km: 0, label: 'Start' },
        { type: 'finish', km: safeDistanceKm, label: 'Finish' },
      ])

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        {tickValues.map((tick) => {
          const y = yForElevation(tick)
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#64748b"
              >
                {tick} m
              </text>
            </g>
          )
        })}

        <path d={parsed.areaPath} fill="rgba(250, 204, 21, 0.55)" />
        <path d={parsed.linePath} fill="none" stroke="#334155" strokeWidth="3" />

        {replayProgressPercent !== null ? (
          <g aria-label={`Replay progress ${Math.round(replayProgressPercent)} percent`}>
            <line
              x1={xForKm((safeDistanceKm * Math.max(0, Math.min(100, replayProgressPercent))) / 100)}
              y1={padding.top + 6}
              x2={xForKm((safeDistanceKm * Math.max(0, Math.min(100, replayProgressPercent))) / 100)}
              y2={height - padding.bottom}
              stroke="#2563eb"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.95"
            />
          </g>
        ) : null}

        {chartMarkers.map((marker, index) => {
          const x = xForKm(Number(marker.km))
          const markerType = marker.chartType
          const isFinish = markerType === 'finish'
          const isSprint = markerType === 'sprint'
          const isKom =
            markerType === 'kom' ||
            markerType === 'climb' ||
            markerType === 'mountain_climb'
          const fill = isFinish ? '#2563eb' : isSprint ? '#22c55e' : isKom ? '#ef4444' : '#64748b'

          return (
            <g key={`${marker.type}-${marker.km}-${index}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke={fill}
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <rect
                x={x - 28}
                y={padding.top - 24}
                width="56"
                height="20"
                rx="10"
                fill={fill}
              />
              <text
                x={x}
                y={padding.top - 10}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="white"
              >
                {marker.chartLabel}
              </text>

              <text
                x={x}
                y={height - 14}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#334155"
              >
                {Number(marker.km).toFixed(Number(marker.km) % 1 === 0 ? 0 : 1)} km
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}


function userTeamParticipatedInRace(
  participantTeams: RaceParticipantTeam[],
  viewerTeamIds?: ViewerTeamIdSource
): boolean {
  const viewerIds = normalizeViewerTeamIds(viewerTeamIds)
  if (viewerIds.size === 0) return false

  return participantTeams.some((team) => isViewerTeamRow(team, viewerIds))
}

function isStageStartReached(
  stage: RaceStage | null,
  currentGameDate?: string | null
): boolean {
  if (!stage?.stage_date) return false

  const stageDate = parseDateOnly(stage.stage_date)
  if (!stageDate) return false

  if (currentGameDate) {
    const currentDate = parseDateOnly(currentGameDate)
    if (!currentDate) return false

    return currentDate >= stageDate
  }

  const stageRealDate = new Date(`${stage.stage_date}T00:00:00`)
  if (Number.isNaN(stageRealDate.getTime())) return false

  return new Date() >= stageRealDate
}

const RIO_TOUR_INTEGRATION_STAGE_COUNT = 6

/**
 * Temporary frontend-only integration gate for the six-stage Rio Tour test.
 *
 * This deliberately does not depend on hostname, build mode, stage status or
 * stored replay results. It changes only Watch-button access in this page and
 * performs no database mutation. Remove or set to false after the six-stage
 * integration review is complete.
 */
const ENABLE_RIO_TOUR_INTEGRATION_REPLAYS = true

function isRioTourDevelopmentReplayUnlocked(
  race: Race | null,
  stage: RaceStage | null
): boolean {
  const stageNumber = Number(stage?.stage_number)
  const normalizedRaceName = String(race?.name ?? '')
    .trim()
    .toLowerCase()
  const isRioTour =
    race?.id === RIO_TOUR_RACE_ID ||
    normalizedRaceName === 'rio tour'

  return Boolean(
    ENABLE_RIO_TOUR_INTEGRATION_REPLAYS &&
      isRioTour &&
      stage &&
      Number.isInteger(stageNumber) &&
      stageNumber >= 1 &&
      stageNumber <= RIO_TOUR_INTEGRATION_STAGE_COUNT &&
      !isTimeTrialLikeStage(stage)
  )
}

type RaceReplayCoinAccess = {
  race_id: string
  coin_cost: number
  coin_balance: number
  has_coin_unlock: boolean
}

function normalizeRaceReplayCoinAccess(data: unknown): RaceReplayCoinAccess | null {
  const value = Array.isArray(data) ? data[0] : data

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const row = value as Record<string, unknown>

  return {
    race_id: String(row.race_id ?? ''),
    coin_cost: Number(row.coin_cost ?? 2),
    coin_balance: Number(row.coin_balance ?? 0),
    has_coin_unlock:
      row.has_coin_unlock === true ||
      row.has_coin_unlock === 'true' ||
      row.has_coin_unlock === 1,
  }
}

function StageReplayAccessCard({
  race,
  stage,
  currentClubId,
  viewerClubFamilyIds,
  participantTeams,
  currentGameDate,
  canViewRaceReplay,
  replayAccessLoading = false,
  onOpenReplay,
}: {
  race: Race | null
  stage: RaceStage | null
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  participantTeams: RaceParticipantTeam[]
  currentGameDate?: string | null
  canViewRaceReplay?: boolean | null
  replayAccessLoading?: boolean
  onOpenReplay: (stage: RaceStage) => void
}) {
  const [hasResults, setHasResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [coinAccess, setCoinAccess] = useState<RaceReplayCoinAccess | null>(null)
  const [coinAccessLoading, setCoinAccessLoading] = useState(false)
  const [coinPurchaseLoading, setCoinPurchaseLoading] = useState(false)
  const [coinPurchaseError, setCoinPurchaseError] = useState<string | null>(null)
  const [coinPurchaseMessage, setCoinPurchaseMessage] = useState<string | null>(null)

  const viewerTeamIds = getViewerTeamIds(currentClubId, viewerClubFamilyIds)
  const localParticipationAccess = userTeamParticipatedInRace(
    participantTeams,
    viewerTeamIds
  )
  const userParticipated = canViewRaceReplay === true || localParticipationAccess
  const developmentReplayUnlocked = isRioTourDevelopmentReplayUnlocked(race, stage)
  const hasCoinReplayUnlock = coinAccess?.has_coin_unlock === true
  const hasReplayAccess =
    developmentReplayUnlocked || userParticipated || hasCoinReplayUnlock
  const stageReached = isStageStartReached(stage, currentGameDate)
  const stageWeatherCanceled = isStageWeatherCanceled(stage)

  useEffect(() => {
    if (!stage?.id) {
      setHasResults(false)
      setLoading(false)
      return
    }

    let cancelled = false

    async function checkResults() {
      setLoading(true)

      const { count, error } = await supabase
        .from('race_stage_results')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', stage.id)

      if (cancelled) return

      setHasResults(!error && Boolean(count && count > 0))
      setLoading(false)
    }

    checkResults()

    return () => {
      cancelled = true
    }
  }, [stage?.id])

  useEffect(() => {
    if (!race?.id || userParticipated || developmentReplayUnlocked) {
      setCoinAccess(null)
      setCoinAccessLoading(false)
      setCoinPurchaseError(null)
      setCoinPurchaseMessage(null)
      return
    }

    let cancelled = false

    async function loadCoinAccess(): Promise<void> {
      setCoinAccessLoading(true)
      setCoinPurchaseError(null)

      const { data, error } = await supabase.rpc(
        'get_race_replay_coin_access_v1',
        {
          p_race_id: race.id,
        }
      )

      if (cancelled) return

      if (error) {
        console.warn('Could not load coin replay access:', error.message)
        setCoinAccess(null)
      } else {
        setCoinAccess(normalizeRaceReplayCoinAccess(data))
      }

      setCoinAccessLoading(false)
    }

    void loadCoinAccess()

    return () => {
      cancelled = true
    }
  }, [developmentReplayUnlocked, race?.id, userParticipated])

  async function purchaseReplayAccess(): Promise<void> {
    if (!race?.id || coinPurchaseLoading) return

    setCoinPurchaseLoading(true)
    setCoinPurchaseError(null)
    setCoinPurchaseMessage(null)

    try {
      const { data, error } = await supabase.rpc(
        'purchase_race_replay_access_v1',
        {
          p_race_id: race.id,
        }
      )

      if (error) throw error

      const nextAccess = normalizeRaceReplayCoinAccess(data)
      setCoinAccess(nextAccess)
      setCoinPurchaseMessage(
        `Replay unlocked for ${nextAccess?.coin_cost ?? 2} coins.`
      )

      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
    } catch (caught) {
      setCoinPurchaseError(
        caught instanceof Error
          ? caught.message
          : 'Failed to unlock this race replay.'
      )
    } finally {
      setCoinPurchaseLoading(false)
    }
  }

  const canWatch = Boolean(
    stage &&
      !stageWeatherCanceled &&
      (developmentReplayUnlocked || (hasReplayAccess && hasResults))
  )
  const checkingReplayAccess = developmentReplayUnlocked
    ? false
    : loading || replayAccessLoading || coinAccessLoading

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Live race
      </div>

      <h3 className="mt-2 text-lg font-semibold text-slate-950">
        {stageWeatherCanceled
          ? 'Stage canceled'
          : developmentReplayUnlocked
            ? 'Development stage replay'
            : hasResults
              ? 'Watch replay'
              : 'Watch race'}
      </h3>

      <p className="mt-2 text-sm leading-5 text-slate-500">
        {stageWeatherCanceled
          ? 'This stage was canceled by the race engine. No replay was generated.'
          : developmentReplayUnlocked
            ? 'Local Rio Tour integration mode uses this stage’s own profile and the shared race-simulator-v2 path. It creates no official results and writes nothing to the database.'
            : userParticipated
              ? `Your team participated in ${race?.name ?? 'this race'}, so the replay is included.`
              : hasCoinReplayUnlock
                ? `You unlocked the complete ${race?.name ?? 'race'} replay with coins.`
                : `Teams that did not participate can unlock the complete ${race?.name ?? 'race'} replay for ${coinAccess?.coin_cost ?? 2} coins.`}
      </p>

      {stageWeatherCanceled ? (
        <div className="mt-4">
          <WeatherCancellationNotice stage={stage} race={race} compact />
        </div>
      ) : null}

      {!developmentReplayUnlocked &&
      !stageWeatherCanceled &&
      hasResults &&
      !userParticipated &&
      !hasCoinReplayUnlock ? (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => void purchaseReplayAccess()}
            disabled={
              coinPurchaseLoading ||
              coinAccessLoading ||
              Number(coinAccess?.coin_balance ?? 0) <
                Number(coinAccess?.coin_cost ?? 2)
            }
            className="w-full rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-950 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {coinPurchaseLoading
              ? 'Unlocking replay…'
              : `Unlock replay · ${coinAccess?.coin_cost ?? 2} coins`}
          </button>

          <div className="text-center text-xs text-slate-500">
            Coin balance: {Number(coinAccess?.coin_balance ?? 0).toLocaleString('en-US')}
          </div>

          {coinPurchaseError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {coinPurchaseError}
            </div>
          ) : null}
        </div>
      ) : null}

      {coinPurchaseMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {coinPurchaseMessage}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canWatch || checkingReplayAccess}
        onClick={() => {
          if (stage && canWatch) onOpenReplay(stage)
        }}
        className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
          canWatch
            ? 'bg-slate-950 text-white hover:bg-slate-800'
            : 'cursor-not-allowed bg-slate-100 text-slate-400'
        }`}
      >
        {stageWeatherCanceled
          ? 'Canceled — no replay'
          : developmentReplayUnlocked
            ? 'Watch development replay'
            : checkingReplayAccess
              ? 'Checking replay…'
              : canWatch
                ? 'Watch replay'
                : !hasReplayAccess
                  ? hasResults
                    ? `Unlock for ${coinAccess?.coin_cost ?? 2} coins`
                    : 'Your team did not participate'
                  : !stageReached && !hasResults
                    ? 'Race not started'
                    : 'Replay not available yet'}
      </button>
    </div>
  )
}

type SimpleReplayStandingSource = {
  riderId: string
  riderName: string
  teamName: string
  countryCode: string | null
  finalRank: number
  finalGapSeconds: number
  finalElapsedSeconds: number | null
}

type SimpleReplayStandingRow = SimpleReplayStandingSource & {
  liveRank: number
  groupLabel: string
  liveGapSeconds: number
  freshness: number
  energy: number
  movementEnergyCost: number
  attackEnergyCost: number
  chaseEnergyCost: number
  shelterEnergySaving: number
  energyCostSincePreviousCheckpoint: number
}

type SimpleReplayComment = {
  progress: number
  title: string
  description: string
}

function normalizeRioIntegrationStageType(value: string): RoadStageType {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'mountain') return 'mountain'
  if (normalized === 'hilly') return 'hilly'

  return 'flat'
}

function inferRioIntegrationFinishType(
  stage: RaceStage,
  stageType: RoadStageType
): RoadStageFinishType {
  const finishHint = `${stage.finish_type ?? ''} ${stage.profile_type ?? ''}`
    .trim()
    .toLowerCase()

  return stageType === 'flat' &&
    (stage.stage_number === 1 || /sprint|sprinter/.test(finishHint))
    ? 'sprint'
    : 'standard'
}

function getRioIntegrationReferenceKey(
  stageNumber: number
): CanonicalRoadStageProfileKey {
  if (stageNumber === 3) return 'rio-stage-3-mountain'
  if (stageNumber === 6) return 'rio-stage-6-hilly'

  return 'rio-stage-1-flat'
}

function createRioIntegrationStageReference(
  race: Race,
  stage: RaceStage
): CanonicalRoadStageReference {
  const stageType = normalizeRioIntegrationStageType(stage.terrain_type)

  return {
    key: getRioIntegrationReferenceKey(stage.stage_number),
    raceId: race.id,
    stageId: stage.id,
    stageNumber: stage.stage_number,
    stageType,
    finishType: inferRioIntegrationFinishType(stage, stageType),
    buttonLabel: `Rio Stage ${stage.stage_number} · ${formatTerrainModelLabel(stageType)}`,
    fallbackStageTitle:
      stage.name?.trim() ||
      `Rio Tour Stage ${stage.stage_number}: ${formatStageRoute(stage)}`,
  }
}

function getSimpleReplayFallbackRows(
  participantTeams: RaceParticipantTeam[]
): SimpleReplayStandingSource[] {
  return participantTeams
    .flatMap((team) =>
      team.riders.map((rider) => ({
        riderId: rider.rider_id,
        riderName: getRaceParticipantRiderDisplayName(rider),
        teamName: getParticipantTeamName(team),
        countryCode: rider.country_code ?? rider.country_code_snapshot ?? team.country_code,
      }))
    )
    .slice(0, 40)
    .map((row, index) => ({
      ...row,
      finalRank: index + 1,
      finalGapSeconds: index === 0 ? 0 : Math.floor(index / 4) * 8,
      finalElapsedSeconds: null,
    }))
}

function getSimpleReplayResultRows(
  resultRows: RaceStageResultRow[],
  participantTeams: RaceParticipantTeam[]
): SimpleReplayStandingSource[] {
  const participantRiderLookup = new Map<
    string,
    {
      riderName: string
      teamName: string
      countryCode: string | null
    }
  >()

  participantTeams.forEach((team) => {
    team.riders.forEach((rider) => {
      participantRiderLookup.set(rider.rider_id, {
        riderName: getRaceParticipantRiderDisplayName(rider),
        teamName: getParticipantTeamName(team),
        countryCode:
          rider.country_code ??
          rider.country_code_snapshot ??
          team.country_code ??
          team.country_code_snapshot,
      })
    })
  })

  const normalizedRows = [...resultRows]
    .filter((row) => row.rider_id)
    .sort(
      (left, right) =>
        Number(left.rank ?? Number.MAX_SAFE_INTEGER) -
        Number(right.rank ?? Number.MAX_SAFE_INTEGER)
    )
    .map((row, index) => {
      const riderId = row.rider_id ?? `result-rider-${index}`
      const participant = participantRiderLookup.get(riderId)

      return {
        riderId,
        riderName:
          row.full_name?.trim() ||
          row.rider_full_name?.trim() ||
          row.display_name?.trim() ||
          row.rider_name?.trim() ||
          row.rider_name_snapshot?.trim() ||
          participant?.riderName ||
          'Unknown rider',
        teamName:
          row.team_name_snapshot?.trim() ||
          participant?.teamName ||
          'Unknown team',
        countryCode:
          row.rider_country_code ??
          row.nationality_code ??
          row.country_code ??
          participant?.countryCode ??
          null,
        finalRank: Number(row.rank ?? index + 1),
        finalGapSeconds: Math.max(0, Number(row.gap_seconds ?? 0)),
        finalElapsedSeconds:
          row.elapsed_seconds === null || row.elapsed_seconds === undefined
            ? null
            : Number(row.elapsed_seconds),
      }
    })

  return normalizedRows.length > 0
    ? normalizedRows
    : getSimpleReplayFallbackRows(participantTeams)
}

function getRoadStageReplayTeamId(team: RaceParticipantTeam): string {
  return (
    team.participating_club_id?.trim() ||
    team.club_id?.trim() ||
    team.owner_club_id?.trim() ||
    team.team_id?.trim() ||
    team.id.trim()
  )
}

function buildRealStageRiderSources(
  participantTeams: RaceParticipantTeam[]
): StagePlanSimulationRiderSource[] {
  const seenRiderIds = new Set<string>()

  return participantTeams.flatMap((team) => {
    const teamId = getRoadStageReplayTeamId(team)
    const teamName = getParticipantTeamName(team)

    return team.riders.flatMap((rider) => {
      const riderId = rider.rider_id?.trim()
      if (!riderId || seenRiderIds.has(riderId)) return []
      seenRiderIds.add(riderId)

      return [{
        riderId,
        displayName: getRaceParticipantRiderDisplayName(rider),
        teamId,
        teamName,
        overall: rider.overall_snapshot,
      }]
    })
  })
}

function buildRealStageStandingSource(
  participantTeams: RaceParticipantTeam[]
): SimpleReplayStandingSource[] {
  const seenRiderIds = new Set<string>()

  return participantTeams
    .flatMap((team) =>
      team.riders.flatMap((rider) => {
        const riderId = rider.rider_id?.trim()
        if (!riderId || seenRiderIds.has(riderId)) return []
        seenRiderIds.add(riderId)

        return [{
          riderId,
          riderName: getRaceParticipantRiderDisplayName(rider),
          teamName: getParticipantTeamName(team),
          countryCode:
            rider.country_code ??
            rider.country_code_snapshot ??
            team.country_code ??
            team.country_code_snapshot,
          startNumber:
            rider.display_start_number ?? rider.start_number ?? null,
        }]
      })
    )
    .sort(
      (left, right) =>
        Number(left.startNumber ?? Number.MAX_SAFE_INTEGER) -
          Number(right.startNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.riderName.localeCompare(right.riderName)
    )
    .map((row, index) => ({
      riderId: row.riderId,
      riderName: row.riderName,
      teamName: row.teamName,
      countryCode: row.countryCode,
      finalRank: index + 1,
      finalGapSeconds: 0,
      finalElapsedSeconds: null,
    }))
}

function buildVisibleStagePlanSources(
  preparationRows: RacePreparationSimulationRow[],
  stagePlanRows: RaceStagePlanSimulationRow[]
): StagePlanSimulationPlanSource[] {
  const preparationById = new Map(
    preparationRows.map((row) => [row.id, row] as const)
  )

  return stagePlanRows.map((row) => {
    const preparation = preparationById.get(row.race_preparation_id)

    return {
      planId: row.id,
      teamId:
        preparation?.participating_club_id?.trim() ||
        preparation?.club_id?.trim() ||
        row.race_preparation_id,
      status: row.status,
      teamTacticJson: row.team_tactic_json,
      riderRolesJson: row.rider_roles_json,
      riderIndividualTacticsJson: row.rider_individual_tactics_json,
    }
  })
}

function buildOptionBControlledStandingSource(
  availableRows: SimpleReplayStandingSource[]
): SimpleReplayStandingSource[] {
  return flatStageFixture.riders.map((fixtureRider, index) => {
    const availableRow = availableRows[index]

    if (availableRow) {
      return {
        ...availableRow,
        riderId: fixtureRider.riderId,
        finalRank: index + 1,
        finalGapSeconds: 0,
        finalElapsedSeconds: null,
      }
    }

    return {
      riderId: fixtureRider.riderId,
      riderName: fixtureRider.displayName,
      teamName: 'Controlled fixture',
      countryCode: null,
      finalRank: index + 1,
      finalGapSeconds: 0,
      finalElapsedSeconds: null,
    }
  })
}

function buildSimpleReplayStandingRows(
  rows: SimpleReplayStandingSource[],
  checkpoint: Checkpoint
): SimpleReplayStandingRow[] {
  const rowByRiderId = new Map(
    rows.map((row) => [row.riderId, row] as const)
  )
  const groupById = new Map(
    checkpoint.groups.map((group) => [group.groupId, group] as const)
  )
  const orderedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)
  const checkpointRiderIds = new Set(orderedRiderIds)
  const completeOrder = [
    ...orderedRiderIds,
    ...rows
      .map((row) => row.riderId)
      .filter((riderId) => !checkpointRiderIds.has(riderId)),
  ]

  return completeOrder.flatMap((riderId, index) => {
    const row = rowByRiderId.get(riderId)
    const riderSnapshot = checkpoint.riderSnapshots.find(
      (snapshot) => snapshot.riderId === riderId
    )
    const riderGroup = riderSnapshot
      ? groupById.get(riderSnapshot.currentGroupId)
      : null

    if (!row) return []

    return [{
      ...row,
      liveRank: index + 1,
      groupLabel:
        riderSnapshot?.currentGroupId === 'peloton-1'
          ? 'Peloton'
          : 'Breakaway',
      liveGapSeconds: Math.max(0, riderGroup?.gapSecondsToLeader ?? 0),
      freshness: riderSnapshot?.freshness ?? 0,
      energy: riderSnapshot?.energy ?? 0,
      movementEnergyCost: riderSnapshot?.movementEnergyCost ?? 0,
      attackEnergyCost: riderSnapshot?.attackEnergyCost ?? 0,
      chaseEnergyCost: riderSnapshot?.chaseEnergyCost ?? 0,
      shelterEnergySaving: riderSnapshot?.shelterEnergySaving ?? 0,
      energyCostSincePreviousCheckpoint:
        riderSnapshot?.energyCostSincePreviousCheckpoint ?? 0,
    }]
  })
}

function buildSimpleReplayComments(
  distanceKm: number,
  checkpoints: Checkpoint[],
  definition: B1RoadStageSimulationDefinition,
  inputLabel: string,
  attackEnabled: boolean
): SimpleReplayComment[] {
  const riderCount = checkpoints[0]?.riderSnapshots.length ?? 0

  return checkpoints.map((checkpoint, index) => {
    const previousCheckpoint = checkpoints[index - 1]
    const attackCreated =
      checkpoint.groups.length === 2 &&
      previousCheckpoint?.groups.length === 1
    const catchCreated =
      checkpoint.groups.length === 1 &&
      previousCheckpoint?.groups.length === 2 &&
      checkpoint.currentKm < distanceKm - 0.000001
    const controlledFinishReached =
      checkpoint.currentKm >= distanceKm - 0.000001
    const breakawayGroup = checkpoint.groups.find(
      (group) => group.groupId === definition.separateGroupMovement.breakawayGroupId
    )
    const pelotonGroup = checkpoint.groups.find(
      (group) => group.groupId === definition.separateGroupMovement.pelotonGroupId
    )
    const previousPelotonGroup = previousCheckpoint?.groups.find(
      (group) => group.groupId === definition.separateGroupMovement.pelotonGroupId
    )
    const pelotonGapSeconds = Math.max(
      0,
      pelotonGroup?.gapSecondsToLeader ?? 0
    )
    const previousPelotonGapSeconds = Math.max(
      0,
      previousPelotonGroup?.gapSecondsToLeader ?? 0
    )
    const breakawaySurvived =
      controlledFinishReached &&
      Boolean(breakawayGroup) &&
      pelotonGapSeconds > 0
    const caughtPelotonFinished =
      controlledFinishReached &&
      checkpoint.groups.length === 1 &&
      previousCheckpoint?.groups.length === 1 &&
      checkpoint.checkpointIndex > 0
    const cooperationActive =
      Boolean(breakawayGroup && pelotonGroup) &&
      checkpoint.checkpointIndex >=
        definition.groupCooperation.splitCheckpointIndex
    const chaseActive = pelotonGroup?.chaseActive === true
    const chaseStarted =
      chaseActive && previousPelotonGroup?.chaseActive !== true
    const chaseClosedGap =
      chaseActive &&
      previousPelotonGapSeconds > 0 &&
      pelotonGapSeconds < previousPelotonGapSeconds
    const breakawayAdvantage = Math.max(
      0,
      breakawayGroup?.totalGroupAdvantageKmh ?? 0
    )
    const pelotonAdvantage = Math.max(
      0,
      pelotonGroup?.totalGroupAdvantageKmh ?? 0
    )
    const averageEnergy =
      checkpoint.riderSnapshots.reduce(
        (sum, riderSnapshot) => sum + riderSnapshot.energy,
        0
      ) / Math.max(checkpoint.riderSnapshots.length, 1)
    const lowestEnergy = Math.min(
      ...checkpoint.riderSnapshots.map((riderSnapshot) => riderSnapshot.energy)
    )
    const totalAttackCost = checkpoint.riderSnapshots.reduce(
      (sum, riderSnapshot) => sum + riderSnapshot.attackEnergyCost,
      0
    )
    const totalChaseCost = checkpoint.riderSnapshots.reduce(
      (sum, riderSnapshot) => sum + (riderSnapshot.chaseEnergyCost ?? 0),
      0
    )
    const breakawayRiderIds = new Set(breakawayGroup?.riderIds ?? [])
    const pelotonRiderIds = new Set(pelotonGroup?.riderIds ?? [])
    const breakawayEnergyValues = checkpoint.riderSnapshots
      .filter((riderSnapshot) => breakawayRiderIds.has(riderSnapshot.riderId))
      .map((riderSnapshot) => riderSnapshot.energy)
    const pelotonEnergyValues = checkpoint.riderSnapshots
      .filter((riderSnapshot) => pelotonRiderIds.has(riderSnapshot.riderId))
      .map((riderSnapshot) => riderSnapshot.energy)
    const breakawayAverageEnergy =
      breakawayEnergyValues.reduce((sum, energy) => sum + energy, 0) /
      Math.max(breakawayEnergyValues.length, 1)
    const pelotonAverageEnergy =
      pelotonEnergyValues.reduce((sum, energy) => sum + energy, 0) /
      Math.max(pelotonEnergyValues.length, 1)
    const stageProgress = Math.max(
      0,
      Math.min(1, checkpoint.currentKm / Math.max(distanceKm, 1))
    )

    return {
      progress: stageProgress * 100,
      title:
        checkpoint.checkpointIndex === 0
          ? 'Initial freshness and live energy'
          : attackCreated
            ? 'Controlled attack adds an extra energy cost'
            : catchCreated
              ? 'Peloton catches the breakaway'
              : breakawaySurvived
                ? 'Breakaway survives to the finish'
                : caughtPelotonFinished
                  ? attackEnabled
                  ? 'Caught peloton reaches the finish'
                  : 'Peloton reaches the finish'
                  : chaseStarted
                    ? 'Late-stage peloton chase begins'
                    : chaseClosedGap
                      ? 'Peloton chase closes the breakaway gap'
                      : cooperationActive && pelotonGapSeconds > 0
                        ? `Energy and cooperation shape checkpoint ${checkpoint.checkpointIndex + 1}`
                        : cooperationActive
                          ? 'Drafting, cooperation and energy state applied'
                          : `Peloton energy checkpoint ${checkpoint.checkpointIndex + 1}`,
      description:
        checkpoint.checkpointIndex === 0
          ? `All ${riderCount} ${inputLabel} riders start together with live energy equal to their starting freshness. Average energy is ${averageEnergy.toFixed(1)} and the lowest rider starts at ${lowestEnergy.toFixed(1)}.`
          : attackCreated
            ? `At ${formatRaceClock(checkpoint.raceSecond)}, ${definition.controlledAttack.attackerRiderIds.length} saved-order riders attack and pay ${(definition.energyModel.attackEnergyCost ?? 0).toFixed(1)} energy each (${totalAttackCost.toFixed(1)} total). Drafting and cooperation lift the breakaway by ${breakawayAdvantage.toFixed(3)} km/h and the peloton by ${pelotonAdvantage.toFixed(3)} km/h. Breakaway average energy is ${breakawayAverageEnergy.toFixed(1)} versus ${pelotonAverageEnergy.toFixed(1)} in the peloton.`
            : catchCreated
              ? `At ${formatRaceClock(checkpoint.raceSecond)}, the peloton closes the final gap at ${checkpoint.currentKm.toFixed(3)} km. All ${riderCount} riders merge into one peloton, and the former peloton riders pay ${totalChaseCost.toFixed(1)} total chase energy during the catch interval.`
              : breakawaySurvived
                ? `At ${formatRaceClock(checkpoint.raceSecond)}, the breakaway reaches the real ${distanceKm.toFixed(0)} km finish first. Two groups remain and the peloton finishes the live checkpoint ${formatGapValue(pelotonGapSeconds)} behind.`
                : caughtPelotonFinished
                  ? attackEnabled
                    ? `At ${formatRaceClock(checkpoint.raceSecond)}, the merged ${riderCount}-rider peloton reaches the real ${distanceKm.toFixed(1)} km finish together. Deterministic final ranks, one shared finish time and zero winner gaps are now available.`
                    : `At ${formatRaceClock(checkpoint.raceSecond)}, the ${riderCount}-rider peloton reaches the real ${distanceKm.toFixed(1)} km finish without an artificial breakaway. Deterministic final ranks and one shared physical time are now available.`
                  : chaseStarted
                    ? `At ${formatRaceClock(checkpoint.raceSecond)}, the leader reaches ${(stageProgress * 100).toFixed(1)}% of the real stage. The peloton's B1 chase speed is ${((pelotonGroup?.baseSpeedBeforeChaseKmh ?? 0) + (pelotonGroup?.chaseSpeedBonusKmh ?? 0)).toFixed(3)} km/h before B2 terrain, and ${(pelotonGroup?.speedKmh ?? 0).toFixed(3)} km/h on the active terrain and pays ${totalChaseCost.toFixed(1)} extra energy in total. The gap remains ${formatGapValue(pelotonGapSeconds)} at activation.`
                    : chaseClosedGap
                      ? `At ${formatRaceClock(checkpoint.raceSecond)}, the late chase reduces the peloton deficit from ${formatGapValue(previousPelotonGapSeconds)} to ${formatGapValue(pelotonGapSeconds)}. The breakaway remains narrowly ahead, while the peloton pays another ${totalChaseCost.toFixed(1)} energy in chase effort.`
                      : cooperationActive && pelotonGapSeconds > 0
                        ? `At ${formatRaceClock(checkpoint.raceSecond)}, the breakaway reaches ${formatKm(breakawayGroup?.distanceKm)} and leads by ${formatGapValue(pelotonGapSeconds)}. Average live energy is ${breakawayAverageEnergy.toFixed(1)} in the breakaway and ${pelotonAverageEnergy.toFixed(1)} in the sheltered peloton.`
                        : cooperationActive
                          ? `At ${formatRaceClock(checkpoint.raceSecond)}, both groups remain together at the split while drafting and shelter reduce movement costs. Average energy is ${averageEnergy.toFixed(1)}.`
                          : `At ${formatRaceClock(checkpoint.raceSecond)}, all ${riderCount} riders remain together at ${formatKm(checkpoint.currentKm)}. Average live energy falls to ${averageEnergy.toFixed(1)}, with the lowest rider at ${lowestEnergy.toFixed(1)}.`,
    }
  })
}

function getSimpleReplayStagePointLabel(point: RaceStagePoint): string {
  const pointType = String(point.point_type ?? '').toUpperCase()

  if (point.name?.trim()) return point.name.trim()
  if (pointType === 'INTERMEDIATE_SPRINT') return 'Intermediate sprint'
  if (pointType === 'BONUS_SPRINT') return 'Bonus sprint'
  if (pointType === 'KOM') {
    return point.kom_category ? `KOM · Cat ${point.kom_category}` : 'KOM'
  }
  if (pointType === 'FINISH') return 'Finish sprint'

  return humanizeCode(pointType)
}

function SimpleReplayStagePointsPanel({
  pointResults,
  stagePoints,
  currentKm,
}: {
  pointResults: RacePointResultRow[]
  stagePoints: RaceStagePoint[]
  currentKm: number
}) {
  const pointOptions = useMemo(() => {
    const options = stagePoints
      .filter((point) => String(point.point_type ?? '').toUpperCase() !== 'START')
      .map((point) => {
        const km = Math.max(0, Number(point.km_from_start ?? 0))
        const categoryLabel =
          String(point.point_type ?? '').toUpperCase() === 'KOM' && point.kom_category
            ? ` · Cat ${point.kom_category}`
            : ''

        return {
          id: point.id,
          label: `${getSimpleReplayStagePointLabel(point)}${categoryLabel} · ${formatKm(km)}`,
          reached: currentKm >= km,
          sortOrder: Number(point.sort_order ?? 999),
          km,
        }
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.km - right.km
      )

    return options
  }, [currentKm, stagePoints])

  const [selectedPointId, setSelectedPointId] = useState('')

  useEffect(() => {
    const selectedStillExists = pointOptions.some(
      (point) => point.id === selectedPointId
    )

    if (selectedStillExists) return

    const firstReached = pointOptions.find((point) => point.reached)
    setSelectedPointId(firstReached?.id ?? pointOptions[0]?.id ?? '')
  }, [pointOptions, selectedPointId])

  const selectedPoint = pointOptions.find(
    (point) => point.id === selectedPointId
  )

  const rows = selectedPoint?.reached
    ? pointResults
        .filter(
          (row) =>
            row.point_id === selectedPointId &&
            row.rank !== null
        )
        .sort((left, right) => Number(left.rank ?? 999) - Number(right.rank ?? 999))
    : []

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Stage points
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Sprint, KOM and finish point winners.
          </div>
        </div>

        <select
          value={selectedPointId}
          onChange={(event) => setSelectedPointId(event.target.value)}
          className="min-w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={pointOptions.length === 0}
        >
          {pointOptions.length === 0 ? (
            <option>No stage points available</option>
          ) : (
            pointOptions.map((point) => (
              <option
                key={point.id}
                value={point.id}
                disabled={!point.reached}
              >
                {point.label}
              </option>
            ))
          )}
        </select>
      </div>

      {pointOptions.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
          This stage has no sprint, KOM, or finish point definitions.
        </div>
      ) : !selectedPoint?.reached ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
          This point has not been reached yet.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          This point has been reached, but its result rows have not been generated.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Rider</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-right">Points</th>
                <th className="px-3 py-2 text-right">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.point_id}-${row.rank}-${row.rider_id ?? row.rider_name_snapshot ?? 'row'}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-2 font-semibold">{row.rank}</td>
                  <td className="px-3 py-2">{row.rider_name_snapshot ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.team_name_snapshot ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{row.points_awarded ?? 0}</td>
                  <td className="px-3 py-2 text-right">{row.bonus_seconds_awarded ? `${row.bonus_seconds_awarded}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function B1RestoredRaceReplayPage({
  race,
  stage,
  participantTeams,
  onClose,
}: {
  race: Race
  stage: RaceStage
  participantTeams: RaceParticipantTeam[]
  onClose: () => void
}) {
  const [profile, setProfile] = useState<StageProfileDetailPayload | null>(null)
  const [profileSnapshot, setProfileSnapshot] =
    useState<CanonicalRoadStageProfileSnapshot | null>(null)
  const [resultRows, setResultRows] = useState<RaceStageResultRow[]>([])
  const [pointResults, setPointResults] = useState<RacePointResultRow[]>([])
  const [racePreparationRows, setRacePreparationRows] =
    useState<RacePreparationSimulationRow[]>([])
  const [stagePlanRows, setStagePlanRows] =
    useState<RaceStagePlanSimulationRow[]>([])
  const [inputMode, setInputMode] =
    useState<RoadStageReplayInputMode>('real_stage_orders')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [presentationRaceSeconds, setPresentationRaceSeconds] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [replayStarted, setReplayStarted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4 | 8>(1)
  const [outcomeScenario, setOutcomeScenario] =
    useState<BreakawayOutcome>('caught')

  const integrationReference = useMemo(
    () => createRioIntegrationStageReference(race, stage),
    [race, stage]
  )

  useEffect(() => {
    let cancelled = false

    async function loadReplayShellData(): Promise<void> {
      setLoading(true)
      setLoadError(null)
      setProfileSnapshot(null)

      const [
        profileResponse,
        resultsResponse,
        pointResultsResponse,
        preparationsResponse,
        stagePlansResponse,
      ] = await Promise.all([
        raceDetailReadRpc('get_race_stage_profile_detail_v1', {
          p_stage_id: stage.id,
        }),
        supabase
          .from('race_stage_results')
          .select(
            'rank,rider_id,team_id,rider_name_snapshot,team_name_snapshot,elapsed_seconds,gap_seconds,bonus_seconds,penalty_seconds,finish_points,sprint_points,mountain_points,status'
          )
          .eq('stage_id', stage.id)
          .order('rank', { ascending: true })
          .limit(200),
        raceDetailReadRpc('get_race_stage_point_results_v1', {
          p_stage_id: stage.id,
        }),
        supabase
          .from('race_preparations')
          .select('id,club_id,participating_club_id,status,startlist_status')
          .eq('race_id', race.id)
          .limit(200),
        supabase
          .from('race_stage_plans')
          .select(
            'id,race_preparation_id,race_id,stage_id,stage_number,status,team_tactic_json,rider_roles_json,rider_individual_tactics_json'
          )
          .eq('race_id', race.id)
          .limit(500),
      ])

      if (cancelled) return

      if (profileResponse.error) {
        setProfile(null)
        setProfileSnapshot(null)
      } else {
        try {
          const normalizedProfile = normalizeStageProfileDetailPayload(
            profileResponse.data
          )
          setProfile(normalizedProfile)
          setProfileSnapshot(
            createCanonicalRoadStageProfile(
              integrationReference,
              normalizedProfile
            )
          )
        } catch (caught) {
          setProfile(null)
          setProfileSnapshot(null)
          setLoadError(
            caught instanceof Error
              ? `Stage profile could not be normalized: ${caught.message}`
              : 'Stage profile could not be normalized.'
          )
        }
      }

      setResultRows(
        Array.isArray(resultsResponse.data)
          ? (resultsResponse.data as RaceStageResultRow[])
          : []
      )

      setPointResults(
        !pointResultsResponse.error && Array.isArray(pointResultsResponse.data)
          ? (pointResultsResponse.data as RacePointResultRow[])
          : []
      )

      setRacePreparationRows(
        !preparationsResponse.error && Array.isArray(preparationsResponse.data)
          ? (preparationsResponse.data as RacePreparationSimulationRow[])
          : []
      )

      setStagePlanRows(
        !stagePlansResponse.error && Array.isArray(stagePlansResponse.data)
          ? (stagePlansResponse.data as RaceStagePlanSimulationRow[]).filter(
              (row) =>
                row.stage_id === stage.id ||
                Number(row.stage_number) === Number(stage.stage_number)
            )
          : []
      )

      const errors = [
        profileResponse.error ? 'stage profile' : null,
        resultsResponse.error ? 'stage standings' : null,
        pointResultsResponse.error ? 'stage-point results' : null,
        preparationsResponse.error ? 'authorized race preparations' : null,
        stagePlansResponse.error ? 'authorized Stage Plans' : null,
      ].filter((value): value is string => Boolean(value))

      if (errors.length > 0) {
        setLoadError(
          `Some replay data could not be loaded: ${errors.join(', ')}. The page is using available fallback data.`
        )
      }

      setLoading(false)
    }

    void loadReplayShellData()

    return () => {
      cancelled = true
    }
  }, [integrationReference, race.id, stage.id])

  const fallbackDistanceKm = Math.max(
    1,
    Number(profile?.distance_km ?? stage.distance_km ?? 1)
  )

  const selectedTerrainProfile = useMemo(
    () =>
      profileSnapshot?.normalizedProfile ??
      createRoadStageProfile({
        profileId: `fallback:${stage.id}`,
        stageType: normalizeRioIntegrationStageType(stage.terrain_type),
        finishType: inferRioIntegrationFinishType(
          stage,
          normalizeRioIntegrationStageType(stage.terrain_type)
        ),
        distanceKm: fallbackDistanceKm,
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: fallbackDistanceKm, elevationM: 0 },
        ],
      }),
    [fallbackDistanceKm, profileSnapshot, stage]
  )

  const distanceKm = selectedTerrainProfile.distanceKm

  const realStageRiderSources = useMemo(
    () => buildRealStageRiderSources(participantTeams),
    [participantTeams]
  )
  const realStageStandingSource = useMemo(
    () => buildRealStageStandingSource(participantTeams),
    [participantTeams]
  )
  const visibleStagePlanSources = useMemo(
    () => buildVisibleStagePlanSources(racePreparationRows, stagePlanRows),
    [racePreparationRows, stagePlanRows]
  )

  const realStageBuild = useMemo(() => {
    try {
      return {
        value: buildStagePlanRoadStageDefinition(flatStageFixture, {
          stageId: stage.id,
          raceId: race.id,
          distanceKm,
          riders: realStageRiderSources,
          stagePlans: visibleStagePlanSources,
        }),
        error: null as string | null,
      }
    } catch (caught) {
      return {
        value: null,
        error:
          caught instanceof Error
            ? caught.message
            : 'Real stage input could not be constructed.',
      }
    }
  }, [
    distanceKm,
    race.id,
    realStageRiderSources,
    stage.id,
    visibleStagePlanSources,
  ])

  const realStageInputAvailable =
    realStageBuild.value !== null && realStageRiderSources.length >= 2
  const realStageModeActive =
    inputMode === 'real_stage_orders' && realStageInputAvailable
  const activeDefinition = realStageModeActive
    ? realStageBuild.value!.definition
    : flatStageFixture
  const activeTacticalSummary = realStageModeActive
    ? realStageBuild.value!.summary
    : null
  const activeOutcome: BreakawayOutcome = realStageModeActive
    ? activeTacticalSummary!.requestedOutcome
    : outcomeScenario
  const activeAttackEnabled = realStageModeActive
    ? activeTacticalSummary!.attackEnabled
    : true
  const activeInputLabel = realStageModeActive
    ? 'real-stage'
    : 'controlled diagnostic'

  const optionBSimulation = useMemo(
    () =>
      runB1TerrainRoadStageSimulation(
        activeDefinition,
        {
          stageId: stage.id,
          raceId: race.id,
          profile: selectedTerrainProfile,
        },
        {
          outcome: activeOutcome,
          terrainEnabled: true,
          foundationDefinition: realStageModeActive
            ? flatStageFixture
            : undefined,
        }
      ),
    [
      activeDefinition,
      activeOutcome,
      race.id,
      realStageModeActive,
      selectedTerrainProfile,
      stage.id,
    ]
  )

  const optionBStageInput = optionBSimulation.stage
  const optionBOutcomeResult = optionBSimulation.outcomeSequence
  const optionBStageResults = optionBSimulation.stageResults

  const optionBCheckpoints = optionBOutcomeResult.checkpoints

  const initialOptionBCheckpoint = optionBCheckpoints[0]
  const finalOptionBCheckpoint =
    optionBCheckpoints[optionBCheckpoints.length - 1]
  const finalOptionBRaceSeconds = finalOptionBCheckpoint.raceSecond

  useEffect(() => {
    if (!playing) return

    const intervalId = window.setInterval(() => {
      setPresentationRaceSeconds((current) => {
        const baseStep = Math.max(finalOptionBRaceSeconds / 50, 1)
        const next = Math.min(
          finalOptionBRaceSeconds,
          current + baseStep * playbackSpeed
        )

        if (next >= finalOptionBRaceSeconds) {
          window.clearInterval(intervalId)
          setPlaying(false)
        }

        return next
      })
    }, 200)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [finalOptionBRaceSeconds, playing, playbackSpeed])

  const controlledStandingSource = useMemo(
    () =>
      buildOptionBControlledStandingSource(
        getSimpleReplayResultRows(resultRows, participantTeams)
      ),
    [participantTeams, resultRows]
  )
  const standingsSource = realStageModeActive
    ? realStageStandingSource
    : controlledStandingSource

  const optionBFinalResultRows = useMemo(() => {
    const standingByRiderId = new Map(
      standingsSource.map((row) => [row.riderId, row] as const)
    )

    return optionBStageResults.results.map((result) => {
      const standing = standingByRiderId.get(result.riderId)
      const isBreakaway =
        result.finishingGroupId ===
        activeDefinition.separateGroupMovement.breakawayGroupId

      return {
        ...result,
        riderName: standing?.riderName ?? result.displayName,
        teamName: standing?.teamName ?? (realStageModeActive ? 'Race participant' : 'Controlled fixture'),
        countryCode: standing?.countryCode ?? null,
        groupBadge: isBreakaway ? 'B1' : 'P',
        groupLabel: isBreakaway ? 'Breakaway' : 'Peloton',
      }
    })
  }, [activeDefinition, optionBStageResults, realStageModeActive, standingsSource])

  const startingStandings = useMemo(() => {
    const initialSnapshotByRiderId = new Map(
      initialOptionBCheckpoint.riderSnapshots.map((snapshot) => [
        snapshot.riderId,
        snapshot,
      ])
    )

    return [...standingsSource]
      .sort((left, right) => left.riderName.localeCompare(right.riderName))
      .map((row, index) => {
        const riderSnapshot = initialSnapshotByRiderId.get(row.riderId)

        return {
          ...row,
          liveRank: index + 1,
          groupLabel: 'Peloton',
          liveGapSeconds: 0,
          freshness: riderSnapshot?.freshness ?? 0,
          energy: riderSnapshot?.energy ?? 0,
          movementEnergyCost: 0,
          attackEnergyCost: 0,
          chaseEnergyCost: 0,
          shelterEnergySaving: 0,
          energyCostSincePreviousCheckpoint: 0,
        }
      })
  }, [initialOptionBCheckpoint, standingsSource])

  const baseComments = useMemo(
    () =>
      buildSimpleReplayComments(
        optionBStageInput.distanceKm,
        optionBCheckpoints,
        activeDefinition,
        activeInputLabel,
        activeAttackEnabled
      ),
    [
      activeAttackEnabled,
      activeDefinition,
      activeInputLabel,
      optionBCheckpoints,
      optionBStageInput.distanceKm,
    ]
  )

  const reachedCheckpointArrayIndex = optionBCheckpoints.reduce(
    (reachedIndex, checkpoint, index) =>
      checkpoint.raceSecond <= presentationRaceSeconds ? index : reachedIndex,
    0
  )
  const reachedCheckpoint = optionBCheckpoints[reachedCheckpointArrayIndex]
  const nextCheckpoint =
    optionBCheckpoints[
      Math.min(reachedCheckpointArrayIndex + 1, optionBCheckpoints.length - 1)
    ]
  const checkpointSegmentSeconds = Math.max(
    0,
    nextCheckpoint.raceSecond - reachedCheckpoint.raceSecond
  )
  const checkpointSegmentRatio =
    checkpointSegmentSeconds > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (presentationRaceSeconds - reachedCheckpoint.raceSecond) /
              checkpointSegmentSeconds
          )
        )
      : 0
  const currentKm = replayStarted
    ? reachedCheckpoint.currentKm +
      (nextCheckpoint.currentKm - reachedCheckpoint.currentKm) *
        checkpointSegmentRatio
    : initialOptionBCheckpoint.currentKm
  const currentRaceSeconds = replayStarted
    ? Math.round(presentationRaceSeconds)
    : initialOptionBCheckpoint.raceSecond
  const progress = Math.max(
    0,
    Math.min(100, (currentKm / optionBStageInput.distanceKm) * 100)
  )
  const activeTerrainPhase = getTerrainPhaseAtKm(
    selectedTerrainProfile,
    Math.min(currentKm, selectedTerrainProfile.distanceKm)
  )
  const activeTerrainMultiplier = calculateTerrainSpeedMultiplier(
    activeTerrainPhase.terrainType,
    activeTerrainPhase.averageGradientPercent
  )
  const visibleComments = replayStarted
    ? baseComments.filter((comment) => comment.progress <= progress + 0.000001)
    : []

  const currentCheckpointStandings = useMemo(
    () => buildSimpleReplayStandingRows(standingsSource, reachedCheckpoint),
    [reachedCheckpoint, standingsSource]
  )
  const displayedStandings = replayStarted
    ? currentCheckpointStandings
    : startingStandings
  const displayedGroupCount = replayStarted
    ? reachedCheckpoint.groups.length
    : initialOptionBCheckpoint.groups.length
  const displayedBreakawayGroup = replayStarted
    ? reachedCheckpoint.groups.find(
        (group) =>
          group.groupId ===
          activeDefinition.separateGroupMovement.breakawayGroupId
      ) ?? null
    : null
  const displayedPelotonGroup = replayStarted
    ? reachedCheckpoint.groups.find(
        (group) =>
          group.groupId ===
          activeDefinition.separateGroupMovement.pelotonGroupId
      ) ?? null
    : initialOptionBCheckpoint.groups[0] ?? null
  const displayedGapSeconds = Math.max(
    0,
    displayedPelotonGroup?.gapSecondsToLeader ?? 0
  )
  const displayedEnergySnapshots = replayStarted
    ? reachedCheckpoint.riderSnapshots
    : initialOptionBCheckpoint.riderSnapshots
  const displayedAverageEnergy =
    displayedEnergySnapshots.reduce(
      (sum, riderSnapshot) => sum + riderSnapshot.energy,
      0
    ) / Math.max(displayedEnergySnapshots.length, 1)
  const displayedLowestEnergy = Math.min(
    ...displayedEnergySnapshots.map((riderSnapshot) => riderSnapshot.energy)
  )
  const displayedAttackCost = displayedEnergySnapshots.reduce(
    (sum, riderSnapshot) => sum + riderSnapshot.attackEnergyCost,
    0
  )
  const displayedChaseCost = displayedEnergySnapshots.reduce(
    (sum, riderSnapshot) => sum + (riderSnapshot.chaseEnergyCost ?? 0),
    0
  )
  const displayedChaseActive = displayedPelotonGroup?.chaseActive === true
  const displayedControlledStageProgress = Math.max(
    0,
    Math.min(100, (currentKm / optionBStageInput.distanceKm) * 100)
  )
  const displayedOutcomeReached =
    replayStarted &&
    reachedCheckpoint.checkpointIndex >= optionBOutcomeResult.outcomeCheckpointIndex
  const displayedFinishReached =
    replayStarted &&
    reachedCheckpoint.checkpointIndex >= optionBOutcomeResult.finishCheckpointIndex
  const finalCheckpointReached =
    replayStarted && presentationRaceSeconds >= finalOptionBRaceSeconds
  const exactCheckpointArrayIndex = optionBCheckpoints.findIndex(
    (checkpoint) =>
      Math.abs(checkpoint.raceSecond - presentationRaceSeconds) < 0.000001
  )
  const checkpointStatusLabel =
    exactCheckpointArrayIndex >= 0
      ? `Checkpoint ${exactCheckpointArrayIndex + 1}/${optionBCheckpoints.length}`
      : `Checkpoint ${reachedCheckpointArrayIndex + 1}→${Math.min(
          reachedCheckpointArrayIndex + 2,
          optionBCheckpoints.length
        )}`

  const weather = stage.weather_snapshot ?? {}
  const temperature = asNumber(
    (weather.avg_temp_c ?? weather.temperature_c ?? weather.temp_c) as
      | number
      | string
      | null
      | undefined
  )
  const wind = asNumber(
    (weather.avg_wind_kmh ?? weather.wind_kmh) as
      | number
      | string
      | null
      | undefined
  )
  const rain = asNumber(
    (weather.avg_precip_mm ?? weather.precip_mm ?? weather.rain_mm) as
      | number
      | string
      | null
      | undefined
  )

  const replayWeather = {
    temperature: temperature === null ? '—' : `${temperature.toFixed(1)}°C`,
    wind: wind === null ? '—' : `${wind.toFixed(0)} km/h`,
    rain: rain === null ? '—' : `${rain.toFixed(1)} mm`,
  }

  function resetReplayPresentation(): void {
    setPresentationRaceSeconds(0)
    setPlaying(false)
    setReplayStarted(false)
  }

  function selectRealStageOrders(): void {
    if (!realStageInputAvailable) return
    setInputMode('real_stage_orders')
    resetReplayPresentation()
  }

  function selectOutcomeScenario(nextScenario: BreakawayOutcome): void {
    setOutcomeScenario(nextScenario)
    setInputMode(
      nextScenario === 'caught'
        ? 'controlled_catch'
        : 'controlled_survival'
    )
    resetReplayPresentation()
  }

  function togglePlayback(): void {
    setReplayStarted(true)

    if (presentationRaceSeconds >= finalOptionBRaceSeconds) {
      setPresentationRaceSeconds(0)
      setPlaying(true)
      return
    }

    setPlaying((current) => !current)
  }

  function goToNextCheckpoint(): void {
    setReplayStarted(true)
    setPlaying(false)

    const next = optionBCheckpoints.find(
      (checkpoint) => checkpoint.raceSecond > presentationRaceSeconds
    )

    setPresentationRaceSeconds(
      next?.raceSecond ?? finalOptionBRaceSeconds
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="grid grid-cols-1 gap-4 border-b border-slate-200 px-5 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Race replay
            </div>

            <div className="mt-1 flex min-w-0 items-center gap-2">
              <RaceTitleFlag
                code={race.country_code || stage.host_country_code || 'ME'}
              />
              <h1 className="min-w-0 truncate text-xl font-semibold text-slate-950">
                {race.name}
              </h1>
            </div>

            <div className="mt-1 text-sm text-slate-500">
              Stage {stage.stage_number} · {stage.name || formatStageRoute(stage)}
            </div>

            <div className="mt-1 break-words text-sm text-slate-500">
              {profile?.route_label || stage.route_label || formatStageRoute(stage)}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-start gap-3 xl:justify-self-end">
            <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:w-auto sm:min-w-[205px]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Stage weather
              </div>

              <div className="mt-2 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    Temp
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-800">
                    {replayWeather.temperature}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    Wind
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-800">
                    {replayWeather.wind}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    Rain
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-800">
                    {replayWeather.rain}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5">
          {loadError ? (
            <div className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {loadError}
            </div>
          ) : null}

          {inputMode === 'real_stage_orders' && !realStageInputAvailable ? (
            <div className="shrink-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Real stage input is unavailable: {realStageBuild.error ?? 'fewer than two participant riders were returned'}. The replay is temporarily showing the controlled Catch diagnostic and writes nothing.
            </div>
          ) : null}

          {realStageModeActive && visibleStagePlanSources.length === 0 ? (
            <div className="shrink-0 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              The actual participant field is loaded, but no Stage Plan rows are visible to this user for this stage. The real mode therefore remains one neutral peloton with no artificial attack.
            </div>
          ) : null}

          <div className="shrink-0 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-950">
                Unified road-stage replay
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectRealStageOrders}
                  disabled={!realStageInputAvailable}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                    realStageModeActive
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  title={
                    realStageInputAvailable
                      ? 'Use the actual race field and authorized saved Stage Plans'
                      : realStageBuild.error ?? 'Real stage field is unavailable'
                  }
                >
                  Real stage orders
                </button>

                <button
                  type="button"
                  onClick={() => selectOutcomeScenario('caught')}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                    inputMode === 'controlled_catch'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Controlled Catch
                </button>

                <button
                  type="button"
                  onClick={() => selectOutcomeScenario('survived')}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                    inputMode === 'controlled_survival'
                      ? 'border-orange-600 bg-orange-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Controlled Survival
                </button>

                <button
                  type="button"
                  onClick={togglePlayback}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
                >
                  {playing ? 'Pause' : 'Play'}
                </button>

                {([1, 2, 4, 8] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlaybackSpeed(value)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                      playbackSpeed === value
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {value}x
                  </button>
                ))}

                <button
                  type="button"
                  onClick={goToNextCheckpoint}
                  disabled={finalCheckpointReached}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next checkpoint
                </button>

                <div className="text-xs font-semibold text-slate-500">
                  {checkpointStatusLabel}
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
              <span>Option B · true integrated B1 + B2 road-stage runner</span>
              <span>{finalOptionBCheckpoint.riderSnapshots.length} riders</span>
              <span>{optionBCheckpoints.length} checkpoints</span>
              <span>
                Input {realStageModeActive ? 'Real field + visible Stage Plans' : 'Controlled diagnostic'}
              </span>
              {realStageModeActive ? (
                <>
                  <span>Actual field {activeTacticalSummary?.fieldRiderCount ?? 0} riders</span>
                  <span>Visible plans {activeTacticalSummary?.visibleStagePlanCount ?? 0}</span>
                  <span>Visible teams {activeTacticalSummary?.visibleTeamCount ?? 0}</span>
                  <span>Explicit attackers {activeTacticalSummary?.attackerRiderIds.length ?? 0}</span>
                  {(activeTacticalSummary?.deferredAttackCommandCount ?? 0) > 0 ? (
                    <span>Later attack commands deferred {activeTacticalSummary?.deferredAttackCommandCount}</span>
                  ) : null}
                  <span>Chase signals {activeTacticalSummary?.explicitChaseSignalCount ?? 0}</span>
                  <span>Neutral overall attribute bridge</span>
                </>
              ) : null}
              <span>
                Requested behavior {
                  realStageModeActive && !activeAttackEnabled
                    ? 'No explicit attack'
                    : activeOutcome === 'caught'
                      ? 'Attack + chase'
                      : 'Attack without chase closure'
                }
              </span>
              <span>
                Outcome checkpoint {optionBOutcomeResult.outcomeCheckpointIndex + 1}
              </span>
              <span>
                Finish checkpoint {optionBOutcomeResult.finishCheckpointIndex + 1}
              </span>
              <span>Stage {stage.stage_number}/{RIO_TOUR_INTEGRATION_STAGE_COUNT}</span>
              <span>{formatTerrainModelLabel(selectedTerrainProfile.stageType)}</span>
              <span>Real distance {optionBStageInput.distanceKm.toFixed(1)} km</span>
              <span>{selectedTerrainProfile.terrainPhases.length} terrain phases</span>
              <span>{optionBSimulation.phaseBoundaryCrossingCount} unique terrain boundaries crossed</span>
              <span>Active {formatTerrainModelLabel(activeTerrainPhase.terrainType)} · ×{activeTerrainMultiplier.toFixed(4)}</span>
              <span>
                {activeAttackEnabled
                  ? `Attack at checkpoint ${activeDefinition.controlledAttack.attackCheckpointIndex + 1}`
                  : 'No explicit attack order'}
              </span>
              <span>Chase threshold {Math.round(activeDefinition.lateStageChase.chaseStartProgress * 100)}%</span>
              <span>Stage progress {displayedControlledStageProgress.toFixed(1)}%</span>
              {activeAttackEnabled ? (
                <span>
                  Closing bonus +
                  {(activeOutcome === 'caught'
                    ? activeDefinition.breakawayCatchScenario.pelotonClosingSpeedBonusKmh
                    : activeDefinition.breakawaySurvivalScenario.pelotonClosingSpeedBonusKmh
                  ).toFixed(3)} km/h
                </span>
              ) : null}
              <span>
                {displayedOutcomeReached
                  ? !activeAttackEnabled
                    ? 'Physical outcome: peloton finish · no breakaway'
                    : `Physical outcome: ${optionBSimulation.physicalOutcome}`
                  : 'Outcome pending'}
              </span>
              {displayedFinishReached ? <span>Real stage finish reached</span> : null}
              {displayedFinishReached ? (
                <>
                  <span>Final results {optionBStageResults.results.length}/{activeDefinition.riders.length}</span>
                  <span>
                    Winner {optionBFinalResultRows[0]?.riderName ?? optionBStageResults.winnerRiderId}
                    {' '}· {formatPreciseRaceClock(optionBStageResults.winnerFinishTimeSeconds)}
                  </span>
                  <span>
                    Result groups {new Set(optionBStageResults.results.map((result) => result.finishingGroupId)).size}
                  </span>
                </>
              ) : null}
              <span>{displayedGroupCount} live {displayedGroupCount === 1 ? 'group' : 'groups'}</span>
              <span>Leader {currentKm.toFixed(3)} km</span>
              {displayedBreakawayGroup ? (
                <>
                  <span>
                    B1 {displayedBreakawayGroup.distanceKm.toFixed(3)} km ·{' '}
                    {displayedBreakawayGroup.speedKmh.toFixed(3)} km/h
                  </span>
                  {displayedBreakawayGroup.totalGroupAdvantageKmh !== undefined ? (
                    <span>
                      B1 group +{displayedBreakawayGroup.totalGroupAdvantageKmh.toFixed(3)}
                      {' '}km/h · draft +
                      {(displayedBreakawayGroup.draftingBonusKmh ?? 0).toFixed(3)} · coop +
                      {(displayedBreakawayGroup.cooperationBonusKmh ?? 0).toFixed(3)} ·{' '}
                      {Math.round((displayedBreakawayGroup.cooperationLevel ?? 0) * 100)}% cooperation
                    </span>
                  ) : null}
                  {displayedBreakawayGroup.baseSpeedBeforeTerrainKmh !== undefined ? (
                    <span>
                      B1 speed {displayedBreakawayGroup.baseSpeedBeforeTerrainKmh.toFixed(3)}
                      {' '}× B2 {formatTerrainModelLabel(displayedBreakawayGroup.terrainType ?? activeTerrainPhase.terrainType)}
                      {' '}×{(displayedBreakawayGroup.terrainSpeedMultiplier ?? 1).toFixed(4)}
                      {' '}= {displayedBreakawayGroup.speedKmh.toFixed(3)} km/h
                    </span>
                  ) : null}
                </>
              ) : null}
              {displayedPelotonGroup ? (
                <>
                  <span>
                    P {displayedPelotonGroup.distanceKm.toFixed(3)} km ·{' '}
                    {displayedPelotonGroup.speedKmh.toFixed(3)} km/h
                  </span>
                  {displayedPelotonGroup.totalGroupAdvantageKmh !== undefined ? (
                    <span>
                      P group +{displayedPelotonGroup.totalGroupAdvantageKmh.toFixed(3)}
                      {' '}km/h · draft +
                      {(displayedPelotonGroup.draftingBonusKmh ?? 0).toFixed(3)} · coop +
                      {(displayedPelotonGroup.cooperationBonusKmh ?? 0).toFixed(3)} ·{' '}
                      {Math.round((displayedPelotonGroup.cooperationLevel ?? 0) * 100)}% cooperation
                    </span>
                  ) : null}
                  {displayedPelotonGroup.baseSpeedBeforeTerrainKmh !== undefined ? (
                    <span>
                      B1 speed {displayedPelotonGroup.baseSpeedBeforeTerrainKmh.toFixed(3)}
                      {' '}× B2 {formatTerrainModelLabel(displayedPelotonGroup.terrainType ?? activeTerrainPhase.terrainType)}
                      {' '}×{(displayedPelotonGroup.terrainSpeedMultiplier ?? 1).toFixed(4)}
                      {' '}= {displayedPelotonGroup.speedKmh.toFixed(3)} km/h
                    </span>
                  ) : null}
                  {displayedChaseActive ? (
                    <span>
                      P chase active · B1 base{' '}
                      {(displayedPelotonGroup.baseSpeedBeforeChaseKmh ?? 0).toFixed(3)}
                      {' '}+{' '}
                      {(displayedPelotonGroup.chaseSpeedBonusKmh ?? 0).toFixed(3)}
                      {' '}then terrain ×{(displayedPelotonGroup.terrainSpeedMultiplier ?? activeTerrainMultiplier).toFixed(4)} ={' '}
                      {displayedPelotonGroup.speedKmh.toFixed(3)} km/h
                    </span>
                  ) : null}
                </>
              ) : null}
              <span>Gap {displayedGapSeconds <= 0 ? '0.000 s' : `+${displayedGapSeconds.toFixed(3)} s`}</span>
              <span>00:00:00 → {formatRaceClock(finalOptionBCheckpoint.raceSecond)}</span>
              <span>Energy avg {displayedAverageEnergy.toFixed(1)} · low {displayedLowestEnergy.toFixed(1)}</span>
              {activeAttackEnabled ? (
                <span>Attack cost {(activeDefinition.energyModel.attackEnergyCost ?? 0).toFixed(1)} per attacker</span>
              ) : null}
              {displayedAttackCost > 0 ? (
                <span>Attack checkpoint charged {displayedAttackCost.toFixed(1)} total</span>
              ) : null}
              {displayedChaseActive ? (
                <span>
                  Chase cost {activeDefinition.lateStageChase.chaseEnergyCost.toFixed(1)} per peloton rider
                </span>
              ) : null}
              {displayedChaseCost > 0 ? (
                <span>Chase checkpoint charged {displayedChaseCost.toFixed(1)} total</span>
              ) : null}
            </div>

            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                Loading stage profile…
              </div>
            ) : profile?.has_profile ? (
              <StageProfileChart
                points={profile.profile_points ?? []}
                markers={profile.route_markers ?? []}
                distanceKm={distanceKm}
                terrainType={profile.terrain_type}
                mountainClimbs={profile.mountain_climbs ?? []}
                replayProgressPercent={replayStarted ? progress : 0}
              />
            ) : stage.profile_image_url ? (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <img
                  src={stage.profile_image_url}
                  alt={`Stage ${stage.stage_number} profile`}
                  className="h-auto w-full object-contain"
                />
                <div
                  className="pointer-events-none absolute inset-y-4 w-1.5 -translate-x-1/2 rounded-full bg-blue-600 shadow-md transition-[left] duration-150"
                  style={{ left: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                Stage profile is not available.
              </div>
            )}

            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
              Real stage mode uses the actual participant field and only Stage Plans that the current user is authorized to read. Explicit attack or join-breakaway commands create the breakaway; chase orders and roles determine the requested chase behavior. Missing or private plans remain neutral and never create a fake attack. Detailed rider attributes are still represented by the documented neutral overall bridge. Controlled Catch and Survival remain regression diagnostics. No official result is written.
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Terrain</th>
                    <th className="px-3 py-2 text-left">Range</th>
                    <th className="px-3 py-2 text-right">Gradient</th>
                    <th className="px-3 py-2 text-right">B2 multiplier</th>
                    <th className="px-3 py-2 text-right">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedTerrainProfile.terrainPhases.map((phase) => {
                    const multiplier = calculateTerrainSpeedMultiplier(
                      phase.terrainType,
                      phase.averageGradientPercent
                    )
                    const active = phase.phaseId === activeTerrainPhase.phaseId

                    return (
                      <tr key={phase.phaseId} className={active ? 'bg-blue-50' : 'bg-white'}>
                        <td className="px-3 py-2 font-semibold">{phase.phaseIndex + 1}</td>
                        <td className="px-3 py-2 font-semibold">{formatTerrainModelLabel(phase.terrainType)}</td>
                        <td className="px-3 py-2">{phase.startKm.toFixed(1)}–{phase.endKm.toFixed(1)} km</td>
                        <td className="px-3 py-2 text-right">{phase.averageGradientPercent >= 0 ? '+' : ''}{phase.averageGradientPercent.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">×{multiplier.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right">{active ? 'Yes' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
            <div className="grid min-h-[420px] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Live commentary
                </div>

                <div className="max-h-[520px] overflow-auto divide-y divide-slate-100">
                  {visibleComments.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500">
                      {!replayStarted
                        ? 'Press Play to start live commentary.'
                        : 'No commentary event has been reached yet.'}
                    </div>
                  ) : (
                    [...visibleComments].reverse().map((comment) => (
                      <div
                        key={`${comment.progress}-${comment.title}-${comment.description}`}
                        className="grid grid-cols-[74px_1fr] gap-3 px-4 py-2.5 text-sm"
                      >
                        <div className="font-semibold text-slate-500">
                          {formatKm((optionBStageInput.distanceKm * comment.progress) / 100)}
                        </div>

                        <div>
                          <span className="font-semibold text-slate-950">
                            {comment.title}
                          </span>
                          <span className="ml-2 text-slate-600">
                            {comment.description}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <aside className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Stage standing · riders
                </div>

                <div className="p-3">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500">
                      <span>
                        {replayStarted ? formatRaceClock(currentRaceSeconds) : '00:00:00'}
                      </span>
                      <span>
                        {replayStarted ? formatKm(currentKm) : 'Race not started'}
                      </span>
                    </div>

                    <div className="max-h-[480px] overflow-auto divide-y divide-slate-100">
                      {displayedStandings.slice(0, 60).map((row, index) => {
                        const isBreakaway = row.groupLabel === 'Breakaway'
                        const badgeLabel = isBreakaway ? 'B1' : 'P'
                        const badgeColor = isBreakaway ? '#f97316' : '#2563eb'
                        const standingTimeLabel =
                          !replayStarted
                            ? '—'
                            : index === 0
                              ? 'Leader'
                              : row.liveGapSeconds <= 0
                                ? 's.t.'
                                : `+${formatGapValue(row.liveGapSeconds)}`

                        return (
                          <div
                            key={row.riderId}
                            className="grid grid-cols-[28px_44px_minmax(0,1.05fr)_minmax(170px,0.95fr)_minmax(96px,0.55fr)] items-center gap-3 bg-white px-3 py-3"
                          >
                            <div className="text-sm font-semibold text-slate-500">
                              {replayStarted ? index + 1 : '—'}
                            </div>

                            <span
                              className="inline-flex h-6 min-w-[34px] items-center justify-center rounded-full px-2 text-[10px] font-bold text-white"
                              style={{ backgroundColor: badgeColor }}
                              title={row.groupLabel}
                            >
                              {badgeLabel}
                            </span>

                            <div className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2">
                              <SmallCountryFlag code={row.countryCode} />
                              <div className="min-w-0">
                                <div
                                  className="truncate whitespace-nowrap text-sm font-semibold leading-snug text-slate-950"
                                  title={row.riderName}
                                >
                                  {row.riderName}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-slate-500">
                                  {row.teamName || '—'}
                                </div>
                              </div>
                            </div>

                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                                <span>Fresh {row.freshness.toFixed(0)}</span>
                                <span>Energy {row.energy.toFixed(1)}</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-slate-400"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, row.freshness))}%`,
                                  }}
                                />
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                                <div
                                  className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, row.energy))}%`,
                                  }}
                                />
                              </div>
                              <div className="truncate text-[10px] font-medium text-slate-500">
                                Cost {row.energyCostSincePreviousCheckpoint.toFixed(2)}
                                {' · '}move {row.movementEnergyCost.toFixed(2)}
                                {row.attackEnergyCost > 0
                                  ? ` · attack ${row.attackEnergyCost.toFixed(1)}`
                                  : ''}
                                {row.chaseEnergyCost > 0
                                  ? ` · chase ${row.chaseEnergyCost.toFixed(1)}`
                                  : ''}
                                {' · '}shelter {row.shelterEnergySaving.toFixed(2)}
                              </div>
                            </div>

                            <div className="min-w-0 text-right">
                              <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
                                {standingTimeLabel}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            {displayedFinishReached ? (
              <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                      Final stage results · deterministic
                    </div>
                    <div className="mt-1 text-sm text-emerald-900">
                      {!activeAttackEnabled
                        ? 'No saved attack order was available, so the real field finishes as one physical peloton. Ranks use the temporary neutral attribute bridge.'
                        : optionBSimulation.physicalOutcome === 'caught'
                          ? 'The physically caught field shares one group time. Ranks use the current deterministic tie-break.'
                          : 'The breakaway wins at one shared time; the peloton receives its calculated physical finish time and positive winner gap.'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-900">
                    <span>{optionBStageResults.results.length} finished</span>
                    <span>·</span>
                    <span>
                      Tie-break sprint → flat → endurance → riderId
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Group</th>
                        <th className="px-3 py-2 text-left">Rider</th>
                        <th className="px-3 py-2 text-left">Team</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right">Finish time</th>
                        <th className="px-3 py-2 text-right">Winner gap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {optionBFinalResultRows.map((result) => {
                        const isWinner = result.rank === 1
                        const sameTimeAsWinner = result.gapSecondsToWinner <= 0
                        const badgeColor = result.groupBadge === 'B1' ? '#f97316' : '#2563eb'

                        return (
                          <tr key={result.riderId} className={isWinner ? 'bg-amber-50' : 'bg-white'}>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">
                              {result.rank}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex h-6 min-w-[34px] items-center justify-center rounded-full px-2 text-[10px] font-bold text-white"
                                  style={{ backgroundColor: badgeColor }}
                                  title={result.groupLabel}
                                >
                                  {result.groupBadge}
                                </span>
                                <span className="text-xs text-slate-500">
                                  Group {result.finishingGroupRank}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <SmallCountryFlag code={result.countryCode} />
                                <span className="font-semibold text-slate-950">
                                  {result.riderName}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {result.teamName}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                {result.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-700">
                              {formatPreciseRaceClock(result.finishTimeSeconds)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                              {isWinner
                                ? 'Winner'
                                : sameTimeAsWinner
                                  ? 's.t.'
                                  : `+${result.gapSecondsToWinner.toFixed(3)}s`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Final deterministic rider results appear when this stage reaches its real finish.
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <SimpleReplayStagePointsPanel
                pointResults={pointResults}
                stagePoints={stage.points ?? []}
                currentKm={currentKm}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}



function SimpleRaceReplayPage(props: {
  race: Race
  stage: RaceStage
  participantTeams: RaceParticipantTeam[]
  onClose: () => void
}) {
  return <B1RestoredRaceReplayPage {...props} />
}


function RaceStageProfilePanel({
  selectedStageId,
  classificationResultsStageId,
  selectedStage,
  race,
  currentGameDate,
  currentClubId,
  viewerClubFamilyIds,
  participantTeams,
  hideLiveResults,
  onOpenReplay,
}: {
  selectedStageId: string | null
  classificationResultsStageId: string | null
  selectedStage: RaceStage | null
  race: Race | null
  currentGameDate: string | null
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  participantTeams: RaceParticipantTeam[]
  hideLiveResults: boolean
  onOpenReplay: (stage: RaceStage) => void
}) {
  const [profile, setProfile] = useState<StageProfileDetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedStageId) {
      setProfile(null)
      setLoading(false)
      setErrorMessage(null)
      return
    }

    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await raceDetailReadRpc('get_race_stage_profile_detail_v1', {
        p_stage_id: selectedStageId,
      })

      if (cancelled) return

      if (error) {
        setProfile(null)
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      setProfile(normalizeStageProfileDetailPayload(data))
      setLoading(false)
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [selectedStageId])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-500">Loading stage profile…</div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {errorMessage}
      </div>
    )
  }

  if (!profile || !profile.has_profile) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Stage profile
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
          Stage profile data is not available from the backend yet.
        </div>
      </div>
    )
  }

  const profileTerrainSplit: RaceTerrainSplit = profile.terrain_split ?? DEFAULT_TERRAIN_SPLIT
  const isTimeTrialProfileStage = isTimeTrialLikeStage(selectedStage)
  const isTeamTimeTrialProfileStage = isTeamTimeTrialLikeStage(selectedStage)
  const allowSmallTimeTrialFinishPoints =
    isPrologueOrIndividualTimeTrialStage(selectedStage)
  const finishPoint = (selectedStage?.points ?? []).find((point) => point.point_type === 'FINISH')
  const finishMarker = (profile.route_markers ?? []).find(
    (marker) => marker.type.toLowerCase() === 'finish'
  )
  const finishPointRecord = finishPoint ? getRecord(finishPoint) : {}
  const finishPointMetadata = getRecord(finishPointRecord.metadata)
  const finishPointType = [
    finishPointRecord.finish_type,
    finishPointMetadata.finish_type,
    selectedStage?.finish_type,
  ]
    .find((value): value is string => typeof value === 'string')
    ?.toLowerCase()

  const mountainClimbs = profile.mountain_climbs ?? []
  const fallbackFinishKm =
    asNumber(
      finishPoint?.km_from_start ??
        (finishPointRecord.km as number | string | null | undefined)
    ) ??
    asNumber(finishMarker?.km) ??
    profile.distance_km
  const stageFinishKm = Number(selectedStage?.distance_km ?? profile.distance_km)
  const finishKm = Number.isFinite(stageFinishKm) ? stageFinishKm : fallbackFinishKm

  const hasMountainFinish = mountainClimbs.some((climb) =>
    isSameKm(climb.km, finishKm)
  )

  const visibleMountainClimbs = mountainClimbs.filter((climb) => {
    if (!hasMountainFinish) return true
    return !isSameKm(climb.km, finishKm)
  })

  const finishClimb = hasMountainFinish
    ? mountainClimbs.find((climb) => isSameKm(climb.km, finishKm)) ?? null
    : getFinishClimb(mountainClimbs, finishKm)
  const finishClimbCategory = formatProfileDetailValue(finishClimb?.['category']).toLowerCase()

  const finishIsMountain = Boolean(
    hasMountainFinish ||
      selectedStage?.is_summit_finish ||
      finishPointType?.includes('mountain') ||
      finishClimb ||
      finishClimbCategory.includes('cat')
  )

  const finishPointHasConfiguredPoints = hasConfiguredPointValues(
    finishPoint?.points_scheme
  )

  const shouldShowFinishCard = isTeamTimeTrialProfileStage
    ? false
    : isTimeTrialProfileStage
      ? allowSmallTimeTrialFinishPoints || finishPointHasConfiguredPoints
      : Boolean(
          finishPoint || finishMarker || profile.distance_km !== null || selectedStage?.finish_city
        )

  const stagePoints = (isTimeTrialProfileStage
    ? []
    : [
        ...(profile.intermediate_sprints ?? []).map((sprint, index) => ({
          ...sprint,
          pointType: 'sprint' as const,
          sortKm: toKmNumber(sprint.km),
          sortIndex: index,
        })),

        ...(visibleMountainClimbs ?? []).map((climb, index) => ({
          ...climb,
          pointType: 'kom' as const,
          sortKm: toKmNumber(climb.km),
          sortIndex: index,
        })),
      ]
  ).sort((a, b) => {
    if (a.sortKm !== b.sortKm) return a.sortKm - b.sortKm
    return a.sortIndex - b.sortIndex
  })

  function FinishSprintCard() {
    if (!shouldShowFinishCard) return null

    return (
      <StageFinishPointCard
        isMountainFinish={finishIsMountain}
        finishKm={finishKm}
        finishPoint={finishPoint}
        finishClimb={finishClimb}
        suppressTimeBonuses={isTimeTrialProfileStage}
        allowDefaultFinishPoints={!isTeamTimeTrialProfileStage}
        defaultFinishPointsScheme={
          allowSmallTimeTrialFinishPoints
            ? DEFAULT_TIME_TRIAL_FINISH_POINTS_SCHEME
            : DEFAULT_FINISH_POINTS_SCHEME
        }
      />
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Stage profile
        </div>

        <div className="mt-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-semibold text-slate-950">
                {profile.stage_title ?? `Stage ${profile.stage_number}`}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{profile.route_label ?? 'Route TBD'}</p>
              {profile.stage_summary ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {profile.stage_summary}
                </p>
              ) : null}
            </div>

            <div className="grid min-w-[280px] grid-cols-2 gap-x-8 gap-y-3 xl:pt-1">
              <div>
                <div className="text-xs text-slate-500">Distance</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {formatKm(profile.distance_km)}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Terrain</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {profile.terrain_type ? humanizeCode(profile.terrain_type) : '—'}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Profile</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {profile.profile_type ? humanizeCode(profile.profile_type) : '—'}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Elevation</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {formatMeters(profile.elevation_gain_m)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isStageWeatherCanceled(selectedStage) ? (
          <div className="mt-4">
            <WeatherCancellationNotice stage={selectedStage} race={race} />
          </div>
        ) : null}

        <div className="mt-4">
          <StageProfileChart
            points={profile.profile_points ?? []}
            markers={profile.route_markers ?? []}
            distanceKm={Number(profile.distance_km ?? 0)}
            terrainType={profile.terrain_type}
            mountainClimbs={profile.mountain_climbs ?? []}
          />
        </div>

        {stagePoints.length > 0 || shouldShowFinishCard || !isTimeTrialProfileStage ? (
          <div className="mt-6">
            <section>
              <h3 className="text-lg font-semibold text-slate-900">Stage points</h3>

              <div className="mt-4 space-y-3">
                {stagePoints.map((point) => {
                if (point.pointType === 'sprint') {
                  return (
                    <SprintCard
                      key={`sprint-${point.sortKm}-${point.sortIndex}`}
                      sprint={point}
                    />
                  )
                }

                return (
                  <KOMCard
                    key={`kom-${point.sortKm}-${point.sortIndex}-${point.name ?? 'climb'}`}
                    climb={point}
                  />
                )
              })}

              <FinishSprintCard />

                {stagePoints.length === 0 && !shouldShowFinishCard ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No stage points configured for this stage.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <StageReplayAccessCard
          race={race}
          stage={selectedStage}
          currentClubId={currentClubId}
          viewerClubFamilyIds={viewerClubFamilyIds}
          participantTeams={participantTeams}
          currentGameDate={currentGameDate}
          onOpenReplay={onOpenReplay}
        />

        <TerrainSplitCard terrainSplit={profileTerrainSplit} />

        {selectedStage ? (
          <StageWeatherCard stage={selectedStage} currentGameDate={currentGameDate} />
        ) : null}

        {race && !hideLiveResults ? (
          <RaceLeadersCard
            race={race}
            classificationResultsStageId={classificationResultsStageId}
          />
        ) : null}
      </div>
    </div>
  )
}

type RaceDetailPageProps = {
  raceIdOverride?: string | null
  currentClubId?: string | null
  onBack?: () => void
  onOpenTeamProfile?: (teamId: string) => void
  onOpenRiderProfile?: (riderId: string) => void
  replayStageIdOverride?: string | null
  onCloseReplayOverride?: () => void
  stageResultsOverride?: {
    readonly stageId: string
    readonly rows:
      readonly RaceStageResultRow[]
  } | null
  engineTestModeLabel?: string | null
}

type ClubFamilyLookupRow = {
  id: string
  parent_club_id?: string | null
  club_type?: string | null
}


const RACE_ENTRY_RULES_DETAIL_SELECT = `
  applications_status,
  applications_open_season_number,
  applications_open_month_number,
  applications_open_day_number,
  applications_close_season_number,
  applications_close_month_number,
  applications_close_day_number,
  team_list_announcement_season_number,
  team_list_announcement_month_number,
  team_list_announcement_day_number,
  rider_submission_deadline_season_number,
  rider_submission_deadline_month_number,
  rider_submission_deadline_day_number,
  min_riders_per_team,
  max_riders_per_team,
  min_teams,
  target_teams,
  max_teams,
  prize_fund_cash
`

export default function RaceDetailPage({
  raceIdOverride = null,
  currentClubId = DEFAULT_CURRENT_CLUB_ID,
  onBack,
  onOpenTeamProfile,
  onOpenRiderProfile,
  replayStageIdOverride = null,
  onCloseReplayOverride,
  stageResultsOverride = null,
  engineTestModeLabel = null,
}: RaceDetailPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeRaceId = useRaceIdFromRoute()
  const raceId = raceIdOverride ?? routeRaceId
  const resolvedViewerClubId = currentClubId ?? DEFAULT_CURRENT_CLUB_ID

  function getRaceDetailReturnState(): RaceDetailReturnState | null {
    return location.state as RaceDetailReturnState | null
  }

  function getStoredRaceProfileReturnState() {
    if (typeof window === 'undefined') return null

    try {
      const rawValue = window.sessionStorage.getItem(RACE_PROFILE_RETURN_STORAGE_KEY)
      if (!rawValue) return null

      return JSON.parse(rawValue) as {
        returnTo?: string
        restoreScrollX?: number
        restoreScrollY?: number
        returnRaceId?: string
        raceInfoExpanded?: boolean
        raceInfoTab?: RaceInfoTab
      }
    } catch {
      return null
    }
  }


  function isCurrentRaceDetailReturnPath(value?: string | null): boolean {
    if (!value) return false

    try {
      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(value, baseUrl)
      const normalizedValue = url.pathname + url.search + url.hash
      const currentValue = location.pathname + location.search + location.hash

      return normalizedValue === currentValue
    } catch {
      return value === location.pathname + location.search + location.hash
    }
  }

  function isValidRaceDetailSourceReturnState(
    state?: RaceDetailReturnState | null
  ): state is RaceDetailReturnState {
    if (!state?.returnTo) return false
    if (state.from === 'race_detail') return false
    if (isCurrentRaceDetailReturnPath(state.returnTo)) return false

    return true
  }

  function getStoredRaceDetailSourceReturnState(): RaceDetailReturnState | null {
    if (typeof window === 'undefined') return null

    try {
      const rawValue = window.sessionStorage.getItem(
        RACE_DETAIL_SOURCE_RETURN_STORAGE_KEY
      )
      if (!rawValue) return null

      const storedState = JSON.parse(rawValue) as RaceDetailReturnState

      if (
        raceId &&
        storedState.sourceRaceId &&
        storedState.sourceRaceId !== raceId
      ) {
        return null
      }

      if (!isValidRaceDetailSourceReturnState(storedState)) return null

      return storedState
    } catch {
      return null
    }
  }

  function saveRaceDetailSourceReturnState(
    state?: RaceDetailReturnState | null
  ): void {
    if (typeof window === 'undefined') return
    if (!isValidRaceDetailSourceReturnState(state)) return

    window.sessionStorage.setItem(
      RACE_DETAIL_SOURCE_RETURN_STORAGE_KEY,
      JSON.stringify({
        ...state,
        sourceRaceId: raceId ?? state.returnRaceId,
        createdAtMs: Date.now(),
      })
    )
  }

  function clearStoredRaceDetailSourceReturnState(): void {
    if (typeof window === 'undefined') return

    window.sessionStorage.removeItem(RACE_DETAIL_SOURCE_RETURN_STORAGE_KEY)
  }

  function getSafeRaceDetailSourceReturnState(): RaceDetailReturnState | null {
    const state = getRaceDetailReturnState()

    if (isValidRaceDetailSourceReturnState(state)) return state

    return getStoredRaceDetailSourceReturnState()
  }

  function saveRaceProfileReturnState(state: {
    returnTo?: string
    returnScrollX?: number
    returnScrollY?: number
    returnRaceId?: string
    raceInfoExpanded?: boolean
    raceInfoTab?: RaceInfoTab
  }) {
    if (typeof window === 'undefined') return

    window.sessionStorage.setItem(
      RACE_PROFILE_RETURN_STORAGE_KEY,
      JSON.stringify({
        returnTo: state.returnTo,
        restoreScrollX: state.returnScrollX,
        restoreScrollY: state.returnScrollY,
        returnRaceId: state.returnRaceId,
        raceInfoExpanded: state.raceInfoExpanded,
        raceInfoTab: state.raceInfoTab,
      })
    )
  }

  function restorePreviousScroll(scrollX?: number, scrollY?: number) {
    if (typeof window === 'undefined') return
    if (typeof scrollY !== 'number' && typeof scrollX !== 'number') return

    const left = typeof scrollX === 'number' ? scrollX : 0
    const top = typeof scrollY === 'number' ? scrollY : 0

    pendingScrollRestoreRef.current = { left, top }

    ;[0, 80, 250, 600, 1000].forEach((delay) => {
      window.setTimeout(() => {
        window.scrollTo({ left, top, behavior: 'auto' })
      }, delay)
    })
  }


  function normalizeRaceInfoTab(value?: string | null): RaceInfoTab | undefined {
    return value === 'participants' || value === 'results' ? value : undefined
  }

  function getRaceInformationRestoreState() {
    const state = getRaceDetailReturnState()
    const storedReturnState = getStoredRaceProfileReturnState()
    const currentPath = `${location.pathname}${location.search}${location.hash}`
    const storedMatchesCurrentRace =
      storedReturnState?.returnTo === currentPath ||
      Boolean(raceId && storedReturnState?.returnRaceId === raceId)

    const expanded =
      state?.restoreRaceInfoExpanded === true ||
      state?.raceInfoExpanded === true ||
      (storedMatchesCurrentRace && storedReturnState?.raceInfoExpanded === true)

    const tab = normalizeRaceInfoTab(
      state?.raceInfoTab ??
        (storedMatchesCurrentRace ? storedReturnState?.raceInfoTab : undefined)
    )

    return { expanded, tab }
  }

  function handleBackToPreviousPage() {
    if (onBack) {
      onBack()
      return
    }

    const state = getSafeRaceDetailSourceReturnState()

    if (state?.from === 'calendar' && state.returnTo) {
      clearStoredRaceDetailSourceReturnState()
      navigate(state.returnTo, {
        state: {
          restoreCalendar: true,
          restoreScrollY: state.returnScrollY,
          restoreRaceId: state.returnRaceId,
          restoreCalendarView: state.returnCalendarView,
          restoreMonthNumber: state.returnMonthNumber,
        },
      })
      return
    }

    if (state?.returnTo) {
      clearStoredRaceDetailSourceReturnState()
      navigate(state.returnTo)
      restorePreviousScroll(state.returnScrollX, state.returnScrollY)
      return
    }

    navigate('/dashboard/calendar')
  }

  useEffect(() => {
    const state = getRaceDetailReturnState()

    if (isValidRaceDetailSourceReturnState(state)) {
      saveRaceDetailSourceReturnState(state)
    }
  }, [raceId, location.key])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const state = getRaceDetailReturnState()
    const storedReturnState = getStoredRaceProfileReturnState()
    const currentPath = `${location.pathname}${location.search}${location.hash}`
    const storedMatchesCurrentRace =
      storedReturnState?.returnTo === currentPath ||
      Boolean(raceId && storedReturnState?.returnRaceId === raceId)

    const restoreScrollX =
      typeof state?.restoreScrollX === 'number'
        ? state.restoreScrollX
        : storedMatchesCurrentRace && typeof storedReturnState?.restoreScrollX === 'number'
          ? storedReturnState.restoreScrollX
          : undefined
    const restoreScrollY =
      typeof state?.restoreScrollY === 'number'
        ? state.restoreScrollY
        : storedMatchesCurrentRace && typeof storedReturnState?.restoreScrollY === 'number'
          ? storedReturnState.restoreScrollY
          : undefined

    if (typeof restoreScrollX === 'number' || typeof restoreScrollY === 'number') {
      restorePreviousScroll(restoreScrollX, restoreScrollY)
      return
    }

    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [raceId, location.key])


  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [race, setRace] = useState<Race | null>(null)
  const [entry, setEntry] = useState<RaceRewardsEntryOverview | null>(null)
  const [stages, setStages] = useState<RaceStage[]>([])
  const [selectedStage, setSelectedStage] = useState<RaceStage | null>(null)
  const stageSliderRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollRestoreRef = useRef<{ left: number; top: number } | null>(null)
  const [raceEntryStatus, setRaceEntryStatus] = useState<string | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number>(1)
  const [currentMonthNumber, setCurrentMonthNumber] = useState<number>(1)
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(1)
  const [participantTeams, setParticipantTeams] = useState<RaceParticipantTeam[]>([])
  const [viewerClubFamilyIds, setViewerClubFamilyIds] = useState<string[]>([
    resolvedViewerClubId,
  ])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [applicationActionLoading, setApplicationActionLoading] = useState<
    'apply' | 'cancel' | null
  >(null)
  const [applicationActionError, setApplicationActionError] = useState<string | null>(null)
  const [applicationActionMessage, setApplicationActionMessage] = useState<string | null>(null)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [liveState, setLiveState] = useState<RaceStageLiveState | null>(null)
  const [applicationQuote, setApplicationQuote] = useState<RaceApplicationQuote | null>(null)
  const [applicationQuoteLoading, setApplicationQuoteLoading] = useState(false)
  const [applicationQuoteError, setApplicationQuoteError] = useState<string | null>(null)
  const [raceDetailReloadKey, setRaceDetailReloadKey] = useState(0)
  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const [
    availableClassificationStageIds,
    setAvailableClassificationStageIds,
  ] = useState<string[]>([])

  const replayStageIdFromUrl =
    replayStageIdOverride ?? searchParams.get('replayStageId')

  const replayStage = useMemo(
    () =>
      replayStageIdFromUrl
        ? stages.find((stage) => stage.id === replayStageIdFromUrl) ?? null
        : null,
    [replayStageIdFromUrl, stages]
  )

  function handleOpenReplayPage(stage: RaceStage): void {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('replayStageId', stage.id)
    setSearchParams(nextSearchParams)

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }

  function handleCloseReplayPage(): void {
    if (onCloseReplayOverride) {
      onCloseReplayOverride()
      return
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('replayStageId')
    setSearchParams(nextSearchParams, { replace: true })

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }


  useEffect(() => {
    let alive = true

    async function loadRaceDetailTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'race-detail'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = raceDetailTutorialSteps[0]

        await saveTutorialProgress('race-detail', 'started', firstStep?.key ?? null)

        if (!alive) return

        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('race-detail')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = raceDetailTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        setTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadRaceDetailTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (loading || participantsLoading) return

    const pending = pendingScrollRestoreRef.current
    if (!pending) return

    restorePreviousScroll(pending.left, pending.top)
    pendingScrollRestoreRef.current = null

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(RACE_PROFILE_RETURN_STORAGE_KEY)
    }
  }, [loading, participantsLoading, participantTeams.length, stages.length])

  useEffect(() => {
    if (!selectedStage?.id || !stageSliderRef.current) return

    const selectedNode = stageSliderRef.current.querySelector(
      `[data-stage-id="${selectedStage.id}"]`
    )

    if (!(selectedNode instanceof HTMLElement)) return

    selectedNode.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [selectedStage?.id])

  useEffect(() => {
    let cancelled = false

    async function loadViewerClubFamily() {
      const fallbackIds = getViewerTeamIds(resolvedViewerClubId)

      if (!isUuid(resolvedViewerClubId)) {
        setViewerClubFamilyIds(fallbackIds)
        return
      }

      const { data: currentClub, error: currentClubError } = await supabase
        .from('clubs')
        .select('id,parent_club_id,club_type')
        .eq('id', resolvedViewerClubId)
        .maybeSingle()

      if (cancelled) return

      if (currentClubError || !currentClub) {
        setViewerClubFamilyIds(fallbackIds)
        return
      }

      const currentClubRow = currentClub as ClubFamilyLookupRow
      const rootClubId =
        currentClubRow.club_type === 'developing' && currentClubRow.parent_club_id
          ? currentClubRow.parent_club_id
          : currentClubRow.id

      const { data: familyRows, error: familyError } = await supabase
        .from('clubs')
        .select('id')
        .or(`id.eq.${rootClubId},parent_club_id.eq.${rootClubId}`)

      if (cancelled) return

      if (familyError) {
        setViewerClubFamilyIds(getViewerTeamIds(rootClubId, [resolvedViewerClubId]))
        return
      }

      const familyIds = Array.from(
        new Set([
          rootClubId,
          resolvedViewerClubId,
          ...((familyRows ?? []) as Array<{ id?: string | null }>)
            .map((row) => row.id)
            .filter((value): value is string => Boolean(value)),
        ])
      )

      setViewerClubFamilyIds(familyIds.length > 0 ? familyIds : fallbackIds)
    }

    loadViewerClubFamily()

    return () => {
      cancelled = true
    }
  }, [resolvedViewerClubId])

  useEffect(() => {
    let cancelled = false

    async function loadRaceDetail() {
      if (!raceId || !isUuid(raceId)) {
        setError('Invalid or missing race id.')
        setRace(null)
        setEntry(null)
        setStages([])
        setSelectedStage(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const [
        raceDetailRes,
        gameDateRes,
        gameDatePartsRes,
        entryRulesRes,
        stageStartTimesRes,
      ] = await Promise.all([
        raceDetailReadRpc('get_race_release_detail_v1', {
          p_race_id: raceId,
        }),
        raceDetailReadRpc('get_current_game_date_date'),
        raceDetailReadRpc('get_current_game_date_parts'),
        supabase
          .from('race_entry_rules')
          .select(RACE_ENTRY_RULES_DETAIL_SELECT)
          .eq('race_id', raceId)
          .maybeSingle(),
        supabase
          .from('race_stages')
          .select(
            `
            id,
            start_time_region_code,
            planned_start_hour_number,
            planned_start_minute,
            planned_start_time_label,
            weather_summary,
            weather_snapshot,
            weather_cancelled,
            weather_cancellation_reason,
            weather_cancelled_at
          `
          )
          .eq('race_id', raceId),
      ])

      if (cancelled) return

      if (raceDetailRes.error) {
        setError(raceDetailRes.error.message)
        setRace(null)
        setEntry(null)
        setStages([])
        setSelectedStage(null)
        setLoading(false)
        return
      }

      const releaseData = (raceDetailRes.data ?? {}) as RaceDetailResponse
      const entryRules = entryRulesRes.error
        ? null
        : ((entryRulesRes.data ?? null) as RaceEntryRulesRow | null)

      if (entryRulesRes.error) {
        console.warn('Could not load race entry rules for detail page:', entryRulesRes.error.message)
      }

      if (stageStartTimesRes.error) {
        console.warn('Could not load race stage start times:', stageStartTimesRes.error.message)
      }

      const stageStartTimeRows = stageStartTimesRes.error
        ? []
        : ((stageStartTimesRes.data ?? []) as RaceStageStartTimeRow[])
      const stageStartTimeById = new Map(
        stageStartTimeRows.map((row) => [row.id, row])
      )

      const loadedEntry = entryRules
        ? ({ ...(releaseData.entry ?? {}), ...entryRules } as RaceRewardsEntryOverview)
        : releaseData.entry ?? null
      const loadedRace = releaseData.race
        ? {
            ...releaseData.race,
            applications_status:
              releaseData.race.applications_status ??
              loadedEntry?.applications_status ??
              releaseData.applications_status ??
              null,
            applications_open_game_date:
              releaseData.race.applications_open_game_date ??
              loadedEntry?.applications_open_game_date ??
              null,
            applications_open_display:
              releaseData.race.applications_open_display ??
              loadedEntry?.applications_open_display ??
              null,
            applications_open_season_number:
              releaseData.race.applications_open_season_number ??
              loadedEntry?.applications_open_season_number ??
              null,
            applications_open_month_number:
              releaseData.race.applications_open_month_number ??
              loadedEntry?.applications_open_month_number ??
              null,
            applications_open_day_number:
              releaseData.race.applications_open_day_number ??
              loadedEntry?.applications_open_day_number ??
              null,
            applications_close_game_date:
              releaseData.race.applications_close_game_date ??
              loadedEntry?.applications_close_game_date ??
              null,
            applications_close_display:
              releaseData.race.applications_close_display ??
              loadedEntry?.applications_close_display ??
              null,
            applications_close_season_number:
              releaseData.race.applications_close_season_number ??
              loadedEntry?.applications_close_season_number ??
              null,
            applications_close_month_number:
              releaseData.race.applications_close_month_number ??
              loadedEntry?.applications_close_month_number ??
              null,
            applications_close_day_number:
              releaseData.race.applications_close_day_number ??
              loadedEntry?.applications_close_day_number ??
              null,
            min_teams: releaseData.race.min_teams ?? loadedEntry?.min_teams ?? null,
            target_teams: releaseData.race.target_teams ?? loadedEntry?.target_teams ?? null,
            max_teams: releaseData.race.max_teams ?? loadedEntry?.max_teams ?? null,
            min_riders_per_team:
              releaseData.race.min_riders_per_team ?? loadedEntry?.min_riders_per_team ?? null,
            max_riders_per_team:
              releaseData.race.max_riders_per_team ?? loadedEntry?.max_riders_per_team ?? null,
            prize_fund_cash:
              releaseData.race.prize_fund_cash ?? loadedEntry?.prize_fund_cash ?? null,
            accepted_teams:
              releaseData.race.accepted_teams ??
              loadedEntry?.accepted_teams ??
              releaseData.accepted_teams ??
              null,
            existing_application_status:
              releaseData.race.existing_application_status ??
              loadedEntry?.existing_application_status ??
              releaseData.existing_application_status ??
              null,
            team_list_announcement_game_date:
              releaseData.race.team_list_announcement_game_date ??
              loadedEntry?.team_list_announcement_game_date ??
              null,
            team_list_announcement_display:
              releaseData.race.team_list_announcement_display ??
              loadedEntry?.team_list_announcement_display ??
              null,
            team_list_announcement_season_number:
              releaseData.race.team_list_announcement_season_number ??
              loadedEntry?.team_list_announcement_season_number ??
              null,
            team_list_announcement_month_number:
              releaseData.race.team_list_announcement_month_number ??
              loadedEntry?.team_list_announcement_month_number ??
              null,
            team_list_announcement_day_number:
              releaseData.race.team_list_announcement_day_number ??
              loadedEntry?.team_list_announcement_day_number ??
              null,
            rider_submission_deadline_game_date:
              releaseData.race.rider_submission_deadline_game_date ??
              loadedEntry?.rider_submission_deadline_game_date ??
              null,
            rider_submission_deadline_display:
              releaseData.race.rider_submission_deadline_display ??
              loadedEntry?.rider_submission_deadline_display ??
              null,
            rider_submission_deadline_season_number:
              releaseData.race.rider_submission_deadline_season_number ??
              loadedEntry?.rider_submission_deadline_season_number ??
              null,
            rider_submission_deadline_month_number:
              releaseData.race.rider_submission_deadline_month_number ??
              loadedEntry?.rider_submission_deadline_month_number ??
              null,
            rider_submission_deadline_day_number:
              releaseData.race.rider_submission_deadline_day_number ??
              loadedEntry?.rider_submission_deadline_day_number ??
              null,
          }
        : null
      const loadedStages = hydrateStageDates(
        loadedRace,
        (Array.isArray(releaseData.stages) ? releaseData.stages : []).map((stage) => {
          const stageStartTime = stageStartTimeById.get(stage.id)

          return stageStartTime
            ? {
                ...stage,
                start_time_region_code:
                  stageStartTime.start_time_region_code ??
                  stage.start_time_region_code ??
                  null,
                planned_start_hour_number:
                  stageStartTime.planned_start_hour_number ??
                  stage.planned_start_hour_number ??
                  null,
                planned_start_minute:
                  stageStartTime.planned_start_minute ??
                  stage.planned_start_minute ??
                  null,
                planned_start_time_label:
                  stageStartTime.planned_start_time_label ??
                  stage.planned_start_time_label ??
                  null,
                weather_summary:
                  stageStartTime.weather_summary ??
                  stage.weather_summary ??
                  null,
                weather_snapshot:
                  Object.keys(getRecord(stageStartTime.weather_snapshot)).length > 0
                    ? stageStartTime.weather_snapshot
                    : stage.weather_snapshot ?? null,
                weather_cancelled:
                  stageStartTime.weather_cancelled ?? stage.weather_cancelled ?? false,
                weather_cancellation_reason:
                  stageStartTime.weather_cancellation_reason ??
                  stage.weather_cancellation_reason ??
                  null,
                weather_cancelled_at:
                  stageStartTime.weather_cancelled_at ??
                  stage.weather_cancelled_at ??
                  null,
              }
            : stage
        })
      )

      const gameDate = String(gameDateRes.data ?? '')
      const gameDateParts = Array.isArray(gameDatePartsRes.data)
        ? gameDatePartsRes.data[0]
        : gameDatePartsRes.data

      setCurrentGameDate(gameDate || null)
      setCurrentSeasonNumber(Number(gameDateParts?.season_number ?? 1))
      setCurrentMonthNumber(Number(gameDateParts?.month_number ?? 1))
      setCurrentDayNumber(Number(gameDateParts?.day_number ?? 1))

      setRace(loadedRace)
      setEntry(loadedEntry)
      setRaceEntryStatus(loadedRace?.existing_application_status ?? null)
      setStages(loadedStages)
      setSelectedStage(
        getStageForCurrentGameDate(loadedRace, loadedStages, gameDate || null)
      )

      try {
        let resolvedClubId: string | null = null

        const primaryClubRes = await raceDetailReadRpc('get_my_primary_club_id')

        if (!primaryClubRes.error && primaryClubRes.data) {
          resolvedClubId = primaryClubRes.data as string
        } else {
          const fallbackClubRes = await raceDetailReadRpc('get_my_club_id')
          if (!fallbackClubRes.error) {
            resolvedClubId = (fallbackClubRes.data as string | null) ?? null
          }
        }

        if (resolvedClubId && raceId) {
          const entryStatusRes = await supabase
            .from('race_team_entries')
            .select('status')
            .eq('club_id', resolvedClubId)
            .eq('race_id', raceId)
            .maybeSingle()

          if (!entryStatusRes.error) {
            setRaceEntryStatus(
              (entryStatusRes.data as { status?: string | null } | null)?.status ?? null
            )
          } else {
            setRaceEntryStatus(null)
          }
        } else {
          setRaceEntryStatus(loadedRace?.existing_application_status ?? null)
        }
      } catch {
        setRaceEntryStatus(loadedRace?.existing_application_status ?? null)
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    loadRaceDetail()

    return () => {
      cancelled = true
    }
  }, [raceId, raceDetailReloadKey])

  useEffect(() => {
    if (!raceId || !isUuid(raceId)) {
      setParticipantTeams([])
      setParticipantsLoading(false)
      return
    }

    let cancelled = false

    async function loadParticipants() {
      setParticipantsLoading(true)
      setParticipantsError(null)

      const { data: teamsData, error: teamsError } = await supabase
        .from('race_participant_teams_v1')
        .select('*')
        .eq('race_id', raceId)
        .eq('status', 'accepted')
        .order('club_name', { ascending: true })

      if (teamsError) {
        if (!cancelled) {
          setParticipantsError(teamsError.message)
          setParticipantTeams([])
          setParticipantsLoading(false)
        }
        return
      }

      const { data: ridersData, error: ridersError } = await supabase
        .from('race_participant_riders_v1')
        .select(
          `
          id,
          race_id,
          team_id,
          club_id,
          rider_id,
          rider_name_snapshot,
          team_name_snapshot,
          country_code_snapshot,
          age_snapshot,
          is_young_rider,
          start_number,
          role_snapshot,
          overall_snapshot,
          can_view_exact_overall,
          overall_range_label
        `
        )
        .eq('race_id', raceId)
        .order('start_number', { ascending: true })

      if (ridersError) {
        if (!cancelled) {
          setParticipantsError(ridersError.message)
          setParticipantTeams([])
          setParticipantsLoading(false)
        }
        return
      }

      const teams = await loadParticipantTeamLogos(
        normalizeRaceParticipantTeamViewRows(teamsData),
        raceId
      )
      const normalizedViewRiders = normalizeRaceParticipantRiderRows(ridersData)

      const { data: directRiderData, error: directRiderError } = await supabase
        .from('race_participant_riders')
        .select(
          `
          id,
          race_id,
          team_id,
          rider_id,
          rider_name_snapshot,
          team_name_snapshot,
          country_code_snapshot,
          age_snapshot,
          is_young_rider,
          start_number,
          role_snapshot,
          overall_snapshot,
          can_view_exact_overall,
          overall_range_label
        `
        )
        .eq('race_id', raceId)
        .order('start_number', { ascending: true })

      if (directRiderError) {
        console.warn('Could not load direct race participant riders:', directRiderError.message)
      }

      const directRiders = normalizeRaceParticipantRiderRows(directRiderData)
      const ridersByParticipantId = new Map<string, RaceParticipantRider>()

      // Insert direct/base rows first, then view rows second.
      // This makes race_participant_riders_v1 the source of truth for visible team names
      // while still keeping the base-table query as a fallback for missing riders.
      for (const rider of [...directRiders, ...normalizedViewRiders]) {
        ridersByParticipantId.set(rider.id || rider.rider_id, rider)
      }

      const riders = await hydrateParticipantRiderFullNames(
        sortParticipantRiders(Array.from(ridersByParticipantId.values()))
      )

      const teamsWithRiders = await hydrateParticipantTeamCurrentNames(
        attachRidersToParticipantTeams(teams, riders)
      )

      if (!cancelled) {
        setParticipantTeams(teamsWithRiders)
        setParticipantsLoading(false)
      }
    }

    loadParticipants()

    return () => {
      cancelled = true
    }
  }, [raceId])


  useEffect(() => {
    if (!selectedStage?.id) {
      setLiveState(null)
      return
    }

    let cancelled = false

    async function loadSelectedStageLiveState() {
      if (!selectedStage?.id) return

      const { data, error } = await raceDetailReadRpc(
        'get_race_stage_live_state_v1',
        {
          p_stage_id: selectedStage.id,
        }
      )

      if (cancelled) return

      if (error) {
        console.error(
          'Could not load race stage live state:',
          error
        )
        setLiveState(null)
        return
      }

      const value = Array.isArray(data) ? data[0] : data

      setLiveState(
        value && typeof value === 'object'
          ? (value as RaceStageLiveState)
          : null
      )
    }

    loadSelectedStageLiveState()

    const interval = window.setInterval(
      loadSelectedStageLiveState,
      5000
    )

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedStage?.id])

  useEffect(() => {
    const classificationRaceId = race?.id

    if (!classificationRaceId) {
      setAvailableClassificationStageIds([])
      return
    }

    let cancelled = false

    async function loadAvailableClassificationStages() {
      const { data, error } = await supabase
        .from('race_classification_standings')
        .select('after_stage_id')
        .eq('race_id', classificationRaceId)
        .eq('classification_type', 'general')
        .eq('entity_type', 'rider')

      if (cancelled) return

      if (error) {
        console.error(
          'Could not load available classification stages for leaders:',
          error
        )
        setAvailableClassificationStageIds([])
        return
      }

      setAvailableClassificationStageIds(
        Array.from(
          new Set(
            (data ?? [])
              .map((row) => row.after_stage_id)
              .filter(
                (stageId): stageId is string =>
                  typeof stageId === 'string' &&
                  stageId.length > 0
              )
          )
        )
      )
    }

    loadAvailableClassificationStages()

    return () => {
      cancelled = true
    }
  }, [race?.id])

  const latestClassificationStage = useMemo(() => {
    const availableStageIds = new Set(
      availableClassificationStageIds
    )

    return (
      [...stages]
        .filter((stage) =>
          availableStageIds.has(stage.id)
        )
        .sort(
          (left, right) =>
            Number(right.stage_number) -
            Number(left.stage_number)
        )[0] ?? null
    )
  }, [availableClassificationStageIds, stages])

  const classificationResultsStageId =
    latestClassificationStage?.id ?? null

  const selectedStageLiveState =
    liveState?.stage_id === selectedStage?.id
      ? liveState
      : null
  const hideRaceInformation = selectedStageLiveState?.is_live === true
  const lockReplaySpeed = selectedStageLiveState?.speed_locked === true

  const currentMonthStart = useMemo(() => {
    if (!currentGameDate) return null
    return getMonthStartFromGameDate(currentGameDate, currentDayNumber)
  }, [currentGameDate, currentDayNumber])

  const applicationsStatus = race?.applications_status ?? entry?.applications_status ?? null

  const normalizedRaceStatus = race?.status?.toLowerCase() ?? null
  const startlistLocked = isRaceStartlistLocked(normalizedRaceStatus)
  const raceLifecycleNotice = getRaceLifecycleNotice(normalizedRaceStatus)

  const effectiveTeamEntryStatus =
    raceEntryStatus ?? race?.existing_application_status ?? entry?.existing_application_status ?? null

  const raceDetailStatus = useMemo(() => {
    return (
      getRaceWeatherCancellationDisplayStatus(race) ??
      getRaceDetailStatusLabel(
        applicationsStatus,
        normalizedRaceStatus,
        effectiveTeamEntryStatus
      )
    )
  }, [race, applicationsStatus, normalizedRaceStatus, effectiveTeamEntryStatus])

  const canApplyForRaceButton = canApplyForRace(
    applicationsStatus,
    effectiveTeamEntryStatus,
    normalizedRaceStatus
  )
  const canCancelApplication = !startlistLocked && ['accepted', 'applied'].includes(
    effectiveTeamEntryStatus?.toLowerCase() ?? ''
  )
  const applicationActionInProgress = applicationActionLoading !== null

  function getRaceActionErrorMessage(value: unknown): string {
    if (!value) return 'Race action failed.'
    if (typeof value === 'string') return value
    if (typeof value === 'object' && 'message' in value) {
      const message = (value as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
    return 'Race action failed.'
  }


  function getRaceApplicationQuoteErrorMessage(value: unknown): string {
    if (!value) return 'Could not load application preview.'
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      const record = value as { message?: unknown; error?: unknown }
      if (typeof record.message === 'string' && record.message.trim()) return record.message
      if (typeof record.error === 'string' && record.error.trim()) return record.error
    }
    return 'Could not load application preview.'
  }

  function formatApplicationNumber(value?: number | null): string {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed.toLocaleString() : '—'
  }

  function formatApplicationChance(value?: number | null): string {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return '—'
    return `${Math.max(0, Math.min(100, Math.round(parsed)))}%`
  }

  function getApplicationChanceBarWidth(value?: number | null): string {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return '0%'
    return `${Math.max(0, Math.min(100, Math.round(parsed)))}%`
  }

  function getApplicationPreviewStatusText(quote: RaceApplicationQuote | null): string {
    if (!quote) return 'Loading application preview…'

    if (quote.existing_application_status === 'accepted') {
      return 'Your team is already accepted for this race.'
    }

    if (quote.existing_application_status === 'applied') {
      return 'Your team already has an application submitted for this race.'
    }

    if (quote.can_apply === false) {
      return quote.message ?? 'You cannot apply for this race right now.'
    }

    return 'Review your application preview before submitting.'
  }

  async function loadRaceApplicationQuote(): Promise<void> {
    if (!race?.id) return

    setApplicationQuoteLoading(true)
    setApplicationQuoteError(null)
    setApplicationQuote(null)

    const { data, error } = await supabase.functions.invoke('quote-race-application', {
      body: {
        race_id: race.id,
      },
    })

    if (error) {
      setApplicationQuoteError(getRaceApplicationQuoteErrorMessage(error))
      setApplicationQuoteLoading(false)
      return
    }

    const result = (data ?? {}) as RaceApplicationQuote

    if (result.success === false) {
      setApplicationQuote(result)
      setApplicationQuoteError(
        result.error ?? result.message ?? 'Could not load application preview.'
      )
      setApplicationQuoteLoading(false)
      return
    }

    setApplicationQuote(result)
    setApplicationQuoteLoading(false)
  }

  function syncLocalEntryStatus(nextStatus: string | null): void {
    setRaceEntryStatus(nextStatus)
    setRace((previousRace) =>
      previousRace
        ? {
            ...previousRace,
            existing_application_status: nextStatus,
          }
        : previousRace
    )
    setEntry((previousEntry) =>
      previousEntry
        ? {
            ...previousEntry,
            existing_application_status: nextStatus,
          }
        : previousEntry
    )
  }

  async function handleNextRaceDetailTutorialStep() {
    const currentStep = raceDetailTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= raceDetailTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = raceDetailTutorialSteps[nextIndex]

      await saveTutorialProgress('race-detail', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('race-detail', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'race-preparation')
    navigate('/dashboard/race-preparation')
  }

  async function handleFinishRaceDetailTutorialForNow() {
    const currentStep = raceDetailTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('race-detail', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseRaceDetailTutorial() {
    const currentStep = raceDetailTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress(
      'race-detail',
      'started',
      currentStep?.key ?? null,
    )

    setTutorialMode('closed')
  }

  async function handleApplyForRace(): Promise<void> {
    if (!race?.id || applicationActionInProgress) return

    setApplicationActionError(null)
    setApplicationActionMessage(null)
    setShowApplicationModal(true)
    await loadRaceApplicationQuote()
  }

  async function handleConfirmApplyForRace(): Promise<void> {
    if (!race?.id || applicationActionInProgress) return

    setApplicationActionLoading('apply')
    setApplicationActionError(null)
    setApplicationActionMessage(null)

    const { data, error } = await supabase.functions.invoke('apply-for-race', {
      body: {
        race_id: race.id,
      },
    })

    if (error) {
      setApplicationActionError(getRaceActionErrorMessage(error))
      setApplicationActionLoading(null)
      return
    }

    const result = (data ?? {}) as {
      success?: boolean
      error?: string
      message?: string
      entry_status?: string | null
    }

    if (result.success === false) {
      setApplicationActionError(result.error ?? result.message ?? 'Race application failed.')
      setApplicationActionLoading(null)
      return
    }

    syncLocalEntryStatus(result.entry_status ?? 'applied')
    setApplicationActionMessage(result.message ?? 'Application submitted.')
    setShowApplicationModal(false)
    setApplicationQuote(null)
    setApplicationQuoteError(null)
    setRaceDetailReloadKey((value) => value + 1)
    setApplicationActionLoading(null)
  }

  async function handleCancelApplication(): Promise<void> {
    if (!race?.id || applicationActionInProgress || !canCancelApplication) return

    setApplicationActionLoading('cancel')
    setApplicationActionError(null)
    setApplicationActionMessage(null)

    const { data, error } = await supabase.functions.invoke('cancel-race-application', {
      body: {
        race_id: race.id,
      },
    })

    if (error) {
      setApplicationActionError(getRaceActionErrorMessage(error))
      setApplicationActionLoading(null)
      return
    }

    const result = (data ?? {}) as {
      success?: boolean
      error?: string
      message?: string
      entry_status?: string | null
    }

    if (result.success === false) {
      setApplicationActionError(result.error ?? result.message ?? 'Cancel application failed.')
      setApplicationActionLoading(null)
      return
    }

    syncLocalEntryStatus(result.entry_status ?? 'withdrawn')
    setApplicationActionMessage(result.message ?? 'Application cancelled.')
    setRaceDetailReloadKey((value) => value + 1)
    setApplicationActionLoading(null)
  }

  function scrollStages(direction: 'left' | 'right'): void {
    const node = stageSliderRef.current
    if (!node) return

    node.scrollBy({
      left: direction === 'left' ? -320 : 320,
      behavior: 'smooth',
    })
  }

  function getProfileNavigationReturnState(context?: {
    raceInfoExpanded?: boolean
    raceInfoTab?: RaceInfoTab
  }) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`

    return {
      from: 'race_detail',
      returnTo,
      returnLabel: '← Back',
      returnRaceId: raceId ?? undefined,
      returnScrollX: typeof window !== 'undefined' ? window.scrollX : 0,
      returnScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      raceInfoExpanded: context?.raceInfoExpanded ?? true,
      raceInfoTab: context?.raceInfoTab ?? 'participants',
    }
  }

  function handleOpenTeamProfile(
    teamId: string,
    context?: { raceInfoExpanded?: boolean; raceInfoTab?: RaceInfoTab }
  ) {
    const normalizedTeamId = teamId?.trim()

    if (!normalizedTeamId) return

    const returnState = getProfileNavigationReturnState(context)
    saveRaceProfileReturnState(returnState)

    if (onOpenTeamProfile) {
      onOpenTeamProfile(normalizedTeamId)
      return
    }

    navigate(`/dashboard/teams/${normalizedTeamId}`, {
      state: returnState,
    })
  }

  function handleOpenRiderProfile(
    riderId: string,
    context?: { raceInfoExpanded?: boolean; raceInfoTab?: RaceInfoTab }
  ) {
    const normalizedRiderId = riderId?.trim()

    if (!normalizedRiderId) return

    const returnState = getProfileNavigationReturnState(context)
    saveRaceProfileReturnState(returnState)

    const viewerTeamIds = getViewerTeamIds(resolvedViewerClubId, viewerClubFamilyIds)
    const viewerRaceRiderIds = getUserRiderIdSet(participantTeams, viewerTeamIds)
    const isViewerRaceRider = viewerRaceRiderIds.has(normalizedRiderId)

    if (isViewerRaceRider) {
      navigate(`/dashboard/my-riders/${normalizedRiderId}`, {
        state: returnState,
      })
      return
    }

    if (onOpenRiderProfile) {
      onOpenRiderProfile(normalizedRiderId)
      return
    }

    navigate(`/dashboard/external-riders/${normalizedRiderId}`, {
      state: returnState,
    })
  }

  function renderStageCard(stage: RaceStage, compact = false) {
    const active = selectedStage?.id === stage.id
    const weatherCanceled = isStageWeatherCanceled(stage)
    const cancellationRiskReason = getStageWeatherCancellationRiskReason(stage)

    return (
      <button
        key={stage.id}
        type="button"
        data-stage-id={stage.id}
        onClick={() => setSelectedStage(stage)}
        className={[
          compact
            ? 'min-h-[92px] min-w-[220px] snap-start rounded-2xl border px-4 py-3 text-left transition'
            : 'min-h-[92px] rounded-2xl border px-4 py-3 text-left transition',
          weatherCanceled
            ? 'border-sky-200 bg-sky-50 text-sky-950 shadow-sm'
            : active
              ? 'border-yellow-200 bg-yellow-50 text-slate-950 shadow-sm'
              : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
        ].join(' ')}
      >
        <div className="text-sm font-medium text-slate-500">
          {getStageDateTimeLabel(
            stage,
            race,
            currentMonthStart,
            currentSeasonNumber,
            currentMonthNumber
          )}
        </div>

        <div className="mt-1 truncate text-base font-semibold">
          {`Stage ${stage.stage_number}`}
        </div>

        <div className="mt-1 truncate text-xs opacity-80">
          {formatStageRoute(stage)}
        </div>

        <div className="mt-1 text-xs opacity-75">
          {humanizeCode(stage.terrain_type)} · {formatKm(stage.distance_km)}
        </div>

        {weatherCanceled ? (
          <div className="mt-2 inline-flex rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-800 ring-1 ring-red-200">
            Canceled · {getStageWeatherCancellationReasonLabel(stage)}
          </div>
        ) : cancellationRiskReason ? (
          <div className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-800">
            Weather cancellation likely
          </div>
        ) : null}
      </button>
    )
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          Loading race detail…
        </div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleBackToPreviousPage}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          {error ?? 'Race not found.'}
        </div>
      </div>
    )
  }

  if (replayStageIdFromUrl && replayStage) {
    return (
      <SimpleRaceReplayPage
        race={race}
        stage={replayStage}
        participantTeams={participantTeams}
        onClose={handleCloseReplayPage}
      />
    )
  }


  return (
    <>
      {showApplicationModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Race application preview
                </div>

                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {race.name}
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  {getApplicationPreviewStatusText(applicationQuote)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (applicationActionInProgress) return
                  setShowApplicationModal(false)
                  setApplicationQuoteError(null)
                }}
                disabled={applicationActionInProgress}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Close
              </button>
            </div>

            {applicationQuoteLoading ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                Loading application preview…
              </div>
            ) : null}

            {applicationQuoteError ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {applicationQuoteError}
              </div>
            ) : null}

            {applicationQuote ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acceptance estimate
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-3xl font-bold text-slate-950">
                        {formatApplicationChance(applicationQuote.estimated_acceptance_chance_pct)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        {applicationQuote.chance_label ?? 'Estimated chance'}
                      </div>
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      {applicationQuote.competition_pressure_label ?? 'Competition pressure'}
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800"
                      style={{
                        width: getApplicationChanceBarWidth(
                          applicationQuote.estimated_acceptance_chance_pct
                        ),
                      }}
                    />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {applicationQuote.chance_summary ??
                      'This is an estimate. Final acceptance is decided when applications close.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Team prestige / commitment
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-3xl font-bold text-slate-950">
                        {formatApplicationNumber(applicationQuote.commitment_score)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        Application strength
                      </div>
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      Score preview: {formatApplicationNumber(applicationQuote.acceptance_score_preview)}
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800"
                      style={{
                        width: getApplicationChanceBarWidth(applicationQuote.commitment_score),
                      }}
                    />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Default score is 50. Completing races improves this; missing startlists reduces it.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <div>
                      <div className="text-xs text-slate-500">Applied teams</div>
                      <div className="mt-1 font-bold text-slate-950">
                        {formatApplicationNumber(applicationQuote.submitted_application_teams)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Accepted teams</div>
                      <div className="mt-1 font-bold text-slate-950">
                        {formatApplicationNumber(applicationQuote.accepted_teams)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Target teams</div>
                      <div className="mt-1 font-bold text-slate-950">
                        {formatApplicationNumber(applicationQuote.target_teams)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Max teams</div>
                      <div className="mt-1 font-bold text-slate-950">
                        {formatApplicationNumber(applicationQuote.max_teams)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">Riders required</div>
                      <div className="mt-1 font-semibold text-slate-950">
                        {formatApplicationNumber(applicationQuote.min_riders_per_team)}–{formatApplicationNumber(applicationQuote.max_riders_per_team)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">Team list announcement</div>
                      <div className="mt-1 font-semibold text-slate-950">
                        {applicationQuote.team_list_announcement_label ?? '—'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">Rider deadline</div>
                      <div className="mt-1 font-semibold text-slate-950">
                        {applicationQuote.rider_submission_deadline_label ?? '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (applicationActionInProgress) return
                  setShowApplicationModal(false)
                  setApplicationQuoteError(null)
                }}
                disabled={applicationActionInProgress}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Not now
              </button>

              <button
                type="button"
                onClick={handleConfirmApplyForRace}
                disabled={
                  applicationActionInProgress ||
                  applicationQuoteLoading ||
                  !applicationQuote ||
                  applicationQuote.can_apply === false
                }
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  applicationActionInProgress ||
                  applicationQuoteLoading ||
                  !applicationQuote ||
                  applicationQuote.can_apply === false
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-yellow-200 bg-yellow-50 text-slate-950 hover:bg-yellow-100'
                }`}
              >
                {applicationActionLoading === 'apply' ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleBackToPreviousPage}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back
          </button>
        </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {race.category}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {race.is_stage_race ? `${race.stage_count} stages` : 'One-day race'}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getRaceDetailStatusBadgeClass(
                  raceDetailStatus
                )}`}
              >
                {raceDetailStatus}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <RaceTitleFlag code={race.country_code} />

              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                {race.name}
              </h1>
            </div>

            <div className="mt-3 text-sm font-medium text-slate-600">
              {formatRaceHeaderHostLine(
                race,
                currentMonthStart,
                currentSeasonNumber,
                currentMonthNumber
              )}
            </div>

            {race.description ? (
              <div className="mt-2 max-w-3xl text-sm text-slate-600">
                {race.description}
              </div>
            ) : null}

            <RaceEntryHeaderSummary
              race={race}
              entry={entry}
              acceptedTeamsCount={
                participantTeams.length > 0
                  ? participantTeams.length
                  : race.accepted_teams ?? entry?.accepted_teams ?? 0
              }
            />

            {raceLifecycleNotice ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {raceLifecycleNotice}
              </div>
            ) : null}

            {getRaceWeatherCancellationStatus(race) ? (
              <div className="mt-5">
                <WeatherCancellationNotice race={race} />
              </div>
            ) : null}

            {applicationActionError ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {applicationActionError}
              </div>
            ) : null}

            {applicationActionMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {applicationActionMessage}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {startlistLocked ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  Startlist locked
                </span>
              ) : (
                <>
                  {canApplyForRaceButton ? (
                    <button
                      type="button"
                      onClick={handleApplyForRace}
                      disabled={applicationActionInProgress}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        applicationActionInProgress
                          ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-yellow-200 bg-yellow-50 text-slate-900 hover:bg-yellow-100'
                      }`}
                    >
                      {applicationActionLoading === 'apply' ? 'Applying…' : 'Apply for race'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleCancelApplication}
                    disabled={!canCancelApplication || applicationActionInProgress}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      canCancelApplication && !applicationActionInProgress
                        ? 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                        : 'cursor-not-allowed border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {applicationActionLoading === 'cancel' ? 'Cancelling…' : 'Cancel application'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex min-h-[188px] items-center justify-center p-6 xl:self-stretch">
            {race.logo_url ? (
              <img
                src={race.logo_url}
                alt={`${race.name} logo`}
                className="max-h-[220px] max-w-full object-contain"
              />
            ) : (
              <div className="text-center text-sm text-slate-500">
                Tour logo not available yet
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stages
          </div>

          {stages.length > 5 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scrollStages('left')}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                ←
              </button>

              <button
                type="button"
                onClick={() => scrollStages('right')}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                →
              </button>
            </div>
          ) : null}
        </div>

        {stages.length <= 5 ? (
          <div
            className={[
              'grid gap-2',
              stages.length <= 1
                ? 'grid-cols-1'
                : stages.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : stages.length === 3
                    ? 'grid-cols-1 md:grid-cols-3'
                    : stages.length === 4
                      ? 'grid-cols-1 md:grid-cols-4'
                      : 'grid-cols-1 md:grid-cols-5',
            ].join(' ')}
          >
            {stages.map((stage) => renderStageCard(stage))}
          </div>
        ) : (
          <div
            ref={stageSliderRef}
            className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1"
          >
            {stages.map((stage) => renderStageCard(stage, true))}
          </div>
        )}
      </div>

      {selectedStage ? (
        <div className="w-full space-y-6">
          <RaceStageProfilePanel
            selectedStageId={selectedStage?.id ?? null}
            classificationResultsStageId={classificationResultsStageId}
            selectedStage={selectedStage}
            race={race}
            currentGameDate={currentGameDate}
            currentClubId={resolvedViewerClubId}
            viewerClubFamilyIds={viewerClubFamilyIds}
            participantTeams={participantTeams}
            hideLiveResults={hideRaceInformation}
            onOpenReplay={handleOpenReplayPage}
          />

          {!hideRaceInformation ? (
            <RaceResultsHub
              race={race}
              stages={stages}
              participantTeams={participantTeams}
              participantsLoading={participantsLoading}
              participantsError={participantsError}
              currentClubId={resolvedViewerClubId}
              viewerClubFamilyIds={viewerClubFamilyIds}
              teamEntryStatus={effectiveTeamEntryStatus}
              restoreRaceInformationOpen={getRaceInformationRestoreState().expanded}
              restoreRaceInformationTab={getRaceInformationRestoreState().tab}
              onOpenTeamProfile={handleOpenTeamProfile}
              onOpenRiderProfile={handleOpenRiderProfile}
              stageResultsOverride={stageResultsOverride}
              engineTestModeLabel={engineTestModeLabel}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
          No stages found for this race.
        </div>
      )}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={raceDetailTutorialSteps[tutorialStepIndex].title}
          body={raceDetailTutorialSteps[tutorialStepIndex].body}
          stepLabel={`Race profile tutorial ${tutorialStepIndex + 1} of ${
            raceDetailTutorialSteps.length
          }`}
          primaryAction={
            raceDetailTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
          }
          secondaryAction={
            tutorialStepIndex === raceDetailTutorialSteps.length - 1
              ? raceDetailTutorialSteps[tutorialStepIndex].secondaryAction
              : 'Skip tutorial'
          }
          onPrimary={handleNextRaceDetailTutorialStep}
          onSecondary={
            tutorialStepIndex === raceDetailTutorialSteps.length - 1
              ? handleFinishRaceDetailTutorialForNow
              : handleFinishRaceDetailTutorialForNow
          }
          onClose={handleCloseRaceDetailTutorial}
        />
      ) : null}

      </div>
    </>
  )
}
