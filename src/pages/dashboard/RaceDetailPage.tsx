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
  intermediate_sprints_json?: RaceStageSprint[] | null
  mountain_climbs_json?: RaceStageMountainClimb[] | null
  weather_summary?: string | null
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
  age_snapshot: number | null
  is_young_rider: boolean | null
  start_number: number | null
  role_snapshot?: string | null
  overall_snapshot?: number | null
  can_view_exact_overall?: boolean | null
  overall_range_label?: string | null
}

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

type RaceReplayEntityType = 'group' | 'rider' | 'team' | string

type RaceReplayFrame = {
  id: string
  simulation_run_id: string
  race_id: string
  stage_id: string
  frame_number: number
  race_seconds: number
  km_marker: number | string
  group_code: string
  group_label: string
  group_order: number
  gap_seconds: number
  avg_speed_kmh: number | string
  rider_ids: string[]
  rider_names: string[]
  team_names: string[]
  metadata: Record<string, unknown> | null

  entity_type?: RaceReplayEntityType | null
  entity_id?: string | null
  entity_key?: string | null
  entity_label?: string | null
  start_order?: number | null
  competition_start_offset_seconds?: number | null
  replay_start_offset_seconds?: number | null
  entity_elapsed_seconds?: number | null
  provisional_rank?: number | null
  entity_finished?: boolean | null
}


const RACE_REPLAY_FRAME_PAGE_SIZE = 1000
const RACE_REPLAY_FRAME_MAX_ROWS = 50000

async function loadAllRaceStageReplayFrames(
  stageId: string
): Promise<{
  data: RaceReplayFrame[]
  error: unknown | null
}> {
  const allFrames: RaceReplayFrame[] = []
  let from = 0

  while (from < RACE_REPLAY_FRAME_MAX_ROWS) {
    const to = from + RACE_REPLAY_FRAME_PAGE_SIZE - 1

    const { data, error } = await supabase
      .rpc('get_race_stage_replay_frames_v1', {
        p_stage_id: stageId,
      })
      .range(from, to)

    if (error) {
      return {
        data: allFrames,
        error,
      }
    }

    const pageRows = Array.isArray(data)
      ? (data as RaceReplayFrame[])
      : []

    allFrames.push(...pageRows)

    if (pageRows.length < RACE_REPLAY_FRAME_PAGE_SIZE) {
      return {
        data: allFrames,
        error: null,
      }
    }

    from += RACE_REPLAY_FRAME_PAGE_SIZE
  }

  return {
    data: allFrames,
    error: new Error(
      `Replay frame load exceeded ${RACE_REPLAY_FRAME_MAX_ROWS} rows for stage ${stageId}.`
    ),
  }
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

type ReplayStandingRow = {
  rider_id: string
  rider_name: string
  team_name: string
  rider_country_code: string | null
  group_code: string
  group_label: string
  group_order: number
  gap_seconds: number
  gc_rank?: number | null
  gc_gap_seconds?: number | null
  isGcLeader?: boolean
  isPointsLeader?: boolean
  isClimberLeader?: boolean
  timeTrialLabel?: string | null
  timeTrialStartOrder?: number | null
  timeTrialState?: string | null
  liveElapsedSeconds?: number | null
  liveGapSeconds?: number | null
  splitElapsedSeconds?: number | null
  splitGapSeconds?: number | null
  preStageFreshnessPct?: number | null
  liveEnergyPct?: number | null
  stageEnergyUsedPct?: number | null
  standingEntityType?: 'rider' | 'team' | string | null
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

type RacePreStageLeader = {
  classification_type?: string | null
  rider_id?: string | null
  team_id?: string | null
  rank?: number | null
  name?: string | null
  team_name?: string | null
  total_time_seconds?: number | null
  gap_seconds?: number | null
  points?: number | null
}

type RacePreStageLeaderSnapshot = {
  source?: string | null
  has_snapshot?: boolean
  captured_at?: string | null
  simulation_run_id?: string | null
  race_id?: string | null
  stage_id?: string | null
  stage_number?: number | null
  previous_stage_id?: string | null
  previous_stage_number?: number | null
  has_established_leaders?: boolean
  general?: RacePreStageLeader | null
  mountain?: RacePreStageLeader | null
  points?: RacePreStageLeader | null
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

const MAX_TIME_TRIAL_VISIBLE_MOVING_ENTITIES = 11
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

function formatStandingRiderName(name?: string | null): string {
  const normalizedName = name?.trim().replace(/\s+/g, ' ')

  if (!normalizedName) return 'Unknown rider'

  /*
   * Keep normal names unchanged. Only compact names that would otherwise
   * wrap inside the narrow Stage Standing rider column.
   */
  if (normalizedName.length <= 15) return normalizedName

  const nameParts = normalizedName.split(' ').filter(Boolean)

  if (nameParts.length < 2) return normalizedName

  const firstName = nameParts[0]
  const lastName = nameParts[nameParts.length - 1]

  if (!firstName || !lastName) return normalizedName

  return `${firstName.charAt(0).toUpperCase()}. ${lastName}`
}


function clampPercentValue(value: number | string | null | undefined): number | null {
  const parsed = asNumber(value)

  if (parsed === null) return null

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function getRecordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  return value as Record<string, unknown>
}

function getNestedRecordValue(
  source: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  if (!source) return null

  return getRecordValue(source[key])
}

function getRiderEnergyMetricFromRecord(
  record: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!record) return null

  for (const key of keys) {
    const value = clampPercentValue(record[key] as number | string | null | undefined)

    if (value !== null) return value
  }

  return null
}

function getRiderEnergyRecordFromFrame(
  frame: RaceReplayFrame,
  riderId: string
): Record<string, unknown> | null {
  const metadata = frame.metadata ?? {}

  const riderEnergyById = getNestedRecordValue(metadata, 'rider_energy_v1')
  const riderEnergySnapshotById = getNestedRecordValue(metadata, 'rider_energy_snapshot_v1')
  const riderEnergyMapById = getNestedRecordValue(metadata, 'rider_energy_by_id')

  return (
    getNestedRecordValue(riderEnergyById, riderId) ??
    getNestedRecordValue(riderEnergySnapshotById, riderId) ??
    getNestedRecordValue(riderEnergyMapById, riderId)
  )
}

function getRiderEnergyPercentFromMap(
  frame: RaceReplayFrame,
  riderId: string,
  keys: string[]
): number | null {
  const metadata = frame.metadata ?? {}

  for (const key of keys) {
    const valueMap = getNestedRecordValue(metadata, key)
    const value = clampPercentValue(
      valueMap?.[riderId] as number | string | null | undefined
    )

    if (value !== null) return value
  }

  return null
}

function getEstimatedReplayRiderEnergySnapshot({
  frame,
  riderId,
  riderIndex,
  currentKm,
  stageDistanceKm,
}: {
  frame: RaceReplayFrame
  riderId: string
  riderIndex: number
  currentKm: number
  stageDistanceKm: number
}): {
  preStageFreshnessPct: number
  liveEnergyPct: number
  stageEnergyUsedPct: number
} {
  const metadata = frame.metadata ?? {}
  const riderEnergyRecord = getRiderEnergyRecordFromFrame(frame, riderId)
  const baseGroupCode = getReplayBaseGroupCode(frame.group_code)
  const groupSize = getReplayEntitySize(frame)
  const gapSeconds = Math.max(0, Number(frame.gap_seconds ?? 0))
  const stageProgress =
    stageDistanceKm > 0
      ? Math.max(0, Math.min(1, currentKm / stageDistanceKm))
      : 0
  const activeEnergyFloor =
    baseGroupCode !== 'dropped_group' && baseGroupCode !== 'outside_group'
      ? getEarlyActiveEnergyFloor(stageProgress)
      : null

  const explicitPreStageFreshness =
    getRiderEnergyMetricFromRecord(riderEnergyRecord, [
      'pre_stage_freshness_pct',
      'preStageFreshnessPct',
      'freshness_pct',
      'freshnessPct',
    ]) ??
    getRiderEnergyPercentFromMap(frame, riderId, [
      'rider_pre_stage_freshness_pct',
      'pre_stage_freshness_pct_by_rider_id',
      'rider_freshness_pct',
    ])

  const explicitLiveEnergy =
    getRiderEnergyMetricFromRecord(riderEnergyRecord, [
      'live_energy_pct',
      'liveEnergyPct',
      'energy_remaining_pct',
      'remaining_energy_pct',
      'stage_energy_remaining_pct',
    ]) ??
    getRiderEnergyPercentFromMap(frame, riderId, [
      'rider_live_energy_pct',
      'live_energy_pct_by_rider_id',
      'rider_stage_energy_remaining_pct',
    ])

  const explicitStageEnergyUsed =
    getRiderEnergyMetricFromRecord(riderEnergyRecord, [
      'stage_energy_used_pct',
      'energy_used_pct',
      'used_energy_pct',
    ]) ??
    getRiderEnergyPercentFromMap(frame, riderId, [
      'rider_stage_energy_used_pct',
      'stage_energy_used_pct_by_rider_id',
    ])

  const metadataFatigue =
    getRiderEnergyMetricFromRecord(riderEnergyRecord, [
      'pre_stage_fatigue',
      'pre_stage_fatigue_pct',
      'starting_fatigue',
      'fatigue',
    ]) ??
    getRiderEnergyPercentFromMap(frame, riderId, [
      'rider_pre_stage_fatigue_pct',
      'pre_stage_fatigue_by_rider_id',
      'rider_fatigue_pct',
    ])

  const preStageFreshnessPct = Math.max(
    1,
    Math.min(
      100,
      explicitPreStageFreshness ??
        (metadataFatigue !== null ? Math.max(0, 100 - metadataFatigue) : 100)
    )
  )

  if (explicitLiveEnergy !== null) {
    const liveEnergyPct = Math.max(0, Math.min(100, explicitLiveEnergy))

    return {
      preStageFreshnessPct,
      /*
       * Backend rider_energy_v1 is the source of truth.
       * Do not apply the early active-energy floor to explicit backend values:
       * that floor was only meant for old frames without energy metadata.
       * Applying it here hides climb/KOM drain and makes riders look too fresh.
       */
      liveEnergyPct,
      stageEnergyUsedPct:
        explicitStageEnergyUsed !== null
          ? Math.max(0, Math.min(100, Math.max(explicitStageEnergyUsed, 100 - liveEnergyPct)))
          : Math.max(0, 100 - liveEnergyPct),
    }
  }

  const isSmallFrontGroup =
    baseGroupCode === 'front_group' && groupSize > 0 && groupSize <= 18

  const groupEffortMultiplier =
    isSmallFrontGroup
      ? 1.95
      : baseGroupCode === 'chase_group'
        ? 1.55
        : baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group'
          ? 1.2
          : 1

  const frontPositionEffort =
    riderIndex <= 2
      ? 1.12
      : riderIndex <= 6
        ? 1.05
        : 1

  const weatherEffort =
    metadata.rain_jacket_required === true ||
    metadata.rain_jacket_required === 'true' ||
    metadata.rain_jacket_weather_reason
      ? 1.08
      : 1

  const freshnessDebt = Math.max(0, 100 - preStageFreshnessPct)
  const riderVariation = ((riderIndex * 7) % 11) - 5

  const fallbackEnergyUsedPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        stageProgress *
          52 *
          groupEffortMultiplier *
          frontPositionEffort *
          weatherEffort +
          (baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group'
            ? Math.min(46, gapSeconds * 0.32) + freshnessDebt * 0.28 + riderVariation
            : 0)
      )
    )
  )

  const stageEnergyUsedPct = explicitStageEnergyUsed ?? fallbackEnergyUsedPct
  const rawLiveEnergyPct = Math.max(0, Math.min(100, 100 - stageEnergyUsedPct))
  const liveEnergyPct =
    activeEnergyFloor !== null
      ? Math.max(rawLiveEnergyPct, activeEnergyFloor)
      : rawLiveEnergyPct

  return {
    preStageFreshnessPct,
    /*
     * Fallback estimate also treats green as stage-local energy. Dropped/B
     * groups without backend energy metadata are penalized by gap + low
     * freshness so they no longer display as permanent 100% green.
     */
    liveEnergyPct,
    stageEnergyUsedPct: Math.max(0, Math.min(100, 100 - liveEnergyPct)),
  }
}

