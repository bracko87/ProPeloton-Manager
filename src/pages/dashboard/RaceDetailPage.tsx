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

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

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
  race_team_entry_id?: string | null
  status: string
  club_name: string | null
  country_code: string | null
  club_tier: string | null
  world_tier: string | null
  assigned_riders_count: number | null
  team_name_snapshot: string | null
  logo_url_snapshot: string | null
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

const VIEWER_TEAM_ROW_HIGHLIGHT_CLASS =
  'bg-yellow-100/80 shadow-[inset_4px_0_0_rgba(234,179,8,0.65)]'

type ViewerTeamComparableRow = {
  team_id?: string | null
  club_id?: string | null
  teamId?: string | null
  team?: { id?: string | null } | null
}

function getViewerTeamId(currentClubId?: string | null): string {
  return currentClubId ?? DEFAULT_CURRENT_CLUB_ID
}

function isViewerTeamRow(
  row: ViewerTeamComparableRow,
  viewerTeamId?: string | null
): boolean {
  const rowTeamId = row.team_id ?? row.club_id ?? row.teamId ?? row.team?.id ?? null
  return Boolean(
    viewerTeamId &&
      (rowTeamId === viewerTeamId || row.team_id === viewerTeamId || row.club_id === viewerTeamId)
  )
}

