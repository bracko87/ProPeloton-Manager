'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
}

type RacePointResultRow = {
  point_id: string | null
  point_type: string | null
  point_name: string | null
  km_from_start: number | string | null
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

const VIEWER_TEAM_ROW_HIGHLIGHT_CLASS =
  'bg-yellow-50/70 shadow-[inset_3px_0_0_rgba(234,179,8,0.35)]'

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


function getRaceIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const queryRaceId = params.get('raceId') || params.get('race_id') || params.get('id')

  if (queryRaceId) return queryRaceId

  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const raceIndex = pathParts.findIndex((part) => part === 'race' || part === 'races')

  if (raceIndex >= 0 && pathParts[raceIndex + 1]) {
    return pathParts[raceIndex + 1]
  }

  return pathParts[pathParts.length - 1] || null
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

function formatBonusSeconds(seconds?: number | null): string {
  if (!seconds) return '—'
  return `-${seconds}s`
}

function formatResultPoints(points?: number | null): string {
  if (points === null || points === undefined) return '0'
  return String(points)
}

function getCurrentResultsStage(
  stages: RaceStage[],
  currentGameDate?: string | null
): RaceStage | null {
  if (stages.length === 0) return null

  const sortedStages = [...stages].sort((a, b) => {
    const dateCompare = String(a.stage_date ?? '').localeCompare(String(b.stage_date ?? ''))
    if (dateCompare !== 0) return dateCompare
    return Number(a.stage_number ?? 0) - Number(b.stage_number ?? 0)
  })

  if (!currentGameDate) return sortedStages[sortedStages.length - 1] ?? null

  const today = parseDateOnly(currentGameDate)
  if (!today) return sortedStages[sortedStages.length - 1] ?? null

  const completedStages = sortedStages.filter((stage) => {
    const stageDate = parseDateOnly(stage.stage_date)
    return stageDate ? differenceInDays(today, stageDate) >= 0 : false
  })

  return completedStages[completedStages.length - 1] ?? sortedStages[0] ?? null
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
  const fromStageRows = aggregateStagePointRowsFromStageResults(stageRows, view)

  if (fromStageRows.length > 0) return fromStageRows

  return aggregateStagePointRowsFromPointGates(pointGateRows, view)
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
  currentResultsStageId,
}: {
  race: Race
  currentResultsStageId?: string | null
}) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>(() =>
    getLeaderSnapshot(race)
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadLeaderSnapshot() {
      if (!race.id || !currentResultsStageId) {
        setSnapshot(getLeaderSnapshot(race))
        return
      }

      setLoading(true)

      const { data, error } = await supabase.rpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: currentResultsStageId,
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
  }, [race, race.id, currentResultsStageId])

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