function RiderEnergyBars({
  preStageFreshnessPct,
  liveEnergyPct,
}: {
  preStageFreshnessPct?: number | null
  liveEnergyPct?: number | null
}) {
  const freshnessPct = Math.max(1, clampPercentValue(preStageFreshnessPct) ?? 100)
  const energyPct = clampPercentValue(liveEnergyPct) ?? 100

  return (
    <div
      className="space-y-1"
      title={`Pre-stage freshness ${freshnessPct}% · live energy ${energyPct}%`}
    >
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-red-100">
          <div
            className="h-full rounded-full bg-red-500"
            style={{ width: `${freshnessPct}%` }}
          />
        </div>

        <span className="w-7 text-right text-[9px] font-semibold text-red-700">
          {freshnessPct}%
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${energyPct}%` }}
          />
        </div>

        <span className="w-7 text-right text-[9px] font-semibold text-emerald-700">
          {energyPct}%
        </span>
      </div>
    </div>
  )
}

function hasWeather(stage: RaceStage): boolean {
  const weather = stage.weather_snapshot ?? {}

  return Object.keys(weather).length > 0 && weather.source !== 'missing_country_code'
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
      return 'Cancelled'
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
      return 'Cancelled'
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
  if (normalizedRaceStatus === 'cancelled') return 'Cancelled'

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
    case 'Cancelled':
      return 'bg-red-100 text-red-700'
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

function getStageProfilePoints(stage: RaceStage | null): StageProfilePoint[] {
  if (!stage?.metadata || typeof stage.metadata !== 'object') return []

  const routeProfile = (stage.metadata as Record<string, unknown>)['route_profile_v1']
  if (!routeProfile || typeof routeProfile !== 'object') return []

  const profilePoints = (routeProfile as Record<string, unknown>)['profile_points']
  if (!Array.isArray(profilePoints)) return []

  return profilePoints
    .map((point) => {
      if (!point || typeof point !== 'object') return null

      const rawKm = (point as Record<string, unknown>)['km']
      const rawElevation = (point as Record<string, unknown>)['elevation_m']

      const km = Number(rawKm)
      const elevation_m = Number(rawElevation)

      if (!Number.isFinite(km) || !Number.isFinite(elevation_m)) return null

      return { km, elevation_m }
    })
    .filter((point): point is StageProfilePoint => point !== null)
    .sort((a, b) => a.km - b.km)
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

type ReplayLeaderBadgeType = 'gc' | 'cl' | 'pts'

type ReplayGroupLine = {
  code: string
  label: string
  shortLabel: string
  gapSeconds: number
  kmOffset: number
  size: number | null
  actualKm?: number
  kmMarker?: number
  riderCount?: number
  specialLeaderTypes?: ReplayLeaderBadgeType[]
  entityType?: RaceReplayEntityType
  teamName?: string
  entityState?: string
  gapLabel?: string
  timeTrialEntityKey?: string
  usesSyntheticProfileGap?: boolean
}

function getReplayBaseGroupCode(code: string): string {
  if (
    code === 'front_group' ||
    code.startsWith('front_group_')
  ) {
    return 'front_group'
  }

  if (
    code === 'chase_group' ||
    code.startsWith('chase_group_')
  ) {
    return 'chase_group'
  }

  if (code === 'main_peloton') {
    return 'main_peloton'
  }

  if (
    code === 'dropped_group' ||
    code.startsWith('dropped_group_')
  ) {
    return 'dropped_group'
  }

  if (
    code === 'outside_group' ||
    code.startsWith('outside_group_')
  ) {
    return 'outside_group'
  }

  return code
}

function isPelotonGroup(
  code?: string | null
): boolean {
  if (!code) return false

  return (
    getReplayBaseGroupCode(code) ===
    'main_peloton'
  )
}

function getReplayGroupShortLabel(
  code: string,
  groupOrder?: number | null,
  pelotonGroupOrder?: number | null
): string {
  const baseGroupCode = getReplayBaseGroupCode(code)

  if (baseGroupCode === 'main_peloton') {
    return 'P'
  }

  if (
    (baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group') &&
    (pelotonGroupOrder === null ||
      pelotonGroupOrder === undefined ||
      groupOrder === null ||
      groupOrder === undefined ||
      groupOrder <= pelotonGroupOrder)
  ) {
    return baseGroupCode === 'outside_group' ? 'B2' : 'B1'
  }

  if (
    groupOrder !== null &&
    groupOrder !== undefined &&
    pelotonGroupOrder !== null &&
    pelotonGroupOrder !== undefined
  ) {
    /*
     * Label road groups by their relation to the Peloton.
     *
     * Ahead of Peloton:
     * physical order 1 → G1
     * physical order 2 → G2
     *
     * Peloton:
     * physical order 3 → P
     *
     * Behind Peloton:
     * physical order 4 → B1
     * physical order 5 → B2
     */
    if (groupOrder > pelotonGroupOrder) {
      return `B${Math.max(
        1,
        groupOrder - pelotonGroupOrder
      )}`
    }

    return `G${Math.max(
      1,
      groupOrder
    )}`
  }

  /*
   * Fallback for old replay data.
   */
  switch (baseGroupCode) {
    case 'front_group':
      return 'G1'

    case 'chase_group':
      return 'G2'

    case 'dropped_group':
      return 'B1'

    case 'outside_group':
      return 'B2'

    default:
      return 'G'
  }
}

function getReplayGroupStroke(
  code: string
): string {
  switch (getReplayBaseGroupCode(code)) {
    case 'front_group':
      return '#059669'

    case 'chase_group':
      return '#dc2626'

    case 'main_peloton':
      return '#2563eb'

    case 'dropped_group':
      return '#111827'

    case 'outside_group':
      return '#64748b'

    default:
      return '#334155'
  }
}


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
   * If the backend already normalized km_marker from gap_seconds, trust it.
   * Otherwise the frontend applies a second synthetic gap and can make P/B
   * markers look wrong even after the SQL fix.
   */
  if (backendNormalized || !Number.isFinite(gapSeconds) || gapSeconds <= 0) {
    return Math.max(0, Math.min(maxKm, actualKm))
  }

  const speedKmh = Math.max(28, Math.min(46, Number(avgSpeedKmh ?? 38)))
  const physicalGapKm = (gapSeconds * speedKmh) / 3600
  const minimumVisibleGapKm =
    gapSeconds >= 180 ? 1.8 :
    gapSeconds >= 90 ? 1.0 :
    gapSeconds >= 30 ? 0.4 :
    0.12
  const maximumVisibleGapKm =
    gapSeconds >= 180 ? 3.6 :
    gapSeconds >= 90 ? 2.4 :
    gapSeconds >= 30 ? 1.5 :
    0.6
  const gapKm = Math.min(
    maximumVisibleGapKm,
    Math.max(minimumVisibleGapKm, physicalGapKm)
  )

  let displayKm = leaderKm - gapKm

  if (previousGroupKm !== null && previousGroupKm !== undefined) {
    displayKm = Math.min(displayKm, previousGroupKm - 0.12)
  }

  return Math.max(0, Math.min(maxKm, displayKm))
}

function getEarlyActiveEnergyFloor(stageProgress: number): number | null {
  if (!Number.isFinite(stageProgress)) return null

  /*
   * Green is stage-local energy. Every rider starts the stage near 100%.
   * Red freshness controls how fast green drains; it should not make a rider
   * start a stage with 40–70% green in the opening kilometres.
   */
  if (stageProgress <= 0.03) return 98
  if (stageProgress <= 0.08) return 95
  if (stageProgress <= 0.15) return 91
  if (stageProgress <= 0.25) return 86
  if (stageProgress <= 0.40) return 78

  return null
}

function getReplaySpecialLeaderTypes(
  groupCode: string,
  gcLeaderGroupCode: string | null,
  mountainLeaderGroupCode: string | null,
  pointsLeaderGroupCode: string | null
): ReplayLeaderBadgeType[] {
  const types: ReplayLeaderBadgeType[] = []

  if (gcLeaderGroupCode === groupCode) {
    types.push('gc')
  }

  if (mountainLeaderGroupCode === groupCode) {
    types.push('cl')
  }

  if (pointsLeaderGroupCode === groupCode) {
    types.push('pts')
  }

  return types
}

function getReplaySpecialLeaderTitle(
  type: ReplayLeaderBadgeType
): string {
  switch (type) {
    case 'gc':
      return 'Stage-start general classification leader group'

    case 'cl':
      return 'Stage-start climber classification leader group'

    case 'pts':
      return 'Stage-start points classification leader group'
  }
}

function getReplayStandingLeaderTabs(
  row: ReplayStandingRow
): ReplayLeaderBadgeType[] {
  const tabs: ReplayLeaderBadgeType[] = []

  if (row.isGcLeader) tabs.push('gc')
  if (row.isPointsLeader) tabs.push('pts')
  if (row.isClimberLeader) tabs.push('cl')

  return tabs
}

function ReplayLeaderTab({
  type,
}: {
  type: ReplayLeaderBadgeType
}) {
  if (type === 'gc') {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
        GC
      </span>
    )
  }

  if (type === 'pts') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
        PTS
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-red-600"
      style={{
        backgroundImage:
          'radial-gradient(circle at 3px 3px, #dc2626 0 1.5px, transparent 1.8px)',
        backgroundSize: '7px 7px',
      }}
    >
      CL
    </span>
  )
}

function renderSpecialLeaderBadge(
  type: ReplayLeaderBadgeType
) {
  if (type === 'gc') {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-slate-900">
        GC
      </span>
    )
  }

  if (type === 'cl') {
    return (
      <span
        className="inline-flex items-center rounded-full border border-red-400 bg-white px-2 py-0.5 text-[10px] font-bold text-red-600"
        style={{
          backgroundImage:
            'radial-gradient(circle at 3px 3px, #dc2626 0 2px, transparent 2.3px)',
          backgroundSize: '7px 7px',
        }}
      >
        CL
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500 bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
      PTS
    </span>
  )
}

function buildReplayGroupLines(groups: RaceReportGroupSummary[]): ReplayGroupLine[] {
  return groups.map((group) => {
    const gapSeconds = group.gapSeconds ?? 0

    return {
      code: group.code,
      label: group.label,
      shortLabel: getReplayGroupShortLabel(group.code),
      gapSeconds,
      kmOffset: Math.min(16, Math.max(0, gapSeconds / 15)),
      size: group.size,
    }
  })
}

function getReplayEntityType(frame: RaceReplayFrame): RaceReplayEntityType {
  return frame.entity_type || 'group'
}

function getReplayFrameLabel(frame: RaceReplayFrame): string {
  return (
    frame.entity_label ||
    frame.group_label ||
    frame.rider_names?.[0] ||
    'Replay entity'
  )
}

function getReplayFrameTeamName(frame: RaceReplayFrame): string {
  const metadata = frame.metadata ?? {}

  const metadataTeamName =
    typeof metadata.team_name === 'string'
      ? metadata.team_name
      : null

  return (
    metadataTeamName ||
    frame.team_names?.[0] ||
    ''
  )
}

function getReplayEntityState(frame: RaceReplayFrame): string {
  const metadata = frame.metadata ?? {}

  return typeof metadata.entity_state === 'string'
    ? metadata.entity_state
    : frame.entity_finished
      ? 'finished'
      : 'racing'
}

function getReplayEntitySize(frame: RaceReplayFrame): number {
  const entityType = getReplayEntityType(frame)

  if (entityType === 'rider') return 1

  const metadata = frame.metadata ?? {}
  const metadataGroupSize = Number(metadata.group_size)

  if (Number.isFinite(metadataGroupSize) && metadataGroupSize > 0) {
    return metadataGroupSize
  }

  return frame.rider_ids?.length ?? frame.rider_names?.length ?? 0
}

function getReplayFrameGapSeconds(frame: RaceReplayFrame): number {
  const entityType = getReplayEntityType(frame)
  const metadata = frame.metadata ?? {}

  const provisionalGap = asNumber(
    metadata.provisional_gap_seconds as
      | number
      | string
      | null
      | undefined
  )

  const finalGap = asNumber(
    metadata.final_gap_seconds as
      | number
      | string
      | null
      | undefined
  )

  const gap =
    entityType === 'group'
      ? Number(frame.gap_seconds ?? 0)
      : provisionalGap ?? finalGap ?? Number(frame.gap_seconds ?? 0)

  return Number.isFinite(gap) ? Math.max(0, gap) : 0
}

function getReplayFrameGapLabel(frame: RaceReplayFrame): string {
  const gap = getReplayFrameGapSeconds(frame)

  if (!Number.isFinite(gap) || gap <= 0) return 'Leader'

  const minutes = Math.floor(gap / 60)
  const seconds = Math.round(gap % 60)

  if (minutes <= 0) return `+${seconds}s`

  return `+${minutes}:${String(seconds).padStart(2, '0')}`
}

function getReplayTimeTrialStartOrder(
  frame: RaceReplayFrame
): number | null {
  const order = Number(frame.start_order)

  return Number.isFinite(order) && order > 0
    ? order
    : null
}

function getReplayTimeTrialMarkerShortLabel(
  frame: RaceReplayFrame
): string {
  const entityType = getReplayEntityType(frame)
  const order = getReplayTimeTrialStartOrder(frame)
  const rank = Number(frame.provisional_rank)

  /*
   * Time-trial labels must describe the fixed start identity,
   * not the changing provisional rank.
   *
   * Example: the first rider to start stays R1 until the finish,
   * even if another rider later becomes provisional leader.
   */
  if (entityType === 'team') {
    if (order !== null) return `T${order}`
    if (Number.isFinite(rank) && rank > 0) return `T${rank}`
    return 'TTT'
  }

  if (entityType === 'rider') {
    if (order !== null) return `R${order}`
    if (Number.isFinite(rank) && rank > 0) return `R${rank}`
    return 'R'
  }

  return getReplayGroupShortLabel(frame.group_code)
}

function getReplayTimeTrialFrameKey(
  frame: RaceReplayFrame
): string {
  return (
    frame.entity_id ||
    frame.rider_ids?.[0] ||
    frame.entity_key ||
    frame.group_code ||
    frame.id
  )
}

function getReplayTimeTrialLiveElapsedSeconds(
  frame: RaceReplayFrame
): number | null {
  const state = getReplayEntityState(frame)

  if (state === 'waiting') return null

  const metadata = frame.metadata ?? {}

  const explicitElapsed =
    asNumber(frame.entity_elapsed_seconds) ??
    asNumber(
      metadata.entity_elapsed_seconds as
        | number
        | string
        | null
        | undefined
    ) ??
    asNumber(
      metadata.elapsed_seconds as
        | number
        | string
        | null
        | undefined
    )

  if (explicitElapsed !== null) {
    return Math.max(0, explicitElapsed)
  }

  const raceSeconds = asNumber(frame.race_seconds)
  const startOffset =
    asNumber(frame.competition_start_offset_seconds) ??
    asNumber(frame.replay_start_offset_seconds) ??
    asNumber(
      metadata.competition_start_offset_seconds as
        | number
        | string
        | null
        | undefined
    ) ??
    0

  if (raceSeconds === null) return null

  const elapsed = raceSeconds - startOffset

  return Number.isFinite(elapsed) && elapsed >= 0
    ? elapsed
    : null
}

function getReplayTimeTrialStartOffsetSeconds(
  frame: RaceReplayFrame
): number | null {
  const metadata = frame.metadata ?? {}

  return (
    asNumber(frame.competition_start_offset_seconds) ??
    asNumber(frame.replay_start_offset_seconds) ??
    asNumber(
      metadata.competition_start_offset_seconds as
        | number
        | string
        | null
        | undefined
    ) ??
    asNumber(
      metadata.replay_start_offset_seconds as
        | number
        | string
        | null
        | undefined
    ) ??
    null
  )
}

function getReplayTimeTrialRaceClockSeconds(
  frame: RaceReplayFrame
): number | null {
  /*
   * For prologue / ITT / TTT the backend RPC must return the
   * real global competition clock in top-level race_seconds.
   *
   * Older rows stored a compressed 0-900 replay clock there and
   * kept the true race clock in metadata.competition_seconds.
   * The database has now been patched so race_seconds is the
   * source of truth. Prefer it first so the replay does not stop
   * when the first rider finishes.
   */
  const storedRaceSeconds = asNumber(frame.race_seconds)

  if (
    storedRaceSeconds !== null &&
    Number.isFinite(storedRaceSeconds)
  ) {
    return Math.max(0, storedRaceSeconds)
  }

  const elapsedSeconds = getReplayTimeTrialLiveElapsedSeconds(frame)
  const startOffsetSeconds = getReplayTimeTrialStartOffsetSeconds(frame)

  if (elapsedSeconds !== null && startOffsetSeconds !== null) {
    return Math.max(0, startOffsetSeconds + elapsedSeconds)
  }

  return null
}

function getReplayTimeTrialCurrentRaceClockSeconds(
  frames: RaceReplayFrame[]
): number {
  const liveClockSeconds = frames
    .map(getReplayTimeTrialRaceClockSeconds)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
    )
    .map(Number)

  if (liveClockSeconds.length > 0) {
    return Math.max(...liveClockSeconds)
  }

  const storedRaceSeconds = frames
    .map((frame) => asNumber(frame.race_seconds))
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
    )
    .map(Number)

  return storedRaceSeconds.length > 0
    ? Math.max(...storedRaceSeconds)
    : 0
}


type TimeTrialReplayClockBounds = {
  startSeconds: number
  endSeconds: number
}

function getReplayTimeTrialFrameClockForSort(
  frame: RaceReplayFrame
): number {
  const raceClock = getReplayTimeTrialRaceClockSeconds(frame)

  if (raceClock !== null && Number.isFinite(raceClock)) {
    return raceClock
  }

  const startOffset = getReplayTimeTrialStartOffsetSeconds(frame)
  if (startOffset !== null && Number.isFinite(startOffset)) {
    return startOffset
  }

  const frameNumber = Number(frame.frame_number)
  return Number.isFinite(frameNumber) ? frameNumber : 0
}

function getReplayTimeTrialClockBounds(
  frames: RaceReplayFrame[],
  primaryEntityType: 'rider' | 'team' | null
): TimeTrialReplayClockBounds | null {
  if (!primaryEntityType) return null

  const clockSeconds = frames
    .filter(
      (frame) => getReplayEntityType(frame) === primaryEntityType
    )
    .map(getReplayTimeTrialRaceClockSeconds)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(value)
    )

  if (clockSeconds.length === 0) return null

  /*
   * Time-trial replay should span the whole global race clock,
   * not only the first rider's local frame sequence.
   */
  const start = 0
  const end = Math.max(...clockSeconds)

  if (!Number.isFinite(end) || end <= start) return null

  return {
    startSeconds: start,
    endSeconds: end,
  }
}

function getInterpolatedTimeTrialReplayFrame(
  previousFrame: RaceReplayFrame,
  nextFrame: RaceReplayFrame | null,
  raceSeconds: number
): RaceReplayFrame {
  if (!nextFrame) return previousFrame

  const previousSeconds = getReplayTimeTrialRaceClockSeconds(previousFrame)
  const nextSeconds = getReplayTimeTrialRaceClockSeconds(nextFrame)

  if (
    previousSeconds === null ||
    nextSeconds === null ||
    !Number.isFinite(previousSeconds) ||
    !Number.isFinite(nextSeconds) ||
    nextSeconds <= previousSeconds
  ) {
    return previousFrame
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      (raceSeconds - previousSeconds) /
        (nextSeconds - previousSeconds)
    )
  )

  const previousKm = toKmNumber(previousFrame.km_marker)
  const nextKm = toKmNumber(nextFrame.km_marker)
  const interpolatedKm =
    previousKm + (nextKm - previousKm) * ratio

  const previousElapsed =
    asNumber(previousFrame.entity_elapsed_seconds) ??
    asNumber(
      previousFrame.metadata?.entity_elapsed_seconds as
        | number
        | string
        | null
        | undefined
    )

  const nextElapsed =
    asNumber(nextFrame.entity_elapsed_seconds) ??
    asNumber(
      nextFrame.metadata?.entity_elapsed_seconds as
        | number
        | string
        | null
        | undefined
    )

  const interpolatedElapsed =
    previousElapsed !== null && nextElapsed !== null
      ? previousElapsed + (nextElapsed - previousElapsed) * ratio
      : previousElapsed

  const state =
    raceSeconds >= nextSeconds
      ? getReplayEntityState(nextFrame)
      : getReplayEntityState(previousFrame)

  const metadata = {
    ...(previousFrame.metadata ?? {}),
    entity_state: state,
    interpolation_model: 'time_trial_linear_between_replay_frames_v1',
    interpolated_from_frame_number: previousFrame.frame_number,
    interpolated_to_frame_number: nextFrame.frame_number,
    interpolated_ratio: ratio,
    competition_seconds: raceSeconds,
    entity_elapsed_seconds:
      interpolatedElapsed === null ? undefined : interpolatedElapsed,
  }

  return {
    ...previousFrame,
    id: `${previousFrame.id}:interp:${Math.round(raceSeconds * 1000)}`,
    race_seconds: raceSeconds,
    km_marker: Number(interpolatedKm.toFixed(3)),
    entity_elapsed_seconds:
      interpolatedElapsed === null
        ? previousFrame.entity_elapsed_seconds
        : Number(interpolatedElapsed.toFixed(3)),
    entity_finished:
      state === 'finished' ? true : previousFrame.entity_finished,
    metadata,
  }
}

function getReplayTimeTrialFramesAtRaceSeconds(
  frames: RaceReplayFrame[],
  raceSeconds: number
): RaceReplayFrame[] {
  const framesByEntityKey = new Map<string, RaceReplayFrame[]>()

  frames
    .filter((frame) => {
      const entityType = getReplayEntityType(frame)
      return entityType === 'rider' || entityType === 'team'
    })
    .forEach((frame) => {
      const entityType = getReplayEntityType(frame)
      const key = `${entityType}:${getReplayTimeTrialFrameKey(frame)}`
      framesByEntityKey.set(
        key,
        [...(framesByEntityKey.get(key) ?? []), frame]
      )
    })

  const selectedFrames: RaceReplayFrame[] = []

  framesByEntityKey.forEach((entityFrames) => {
    const sortedFrames = [...entityFrames].sort(
      (left, right) =>
        getReplayTimeTrialFrameClockForSort(left) -
          getReplayTimeTrialFrameClockForSort(right) ||
        Number(left.frame_number) - Number(right.frame_number)
    )

    const waitingFrame =
      sortedFrames.find(
        (frame) => getReplayEntityState(frame) === 'waiting'
      ) ?? sortedFrames[0]

    const activeFrames = sortedFrames.filter((frame) => {
      const state = getReplayEntityState(frame)
      return (
        state !== 'waiting' &&
        getReplayTimeTrialRaceClockSeconds(frame) !== null
      )
    })

    const firstActiveFrame = activeFrames[0]
    const finishedFrame = activeFrames.find(
      (frame) => getReplayEntityState(frame) === 'finished'
    )
    const lastActiveFrame =
      finishedFrame ?? activeFrames[activeFrames.length - 1]

    const firstActiveSeconds = firstActiveFrame
      ? getReplayTimeTrialRaceClockSeconds(firstActiveFrame)
      : null
    const lastActiveSeconds = lastActiveFrame
      ? getReplayTimeTrialRaceClockSeconds(lastActiveFrame)
      : null

    if (
      firstActiveSeconds === null ||
      !Number.isFinite(firstActiveSeconds)
    ) {
      if (waitingFrame) selectedFrames.push(waitingFrame)
      return
    }

    if (raceSeconds < firstActiveSeconds) {
      if (waitingFrame) selectedFrames.push(waitingFrame)
      return
    }

    if (
      lastActiveFrame &&
      lastActiveSeconds !== null &&
      Number.isFinite(lastActiveSeconds) &&
      raceSeconds >= lastActiveSeconds
    ) {
      selectedFrames.push(lastActiveFrame)
      return
    }

    const previousFrame = [...activeFrames]
      .reverse()
      .find((frame) => {
        const frameSeconds = getReplayTimeTrialRaceClockSeconds(frame)
        return (
          frameSeconds !== null &&
          Number.isFinite(frameSeconds) &&
          frameSeconds <= raceSeconds
        )
      })

    const nextFrame = activeFrames.find((frame) => {
      const frameSeconds = getReplayTimeTrialRaceClockSeconds(frame)
      return (
        frameSeconds !== null &&
        Number.isFinite(frameSeconds) &&
        frameSeconds > raceSeconds
      )
    })

    selectedFrames.push(
      previousFrame
        ? getInterpolatedTimeTrialReplayFrame(
            previousFrame,
            nextFrame ?? null,
            raceSeconds
          )
        : firstActiveFrame
    )
  })

  return selectedFrames.sort(sortReplayFrames)
}

function getVisibleTimeTrialProfileFrames(
  frames: RaceReplayFrame[]
): RaceReplayFrame[] {
  const timeTrialFrames = frames.filter((frame) => {
    const entityType = getReplayEntityType(frame)
    return entityType === 'rider' || entityType === 'team'
  })

  if (timeTrialFrames.length === 0) return frames

  /*
   * For TTT stages, use the team marker on the profile.
   * Otherwise, ITT/prologue stages use rider markers.
   */
  const profileFrames = timeTrialFrames.some(
    (frame) => getReplayEntityType(frame) === 'team'
  )
    ? timeTrialFrames.filter(
        (frame) => getReplayEntityType(frame) === 'team'
      )
    : timeTrialFrames.filter(
        (frame) => getReplayEntityType(frame) === 'rider'
      )

  const waitingFrames = profileFrames
    .filter(
      (frame) => getReplayEntityState(frame) === 'waiting'
    )
    .sort((left, right) => {
      const leftOrder =
        getReplayTimeTrialStartOrder(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder =
        getReplayTimeTrialStartOrder(right) ?? Number.MAX_SAFE_INTEGER

      return leftOrder - rightOrder
    })

  const activeFrames = profileFrames
    .filter((frame) => {
      const state = getReplayEntityState(frame)
      return state !== 'waiting' && state !== 'finished'
    })
    .sort((left, right) => {
      const leftOrder =
        getReplayTimeTrialStartOrder(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder =
        getReplayTimeTrialStartOrder(right) ?? Number.MAX_SAFE_INTEGER

      if (leftOrder !== rightOrder) return leftOrder - rightOrder

      return getReplayFrameLabel(left).localeCompare(
        getReplayFrameLabel(right)
      )
    })

  /*
   * Rendering too many simultaneously-moving TT markers can overload
   * the profile and makes the replay unreadable. Keep the newest active
   * starters visible on the profile, while standings/commentary still
   * keep the full field.
   */
  const visibleActiveFrames = activeFrames.slice(
    Math.max(
      0,
      activeFrames.length - MAX_TIME_TRIAL_VISIBLE_MOVING_ENTITIES
    )
  )

  const nextWaitingFrame = waitingFrames[0]

  return [...visibleActiveFrames, nextWaitingFrame]
    .filter((frame): frame is RaceReplayFrame => Boolean(frame))
    .sort((left, right) => {
      const leftState = getReplayEntityState(left)
      const rightState = getReplayEntityState(right)

      if (leftState === 'waiting' && rightState !== 'waiting') return 1
      if (leftState !== 'waiting' && rightState === 'waiting') return -1

      const leftOrder =
        getReplayTimeTrialStartOrder(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder =
        getReplayTimeTrialStartOrder(right) ?? Number.MAX_SAFE_INTEGER

      return leftOrder - rightOrder
    })
}

type TimeTrialSplitBadgeInfo = {
  label: string
  elapsedSeconds: number
  gapSeconds: number | null
}

function getTimeTrialSplitSnapshotAtKm(
  entityFrames: RaceReplayFrame[],
  splitKm: number
): { elapsedSeconds: number; raceSeconds: number } | null {
  const sortedFrames = [...entityFrames].sort((left, right) => {
    const leftClock = getReplayTimeTrialRaceClockSeconds(left)
    const rightClock = getReplayTimeTrialRaceClockSeconds(right)

    if (leftClock !== null && rightClock !== null && leftClock !== rightClock) {
      return leftClock - rightClock
    }

    return Number(left.frame_number) - Number(right.frame_number)
  })

  const nextFrame = sortedFrames.find((frame) => {
    const km = asNumber(frame.km_marker) ?? 0
    const elapsed = getReplayTimeTrialLiveElapsedSeconds(frame)
    const raceSeconds = getReplayTimeTrialRaceClockSeconds(frame)

    return (
      km >= splitKm &&
      elapsed !== null &&
      raceSeconds !== null &&
      getReplayEntityState(frame) !== 'waiting'
    )
  })

  if (!nextFrame) return null

  const nextKm = asNumber(nextFrame.km_marker) ?? splitKm
  const nextElapsed = getReplayTimeTrialLiveElapsedSeconds(nextFrame)
  const nextRaceSeconds = getReplayTimeTrialRaceClockSeconds(nextFrame)

  if (nextElapsed === null || nextRaceSeconds === null) return null

  const previousFrame = [...sortedFrames]
    .reverse()
    .find((frame) => {
      const km = asNumber(frame.km_marker) ?? 0
      const elapsed = getReplayTimeTrialLiveElapsedSeconds(frame)
      const raceSeconds = getReplayTimeTrialRaceClockSeconds(frame)

      return (
        km < splitKm &&
        elapsed !== null &&
        raceSeconds !== null &&
        getReplayEntityState(frame) !== 'waiting'
      )
    })

  if (!previousFrame) {
    return {
      elapsedSeconds: nextElapsed,
      raceSeconds: nextRaceSeconds,
    }
  }

  const previousKm = asNumber(previousFrame.km_marker) ?? 0
  const previousElapsed = getReplayTimeTrialLiveElapsedSeconds(previousFrame)
  const previousRaceSeconds = getReplayTimeTrialRaceClockSeconds(previousFrame)

  if (previousElapsed === null || previousRaceSeconds === null) {
    return {
      elapsedSeconds: nextElapsed,
      raceSeconds: nextRaceSeconds,
    }
  }

  const kmSpan = nextKm - previousKm

  if (!Number.isFinite(kmSpan) || kmSpan <= 0) {
    return {
      elapsedSeconds: nextElapsed,
      raceSeconds: nextRaceSeconds,
    }
  }

  const ratio = Math.max(
    0,
    Math.min(1, (splitKm - previousKm) / kmSpan)
  )

  return {
    elapsedSeconds:
      previousElapsed + ratio * (nextElapsed - previousElapsed),
    raceSeconds:
      previousRaceSeconds + ratio * (nextRaceSeconds - previousRaceSeconds),
  }
}

function buildTimeTrialSplitBadgeByEntityKey({
  allFrames,
  currentFrames,
  splitKm,
  currentRaceSeconds,
}: {
  allFrames: RaceReplayFrame[]
  currentFrames: RaceReplayFrame[]
  splitKm: number | null
  currentRaceSeconds: number | null
}): Map<string, TimeTrialSplitBadgeInfo> {
  const badgeByKey = new Map<string, TimeTrialSplitBadgeInfo>()

  if (splitKm === null || splitKm <= 0) return badgeByKey

  const primaryEntityType = getTimeTrialReplayPrimaryEntityType(currentFrames)

  if (!primaryEntityType) return badgeByKey

  const liveClockSeconds =
    currentRaceSeconds ?? getReplayTimeTrialCurrentRaceClockSeconds(currentFrames)

  const visiblePassedKeys = new Set(
    currentFrames
      .filter((frame) => getReplayEntityType(frame) === primaryEntityType)
      .filter((frame) => getReplayEntityState(frame) !== 'waiting')
      .filter((frame) => (asNumber(frame.km_marker) ?? 0) >= splitKm)
      .map(getReplayTimeTrialFrameKey)
      .filter(Boolean)
  )

  if (visiblePassedKeys.size === 0) return badgeByKey

  const framesByEntityKey = new Map<string, RaceReplayFrame[]>()

  allFrames
    .filter((frame) => getReplayEntityType(frame) === primaryEntityType)
    .forEach((frame) => {
      const key = getReplayTimeTrialFrameKey(frame)
      if (!key) return

      framesByEntityKey.set(
        key,
        [...(framesByEntityKey.get(key) ?? []), frame]
      )
    })

  const splitRows: {
    key: string
    elapsedSeconds: number
    raceSeconds: number
  }[] = []

  framesByEntityKey.forEach((entityFrames, key) => {
    const splitSnapshot = getTimeTrialSplitSnapshotAtKm(
      entityFrames,
      splitKm
    )

    if (!splitSnapshot) return

    if (splitSnapshot.raceSeconds > liveClockSeconds + 0.5) return

    splitRows.push({
      key,
      elapsedSeconds: splitSnapshot.elapsedSeconds,
      raceSeconds: splitSnapshot.raceSeconds,
    })
  })

  const bestElapsedSeconds = splitRows.reduce(
    (best, row) => Math.min(best, row.elapsedSeconds),
    Number.POSITIVE_INFINITY
  )

  if (!Number.isFinite(bestElapsedSeconds)) return badgeByKey

  splitRows.forEach((row) => {
    if (!visiblePassedKeys.has(row.key)) return

    const gapSeconds = Math.max(
      0,
      row.elapsedSeconds - bestElapsedSeconds
    )

    badgeByKey.set(row.key, {
      elapsedSeconds: row.elapsedSeconds,
      gapSeconds,
      label:
        gapSeconds <= 0.5
          ? formatGapValue(row.elapsedSeconds)
          : `+${formatGapValue(gapSeconds)}`,
    })
  })

  return badgeByKey
}

function getTimeTrialReplayPrimaryEntityType(
  frames: RaceReplayFrame[]
): 'rider' | 'team' | null {
  if (frames.some((frame) => getReplayEntityType(frame) === 'team')) {
    return 'team'
  }

  if (frames.some((frame) => getReplayEntityType(frame) === 'rider')) {
    return 'rider'
  }

  return null
}

function getTimeTrialReplayEntityCount(
  frames: RaceReplayFrame[]
): number {
  const primaryEntityType = getTimeTrialReplayPrimaryEntityType(frames)

  if (!primaryEntityType) return 0

  return new Set(
    frames
      .filter((frame) => getReplayEntityType(frame) === primaryEntityType)
      .map(getReplayTimeTrialFrameKey)
      .filter(Boolean)
  ).size
}

function getReplayInitialProgress(
  frames: RaceReplayFrame[]
): number {
  if (getTimeTrialReplayPrimaryEntityType(frames)) {
    return 0
  }

  const maxFrameNumber = frames.reduce(
    (maximum, frame) =>
      Math.max(maximum, Number(frame.frame_number) || 0),
    0
  )

  if (maxFrameNumber <= 0) return 0

  const firstActiveFrameNumber = frames
    .filter((frame) => {
      const entityType = getReplayEntityType(frame)
      return entityType === 'rider' || entityType === 'team'
    })
    .filter((frame) => {
      const state = getReplayEntityState(frame)

      return (
        state !== 'waiting' &&
        getReplayTimeTrialLiveElapsedSeconds(frame) !== null
      )
    })
    .map((frame) => Number(frame.frame_number))
    .filter((frameNumber) => Number.isFinite(frameNumber))
    .sort((left, right) => left - right)[0]

  if (!Number.isFinite(firstActiveFrameNumber)) return 0

  return Math.max(
    0,
    Math.min(
      1,
      Number(firstActiveFrameNumber) / maxFrameNumber
    )
  )
}

const TIME_TRIAL_REPLAY_MIN_DURATION_MS = 162 * 1000
const TIME_TRIAL_REPLAY_MAX_DURATION_MS = 36 * 60 * 1000
const TIME_TRIAL_REPLAY_MS_PER_ENTITY = 13.5 * 1000

function getReplayPlaybackDurationMs(
  frames: RaceReplayFrame[]
): number {
  const timeTrialEntityCount = getTimeTrialReplayEntityCount(frames)

  if (timeTrialEntityCount <= 0) {
    return 15 * 60 * 1000
  }

  /*
   * TT / prologue / TTT replay is intentionally slower than the
   * first implementation. The previous rule used 5 seconds per
   * entity, which made short prologues pass too quickly for users
   * to watch the profile, standings, and commentary together.
   *
   * New rule:
   * - minimum 162 seconds at 1x
   * - 13.5 seconds per rider/team entity at 1x
   * - maximum 36 minutes at 1x for very large TT fields
   *
   * This makes the normal 1x speed another 20% slower than v14
   * while keeping the smooth interpolation behaviour. Do not add a 0.5x button;
   * the normal 1x mode itself is the readable/watchable speed.
   */
  return Math.min(
    TIME_TRIAL_REPLAY_MAX_DURATION_MS,
    Math.max(
      TIME_TRIAL_REPLAY_MIN_DURATION_MS,
      timeTrialEntityCount * TIME_TRIAL_REPLAY_MS_PER_ENTITY
    )
  )
}

function getRoadReplayEffectivePlaybackSpeed(
  speed: ReplayPlaybackSpeed
): number {
  /*
   * Road replay has many dynamic split/merge moments. The UI buttons still
   * represent faster watching, but we soften the real multiplier so 4x/8x
   * does not jump several kilometres whenever a new group is created.
   */
  switch (speed) {
    case 8:
      return 4
    case 4:
      return 2.4
    case 2:
      return 1.55
    case 1:
    default:
      return 1
  }
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

function getTimeTrialStageKindLabel(stage: RaceStage): string {
  const rawKind = (
    stage.profile_type ||
    stage.terrain_type ||
    ''
  ).toLowerCase()

  if (rawKind.includes('team_time_trial')) {
    return 'team time trial'
  }

  if (rawKind.includes('prologue')) {
    return 'prologue'
  }

  return 'individual time trial'
}

function getReplayWeatherIntroSentence(
  weather: { temperature: string; wind: string; rain: string }
): string {
  const parts = [
    weather.temperature !== '—' ? `${weather.temperature}` : null,
    weather.wind !== '—' ? `wind ${weather.wind}` : null,
    weather.rain !== '—' ? `rain ${weather.rain}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'weather data is limited'
}

function sortReplayFrames(
  left: RaceReplayFrame,
  right: RaceReplayFrame
): number {
  const leftType = getReplayEntityType(left)
  const rightType = getReplayEntityType(right)

  const typeOrder = (type: RaceReplayEntityType) => {
    if (type === 'group') return 1
    if (type === 'team') return 2
    if (type === 'rider') return 3
    return 9
  }

  const typeDiff = typeOrder(leftType) - typeOrder(rightType)
  if (typeDiff !== 0) return typeDiff

  const leftOrder =
    leftType === 'group'
      ? Number(left.group_order) || Number.MAX_VALUE
      : Number(left.start_order) ||
        Number(left.group_order) ||
        Number.MAX_VALUE

  const rightOrder =
    rightType === 'group'
      ? Number(right.group_order) || Number.MAX_VALUE
      : Number(right.start_order) ||
        Number(right.group_order) ||
        Number.MAX_VALUE

  if (leftOrder !== rightOrder) return leftOrder - rightOrder

  const leftRank =
    Number(left.provisional_rank) ||
    Number.MAX_VALUE

  const rightRank =
    Number(right.provisional_rank) ||
    Number.MAX_VALUE

  if (leftRank !== rightRank) return leftRank - rightRank

  return getReplayFrameLabel(left).localeCompare(
    getReplayFrameLabel(right)
  )
}


function getRoadReplayFrameKey(frame: RaceReplayFrame): string {
  const entityType = getReplayEntityType(frame)

  /*
   * Road group frames represent the same race group across time.
   *
   * Do NOT key road groups by entity_id/entity_key/group_order here:
   * some generated replay rows give the same physical group different
   * entity ids/keys or a different order later in the stage. If we key
   * by those changing values, the frontend treats one physical Peloton
   * as several different groups and then renders duplicate P/G markers
   * and duplicate riders in Stage Standing.
   */
  if (entityType === 'group') {
    return `group:${frame.group_code || getReplayBaseGroupCode(frame.group_code) || 'group'}`
  }

  return [
    entityType,
    frame.entity_id ?? '',
    frame.entity_key ?? '',
    frame.group_code ?? '',
  ].join(':')
}

function getRoadRiderDedupKey(
  riderId: string | null | undefined,
  riderName: string | null | undefined,
  teamName: string | null | undefined
): string | null {
  const normalizedRiderId = riderId?.trim()
  if (normalizedRiderId) return `id:${normalizedRiderId}`

  const normalizedName = riderName?.trim().toLowerCase()
  if (!normalizedName) return null

  const normalizedTeam = teamName?.trim().toLowerCase() ?? ''
  return `name:${normalizedName}|team:${normalizedTeam}`
}

function getDedupedRoadGroupFrames(
  frames: RaceReplayFrame[]
): RaceReplayFrame[] {
  const claimedRiderKeys = new Set<string>()

  const getDedupClaimPriority = (frame: RaceReplayFrame): number => {
    const baseGroupCode = getReplayBaseGroupCode(frame.group_code)

    /*
     * A rider can sometimes still be present in the peloton row and in a
     * split/B-group row in the same replay frame. For display we must keep the
     * rider in the real separated group, not in the peloton fallback row.
     */
    if (baseGroupCode === 'front_group' || baseGroupCode === 'chase_group') {
      return 1
    }

    if (baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group') {
      return 2
    }

    if (baseGroupCode === 'main_peloton') {
      return 9
    }

    return 5
  }

  return [...frames]
    .sort((left, right) => {
      const priorityDiff = getDedupClaimPriority(left) - getDedupClaimPriority(right)
      if (priorityDiff !== 0) return priorityDiff
      return sortReplayFrames(left, right)
    })
    .map((frame) => {
      const riderIds = frame.rider_ids ?? []
      const riderNames = frame.rider_names ?? []
      const teamNames = frame.team_names ?? []
      const riderSlotCount = Math.max(
        riderIds.length,
        riderNames.length,
        teamNames.length
      )

      if (riderSlotCount === 0) return frame

      const keptIndexes: number[] = []

      for (let index = 0; index < riderSlotCount; index += 1) {
        const riderId = riderIds[index]
        const riderName = riderNames[index]
        const teamName = teamNames[index]

        const riderKey = getRoadRiderDedupKey(
          riderId,
          riderName,
          teamName
        )

        /*
         * If there is no rider identity at all, keep the slot. This
         * avoids deleting anonymous backend/debug group rows. Real rider
         * rows are deduped by id, with name+team as a safety fallback for
         * older replay frames that did not carry rider_ids reliably.
         */
        if (!riderKey) {
          keptIndexes.push(index)
          continue
        }

        if (claimedRiderKeys.has(riderKey)) continue

        claimedRiderKeys.add(riderKey)
        keptIndexes.push(index)
      }

      if (keptIndexes.length === riderSlotCount) return frame
      if (keptIndexes.length === 0) return null

      const nextRiderIds = keptIndexes
        .map((index) => riderIds[index])
        .filter((value): value is string => Boolean(value))
      const nextRiderNames = keptIndexes
        .map((index) => riderNames[index])
        .filter((value): value is string => Boolean(value))
      const nextTeamNames = keptIndexes
        .map((index) => teamNames[index])
        .filter((value): value is string => Boolean(value))

      return {
        ...frame,
        rider_ids: nextRiderIds,
        rider_names: nextRiderNames,
        team_names: nextTeamNames,
        metadata: {
          ...(frame.metadata ?? {}),
          group_size: Math.max(
            nextRiderIds.length,
            nextRiderNames.length,
            nextTeamNames.length
          ),
          original_group_size: getReplayEntitySize(frame),
          replay_frontend_deduped: true,
        },
      }
    })
    .filter((frame): frame is RaceReplayFrame => frame !== null)
    .sort(sortReplayFrames)
}


function getRoadGroupSemanticBucket(frame: RaceReplayFrame): number {
  const baseGroupCode = getReplayBaseGroupCode(frame.group_code)
  const groupCode = String(frame.group_code ?? '').toLowerCase()
  const groupLabel = String(frame.group_label ?? '').toLowerCase()

  if (baseGroupCode === 'front_group' || baseGroupCode === 'chase_group') {
    return 100
  }

  if (
    baseGroupCode === 'main_peloton' ||
    groupCode === 'main_peloton' ||
    groupLabel === 'p' ||
    groupLabel === 'peloton' ||
    groupLabel === 'main peloton'
  ) {
    return 500
  }

  if (
    baseGroupCode === 'dropped_group' ||
    baseGroupCode === 'outside_group' ||
    groupCode.includes('dropped') ||
    groupCode.includes('outside') ||
    /^b\d*$/.test(groupLabel)
  ) {
    return 700
  }

  return 400
}

function normalizeRoadReplayGroupsForDisplay(
  frames: RaceReplayFrame[]
): RaceReplayFrame[] {
  const visibleFrames = frames.filter(
    (frame) =>
      getReplayEntityType(frame) === 'group' &&
      getReplayEntitySize(frame) > 0
  )

  if (visibleFrames.length === 0) return []

  const sortedByRoadPosition = [...visibleFrames].sort((left, right) => {
    const leftGap = Math.max(0, Number(left.gap_seconds ?? 0))
    const rightGap = Math.max(0, Number(right.gap_seconds ?? 0))
    if (leftGap !== rightGap) return leftGap - rightGap

    const leftKm = asNumber(left.km_marker) ?? 0
    const rightKm = asNumber(right.km_marker) ?? 0
    if (leftKm !== rightKm) return rightKm - leftKm

    const orderDiff =
      (Number(left.group_order) || Number.MAX_SAFE_INTEGER) -
      (Number(right.group_order) || Number.MAX_SAFE_INTEGER)
    if (orderDiff !== 0) return orderDiff

    return sortReplayFrames(left, right)
  })

  /*
   * Canonical road display rule for every single replay frame:
   *
   * - Biggest visible rider group = Peloton / P.
   * - Every group physically in front of that Peloton = G1, G2, G3.
   * - Every group physically behind that Peloton = B1, B2, B3.
   *
   * We deliberately calculate this per frame. We do not interpolate raw
   * group_code identities across frames, because backend group_code values are
   * not stable identities. Interpolating by raw code is what caused markers to
   * cross over each other and turn a B group into a front group on the profile.
   */
  let pelotonSortedIndex = 0
  let bestPelotonScore = Number.NEGATIVE_INFINITY

  sortedByRoadPosition.forEach((frame, index) => {
    const size = getReplayEntitySize(frame)
    const baseGroupCode = getReplayBaseGroupCode(frame.group_code)
    const isFrontendLowEnergyDropGroup =
      (frame.metadata ?? {}).frontend_low_energy_drop_group_v1 === true
    const semanticBonus = baseGroupCode === 'main_peloton' ? 0.2 : 0
    const roadPenalty = index / 100000
    const energyDropPelotonPenalty = isFrontendLowEnergyDropGroup ? 100000 : 0
    const score = size + semanticBonus - roadPenalty - energyDropPelotonPenalty

    if (score > bestPelotonScore) {
      bestPelotonScore = score
      pelotonSortedIndex = index
    }
  })

  const normalizedGaps: number[] = []

  sortedByRoadPosition.forEach((frame, index) => {
    const rawGap = Math.max(0, Number(frame.gap_seconds ?? 0))
    normalizedGaps[index] =
      index === 0
        ? 0
        : Math.max(rawGap, (normalizedGaps[index - 1] ?? 0) + 8)
  })

  const pelotonGap = normalizedGaps[pelotonSortedIndex] ?? 0

  for (let index = pelotonSortedIndex + 1; index < normalizedGaps.length; index += 1) {
    normalizedGaps[index] = Math.max(
      normalizedGaps[index] ?? 0,
      pelotonGap + 8 * (index - pelotonSortedIndex)
    )
  }

  const leaderKm = Math.max(
    ...sortedByRoadPosition.map((frame) => asNumber(frame.km_marker) ?? 0),
    0
  )

  let previousDisplayKm: number | null = null

  return sortedByRoadPosition.map((frame, index) => {
    const isPeloton = index === pelotonSortedIndex
    const isAheadOfPeloton = index < pelotonSortedIndex
    const behindPelotonIndex = index - pelotonSortedIndex
    const aheadGroupNumber = index + 1
    const behindGroupNumber = Math.max(1, behindPelotonIndex)
    const semanticGap = normalizedGaps[index] ?? 0

    const speedKmh = Math.max(
      28,
      Math.min(46, asNumber(frame.avg_speed_kmh) ?? 38)
    )
    const gapKm = (semanticGap * speedKmh) / 3600
    let displayKm = index === 0 ? leaderKm : leaderKm - gapKm

    if (previousDisplayKm !== null) {
      displayKm = Math.min(displayKm, previousDisplayKm - 0.12)
    }

    displayKm = Math.max(0, displayKm)
    previousDisplayKm = displayKm

    const normalizedCode = isPeloton
      ? 'main_peloton'
      : isAheadOfPeloton
        ? aheadGroupNumber === 1
          ? 'front_group'
          : `chase_group_${String(aheadGroupNumber).padStart(2, '0')}`
        : behindGroupNumber === 1
          ? 'dropped_group'
          : `outside_group_${String(behindGroupNumber).padStart(2, '0')}`

    const normalizedLabel = isPeloton
      ? 'Peloton'
      : isAheadOfPeloton
        ? aheadGroupNumber === 1
          ? 'Front group'
          : `Chase group ${aheadGroupNumber}`
        : behindGroupNumber === 1
          ? 'Dropped group'
          : `Dropped group ${behindGroupNumber}`

    return {
      ...frame,
      group_code: normalizedCode,
      group_label: normalizedLabel,
      group_order: index + 1,
      gap_seconds: semanticGap,
      km_marker: Number(displayKm.toFixed(3)),
      metadata: {
        ...(frame.metadata ?? {}),
        frontend_canonical_road_groups_v1: true,
        frontend_canonical_rule:
          'per frame: biggest visible rider group is Peloton; road-order groups ahead are G; road-order groups behind are B',
        frontend_original_group_code: frame.group_code ?? null,
        frontend_original_group_label: frame.group_label ?? null,
        frontend_original_group_order: frame.group_order ?? null,
        frontend_original_gap_seconds: frame.gap_seconds ?? null,
        frontend_original_km_marker: frame.km_marker ?? null,
        frontend_original_group_size: getReplayEntitySize(frame),
        frontend_peloton_sorted_index: pelotonSortedIndex,
        frontend_semantic_gap_seconds: semanticGap,
        frontend_semantic_display_km_marker: Number(displayKm.toFixed(3)),
      },
    }
  })
}


function getExplicitReplayRiderLiveEnergyPct(
  frame: RaceReplayFrame,
  riderId: string
): number | null {
  const riderEnergyRecord = getRiderEnergyRecordFromFrame(frame, riderId)

  return (
    getRiderEnergyMetricFromRecord(riderEnergyRecord, [
      'live_energy_pct',
      'liveEnergyPct',
      'green_energy_pct',
      'green_bar_pct',
      'energy_remaining_pct',
      'remaining_energy_pct',
      'stage_energy_remaining_pct',
    ]) ??
    getRiderEnergyPercentFromMap(frame, riderId, [
      'rider_live_energy_pct',
      'live_energy_pct_by_rider_id',
      'rider_stage_energy_remaining_pct',
    ])
  )
}

function splitLowEnergyActiveRoadGroupsForDisplay(
  frames: RaceReplayFrame[]
): RaceReplayFrame[] {
  const groupFrames = frames.filter(
    (frame) =>
      getReplayEntityType(frame) === 'group' && getReplayEntitySize(frame) > 0
  )

  if (groupFrames.length === 0) return frames

  const pelotonFrame =
    groupFrames.find(
      (frame) => getReplayBaseGroupCode(frame.group_code) === 'main_peloton'
    ) ??
    [...groupFrames]
      .filter(
        (frame) => (frame.metadata ?? {}).frontend_low_energy_drop_group_v1 !== true
      )
      .sort((left, right) => getReplayEntitySize(right) - getReplayEntitySize(left))[0] ??
    groupFrames[0]

  if (!pelotonFrame) return frames

  const pelotonOrder = Number(pelotonFrame.group_order ?? 1)
  const pelotonGap = getReplayFrameGapSeconds(pelotonFrame)
  const leaderKm = Math.max(
    ...groupFrames.map((frame) => asNumber(frame.km_marker) ?? 0),
    asNumber(pelotonFrame.km_marker) ?? 0,
    0
  )

  const keptFrames: RaceReplayFrame[] = []
  const syntheticDropFrames: RaceReplayFrame[] = []

  groupFrames.forEach((frame) => {
    const frameMetadata = frame.metadata ?? {}
    const baseGroupCode = getReplayBaseGroupCode(frame.group_code)
    const groupOrder = Number(frame.group_order ?? Number.MAX_SAFE_INTEGER)
    const isAlreadyLowEnergyDropGroup =
      frameMetadata.frontend_low_energy_drop_group_v1 === true

    const isActiveRoadGroup =
      !isAlreadyLowEnergyDropGroup &&
      (baseGroupCode === 'front_group' ||
        baseGroupCode === 'chase_group' ||
        baseGroupCode === 'main_peloton' ||
        groupOrder <= pelotonOrder)

    if (!isActiveRoadGroup) {
      keptFrames.push(frame)
      return
    }

    const riderIds = Array.isArray(frame.rider_ids) ? frame.rider_ids : []
    const riderNames = Array.isArray(frame.rider_names) ? frame.rider_names : []
    const teamNames = Array.isArray(frame.team_names) ? frame.team_names : []

    if (riderIds.length === 0) {
      keptFrames.push(frame)
      return
    }

    const lowEnergyIndexes: number[] = []
    const keepIndexes: number[] = []

    riderIds.forEach((riderId, index) => {
      const liveEnergyPct = getExplicitReplayRiderLiveEnergyPct(frame, riderId)

      if (
        liveEnergyPct !== null &&
        liveEnergyPct <= ROAD_REPLAY_LOW_ENERGY_DROP_THRESHOLD_PCT
      ) {
        lowEnergyIndexes.push(index)
      } else {
        keepIndexes.push(index)
      }
    })

    if (lowEnergyIndexes.length === 0) {
      keptFrames.push(frame)
      return
    }

    if (keepIndexes.length > 0) {
      const nextRiderIds = keepIndexes
        .map((index) => riderIds[index])
        .filter((value): value is string => Boolean(value))
      const nextRiderNames = keepIndexes
        .map((index) => riderNames[index])
        .filter((value): value is string => Boolean(value))
      const nextTeamNames = keepIndexes
        .map((index) => teamNames[index])
        .filter((value): value is string => Boolean(value))

      keptFrames.push({
        ...frame,
        rider_ids: nextRiderIds,
        rider_names: nextRiderNames,
        team_names: nextTeamNames,
        metadata: {
          ...frameMetadata,
          group_size: Math.max(
            nextRiderIds.length,
            nextRiderNames.length,
            nextTeamNames.length
          ),
          frontend_low_energy_active_group_filtered_v1: true,
          frontend_low_energy_drop_threshold_pct:
            ROAD_REPLAY_LOW_ENERGY_DROP_THRESHOLD_PCT,
          frontend_low_energy_removed_riders_count: lowEnergyIndexes.length,
          frontend_original_group_size_before_low_energy_filter:
            getReplayEntitySize(frame),
        },
      })
    }

    const lowRiderIds = lowEnergyIndexes
      .map((index) => riderIds[index])
      .filter((value): value is string => Boolean(value))
    const lowRiderNames = lowEnergyIndexes
      .map((index) => riderNames[index])
      .filter((value): value is string => Boolean(value))
    const lowTeamNames = lowEnergyIndexes
      .map((index) => teamNames[index])
      .filter((value): value is string => Boolean(value))

    if (lowRiderIds.length === 0) return

    const sourceGap = getReplayFrameGapSeconds(frame)
    const avgSpeedKmh = Math.max(28, Math.min(46, asNumber(frame.avg_speed_kmh) ?? 38))
    const lowEnergyGroupNumber = syntheticDropFrames.length + 1
    const lowEnergyGap = Math.max(
      pelotonGap + ROAD_REPLAY_LOW_ENERGY_DROP_GAP_SECONDS * lowEnergyGroupNumber,
      sourceGap + ROAD_REPLAY_LOW_ENERGY_DROP_GAP_SECONDS
    )
    const lowEnergyKm = Math.max(
      0,
      leaderKm - (lowEnergyGap * avgSpeedKmh) / 3600
    )

    syntheticDropFrames.push({
      ...frame,
      id: `${frame.id}:frontend-low-energy-drop:${lowEnergyGroupNumber}`,
      group_code:
        lowEnergyGroupNumber === 1
          ? 'dropped_group_energy'
          : `outside_group_energy_${lowEnergyGroupNumber}`,
      group_label:
        lowEnergyGroupNumber === 1
          ? 'Energy dropped group'
          : `Energy dropped group ${lowEnergyGroupNumber}`,
      group_order: Math.max(999, pelotonOrder + lowEnergyGroupNumber),
      gap_seconds: Number(lowEnergyGap.toFixed(3)),
      km_marker: Number(lowEnergyKm.toFixed(3)),
      rider_ids: lowRiderIds,
      rider_names: lowRiderNames,
      team_names: lowTeamNames,
      metadata: {
        ...frameMetadata,
        group_size: Math.max(
          lowRiderIds.length,
          lowRiderNames.length,
          lowTeamNames.length
        ),
        frontend_low_energy_drop_group_v1: true,
        frontend_low_energy_drop_rule:
          'riders with live green energy <= 10% cannot remain in front/chase/peloton groups',
        frontend_low_energy_drop_threshold_pct:
          ROAD_REPLAY_LOW_ENERGY_DROP_THRESHOLD_PCT,
        frontend_low_energy_source_group_code: frame.group_code,
        frontend_low_energy_source_group_label: frame.group_label,
        frontend_low_energy_source_gap_seconds: sourceGap,
        frontend_low_energy_peloton_gap_seconds: pelotonGap,
      },
    })
  })

  return [...keptFrames, ...syntheticDropFrames]
    .filter((frame) => getReplayEntitySize(frame) > 0)
    .sort(sortReplayFrames)
}

function interpolateNumberValue(
  previousValue: unknown,
  nextValue: unknown,
  ratio: number
): number | null {
  const previousNumber = asNumber(
    previousValue as number | string | null | undefined
  )
  const nextNumber = asNumber(
    nextValue as number | string | null | undefined
  )

  if (previousNumber === null && nextNumber === null) return null
  if (previousNumber === null) return nextNumber
  if (nextNumber === null) return previousNumber

  return previousNumber + (nextNumber - previousNumber) * ratio
}

function getInterpolatedRoadReplayFrame(
  previousFrame: RaceReplayFrame,
  nextFrame: RaceReplayFrame | null,
  framePosition: number
): RaceReplayFrame {
  if (!nextFrame) return previousFrame

  const previousFrameNumber = Number(previousFrame.frame_number)
  const nextFrameNumber = Number(nextFrame.frame_number)

  if (
    !Number.isFinite(previousFrameNumber) ||
    !Number.isFinite(nextFrameNumber) ||
    nextFrameNumber <= previousFrameNumber
  ) {
    return previousFrame
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      (framePosition - previousFrameNumber) /
        (nextFrameNumber - previousFrameNumber)
    )
  )

  const kmMarker = interpolateNumberValue(
    previousFrame.km_marker,
    nextFrame.km_marker,
    ratio
  )

  const gapSeconds = interpolateNumberValue(
    previousFrame.gap_seconds,
    nextFrame.gap_seconds,
    ratio
  )

  const avgSpeedKmh = interpolateNumberValue(
    previousFrame.avg_speed_kmh,
    nextFrame.avg_speed_kmh,
    ratio
  )

  const raceSeconds = interpolateNumberValue(
    previousFrame.race_seconds,
    nextFrame.race_seconds,
    ratio
  )

  return {
    ...previousFrame,
    id: `${previousFrame.id}:road-interp:${Math.round(framePosition * 1000)}`,
    frame_number: framePosition,
    race_seconds:
      raceSeconds === null
        ? previousFrame.race_seconds
        : Number(raceSeconds.toFixed(3)),
    km_marker:
      kmMarker === null
        ? previousFrame.km_marker
        : Number(kmMarker.toFixed(3)),
    gap_seconds:
      gapSeconds === null
        ? previousFrame.gap_seconds
        : Number(gapSeconds.toFixed(3)),
    avg_speed_kmh:
      avgSpeedKmh === null
        ? previousFrame.avg_speed_kmh
        : Number(avgSpeedKmh.toFixed(3)),
    metadata: {
      ...(previousFrame.metadata ?? {}),
      interpolation_model: 'road_linear_between_replay_frames_v1',
      interpolated_from_frame_number: previousFrame.frame_number,
      interpolated_to_frame_number: nextFrame.frame_number,
      interpolated_ratio: ratio,
    },
  }
}