function viewerTeamRowClass(
  row: ViewerTeamComparableRow,
  viewerTeamId?: string | null
): string {
  return isViewerTeamRow(row, viewerTeamId)
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

function TeamLogo({ team }: { team: RaceParticipantTeam }) {
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
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 text-sm font-bold text-slate-700">
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
  if (
    getReplayBaseGroupCode(code) ===
    'main_peloton'
  ) {
    return 'P'
  }

  if (
    groupOrder !== null &&
    groupOrder !== undefined &&
    pelotonGroupOrder !== null &&
    pelotonGroupOrder !== undefined
  ) {
    /*
     * Number every non-Peloton physical road group once.
     *
     * Example:
     *
     * physical order 1 → G1
     * physical order 2 → G2
     * physical order 3 → P
     * physical order 4 → G3
     * physical order 5 → G4
     */
    const roadGroupNumber =
      groupOrder < pelotonGroupOrder
        ? groupOrder
        : groupOrder - 1

    return `G${Math.max(
      1,
      roadGroupNumber
    )}`
  }

  /*
   * Fallback for old replay data.
   */
  switch (getReplayBaseGroupCode(code)) {
    case 'front_group':
      return 'G1'

    case 'chase_group':
      return 'G2'

    case 'dropped_group':
      return 'G3'

    case 'outside_group':
      return 'G4'

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

    const currentFrame = [...activeFrames]
      .reverse()
      .find((frame) => {
        const frameSeconds = getReplayTimeTrialRaceClockSeconds(frame)
        return (
          frameSeconds !== null &&
          Number.isFinite(frameSeconds) &&
          frameSeconds <= raceSeconds
        )
      })

    selectedFrames.push(currentFrame ?? firstActiveFrame)
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

  const activeFrames = profileFrames.filter((frame) => {
    const state = getReplayEntityState(frame)
    return state !== 'waiting' && state !== 'finished'
  })

  const nextWaitingFrame = waitingFrames[0]

  return [...activeFrames, nextWaitingFrame]
    .filter((frame): frame is RaceReplayFrame => Boolean(frame))
    .sort((left, right) => {
      const leftOrder =
        getReplayTimeTrialStartOrder(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder =
        getReplayTimeTrialStartOrder(right) ?? Number.MAX_SAFE_INTEGER

      return leftOrder - rightOrder
    })
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

function getReplayPlaybackDurationMs(
  frames: RaceReplayFrame[]
): number {
  const timeTrialEntityCount = getTimeTrialReplayEntityCount(frames)

  if (timeTrialEntityCount <= 0) {
    return 15 * 60 * 1000
  }

  if (timeTrialEntityCount <= 12) {
    return 60 * 1000
  }

  return Math.min(
    15 * 60 * 1000,
    Math.max(
      60 * 1000,
      timeTrialEntityCount * 5 * 1000
    )
  )
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
  currentClubId?: string | null
): boolean {
  if (!currentClubId) return false

  return participantTeams.some(
    (team) =>
      team.club_id === currentClubId ||
      team.team_id === currentClubId ||
      team.race_team_entry_id === currentClubId
  )
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
  participantTeams,
  currentGameDate,
  canViewRaceReplay,
  replayAccessLoading = false,
  onOpenReplay,
}: {
  race: Race | null
  stage: RaceStage | null
  currentClubId?: string | null
  participantTeams: RaceParticipantTeam[]
  currentGameDate?: string | null
  canViewRaceReplay?: boolean | null
  replayAccessLoading?: boolean
  onOpenReplay: (stage: RaceStage) => void
}) {
  const [hasResults, setHasResults] = useState(false)
  const [loading, setLoading] = useState(false)

  const localParticipationAccess = userTeamParticipatedInRace(
    participantTeams,
    currentClubId
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
  progress,
  visibleGcLeaderGroupCode,
  visibleClLeaderGroupCode,
  visiblePointsLeaderGroupCode,
}: {
  stage: RaceStage
  profile: StageProfileDetailPayload | null
  groups: RaceReportGroupSummary[]
  frames: RaceReplayFrame[]
  progress: number
  visibleGcLeaderGroupCode: string | null
  visibleClLeaderGroupCode: string | null
  visiblePointsLeaderGroupCode: string | null
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

  const pelotonGroupOrder =
    groupFrames.find(
      (frame) =>
        getReplayBaseGroupCode(
          frame.group_code
        ) === 'main_peloton'
    )?.group_order ?? null

  const hasTimeTrialProfileFrames = frames.some((frame) => {
    const entityType = getReplayEntityType(frame)
    return entityType === 'rider' || entityType === 'team'
  })
  const profileReplayFrames = getVisibleTimeTrialProfileFrames(frames)

  const replayGroups: ReplayGroupLine[] =
    profileReplayFrames.length > 0
      ? profileReplayFrames.map((frame, index) => {
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
            kmMarker: Math.max(0, actualKm),
            riderCount: getReplayEntitySize(frame),
            size: getReplayEntitySize(frame),
            entityType,
            teamName: getReplayFrameTeamName(frame),
            entityState: getReplayEntityState(frame),
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

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[330px] w-full">
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
          const groupKm = Math.max(
            0,
            Math.min(profilePayload.maxKm, group.kmMarker)
          )
          const coord = getInterpolatedProfileCoordinate(profilePayload.coordinates, groupKm)
          if (!coord) return null

          const specialLeaderTypes =
            group.specialLeaderTypes ?? []

          const entityType = group.entityType ?? 'group'
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

function RaceReplayModal({
  open,
  race,
  stage,
  currentClubId,
  participantTeams,
  canViewRaceReplay,
  liveState,
  lockReplaySpeed,
  onClose,
}: {
  open: boolean
  race: Race | null
  stage: RaceStage | null
  currentClubId?: string | null
  participantTeams: RaceParticipantTeam[]
  canViewRaceReplay?: boolean | null
  liveState: RaceStageLiveState | null
  lockReplaySpeed: boolean
  onClose: () => void
}) {
  const [speed, setSpeed] = useState<1 | 2 | 4 | 8>(1)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const playbackAnimationFrameRef = useRef<number | null>(null)
  const playbackLastTickRef = useRef<number | null>(null)
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

  const isLiveBroadcast = liveState?.is_live === true
  const areReplaySpeedControlsLocked =
    isLiveBroadcast || lockReplaySpeed

  const viewerTeamId = getViewerTeamId(currentClubId)
  const localParticipationAccess = userTeamParticipatedInRace(
    participantTeams,
    viewerTeamId
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

      setProgress(
        Math.max(
          0,
          Math.min(
            1,
            (Date.now() - startedAt) /
              (endsAt - startedAt)
          )
        )
      )
    }

    updateLiveProgress()

    const interval = window.setInterval(
      updateLiveProgress,
      1000
    )

    return () => window.clearInterval(interval)
  }, [
    open,
    isLiveBroadcast,
    liveState?.live_started_at,
    liveState?.live_ends_at,
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
        setProgress((value) => {
          const safeDurationMs = Math.max(
            1000,
            replayPlaybackDurationMs
          )

          const next =
            value + (elapsedMs / safeDurationMs) * speed

          return next >= 1 ? 1 : next
        })
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
    replayPlaybackDurationMs,
    speed,
  ])

  useEffect(() => {
    if (!open) return

    setPlaying(false)
    setSpeed(1)
    playbackLastTickRef.current = null

    if (!isLiveBroadcast) {
      setProgress(0)
    }
  }, [open, stage?.id, isLiveBroadcast])

  useEffect(() => {
    if (progress >= 1) {
      setPlaying(false)
      playbackLastTickRef.current = null
    }
  }, [progress])

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
        { data: frameData },
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

        supabase.rpc('get_race_stage_replay_frames_v1', {
          p_stage_id: stage.id,
        }),

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
            normalizeRaceResultsPayload(
              previousResultsData
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

      const normalizedResults = normalizeRaceResultsPayload(resultsData)

      setEvents(
        Array.isArray(reportData) ? (reportData as RaceStageReportEvent[]) : []
      )
      setResultsPayload(normalizedResults)
      if (stagePointError) {
        console.error(
          'get_race_stage_point_results_v1 failed:',
          stagePointError
        )
      }

      setPointResults(
        !stagePointError && Array.isArray(stagePointData)
          ? (stagePointData as RacePointResultRow[])
          : []
      )
      setReplayProfile(normalizeStageProfileDetailPayload(profileData))
      setReplayFrames(
        Array.isArray(frameData) ? (frameData as RaceReplayFrame[]) : []
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
  }, [open, race?.id, stage?.id])

  const replayEvents = useMemo(() => {
    return [...events].sort((left, right) => {
      const leftKm =
        asNumber(left.km_marker) ?? Number.MAX_VALUE

      const rightKm =
        asNumber(right.km_marker) ?? Number.MAX_VALUE

      if (leftKm !== rightKm) {
        return leftKm - rightKm
      }

      return left.event_order - right.event_order
    })
  }, [events])

  if (!open || !stage) return null

  const replayWeather = getReplayWeatherSummary(stage, replayProfile)
  const replayStarted = progress > 0
  const replayFinished = progress >= 1

  const maxFrameNumber = replayFrames.reduce(
    (maximum, frame) =>
      Math.max(maximum, Number(frame.frame_number) || 0),
    0
  )

  const timeTrialPrimaryEntityType =
    getTimeTrialReplayPrimaryEntityType(replayFrames)
  const isTimeTrialReplay =
    timeTrialPrimaryEntityType !== null
  const timeTrialClockBounds = isTimeTrialReplay
    ? getReplayTimeTrialClockBounds(
        replayFrames,
        timeTrialPrimaryEntityType
      )
    : null
  const currentTimeTrialRaceSeconds =
    timeTrialClockBounds !== null
      ? timeTrialClockBounds.startSeconds +
        progress *
          (timeTrialClockBounds.endSeconds -
            timeTrialClockBounds.startSeconds)
      : null

  const currentFrameNumber =
    maxFrameNumber > 0
      ? Math.min(
          maxFrameNumber,
          Math.floor(progress * maxFrameNumber)
        )
      : 0

  const currentFrames =
    isTimeTrialReplay &&
    currentTimeTrialRaceSeconds !== null
      ? getReplayTimeTrialFramesAtRaceSeconds(
          replayFrames,
          currentTimeTrialRaceSeconds
        )
      : replayFrames
          .filter(
            (frame) =>
              Number(frame.frame_number) === currentFrameNumber
          )
          .sort(sortReplayFrames)

  const currentGroupFrames = currentFrames.filter(
    (frame) => getReplayEntityType(frame) === 'group'
  )

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

  const currentLeaderKm = currentFrames.reduce(
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
    : currentFrames[0]?.race_seconds ?? 0

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

  const visibleEvents = replayStarted
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

    const framesByRiderId = new Map<string, RaceReplayFrame[]>()

    replayFrames
      .filter(
        (frame) => getReplayEntityType(frame) === 'rider'
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
          .filter(
            (frame) =>
              getReplayEntityType(frame) === 'rider'
          )
          .map((frame) => {
            const riderId =
              frame.entity_id ||
              frame.rider_ids?.[0] ||
              ''

            const previousGc =
              previousGcByRiderId.get(riderId)
            const participantRider =
              participantRiderById.get(riderId)
            const timeTrialState = getReplayEntityState(frame)
            const liveElapsedSeconds =
              getReplayTimeTrialLiveElapsedSeconds(frame)
            const splitSnapshot =
              timeTrialHalfSplitByRiderId.get(riderId)
            const startOrder =
              getReplayTimeTrialStartOrder(frame)

            return {
              rider_id: riderId,
              rider_name:
                classificationNameByRiderId.get(riderId) ||
                previousGc?.displayName?.trim() ||
                participantRider?.rider_name_snapshot?.trim() ||
                getReplayFrameLabel(frame),
              team_name:
                participantRider?.team_name_snapshot?.trim() ||
                getReplayFrameTeamName(frame),
              group_code:
                frame.entity_key ||
                frame.group_code ||
                'time_trial_rider',
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
                participantRider?.country_code_snapshot ?? null,
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
              participantRider?.rider_name_snapshot?.trim() ||
              frame.rider_names?.[index]?.trim() ||
              'Rider'

            return {
              rider_id: riderId,
              rider_name: fullName,
              team_name:
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
                participantRider?.country_code_snapshot ?? null,
              gc_rank: previousGc?.rank ?? null,
              gc_gap_seconds: previousGc?.gapSeconds ?? null,
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
  const provisionalGcEntries =
    rawFrameStandingRows.map((row) => {
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
        provisionalGcByRiderId.get(row.rider_id)
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

      return {
        ...row,
        liveGapSeconds,
        gc_rank: provisionalGc?.rank ?? null,
        gc_gap_seconds:
          provisionalGc?.gapSeconds ?? null,
        /*
         * Jersey tabs appear only on the actual pre-stage jersey
         * owner and only while that rider is outside the Peloton.
         */
        isGcLeader:
          Boolean(
            visibleGcLeaderGroupCode
          ) &&
          row.rider_id ===
            preStageGcLeaderRiderId,

        isPointsLeader:
          Boolean(
            visiblePointsLeaderGroupCode
          ) &&
          row.rider_id ===
            preStagePointsLeaderRiderId,

        isClimberLeader:
          Boolean(
            visibleClLeaderGroupCode
          ) &&
          row.rider_id ===
            preStageClimberLeaderRiderId,
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
          participantRider?.rider_name_snapshot?.trim() ||
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
            participantRider?.team_name_snapshot?.trim() ||
            row.team_name_snapshot?.trim() ||
            '',

          group_code: 'main_peloton',
          group_label: 'Peloton',
          group_order: 1,
          gap_seconds: 0,

          rider_country_code:
            participantRider?.country_code_snapshot ??
            row.rider_country_code ??
            row.nationality_code ??
            row.country_code ??
            null,

          gc_rank: previousGc?.rank ?? null,
          gc_gap_seconds:
            previousGc?.gapSeconds ?? null,
          isGcLeader:
            Boolean(
              visibleGcLeaderGroupCode
            ) &&
            riderId ===
              preStageGcLeaderRiderId,

          isPointsLeader:
            Boolean(
              visiblePointsLeaderGroupCode
            ) &&
            riderId ===
              preStagePointsLeaderRiderId,

          isClimberLeader:
            Boolean(
              visibleClLeaderGroupCode
            ) &&
            riderId ===
              preStageClimberLeaderRiderId,
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
        : frameStandingRows
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
    <div className="fixed inset-0 z-50 bg-slate-950/70 p-4">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Race replay
            </div>

            <div className="mt-1 flex items-center gap-2">
              <RaceTitleFlag
                code={race?.country_code || stage.host_country_code || 'ME'}
              />

              <h2 className="text-xl font-semibold text-slate-950">
                {race?.name ?? 'Race replay'}
              </h2>
            </div>

            <div className="mt-1 text-sm text-slate-500">
              Stage {stage.stage_number} · {stage.name || formatStageRoute(stage)}
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {formatStageRoute(stage)}
            </div>

            {!userParticipated ? (
              <div className="mt-2 text-xs font-semibold text-amber-700">
                Your team is not listed as a participant for this race.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start justify-end gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
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

                    if (progress >= 1) {
                      setProgress(replayInitialProgress)
                    } else if (progress <= 0 && replayInitialProgress > 0) {
                      setProgress(replayInitialProgress)
                    }

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
                        onClick={() => setSpeed(value as 1 | 2 | 4 | 8)}
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
                        setProgress(1)
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
                  {Math.round(progress * 100)}%
                </div>
              </div>
            </div>

            <ReplayStageProfile
              stage={stage}
              profile={replayProfile}
              groups={groups}
              frames={currentFrames}
              progress={progress}
              visibleGcLeaderGroupCode={
                visibleGcLeaderGroupCode
              }
              visibleClLeaderGroupCode={
                visibleClLeaderGroupCode
              }
              visiblePointsLeaderGroupCode={
                visiblePointsLeaderGroupCode
              }
            />
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid min-h-[420px] gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
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
                  Stage standing
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

                      <div className="max-h-[480px] overflow-auto divide-y divide-slate-100">
                        {visibleStandingRows.map((row, index) => {
                          const isViewerRider =
                            Boolean(row.rider_id) &&
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
                                  ? `R${row.timeTrialStartOrder}`
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
                                  ? `${formatDuration(row.liveElapsedSeconds)}${
                                      finishedGapSeconds === null
                                        ? ''
                                        : finishedGapSeconds <= 0
                                          ? ' · Leader'
                                          : finishedTimeTrialCount > 1
                                            ? ` · +${formatGapValue(finishedGapSeconds)}`
                                            : ''
                                    }`
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
                              key={`${row.rider_id}-${index}`}
                              className={`grid ${
                                isTimeTrialReplay
                                  ? 'grid-cols-[24px_38px_minmax(0,1fr)_minmax(82px,auto)_minmax(96px,auto)]'
                                  : 'grid-cols-[24px_38px_minmax(0,1fr)_minmax(190px,auto)]'
                              } items-center gap-2 px-3 py-3 ${
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
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <SmallCountryFlag
                                    code={row.rider_country_code}
                                  />

                                  <span className="break-words text-sm font-semibold text-slate-950">
                                    {row.rider_name}
                                  </span>

                                  {replayStarted && gcStatusLabel ? (
                                    <span className="whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                      {gcStatusLabel}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="ml-6 mt-0.5 truncate text-xs text-slate-500">
                                  {row.team_name || '—'}
                                </div>
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
                                <div className="flex flex-wrap items-center justify-end gap-1.5 text-right">
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
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <ReplayStagePointsPanel
              pointResults={pointResults}
              currentKm={currentLeaderKm}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function ReplayStagePointsPanel({
  pointResults,
  currentKm,
}: {
  pointResults: RacePointResultRow[]
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
  }, [currentKm, pointResults])

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

function getUserParticipantTeam(
  participantTeams: RaceParticipantTeam[],
  currentClubId?: string | null
): RaceParticipantTeam | null {
  if (!currentClubId) return null

  return (
    participantTeams.find(
      (team) => team.club_id === currentClubId || team.team_id === currentClubId
    ) ?? null
  )
}

function getUserRiderIdSet(
  participantTeams: RaceParticipantTeam[],
  currentClubId?: string | null
): Set<string> {
  const userTeam = getUserParticipantTeam(participantTeams, currentClubId)
  return new Set(userTeam?.riders.map((rider) => rider.rider_id).filter(Boolean) ?? [])
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


function getReportBadgeLabel(eventType: string) {
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

type RaceReportGroupSummary = {
  code: string
  label: string
  size: number | null
  gapSeconds: number | null
}

function getReportEventDotClass(eventType: string): string {
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

                return (
                  <div
                    key={event.id}
                    className="grid grid-cols-[72px_28px_minmax(0,1fr)] items-start gap-0 px-3 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <div className="pt-0.5 text-xs font-semibold text-slate-500">
                      {getRaceReportKmLabel(event)}
                    </div>

                    <div className="pt-1">
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${getReportEventDotClass(
                          event.event_type
                        )}`}
                        title={getReportBadgeLabel(event.event_type)}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-950">
                          {event.title}
                        </span>

                        <span className="text-xs font-medium text-slate-400">
                          {getReportBadgeLabel(event.event_type)}
                        </span>
                      </div>

                      <div className="mt-0.5 text-sm leading-5 text-slate-700">
                        {event.description}
                      </div>

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
  team_id?: string | null
  race_team_entry_id?: string | null
  status?: string | null
  club_name?: string | null
  country_code?: string | null
  club_tier?: string | null
  world_tier?: string | number | null
  assigned_riders_count?: number | string | null
  team_name_snapshot?: string | null
  logo_url_snapshot?: string | null
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
  const clubId = row.club_id ?? joinedClubId ?? row.team_id ?? null
  const rawTeamId = row.team_id ?? clubId ?? raceTeamEntryId

  if (!rawTeamId) return null

  const teamId = String(rawTeamId)
  const normalizedClubId = clubId ? String(clubId) : null
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

    if (!liveLogoUrl || liveLogoUrl === team.logo_url_snapshot) return team

    return {
      ...team,
      logo_url_snapshot: liveLogoUrl,
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

function normalizeRaceParticipantRiderRows(rows: unknown): RaceParticipantRider[] {
  if (!Array.isArray(rows)) return []

  return sortParticipantRiders(
    rows
      .map((row) => normalizeRaceParticipantRiderRow(row as RaceParticipantRiderViewRow))
      .filter((rider): rider is RaceParticipantRider => rider !== null)
  )
}

function attachRidersToParticipantTeams(
  teams: RaceParticipantTeam[],
  riderRows: RaceParticipantRider[]
): RaceParticipantTeam[] {
  const ridersByTeamId = new Map<string, RaceParticipantRider[]>()

  for (const rider of riderRows ?? []) {
    if (!rider.team_id) continue

    const teamRiders = ridersByTeamId.get(rider.team_id) ?? []
    teamRiders.push(rider)
    ridersByTeamId.set(rider.team_id, teamRiders)
  }

  return teams.map((team) => {
    const lookupIds = Array.from(
      new Set(
        [
          team.club_id,
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
      }
    }

    const riders = sortParticipantRiders(Array.from(matchedRidersById.values()))

    return {
      ...team,
      riders,
      assigned_riders_count:
        team.assigned_riders_count ?? (riders.length > 0 ? riders.length : null),
    }
  })
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
    (total, team) => total + (asNumber(team.assigned_riders_count) ?? team.riders.length),
    0
  )

  return (
    <div>
      <div className="mb-4 text-sm font-semibold text-slate-700">
        {teams.length} teams · {assignedRiderTotal} assigned riders
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {teams.map((team) => {
          const teamName = getParticipantTeamName(team)
          const countryCode = team.country_code ?? team.country_code_snapshot
          const competitionLabel = getParticipantCompetitionLabel(team)
          const assignedRidersCount = asNumber(team.assigned_riders_count) ?? team.riders.length

          return (
            <div
              key={team.race_team_entry_id ?? team.id ?? team.team_id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <button
                type="button"
                onClick={() => onOpenTeamProfile(team.club_id ?? team.team_id)}
                className="flex w-full items-center gap-3 rounded-2xl p-1 text-left transition hover:bg-slate-50"
              >
                <TeamLogo team={team} />

                <div className="min-w-0">
                  <div className="block truncate text-sm font-semibold text-slate-950">
                    {teamName}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <SmallCountryFlag code={countryCode} />
                    {countryCode ? <span>{countryCode}</span> : null}
                    <span className="font-semibold text-slate-700">{competitionLabel}</span>
                  </div>
                </div>
              </button>

              <div className="mt-4 grid gap-2">
                {team.riders.length > 0 ? (
                  team.riders.map((rider) => (
                    <button
                      key={rider.rider_id}
                      type="button"
                      onClick={() => onOpenRiderProfile(rider.rider_id)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">
                          {rider.start_number ? (
                            <span className="mr-2 text-xs font-semibold text-slate-500">
                              #{rider.start_number}
                            </span>
                          ) : null}
                          {rider.rider_name_snapshot ?? 'Unnamed rider'}
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <SmallCountryFlag
                            code={rider.country_code_snapshot ?? countryCode}
                          />

                          {rider.age_snapshot ? <span>{rider.age_snapshot} yrs</span> : null}

                          <span>{formatRiderRole(rider.role_snapshot)}</span>

                          <span>{getRiderOverallDisplay(rider)}</span>
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
  teamEntryStatus,
  onOpenTeamProfile,
  onOpenRiderProfile,
}: {
  race: Race
  stages: RaceStage[]
  participantTeams: RaceParticipantTeam[]
  participantsLoading: boolean
  participantsError: string | null
  currentClubId?: string | null
  teamEntryStatus?: string | null
  onOpenTeamProfile: (teamId: string) => void
  onOpenRiderProfile: (riderId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<RaceInfoTab>('participants')
  const [classificationView, setClassificationView] =
    useState<ClassificationView>('general')
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? '')
  const [stageResultView, setStageResultView] =
    useState<StageResultView>('stage_general')
  const [isExpanded, setIsExpanded] = useState(false)

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
  const viewerTeamId = getViewerTeamId(currentClubId)
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
        setClassificationPayload(normalizeRaceResultsPayload(data))
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
        setStageResultsPayload(
          normalizeRaceResultsPayload(resultsData)
        )

        setStagePointResults(
          !pointError && Array.isArray(pointData)
            ? (pointData as RacePointResultRow[])
            : []
        )

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
  ])

  const classificationRows = useMemo(() => {
    return (classificationPayload?.classifications ?? []).filter(
      (row) => row.classification_type === classificationView
    )
  }, [classificationPayload, classificationView])

  const stagePointAggregateView: StagePointAggregateView =
    stageResultView === 'stage_mountain' ? 'mountain' : 'sprint'

  const stagePointRows = useMemo(() => {
    if (stageResultView === 'stage_general') return []

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
              onOpenTeamProfile={onOpenTeamProfile}
              onOpenRiderProfile={onOpenRiderProfile}
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
                  <option value="general">General classification</option>
                  <option value="points">Points classification</option>
                  <option value="mountain">Mountain classification</option>
                  <option value="young">Young rider classification</option>
                  <option value="team">Team classification</option>
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
                    <option value="stage_sprint">Sprint points</option>
                    <option value="stage_mountain">Mountain points</option>
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
                    currentClubId={viewerTeamId}
                  />
                ) : (
                  <StagePointResultsTable
                    rows={stagePointRows}
                    view={stagePointAggregateView}
                    participantTeams={participantTeams}
                    currentClubId={viewerTeamId}
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
}: {
  rows: RaceClassificationRow[]
  view: ClassificationView
  participantTeams: RaceParticipantTeam[]
  currentClubId?: string | null
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
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamId)
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) => {
      if (row.entity_type === 'team') {
        return isViewerTeamRow(row, viewerTeamId)
      }

      return Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamId)
      )
    },
    15
  )

  const renderRow = (row: RaceClassificationRow) => (
    <tr
      key={`${row.classification_type}-${row.entity_type}-${row.rank}-${row.rider_id ?? row.team_id ?? row.display_name_snapshot}`}
      className={`${viewerTeamRowClass(row, viewerTeamId)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900">
        {row.display_name_snapshot ?? '—'}
      </td>

      <td className="px-3 py-3 text-slate-500">
        {row.entity_type === 'team' ? '—' : row.team_name_snapshot ?? '—'}
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
      <table className="min-w-full text-sm">
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
  currentClubId,
}: {
  rows: RaceStageResultRow[]
  participantTeams: RaceParticipantTeam[]
  currentClubId?: string | null
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

  function getFullStageResultRiderName(
    row: RaceStageResultRow
  ): string {
    const participantRider = row.rider_id
      ? participantRiderById.get(row.rider_id)
      : null

    return (
      participantRider?.rider_name_snapshot?.trim() ||
      row.full_name?.trim() ||
      row.rider_full_name?.trim() ||
      row.display_name?.trim() ||
      row.rider_name?.trim() ||
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
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamId)
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) =>
      Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamId)
      ),
    15
  )

  const renderRow = (row: RaceStageResultRow) => (
    <tr
      key={`${row.rank}-${row.rider_id}`}
      className={`${viewerTeamRowClass(row, viewerTeamId)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900">
        {getFullStageResultRiderName(row)}
      </td>

      <td className="px-3 py-3 text-slate-500">
        {row.team_name_snapshot ?? '—'}
      </td>

      <td className="px-3 py-3 text-right">
        <div className="font-semibold text-slate-900">
          {formatStageResultTime(row, winnerElapsedSeconds)}
        </div>

        {Number(row.bonus_seconds ?? 0) > 0 ? (
          <div className="mt-0.5 text-[11px] font-medium text-emerald-700">
            −{formatGapValue(Number(row.bonus_seconds))} GC bonus
          </div>
        ) : null}

        {Number(row.penalty_seconds ?? 0) > 0 ? (
          <div className="mt-0.5 text-[11px] font-medium text-red-700">
            +{formatGapValue(Number(row.penalty_seconds))} penalty
          </div>
        ) : null}
      </td>
    </tr>
  )

  return (
    <div className="mt-4 overflow-x-auto rounded-xl bg-white">
      <table className="min-w-full text-sm">
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
}: {
  rows: AggregatedStagePointResultRow[]
  view: StagePointAggregateView
  participantTeams: RaceParticipantTeam[]
  currentClubId?: string | null
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
  const userRiderIds = getUserRiderIdSet(participantTeams, viewerTeamId)
  const { topRows, extraUserRows } = buildTopRowsWithUserExtras(
    rows,
    (row) =>
      Boolean(
        (row.rider_id && userRiderIds.has(row.rider_id)) ||
          isViewerTeamRow(row, viewerTeamId)
      ),
    15
  )

  const renderRow = (row: AggregatedStagePointResultRow) => (
    <tr
      key={`${view}-${row.rank}-${row.rider_id ?? row.rider_name_snapshot}`}
      className={`${viewerTeamRowClass(row, viewerTeamId)} border-b border-slate-100`}
    >
      <td className="px-3 py-3 font-semibold text-slate-900">
        {row.rank ?? '—'}
      </td>

      <td className="px-3 py-3 font-medium text-slate-900">
        {row.rider_name_snapshot ?? '—'}
      </td>

      <td className="px-3 py-3 text-slate-500">
        {row.team_name_snapshot ?? '—'}
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
      <table className="min-w-full text-sm">
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

const DEFAULT_FINISH_POINTS_SCHEME: JsonValue[] = [25, 20, 16, 14, 12, 10, 8, 6, 4, 2]
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
        <div className="mt-1">
          <span className="font-medium text-slate-500">Time bonuses: </span>
          {formatPointsSchemeLabel(bonuses)}
        </div>
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
}: {
  isMountainFinish: boolean
  finishKm: number | string | null | undefined
  finishPoint?: RaceStagePoint | null
  finishClimb?: StageProfileDetailItem | null
}) {
  const finishPointBonuses = finishPoint?.time_bonus_seconds ?? DEFAULT_FINISH_TIME_BONUSES

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

          <div className="mt-1">
            <span className="font-medium text-slate-500">GC time bonuses: </span>
            {formatPointsSchemeLabel(finishPointBonuses)}
          </div>
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
        <div>
          <span className="font-medium text-slate-500">Points classification finish: </span>
          {formatPointsSchemeLabel(finishPoint?.points_scheme ?? DEFAULT_FINISH_POINTS_SCHEME)}
        </div>

        <div className="mt-1">
          <span className="font-medium text-slate-500">GC time bonuses: </span>
          {formatPointsSchemeLabel(finishPointBonuses)}
        </div>
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

  const shouldShowFinishCard = Boolean(
    finishPoint || finishMarker || profile.distance_km !== null || selectedStage?.finish_city
  )

  const stagePoints = [
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
  ].sort((a, b) => {
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
      </div>

      <div className="space-y-6">
        <StageReplayAccessCard
          race={race}
          stage={selectedStage}
          currentClubId={currentClubId}
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
  const routeRaceId = useRaceIdFromRoute()
  const raceId = raceIdOverride ?? routeRaceId

  function handleBackToCalendar() {
    if (onBack) {
      onBack()
      return
    }

    const state = location.state as
      | {
          from?: string
          returnTo?: string
          returnScrollY?: number
          returnRaceId?: string
          returnCalendarView?: string
          returnMonthNumber?: number
        }
      | null

    if (state?.from === 'calendar' && state.returnTo) {
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

    navigate('/dashboard/calendar')
  }

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [raceId])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [race, setRace] = useState<Race | null>(null)
  const [entry, setEntry] = useState<RaceRewardsEntryOverview | null>(null)
  const [stages, setStages] = useState<RaceStage[]>([])
  const [selectedStage, setSelectedStage] = useState<RaceStage | null>(null)
  const stageSliderRef = useRef<HTMLDivElement | null>(null)
  const [raceEntryStatus, setRaceEntryStatus] = useState<string | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number>(1)
  const [currentMonthNumber, setCurrentMonthNumber] = useState<number>(1)
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(1)
  const [participantTeams, setParticipantTeams] = useState<RaceParticipantTeam[]>([])
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
  const [
    availableClassificationStageIds,
    setAvailableClassificationStageIds,
  ] = useState<string[]>([])

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
            planned_start_time_label
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
                start_time_region_code: stageStartTime.start_time_region_code ?? stage.start_time_region_code ?? null,
                planned_start_hour_number:
                  stageStartTime.planned_start_hour_number ?? stage.planned_start_hour_number ?? null,
                planned_start_minute:
                  stageStartTime.planned_start_minute ?? stage.planned_start_minute ?? null,
                planned_start_time_label:
                  stageStartTime.planned_start_time_label ?? stage.planned_start_time_label ?? null,
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
      setSelectedStage((previousStage) => {
        if (!previousStage?.id) return loadedStages[0] ?? null

        return (
          loadedStages.find((stage) => stage.id === previousStage.id) ??
          loadedStages[0] ??
          null
        )
      })

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
      const riders = normalizeRaceParticipantRiderRows(ridersData)
      const teamsWithRiders = attachRidersToParticipantTeams(teams, riders)

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

  function handleOpenTeamProfile(teamId: string) {
    if (onOpenTeamProfile) {
      onOpenTeamProfile(teamId)
      return
    }

    console.warn('Missing onOpenTeamProfile callback. Team id:', teamId)
  }

  function handleOpenRiderProfile(riderId: string) {
    if (onOpenRiderProfile) {
      onOpenRiderProfile(riderId)
      return
    }

    console.warn('Missing onOpenRiderProfile callback. Rider id:', riderId)
  }

  function renderStageCard(stage: RaceStage, compact = false) {
    const active = selectedStage?.id === stage.id

    return (
      <button
        key={stage.id}
        type="button"
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
            onClick={handleBackToCalendar}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to calendar
          </button>

          <Link
            to="/dashboard/race-preparation"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to Race Preparation
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          {error ?? 'Race not found.'}
        </div>
      </div>
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
          onClick={handleBackToCalendar}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to calendar
        </button>

        <Link
          to="/dashboard/race-preparation"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to Race Preparation
        </Link>
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
            currentClubId={currentClubId ?? DEFAULT_CURRENT_CLUB_ID}
            participantTeams={participantTeams}
            canViewRaceReplay={canViewRaceReplay}
            replayAccessLoading={replayAccessLoading}
            hideLiveResults={hideRaceInformation}
            onOpenReplay={(stage) => setReplayStage(stage)}
          />

          {!hideRaceInformation ? (
            <RaceResultsHub
              race={race}
              stages={stages}
              participantTeams={participantTeams}
              participantsLoading={participantsLoading}
              participantsError={participantsError}
              currentClubId={currentClubId ?? DEFAULT_CURRENT_CLUB_ID}
              teamEntryStatus={effectiveTeamEntryStatus}
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

      <RaceReplayModal
        open={Boolean(replayStage)}
        race={race}
        stage={replayStage}
        currentClubId={currentClubId}
        participantTeams={participantTeams}
        canViewRaceReplay={canViewRaceReplay}
        liveState={selectedStageLiveState}
        lockReplaySpeed={lockReplaySpeed}
        onClose={() => setReplayStage(null)}
      />
      </div>
    </>
  )
}