function RaceRewardsTotalsPanel({
  raceId,
  viewerTeamId,
}: {
  raceId: string
  viewerTeamId: string | null
}) {
  const [payload, setPayload] = useState<RaceRewardsTotalsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!raceId) {
      setPayload(null)
      return
    }

    let cancelled = false

    async function loadTotals() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('get_race_rewards_totals_v1', {
        p_race_id: raceId,
        p_viewer_team_id: viewerTeamId,
      })

      if (cancelled) return

      if (error) {
        console.error(error)
        setPayload(null)
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      setPayload(normalizeRaceRewardsTotalsPayload(data))
      setLoading(false)
    }

    loadTotals()

    return () => {
      cancelled = true
    }
  }, [raceId, viewerTeamId])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Loading race rewards…
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 shadow-sm">
        Could not load race rewards: {errorMessage}
      </div>
    )
  }

  if (!payload) {
    return null
  }

  const isHighlighted = (row: { team_id?: string | null; is_viewer_team?: boolean }) =>
    Boolean(row.is_viewer_team) || isViewerTeamRow(row, viewerTeamId)

  const rowClass = (row: { team_id?: string | null; is_viewer_team?: boolean }) =>
    isHighlighted(row) ? VIEWER_TEAM_ROW_HIGHLIGHT_CLASS : 'bg-white'

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Race rewards
        </div>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">
          Total prize money and international points
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Totals for the whole race based on generated reward rows.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            Prize money by team
          </div>

          {payload.prize_team_totals.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              No prize money totals generated yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Team</th>
                  <th className="px-4 py-3 text-right">Prize</th>
                </tr>
              </thead>
              <tbody>
                {payload.prize_team_totals.map((row) => (
                  <tr
                    key={row.team_id}
                    className={`border-t border-slate-100 ${rowClass(row)}`}
                  >
                    <td className="px-4 py-3 font-semibold">{row.rank}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {row.team_name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCash(row.total_prize_cash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            International points by team
          </div>

          {payload.ranking_team_totals.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              No team points totals generated yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Team</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {payload.ranking_team_totals.map((row) => (
                  <tr
                    key={row.team_id}
                    className={`border-t border-slate-100 ${rowClass(row)}`}
                  >
                    <td className="px-4 py-3 font-semibold">{row.rank}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {row.team_name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {row.total_team_points.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
          International points by rider
        </div>

        {payload.ranking_rider_totals.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            No rider points totals generated yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Rider</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {payload.ranking_rider_totals.map((row) => (
                <tr
                  key={row.rider_id}
                  className={`border-t border-slate-100 ${rowClass(row)}`}
                >
                  <td className="px-4 py-3 font-semibold">{row.rank}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {row.rider_name}
                  </td>
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


type RaceInfoTab = 'participants' | 'results'
type ClassificationView = 'general' | 'points' | 'mountain' | 'young' | 'team'
type StageResultView = 'stage_general' | 'stage_sprint' | 'stage_mountain'
type StagePointAggregateView = 'sprint' | 'mountain'

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

function getReportBadgeClass(eventType: string) {
  switch (eventType) {
    case 'start':
    case 'neutral_start':
      return 'bg-sky-100 text-sky-700'
    case 'attack':
    case 'breakaway':
      return 'bg-orange-100 text-orange-700'
    case 'sprint':
      return 'bg-emerald-100 text-emerald-700'
    case 'kom':
      return 'bg-rose-100 text-rose-700'
    case 'catch':
      return 'bg-slate-200 text-slate-700'
    case 'crash':
    case 'mechanical':
      return 'bg-amber-100 text-amber-700'
    case 'weather':
      return 'bg-cyan-100 text-cyan-700'
    case 'split':
      return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100'
    case 'finish':
      return 'bg-indigo-100 text-indigo-700'
    case 'summary':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Race report
        </div>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">
          {selectedStageName ?? 'Stage report'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Preview timeline of key events during the selected stage.
        </p>
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
        <div className="relative space-y-3">
          <div className="absolute bottom-4 left-[18px] top-4 w-px bg-slate-200" />

          {events.map((event) => (
            <div key={event.id} className="relative flex gap-4">
              <div className="relative z-10 mt-4 h-3 w-3 rounded-full border-2 border-white bg-slate-400 shadow" />

              <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getReportBadgeClass(
                      event.event_type
                    )}`}
                  >
                    {getReportBadgeLabel(event.event_type)}
                  </span>

                  {event.km_marker !== null && event.km_marker !== undefined ? (
                    <span className="text-xs font-semibold text-slate-700">
                      {Number(event.km_marker).toFixed(
                        Number(event.km_marker) % 1 === 0 ? 0 : 1
                      )}{' '}
                      km
                    </span>
                  ) : null}

                  {event.race_time_label ? (
                    <span className="text-xs text-slate-500">{event.race_time_label}</span>
                  ) : null}
                </div>

                <div className="text-sm font-semibold text-slate-950">{event.title}</div>

                <div className="mt-1 text-sm leading-6 text-slate-600">
                  {event.description}
                </div>

                {event.rider_name_snapshot || event.team_name_snapshot ? (
                  <div className="mt-2 text-xs font-medium text-slate-500">
                    {[event.rider_name_snapshot, event.team_name_snapshot]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
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

function RaceResultsHub({
  race,
  stages,
  participantTeams,
  participantsLoading,
  participantsError,
  currentClubId,
  currentGameDate,
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
  currentGameDate?: string | null
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

  const [classificationPayload, setClassificationPayload] =
    useState<RaceResultsViewPayload | null>(null)
  const [classificationLoading, setClassificationLoading] = useState(false)
  const [classificationError, setClassificationError] = useState<string | null>(null)

  const [stageResultsPayload, setStageResultsPayload] =
    useState<RaceResultsViewPayload | null>(null)
  const [stageResultsLoading, setStageResultsLoading] = useState(false)
  const [stageResultsError, setStageResultsError] = useState<string | null>(null)
  const [inlineApplicationQuote, setInlineApplicationQuote] = useState<RaceApplicationQuote | null>(null)
  const [inlineApplicationQuoteLoading, setInlineApplicationQuoteLoading] = useState(false)
  const [inlineApplicationQuoteError, setInlineApplicationQuoteError] = useState<string | null>(null)

  useEffect(() => {
    if (stages.length === 0) return

    const hasStage = stages.some((stage) => stage.id === stageId)

    if (!stageId || !hasStage) {
      setStageId(stages[0].id)
    }
  }, [stages, stageId])

  const selectedStage = stages.find((stage) => stage.id === stageId) ?? stages[0] ?? null
  const viewerTeamId = getViewerTeamId(currentClubId)
  const effectiveEntryStatus = teamEntryStatus ?? race.existing_application_status ?? null
  const showPendingApplicationInfo =
    activeTab === 'participants' &&
    isPendingRaceApplicationStatus(effectiveEntryStatus) &&
    !participantsLoading &&
    !participantsError &&
    participantTeams.length === 0 &&
    !isRaceStartlistLocked(race.status)

  const currentResultsStage = useMemo(() => {
    return getCurrentResultsStage(stages, currentGameDate)
  }, [stages, currentGameDate])

  const currentResultsStageId = currentResultsStage?.id ?? null

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
      if (!race.id || activeTab !== 'results') return

      if (!currentResultsStageId) {
        setClassificationPayload(null)
        return
      }

      setClassificationLoading(true)
      setClassificationError(null)

      const { data, error } = await supabase.rpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: currentResultsStageId,
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
  }, [race.id, currentResultsStageId, activeTab])

  useEffect(() => {
    let mounted = true

    async function loadStageResults() {
      if (!race.id || !stageId || activeTab !== 'results') return

      setStageResultsLoading(true)
      setStageResultsError(null)

      const { data, error } = await supabase.rpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: stageId,
      })

      if (!mounted) return

      if (error) {
        setStageResultsPayload(null)
        setStageResultsError(error.message)
      } else {
        setStageResultsPayload(normalizeRaceResultsPayload(data))
      }

      setStageResultsLoading(false)
    }

    loadStageResults()

    return () => {
      mounted = false
    }
  }, [race.id, stageId, activeTab])

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
      stageResultsPayload?.point_results ?? [],
      stagePointAggregateView
    )
  }, [stageResultsPayload, stagePointAggregateView, stageResultView])

  const normalizedRaceStatus = race.status?.toLowerCase() ?? null
  const raceAwaitingSimulation = normalizedRaceStatus === 'active'

  function renderResultsState(
    loading: boolean,
    error: string | null,
    label: string
  ) {
    if (loading) {
      return (
        <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
          Loading {label}…
        </div>
      )
    }

    if (error) {
      return (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load {label}: {error}
        </div>
      )
    }

    return null
  }

  return (
    <div
      className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-label={`Race information for ${race.name}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Race information
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            Participants and results
          </div>
        </div>

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
                'race classifications'
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
                    {stages.map((stage) => (
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
                'stage results'
              ) ?? (
                stageResultView === 'stage_general' ? (
                  <StageResultsTable
                    rows={stageResultsPayload?.stage_results ?? []}
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

          <RaceStageReportCard
            selectedStageId={selectedStage?.id ?? null}
            selectedStageName={selectedStage?.name ?? null}
          />

          <RaceRewardsTotalsPanel
            raceId={race.id}
            viewerTeamId={viewerTeamId}
          />
        </div>
      )}
    </div>
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
        {row.rider_name_snapshot ?? '—'}
      </td>

      <td className="px-3 py-3 text-slate-500">
        {row.team_name_snapshot ?? '—'}
      </td>

      <td className="px-3 py-3 text-right font-semibold text-slate-900">
        {formatStageResultTime(row, winnerElapsedSeconds)}
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

  return {
    stage_id: typeof record.stage_id === 'string' ? record.stage_id : '',
    race_id: typeof record.race_id === 'string' ? record.race_id : '',
    stage_number: Number.isFinite(Number(record.stage_number)) ? Number(record.stage_number) : 0,
    stage_title: typeof record.stage_title === 'string' ? record.stage_title : null,
    route_label: typeof record.route_label === 'string' ? record.route_label : null,
    stage_summary: typeof record.stage_summary === 'string' ? record.stage_summary : null,
    weather_summary: typeof record.weather_summary === 'string' ? record.weather_summary : null,
    weather_snapshot: getRecord(record.weather_snapshot) as JsonObject,
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
  selectedStage,
  race,
  currentGameDate,
}: {
  selectedStageId: string | null
  selectedStage: RaceStage | null
  race: Race | null
  currentGameDate: string | null
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
          <h4 className="font-semibold text-slate-950">Stage points</h4>

          <div className="mt-3 space-y-3">
            {(profile.intermediate_sprints ?? []).map((sprint, index) => (
              <StagePointCard
                key={`sprint-${index}`}
                variant="sprint"
                title={`Sprint ${formatProfileDetailValue(sprint['number'])}`}
                subtitle={`km ${formatProfileDetailValue(sprint['km'])}`}
                points={sprint['points_scheme']}
                bonuses={sprint['time_bonus_seconds']}
              />
            ))}

            {visibleMountainClimbs.map((climb, index) => {
              const name = formatProfileDetailValue(climb['name'])
              const category = formatProfileDetailValue(climb['category'])
              const km = formatProfileDetailValue(climb['km'])
              const lengthKm = formatProfileDetailValue(climb['length_km'])
              const avgGradient = formatProfileDetailValue(climb['avg_gradient'])

              return (
                <StagePointCard
                  key={`climb-${index}`}
                  variant="mountain"
                  title={`${name} · ${category}`}
                  subtitle={`km ${km}${lengthKm !== '—' ? ` · ${lengthKm} km` : ''}${
                    avgGradient !== '—' ? ` at ${avgGradient}%` : ''
                  }`}
                  points={climb['points_scheme']}
                  bonuses={climb['time_bonus_seconds']}
                />
              )
            })}

            {shouldShowFinishCard ? (
              <StageFinishPointCard
                isMountainFinish={finishIsMountain}
                finishKm={finishKm}
                finishPoint={finishPoint}
                finishClimb={finishClimb}
              />
            ) : null}

            {(profile.intermediate_sprints ?? []).length === 0 &&
            visibleMountainClimbs.length === 0 &&
            !shouldShowFinishCard ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                No stage points configured for this stage.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <TerrainSplitCard terrainSplit={profileTerrainSplit} />

        {selectedStage ? (
          <StageWeatherCard stage={selectedStage} currentGameDate={currentGameDate} />
        ) : null}

        {race ? (
          <RaceLeadersCard race={race} currentResultsStageId={selectedStageId} />
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
  const raceId = useMemo(() => raceIdOverride ?? getRaceIdFromUrl(), [raceIdOverride])

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
  const [applicationActionLoading, setApplicationActionLoading] = useState<
    'apply' | 'cancel' | null
  >(null)
  const [applicationActionError, setApplicationActionError] = useState<string | null>(null)
  const [applicationActionMessage, setApplicationActionMessage] = useState<string | null>(null)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [applicationQuote, setApplicationQuote] = useState<RaceApplicationQuote | null>(null)
  const [applicationQuoteLoading, setApplicationQuoteLoading] = useState(false)
  const [applicationQuoteError, setApplicationQuoteError] = useState<string | null>(null)
  const [raceDetailReloadKey, setRaceDetailReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadRaceDetail() {
      if (!raceId) {
        setError('Race id is missing.')
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
    if (!raceId) {
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

  const currentResultsStage = useMemo(() => {
    return getCurrentResultsStage(stages, currentGameDate)
  }, [stages, currentGameDate])

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
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to calendar
          </button>
        ) : (
          <a href="/dashboard/calendar" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Back to calendar
          </a>
        )}

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
      <div>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to calendar
          </button>
        ) : (
          <a href="/dashboard/calendar" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Back to calendar
          </a>
        )}
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
            selectedStage={selectedStage}
            race={race}
            currentGameDate={currentGameDate}
          />

          <RaceResultsHub
            race={race}
            stages={stages}
            participantTeams={participantTeams}
            participantsLoading={participantsLoading}
            participantsError={participantsError}
            currentClubId={currentClubId ?? DEFAULT_CURRENT_CLUB_ID}
            currentGameDate={currentGameDate}
            teamEntryStatus={effectiveTeamEntryStatus}
            onOpenTeamProfile={handleOpenTeamProfile}
            onOpenRiderProfile={handleOpenRiderProfile}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
          No stages found for this race.
        </div>
      )}
      </div>
    </>
  )
}