function getRoadReplayFrameNumbers(frames: RaceReplayFrame[]): number[] {
  return Array.from(
    new Set(
      frames
        .map((frame) => Number(frame.frame_number))
        .filter((value) => Number.isFinite(value))
    )
  ).sort((left, right) => left - right)
}

function getRoadReplayFramesForExactFrameNumber(
  frames: RaceReplayFrame[],
  frameNumber: number
): RaceReplayFrame[] {
  return frames
    .filter((frame) => Number(frame.frame_number) === frameNumber)
    .sort(sortReplayFrames)
}

function getRoadReplayFramesAtFramePosition(
  frames: RaceReplayFrame[],
  framePosition: number
): RaceReplayFrame[] {
  if (frames.length === 0) return []

  const safeFramePosition = Number.isFinite(framePosition)
    ? framePosition
    : 0

  const frameNumbers = getRoadReplayFrameNumbers(frames)
  if (frameNumbers.length === 0) return []

  const selectedFrameNumber =
    [...frameNumbers]
      .reverse()
      .find((frameNumber) => frameNumber <= safeFramePosition) ??
    frameNumbers[0]

  return getRoadReplayFramesForExactFrameNumber(frames, selectedFrameNumber)
}

function getCanonicalRoadGroupInterpolationKey(frame: RaceReplayFrame): string {
  const baseGroupCode = getReplayBaseGroupCode(frame.group_code)

  if (baseGroupCode === 'main_peloton') return 'P'

  if (baseGroupCode === 'front_group') return 'G1'

  if (baseGroupCode === 'chase_group') {
    const code = String(frame.group_code ?? '')
    const match = code.match(/_(\d+)$/)
    return `G${Math.max(2, Number(match?.[1] ?? 2))}`
  }

  if (baseGroupCode === 'dropped_group') return 'B1'

  if (baseGroupCode === 'outside_group') {
    const code = String(frame.group_code ?? '')
    const match = code.match(/_(\d+)$/)
    return `B${Math.max(2, Number(match?.[1] ?? 2))}`
  }

  return String(frame.group_code ?? frame.group_label ?? frame.id)
}

function getNormalizedRoadReplayGroupsForExactFrameNumber(
  frames: RaceReplayFrame[],
  frameNumber: number
): RaceReplayFrame[] {
  const rawGroupFrames = getRoadReplayFramesForExactFrameNumber(frames, frameNumber)
    .filter((frame) => getReplayEntityType(frame) === 'group')

  const normalizedGroups = normalizeRoadReplayGroupsForDisplay(
    getDedupedRoadGroupFrames(rawGroupFrames)
  )

  return normalizeRoadReplayGroupsForDisplay(
    getDedupedRoadGroupFrames(
      splitLowEnergyActiveRoadGroupsForDisplay(normalizedGroups)
    )
  )
}

function normalizeInterpolatedRoadGroupSpacing(
  frames: RaceReplayFrame[]
): RaceReplayFrame[] {
  let previousKm: number | null = null

  return [...frames]
    .sort((left, right) => {
      const orderDiff =
        (Number(left.group_order) || Number.MAX_SAFE_INTEGER) -
        (Number(right.group_order) || Number.MAX_SAFE_INTEGER)

      if (orderDiff !== 0) return orderDiff

      return getReplayFrameGapSeconds(left) - getReplayFrameGapSeconds(right)
    })
    .map((frame, index) => {
      let displayKm = asNumber(frame.km_marker) ?? 0

      if (previousKm !== null) {
        displayKm = Math.min(displayKm, previousKm - 0.12)
      }

      displayKm = Math.max(0, displayKm)
      previousKm = displayKm

      return {
        ...frame,
        group_order: index + 1,
        km_marker: Number(displayKm.toFixed(3)),
        metadata: {
          ...(frame.metadata ?? {}),
          frontend_interpolated_spacing_normalized_v1: true,
        },
      }
    })
}


const ROAD_REPLAY_GROUP_TRANSITION_FRAME_WINDOW = 8
const ROAD_REPLAY_MAX_DIRECT_MERGE_GAP_SECONDS = 10
const ROAD_REPLAY_LOW_ENERGY_DROP_THRESHOLD_PCT = 10
const ROAD_REPLAY_LOW_ENERGY_DROP_GAP_SECONDS = 12

function getRoadGroupVisualSide(
  frame: RaceReplayFrame
): 'front' | 'peloton' | 'behind' | 'unknown' {
  const baseGroupCode = getReplayBaseGroupCode(frame.group_code)

  if (baseGroupCode === 'main_peloton') return 'peloton'
  if (baseGroupCode === 'front_group' || baseGroupCode === 'chase_group') return 'front'
  if (baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group') return 'behind'

  return 'unknown'
}

function getRoadGroupRiderIdentitySet(frame: RaceReplayFrame): Set<string> {
  const riderIds = frame.rider_ids ?? []
  const riderNames = frame.rider_names ?? []
  const teamNames = frame.team_names ?? []
  const slotCount = Math.max(
    riderIds.length,
    riderNames.length,
    teamNames.length
  )
  const identities = new Set<string>()

  for (let index = 0; index < slotCount; index += 1) {
    const riderId = riderIds[index]?.trim()

    if (riderId) {
      identities.add(`id:${riderId}`)
      continue
    }

    const riderName = riderNames[index]?.trim().toLowerCase()
    if (!riderName) continue

    const teamName = teamNames[index]?.trim().toLowerCase() ?? ''
    identities.add(`name:${riderName}|team:${teamName}`)
  }

  return identities
}

function getRoadGroupRiderOverlapCount(
  left: RaceReplayFrame,
  right: RaceReplayFrame
): number {
  const leftSet = getRoadGroupRiderIdentitySet(left)
  const rightSet = getRoadGroupRiderIdentitySet(right)

  if (leftSet.size === 0 || rightSet.size === 0) return 0

  const smaller = leftSet.size <= rightSet.size ? leftSet : rightSet
  const larger = leftSet.size <= rightSet.size ? rightSet : leftSet

  let overlap = 0

  smaller.forEach((identity) => {
    if (larger.has(identity)) overlap += 1
  })

  return overlap
}

function getRoadGroupVisualMatchScore(
  previousFrame: RaceReplayFrame,
  nextFrame: RaceReplayFrame
): number {
  const previousSide = getRoadGroupVisualSide(previousFrame)
  const nextSide = getRoadGroupVisualSide(nextFrame)
  const overlap = getRoadGroupRiderOverlapCount(previousFrame, nextFrame)
  const previousSize = Math.max(1, getReplayEntitySize(previousFrame))
  const nextSize = Math.max(1, getReplayEntitySize(nextFrame))
  const overlapRatio =
    overlap / Math.max(1, Math.min(previousSize, nextSize))
  const sideBonus =
    previousSide === nextSide
      ? 80
      : previousSide === 'peloton' || nextSide === 'peloton'
        ? -25
        : -60
  const codeBonus =
    getCanonicalRoadGroupInterpolationKey(previousFrame) ===
    getCanonicalRoadGroupInterpolationKey(nextFrame)
      ? 20
      : 0
  const gapPenalty =
    Math.abs(
      getReplayFrameGapSeconds(previousFrame) -
        getReplayFrameGapSeconds(nextFrame)
    ) * 0.08
  const orderPenalty =
    Math.abs(
      (Number(previousFrame.group_order) || 0) -
        (Number(nextFrame.group_order) || 0)
    ) * 2

  /*
   * Rider overlap is the main identity. This fixes the old problem where
   * "G1" in frame N was blindly matched to "G1" in frame N+1 even if a new
   * breakaway appeared and the old G1 became G2. Without this, markers swap
   * places and look like they jump through the Peloton.
   */
  return overlap * 140 + overlapRatio * 80 + sideBonus + codeBonus - gapPenalty - orderPenalty
}

function buildRoadGroupVisualMatches(
  previousGroups: RaceReplayFrame[],
  nextGroups: RaceReplayFrame[]
): Map<RaceReplayFrame, RaceReplayFrame> {
  const matchByNextFrame = new Map<RaceReplayFrame, RaceReplayFrame>()
  const usedPreviousFrames = new Set<RaceReplayFrame>()

  const previousPeloton = previousGroups.find(
    (frame) => getRoadGroupVisualSide(frame) === 'peloton'
  )
  const nextPeloton = nextGroups.find(
    (frame) => getRoadGroupVisualSide(frame) === 'peloton'
  )

  if (previousPeloton && nextPeloton) {
    matchByNextFrame.set(nextPeloton, previousPeloton)
    usedPreviousFrames.add(previousPeloton)
  }

  const nextFramesByPriority = [...nextGroups].sort((left, right) => {
    const sideDiff =
      (getRoadGroupVisualSide(left) === 'peloton' ? 0 : 1) -
      (getRoadGroupVisualSide(right) === 'peloton' ? 0 : 1)
    if (sideDiff !== 0) return sideDiff

    return getReplayEntitySize(right) - getReplayEntitySize(left)
  })

  nextFramesByPriority.forEach((nextFrame) => {
    if (matchByNextFrame.has(nextFrame)) return

    let bestPreviousFrame: RaceReplayFrame | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    let bestOverlap = 0

    previousGroups.forEach((previousFrame) => {
      if (usedPreviousFrames.has(previousFrame)) return

      const score = getRoadGroupVisualMatchScore(previousFrame, nextFrame)
      const overlap = getRoadGroupRiderOverlapCount(previousFrame, nextFrame)

      if (score > bestScore) {
        bestScore = score
        bestPreviousFrame = previousFrame
        bestOverlap = overlap
      }
    })

    /*
     * Do not force weak label-only matches. If a group is truly new, it should
     * be born from the Peloton anchor and move out smoothly instead of stealing
     * another group's visual track.
     */
    if (
      bestPreviousFrame &&
      (bestOverlap > 0 || bestScore >= 90)
    ) {
      /*
       * Merge rule:
       * when several front groups combine, visually follow the group that was
       * already in front. The catching group should move forward into it; the
       * front group should not disappear and reappear behind.
       */
      const nextSide = getRoadGroupVisualSide(nextFrame)
      const frontMergeCandidate =
        nextSide === 'front'
          ? previousGroups
              .filter((previousFrame) => {
                if (usedPreviousFrames.has(previousFrame)) return false
                if (getRoadGroupVisualSide(previousFrame) !== 'front') return false
                return getRoadGroupRiderOverlapCount(previousFrame, nextFrame) > 0
              })
              .sort((left, right) => {
                const gapDiff =
                  getReplayFrameGapSeconds(left) -
                  getReplayFrameGapSeconds(right)
                if (Math.abs(gapDiff) > 0.01) return gapDiff

                const kmDiff =
                  (asNumber(right.km_marker) ?? 0) -
                  (asNumber(left.km_marker) ?? 0)
                if (Math.abs(kmDiff) > 0.01) return kmDiff

                return (
                  (Number(left.group_order) || Number.MAX_SAFE_INTEGER) -
                  (Number(right.group_order) || Number.MAX_SAFE_INTEGER)
                )
              })[0] ?? null
          : null

      const previousFrameToUse = frontMergeCandidate ?? bestPreviousFrame

      matchByNextFrame.set(nextFrame, previousFrameToUse)
      usedPreviousFrames.add(previousFrameToUse)
    }
  })

  return matchByNextFrame
}


function getNormalizedRoadReplayGroupsAtFramePosition(
  frames: RaceReplayFrame[],
  framePosition: number
): RaceReplayFrame[] {
  if (frames.length === 0) return []

  const safeFramePosition = Number.isFinite(framePosition)
    ? framePosition
    : 0

  const frameNumbers = getRoadReplayFrameNumbers(frames)
  if (frameNumbers.length === 0) return []

  /*
   * Use a small motion buffer instead of interpolating only between the exact
   * previous and next backend frame. When a split is created, the raw frame
   * list can change completely in one backend frame; the visual transition
   * should take several frontend frames so the race does not freeze at 18 km
   * and then jump to 20 km.
   */
  const targetFrameNumber =
    frameNumbers.find((frameNumber) => frameNumber >= safeFramePosition) ??
    frameNumbers[frameNumbers.length - 1]

  const sourceFrameNumber =
    [...frameNumbers]
      .reverse()
      .find(
        (frameNumber) =>
          frameNumber <=
          Math.max(
            frameNumbers[0],
            safeFramePosition - ROAD_REPLAY_GROUP_TRANSITION_FRAME_WINDOW
          )
      ) ??
    frameNumbers[0]

  const previousFrameNumber = sourceFrameNumber
  const nextFrameNumber = targetFrameNumber

  const previousGroups = getNormalizedRoadReplayGroupsForExactFrameNumber(
    frames,
    previousFrameNumber
  )

  if (nextFrameNumber === previousFrameNumber || previousGroups.length === 0) {
    return previousGroups
  }

  const nextGroups = getNormalizedRoadReplayGroupsForExactFrameNumber(
    frames,
    nextFrameNumber
  )

  if (nextGroups.length === 0) return previousGroups

  const ratio = Math.max(
    0,
    Math.min(
      1,
      (safeFramePosition - previousFrameNumber) /
        Math.max(1, nextFrameNumber - previousFrameNumber)
    )
  )

  const previousMatchByNextFrame = buildRoadGroupVisualMatches(
    previousGroups,
    nextGroups
  )

  const nextMatchByPreviousFrame = new Map<RaceReplayFrame, RaceReplayFrame>()

  previousMatchByNextFrame.forEach((previousFrame, nextFrame) => {
    nextMatchByPreviousFrame.set(previousFrame, nextFrame)
  })

  const getPelotonAnchor = (sourceGroups: RaceReplayFrame[]) => {
    return (
      sourceGroups.find(
        (frame) =>
          getReplayBaseGroupCode(frame.group_code) === 'main_peloton'
      ) ??
      sourceGroups.find((frame) => getReplayEntitySize(frame) > 0) ??
      null
    )
  }

  const makeBirthAnchorFrame = (
    targetFrame: RaceReplayFrame,
    sourceGroups: RaceReplayFrame[]
  ): RaceReplayFrame => {
    const pelotonAnchor = getPelotonAnchor(sourceGroups) ?? targetFrame
    const baseGroupCode = getReplayBaseGroupCode(targetFrame.group_code)
    const pelotonKm = asNumber(pelotonAnchor.km_marker) ?? asNumber(targetFrame.km_marker) ?? 0
    const pelotonGap = asNumber(pelotonAnchor.gap_seconds) ?? 0
    const targetGap = asNumber(targetFrame.gap_seconds) ?? pelotonGap
    const isAheadGroup = baseGroupCode === 'front_group' || baseGroupCode === 'chase_group'
    const isBehindGroup = baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group'

    const anchorKm = isAheadGroup
      ? pelotonKm + 0.12
      : isBehindGroup
        ? Math.max(0, pelotonKm - 0.12)
        : pelotonKm

    const anchorGap = isAheadGroup
      ? Math.max(0, pelotonGap - 8)
      : isBehindGroup
        ? Math.max(pelotonGap + 8, targetGap - 8)
        : pelotonGap

    return {
      ...targetFrame,
      km_marker: Number(anchorKm.toFixed(3)),
      gap_seconds: Number(anchorGap.toFixed(3)),
      race_seconds: pelotonAnchor.race_seconds ?? targetFrame.race_seconds,
      avg_speed_kmh: pelotonAnchor.avg_speed_kmh ?? targetFrame.avg_speed_kmh,
      rider_ids: [],
      rider_names: [],
      team_names: [],
      metadata: {
        ...(targetFrame.metadata ?? {}),
        group_size: 0,
        frontend_group_transition_anchor_v3: true,
        frontend_group_transition_anchor_type: 'birth_from_peloton',
      },
    }
  }

  const makeMergeAnchorFrame = (
    sourceFrame: RaceReplayFrame,
    targetGroups: RaceReplayFrame[]
  ): RaceReplayFrame => {
    const pelotonAnchor = getPelotonAnchor(targetGroups) ?? sourceFrame
    const baseGroupCode = getReplayBaseGroupCode(sourceFrame.group_code)
    const pelotonKm = asNumber(pelotonAnchor.km_marker) ?? asNumber(sourceFrame.km_marker) ?? 0
    const pelotonGap = asNumber(pelotonAnchor.gap_seconds) ?? 0
    const isAheadGroup = baseGroupCode === 'front_group' || baseGroupCode === 'chase_group'
    const isBehindGroup = baseGroupCode === 'dropped_group' || baseGroupCode === 'outside_group'

    const anchorKm = isAheadGroup
      ? pelotonKm + 0.12
      : isBehindGroup
        ? Math.max(0, pelotonKm - 0.12)
        : pelotonKm

    const anchorGap = isAheadGroup
      ? Math.max(0, pelotonGap - 8)
      : isBehindGroup
        ? pelotonGap + 8
        : pelotonGap

    return {
      ...sourceFrame,
      km_marker: Number(anchorKm.toFixed(3)),
      gap_seconds: Number(anchorGap.toFixed(3)),
      race_seconds: pelotonAnchor.race_seconds ?? sourceFrame.race_seconds,
      avg_speed_kmh: pelotonAnchor.avg_speed_kmh ?? sourceFrame.avg_speed_kmh,
      rider_ids: [],
      rider_names: [],
      team_names: [],
      metadata: {
        ...(sourceFrame.metadata ?? {}),
        group_size: 0,
        frontend_group_transition_anchor_v3: true,
        frontend_group_transition_anchor_type: 'merge_to_peloton',
      },
    }
  }

  const interpolateCanonicalGroupFrame = ({
    sourceFrame,
    targetFrame,
    displayFrame,
    interpolationState,
  }: {
    sourceFrame: RaceReplayFrame
    targetFrame: RaceReplayFrame
    displayFrame: RaceReplayFrame
    interpolationState: string
  }): RaceReplayFrame => {
    const kmMarker = interpolateNumberValue(
      sourceFrame.km_marker,
      targetFrame.km_marker,
      ratio
    )
    const gapSeconds = interpolateNumberValue(
      sourceFrame.gap_seconds,
      targetFrame.gap_seconds,
      ratio
    )
    const avgSpeedKmh = interpolateNumberValue(
      sourceFrame.avg_speed_kmh,
      targetFrame.avg_speed_kmh,
      ratio
    )
    const raceSeconds = interpolateNumberValue(
      sourceFrame.race_seconds,
      targetFrame.race_seconds,
      ratio
    )

    const sourceSize = getReplayEntitySize(sourceFrame)
    const targetSize = getReplayEntitySize(targetFrame)
    const interpolatedSize =
      sourceSize === 0 && targetSize > 0 && ratio > 0.02
        ? Math.max(1, Math.round(targetSize * ratio))
        : Math.max(
            0,
            Math.round(sourceSize + (targetSize - sourceSize) * ratio)
          )

    return {
      ...displayFrame,
      id: `${displayFrame.id}:canonical-road-transition:${Math.round(safeFramePosition * 1000)}`,
      frame_number: safeFramePosition,
      race_seconds:
        raceSeconds === null
          ? displayFrame.race_seconds
          : Number(raceSeconds.toFixed(3)),
      km_marker:
        kmMarker === null
          ? displayFrame.km_marker
          : Number(kmMarker.toFixed(3)),
      gap_seconds:
        gapSeconds === null
          ? displayFrame.gap_seconds
          : Number(gapSeconds.toFixed(3)),
      avg_speed_kmh:
        avgSpeedKmh === null
          ? displayFrame.avg_speed_kmh
          : Number(avgSpeedKmh.toFixed(3)),
      metadata: {
        ...(displayFrame.metadata ?? {}),
        group_size: interpolatedSize,
        frontend_road_group_interpolation_v3: true,
        frontend_road_group_interpolation_v2: true,
        interpolation_state: interpolationState,
        interpolated_from_frame_number: previousFrameNumber,
        interpolated_to_frame_number: nextFrameNumber,
        interpolated_ratio: ratio,
      },
    }
  }

  const interpolatedGroups: RaceReplayFrame[] = nextGroups.map((nextFrame) => {
    const matchedPreviousFrame = previousMatchByNextFrame.get(nextFrame)
    const previousFrame =
      matchedPreviousFrame ?? makeBirthAnchorFrame(nextFrame, previousGroups)

    return interpolateCanonicalGroupFrame({
      sourceFrame: previousFrame,
      targetFrame: nextFrame,
      displayFrame: nextFrame,
      interpolationState: matchedPreviousFrame
        ? 'continuous_existing_group_by_rider_overlap'
        : 'smooth_new_group_birth_from_peloton',
    })
  })

  const findForwardMergeTarget = (
    sourceFrame: RaceReplayFrame
  ): RaceReplayFrame | null => {
    const sourceGap = getReplayFrameGapSeconds(sourceFrame)
    const sourceKm = asNumber(sourceFrame.km_marker) ?? 0

    return [...nextGroups]
      .filter((targetFrame) => {
        if (targetFrame === nextMatchByPreviousFrame.get(sourceFrame)) return false

        const targetGap = getReplayFrameGapSeconds(targetFrame)
        const targetKm = asNumber(targetFrame.km_marker) ?? 0

        /*
         * Merge direction rule:
         * a disappearing group may only move toward a group in front of it.
         * For road-order gaps, "in front" means a smaller gap, or a larger km
         * marker when gap data is almost equal. This prevents G1/G2 from
         * visually snapping backward into the group behind.
         */
        return (
          targetGap < sourceGap - 0.1 ||
          (Math.abs(targetGap - sourceGap) <= 0.1 && targetKm > sourceKm)
        )
      })
      .sort((left, right) => {
        const leftGapDiff = Math.abs(
          sourceGap - getReplayFrameGapSeconds(left)
        )
        const rightGapDiff = Math.abs(
          sourceGap - getReplayFrameGapSeconds(right)
        )

        if (Math.abs(leftGapDiff - rightGapDiff) > 0.01) {
          return leftGapDiff - rightGapDiff
        }

        return (asNumber(right.km_marker) ?? 0) - (asNumber(left.km_marker) ?? 0)
      })[0] ?? null
  }

  const protectedMergeGroups = previousGroups
    .filter((previousFrame) => !nextMatchByPreviousFrame.has(previousFrame))
    .map((previousFrame): RaceReplayFrame | null => {
      const mergeTarget = findForwardMergeTarget(previousFrame)
      if (!mergeTarget) return null

      const previousGap = getReplayFrameGapSeconds(previousFrame)
      const targetGap = getReplayFrameGapSeconds(mergeTarget)
      const gapToTarget = Math.abs(previousGap - targetGap)

      /*
       * Strict anti-teleport merge rule:
       * groups may disappear/merge only when the previous adjacent road gap is
       * below 10 seconds. If the gap is still 10+ seconds, the group remains a
       * visible canonical road group and moves gradually toward the front group.
       */
      if (gapToTarget < ROAD_REPLAY_MAX_DIRECT_MERGE_GAP_SECONDS) {
        return null
      }

      const rawGap = interpolateNumberValue(
        previousFrame.gap_seconds,
        mergeTarget.gap_seconds,
        ratio
      )
      const protectedGap =
        rawGap === null
          ? previousGap
          : previousGap >= targetGap
            ? Math.max(
                targetGap + ROAD_REPLAY_MAX_DIRECT_MERGE_GAP_SECONDS,
                rawGap
              )
            : Math.min(
                targetGap - ROAD_REPLAY_MAX_DIRECT_MERGE_GAP_SECONDS,
                rawGap
              )

      const rawKm = interpolateNumberValue(
        previousFrame.km_marker,
        mergeTarget.km_marker,
        ratio
      )

      return {
        ...previousFrame,
        id: `${previousFrame.id}:protected-anti-teleport-merge:${Math.round(safeFramePosition * 1000)}`,
        frame_number: safeFramePosition,
        km_marker:
          rawKm === null
            ? previousFrame.km_marker
            : Number(rawKm.toFixed(3)),
        gap_seconds: Number(Math.max(0, protectedGap).toFixed(3)),
        metadata: {
          ...(previousFrame.metadata ?? {}),
          frontend_protected_anti_teleport_merge_v1: true,
          frontend_protected_anti_teleport_merge_rule:
            'group cannot visually merge/disappear until adjacent gap is below 10 seconds; merge target must be the group in front',
          frontend_protected_merge_target_group_code: mergeTarget.group_code,
          frontend_protected_merge_target_gap_seconds: targetGap,
          frontend_protected_previous_gap_seconds: previousGap,
          frontend_protected_gap_to_target_seconds: gapToTarget,
        },
      }
    })
    .filter((frame): frame is RaceReplayFrame => frame !== null)

  const displayGroups = normalizeRoadReplayGroupsForDisplay(
    getDedupedRoadGroupFrames(
      [...interpolatedGroups, ...protectedMergeGroups]
        .filter((frame) => getReplayEntitySize(frame) > 0)
    )
  )

  const energyAwareDisplayGroups = normalizeRoadReplayGroupsForDisplay(
    getDedupedRoadGroupFrames(
      splitLowEnergyActiveRoadGroupsForDisplay(displayGroups)
    )
  )

  return normalizeInterpolatedRoadGroupSpacing(energyAwareDisplayGroups)
}

function isGeneralClassificationCode(value: string): boolean {
  return ['general', 'gc', 'general_classification'].includes(
    value.toLowerCase()
  )
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
      <div className="flex items-start justify-between gap-4">
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

  const viewerTeamIds = getViewerTeamIds(currentClubId, viewerClubFamilyIds)
  const localParticipationAccess = userTeamParticipatedInRace(
    participantTeams,
    viewerTeamIds
  )
  const userParticipated = canViewRaceReplay === true || localParticipationAccess
  const stageReached = isStageStartReached(stage, currentGameDate)

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

  const canWatch = Boolean(stage && userParticipated && hasResults)
  const checkingReplayAccess = loading || replayAccessLoading

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Live race
      </div>

      <h3 className="mt-2 text-lg font-semibold text-slate-950">
        {hasResults ? 'Watch replay' : 'Watch race'}
      </h3>

      <p className="mt-2 text-sm leading-5 text-slate-500">
        Replay is available only for teams that participated in {race?.name ?? 'this race'}.
      </p>

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
        {checkingReplayAccess
          ? 'Checking replay…'
          : canWatch
            ? 'Watch replay'
            : !userParticipated
              ? 'Your team did not participate'
              : !stageReached && !hasResults
                ? 'Race not started'
                : 'Replay not available yet'}
      </button>
    </div>
  )
}


function ReplayStageProfile({
  stage,
  profile,
  groups,
  frames,
  allFrames = frames,
  currentRaceSeconds = null,
  progress,
  visibleGcLeaderGroupCode,
  visibleClLeaderGroupCode,
  visiblePointsLeaderGroupCode,
  compact = false,
}: {
  stage: RaceStage
  profile: StageProfileDetailPayload | null
  groups: RaceReportGroupSummary[]
  frames: RaceReplayFrame[]
  allFrames?: RaceReplayFrame[]
  currentRaceSeconds?: number | null
  progress: number
  visibleGcLeaderGroupCode: string | null
  visibleClLeaderGroupCode: string | null
  visiblePointsLeaderGroupCode: string | null
  compact?: boolean
}) {
  const points =
    profile?.profile_points?.length
      ? profile.profile_points.map((point) => ({
          km: point.km,
          elevation_m: point.elevation,
        }))
      : getStageProfilePoints(stage)
  const eventPoints =
    profile?.route_markers?.length
      ? buildStageProfileChartMarkers(
          profile.route_markers,
          profile.mountain_climbs
        )
          .map((marker, index): StageProfileEventPoint => {
            const pointType =
              marker.chartType === 'start'
                ? 'START'
                : marker.chartType === 'finish'
                  ? 'FINISH'
                  : marker.chartType === 'sprint'
                    ? 'INTERMEDIATE_SPRINT'
                    : 'KOM'

            const komCategory =
              pointType === 'KOM' && marker.chartLabel !== 'KOM'
                ? marker.chartLabel.replace(/^Cat\s+/i, '')
                : marker.category ?? null

            return {
              id: `${stage.id}-profile-marker-${index}-${marker.km}`,
              stage_id: stage.id,
              point_type: pointType,
              km_from_start: marker.km,
              name: marker.label,
              kom_category: komCategory,
              points_scheme: null,
              time_bonus_seconds: null,
              is_finish_point: pointType === 'FINISH',
              sort_order: index,
              metadata: null,
              km: marker.km,
            }
          })
          .filter((point) => point.km > 0 || point.point_type === 'START')
      : getStageProfileEventPoints(stage)

  if (points.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Stage profile is not available.
      </div>
    )
  }

  const width = 1600
  const height = 330
  const padding = { top: 32, right: 32, bottom: 38, left: 64 }
  const profilePayload = JSON.parse(
    buildStageProfilePath(points, width, height, padding, stage.terrain_type)
  ) as {
    linePath: string
    areaPath: string
    coordinates: { x: number; y: number; km: number; elevation_m: number }[]
    minElevation: number
    maxElevation: number
    minKm: number
    maxKm: number
  }

  const currentKm = profilePayload.maxKm * progress

  const groupFrames = frames.filter(
    (frame) => getReplayEntityType(frame) === 'group'
  )

  const largestProfileGroupFrame =
    groupFrames.length > 0
      ? [...groupFrames].sort((left, right) => {
          const sizeDiff =
            getReplayEntitySize(right) - getReplayEntitySize(left)
          if (sizeDiff !== 0) return sizeDiff

          return (
            getReplayFrameGapSeconds(left) -
            getReplayFrameGapSeconds(right)
          )
        })[0]
      : null

  const pelotonGroupOrder =
    groupFrames.find(
      (frame) =>
        getReplayBaseGroupCode(
          frame.group_code
        ) === 'main_peloton'
    )?.group_order ??
    largestProfileGroupFrame?.group_order ??
    null

  const hasTimeTrialProfileFrames = frames.some((frame) => {
    const entityType = getReplayEntityType(frame)
    return entityType === 'rider' || entityType === 'team'
  })
  const profileReplayFrames = getVisibleTimeTrialProfileFrames(frames)
  const sortedProfileReplayFrames = [...profileReplayFrames].sort((left, right) => {
    const leftEntityType = getReplayEntityType(left)
    const rightEntityType = getReplayEntityType(right)
    if (leftEntityType !== rightEntityType) return leftEntityType === 'group' ? -1 : 1

    const leftOrder = Number(left.group_order ?? left.provisional_rank ?? 9999)
    const rightOrder = Number(right.group_order ?? right.provisional_rank ?? 9999)
    if (leftOrder !== rightOrder) return leftOrder - rightOrder

    return getReplayFrameGapSeconds(left) - getReplayFrameGapSeconds(right)
  })
  const roadLeaderFrame = sortedProfileReplayFrames.find(
    (frame) => getReplayEntityType(frame) === 'group'
  )
  const roadLeaderKm = asNumber(roadLeaderFrame?.km_marker) ?? currentKm
  let previousRoadGroupMarkerKm: number | null = null

  const replayGroups: ReplayGroupLine[] =
    sortedProfileReplayFrames.length > 0
      ? sortedProfileReplayFrames
          .filter((frame) => getReplayEntitySize(frame) > 0)
          .map((frame, index) => {
          const entityType = getReplayEntityType(frame)
          const actualKm =
            asNumber(frame.km_marker) ?? 0
          const entityCode =
            entityType === 'group'
              ? frame.group_code
              : frame.entity_key ||
                  frame.group_code ||
                  `${entityType}-${frame.entity_id ?? index}`
          const gapSeconds = getReplayFrameGapSeconds(frame)
          const frameMetadata = frame.metadata ?? {}
          const displayKm = entityType === 'group'
            ? getRoadGroupProfileKmFromGap({
                actualKm,
                leaderKm: roadLeaderKm,
                gapSeconds,
                avgSpeedKmh: asNumber(frame.avg_speed_kmh) ?? undefined,
                previousGroupKm: previousRoadGroupMarkerKm,
                maxKm: profilePayload.maxKm,
                backendNormalized:
                  frameMetadata.frontend_canonical_road_groups_v1 === true ||
                  frameMetadata.frontend_road_group_interpolation_v2 === true ||
                  frameMetadata.km_marker_normalized_from_gap_v3 === true ||
                  frameMetadata.km_marker_normalized_from_gap_v2 === true ||
                  frameMetadata.dropped_group_km_marker_normalized_v1 === true,
              })
            : actualKm

          if (entityType === 'group') {
            previousRoadGroupMarkerKm = displayKm
          }

          return {
            code: entityCode,
            label: getReplayFrameLabel(frame),
            shortLabel:
              entityType === 'group'
                ? getReplayGroupShortLabel(
                    frame.group_code,
                    Number(frame.group_order),
                    pelotonGroupOrder
                  )
                : getReplayTimeTrialMarkerShortLabel(frame),
            specialLeaderTypes:
              getReplaySpecialLeaderTypes(
                entityCode,
                visibleGcLeaderGroupCode,
                visibleClLeaderGroupCode,
                visiblePointsLeaderGroupCode
              ),
            gapSeconds,
            gapLabel: getReplayFrameGapLabel(frame),
            kmOffset: 0,
            actualKm,
            kmMarker: Math.max(0, displayKm),
            riderCount: getReplayEntitySize(frame),
            size: getReplayEntitySize(frame),
            entityType,
            teamName: getReplayFrameTeamName(frame),
            entityState: getReplayEntityState(frame),
            usesSyntheticProfileGap: false,
            timeTrialEntityKey:
              entityType === 'rider' || entityType === 'team'
                ? getReplayTimeTrialFrameKey(frame)
                : undefined,
          }
        })
      : hasTimeTrialProfileFrames
        ? []
        : buildReplayGroupLines(groups).map(
          (group) => ({
            ...group,
            entityType: 'group',
            specialLeaderTypes:
              getReplaySpecialLeaderTypes(
                group.code,
                visibleGcLeaderGroupCode,
                visibleClLeaderGroupCode,
                visiblePointsLeaderGroupCode
              ),
            actualKm: currentKm,
            kmMarker: currentKm,
            riderCount: group.size ?? 0,
            usesSyntheticProfileGap: true,
            gapLabel:
              group.gapSeconds === 0
                ? 'Leader'
                : `+${formatGapValue(group.gapSeconds)}`,
          })
        )

  const timeTrialSplitKm = hasTimeTrialProfileFrames
    ? Math.max(
        0,
        Math.min(
          profilePayload.maxKm,
          (asNumber(stage.distance_km) ?? profilePayload.maxKm) / 2
        )
      )
    : null

  const timeTrialSplitCoord =
    timeTrialSplitKm !== null
      ? getInterpolatedProfileCoordinate(
          profilePayload.coordinates,
          timeTrialSplitKm
        )
      : null

  const timeTrialSplitBadgeByEntityKey =
    hasTimeTrialProfileFrames
      ? buildTimeTrialSplitBadgeByEntityKey({
          allFrames,
          currentFrames: frames,
          splitKm: timeTrialSplitKm,
          currentRaceSeconds,
        })
      : new Map<string, TimeTrialSplitBadgeInfo>()

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${compact ? 'h-[34vh] min-h-[230px] max-h-[320px]' : 'h-[330px]'} w-full`}
      >
        <defs>
          <pattern
            id="komLeaderPattern"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="8"
              height="8"
              fill="#ffffff"
            />

            <circle
              cx="2"
              cy="2"
              r="2"
              fill="#dc2626"
            />

            <circle
              cx="6"
              cy="6"
              r="2"
              fill="#dc2626"
            />
          </pattern>

        </defs>

        {getElevationTickValues(
          profilePayload.minElevation,
          profilePayload.maxElevation
        ).map((tick) => {
          const span = Math.max(profilePayload.maxElevation - profilePayload.minElevation, 1)
          const y =
            padding.top +
            (1 - (tick - profilePayload.minElevation) / span) *
              (height - padding.top - padding.bottom)

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text x={8} y={y + 4} fontSize="12" fill="#64748b">
                {tick} m
              </text>
            </g>
          )
        })}

        <path d={profilePayload.areaPath} fill="#fde68a" />
        <path d={profilePayload.linePath} fill="none" stroke="#334155" strokeWidth="4" />

        {eventPoints.map((point) => {
          const coord = getInterpolatedProfileCoordinate(
            profilePayload.coordinates,
            point.km
          )
          if (!coord) return null

          return (
            <g key={point.id}>
              <line
                x1={coord.x}
                x2={coord.x}
                y1={padding.top - 4}
                y2={height - padding.bottom}
                stroke={getStagePointMarkerFill(point, stage)}
                strokeDasharray="4 4"
                strokeWidth="2"
              />
              <rect
                x={coord.x - 24}
                y={10}
                width="48"
                height="22"
                rx="11"
                fill={getStagePointMarkerFill(point, stage)}
              />
              <text
                x={coord.x}
                y={25}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="white"
              >
                {getStagePointShortLabel(point)}
              </text>
            </g>
          )
        })}

        {timeTrialSplitCoord ? (
          <g>
            <line
              x1={timeTrialSplitCoord.x}
              x2={timeTrialSplitCoord.x}
              y1={padding.top - 4}
              y2={height - padding.bottom}
              stroke="#64748b"
              strokeDasharray="7 7"
              strokeWidth="2"
              opacity={0.75}
            />
            <rect
              x={timeTrialSplitCoord.x - 24}
              y={36}
              width="48"
              height="20"
              rx="10"
              fill="#64748b"
              opacity={0.92}
            />
            <text
              x={timeTrialSplitCoord.x}
              y={50}
              textAnchor="middle"
              fontSize="10"
              fontWeight="800"
              fill="white"
            >
              Split
            </text>
          </g>
        ) : null}

        {replayGroups.map((group, index) => {
          const rawGroupKm = Math.max(
            0,
            Math.min(profilePayload.maxKm, group.kmMarker)
          )

          const entityType = group.entityType ?? 'group'
          const isRoadGroupMarker = entityType === 'group'

          /*
           * Real replay frames already contain physical km_marker separation.
           * Do not subtract the full leader gap again, because that double-counts
           * the backend gap and can make markers look more wrong.
           *
           * Only old synthetic summary markers need visual gap spacing, because
           * they all start from the same currentKm fallback.
           */
          const visualGapKm = isRoadGroupMarker && group.usesSyntheticProfileGap
            ? getRoadGroupVisualGapKm(
                Number(group.gapSeconds ?? 0),
                rawGroupKm,
                profilePayload.maxKm
              )
            : 0

          const groupKm = Math.max(
            0,
            Math.min(profilePayload.maxKm, rawGroupKm - visualGapKm)
          )
          const coord = isRoadGroupMarker
            ? getSmoothedProfileCoordinate(profilePayload.coordinates, groupKm)
            : getInterpolatedProfileCoordinate(profilePayload.coordinates, groupKm)
          if (!coord) return null

          const specialLeaderTypes =
            group.specialLeaderTypes ?? []

          const isTeamMarker = entityType === 'team'
          const isRiderMarker = entityType === 'rider'
          const isTimeTrialMarker = isTeamMarker || isRiderMarker
          const yOffset = isTimeTrialMarker ? -54 : -22 - index * 13
          const displayedLabel = group.shortLabel

          const markerFill = isTeamMarker
            ? '#7c3aed'
            : isRiderMarker
              ? '#f97316'
              : getReplayGroupStroke(group.code)

          const markerStroke = isTeamMarker
            ? '#5b21b6'
            : isRiderMarker
              ? '#c2410c'
              : getReplayGroupStroke(group.code)

          const markerTextColor = '#ffffff'
          const markerWidth = isTeamMarker ? 42 : isRiderMarker ? 38 : 32
          const markerHeight = isTimeTrialMarker ? 22 : 18
          const markerRadius = isTimeTrialMarker ? 11 : 9
          const connectorRadius = isTimeTrialMarker ? 6 : 7
          const markerY = Math.max(
            4,
            coord.y + yOffset - markerHeight
          )
          const markerTextY = markerY + markerHeight / 2 + 3.5
          const splitBadgeInfo = isTimeTrialMarker
            ? timeTrialSplitBadgeByEntityKey.get(
                group.timeTrialEntityKey ?? group.code
              ) ?? null
            : null
          const splitBadgeLabel = splitBadgeInfo?.label ?? null
          const splitBadgeY = Math.max(
            4,
            markerY - 12
          )

          if (isRoadGroupMarker) {
            /*
             * Road-group profile marker v2:
             * - Restore the P/G/B pill on top, because it is much easier to
             *   read while watching the race.
             * - Make the vertical stem visually meaningful: about 400 m on
             *   low terrain, automatically shortened on climbs so it never
             *   crosses the top altitude line.
             * - Keep a small road dot anchored to the actual profile line.
             */
            const elevationSpan = Math.max(
              profilePayload.maxElevation - profilePayload.minElevation,
              1
            )
            const innerHeight = height - padding.top - padding.bottom
            const pixelsPerMeter = innerHeight / elevationSpan
            const preferredStemPixels = Math.max(
              compact ? 74 : 92,
              400 * pixelsPerMeter
            )
            const roadPillHeight = 18
            const roadPillWidth = Math.max(
              28,
              Math.min(42, 18 + displayedLabel.length * 7)
            )
            const minimumPillY = 4
            const maximumPillY = Math.max(
              minimumPillY,
              coord.y - roadPillHeight - 8
            )
            const basePillY = Math.max(
              minimumPillY,
              coord.y - preferredStemPixels - roadPillHeight
            )
            /*
             * Stagger road labels vertically by road order so nearby G/P/B
             * pills remain readable. This does not change the profile curve or
             * the actual road-dot coordinate; it only changes the pill lane.
             */
            const roadPillLane = Math.min(7, Math.max(0, index))
            const roadLaneSpacing = compact ? 10 : 12
            const roadLaneStackLimit = compact ? 48 : 64
            const roadPillTopY = Math.max(
              minimumPillY,
              Math.min(maximumPillY, basePillY)
            )
            /*
             * Keep road-group labels in a tight readable band. The previous
             * lane stack could push G/P/B pills far down toward the road line
             * when many groups existed, which looked strange on flat sections.
             * This cap keeps the lowest pill close to the highest pill while
             * still allowing a small vertical stagger to avoid overlap.
             */
            const roadPillLowestAllowedY = Math.max(
              minimumPillY,
              Math.min(
                maximumPillY,
                roadPillTopY + roadLaneStackLimit,
                coord.y - roadPillHeight - 8
              )
            )
            const roadPillY = Math.min(
              roadPillLowestAllowedY,
              Math.max(
                minimumPillY,
                roadPillTopY + roadPillLane * roadLaneSpacing
              )
            )
            const roadStemTopY = roadPillY + roadPillHeight
            const roadMarkerRadius = coord.y < height * 0.48 ? 4.2 : 5.2

            return (
              <g key={group.code}>
                <title>
                  {[
                    group.label,
                    `${group.riderCount ?? 0} riders`,
                    group.gapLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </title>

                <line
                  x1={coord.x}
                  y1={roadStemTopY}
                  x2={coord.x}
                  y2={coord.y}
                  stroke={markerStroke}
                  strokeWidth="2"
                  opacity={0.86}
                />

                <rect
                  x={coord.x - roadPillWidth / 2}
                  y={roadPillY}
                  width={roadPillWidth}
                  height={roadPillHeight}
                  rx={9}
                  fill={markerFill}
                  stroke={markerStroke}
                  strokeWidth={0}
                />

                <text
                  x={coord.x}
                  y={roadPillY + roadPillHeight / 2 + 3.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill={markerTextColor}
                >
                  {displayedLabel}
                </text>

                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r={roadMarkerRadius}
                  fill={markerFill}
                  stroke="#ffffff"
                  strokeWidth={1.25}
                />
              </g>
            )
          }

          return (
            <g key={group.code}>
              <title>
                {[
                  ...specialLeaderTypes.map(
                    getReplaySpecialLeaderTitle
                  ),
                  group.label,
                  entityType === 'rider'
                    ? group.teamName
                    : `${group.riderCount ?? 0} riders`,
                  group.entityState
                    ? humanizeCode(group.entityState)
                    : null,
                  group.gapLabel,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </title>

              <circle
                cx={coord.x}
                cy={coord.y}
                r={connectorRadius}
                fill={markerFill}
                stroke={markerStroke}
                strokeWidth={1}
              />

              <line
                x1={coord.x}
                y1={coord.y}
                x2={coord.x}
                y2={Math.max(
                  18,
                  coord.y + yOffset
                )}
                stroke={markerStroke}
                strokeWidth="2"
              />

              <rect
                x={coord.x - markerWidth / 2}
                y={markerY}
                width={markerWidth}
                height={markerHeight}
                rx={markerRadius}
                fill={markerFill}
                stroke={markerStroke}
                strokeWidth={0}
              />

              <text
                x={coord.x}
                y={markerTextY}
                textAnchor="middle"
                fontSize={isRiderMarker ? '10' : '10'}
                fontWeight="800"
                fill={markerTextColor}
              >
                {displayedLabel}
              </text>

              {splitBadgeLabel ? (
                <text
                  x={coord.x}
                  y={splitBadgeY}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="900"
                  fill="#047857"
                >
                  {splitBadgeLabel}
                </text>
              ) : null}

              {specialLeaderTypes.map(
                (type, badgeIndex) => {
                  const badgeWidth =
                    type === 'pts' ? 34 : 30

                  /*
                   * Keep the road-group marker anchored at the true
                   * group position. Leader jerseys extend backward to
                   * the left, so GC sits nearest to the group marker,
                   * followed by CL and then PTS.
                   *
                   * Visual order with all three:
                   *
                   * [PTS] [CL] [GC] [P / G1 / G2 / ...]
                   */
                  const precedingWidth =
                    specialLeaderTypes
                      .slice(0, badgeIndex)
                      .reduce(
                        (total, previousType) =>
                          total +
                          (previousType === 'pts'
                            ? 34
                            : 30),
                        0
                      )

                  const badgeX =
                    coord.x -
                    markerWidth / 2 -
                    4 -
                    precedingWidth -
                    badgeIndex * 4 -
                    badgeWidth

                  const badgeFill =
                    type === 'gc'
                      ? '#facc15'
                      : type === 'cl'
                        ? 'url(#komLeaderPattern)'
                        : '#10b981'

                  const badgeStroke =
                    type === 'gc'
                      ? '#ca8a04'
                      : type === 'cl'
                        ? '#dc2626'
                        : '#059669'

                  const badgeTextColor =
                    type === 'pts'
                      ? '#ffffff'
                      : type === 'cl'
                        ? '#b91c1c'
                        : '#111827'

                  const badgeLabel =
                    type === 'gc'
                      ? 'GC'
                      : type === 'cl'
                        ? 'CL'
                        : 'PTS'

                  return (
                    <g key={type}>
                      <rect
                        x={badgeX}
                        y={Math.max(
                          4,
                          coord.y + yOffset - 18
                        )}
                        width={badgeWidth}
                        height="18"
                        rx="9"
                        fill={badgeFill}
                        stroke={badgeStroke}
                        strokeWidth="1.5"
                      />

                      <text
                        x={badgeX + badgeWidth / 2}
                        y={Math.max(
                          17,
                          coord.y + yOffset - 5
                        )}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="800"
                        fill={badgeTextColor}
                      >
                        {badgeLabel}
                      </text>
                    </g>
                  )
                }
              )}
            </g>
          )
        })}

        <text x={padding.left} y={height - 8} fontSize="13" fontWeight="700" fill="#0f172a">
          0 km
        </text>
        <text
          x={width - padding.right}
          y={height - 8}
          textAnchor="end"
          fontSize="13"
          fontWeight="700"
          fill="#0f172a"
        >
          {formatKm(profilePayload.maxKm)}
        </text>
      </svg>

      {visibleGcLeaderGroupCode ||
      visibleClLeaderGroupCode ||
      visiblePointsLeaderGroupCode ? (
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-600">
          {visibleGcLeaderGroupCode && (
            <div className="flex items-center gap-2">
              {renderSpecialLeaderBadge('gc')}
              <span>
                Stage-start general classification leader group
              </span>
            </div>
          )}

          {visibleClLeaderGroupCode && (
            <div className="flex items-center gap-2">
              {renderSpecialLeaderBadge('cl')}
              <span>
                Stage-start climber classification leader group
              </span>
            </div>
          )}

          {visiblePointsLeaderGroupCode && (
            <div className="flex items-center gap-2">
              {renderSpecialLeaderBadge('pts')}
              <span>
                Stage-start points classification leader group
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function getReplayWeatherSummary(
  stage: RaceStage,
  profile: StageProfileDetailPayload | null
) {
  const metadata =
    (stage.metadata as Record<string, unknown> | null) ?? {}

  const weather = {
    ...getRecord(profile?.weather_snapshot),
    ...getRecord(profile?.stage_weather),
    ...getRecord(stage.weather_snapshot),
    ...getRecord(metadata.weather),
  }

  const firstNumber = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = asNumber(weather[key] as number | string | null | undefined)
      if (value !== null) return value
    }

    return null
  }

  const firstText = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = weather[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }

    return null
  }

  const temperature = firstNumber(
    'temperature_c',
    'avg_temp_c',
    'temp_c',
    'temperature'
  )
  const wind = firstNumber('wind_kmh', 'avg_wind_kmh', 'wind_speed_kmh')
  const rain = firstNumber(
    'rain_mm',
    'precip_mm',
    'avg_precip_mm',
    'precipitation_mm'
  )
  const storedRainLabel = firstText(
    'rain_label',
    'precipitation_label',
    'rain_status'
  )

  return {
    temperature:
      temperature === null ? '—' : `${temperature.toFixed(1)}°C`,
    wind: wind === null ? '—' : `${wind.toFixed(0)} km/h`,
    rain:
      storedRainLabel ??
      (rain === null
        ? '—'
        : rain <= 0.05
          ? 'Dry'
          : `${rain.toFixed(1)} mm`),
  }
}


function getPointBattleEventType(pointType?: string | null): string {
  const normalizedType = pointType?.toUpperCase() ?? ''

  if (normalizedType === 'KOM') return 'kom'
  if (normalizedType === 'FINISH') return 'finish'

  return 'sprint'
}

function getPointBattleTitle(row: RacePointResultRow): string {
  const pointType = row.point_type?.toUpperCase() ?? ''
  const pointName = row.point_name?.trim()
  const sortOrder = asNumber(row.sort_order)

  if (pointName) return pointName

  if (pointType === 'KOM') {
    return row.kom_category
      ? `KOM ${row.kom_category}`
      : 'KOM'
  }

  if (pointType === 'FINISH') return 'Finish'

  return sortOrder !== null && sortOrder > 0
    ? `Sprint ${sortOrder}`
    : 'Sprint'
}

function getPointBattleDescription(row: RacePointResultRow): string {
  const riderName = row.rider_name_snapshot?.trim()
  const teamName = row.team_name_snapshot?.trim()
  const pointsAwarded = asNumber(row.points_awarded) ?? 0
  const bonusSeconds = asNumber(row.bonus_seconds_awarded) ?? 0
  const winnerLine = riderName
    ? teamName
      ? `${riderName} (${teamName})`
      : riderName
    : null

  const rewardParts = [
    pointsAwarded > 0
      ? `${pointsAwarded} ${pointsAwarded === 1 ? 'point' : 'points'}`
      : null,
    bonusSeconds > 0
      ? `${bonusSeconds}s bonus`
      : null,
  ].filter(Boolean)

  if (winnerLine && rewardParts.length > 0) {
    return `${winnerLine} takes ${rewardParts.join(' and ')}.`
  }

  if (winnerLine) {
    return `${winnerLine} wins the point battle.`
  }

  return 'Point battle reached.'
}

function buildStagePointReplayEvents(
  pointResults: RacePointResultRow[],
  raceId: string,
  stageId: string
): RaceStageReportEvent[] {
  const winnerRowsByPointKey = new Map<string, RacePointResultRow>()

  pointResults.forEach((row) => {
    const pointType = row.point_type?.toUpperCase() ?? ''

    if (
      pointType !== 'INTERMEDIATE_SPRINT' &&
      pointType !== 'BONUS_SPRINT' &&
      pointType !== 'KOM' &&
      pointType !== 'FINISH'
    ) {
      return
    }

    const pointKm = asNumber(row.km_from_start)
    if (pointKm === null) return

    const pointKey =
      row.point_id?.trim() ||
      `${pointType}-${pointKm}-${row.point_name?.trim() ?? ''}-${row.sort_order ?? ''}`
    const existingRow = winnerRowsByPointKey.get(pointKey)
    const existingRank = asNumber(existingRow?.rank) ?? Number.MAX_SAFE_INTEGER
    const nextRank = asNumber(row.rank) ?? Number.MAX_SAFE_INTEGER

    if (!existingRow || nextRank < existingRank) {
      winnerRowsByPointKey.set(pointKey, row)
    }
  })

  return Array.from(winnerRowsByPointKey.values())
    .sort((left, right) => {
      const leftKm = asNumber(left.km_from_start) ?? Number.MAX_VALUE
      const rightKm = asNumber(right.km_from_start) ?? Number.MAX_VALUE

      if (leftKm !== rightKm) return leftKm - rightKm

      return (asNumber(left.sort_order) ?? 0) - (asNumber(right.sort_order) ?? 0)
    })
    .map((row, index) => {
      const pointKm = asNumber(row.km_from_start)
      const pointType = row.point_type?.toUpperCase() ?? ''
      const eventType = getPointBattleEventType(pointType)
      const eventOrderBase = asNumber(row.sort_order) ?? index + 1

      return {
        id: `frontend-stage-point-${stageId}-${row.point_id ?? `${eventType}-${index}`}`,
        race_id: raceId,
        stage_id: stageId,
        event_order: 100000 + eventOrderBase,
        km_marker: pointKm,
        race_time_label: null,
        event_type: eventType,
        title: getPointBattleTitle(row),
        description: getPointBattleDescription(row),
        rider_id: row.rider_id,
        team_id: row.team_id,
        rider_name_snapshot: row.rider_name_snapshot,
        team_name_snapshot: row.team_name_snapshot,
        metadata: {
          source: 'frontend_stage_point_replay_events_fallback_v1',
          display_event_type: 'point_battle_fallback',
          point_id: row.point_id,
          point_type: row.point_type,
          point_name: row.point_name,
          kom_category: row.kom_category,
          rank: row.rank,
          points_awarded: row.points_awarded,
          bonus_seconds_awarded: row.bonus_seconds_awarded,
        },
      }
    })
}

type ReplayPlaybackSpeed = 1 | 2 | 4 | 8

function RaceReplayModal({
  open,
  race,
  stage,
  currentClubId,
  viewerClubFamilyIds,
  participantTeams,
  canViewRaceReplay,
  liveState,
  lockReplaySpeed,
  displayMode = 'modal',
  onClose,
}: {
  open: boolean
  race: Race | null
  stage: RaceStage | null
  currentClubId?: string | null
  viewerClubFamilyIds?: string[]
  participantTeams: RaceParticipantTeam[]
  canViewRaceReplay?: boolean | null
  liveState: RaceStageLiveState | null
  lockReplaySpeed: boolean
  displayMode?: 'modal' | 'page'
  onClose: () => void
}) {
  const [speed, setSpeed] = useState<ReplayPlaybackSpeed>(1)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [timeTrialRaceClockSeconds, setTimeTrialRaceClockSeconds] = useState(0)
  const [replayManuallyStarted, setReplayManuallyStarted] = useState(false)
  const playbackAnimationFrameRef = useRef<number | null>(null)
  const playbackLastTickRef = useRef<number | null>(null)
  const stageStandingScrollRef = useRef<HTMLDivElement | null>(null)
  const [events, setEvents] = useState<RaceStageReportEvent[]>([])
  const [resultsPayload, setResultsPayload] = useState<RaceResultsViewPayload | null>(null)
  const [pointResults, setPointResults] = useState<RacePointResultRow[]>([])
  const [replayProfile, setReplayProfile] =
    useState<StageProfileDetailPayload | null>(null)
  const [replayFrames, setReplayFrames] = useState<RaceReplayFrame[]>([])
  const [
    preStageLeaderSnapshot,
    setPreStageLeaderSnapshot,
  ] = useState<RacePreStageLeaderSnapshot | null>(
    null
  )
  const [previousGcClassifications, setPreviousGcClassifications] =
    useState<RaceClassificationRow[]>([])

  const isReplayPageMode = displayMode === 'page'
  const isLiveBroadcast = liveState?.is_live === true
  const areReplaySpeedControlsLocked =
    isLiveBroadcast || lockReplaySpeed

  const viewerTeamId = getViewerTeamId(currentClubId)
  const viewerTeamIds = getViewerTeamIds(viewerTeamId, viewerClubFamilyIds)
  const localParticipationAccess = userTeamParticipatedInRace(
    participantTeams,
    viewerTeamIds
  )
  const userParticipated = canViewRaceReplay === true || localParticipationAccess

  const replayPlaybackDurationMs = getReplayPlaybackDurationMs(replayFrames)
  const replayInitialProgress = getReplayInitialProgress(replayFrames)

  const participantRiderById = useMemo(() => {
    const entries = participantTeams.flatMap((team) =>
      team.riders.map(
        (rider) => [rider.rider_id, rider] as const
      )
    )

    return new Map(entries)
  }, [participantTeams])


  const currentTeamNameByRiderId = useMemo(() => {
    const entries = participantTeams.flatMap((team) => {
      const currentTeamName = getParticipantTeamName(team)

      return team.riders.map(
        (rider) => [rider.rider_id, currentTeamName] as const
      )
    })

    return new Map(entries)
  }, [participantTeams])

  const currentTeamNameByTeamId = useMemo(() => {
    const entries = participantTeams.flatMap((team) => {
      const currentTeamName = getParticipantTeamName(team)

      return [
        team.id,
        team.team_id,
        team.club_id,
        team.owner_club_id,
        team.participating_club_id,
        team.race_team_entry_id,
      ]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
        .map((id) => [id, currentTeamName] as const)
    })

    return new Map(entries)
  }, [participantTeams])

  useEffect(() => {
    if (!open) return

    stageStandingScrollRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [open, stage?.id, replayManuallyStarted])

  useEffect(() => {
    if (!open || !isLiveBroadcast) return

    function updateLiveProgress() {
      const startedAt = Date.parse(
        liveState?.live_started_at ?? ''
      )

      const endsAt = Date.parse(
        liveState?.live_ends_at ?? ''
      )

      if (
        !Number.isFinite(startedAt) ||
        !Number.isFinite(endsAt) ||
        endsAt <= startedAt
      ) {
        return
      }

      const nextProgress = Math.max(
        0,
        Math.min(
          1,
          (Date.now() - startedAt) /
            (endsAt - startedAt)
        )
      )

      setProgress(nextProgress)

      /*
       * Live road replays can derive the current frame from the
       * normalized 0..1 progress value. Time-trial replays cannot:
       * their visible positions are keyed by the real competition
       * clock stored in race_seconds / metadata.competition_seconds.
       *
       * Without syncing this live clock, prologue / ITT / TTT replays
       * stay pinned to the first frame for the whole live window even
       * while the UI shows Live · 1x. Map the 15-minute live window to
       * the stored TT competition clock so the first live watch moves
       * immediately and uses the same TT interpolation as historical
       * replay.
       */
      const primaryEntityType =
        getTimeTrialReplayPrimaryEntityType(replayFrames)
      const timeTrialBounds = primaryEntityType
        ? getReplayTimeTrialClockBounds(
            replayFrames,
            primaryEntityType
          )
        : null

      if (timeTrialBounds) {
        const durationSeconds = Math.max(
          1,
          timeTrialBounds.endSeconds -
            timeTrialBounds.startSeconds
        )

        setTimeTrialRaceClockSeconds(
          Math.min(
            timeTrialBounds.endSeconds,
            Math.max(
              timeTrialBounds.startSeconds,
              timeTrialBounds.startSeconds +
                nextProgress * durationSeconds
            )
          )
        )
      }
    }

    updateLiveProgress()

    const interval = window.setInterval(
      updateLiveProgress,
      100
    )

    return () => window.clearInterval(interval)
  }, [
    open,
    isLiveBroadcast,
    liveState?.live_started_at,
    liveState?.live_ends_at,
    replayFrames,
  ])

  useEffect(() => {
    if (!open || isLiveBroadcast || !playing) {
      playbackLastTickRef.current = null

      if (playbackAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackAnimationFrameRef.current)
        playbackAnimationFrameRef.current = null
      }

      return
    }

    let cancelled = false

    function tick(timestamp: number) {
      if (cancelled) return

      const lastTick = playbackLastTickRef.current ?? timestamp
      const elapsedMs = Math.max(0, timestamp - lastTick)

      playbackLastTickRef.current = timestamp

      if (elapsedMs > 0) {
        const primaryEntityType = getTimeTrialReplayPrimaryEntityType(replayFrames)
        const timeTrialBounds = primaryEntityType
          ? getReplayTimeTrialClockBounds(
              replayFrames,
              primaryEntityType
            )
          : null

        if (timeTrialBounds) {
          const clockDurationSeconds = Math.max(
            1,
            timeTrialBounds.endSeconds -
              timeTrialBounds.startSeconds
          )
          const safePlaybackDurationMs = Math.max(
            1000,
            replayPlaybackDurationMs
          )
          const clockAdvanceSeconds =
            (elapsedMs / safePlaybackDurationMs) *
            clockDurationSeconds *
            speed

          setTimeTrialRaceClockSeconds((value) => {
            const baseValue =
              value > 0
                ? value
                : timeTrialBounds.startSeconds
            const next = Math.min(
              timeTrialBounds.endSeconds,
              Math.max(
                timeTrialBounds.startSeconds,
                baseValue + clockAdvanceSeconds
              )
            )

            setProgress(
              Math.max(
                0,
                Math.min(
                  1,
                  (next - timeTrialBounds.startSeconds) /
                    clockDurationSeconds
                )
              )
            )

            return next
          })
        } else {
          const effectiveRoadSpeed = getRoadReplayEffectivePlaybackSpeed(speed)

          setProgress((value) => {
            const safeDurationMs = Math.max(
              1000,
              replayPlaybackDurationMs
            )

            const next =
              value + (elapsedMs / safeDurationMs) * effectiveRoadSpeed

            return next >= 1 ? 1 : next
          })
        }
      }

      playbackAnimationFrameRef.current =
        window.requestAnimationFrame(tick)
    }

    playbackAnimationFrameRef.current =
      window.requestAnimationFrame(tick)

    return () => {
      cancelled = true
      playbackLastTickRef.current = null

      if (playbackAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackAnimationFrameRef.current)
        playbackAnimationFrameRef.current = null
      }
    }
  }, [
    open,
    isLiveBroadcast,
    playing,
    replayFrames,
    replayPlaybackDurationMs,
    speed,
  ])

  useEffect(() => {
    if (!open) return

    setPlaying(false)
    setSpeed(1)
    setReplayManuallyStarted(false)
    playbackLastTickRef.current = null

    if (!isLiveBroadcast) {
      setProgress(0)
      setTimeTrialRaceClockSeconds(0)
    }
  }, [open, stage?.id, isLiveBroadcast])

  useEffect(() => {
    const primaryEntityType = getTimeTrialReplayPrimaryEntityType(replayFrames)
    const timeTrialBounds = primaryEntityType
      ? getReplayTimeTrialClockBounds(
          replayFrames,
          primaryEntityType
        )
      : null

    if (timeTrialBounds) {
      if (timeTrialRaceClockSeconds >= timeTrialBounds.endSeconds) {
        setPlaying(false)
        playbackLastTickRef.current = null
      }

      return
    }

    if (progress >= 1) {
      setPlaying(false)
      playbackLastTickRef.current = null
    }
  }, [progress, replayFrames, timeTrialRaceClockSeconds])

  useEffect(() => {
    if (!open || isLiveBroadcast) return

    const primaryEntityType = getTimeTrialReplayPrimaryEntityType(replayFrames)
    const timeTrialBounds = primaryEntityType
      ? getReplayTimeTrialClockBounds(
          replayFrames,
          primaryEntityType
        )
      : null

    if (!timeTrialBounds) return

    setTimeTrialRaceClockSeconds((value) => {
      if (value > 0) {
        return Math.min(
          timeTrialBounds.endSeconds,
          Math.max(timeTrialBounds.startSeconds, value)
        )
      }

      return timeTrialBounds.startSeconds
    })
  }, [open, isLiveBroadcast, replayFrames])

  useEffect(() => {
    if (!open || !stage?.id || !race?.id) {
      setEvents([])
      setResultsPayload(null)
      setPointResults([])
      setReplayProfile(null)
      setReplayFrames([])
      setPreStageLeaderSnapshot(null)
      setPreviousGcClassifications([])
      setPlaying(false)
      return
    }

    setPreStageLeaderSnapshot(null)

    let cancelled = false

    async function loadReplayData() {
      if (!stage?.id || !race?.id) return

      const [
        { data: reportData },
        { data: resultsData },
        { data: profileData },
        {
          data: frameData,
          error: frameDataError,
        },
        {
          data: stagePointData,
          error: stagePointError,
        },
        {
          data: preStageLeaderData,
          error: preStageLeaderError,
        },
      ] = await Promise.all([
        supabase.rpc('get_race_stage_report_v1', {
          p_stage_id: stage.id,
        }),

        supabase.rpc('get_race_results_view_v1', {
          p_race_id: race.id,
          p_after_stage_id: stage.id,
        }),

        supabase.rpc('get_race_stage_profile_detail_v1', {
          p_stage_id: stage.id,
        }),

        loadAllRaceStageReplayFrames(stage.id),

        supabase.rpc('get_race_stage_point_results_v1', {
          p_stage_id: stage.id,
        }),

        supabase.rpc(
          'get_race_stage_pre_stage_leaders_v1',
          {
            p_stage_id: stage.id,
          }
        ),
      ])

      if (preStageLeaderError) {
        throw preStageLeaderError
      }

      const normalizedPreStageLeaderData =
        Array.isArray(preStageLeaderData)
          ? preStageLeaderData[0]
          : preStageLeaderData

      let previousGcRows: RaceClassificationRow[] = []

      if (Number(stage.stage_number) > 1) {
        const { data: previousStageRows } = await supabase
          .from('race_stages')
          .select('id, stage_number')
          .eq('race_id', race.id)
          .lt('stage_number', stage.stage_number)
          .order('stage_number', { ascending: false })
          .limit(1)

        const previousStageId = previousStageRows?.[0]?.id

        if (previousStageId) {
          const { data: previousResultsData } = await supabase.rpc(
            'get_race_results_view_v1',
            {
              p_race_id: race.id,
              p_after_stage_id: previousStageId,
            }
          )

          const previousPayload =
            await hydrateRaceResultsPayloadDisplayNames(
              normalizeRaceResultsPayload(
                previousResultsData
              )
            )

          previousGcRows =
            previousPayload.classifications.filter(
              (row) =>
                row.entity_type === 'rider' &&
                isGeneralClassificationCode(
                  String(row.classification_type)
                )
            )
        }
      }

      if (cancelled) return

      const normalizedResults = await hydrateRaceResultsPayloadDisplayNames(
        normalizeRaceResultsPayload(resultsData)
      )
      const normalizedReportEvents = Array.isArray(reportData)
        ? (reportData as RaceStageReportEvent[])
        : []
      const hydratedReportEvents =
        await hydrateRaceReportEventDisplayNames(normalizedReportEvents)

      setEvents(hydratedReportEvents)
      setResultsPayload(normalizedResults)
      if (stagePointError) {
        console.error(
          'get_race_stage_point_results_v1 failed:',
          stagePointError
        )
      }

      const hydratedStagePointRows = await hydrateRacePointResultRowsDisplayNames(
        !stagePointError && Array.isArray(stagePointData)
          ? (stagePointData as RacePointResultRow[])
          : []
      )

      setPointResults(hydratedStagePointRows)
      if (frameDataError) {
        console.error(
          'get_race_stage_replay_frames_v1 paged load failed:',
          frameDataError
        )
      }

      setReplayProfile(normalizeStageProfileDetailPayload(profileData))
      setReplayFrames(
        !frameDataError && Array.isArray(frameData)
          ? (frameData as RaceReplayFrame[])
          : []
      )
      setPreStageLeaderSnapshot(
        normalizedPreStageLeaderData &&
          typeof normalizedPreStageLeaderData ===
            'object'
          ? (
              normalizedPreStageLeaderData as
                RacePreStageLeaderSnapshot
            )
          : null
      )
      setPreviousGcClassifications(previousGcRows)
    }

    loadReplayData()

    return () => {
      cancelled = true
    }
  }, [open, race?.id, stage?.id, liveState?.simulation_run_id])

  const hasBackendPointBattleEvents = useMemo(() => {
    return events.some((event) => {
      const metadata = event.metadata ?? {}

      return (
        metadata.source === 'race_engine_point_battle_report_events_v1' ||
        metadata.display_event_type === 'point_battle' ||
        String(metadata.source ?? '').includes('point_battle_report_events')
      )
    })
  }, [events])

  const stagePointEvents = useMemo(
    () =>
      !hasBackendPointBattleEvents && race?.id && stage?.id
        ? buildStagePointReplayEvents(
            pointResults,
            race.id,
            stage.id
          )
        : [],
    [pointResults, race?.id, stage?.id, hasBackendPointBattleEvents]
  )

  const replayEvents = useMemo(() => {
    return [...events, ...stagePointEvents].sort((left, right) => {
      const leftKm =
        asNumber(left.km_marker) ?? Number.MAX_VALUE

      const rightKm =
        asNumber(right.km_marker) ?? Number.MAX_VALUE

      if (leftKm !== rightKm) {
        return leftKm - rightKm
      }

      return left.event_order - right.event_order
    })
  }, [events, stagePointEvents])

  if (!open || !stage) return null

  const replayWeather = getReplayWeatherSummary(stage, replayProfile)

  const maxFrameNumber = replayFrames.reduce(
    (maximum, frame) =>
      Math.max(maximum, Number(frame.frame_number) || 0),
    0
  )

  const timeTrialPrimaryEntityType =
    getTimeTrialReplayPrimaryEntityType(replayFrames)
  const isTimeTrialReplay =
    timeTrialPrimaryEntityType !== null
  const isTeamTimeTrialReplay =
    isTeamTimeTrialLikeStage(stage) ||
    timeTrialPrimaryEntityType === 'team'
  const timeTrialClockBounds = isTimeTrialReplay
    ? getReplayTimeTrialClockBounds(
        replayFrames,
        timeTrialPrimaryEntityType
      )
    : null
  const currentTimeTrialRaceSeconds =
    timeTrialClockBounds !== null
      ? Math.min(
          timeTrialClockBounds.endSeconds,
          Math.max(
            timeTrialClockBounds.startSeconds,
            timeTrialRaceClockSeconds
          )
        )
      : null

  const replayStarted = timeTrialClockBounds !== null
    ? replayManuallyStarted ||
      (currentTimeTrialRaceSeconds ?? timeTrialClockBounds.startSeconds) >
        timeTrialClockBounds.startSeconds
    : replayManuallyStarted || progress > 0

  const replayFinished = timeTrialClockBounds !== null
    ? (currentTimeTrialRaceSeconds ?? timeTrialClockBounds.startSeconds) >=
        timeTrialClockBounds.endSeconds
    : progress >= 1

  const currentFramePosition =
    maxFrameNumber > 0
      ? Math.min(
          maxFrameNumber,
          Math.max(0, progress * maxFrameNumber)
        )
      : 0

  const currentFrames =
    isTimeTrialReplay &&
    currentTimeTrialRaceSeconds !== null
      ? getReplayTimeTrialFramesAtRaceSeconds(
          replayFrames,
          currentTimeTrialRaceSeconds
        )
      : getRoadReplayFramesAtFramePosition(
          replayFrames,
          currentFramePosition
        )

  const rawCurrentGroupFrames = currentFrames.filter(
    (frame) => getReplayEntityType(frame) === 'group'
  )

  const currentGroupFrames = isTimeTrialReplay
    ? rawCurrentGroupFrames
    : getNormalizedRoadReplayGroupsAtFramePosition(
        replayFrames,
        currentFramePosition
      )

  const profileFrames = isTimeTrialReplay
    ? currentFrames
    : currentGroupFrames

  const currentTeamFrames = currentFrames.filter(
    (frame) => getReplayEntityType(frame) === 'team'
  )

  const currentRiderFrames = currentFrames.filter(
    (frame) => getReplayEntityType(frame) === 'rider'
  )

  const currentPelotonGroupOrder =
    currentGroupFrames.find(
      (frame) =>
        getReplayBaseGroupCode(
          frame.group_code
        ) === 'main_peloton'
    )?.group_order ?? null

  const currentLeaderFramesForKm = isTimeTrialReplay
    ? currentFrames
    : currentGroupFrames

  const currentLeaderKm = currentLeaderFramesForKm.reduce(
    (maximum, frame) =>
      Math.max(
        maximum,
        asNumber(frame.km_marker) ?? 0
      ),
    0
  )

  const currentRaceSeconds = isTimeTrialReplay
    ? currentTimeTrialRaceSeconds ??
      getReplayTimeTrialCurrentRaceClockSeconds(currentFrames)
    : currentGroupFrames[0]?.race_seconds ??
      currentFrames[0]?.race_seconds ??
      0

  const displayProgress =
    timeTrialClockBounds !== null &&
    currentTimeTrialRaceSeconds !== null
      ? Math.max(
          0,
          Math.min(
            1,
            (currentTimeTrialRaceSeconds -
              timeTrialClockBounds.startSeconds) /
              Math.max(
                1,
                timeTrialClockBounds.endSeconds -
                  timeTrialClockBounds.startSeconds
              )
          )
        )
      : progress

  const timeTrialCommentaryEvents: RaceStageReportEvent[] = []

  if (isTimeTrialReplay && race?.id && stage?.id) {
    const commentaryEntityType = currentTeamFrames.length > 0
      ? 'team'
      : 'rider'

    const framesByEntityKey = new Map<string, RaceReplayFrame[]>()

    replayFrames
      .filter(
        (frame) =>
          getReplayEntityType(frame) === commentaryEntityType
      )
      .forEach((frame) => {
        const key = getReplayTimeTrialFrameKey(frame)
        framesByEntityKey.set(
          key,
          [...(framesByEntityKey.get(key) ?? []), frame]
        )
      })

    const halfKm = Math.max(
      0,
      (asNumber(stage.distance_km) ?? 0) / 2
    )

    const timeTrialStageKindLabel = getTimeTrialStageKindLabel(stage)
    const timeTrialWeatherIntro = getReplayWeatherIntroSentence(replayWeather)

    const sortedTimeTrialEntityInfos = Array.from(
      framesByEntityKey.entries()
    )
      .map(([key, entityFrames]) => {
        const sortedFrames = [...entityFrames].sort(
          (left, right) =>
            Number(left.frame_number) - Number(right.frame_number)
        )

        const firstStartedFrame = sortedFrames.find((frame) => {
          const state = getReplayEntityState(frame)

          return (
            state !== 'waiting' &&
            getReplayTimeTrialLiveElapsedSeconds(frame) !== null
          )
        })

        const labelFrame = firstStartedFrame ?? sortedFrames[0]

        if (!labelFrame) return null

        return {
          key,
          shortLabel: getReplayTimeTrialMarkerShortLabel(labelFrame),
          name: getReplayFrameLabel(labelFrame),
          teamName: getReplayFrameTeamName(labelFrame),
          startOrder:
            getReplayTimeTrialStartOrder(labelFrame) ??
            Number.MAX_SAFE_INTEGER,
        }
      })
      .filter(
        (info): info is {
          key: string
          shortLabel: string
          name: string
          teamName: string
          startOrder: number
        } => Boolean(info)
      )
      .sort(
        (left, right) =>
          left.startOrder - right.startOrder ||
          left.name.localeCompare(right.name)
      )

    const timeTrialEntityInfoByKey = new Map<
      string,
      {
        key: string
        shortLabel: string
        name: string
        teamName: string
        startOrder: number
        next: {
          shortLabel: string
          name: string
          teamName: string
        } | null
      }
    >()

    sortedTimeTrialEntityInfos.forEach((info, index) => {
      const next = sortedTimeTrialEntityInfos[index + 1] ?? null

      timeTrialEntityInfoByKey.set(info.key, {
        ...info,
        next: next
          ? {
              shortLabel: next.shortLabel,
              name: next.name,
              teamName: next.teamName,
            }
          : null,
      })
    })

    if (sortedTimeTrialEntityInfos.length > 0) {
      const openingFirst = sortedTimeTrialEntityInfos[0]
      const openingSecond = sortedTimeTrialEntityInfos[1] ?? null

      timeTrialCommentaryEvents.push({
        id: `${stage.id}-time-trial-welcome`,
        race_id: race.id,
        stage_id: stage.id,
        event_order: 799999,
        km_marker: 0,
        race_time_label: '0:00:00',
        event_type: 'summary',
        title: `Welcome to Stage ${stage.stage_number}`,
        description: `${race.name} ${timeTrialStageKindLabel} is ready on ${formatStageRoute(stage)}. Weather today: ${timeTrialWeatherIntro}. ${openingFirst.shortLabel} ${openingFirst.name} starts first${openingFirst.teamName ? ` for ${openingFirst.teamName}` : ''}.${openingSecond ? ` Next rider is ${openingSecond.shortLabel} ${openingSecond.name}${openingSecond.teamName ? ` from ${openingSecond.teamName}` : ''}.` : ''}`,
        rider_id: null,
        team_id: null,
        rider_name_snapshot: null,
        team_name_snapshot: null,
        metadata: {
          source: 'frontend_time_trial_replay',
          race_seconds: 0,
          entity_type: commentaryEntityType,
        },
      })
    }

    framesByEntityKey.forEach((entityFrames, key) => {
      const sortedFrames = [...entityFrames].sort(
        (left, right) =>
          Number(left.frame_number) - Number(right.frame_number)
      )

      const startFrame = sortedFrames.find((frame) => {
        const state = getReplayEntityState(frame)
        return (
          state !== 'waiting' &&
          getReplayTimeTrialLiveElapsedSeconds(frame) !== null
        )
      })

      const splitFrame = sortedFrames.find((frame) => {
        const km = asNumber(frame.km_marker) ?? 0
        return (
          km >= halfKm &&
          getReplayTimeTrialLiveElapsedSeconds(frame) !== null
        )
      })

      const finishFrame = sortedFrames.find(
        (frame) =>
          getReplayEntityState(frame) === 'finished' &&
          getReplayTimeTrialLiveElapsedSeconds(frame) !== null
      )

      const entityLabelFrame =
        startFrame || splitFrame || finishFrame || sortedFrames[0]

      if (!entityLabelFrame) return

      const shortLabel =
        getReplayTimeTrialMarkerShortLabel(entityLabelFrame)
      const entityName = getReplayFrameLabel(entityLabelFrame)
      const entityKind = commentaryEntityType === 'team'
        ? 'Team'
        : 'Rider'
      const entityInfo = timeTrialEntityInfoByKey.get(key)
      const nextEntityInfo = entityInfo?.next ?? null
      const stageKind = timeTrialStageKindLabel

      if (startFrame) {
        const startRaceSeconds =
          getReplayTimeTrialRaceClockSeconds(startFrame) ??
          asNumber(startFrame.race_seconds) ??
          0

        timeTrialCommentaryEvents.push({
          id: `${stage.id}-${key}-start`,
          race_id: race.id,
          stage_id: stage.id,
          event_order: 800000 + Math.round(startRaceSeconds),
          km_marker: asNumber(startFrame.km_marker) ?? 0,
          race_time_label: formatDuration(startRaceSeconds),
          event_type: 'start',
          title: `${shortLabel} starts`,
          description: `${entityKind} ${entityName} rolls down the start ramp as ${shortLabel} and starts the ${stageKind}.${nextEntityInfo ? ` Next away is ${nextEntityInfo.shortLabel} ${nextEntityInfo.name}${nextEntityInfo.teamName ? ` from ${nextEntityInfo.teamName}` : ''}.` : ''}`,
          rider_id:
            commentaryEntityType === 'rider'
              ? getReplayTimeTrialFrameKey(startFrame)
              : null,
          team_id:
            commentaryEntityType === 'team'
              ? getReplayTimeTrialFrameKey(startFrame)
              : null,
          rider_name_snapshot:
            commentaryEntityType === 'rider' ? entityName : null,
          team_name_snapshot:
            commentaryEntityType === 'team' ? entityName : null,
          metadata: {
            source: 'frontend_time_trial_replay',
            race_seconds: startRaceSeconds,
            entity_key: key,
            entity_type: commentaryEntityType,
          },
        })
      }

      if (splitFrame) {
        const splitRaceSeconds =
          getReplayTimeTrialRaceClockSeconds(splitFrame) ??
          asNumber(splitFrame.race_seconds) ??
          0
        const elapsedSeconds =
          getReplayTimeTrialLiveElapsedSeconds(splitFrame)

        if (elapsedSeconds !== null) {
          timeTrialCommentaryEvents.push({
            id: `${stage.id}-${key}-half-split`,
            race_id: race.id,
            stage_id: stage.id,
            event_order: 810000 + Math.round(splitRaceSeconds),
            km_marker: asNumber(splitFrame.km_marker) ?? halfKm,
            race_time_label: formatDuration(splitRaceSeconds),
            event_type: 'summary',
            title: `${shortLabel} halfway split`,
            description: `${entityKind} ${entityName} reaches the halfway time check in ${formatDuration(elapsedSeconds)}.`,
            rider_id:
              commentaryEntityType === 'rider'
                ? getReplayTimeTrialFrameKey(splitFrame)
                : null,
            team_id:
              commentaryEntityType === 'team'
                ? getReplayTimeTrialFrameKey(splitFrame)
                : null,
            rider_name_snapshot:
              commentaryEntityType === 'rider' ? entityName : null,
            team_name_snapshot:
              commentaryEntityType === 'team' ? entityName : null,
            metadata: {
              source: 'frontend_time_trial_replay',
              race_seconds: splitRaceSeconds,
              entity_key: key,
              entity_type: commentaryEntityType,
              elapsed_seconds: elapsedSeconds,
            },
          })
        }
      }

      if (finishFrame) {
        const finishRaceSeconds =
          getReplayTimeTrialRaceClockSeconds(finishFrame) ??
          asNumber(finishFrame.race_seconds) ??
          0
        const elapsedSeconds =
          getReplayTimeTrialLiveElapsedSeconds(finishFrame)

        if (elapsedSeconds !== null) {
          timeTrialCommentaryEvents.push({
            id: `${stage.id}-${key}-finish`,
            race_id: race.id,
            stage_id: stage.id,
            event_order: 820000 + Math.round(finishRaceSeconds),
            km_marker:
              asNumber(finishFrame.km_marker) ??
              asNumber(stage.distance_km) ??
              0,
            race_time_label: formatDuration(finishRaceSeconds),
            event_type: 'finish',
            title: `${shortLabel} finishes`,
            description: `${entityKind} ${entityName} finishes in ${formatDuration(elapsedSeconds)}.`,
            rider_id:
              commentaryEntityType === 'rider'
                ? getReplayTimeTrialFrameKey(finishFrame)
                : null,
            team_id:
              commentaryEntityType === 'team'
                ? getReplayTimeTrialFrameKey(finishFrame)
                : null,
            rider_name_snapshot:
              commentaryEntityType === 'rider' ? entityName : null,
            team_name_snapshot:
              commentaryEntityType === 'team' ? entityName : null,
            metadata: {
              source: 'frontend_time_trial_replay',
              race_seconds: finishRaceSeconds,
              entity_key: key,
              entity_type: commentaryEntityType,
              elapsed_seconds: elapsedSeconds,
            },
          })
        }
      }
    })
  }

  const sortedTimeTrialCommentaryEvents =
    timeTrialCommentaryEvents.sort((left, right) => {
      const leftSeconds = asNumber(
        left.metadata?.race_seconds as
          | number
          | string
          | null
          | undefined
      ) ?? 0
      const rightSeconds = asNumber(
        right.metadata?.race_seconds as
          | number
          | string
          | null
          | undefined
      ) ?? 0

      return leftSeconds - rightSeconds || left.event_order - right.event_order
    })

  const visibleEventsChronological = replayStarted
    ? isTimeTrialReplay
      ? sortedTimeTrialCommentaryEvents.filter((event) => {
          if (replayFinished) return true

          const eventSeconds = asNumber(
            event.metadata?.race_seconds as
              | number
              | string
              | null
              | undefined
          )

          return eventSeconds !== null && eventSeconds <= currentRaceSeconds
        })
      : replayEvents.filter((event) => {
          if (replayFinished) return true
          if (event.km_marker === null) return false

          return Number(event.km_marker) <= currentLeaderKm
        })
    : []

  const visibleEvents = [...visibleEventsChronological].sort((left, right) => {
    if (isTimeTrialReplay) {
      const leftSeconds =
        asNumber(
          left.metadata?.race_seconds as
            | number
            | string
            | null
            | undefined
        ) ?? Number.NEGATIVE_INFINITY

      const rightSeconds =
        asNumber(
          right.metadata?.race_seconds as
            | number
            | string
            | null
            | undefined
        ) ?? Number.NEGATIVE_INFINITY

      if (leftSeconds !== rightSeconds) {
        return rightSeconds - leftSeconds
      }

      return right.event_order - left.event_order
    }

    const leftKm =
      asNumber(left.km_marker) ?? Number.NEGATIVE_INFINITY

    const rightKm =
      asNumber(right.km_marker) ?? Number.NEGATIVE_INFINITY

    if (leftKm !== rightKm) {
      return rightKm - leftKm
    }

    return right.event_order - left.event_order
  })

  const groups: RaceReportGroupSummary[] =
    currentGroupFrames.length > 0
      ? currentGroupFrames.map((frame) => ({
          code: frame.group_code,
          label: frame.group_label,
          size: getReplayEntitySize(frame),
          gapSeconds: frame.gap_seconds ?? 0,
        }))
      : currentTeamFrames.length > 0
        ? currentTeamFrames.map((frame) => ({
            code: frame.entity_key || frame.group_code,
            label: getReplayFrameLabel(frame),
            size: getReplayEntitySize(frame),
            gapSeconds: frame.gap_seconds ?? 0,
          }))
        : []

  /*
   * Full rider names are available on classification snapshots.
   *
   * This is more reliable than rider_name_snapshot inside replay
   * frames, because older frame rows can contain abbreviated names.
   */
  const classificationNameByRiderId = new Map<string, string>()

  ;(resultsPayload?.classifications ?? []).forEach((row) => {
    if (
      row.entity_type !== 'rider' ||
      !row.rider_id ||
      !row.display_name_snapshot?.trim()
    ) {
      return
    }

    classificationNameByRiderId.set(
      row.rider_id,
      row.display_name_snapshot.trim()
    )
  })

  const riderCountryCodeById = new Map<string, string>()

  participantTeams.forEach((team) => {
    team.riders.forEach((rider) => {
      const countryCode = normalizeCountryCode(
        rider.country_code_snapshot
      )

      if (rider.rider_id && countryCode) {
        riderCountryCodeById.set(rider.rider_id, countryCode)
      }
    })
  })

  ;(resultsPayload?.stage_results ?? []).forEach((row) => {
    if (!row.rider_id || riderCountryCodeById.has(row.rider_id)) return

    const countryCode = normalizeCountryCode(
      row.rider_country_code ??
        row.nationality_code ??
        row.country_code ??
        null
    )

    if (countryCode) {
      riderCountryCodeById.set(row.rider_id, countryCode)
    }
  })

  const previousGcByRiderId = new Map<
    string,
    {
      rank: number | null
      gapSeconds: number | null
      totalTimeSeconds: number | null
      displayName: string | null
    }
  >()

  if (Number(stage.stage_number) > 1) {
    previousGcClassifications.forEach((row) => {
      if (!row.rider_id) return

      previousGcByRiderId.set(row.rider_id, {
        rank: row.rank,
        gapSeconds: row.gap_seconds,
        totalTimeSeconds: row.total_time_seconds,
        displayName: row.display_name_snapshot,
      })
    })
  }

  /*
   * Only bonuses from gates already reached in the live replay
   * affect the provisional GC.
   *
   * Future sprint and finish bonuses remain excluded until the
   * replay leader reaches those gates.
   */
  const reachedBonusSecondsByRiderId = new Map<string, number>()

  pointResults.forEach((row) => {
    if (!row.rider_id || row.rank === null) return

    const pointKm = asNumber(row.km_from_start)
    const bonusSeconds = Number(
      row.bonus_seconds_awarded ?? 0
    )

    if (
      pointKm === null ||
      pointKm > currentLeaderKm ||
      !Number.isFinite(bonusSeconds) ||
      bonusSeconds <= 0
    ) {
      return
    }

    reachedBonusSecondsByRiderId.set(
      row.rider_id,
      (reachedBonusSecondsByRiderId.get(row.rider_id) ?? 0) +
        bonusSeconds
    )
  })

  const previousGcTotals = Array.from(
    previousGcByRiderId.values()
  )
    .map((row) => row.totalTimeSeconds)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
    )
    .map(Number)

  /*
   * A rider missing from the previous GC must not incorrectly become
   * the provisional leader. Give such a rider a safe fallback behind
   * the final previous-GC rider.
   */
  const missingPreviousGcFallback =
    previousGcTotals.length > 0
      ? Math.max(...previousGcTotals) + 3600
      : 0

  const timeTrialHalfDistanceKm = Math.max(
    0,
    (asNumber(stage.distance_km) ?? 0) / 2
  )

  const timeTrialHalfSplitByRiderId = new Map<
    string,
    {
      elapsedSeconds: number
      gapSeconds: number | null
      raceSeconds: number
    }
  >()

  if (isTimeTrialReplay && timeTrialHalfDistanceKm > 0) {
    const rawSplitRows: {
      riderId: string
      elapsedSeconds: number
      raceSeconds: number
    }[] = []

    const standingEntityType = isTeamTimeTrialReplay
      ? 'team'
      : 'rider'
    const framesByRiderId = new Map<string, RaceReplayFrame[]>()

    replayFrames
      .filter(
        (frame) => getReplayEntityType(frame) === standingEntityType
      )
      .forEach((frame) => {
        const riderId = getReplayTimeTrialFrameKey(frame)
        framesByRiderId.set(
          riderId,
          [...(framesByRiderId.get(riderId) ?? []), frame]
        )
      })

    framesByRiderId.forEach((entityFrames, riderId) => {
      const splitFrame = [...entityFrames]
        .sort(
          (left, right) =>
            Number(left.frame_number) - Number(right.frame_number)
        )
        .find((frame) => {
          const km = asNumber(frame.km_marker) ?? 0
          const elapsed = getReplayTimeTrialLiveElapsedSeconds(frame)
          const raceSeconds = getReplayTimeTrialRaceClockSeconds(frame)

          return (
            km >= timeTrialHalfDistanceKm &&
            elapsed !== null &&
            raceSeconds !== null &&
            raceSeconds <= currentRaceSeconds
          )
        })

      if (!splitFrame) return

      const elapsedSeconds =
        getReplayTimeTrialLiveElapsedSeconds(splitFrame)
      const raceSeconds = getReplayTimeTrialRaceClockSeconds(splitFrame)

      if (elapsedSeconds === null || raceSeconds === null) return

      rawSplitRows.push({
        riderId,
        elapsedSeconds,
        raceSeconds,
      })
    })

    const bestSplitSeconds = rawSplitRows.reduce(
      (best, row) => Math.min(best, row.elapsedSeconds),
      Number.POSITIVE_INFINITY
    )

    rawSplitRows.forEach((row) => {
      timeTrialHalfSplitByRiderId.set(row.riderId, {
        elapsedSeconds: row.elapsedSeconds,
        raceSeconds: row.raceSeconds,
        gapSeconds: Number.isFinite(bestSplitSeconds)
          ? Math.max(0, row.elapsedSeconds - bestSplitSeconds)
          : null,
      })
    })
  }

  const rawFrameStandingRows: ReplayStandingRow[] =
    isTimeTrialReplay
      ? currentFrames
          .filter((frame) =>
            isTeamTimeTrialReplay
              ? getReplayEntityType(frame) === 'team'
              : getReplayEntityType(frame) === 'rider'
          )
          .map((frame) => {
            const standingEntityType = isTeamTimeTrialReplay
              ? 'team'
              : 'rider'
            const riderId =
              standingEntityType === 'team'
                ? frame.entity_id ||
                  frame.entity_key ||
                  frame.group_code ||
                  ''
                : frame.entity_id ||
                  frame.rider_ids?.[0] ||
                  ''

            const previousGc =
              standingEntityType === 'rider'
                ? previousGcByRiderId.get(riderId)
                : null
            const participantRider =
              standingEntityType === 'rider'
                ? participantRiderById.get(riderId)
                : null
            const timeTrialState = getReplayEntityState(frame)
            const liveElapsedSeconds =
              getReplayTimeTrialLiveElapsedSeconds(frame)
            const splitSnapshot =
              timeTrialHalfSplitByRiderId.get(riderId)
            const startOrder =
              getReplayTimeTrialStartOrder(frame)
            const currentTeamFrameName =
              currentTeamNameByTeamId.get(frame.entity_id ?? '') ||
              currentTeamNameByTeamId.get(frame.entity_key ?? '') ||
              null
            const teamFrameName =
              currentTeamFrameName ||
              getReplayFrameTeamName(frame) ||
              getReplayFrameLabel(frame) ||
              (startOrder ? `Team ${startOrder}` : 'Team')

            return {
              rider_id: riderId,
              rider_name:
                standingEntityType === 'team'
                  ? teamFrameName
                  : classificationNameByRiderId.get(riderId) ||
                    previousGc?.displayName?.trim() ||
                    (participantRider ? getRaceParticipantRiderDisplayName(participantRider) : null) ||
                    getReplayFrameLabel(frame),
              team_name:
                standingEntityType === 'team'
                  ? 'Team time trial squad'
                  : currentTeamNameByRiderId.get(riderId) ||
                    participantRider?.team_name_snapshot?.trim() ||
                    getReplayFrameTeamName(frame),
              group_code:
                frame.entity_key ||
                frame.group_code ||
                (standingEntityType === 'team'
                  ? 'time_trial_team'
                  : 'time_trial_rider'),
              group_label:
                getReplayEntityState(frame) === 'waiting'
                  ? 'Waiting'
                  : getReplayEntityState(frame) === 'finished'
                    ? 'Finished'
                    : 'On course',
              group_order:
                startOrder ||
                Number(frame.group_order) ||
                Number(frame.provisional_rank) ||
                9999,
              gap_seconds:
                getReplayFrameGapSeconds(frame),
              rider_country_code:
                standingEntityType === 'team'
                  ? null
                  : riderCountryCodeById.get(riderId) ??
                    normalizeCountryCode(
                      participantRider?.country_code_snapshot
                    ) ??
                    null,
              gc_rank: previousGc?.rank ?? null,
              gc_gap_seconds: previousGc?.gapSeconds ?? null,
              timeTrialLabel:
                getReplayTimeTrialMarkerShortLabel(frame),
              timeTrialStartOrder: startOrder,
              timeTrialState,
              liveElapsedSeconds,
              liveGapSeconds: null,
              splitElapsedSeconds:
                splitSnapshot?.elapsedSeconds ?? null,
              splitGapSeconds:
                splitSnapshot?.gapSeconds ?? null,
              ...getEstimatedReplayRiderEnergySnapshot({
                frame,
                riderId,
                riderIndex: 0,
                currentKm: asNumber(frame.km_marker) ?? currentLeaderKm,
                stageDistanceKm: asNumber(stage.distance_km) ?? 0,
              }),
              standingEntityType,
            }
          })
      : currentGroupFrames.flatMap((frame) =>
          (frame.rider_ids ?? []).map((riderId, index) => {
            const previousGc =
              previousGcByRiderId.get(riderId)
            const participantRider =
              participantRiderById.get(riderId)

            const fullName =
              classificationNameByRiderId.get(riderId) ||
              previousGc?.displayName?.trim() ||
              (participantRider ? getRaceParticipantRiderDisplayName(participantRider) : null) ||
              frame.rider_names?.[index]?.trim() ||
              'Rider'

            return {
              rider_id: riderId,
              rider_name: fullName,
              team_name:
                currentTeamNameByRiderId.get(riderId) ||
                participantRider?.team_name_snapshot?.trim() ||
                frame.team_names?.[index]?.trim() ||
                '',
              group_code: frame.group_code,
              group_label: frame.group_label,
              group_order: frame.group_order,
              gap_seconds: Math.max(
                Number(frame.gap_seconds ?? 0),
                0
              ),
              rider_country_code:
                riderCountryCodeById.get(riderId) ??
                normalizeCountryCode(
                  participantRider?.country_code_snapshot
                ) ??
                null,
              gc_rank: previousGc?.rank ?? null,
              gc_gap_seconds: previousGc?.gapSeconds ?? null,
              ...getEstimatedReplayRiderEnergySnapshot({
                frame,
                riderId,
                riderIndex: index,
                currentKm: asNumber(frame.km_marker) ?? currentLeaderKm,
                stageDistanceKm: asNumber(stage.distance_km) ?? 0,
              }),
            }
          })
        )

  const startedTimeTrialElapsedRows = rawFrameStandingRows
    .map((row) => row.liveElapsedSeconds)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
    )
    .map(Number)

  const bestTimeTrialLiveElapsedSeconds =
    startedTimeTrialElapsedRows.length > 0
      ? Math.min(...startedTimeTrialElapsedRows)
      : null

  const finishedTimeTrialElapsedRows = rawFrameStandingRows
    .filter((row) => row.timeTrialState === 'finished')
    .map((row) => row.liveElapsedSeconds)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
    )
    .map(Number)

  const bestFinishedTimeTrialElapsedSeconds =
    finishedTimeTrialElapsedRows.length > 0
      ? Math.min(...finishedTimeTrialElapsedRows)
      : null

  const finishedTimeTrialCount = finishedTimeTrialElapsedRows.length

  /*
   * Provisional GC while Stage 2 or later is live:
   *
   * previous cumulative GC
   * + current live stage gap
   * - current-stage bonuses already earned
   *
   * The common live race time is the same for everyone and therefore
   * does not need to be added when calculating relative GC gaps.
   */
  const provisionalGcEntries = isTeamTimeTrialReplay
    ? []
    : rawFrameStandingRows.map((row) => {
      const previousGc =
        previousGcByRiderId.get(row.rider_id)

      const previousTotal =
        Number(stage.stage_number) <= 1
          ? 0
          : previousGc?.totalTimeSeconds !== null &&
              previousGc?.totalTimeSeconds !== undefined
            ? Number(previousGc.totalTimeSeconds)
            : missingPreviousGcFallback

      const earnedBonus =
        reachedBonusSecondsByRiderId.get(row.rider_id) ?? 0

      const provisionalTotal = Math.max(
        0,
        previousTotal +
          Math.max(row.gap_seconds, 0) -
          earnedBonus
      )

      return {
        riderId: row.rider_id,
        provisionalTotal,
        previousRank:
          previousGc?.rank ?? Number.MAX_SAFE_INTEGER,
      }
    })

  const sortedProvisionalGcEntries =
    [...provisionalGcEntries].sort(
      (left, right) =>
        left.provisionalTotal -
          right.provisionalTotal ||
        left.previousRank -
          right.previousRank ||
        left.riderId.localeCompare(right.riderId)
    )

  const bestProvisionalGcTime =
    sortedProvisionalGcEntries[0]
      ?.provisionalTotal ?? 0

  const provisionalGcByRiderId = new Map<
    string,
    {
      rank: number
      gapSeconds: number
    }
  >()

  let previousScore: number | null = null
  let previousRank = 0

  sortedProvisionalGcEntries.forEach(
    (entry, index) => {
      const rank =
        previousScore !== null &&
        entry.provisionalTotal === previousScore
          ? previousRank
          : index + 1

      provisionalGcByRiderId.set(entry.riderId, {
        rank,
        gapSeconds: Math.max(
          0,
          entry.provisionalTotal -
            bestProvisionalGcTime
        ),
      })

      previousScore = entry.provisionalTotal
      previousRank = rank
    }
  )


  /*
   * Jersey ownership is frozen at the start of the stage.
   *
   * Stage 2 uses the leaders after Stage 1.
   * Stage 3 uses the leaders after Stage 2.
   *
   * Results produced by the stage currently being replayed must
   * never change these three rider IDs.
   */
  const currentStageNumber =
    stage?.stage_number ?? 1

  const hasEstablishedClassificationLeaders =
    currentStageNumber > 1 &&
    preStageLeaderSnapshot
      ?.has_established_leaders === true

  const preStageGcLeaderRiderId =
    hasEstablishedClassificationLeaders
      ? preStageLeaderSnapshot
          ?.general?.rider_id ?? null
      : null

  const preStageClimberLeaderRiderId =
    hasEstablishedClassificationLeaders
      ? preStageLeaderSnapshot
          ?.mountain?.rider_id ?? null
      : null

  const preStagePointsLeaderRiderId =
    hasEstablishedClassificationLeaders
      ? preStageLeaderSnapshot
          ?.points?.rider_id ?? null
      : null

  function findCurrentRiderGroupCode(
    riderId: string | null
  ): string | null {
    if (!riderId) return null

    return (
      rawFrameStandingRows.find(
        (row) => row.rider_id === riderId
      )?.group_code ?? null
    )
  }

  const gcLeaderGroupCode =
    findCurrentRiderGroupCode(
      preStageGcLeaderRiderId
    )

  const mountainLeaderGroupCode =
    findCurrentRiderGroupCode(
      preStageClimberLeaderRiderId
    )

  const pointsLeaderGroupCode =
    findCurrentRiderGroupCode(
      preStagePointsLeaderRiderId
    )

  /*
   * The blue Peloton remains only P.
   *
   * Show GC, CL or PTS solely when the corresponding pre-stage
   * jersey owner is currently riding outside the Peloton.
   */
  const visibleGcLeaderGroupCode =
    gcLeaderGroupCode &&
    !isPelotonGroup(gcLeaderGroupCode)
      ? gcLeaderGroupCode
      : null

  const visibleClLeaderGroupCode =
    mountainLeaderGroupCode &&
    !isPelotonGroup(
      mountainLeaderGroupCode
    )
      ? mountainLeaderGroupCode
      : null

  const visiblePointsLeaderGroupCode =
    pointsLeaderGroupCode &&
    !isPelotonGroup(pointsLeaderGroupCode)
      ? pointsLeaderGroupCode
      : null

  const frameStandingRows: ReplayStandingRow[] =
    rawFrameStandingRows.map((row) => {
      const provisionalGc =
        row.standingEntityType === 'team'
          ? null
          : provisionalGcByRiderId.get(row.rider_id)
      const liveGapSeconds =
        row.liveElapsedSeconds !== null &&
        row.liveElapsedSeconds !== undefined &&
        bestTimeTrialLiveElapsedSeconds !== null
          ? Math.max(
              0,
              row.liveElapsedSeconds -
                bestTimeTrialLiveElapsedSeconds
            )
          : null

      void provisionalGc

      return {
        ...row,
        liveGapSeconds,
        /*
         * Stage Standing must show the pre-stage GC position/gap,
         * not a live provisional GC. The label remains fixed during
         * the whole stage and is refreshed only when the next stage
         * opens with a new pre-stage leader snapshot.
         */
        gc_rank: row.gc_rank ?? null,
        gc_gap_seconds: row.gc_gap_seconds ?? null,
        /*
         * Jersey tabs in Stage Standing stay attached to the actual
         * pre-stage jersey owners for the whole stage, also while
         * those riders are in the Peloton. The stage profile can still
         * decide separately whether group-level jersey badges are
         * visible.
         */
        isGcLeader:
          row.rider_id === preStageGcLeaderRiderId,

        isPointsLeader:
          row.rider_id === preStagePointsLeaderRiderId,

        isClimberLeader:
          row.rider_id === preStageClimberLeaderRiderId,
      }
    })

  const alphabeticalStandingRows: ReplayStandingRow[] =
    (resultsPayload?.stage_results ?? [])
      .map((row) => {
        const riderId = row.rider_id ?? ''

        const previousGc =
          previousGcByRiderId.get(riderId)

        const participantRider =
          participantRiderById.get(riderId)

        const fullName =
          classificationNameByRiderId.get(riderId) ||
          previousGc?.displayName?.trim() ||
          (participantRider ? getRaceParticipantRiderDisplayName(participantRider) : null) ||
          row.full_name?.trim() ||
          row.rider_full_name?.trim() ||
          row.display_name?.trim() ||
          row.rider_name?.trim() ||
          row.rider_name_snapshot?.trim() ||
          'Rider'

        return {
          rider_id: riderId,
          rider_name: fullName,

          team_name:
            currentTeamNameByRiderId.get(riderId) ||
            participantRider?.team_name_snapshot?.trim() ||
            row.team_name_snapshot?.trim() ||
            '',

          group_code: 'main_peloton',
          group_label: 'Peloton',
          group_order: 1,
          gap_seconds: 0,

          rider_country_code:
            riderCountryCodeById.get(riderId) ??
            normalizeCountryCode(
              participantRider?.country_code_snapshot ??
                row.rider_country_code ??
                row.nationality_code ??
                row.country_code ??
                null
            ) ??
            null,

          gc_rank: previousGc?.rank ?? null,
          gc_gap_seconds:
            previousGc?.gapSeconds ?? null,
          isGcLeader:
            riderId === preStageGcLeaderRiderId,

          isPointsLeader:
            riderId === preStagePointsLeaderRiderId,

          isClimberLeader:
            riderId === preStageClimberLeaderRiderId,
        }
      })
      .sort((left, right) =>
        left.rider_name.localeCompare(
          right.rider_name
        )
      )

  const visibleStandingRows =
    replayStarted && frameStandingRows.length > 0
      ? isTimeTrialReplay
        ? [...frameStandingRows].sort((left, right) => {
            const statePriority = (row: ReplayStandingRow) => {
              if (row.timeTrialState === 'finished') return 0
              if (
                row.liveElapsedSeconds !== null &&
                row.liveElapsedSeconds !== undefined
              ) {
                return 1
              }

              return 2
            }

            const leftPriority = statePriority(left)
            const rightPriority = statePriority(right)

            if (leftPriority !== rightPriority) {
              return leftPriority - rightPriority
            }

            if (leftPriority === 0 && rightPriority === 0) {
              const timeDiff =
                Number(left.liveElapsedSeconds) -
                Number(right.liveElapsedSeconds)

              if (timeDiff !== 0) return timeDiff
            }

            const orderDiff =
              (left.timeTrialStartOrder ?? Number.MAX_SAFE_INTEGER) -
              (right.timeTrialStartOrder ?? Number.MAX_SAFE_INTEGER)

            if (orderDiff !== 0) return orderDiff

            return left.rider_name.localeCompare(right.rider_name)
          })
        : [...frameStandingRows].sort((left, right) => {
            const leftGap = Number(left.gap_seconds ?? 0)
            const rightGap = Number(right.gap_seconds ?? 0)

            if (leftGap !== rightGap) return leftGap - rightGap

            const groupOrderDiff =
              (Number(left.group_order) || Number.MAX_SAFE_INTEGER) -
              (Number(right.group_order) || Number.MAX_SAFE_INTEGER)

            if (groupOrderDiff !== 0) return groupOrderDiff

            return left.rider_name.localeCompare(right.rider_name)
          })
      : alphabeticalStandingRows

  const viewerRiderIds = new Set(
    participantTeams
      .filter(
        (team) =>
          team.club_id === viewerTeamId ||
          team.team_id === viewerTeamId
      )
      .flatMap((team) =>
        team.riders.map((rider) => rider.rider_id)
      )
  )

  return (
    <div
      className={
        isReplayPageMode
          ? 'min-h-screen bg-slate-50 p-6'
          : 'fixed inset-0 z-50 bg-slate-950/70 p-4'
      }
    >
      {isReplayPageMode ? (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back
          </button>
        </div>
      ) : null}

      <div
        className={
          isReplayPageMode
            ? 'flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-xl'
            : 'flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl'
        }
      >
        <div
          className={
            isReplayPageMode
              ? 'grid grid-cols-1 gap-4 border-b border-slate-200 px-5 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start'
              : 'grid grid-cols-1 gap-4 border-b border-slate-200 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'
          }
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Race replay
            </div>

            <div className="mt-1 flex min-w-0 items-center gap-2">
              <RaceTitleFlag
                code={race?.country_code || stage.host_country_code || 'ME'}
              />

              <h2 className="min-w-0 text-xl font-semibold text-slate-950">
                {race?.name ?? 'Race replay'}
              </h2>
            </div>

            <div className="mt-1 text-sm text-slate-500">
              Stage {stage.stage_number} · {stage.name || formatStageRoute(stage)}
            </div>

            <div className="mt-1 break-words text-sm text-slate-500">
              {formatStageRoute(stage)}
            </div>

            {!userParticipated ? (
              <div className="mt-2 text-xs font-semibold text-amber-700">
                Your team is not listed as a participant for this race.
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-start gap-3 lg:justify-end lg:justify-self-end xl:justify-self-end">
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

            {!isReplayPageMode ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={
            isReplayPageMode
              ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5'
              : 'flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6'
          }
        >
          <div
            className={
              isReplayPageMode
                ? 'shrink-0 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm'
                : 'rounded-3xl border border-slate-200 bg-slate-50 p-4'
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-950">
                Stage profile replay
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (playing) {
                      setPlaying(false)
                      return
                    }

                    if (replayFinished) {
                      setProgress(replayInitialProgress)
                      setTimeTrialRaceClockSeconds(
                        timeTrialClockBounds?.startSeconds ?? 0
                      )
                    } else if (timeTrialClockBounds) {
                      setTimeTrialRaceClockSeconds((value) => {
                        if (value > timeTrialClockBounds.startSeconds) {
                          return Math.min(
                            timeTrialClockBounds.endSeconds,
                            value
                          )
                        }

                        return timeTrialClockBounds.startSeconds
                      })
                      setProgress((value) => Math.max(value, 0))
                    } else if (progress <= 0 && replayInitialProgress > 0) {
                      setProgress(replayInitialProgress)
                    }

                    setReplayManuallyStarted(true)
                    setPlaying(true)
                  }}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
                >
                  {playing ? 'Pause' : 'Play'}
                </button>

                {!areReplaySpeedControlsLocked ? (
                  <>
                    {[1, 2, 4, 8].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSpeed(value as ReplayPlaybackSpeed)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                          speed === value
                            ? 'border-slate-950 bg-slate-950 text-white'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {value}x
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setReplayManuallyStarted(true)
                        setProgress(1)
                        if (timeTrialClockBounds) {
                          setTimeTrialRaceClockSeconds(
                            timeTrialClockBounds.endSeconds
                          )
                        }
                        setPlaying(false)
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Finish replay
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    {isLiveBroadcast ? 'Live · 1×' : '1× locked'}
                  </span>
                )}

                <div className="text-xs font-semibold text-slate-500">
                  {Math.round(displayProgress * 100)}%
                </div>
              </div>
            </div>

            <ReplayStageProfile
              stage={stage}
              profile={replayProfile}
              groups={groups}
              frames={profileFrames}
              allFrames={replayFrames}
              currentRaceSeconds={currentTimeTrialRaceSeconds}
              progress={displayProgress}
              visibleGcLeaderGroupCode={
                visibleGcLeaderGroupCode
              }
              visibleClLeaderGroupCode={
                visibleClLeaderGroupCode
              }
              visiblePointsLeaderGroupCode={
                visiblePointsLeaderGroupCode
              }
              compact={isReplayPageMode}
            />
          </div>

          <div
            className={
              isReplayPageMode
                ? 'min-h-0 flex-1 space-y-4 overflow-auto pr-1'
                : 'contents'
            }
          >
          <div className="grid min-h-[420px] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Live commentary
                </div>

                <div className="max-h-[520px] overflow-auto divide-y divide-slate-100">
                  {visibleEvents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500">
                      {!replayStarted
                        ? 'Press Play to start live commentary.'
                        : isTimeTrialReplay
                          ? 'No time-trial commentary event has been reached yet.'
                          : events.length === 0
                            ? 'No commentary events were generated for this stage. The backend must insert stage report events before KOM, sprint, or other race moments can appear here.'
                            : 'No commentary event has been reached yet.'}
                    </div>
                  ) : (
                    visibleEvents.map((event) => (
                      <div
                        key={event.id}
                        className="grid grid-cols-[74px_1fr] gap-3 px-4 py-2.5 text-sm"
                      >
                        <div className="font-semibold text-slate-500">
                          {isTimeTrialReplay && event.race_time_label
                            ? event.race_time_label
                            : getRaceReportKmLabel(event)}
                        </div>

                        <div>
                          <span className="font-semibold text-slate-950">
                            {event.title}
                          </span>
                          <span className="ml-2 text-slate-600">
                            {event.description}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {isTeamTimeTrialReplay
                    ? 'Team standing'
                    : 'Stage standing'}
                </div>

                <div className="mt-4">
                  {visibleStandingRows.length ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500">
                        <span>
                          {replayStarted
                            ? formatDuration(currentRaceSeconds)
                            : '00:00:00'}
                        </span>

                        <span>
                          {replayStarted
                            ? formatKm(currentLeaderKm)
                            : 'Race not started'}
                        </span>
                      </div>

                      <div
                        ref={stageStandingScrollRef}
                        className="max-h-[480px] overflow-auto divide-y divide-slate-100"
                      >
                        {visibleStandingRows.map((row, index) => {
                          const isViewerRider =
                            row.standingEntityType === 'team'
                              ? participantTeams.some(
                                  (team) =>
                                    (team.club_id === viewerTeamId ||
                                      team.team_id === viewerTeamId) &&
                                    (team.club_id === row.rider_id ||
                                      team.team_id === row.rider_id ||
                                      team.team_name_snapshot ===
                                        row.rider_name ||
                                      team.club_name === row.rider_name)
                                )
                              : Boolean(row.rider_id) &&
                                viewerRiderIds.has(row.rider_id)

                          const gcStatusLabel =
                            hasEstablishedClassificationLeaders
                              ? formatReplayGcStatus(
                                  row.gc_rank,
                                  row.gc_gap_seconds
                                )
                              : null

                          const leaderTabs =
                            getReplayStandingLeaderTabs(row)

                          const standingBadgeLabel =
                            isTimeTrialReplay
                              ? row.timeTrialLabel ??
                                (row.timeTrialStartOrder
                                  ? isTeamTimeTrialReplay
                                    ? `T${row.timeTrialStartOrder}`
                                    : `R${row.timeTrialStartOrder}`
                                  : isTeamTimeTrialReplay
                                    ? 'T'
                                    : 'R')
                              : getReplayGroupShortLabel(
                                  row.group_code,
                                  row.group_order,
                                  currentPelotonGroupOrder
                                )

                          const standingBadgeColor =
                            isTimeTrialReplay
                              ? row.timeTrialState === 'finished'
                                ? '#64748b'
                                : row.timeTrialState === 'waiting'
                                  ? '#94a3b8'
                                  : '#f97316'
                              : getReplayGroupStroke(row.group_code)

                          const splitLabel =
                            isTimeTrialReplay &&
                            row.splitElapsedSeconds !== null &&
                            row.splitElapsedSeconds !== undefined
                              ? formatDuration(row.splitElapsedSeconds)
                              : null

                          const finishedGapSeconds =
                            isTimeTrialReplay &&
                            row.timeTrialState === 'finished' &&
                            row.liveElapsedSeconds !== null &&
                            row.liveElapsedSeconds !== undefined &&
                            bestFinishedTimeTrialElapsedSeconds !== null
                              ? Math.max(
                                  0,
                                  Number(row.liveElapsedSeconds) -
                                    bestFinishedTimeTrialElapsedSeconds
                                )
                              : null

                          const standingTimeLabel =
                            isTimeTrialReplay
                              ? row.liveElapsedSeconds === null ||
                                row.liveElapsedSeconds === undefined
                                ? 'Waiting'
                                : row.timeTrialState === 'finished'
                                  ? finishedGapSeconds === null ||
                                    finishedGapSeconds <= 0
                                    ? formatDuration(row.liveElapsedSeconds)
                                    : `+${formatGapValue(finishedGapSeconds)}`
                                  : formatDuration(row.liveElapsedSeconds)
                              : !replayStarted
                                ? '—'
                                : index === 0
                                  ? 'Leader'
                                  : row.gap_seconds === 0
                                    ? 's.t.'
                                    : `+${formatGapValue(row.gap_seconds)}`

                          return (
                            <div
                              key={`${row.standingEntityType ?? 'rider'}-${row.rider_id}-${index}`}
                              className={`grid ${
                                isTimeTrialReplay
                                  ? 'grid-cols-[24px_38px_minmax(0,1fr)_minmax(82px,auto)_minmax(96px,auto)]'
                                  : 'grid-cols-[28px_44px_minmax(0,1.2fr)_minmax(112px,0.8fr)_minmax(112px,0.65fr)]'
                              } items-center gap-3 px-3 py-3 ${
                                isViewerRider
                                  ? VIEWER_TEAM_ROW_HIGHLIGHT_CLASS
                                  : 'bg-white'
                              }`}
                            >
                              <div className="text-sm font-semibold text-slate-500">
                                {isTimeTrialReplay &&
                                (row.liveElapsedSeconds === null ||
                                  row.liveElapsedSeconds === undefined)
                                  ? '—'
                                  : replayStarted
                                    ? index + 1
                                    : '—'}
                              </div>

                              <span
                                className="inline-flex h-6 min-w-[34px] items-center justify-center rounded-full px-2 text-[10px] font-bold text-white"
                                style={{
                                  backgroundColor: standingBadgeColor,
                                }}
                                title={row.group_label}
                              >
                                {standingBadgeLabel}
                              </span>

                              <div className="min-w-0">
                                {row.standingEntityType === 'team' ? (
                                  <>
                                    <div className="break-words text-sm font-semibold leading-snug text-slate-950">
                                      {row.rider_name}
                                    </div>

                                    <div className="mt-0.5 truncate text-xs text-slate-500">
                                      {row.team_name || 'Team time trial squad'}
                                    </div>
                                  </>
                                ) : (
                                  <div className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2">
                                    <SmallCountryFlag
                                      code={row.rider_country_code}
                                    />

                                    <div className="min-w-0">
                                      <div
                                        className="truncate whitespace-nowrap text-sm font-semibold leading-snug text-slate-950"
                                        title={row.rider_name || undefined}
                                      >
                                        {formatStandingRiderName(row.rider_name)}
                                      </div>

                                      <div className="mt-0.5 truncate text-xs text-slate-500">
                                        {row.team_name || '—'}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {isTimeTrialReplay ? (
                                <>
                                  <div className="text-right">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Split
                                    </div>
                                    <div className="whitespace-nowrap text-xs font-semibold text-slate-700">
                                      {splitLabel ?? '—'}
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Finish
                                    </div>
                                    <div className="whitespace-nowrap text-xs font-semibold text-slate-700">
                                      {standingTimeLabel}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <RiderEnergyBars
                                    preStageFreshnessPct={row.preStageFreshnessPct}
                                    liveEnergyPct={row.liveEnergyPct}
                                  />

                                  <div className="min-w-0 text-right">
                                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                                      {leaderTabs.length > 0 ? (
                                        <div className="flex items-center justify-end gap-1">
                                          {leaderTabs.map((tab) => (
                                            <ReplayLeaderTab
                                              key={tab}
                                              type={tab}
                                            />
                                          ))}
                                        </div>
                                      ) : null}

                                      <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
                                        {standingTimeLabel}
                                      </span>
                                    </div>

                                    {replayStarted && gcStatusLabel ? (
                                      <div className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-sky-700">
                                        {gcStatusLabel}
                                      </div>
                                    ) : hasEstablishedClassificationLeaders ? (
                                      <div className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-slate-400">
                                        GC: —
                                      </div>
                                    ) : null}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                      No stage standing available yet.
                    </div>
                  )}
                </div>
              </aside>
          </div>

          {!isTimeTrialReplay ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <ReplayStagePointsPanel
                pointResults={pointResults}
                stagePoints={stage.points ?? []}
                currentKm={currentLeaderKm}
              />
            </section>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReplayStagePointsPanel({
  pointResults,
  stagePoints,
  currentKm,
}: {
  pointResults: RacePointResultRow[]
  stagePoints: RaceStagePoint[]
  currentKm: number
}) {
  const pointOptions = useMemo(() => {
    const uniquePoints = new Map<
      string,
      {
        id: string
        label: string
        reached: boolean
        sortOrder: number
        km: number
      }
    >()

    stagePoints.forEach((point) => {
      const pointType = String(point.point_type ?? '').toUpperCase()
      if (pointType === 'START') return

      const km = asNumber(point.km_from_start) ?? 0
      const categoryLabel =
        pointType === 'KOM' && point.kom_category
          ? ` · Cat ${point.kom_category}`
          : ''

      uniquePoints.set(point.id, {
        id: point.id,
        label:
          `${point.name || getStagePointLongLabel({ ...point, km })}` +
          `${categoryLabel} · ${formatKm(km)}`,
        reached: currentKm >= km,
        sortOrder: Number(point.sort_order ?? 999),
        km,
      })
    })

    pointResults.forEach((row) => {
      if (!row.point_id) return

      const pointType = String(row.point_type ?? '').toUpperCase()
      if (pointType === 'START') return

      const km = asNumber(row.km_from_start) ?? 0

      const categoryLabel =
        pointType === 'KOM' && row.kom_category
          ? ` · Cat ${row.kom_category}`
          : ''

      uniquePoints.set(row.point_id, {
        id: row.point_id,
        label:
          `${row.point_name || humanizeCode(pointType)}` +
          `${categoryLabel} · ${formatKm(km)}`,
        reached: currentKm >= km,
        sortOrder: Number(row.sort_order ?? 999),
        km,
      })
    })

    return Array.from(uniquePoints.values()).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.km - right.km
    )
  }, [currentKm, pointResults, stagePoints])

  const [selectedPointId, setSelectedPointId] = useState<string>('')

  useEffect(() => {
    const selectedPointStillExists = pointOptions.some(
      (point) => point.id === selectedPointId
    )

    if (!selectedPointStillExists) {
      const firstReachedPoint = pointOptions.find((point) => point.reached)
      setSelectedPointId(firstReachedPoint?.id ?? pointOptions[0]?.id ?? '')
    }
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
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    : []

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
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
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                  key={`${row.point_id}-${row.rank}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-2 font-semibold">{row.rank}</td>
                  <td className="px-3 py-2 font-semibold">
                    {row.rider_name_snapshot}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.team_name_snapshot}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {row.points_awarded}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatBonusSeconds(row.bonus_seconds_awarded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type StageProfileEventPoint = RaceStagePoint & {
  km: number
}

function getStageProfileEventPoints(stage: RaceStage): StageProfileEventPoint[] {
  return (stage.points ?? [])
    .map((point) => {
      const km = asNumber(point.km_from_start)
      if (km === null) return null
      return { ...point, km }
    })
    .filter((point): point is StageProfileEventPoint => point !== null)
    .sort((a, b) => {
      const sortA = a.sort_order ?? 0
      const sortB = b.sort_order ?? 0
      if (sortA !== sortB) return sortA - sortB
      return a.km - b.km
    })
}

function getStagePointShortLabel(point: StageProfileEventPoint): string {
  if (point.point_type === 'START') return 'Start'
  if (point.point_type === 'FINISH') return 'Finish'
  if (point.point_type === 'INTERMEDIATE_SPRINT') return 'Sprint'
  if (point.point_type === 'BONUS_SPRINT') return 'Bonus'
  if (point.point_type === 'KOM') return point.kom_category ? `KOM ${point.kom_category}` : 'KOM'
  return humanizeCode(point.point_type)
}

function getStagePointLongLabel(point: StageProfileEventPoint): string {
  if (point.point_type === 'START') return 'Stage start'
  if (point.point_type === 'FINISH') return 'Stage finish'
  if (point.point_type === 'INTERMEDIATE_SPRINT') return 'Intermediate sprint'
  if (point.point_type === 'BONUS_SPRINT') return 'Bonus sprint'
  if (point.point_type === 'KOM') {
    return point.kom_category ? `KOM Category ${point.kom_category}` : 'KOM'
  }
  return humanizeCode(point.point_type)
}

function getStagePointMarkerFill(
  point: StageProfileEventPoint,
  stage: RaceStage
): string {
  if (point.point_type === 'START') return '#0ea5e9'
  if (point.point_type === 'INTERMEDIATE_SPRINT') return '#22c55e'
  if (point.point_type === 'BONUS_SPRINT') return '#84cc16'
  if (point.point_type === 'KOM') return '#ef4444'

  if (point.point_type === 'FINISH') {
    if (stage.is_summit_finish || stage.terrain_type === 'mountain') {
      return '#ef4444'
    }

    return '#2563eb'
  }

  return '#475569'
}

function getStagePointPointsLabel(point: StageProfileEventPoint): string {
  if (point.point_type === 'INTERMEDIATE_SPRINT') return 'Sprint points'
  if (point.point_type === 'BONUS_SPRINT') return 'Bonus sprint bonuses'
  if (point.point_type === 'KOM') return 'KOM points'
  if (point.point_type === 'FINISH') return 'Finish points'
  return 'Points'
}

function getInterpolatedProfileCoordinate(
  coordinates: { x: number; y: number; km: number; elevation_m: number }[],
  targetKm: number
): { x: number; y: number } | null {
  if (coordinates.length === 0) return null

  const sorted = [...coordinates].sort((a, b) => a.km - b.km)

  if (targetKm <= sorted[0].km) return { x: sorted[0].x, y: sorted[0].y }

  const last = sorted[sorted.length - 1]
  if (targetKm >= last.km) return { x: last.x, y: last.y }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const next = sorted[index]

    if (targetKm >= previous.km && targetKm <= next.km) {
      const span = Math.max(next.km - previous.km, 1)
      const ratio = (targetKm - previous.km) / span

      return {
        x: previous.x + (next.x - previous.x) * ratio,
        y: previous.y + (next.y - previous.y) * ratio,
      }
    }
  }

  return null
}


function getCubicBezierValue(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const oneMinusT = 1 - t

  return (
    oneMinusT * oneMinusT * oneMinusT * p0 +
    3 * oneMinusT * oneMinusT * t * p1 +
    3 * oneMinusT * t * t * p2 +
    t * t * t * p3
  )
}

function getSmoothedProfileCoordinate(
  coordinates: { x: number; y: number; km: number; elevation_m: number }[],
  targetKm: number
): { x: number; y: number } | null {
  /*
   * Keep the existing stage-profile curve unchanged.
   *
   * buildStageProfilePath draws a cubic Bézier curve between profile points:
   * C midX previousY, midX nextY, nextX nextY.
   *
   * Road-group dots must use the same cubic curve, not linear interpolation
   * between profile points. Otherwise the dot can float above or below the
   * visible line on climbs/descents even though the profile itself is correct.
   */
  if (coordinates.length === 0) return null

  const sorted = [...coordinates].sort((a, b) => a.km - b.km)

  if (targetKm <= sorted[0].km) return { x: sorted[0].x, y: sorted[0].y }

  const last = sorted[sorted.length - 1]
  if (targetKm >= last.km) return { x: last.x, y: last.y }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const next = sorted[index]

    if (targetKm >= previous.km && targetKm <= next.km) {
      const kmSpan = Math.max(next.km - previous.km, 1)
      const kmRatio = (targetKm - previous.km) / kmSpan
      const targetX = previous.x + (next.x - previous.x) * kmRatio
      const controlX = (previous.x + next.x) / 2

      let low = 0
      let high = 1

      for (let iteration = 0; iteration < 18; iteration += 1) {
        const mid = (low + high) / 2
        const midX = getCubicBezierValue(
          previous.x,
          controlX,
          controlX,
          next.x,
          mid
        )

        if (midX < targetX) {
          low = mid
        } else {
          high = mid
        }
      }

      const t = (low + high) / 2
      const y = getCubicBezierValue(
        previous.y,
        previous.y,
        next.y,
        next.y,
        t
      )

      return {
        x: targetX,
        y,
      }
    }
  }

  return null
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

function formatDuration(seconds?: number | null): string {
  return formatRaceClock(seconds)
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

function formatReplayGcStatus(
  rank?: number | null,
  gapSeconds?: number | null
): string | null {
  if (
    rank === null ||
    rank === undefined ||
    gapSeconds === null ||
    gapSeconds === undefined
  ) {
    return null
  }

  const gapLabel =
    Number(gapSeconds) === 0
      ? 'Leader'
      : `+${formatGapValue(gapSeconds)}`

  return `GC: ${gapLabel} (${rank})`
}

function formatBonusSeconds(seconds?: number | null): string {
  if (!seconds) return '—'
  return `-${seconds}s`
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

      const { data, error } = await supabase.rpc('get_race_results_view_v1', {
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

      const { data, error } = await supabase.rpc('get_race_rewards_overview_v1', {
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

      const { data, error } = await supabase.rpc('get_race_rewards_totals_v1', {
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

      const { data, error } = await supabase.rpc('get_race_stage_report_v1', {
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
  'preview_url',
  'previewUrl',
  'image_url',
  'imageUrl',
  'url',
  'public_url',
  'publicUrl',
  'path',
]

const TEAM_LOGO_STORAGE_BUCKETS = [
  'team-logos',
  'team_logos',
  'club-logos',
  'club_logos',
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

function getTeamJerseyUrlFromRecord(record: Record<string, unknown>): string | null {
  for (const key of TEAM_JERSEY_FIELD_KEYS) {
    const rawJerseyValue = getLogoStringFromUnknown(record[key])
    const jerseyUrl = normalizeTeamLogoUrl(rawJerseyValue)

    if (jerseyUrl) return jerseyUrl
  }

  return null
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

function sortParticipantRiders(riders: RaceParticipantRider[]): RaceParticipantRider[] {
  return [...riders].sort((a, b) => {
    const numberA = a.start_number ?? Number.MAX_SAFE_INTEGER
    const numberB = b.start_number ?? Number.MAX_SAFE_INTEGER

    if (numberA !== numberB) return numberA - numberB

    return String(a.rider_name_snapshot ?? '').localeCompare(
      String(b.rider_name_snapshot ?? '')
    )
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
      [team.club_id, team.team_id, team.id]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function getUniqueParticipantTeamIds(teams: RaceParticipantTeam[]): string[] {
  return Array.from(new Set(teams.flatMap((team) => getParticipantTeamLookupIds(team))))
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

function mergeParticipantTeamLogoUrls(
  teams: RaceParticipantTeam[],
  logoRows: unknown
): RaceParticipantTeam[] {
  if (!Array.isArray(logoRows) || logoRows.length === 0) return teams

  const recordsById = new Map<string, Record<string, unknown>>()

  logoRows.forEach((logoRow) => {
    const record = getRecord(logoRow)

    getLogoRecordLookupIds(record).forEach((lookupId) => {
      recordsById.set(lookupId, record)
    })
  })

  return teams.map((team) => {
    const logoRecord = getParticipantTeamLookupIds(team)
      .map((lookupId) => recordsById.get(lookupId))
      .find((record): record is Record<string, unknown> => Boolean(record))
    const liveLogoUrl = logoRecord ? getTeamLogoUrlFromRecord(logoRecord) : null
    const liveJerseyUrl = logoRecord ? getTeamJerseyUrlFromRecord(logoRecord) : null

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

  const { data: clubData, error: clubError } = await supabase
    .from('clubs')
    .select('*')
    .in('id', teamIds)

  if (clubError) {
    console.warn('Could not load participant club logos:', clubError.message)
  } else {
    teamsWithLogos = mergeParticipantTeamLogoUrls(teamsWithLogos, clubData)
  }

  const { data: aiKitData, error: aiKitError } = await supabase
    .from('ai_team_kit_previews')
    .select('*')
    .in('club_id', teamIds)
    .eq('is_active', true)

  if (aiKitError) {
    console.warn('Could not load participant team jersey previews:', aiKitError.message)
  } else {
    teamsWithLogos = mergeParticipantTeamLogoUrls(teamsWithLogos, aiKitData)
  }

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

  const { data, error } = await supabase.rpc('get_club_display_names_v1', {
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

async function hydrateRaceReportEventDisplayNames(
  events: RaceStageReportEvent[]
): Promise<RaceStageReportEvent[]> {
  const teamIds = new Set<string>()
  events.forEach((event) => addTeamIdToSet(teamIds, event.team_id))

  if (teamIds.size === 0) return events

  const displayNameByClubId = await loadParticipantTeamDisplayNames(Array.from(teamIds))
  if (displayNameByClubId.size === 0) return events

  return events.map((event) => {
    const displayName = getDisplayNameForTeamId(event.team_id, displayNameByClubId)
    return displayName ? { ...event, team_name_snapshot: displayName } : event
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

  if (missingRiders.length === 0) return teamsWithRiders

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

  return [...teamsWithRiders, ...syntheticTeams].sort((left, right) =>
    getParticipantTeamName(left).localeCompare(getParticipantTeamName(right))
  )
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

function RaceParticipantsGrid({
  teams,
  loading,
  error,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  teams: RaceParticipantTeam[]
  loading: boolean
  error: string | null
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

  const assignedRiderTotal = teams.reduce(
    (total, team) => total + team.riders.length,
    0
  )

  return (
    <div>
      <div className="mb-4 text-sm font-semibold text-slate-700">
        {teams.length} teams · {assignedRiderTotal} assigned riders
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {teams.map((team) => {
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
                              {rider.start_number ? (
                                <span className="mr-2 text-xs font-semibold text-slate-500">
                                  #{rider.start_number}
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
            await supabase.rpc(
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
}) {
  const [activeTab, setActiveTab] = useState<RaceInfoTab>(restoreRaceInformationTab ?? 'participants')
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
          publishedStageIdSet.has(stage.id)
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

      const { data, error } = await supabase.rpc('get_race_results_view_v1', {
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
      if (
        !isExpanded ||
        !race.id ||
        !stageId ||
        !publishedStageIdSet.has(stageId) ||
        activeTab !== 'results'
      ) {
        setStageResultsPayload(null)
        setStagePointResults([])
        return
      }

      setStageResultsLoading(true)
      setStageResultsError(null)

      const [
        { data: resultsData, error: resultsError },
        { data: pointData, error: pointError },
      ] = await Promise.all([
        supabase.rpc('get_race_results_view_v1', {
          p_race_id: race.id,
          p_after_stage_id: stageId,
        }),

        supabase.rpc('get_race_stage_point_results_v1', {
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
              onClick={() => setActiveTab('participants')}
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
              onClick={() => setActiveTab('results')}
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
              onOpenTeamProfile={openTeamProfileFromRaceInfo}
              onOpenRiderProfile={openRiderProfileFromRaceInfo}
            />
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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

              {renderResultsState(
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

              {renderResultsState(
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

  const renderLinkedTeamName = (teamId?: string | null, label?: string | null) => {
    const teamLabel = label?.trim() || '—'

    if (!teamId) {
      return <span className={RESULT_TEAM_NAME_TRUNCATE_CLASS}>{teamLabel}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenTeamProfile(teamId)}
        className={`${RESULT_TEAM_NAME_TRUNCATE_CLASS} text-slate-600 transition hover:text-slate-950`}
        title={teamLabel}
      >
        {teamLabel}
      </button>
    )
  }

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

      <td className="max-w-0 px-3 py-3 text-slate-500">
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
          <col className="w-[9%]" />
          <col className={isPointsView ? 'w-[48%]' : 'w-[45%]'} />
          <col className={isPointsView ? 'w-[27%]' : 'w-[24%]'} />
          <col className={isPointsView ? 'w-[16%]' : 'w-[15%]'} />
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

  const renderLinkedStageResultTeamName = (row: RaceStageResultRow) => {
    const label = row.team_name_snapshot?.trim() || '—'

    if (!row.team_id) {
      return <span className={RESULT_TEAM_NAME_TRUNCATE_CLASS}>{label}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenTeamProfile(row.team_id as string)}
        className={`${RESULT_TEAM_NAME_TRUNCATE_CLASS} text-slate-600 transition hover:text-slate-950`}
        title={label}
      >
        {label}
      </button>
    )
  }

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

      <td className="max-w-0 px-3 py-3 text-slate-500">
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
          <col className="w-[60%]" />
          <col className="w-[20%]" />
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

  const renderLinkedPointTeamName = (row: AggregatedStagePointResultRow) => {
    const label = row.team_name_snapshot?.trim() || '—'

    if (!row.team_id) {
      return <span className={RESULT_TEAM_NAME_TRUNCATE_CLASS}>{label}</span>
    }

    return (
      <button
        type="button"
        onClick={() => onOpenTeamProfile(row.team_id as string)}
        className={`${RESULT_TEAM_NAME_TRUNCATE_CLASS} text-slate-600 transition hover:text-slate-950`}
        title={label}
      >
        {label}
      </button>
    )
  }

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

      <td className="max-w-0 px-3 py-3 text-slate-500">
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
          <col className={showBonus ? 'w-[52%]' : 'w-[60%]'} />
          <col className={showBonus ? 'w-[20%]' : 'w-[20%]'} />
          <col className={showBonus ? 'w-[10%]' : 'w-[12%]'} />
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
}: {
  points: BackendStageProfilePoint[]
  markers: StageRouteMarker[]
  distanceKm: number
  terrainType?: string | null
  mountainClimbs?: StageProfileDetailItem[]
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

function RaceStageProfilePanel({
  selectedStageId,
  classificationResultsStageId,
  selectedStage,
  race,
  currentGameDate,
  currentClubId,
  viewerClubFamilyIds,
  participantTeams,
  canViewRaceReplay,
  replayAccessLoading,
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
  canViewRaceReplay?: boolean | null
  replayAccessLoading?: boolean
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

      const { data, error } = await supabase.rpc('get_race_stage_profile_detail_v1', {
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
          canViewRaceReplay={canViewRaceReplay}
          replayAccessLoading={replayAccessLoading}
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
}: RaceDetailPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeRaceId = useRaceIdFromRoute()
  const raceId = raceIdOverride ?? routeRaceId
  const resolvedViewerClubId = currentClubId ?? DEFAULT_CURRENT_CLUB_ID
  const replayStageIdFromUrl = searchParams.get('replayStageId')

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

  function hasReplayStageIdParam(value?: string | null): boolean {
    if (!value) return false

    try {
      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      return new URL(value, baseUrl).searchParams.has('replayStageId')
    } catch {
      return /(?:[?&])replayStageId=/.test(value)
    }
  }

  function stripReplayStageIdFromPath(value: string): string {
    try {
      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(value, baseUrl)
      url.searchParams.delete('replayStageId')
      const search = url.searchParams.toString()

      return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
    } catch {
      const [pathWithSearch, hashPart = ''] = value.split('#')
      const [pathname, searchPart = ''] = pathWithSearch.split('?')
      const params = new URLSearchParams(searchPart)
      params.delete('replayStageId')
      const search = params.toString()

      return `${pathname}${search ? `?${search}` : ''}${hashPart ? `#${hashPart}` : ''}`
    }
  }

  function getCurrentRaceDetailPathWithoutReplay(): string {
    return stripReplayStageIdFromPath(
      `${location.pathname}${location.search}${location.hash}`
    )
  }

  function isCurrentRaceDetailReturnPath(value?: string | null): boolean {
    if (!value) return false

    return stripReplayStageIdFromPath(value) === getCurrentRaceDetailPathWithoutReplay()
  }

  function isValidRaceDetailSourceReturnState(
    state?: RaceDetailReturnState | null
  ): state is RaceDetailReturnState {
    if (!state?.returnTo) return false
    if (state.from === 'race_detail') return false
    if (hasReplayStageIdParam(state.returnTo)) return false
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
  const [canViewRaceReplay, setCanViewRaceReplay] = useState<boolean | null>(null)
  const [replayAccessLoading, setReplayAccessLoading] = useState(false)
  const [applicationActionLoading, setApplicationActionLoading] = useState<
    'apply' | 'cancel' | null
  >(null)
  const [applicationActionError, setApplicationActionError] = useState<string | null>(null)
  const [applicationActionMessage, setApplicationActionMessage] = useState<string | null>(null)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [replayStage, setReplayStage] = useState<RaceStage | null>(null)
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

  useEffect(() => {
    if (!replayStageIdFromUrl) {
      if (replayStage !== null) {
        setReplayStage(null)
      }

      return
    }

    const nextReplayStage =
      stages.find((stage) => stage.id === replayStageIdFromUrl) ?? null

    if (nextReplayStage && nextReplayStage.id !== replayStage?.id) {
      setReplayStage(nextReplayStage)
    }
  }, [replayStageIdFromUrl, replayStage?.id, stages])

  function handleOpenReplayPage(stage: RaceStage) {
    const preservedReturnState =
      getSafeRaceDetailSourceReturnState() ?? getRaceDetailReturnState() ?? undefined

    saveRaceDetailSourceReturnState(preservedReturnState)
    setReplayStage(stage)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('replayStageId', stage.id)

    setSearchParams(nextParams, {
      replace: false,
      state: preservedReturnState,
    })
  }

  function handleCloseReplayPage() {
    const preservedReturnState =
      getSafeRaceDetailSourceReturnState() ?? getRaceDetailReturnState() ?? undefined
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('replayStageId')

    setReplayStage(null)
    setSearchParams(nextParams, {
      replace: true,
      state: preservedReturnState,
    })
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
        supabase.rpc('get_race_release_detail_v1', {
          p_race_id: raceId,
        }),
        supabase.rpc('get_current_game_date_date'),
        supabase.rpc('get_current_game_date_parts'),
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
            weather_snapshot
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

        const primaryClubRes = await supabase.rpc('get_my_primary_club_id')

        if (!primaryClubRes.error && primaryClubRes.data) {
          resolvedClubId = primaryClubRes.data as string
        } else {
          const fallbackClubRes = await supabase.rpc('get_my_club_id')
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
    if (!raceId || !isUuid(raceId)) {
      setCanViewRaceReplay(null)
      setReplayAccessLoading(false)
      return
    }

    let cancelled = false

    async function loadReplayAccess() {
      setReplayAccessLoading(true)

      const { data, error } = await supabase.rpc(
        'can_view_race_replay_frames_v1',
        {
          p_race_id: raceId,
        }
      )

      if (cancelled) return

      if (error) {
        console.warn(
          'Could not load race replay access:',
          error.message
        )
        setCanViewRaceReplay(null)
      } else {
        setCanViewRaceReplay(
          normalizeBoolean(
            data as boolean | string | null | undefined
          ) === true
        )
      }

      setReplayAccessLoading(false)
    }

    loadReplayAccess()

    return () => {
      cancelled = true
    }
  }, [raceId, raceDetailReloadKey])

  useEffect(() => {
    if (!selectedStage?.id) {
      setLiveState(null)
      return
    }

    let cancelled = false

    async function loadSelectedStageLiveState() {
      if (!selectedStage?.id) return

      const { data, error } = await supabase.rpc(
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
    return getRaceDetailStatusLabel(
      applicationsStatus,
      normalizedRaceStatus,
      effectiveTeamEntryStatus
    )
  }, [applicationsStatus, normalizedRaceStatus, effectiveTeamEntryStatus])

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
          active
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
    const replayStageLiveState =
      liveState?.stage_id === replayStage.id
        ? liveState
        : null

    return (
      <RaceReplayModal
        open
        race={race}
        stage={replayStage}
        currentClubId={resolvedViewerClubId}
        viewerClubFamilyIds={viewerClubFamilyIds}
        participantTeams={participantTeams}
        canViewRaceReplay={canViewRaceReplay}
        liveState={replayStageLiveState}
        lockReplaySpeed={replayStageLiveState?.speed_locked === true}
        displayMode="page"
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
            canViewRaceReplay={canViewRaceReplay}
            replayAccessLoading={replayAccessLoading}
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
