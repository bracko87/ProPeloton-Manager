'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { supabase } from '../../lib/supabase'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import { calendarTutorialSteps } from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'

type GameDateParts = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
}

type JsonRecord = Record<string, unknown>

type TrainingCampBooking = {
  id: string
  camp_id: string
  start_date: string
  end_date: string
  status: 'planned' | 'active' | 'completed' | 'cancelled'
  participants_count: number | null
  total_cost: number | null
  city_snapshot: string | null
  camp_type_snapshot: string | null
}

type WeatherNormals = {
  country_code: string
  week_of_year: number
  avg_temp_c: number | null
  avg_min_temp_c: number | null
  avg_max_temp_c: number | null
  avg_precip_mm: number | null
  avg_wind_kmh: number | null
  p_clear: number | null
  p_partly_cloudy: number | null
  p_overcast: number | null
  p_foggy: number | null
  p_drizzle: number | null
  p_rain: number | null
  p_heavy_rain: number | null
  p_sleet: number | null
  p_snow: number | null
  p_thunderstorm: number | null
}

type RaceApplicationStatus =
  | 'not_open'
  | 'open'
  | 'closed'
  | 'race_active'
  | 'race_finished'
  | 'cancelled'
  | string

export type RaceCalendarEntry = {
  id: string
  name: string
  category: string | null
  start_date: string
  end_date: string | null
  applications_status: RaceApplicationStatus | null
  target_teams: number | null
  max_teams: number | null
  accepted_teams: number
  existing_application_status: string | null
}

type RaceCalendarItem = RaceCalendarEntry & {
  country_code: string | null
  host_city: string | null
  race_type: string | null
  is_stage_race: boolean | null
  stage_count: number | null
  status: string | null
  description: string | null
  metadata?: JsonRecord | null

  stored_stage_count?: number | null
  actual_stage_count?: number | null
  first_start_city?: string | null
  final_finish_city?: string | null

  min_riders_per_team: number | null
  max_riders_per_team: number | null
}

type RaceEntryRules = {
  race_id: string
  applications_status: RaceApplicationStatus | null
  target_teams: number | null
  max_teams: number | null
  min_riders_per_team: number | null
  max_riders_per_team: number | null
}

type RaceTeamEntry = {
  race_id: string
  club_id: string
  status: string | null
}

type RaceStageCalendarRow = {
  race_id: string
  stage_number: number | null
  stage_date: string
  weather_cancelled?: boolean | null
  weather_cancellation_reason?: string | null
}

type SponsorObjectiveCalendarTarget = {
  objective_id: string
  sponsor_name: string
  objective_title: string
  target_race_id: string
  required_result: string
  display_status_label: string
  objective_result_state: string
  payout_status: string
  target_check_game_date: string | null
}

type DerivedGameDateParts = {
  seasonNumber: number
  monthNumber: number
  dayNumber: number
}

type RaceCalendarEntryWithGameDates = RaceCalendarItem & {
  startGameDate: DerivedGameDateParts
  endGameDate: DerivedGameDateParts
}

type CalendarView = 'season' | 'races'

type SeasonCalendarFilters = {
  races: boolean
  trainingCamps: boolean
  events: boolean
  holidays: boolean
}

type PremiumRaceFilters = {
  countryCode: string
  category: string
  raceType: string
  myRaceStatus: string
  applicationStatus: string
  sponsorTargetsOnly: boolean
}

const DEFAULT_PREMIUM_RACE_FILTERS: PremiumRaceFilters = {
  countryCode: 'all',
  category: 'all',
  raceType: 'all',
  myRaceStatus: 'all',
  applicationStatus: 'all',
  sponsorTargetsOnly: false,
}

type MonthDayItem = {
  dayNumber: number
  canonicalDate: Date
  canonicalDateString: string
  gameParts: DerivedGameDateParts
}

type CalendarGridCell =
  | {
      type: 'empty'
      key: string
    }
  | {
      type: 'day'
      key: string
      day: MonthDayItem
    }

// Calendar month lengths follow the canonical stored game date (Gregorian YYYY-MM-DD).

const GAME_MONTH_KEYS = [
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
] as const

const GAME_MONTH_SHORT_KEYS = [
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
] as const

const WEEKDAY_KEYS_MONDAY_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

type CalendarT = TFunction<'calendarPage'>

const STATUS_BADGE_STYLES: Record<string, string> = {
  planned: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700'
}

const WEATHER_LABELS: Array<{
  key: keyof Pick<
    WeatherNormals,
    | 'p_clear'
    | 'p_partly_cloudy'
    | 'p_overcast'
    | 'p_foggy'
    | 'p_drizzle'
    | 'p_rain'
    | 'p_heavy_rain'
    | 'p_sleet'
    | 'p_snow'
    | 'p_thunderstorm'
  >
  translationKey:
    | 'weather.clear'
    | 'weather.partlyCloudy'
    | 'weather.overcast'
    | 'weather.foggy'
    | 'weather.drizzle'
    | 'weather.rain'
    | 'weather.heavyRain'
    | 'weather.sleet'
    | 'weather.snow'
    | 'weather.thunderstorm'
}> = [
  { key: 'p_clear', translationKey: 'weather.clear' },
  { key: 'p_partly_cloudy', translationKey: 'weather.partlyCloudy' },
  { key: 'p_overcast', translationKey: 'weather.overcast' },
  { key: 'p_foggy', translationKey: 'weather.foggy' },
  { key: 'p_drizzle', translationKey: 'weather.drizzle' },
  { key: 'p_rain', translationKey: 'weather.rain' },
  { key: 'p_heavy_rain', translationKey: 'weather.heavyRain' },
  { key: 'p_sleet', translationKey: 'weather.sleet' },
  { key: 'p_snow', translationKey: 'weather.snow' },
  { key: 'p_thunderstorm', translationKey: 'weather.thunderstorm' },
]

const FILTER_OPTIONS: Array<{
  key: keyof SeasonCalendarFilters
  translationKey: 'filters.races' | 'filters.trainingCamps' | 'filters.events' | 'filters.holidays'
}> = [
  { key: 'races', translationKey: 'filters.races' },
  { key: 'trainingCamps', translationKey: 'filters.trainingCamps' },
  { key: 'events', translationKey: 'filters.events' },
  { key: 'holidays', translationKey: 'filters.holidays' },
]

const BASE_GAME_SEASON_YEAR = 2000

function getCanonicalYearForSeason(seasonNumber: number): number {
  return BASE_GAME_SEASON_YEAR + Math.max(1, seasonNumber) - 1
}

function getDaysInGameMonth(seasonNumber: number, monthNumber: number): number {
  const year = getCanonicalYearForSeason(seasonNumber)
  return new Date(year, monthNumber, 0).getDate()
}

function parseDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function getGameDatePartsFromStoredRaceDate(canonicalDate: string): DerivedGameDateParts {
  const date = parseDateString(canonicalDate)

  return {
    seasonNumber: Math.max(1, date.getFullYear() - BASE_GAME_SEASON_YEAR + 1),
    monthNumber: date.getMonth() + 1,
    dayNumber: date.getDate()
  }
}

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function differenceInDays(a: Date, b: Date): number {
  const left = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const right = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((left - right) / 86400000)
}

function formatCurrency(
  value: number | null | undefined,
  locale?: string
): string {
  return new Intl.NumberFormat(locale || undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function titleCaseFromSnake(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function getRaceWeatherCancellationStatus(race: RaceCalendarItem): string | null {
  const metadata = asRecord(race.metadata)
  const value = metadata.weather_cancellation_status

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isRaceAllStagesWeatherCanceled(race: RaceCalendarItem): boolean {
  const metadata = asRecord(race.metadata)
  const explicitValue = metadata.weather_all_stages_cancelled

  if (typeof explicitValue === 'boolean') return explicitValue
  if (typeof explicitValue === 'string') return explicitValue.toLowerCase() === 'true'

  return getRaceWeatherCancellationStatus(race) === 'all_stages_weather_cancelled'
}

function isRacePartlyWeatherCanceled(race: RaceCalendarItem): boolean {
  return getRaceWeatherCancellationStatus(race) === 'partly_weather_cancelled'
}

function getRaceWeatherCancellationDisplayStatus(race: RaceCalendarItem): RaceApplicationStatus | null {
  if (isRaceAllStagesWeatherCanceled(race)) return 'race_cancelled'
  return null
}

function getWeatherCancellationReasonLabel(
  reason: string | null | undefined,
  t: CalendarT
): string {
  switch (reason) {
    case 'snow':
      return t('weather.snow')
    case 'temperature_below_5c':
      return t('weather.temperatureBelow5')
    default:
      return reason?.trim() ? titleCaseFromSnake(reason) : t('races.raceCanceled')
  }
}

function getCalendarStageForDate(
  race: RaceCalendarItem,
  canonicalDateString: string,
  stagesByRaceId: Record<string, RaceStageCalendarRow[]>
): RaceStageCalendarRow | null {
  const stages = stagesByRaceId[race.id] ?? []
  return stages.find(stage => stage.stage_date === canonicalDateString) ?? null
}

function isCalendarRaceStageWeatherCanceled(
  race: RaceCalendarItem,
  canonicalDateString: string,
  stagesByRaceId: Record<string, RaceStageCalendarRow[]>
): boolean {
  return getCalendarStageForDate(race, canonicalDateString, stagesByRaceId)?.weather_cancelled === true
}

function getMonthStartFromGameDate(currentGameDate: string, _currentDayNumber: number): Date {
  const current = parseDateString(currentGameDate)
  return new Date(current.getFullYear(), current.getMonth(), 1)
}

function getGameMonthName(monthNumber: number, t: CalendarT): string {
  const monthKey = GAME_MONTH_KEYS[monthNumber - 1]
  return monthKey ? t(`dates.months.${monthKey}`) : String(monthNumber)
}

function getGameMonthDateName(monthNumber: number, t: CalendarT): string {
  const monthKey = GAME_MONTH_KEYS[monthNumber - 1]
  return monthKey ? t(`dates.monthsDate.${monthKey}`) : String(monthNumber)
}

function getGameMonthShortName(monthNumber: number, t: CalendarT): string {
  const monthKey = GAME_MONTH_SHORT_KEYS[monthNumber - 1]
  return monthKey ? t(`dates.shortMonths.${monthKey}`) : String(monthNumber)
}

function clampGameMonth(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  const month = Number(value)

  if (month < 1 || month > 12) {
    return null
  }

  return month
}

function formatCompactGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number,
  t: CalendarT
): string {
  return t('dates.compact', {
    season: seasonNumber,
    month: getGameMonthShortName(monthNumber, t),
    day: String(dayNumber).padStart(2, '0'),
  })
}

function formatCalendarDateBadge(
  race: RaceCalendarEntryWithGameDates,
  t: CalendarT
): {
  start: string
  end: string | null
} {
  const start = race.startGameDate
  const end = race.endGameDate

  const startLabel = t('dates.dateBadge', {
    day: String(start.dayNumber).padStart(2, '0'),
    month: getGameMonthShortName(start.monthNumber, t),
  })

  const endLabel = t('dates.dateBadge', {
    day: String(end.dayNumber).padStart(2, '0'),
    month: getGameMonthShortName(end.monthNumber, t),
  })

  const sameDay =
    start.seasonNumber === end.seasonNumber &&
    start.monthNumber === end.monthNumber &&
    start.dayNumber === end.dayNumber

  return {
    start: startLabel,
    end: sameDay ? null : endLabel,
  }
}

function getCalendarDeepLinkParams(search: string): {
  view: CalendarView | null
  monthNumber: number | null
  raceId: string | null
  source: string | null
} {
  const params = new URLSearchParams(search)
  const rawView = params.get('view')
  const rawMonth = Number(params.get('month'))
  const rawRaceId = params.get('raceId') || params.get('focusRaceId')

  return {
    view: rawView === 'season' || rawView === 'races' ? rawView : null,
    monthNumber: Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : null,
    raceId: rawRaceId && /^[0-9a-f-]{36}$/i.test(rawRaceId) ? rawRaceId : null,
    source: params.get('source')
  }
}

function getRaceCalendarSortOrdinal(parts: DerivedGameDateParts): number {
  const year = getCanonicalYearForSeason(parts.seasonNumber)

  return Math.floor(
    Date.UTC(year, parts.monthNumber - 1, parts.dayNumber) / 86400000
  )
}

function getWeekdayName(date: Date, t: CalendarT): string {
  const weekdayKey = WEEKDAY_KEYS_MONDAY_FIRST[getWeekdayIndexMondayFirst(date)]
  return weekdayKey ? t(`dates.weekdays.${weekdayKey}`) : ''
}

function getWeekdayIndexMondayFirst(date: Date): number {
  const jsDay = date.getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

function formatGameMonthLabel(
  seasonNumber: number,
  monthNumber: number,
  t: CalendarT
): string {
  return t('dates.seasonMonth', {
    season: seasonNumber,
    month: getGameMonthName(monthNumber, t),
  })
}

function formatGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number,
  canonicalDate: string,
  t: CalendarT
): string {
  const weekdayName = getWeekdayName(parseDateString(canonicalDate), t)
  return t('dates.gameDate', {
    season: seasonNumber,
    weekday: weekdayName,
    month: getGameMonthDateName(monthNumber, t),
    day: dayNumber,
  })
}

function formatGameDateFromCanonical(
  canonicalDate: string,
  currentMonthStart: Date,
  currentSeasonNumber: number,
  currentMonthNumber: number,
  t: CalendarT
): string {
  const parts = getGameDatePartsFromCanonical(
    canonicalDate,
    currentMonthStart,
    currentSeasonNumber,
    currentMonthNumber
  )

  return formatGameDateDisplay(
    parts.seasonNumber,
    parts.monthNumber,
    parts.dayNumber,
    canonicalDate,
    t
  )
}

function formatRaceGameRange(
  start: RaceCalendarEntryWithGameDates['startGameDate'],
  end: RaceCalendarEntryWithGameDates['endGameDate'],
  startDate: string,
  endDate: string,
  t: CalendarT
): string {
  const sameDay =
    start.seasonNumber === end.seasonNumber &&
    start.monthNumber === end.monthNumber &&
    start.dayNumber === end.dayNumber

  if (sameDay) {
    return formatGameDateDisplay(
      start.seasonNumber,
      start.monthNumber,
      start.dayNumber,
      startDate,
      t
    )
  }

  return `${formatGameDateDisplay(
    start.seasonNumber,
    start.monthNumber,
    start.dayNumber,
    startDate,
    t
  )} → ${formatGameDateDisplay(
    end.seasonNumber,
    end.monthNumber,
    end.dayNumber,
    endDate,
    t
  )}`
}

function formatCalendarCellDate(
  monthNumber: number,
  dayNumber: number,
  t: CalendarT
): string {
  return t('dates.calendarCell', {
    month: getGameMonthDateName(monthNumber, t),
    day: dayNumber,
  })
}

function formatRaceBadgeLabel(
  race: RaceCalendarItem,
  canonicalDateString: string,
  stagesByRaceId: Record<string, RaceStageCalendarRow[]>,
  t: CalendarT
): string {
  const stages = stagesByRaceId[race.id] ?? []
  const matchingStage = stages.find(stage => stage.stage_date === canonicalDateString)

  if (matchingStage?.stage_number != null) {
    if (matchingStage.weather_cancelled) {
      return t('races.stageBadgeCanceled', {
        race: race.name,
        stage: matchingStage.stage_number,
        reason: getWeatherCancellationReasonLabel(
          matchingStage.weather_cancellation_reason ?? null,
          t
        ),
      })
    }

    return t('races.stageBadge', {
      race: race.name,
      stage: matchingStage.stage_number,
    })
  }

  const raceStart = race.start_date ? parseDateString(race.start_date) : null
  const currentDate = parseDateString(canonicalDateString)
  const fallbackStageNumber = raceStart ? differenceInDays(currentDate, raceStart) + 1 : 1

  const stageCount = Number(
    race.actual_stage_count ??
      race.stage_count ??
      race.stored_stage_count ??
      1
  )

  const safeStageNumber = Math.max(
    1,
    Math.min(Math.max(1, stageCount), fallbackStageNumber)
  )

  return t('races.stageBadge', {
    race: race.name,
    stage: safeStageNumber,
  })
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null

  const normalized = code.trim().toUpperCase()

  if (normalized === 'UK') return 'GB'
  if (!/^[A-Z]{2}$/.test(normalized)) return null

  return normalized
}

function getCountryDisplayName(
  code: string | null | undefined,
  locale: string,
  unknownCountryLabel: string
): string {
  const normalized = normalizeCountryCode(code)

  if (!normalized) return unknownCountryLabel

  try {
    const regionNames = new Intl.DisplayNames([locale || 'en'], { type: 'region' })
    return regionNames.of(normalized) ?? normalized
  } catch {
    return normalized
  }
}

function getFlagImageUrl(code: string | null | undefined): string | null {
  const normalized = normalizeCountryCode(code)

  if (!normalized) return null

  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
}

function CountryFlag({
  code,
  unknownCountryLabel,
}: {
  code: string | null | undefined
  unknownCountryLabel: string
}) {
  const flagUrl = getFlagImageUrl(code)
  const normalized = normalizeCountryCode(code)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [normalized])

  if (!flagUrl || !normalized || hasError) {
    return (
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100 align-middle"
        title={normalized ?? unknownCountryLabel}
        aria-label={normalized ?? unknownCountryLabel}
      />
    )
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function getRaceTypeLabel(
  raceType: string | null | undefined,
  t: CalendarT
): string {
  if (raceType === 'one_day') return t('races.oneDay')
  if (raceType === 'stage_race') return t('races.stageRace')
  return titleCaseFromSnake(raceType)
}

function getRaceTypeBadgeClass(raceType: string | null | undefined): string {
  if (raceType === 'one_day') return 'bg-emerald-100 text-emerald-700'
  if (raceType === 'stage_race') return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-700'
}

function getRaceApplicationBadgeClass(status?: string | null): string {
  switch (status?.toLowerCase()) {
    case 'open':
      return 'bg-sky-100 text-sky-700'
    case 'not_open':
      return 'bg-slate-100 text-slate-600'
    case 'applied':
      return 'bg-sky-100 text-sky-700'
    case 'accepted':
      return 'bg-green-100 text-green-700'
    case 'declined':
      return 'bg-red-100 text-red-700'
    case 'withdrawn':
      return 'bg-slate-100 text-slate-600'
    case 'missed_startlist':
      return 'bg-orange-100 text-orange-700'
    case 'race_active':
      return 'bg-green-100 text-green-700'
    case 'race_finished':
      return 'bg-gray-200 text-gray-700'
    case 'race_cancelled':
    case 'cancelled':
      return 'bg-red-100 text-red-700 ring-1 ring-red-200'
    case 'partly_cancelled':
      return 'bg-orange-100 text-orange-700 ring-1 ring-orange-200'
    case 'closed':
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function getRaceApplicationBadgeLabel(
  status: string | null | undefined,
  t: CalendarT
): string {
  switch (status?.toLowerCase()) {
    case 'not_open':
      return t('races.applicationsNotOpen')
    case 'open':
      return t('races.openApplications')
    case 'closed':
      return t('races.applicationsClosed')
    case 'applied':
      return t('races.applied')
    case 'accepted':
      return t('races.accepted')
    case 'declined':
      return t('races.declined')
    case 'withdrawn':
      return t('races.withdrawn')
    case 'missed_startlist':
      return t('races.missedStartlist')
    case 'race_active':
      return t('races.raceActive')
    case 'race_finished':
      return t('races.raceFinished')
    case 'race_cancelled':
    case 'cancelled':
      return t('races.raceCanceled')
    case 'partly_cancelled':
      return t('races.partlyCanceled')
    default:
      return t('races.applicationsClosed')
  }
}

function getEffectiveRaceCalendarStatus(race: RaceCalendarItem): RaceApplicationStatus | null {
  const weatherDisplayStatus = getRaceWeatherCancellationDisplayStatus(race)
  if (weatherDisplayStatus) return weatherDisplayStatus

  const raceStatus = race.status?.toLowerCase() ?? null

  if (raceStatus === 'active') return 'race_active'
  if (raceStatus === 'completed' || raceStatus === 'archived') return 'race_finished'
  if (raceStatus === 'cancelled') return 'race_cancelled'

  return race.existing_application_status ?? race.applications_status
}

function getBaseRaceCalendarStatus(race: RaceCalendarItem): RaceApplicationStatus | null {
  const weatherDisplayStatus = getRaceWeatherCancellationDisplayStatus(race)
  if (weatherDisplayStatus) return weatherDisplayStatus

  const raceStatus = race.status?.toLowerCase() ?? null

  if (raceStatus === 'active') return 'race_active'
  if (raceStatus === 'completed' || raceStatus === 'archived') return 'race_finished'
  if (raceStatus === 'cancelled') return 'race_cancelled'

  return race.applications_status
}

function resolvePremiumStatus(data: unknown): boolean {
  const firstRow = Array.isArray(data) ? data[0] : data
  const row = asRecord(firstRow)

  const possibleValues = [
    row.is_premium,
    row.premium_active,
    row.is_active,
    row.active,
    row.has_premium,
  ]

  return possibleValues.some(value => value === true || value === 'true' || value === 1)
}

function isRaceAcceptedForUser(race: RaceCalendarItem): boolean {
  return race.existing_application_status?.toLowerCase() === 'accepted'
}

function cleanRouteCity(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd') return null
  return trimmed
}

function getRaceRouteSummary(
  race: RaceCalendarItem,
  t: CalendarT
): string {
  const startCity = cleanRouteCity(race.first_start_city)
  const finishCity = cleanRouteCity(race.final_finish_city)

  const stageCount = Number(
    race.actual_stage_count ??
      race.stage_count ??
      0
  )

  if (startCity && finishCity) {
    const route = `${startCity} → ${finishCity}`

    if (race.race_type === 'stage_race' && stageCount > 1) {
      return t('route.stages', { route, count: stageCount })
    }

    if (race.race_type === 'stage_race' && stageCount === 1) {
      return t('route.stageOne', { route, count: stageCount })
    }

    return route
  }

  if (race.description?.trim()) {
    return race.description.trim()
  }

  if (race.host_city?.trim()) {
    return t('route.hostArea', { city: race.host_city.trim() })
  }

  return t('route.detailsSoon')
}

function getGameDatePartsFromCanonical(
  canonicalDate: string,
  _currentMonthStart: Date,
  _currentSeasonNumber: number,
  _currentMonthNumber: number
): DerivedGameDateParts {
  return getGameDatePartsFromStoredRaceDate(canonicalDate)
}

function isDateWithinRange(date: Date, startDate: string, endDate: string): boolean {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const start = parseDateString(startDate).getTime()
  const end = parseDateString(endDate).getTime()
  return current >= start && current <= end
}

function getISOWeek(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  return Math.ceil((utcDate.getTime() - yearStart.getTime() + 86400000) / 604800000)
}

function getDominantWeatherLabel(weather: WeatherNormals | null, t: CalendarT): string {
  if (!weather) return t('weather.noData')

  let bestTranslationKey: (typeof WEATHER_LABELS)[number]['translationKey'] = 'weather.clear'
  let bestScore = -1

  for (const item of WEATHER_LABELS) {
    const score = Number(weather[item.key] ?? 0)
    if (score > bestScore) {
      bestScore = score
      bestTranslationKey = item.translationKey
    }
  }

  return t(bestTranslationKey)
}

function formatWeatherNumber(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—'
  return Number(value).toFixed(digits)
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function chunkValues<T>(values: T[], chunkSize = 150): T[][] {
  if (values.length === 0) return []

  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += safeChunkSize) {
    chunks.push(values.slice(index, index + safeChunkSize))
  }

  return chunks
}

export default function CalendarPage(): JSX.Element {
  const { t, i18n } = useTranslation('calendarPage')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeView, setActiveView] = useState<CalendarView>('season')
  const [activeRaceMonth, setActiveRaceMonth] = useState<number | null>(null)
  const [displayedSeasonMonth, setDisplayedSeasonMonth] = useState<number | null>(null)

  const location = useLocation()
  const navigate = useNavigate()

  const hasAppliedInitialCalendarMonthRef = useRef(false)
  const userSelectedRaceMonthRef = useRef(false)

  const [, setClubId] = useState<string | null>(null)

  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [gameDateParts, setGameDateParts] = useState<GameDateParts | null>(null)

  const [bookings, setBookings] = useState<TrainingCampBooking[]>([])
  const [races, setRaces] = useState<RaceCalendarItem[]>([])
  const [raceStagesByRaceId, setRaceStagesByRaceId] = useState<Record<string, RaceStageCalendarRow[]>>({})
  const [sponsorObjectiveTargets, setSponsorObjectiveTargets] = useState<
    SponsorObjectiveCalendarTarget[]
  >([])

  const [teamWeather, setTeamWeather] = useState<WeatherNormals | null>(null)
  const [raceCalendarNotice, setRaceCalendarNotice] = useState<string | null>(null)

  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const [tutorialMessage, setTutorialMessage] = useState<string | null>(null)

  const [seasonFilters, setSeasonFilters] = useState<SeasonCalendarFilters>({
    races: true,
    trainingCamps: true,
    events: false,
    holidays: false
  })

  const [isPremium, setIsPremium] = useState(false)
  const [premiumStatusLoading, setPremiumStatusLoading] = useState(true)
  const [premiumFiltersOpen, setPremiumFiltersOpen] = useState(false)
  const [countryFilterMenuOpen, setCountryFilterMenuOpen] = useState(false)
  const countryFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const [premiumRaceFilters, setPremiumRaceFilters] = useState<PremiumRaceFilters>(
    DEFAULT_PREMIUM_RACE_FILTERS
  )

  useEffect(() => {
    let alive = true

    async function loadPremiumStatus(): Promise<void> {
      setPremiumStatusLoading(true)

      const { data, error: premiumError } = await supabase.rpc('get_my_premium_status')

      if (!alive) return

      if (premiumError) {
        setIsPremium(false)
      } else {
        setIsPremium(resolvePremiumStatus(data))
      }

      setPremiumStatusLoading(false)
    }

    void loadPremiumStatus()

    function handlePremiumStatusChanged(): void {
      void loadPremiumStatus()
    }

    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)

    return () => {
      alive = false
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCalendar(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        let resolvedClubId: string | null = null
        let resolvedClubCountryCode: string | null = null
        let resolvedTeamWeather: WeatherNormals | null = null
        let resolvedRaceNotice: string | null = null
        let resolvedRaces: RaceCalendarItem[] = []
        let resolvedRaceStagesByRaceId: Record<string, RaceStageCalendarRow[]> = {}
        let resolvedSponsorObjectiveTargets: SponsorObjectiveCalendarTarget[] = []

        const primaryClubRes = await supabase.rpc('get_my_primary_club_id')
        if (!primaryClubRes.error && primaryClubRes.data) {
          resolvedClubId = primaryClubRes.data as string
        } else {
          const fallbackClubRes = await supabase.rpc('get_my_club_id')
          if (fallbackClubRes.error) throw fallbackClubRes.error
          resolvedClubId = (fallbackClubRes.data as string | null) ?? null
        }

        if (!resolvedClubId) {
          throw new Error(t('errors.noClub'))
        }

        const [gameDateRes, gameDatePartsRes, bookingsRes] = await Promise.all([
          supabase.rpc('get_current_game_date_date'),
          supabase.rpc('get_current_game_date_parts'),
          supabase
            .from('training_camp_bookings')
            .select(
              'id, camp_id, start_date, end_date, status, participants_count, total_cost, city_snapshot, camp_type_snapshot'
            )
            .eq('club_id', resolvedClubId)
            .in('status', ['planned', 'active'])
            .order('start_date', { ascending: true })
        ])

        if (gameDateRes.error) throw gameDateRes.error
        if (gameDatePartsRes.error) throw gameDatePartsRes.error
        if (bookingsRes.error) throw bookingsRes.error

        const nextGameDate = String(gameDateRes.data ?? '')
        const nextGameDateParts = Array.isArray(gameDatePartsRes.data)
          ? ((gameDatePartsRes.data[0] as GameDateParts | undefined) ?? null)
          : ((gameDatePartsRes.data as GameDateParts | null) ?? null)

        try {
          const clubMetaRes = await supabase
            .from('clubs')
            .select('country_code')
            .eq('id', resolvedClubId)
            .maybeSingle()

          if (!clubMetaRes.error) {
            resolvedClubCountryCode =
              (clubMetaRes.data as { country_code?: string | null } | null)?.country_code ?? null
          }
        } catch {
          resolvedClubCountryCode = null
        }

        if (resolvedClubCountryCode && nextGameDate) {
          const resolvedWeatherWeek = getISOWeek(parseDateString(nextGameDate))

          try {
            const weatherRes = await supabase
              .from('country_weather_weekly_normals')
              .select(`
                  country_code,
                  week_of_year,
                  avg_temp_c,
                  avg_min_temp_c,
                  avg_max_temp_c,
                  avg_precip_mm,
                  avg_wind_kmh,
                  p_clear,
                  p_partly_cloudy,
                  p_overcast,
                  p_foggy,
                  p_drizzle,
                  p_rain,
                  p_heavy_rain,
                  p_sleet,
                  p_snow,
                  p_thunderstorm
                `)
              .eq('country_code', resolvedClubCountryCode)
              .eq('week_of_year', resolvedWeatherWeek)
              .maybeSingle()

            if (!weatherRes.error) {
              resolvedTeamWeather = (weatherRes.data as WeatherNormals | null) ?? null
            }
          } catch {
            resolvedTeamWeather = null
          }
        }

        try {
          const { data, error } = await supabase.rpc('get_race_calendar_entries_v1')

          if (error) {
            throw error
          }

          const raceRows = Array.isArray(data) ? (data as Partial<RaceCalendarItem>[]) : []
          const raceIds = raceRows
            .map(row => toNullableString(row.id))
            .filter((raceId): raceId is string => Boolean(raceId))

          let entryRulesByRaceId: Record<string, RaceEntryRules> = {}
          let userEntriesByRaceId: Record<string, RaceTeamEntry> = {}
          let raceMetadataByRaceId: Record<string, JsonRecord | null> = {}

          if (raceIds.length > 0) {
            const userEntriesRes = await supabase
              .from('race_team_entries')
              .select('race_id, club_id, status')
              .eq('club_id', resolvedClubId)
              .in('status', [
                'applied',
                'accepted',
                'declined',
                'withdrawn',
                'missed_startlist',
                'cancelled',
              ])

            if (userEntriesRes.error) {
              throw new Error(userEntriesRes.error.message)
            }

            userEntriesByRaceId = ((userEntriesRes.data ?? []) as RaceTeamEntry[]).reduce<
              Record<string, RaceTeamEntry>
            >((acc, entry) => {
              acc[entry.race_id] = entry
              return acc
            }, {})

            const raceIdChunks = chunkValues(raceIds)

            const [entryRuleResponses, raceMetadataResponses] = await Promise.all([
              Promise.all(
                raceIdChunks.map(chunk =>
                  supabase
                    .from('race_entry_rules')
                    .select(
                      'race_id, applications_status, target_teams, max_teams, min_riders_per_team, max_riders_per_team'
                    )
                    .in('race_id', chunk)
                )
              ),
              Promise.all(
                raceIdChunks.map(chunk =>
                  supabase
                    .from('races')
                    .select('id, metadata')
                    .in('id', chunk)
                )
              ),
            ])

            const entryRuleRows = entryRuleResponses.flatMap(response => {
              if (response.error) {
                console.warn('Calendar: race entry rules chunk failed', response.error)
                return []
              }

              return (response.data ?? []) as RaceEntryRules[]
            })

            entryRulesByRaceId = entryRuleRows.reduce<Record<string, RaceEntryRules>>(
              (acc, rule) => {
                acc[rule.race_id] = rule
                return acc
              },
              {}
            )

            const metadataRows = raceMetadataResponses.flatMap(response => {
              if (response.error) {
                console.warn('Calendar: race metadata chunk failed', response.error)
                return []
              }

              return (response.data ?? []) as Array<{
                id?: string | null
                metadata?: JsonRecord | null
              }>
            })

            raceMetadataByRaceId = metadataRows.reduce<Record<string, JsonRecord | null>>(
              (acc, row) => {
                if (row.id) acc[row.id] = row.metadata ?? null
                return acc
              },
              {}
            )
          }

          resolvedRaces = raceRows.map(row => {
            const raceId = toNullableString(row.id) ?? ''
            const entryRules = entryRulesByRaceId[raceId]
            const userEntry = userEntriesByRaceId[raceId]

            return {
              ...row,
              id: raceId,
              name: toNullableString(row.name) ?? '',
              start_date: toNullableString(row.start_date) ?? '',
              end_date: toNullableString(row.end_date),
              category: toNullableString(row.category),
              applications_status: entryRules?.applications_status ?? null,
              status: toNullableString(row.status),
              metadata: raceMetadataByRaceId[raceId] ?? asRecord(row.metadata),
              stored_stage_count: toNullableNumber(row.stored_stage_count),
              actual_stage_count: toNullableNumber(row.actual_stage_count),
              first_start_city: toNullableString(row.first_start_city),
              final_finish_city: toNullableString(row.final_finish_city),
              target_teams: toNullableNumber(entryRules?.target_teams ?? row.target_teams),
              max_teams: toNullableNumber(entryRules?.max_teams ?? row.max_teams),
              min_riders_per_team: toNullableNumber(
                row.min_riders_per_team ?? entryRules?.min_riders_per_team
              ),
              max_riders_per_team: toNullableNumber(
                row.max_riders_per_team ?? entryRules?.max_riders_per_team
              ),
              accepted_teams: toCount(row.accepted_teams),
              existing_application_status:
                toNullableString(row.existing_application_status) ?? userEntry?.status ?? null
            } as RaceCalendarItem
          })

          if (raceIds.length > 0) {
            const stageResponses = await Promise.all(
              chunkValues(raceIds).map(chunk =>
                supabase
                  .from('race_stages')
                  .select(
                    'race_id, stage_number, stage_date, weather_cancelled, weather_cancellation_reason'
                  )
                  .in('race_id', chunk)
                  .order('stage_date', { ascending: true })
                  .order('stage_number', { ascending: true })
              )
            )

            const stageRows = stageResponses.flatMap(response => {
              if (response.error) {
                console.warn('Calendar: race stages chunk failed', response.error)
                return []
              }

              return (response.data ?? []) as RaceStageCalendarRow[]
            })

            resolvedRaceStagesByRaceId = stageRows.reduce<
              Record<string, RaceStageCalendarRow[]>
            >((acc, stage) => {
              if (!acc[stage.race_id]) acc[stage.race_id] = []
              acc[stage.race_id].push({
                race_id: stage.race_id,
                stage_number: stage.stage_number,
                stage_date: stage.stage_date,
                weather_cancelled: stage.weather_cancelled ?? false,
                weather_cancellation_reason: stage.weather_cancellation_reason ?? null,
              })
              return acc
            }, {})

            Object.values(resolvedRaceStagesByRaceId).forEach(stages => {
              stages.sort((left, right) => {
                const dateDiff = left.stage_date.localeCompare(right.stage_date)
                if (dateDiff !== 0) return dateDiff

                return Number(left.stage_number ?? 0) - Number(right.stage_number ?? 0)
              })
            })
          }
        } catch {
          resolvedRaceNotice = t('errors.raceSource')
        }

        try {
          const sponsorObjectivesRes = await supabase.rpc('get_club_sponsor_objectives_ui_v1', {
            p_club_id: resolvedClubId,
          })

          if (!sponsorObjectivesRes.error) {
            const rows = Array.isArray(sponsorObjectivesRes.data)
              ? (sponsorObjectivesRes.data as Array<Record<string, unknown>>)
              : []

            resolvedSponsorObjectiveTargets = rows
              .map((row) => {
                const targetRaceId = toNullableString(row.target_race_id)

                if (!targetRaceId) return null

                return {
                  objective_id: toNullableString(row.objective_id) ?? `${targetRaceId}-sponsor-objective`,
                  sponsor_name: toNullableString(row.sponsor_name) ?? '',
                  objective_title: toNullableString(row.objective_title) ?? '',
                  target_race_id: targetRaceId,
                  required_result: toNullableString(row.required_result) ?? 'objective',
                  display_status_label: toNullableString(row.display_status_label) ?? '',
                  objective_result_state: toNullableString(row.objective_result_state) ?? 'pending',
                  payout_status: toNullableString(row.payout_status) ?? 'unpaid',
                  target_check_game_date: toNullableString(row.target_check_game_date),
                }
              })
              .filter((target): target is SponsorObjectiveCalendarTarget => Boolean(target))
          }
        } catch {
          resolvedSponsorObjectiveTargets = []
        }

        if (cancelled) return

        setClubId(resolvedClubId)
        setCurrentGameDate(nextGameDate || null)
        setGameDateParts(nextGameDateParts)
        setBookings((bookingsRes.data ?? []) as TrainingCampBooking[])
        setTeamWeather(resolvedTeamWeather)
        setRaces(resolvedRaces)
        setRaceStagesByRaceId(resolvedRaceStagesByRaceId)
        setSponsorObjectiveTargets(resolvedSponsorObjectiveTargets)
        setRaceCalendarNotice(resolvedRaceNotice)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t('errors.loadFailed')
          setError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCalendar()

    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    if (!gameDateParts) return

    const currentGameMonth = clampGameMonth(gameDateParts.month_number) ?? 1
    const deepLink = getCalendarDeepLinkParams(location.search)

    const isRealRaceDeepLink = Boolean(deepLink.raceId)
    const deepLinkMonth = isRealRaceDeepLink ? clampGameMonth(deepLink.monthNumber) : null

    if (deepLink.view && isRealRaceDeepLink) {
      setActiveView(deepLink.view)
    }

    if (hasAppliedInitialCalendarMonthRef.current && userSelectedRaceMonthRef.current) {
      return
    }

    const resolvedMonth = deepLinkMonth ?? currentGameMonth

    setActiveRaceMonth(resolvedMonth)
    setDisplayedSeasonMonth(resolvedMonth)
    hasAppliedInitialCalendarMonthRef.current = true
  }, [gameDateParts, location.search])

  useEffect(() => {
    if (loading) return

    const state = location.state as
      | {
          restoreCalendar?: boolean
          restoreScrollY?: number
          restoreRaceId?: string
          restoreCalendarView?: CalendarView
          restoreMonthNumber?: number
        }
      | null

    if (!state?.restoreCalendar) return

    if (state.restoreCalendarView === 'season' || state.restoreCalendarView === 'races') {
      setActiveView(state.restoreCalendarView)
    }

    const restoredMonth = clampGameMonth(state.restoreMonthNumber)

    if (restoredMonth) {
      userSelectedRaceMonthRef.current = true
      hasAppliedInitialCalendarMonthRef.current = true
      setActiveRaceMonth(restoredMonth)
      setDisplayedSeasonMonth(restoredMonth)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (state.restoreRaceId) {
          const row = document.querySelector(`[data-race-id="${state.restoreRaceId}"]`)

          if (row) {
            row.scrollIntoView({
              block: 'center',
              behavior: 'auto',
            })
          } else if (typeof state.restoreScrollY === 'number') {
            window.scrollTo({
              top: state.restoreScrollY,
              behavior: 'auto',
            })
          }
        } else if (typeof state.restoreScrollY === 'number') {
          window.scrollTo({
            top: state.restoreScrollY,
            behavior: 'auto',
          })
        }

        navigate(`${location.pathname}${location.search}`, {
          replace: true,
          state: null,
        })
      })
    })
  }, [loading, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    let alive = true

    async function loadCalendarTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'calendar'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = calendarTutorialSteps[0]

        await saveTutorialProgress('calendar', 'started', firstStep?.key ?? null)

        if (!alive) return

        setActiveView('season')
        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('calendar')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = calendarTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        setTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadCalendarTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  const resolvedActiveRaceMonth = useMemo(() => {
    return activeRaceMonth ?? gameDateParts?.month_number ?? 1
  }, [activeRaceMonth, gameDateParts])

  const resolvedDisplayedSeasonMonth = useMemo(() => {
    return displayedSeasonMonth ?? gameDateParts?.month_number ?? 1
  }, [displayedSeasonMonth, gameDateParts])

  const currentMonthStart = useMemo(() => {
    if (!currentGameDate || !gameDateParts) return null
    return getMonthStartFromGameDate(currentGameDate, gameDateParts.day_number)
  }, [currentGameDate, gameDateParts])

  const displayedMonthStart = useMemo(() => {
    if (!currentMonthStart || !gameDateParts) return null

    const year = getCanonicalYearForSeason(gameDateParts.season_number)
    return new Date(year, resolvedDisplayedSeasonMonth - 1, 1)
  }, [currentMonthStart, gameDateParts, resolvedDisplayedSeasonMonth])

  const monthDays = useMemo(() => {
    if (!displayedMonthStart || !currentMonthStart || !gameDateParts) return []

    const daysInMonth = getDaysInGameMonth(
      gameDateParts.season_number,
      resolvedDisplayedSeasonMonth
    )

    return Array.from({ length: daysInMonth }, (_, index) => {
      const canonicalDate = addDays(displayedMonthStart, index)
      const canonicalDateString = toDateString(canonicalDate)
      const gameParts = getGameDatePartsFromCanonical(
        canonicalDateString,
        currentMonthStart,
        gameDateParts.season_number,
        gameDateParts.month_number
      )

      return {
        dayNumber: index + 1,
        canonicalDate,
        canonicalDateString,
        gameParts
      }
    })
  }, [
    displayedMonthStart,
    currentMonthStart,
    gameDateParts,
    resolvedDisplayedSeasonMonth,
  ])

  const seasonRaceEntries = useMemo(() => {
    if (!gameDateParts) return []

    return races
      .filter(race => race.start_date)
      .map((race) => {
        const raceStartDate = race.start_date
        const raceEndDate = race.end_date ?? race.start_date

        const startGameDate = getGameDatePartsFromStoredRaceDate(raceStartDate)
        const endGameDate = getGameDatePartsFromStoredRaceDate(raceEndDate)

        return {
          ...race,
          startGameDate,
          endGameDate
        }
      })
      .filter((race) => race.startGameDate.seasonNumber === gameDateParts.season_number)
      .sort((a, b) => {
        const dateDiff =
          getRaceCalendarSortOrdinal(a.startGameDate) -
          getRaceCalendarSortOrdinal(b.startGameDate)

        if (dateDiff !== 0) return dateDiff

        return a.name.localeCompare(b.name)
      })
  }, [races, gameDateParts])

  const activeMonthRaces = useMemo(() => {
    return seasonRaceEntries
      .filter((race) => race.startGameDate.monthNumber === resolvedActiveRaceMonth)
      .sort((a, b) => {
        const dateDiff =
          getRaceCalendarSortOrdinal(a.startGameDate) -
          getRaceCalendarSortOrdinal(b.startGameDate)

        if (dateDiff !== 0) return dateDiff

        return a.name.localeCompare(b.name)
      })
  }, [seasonRaceEntries, resolvedActiveRaceMonth])

  const locale = i18n.resolvedLanguage ?? i18n.language
  const unknownCountryLabel = t('route.unknownCountry')

  const premiumCountryOptions = useMemo(() => {
    return Array.from(
      new Set(
        activeMonthRaces
          .map(race => normalizeCountryCode(race.country_code))
          .filter((code): code is string => Boolean(code))
      )
    ).sort((a, b) =>
      getCountryDisplayName(a, locale, unknownCountryLabel).localeCompare(
        getCountryDisplayName(b, locale, unknownCountryLabel),
        locale
      )
    )
  }, [activeMonthRaces, locale, unknownCountryLabel])

  useEffect(() => {
    if (
      premiumRaceFilters.countryCode !== 'all' &&
      !premiumCountryOptions.includes(premiumRaceFilters.countryCode)
    ) {
      setPremiumRaceFilters(current => ({
        ...current,
        countryCode: 'all',
      }))
    }
  }, [premiumCountryOptions, premiumRaceFilters.countryCode])

  useEffect(() => {
    function handleDocumentPointerDown(event: MouseEvent): void {
      if (
        countryFilterMenuRef.current &&
        !countryFilterMenuRef.current.contains(event.target as Node)
      ) {
        setCountryFilterMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown)
    }
  }, [])

  const premiumCategoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        seasonRaceEntries
          .map(race => race.category?.trim())
          .filter((category): category is string => Boolean(category))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [seasonRaceEntries])

  const activePremiumFilterCount = useMemo(() => {
    if (!isPremium) return 0

    return [
      premiumRaceFilters.countryCode !== 'all',
      premiumRaceFilters.category !== 'all',
      premiumRaceFilters.raceType !== 'all',
      premiumRaceFilters.myRaceStatus !== 'all',
      premiumRaceFilters.applicationStatus !== 'all',
      premiumRaceFilters.sponsorTargetsOnly,
    ].filter(Boolean).length
  }, [isPremium, premiumRaceFilters])

  useEffect(() => {
    if (loading) return

    const deepLink = getCalendarDeepLinkParams(location.search)
    if (!deepLink.raceId) return

    const timer = window.setTimeout(() => {
      const row = document.querySelector(`[data-race-id="${deepLink.raceId}"]`)

      if (row) {
        row.scrollIntoView({
          block: 'center',
          behavior: 'smooth'
        })
      }
    }, 120)

    return () => window.clearTimeout(timer)
  }, [loading, activeView, resolvedActiveRaceMonth, activeMonthRaces.length, location.search])

  const acceptedSeasonRaceEntries = useMemo(() => {
    return seasonRaceEntries.filter(race => isRaceAcceptedForUser(race))
  }, [seasonRaceEntries])

  const calendarDeepLink = useMemo(() => {
    return getCalendarDeepLinkParams(location.search)
  }, [location.search])

  const sponsorObjectiveTargetsByRaceId = useMemo(() => {
    return sponsorObjectiveTargets.reduce<Record<string, SponsorObjectiveCalendarTarget[]>>(
      (acc, target) => {
        if (!acc[target.target_race_id]) acc[target.target_race_id] = []
        acc[target.target_race_id].push(target)
        return acc
      },
      {}
    )
  }, [sponsorObjectiveTargets])

  const filteredActiveMonthRaces = useMemo(() => {
    if (!isPremium) return activeMonthRaces

    return activeMonthRaces.filter(race => {
      if (
        premiumRaceFilters.countryCode !== 'all' &&
        normalizeCountryCode(race.country_code) !== premiumRaceFilters.countryCode
      ) {
        return false
      }

      if (
        premiumRaceFilters.category !== 'all' &&
        race.category !== premiumRaceFilters.category
      ) {
        return false
      }

      if (
        premiumRaceFilters.raceType !== 'all' &&
        race.race_type !== premiumRaceFilters.raceType
      ) {
        return false
      }

      const myRaceStatus = race.existing_application_status?.toLowerCase() ?? 'not_entered'
      if (
        premiumRaceFilters.myRaceStatus !== 'all' &&
        myRaceStatus !== premiumRaceFilters.myRaceStatus
      ) {
        return false
      }

      const applicationStatus = getBaseRaceCalendarStatus(race)?.toLowerCase() ?? 'closed'
      if (
        premiumRaceFilters.applicationStatus !== 'all' &&
        applicationStatus !== premiumRaceFilters.applicationStatus
      ) {
        return false
      }

      if (
        premiumRaceFilters.sponsorTargetsOnly &&
        !(sponsorObjectiveTargetsByRaceId[race.id]?.length > 0)
      ) {
        return false
      }

      return true
    })
  }, [
    activeMonthRaces,
    isPremium,
    premiumRaceFilters,
    sponsorObjectiveTargetsByRaceId,
  ])

  const weekdayHeaders = useMemo(
    () =>
      WEEKDAY_KEYS_MONDAY_FIRST.map((weekdayKey) =>
        t(`dates.weekdays.${weekdayKey}`)
      ),
    [t, i18n.language]
  )

  const calendarGridCells = useMemo<CalendarGridCell[]>(() => {
    if (monthDays.length === 0) return []

    const firstWeekdayIndex = getWeekdayIndexMondayFirst(monthDays[0].canonicalDate)
    const leadingEmptyCells: CalendarGridCell[] = Array.from(
      { length: firstWeekdayIndex },
      (_, index) => ({
        type: 'empty',
        key: `leading-empty-${index}`
      })
    )

    const dayCells: CalendarGridCell[] = monthDays.map(day => ({
      type: 'day',
      key: day.canonicalDateString,
      day
    }))

    const totalBeforeTrailing = leadingEmptyCells.length + dayCells.length
    const trailingEmptyCount = (7 - (totalBeforeTrailing % 7)) % 7

    const trailingEmptyCells: CalendarGridCell[] = Array.from(
      { length: trailingEmptyCount },
      (_, index) => ({
        type: 'empty',
        key: `trailing-empty-${index}`
      })
    )

    return [...leadingEmptyCells, ...dayCells, ...trailingEmptyCells]
  }, [monthDays])

  function updatePremiumRaceFilter<K extends keyof PremiumRaceFilters>(
    key: K,
    value: PremiumRaceFilters[K]
  ): void {
    setPremiumRaceFilters(current => ({
      ...current,
      [key]: value,
    }))
  }

  function clearPremiumRaceFilters(): void {
    setPremiumRaceFilters(DEFAULT_PREMIUM_RACE_FILTERS)
  }

  function toggleSeasonFilter(key: keyof SeasonCalendarFilters): void {
    setSeasonFilters(current => ({
      ...current,
      [key]: !current[key]
    }))
  }

  function handlePreviousSeasonMonth(): void {
    setDisplayedSeasonMonth(current => Math.max(1, (current ?? resolvedDisplayedSeasonMonth) - 1))
  }

  function handleNextSeasonMonth(): void {
    setDisplayedSeasonMonth(current => Math.min(12, (current ?? resolvedDisplayedSeasonMonth) + 1))
  }

  function getCalendarReturnState(raceId: string) {
    return {
      from: 'calendar',
      returnTo: `${location.pathname}${location.search}`,
      returnScrollY: window.scrollY,
      returnRaceId: raceId,
      returnCalendarView: activeView,
      returnMonthNumber: activeView === 'races' ? resolvedActiveRaceMonth : resolvedDisplayedSeasonMonth,
    }
  }

  function openRaceDetail(raceId: string): void {
    navigate(`/dashboard/races/${raceId}?raceId=${raceId}`, {
      state: getCalendarReturnState(raceId),
    })
  }

  function getFirstAvailableRaceId(): string | null {
    return activeMonthRaces[0]?.id ?? seasonRaceEntries[0]?.id ?? null
  }

  function moveCalendarTutorialToRaceView() {
    const firstRaceMonth = seasonRaceEntries[0]?.startGameDate?.monthNumber

    setActiveView('races')

    if (typeof firstRaceMonth === 'number') {
      userSelectedRaceMonthRef.current = true
      setActiveRaceMonth(firstRaceMonth)
      setDisplayedSeasonMonth(firstRaceMonth)
    }
  }

  async function handleStartCalendarTutorial() {
    const firstStep = calendarTutorialSteps[0]

    await saveTutorialProgress('calendar', 'started', firstStep?.key ?? null)

    setActiveView('season')
    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipCalendarTutorial() {
    await saveTutorialProgress('calendar', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextCalendarTutorialStep() {
    const currentStep = calendarTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= calendarTutorialSteps.length - 1

    if (currentStep?.key === 'calendar-season') {
      moveCalendarTutorialToRaceView()
    }

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = calendarTutorialSteps[nextIndex]

      await saveTutorialProgress('calendar', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    const raceId = getFirstAvailableRaceId()

    if (!raceId) {
      setTutorialMessage(t('races.noRaceTutorial'))
      await saveTutorialProgress('calendar', 'completed', currentStep?.key ?? null)
      setTutorialMode('closed')
      return
    }

    await saveTutorialProgress('calendar', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'race-detail')

    openRaceDetail(raceId)
  }

  async function handleFinishCalendarTutorialForNow() {
    const currentStep = calendarTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('calendar', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseCalendarTutorial() {
    const currentStep = calendarTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('calendar', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'calendar',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  const currentTutorialStep = calendarTutorialSteps[tutorialStepIndex]
  const currentTutorialText = (() => {
    switch (currentTutorialStep?.key) {
      case 'calendar-season':
        return { title: t('tutorial.seasonTitle'), body: t('tutorial.seasonBody') }
      case 'calendar-races':
        return { title: t('tutorial.racesTitle'), body: t('tutorial.racesBody') }
      case 'calendar-open-race':
        return { title: t('tutorial.openRaceTitle'), body: t('tutorial.openRaceBody') }
      default:
        return { title: t('tutorial.seasonTitle'), body: t('tutorial.seasonBody') }
    }
  })()

  if (loading) {
    return <div className="w-full text-sm text-gray-600">{t('page.loading')}</div>
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-gray-900">{t('page.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('page.subtitle')}
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveView('season')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeView === 'season'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('page.seasonCalendar')}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('races')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeView === 'races'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('page.raceCalendar')}
            </button>
          </div>
        </div>

        {activeView === 'season' ? (
          <div className="w-full xl:max-w-[380px]">
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {t('weather.teamCountry')}
              </div>

              {teamWeather && gameDateParts && currentGameDate ? (
                <div className="mt-2 space-y-1.5">
                  <div className="text-sm font-medium text-gray-900">
                    {t('weather.today')}:{' '}
                    {formatGameDateDisplay(
                      gameDateParts.season_number,
                      gameDateParts.month_number,
                      gameDateParts.day_number,
                      currentGameDate,
                      t
                    )}
                  </div>

                  <div className="text-sm font-semibold text-gray-900">
                    {formatWeatherNumber(teamWeather.avg_temp_c)}°C ·{' '}
                    {getDominantWeatherLabel(teamWeather, t)}
                  </div>

                  <div className="text-xs text-gray-600">
                    {t('weather.min')} {formatWeatherNumber(teamWeather.avg_min_temp_c)}° ·{' '}
                    {t('weather.max')} {formatWeatherNumber(teamWeather.avg_max_temp_c)}° ·{' '}
                    {t('weather.wind')} {formatWeatherNumber(teamWeather.avg_wind_kmh)} km/h ·{' '}
                    {t('weather.rain')} {formatWeatherNumber(teamWeather.avg_precip_mm, 1)} mm
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">
                  {t('weather.noData')}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="w-full rounded-lg border border-gray-100 bg-white p-6 shadow">
        {activeView === 'season' ? (
          <>
            <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {gameDateParts
                    ? formatGameMonthLabel(gameDateParts.season_number, resolvedDisplayedSeasonMonth, t)
                    : t('season.currentMonth')}
                </h4>
                <p className="text-sm text-gray-500">
                  {currentGameDate && gameDateParts
                    ? `${t('weather.today')}: ${formatGameDateDisplay(
                        gameDateParts.season_number,
                        gameDateParts.month_number,
                        gameDateParts.day_number,
                        currentGameDate,
                        t
                      )}`
                    : t('season.gameDateUnavailable')}
                </p>
              </div>

              <div className="flex justify-center xl:flex-1">
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={handlePreviousSeasonMonth}
                    disabled={resolvedDisplayedSeasonMonth === 1}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      resolvedDisplayedSeasonMonth === 1
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    ← {t('season.previous')}
                  </button>

                  <div className="min-w-[140px] px-3 text-center text-sm font-semibold text-gray-800">
                    {getGameMonthName(resolvedDisplayedSeasonMonth, t)}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextSeasonMonth}
                    disabled={resolvedDisplayedSeasonMonth === 12}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      resolvedDisplayedSeasonMonth === 12
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {t('season.next')} →
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {FILTER_OPTIONS.map(option => (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={seasonFilters[option.key]}
                          onChange={() => toggleSeasonFilter(option.key)}
                          className="h-4 w-4 rounded border-gray-300 text-yellow-400 focus:ring-yellow-400"
                        />
                        <span>{t(option.translationKey)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  {bookings.length === 1
                    ? t('season.plannedActiveCamp', { count: bookings.length })
                    : t('season.plannedActiveCamps', { count: bookings.length })}
                </div>
              </div>
            </div>

            <div className="mb-2 grid w-full grid-cols-7 gap-2">
              {weekdayHeaders.map(header => (
                <div key={header} className="px-3 text-sm font-medium text-gray-600">
                  {header}
                </div>
              ))}
            </div>

            <div className="grid w-full grid-cols-7 gap-2 text-sm text-gray-600">
              {calendarGridCells.map(cell => {
                if (cell.type === 'empty') {
                  return <div key={cell.key} className="min-h-[110px]" />
                }

                const day = cell.day

                const dayBookings = seasonFilters.trainingCamps
                  ? bookings.filter(booking =>
                      isDateWithinRange(day.canonicalDate, booking.start_date, booking.end_date)
                    )
                  : []

                const dayRaces = seasonFilters.races
                  ? acceptedSeasonRaceEntries.filter(race =>
                      isDateWithinRange(
                        day.canonicalDate,
                        race.start_date,
                        race.end_date ?? race.start_date
                      )
                    )
                  : []

                const isToday = currentGameDate != null && day.canonicalDateString === currentGameDate

                return (
                  <div
                    key={cell.key}
                    className={`min-h-[110px] rounded-md border p-3 ${
                      isToday ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="text-[11px] font-medium leading-4 text-gray-700">
                      {formatCalendarCellDate(day.gameParts.monthNumber, day.gameParts.dayNumber, t)}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayRaces.map(race => {
                        const stageWeatherCanceled = isCalendarRaceStageWeatherCanceled(
                          race,
                          day.canonicalDateString,
                          raceStagesByRaceId
                        )
                        const raceAllWeatherCanceled = isRaceAllStagesWeatherCanceled(race)

                        return (
                          <div
                            key={`${race.id}-${day.canonicalDateString}-race`}
                            data-race-id={race.id}
                            className={[
                              'rounded-md px-2 py-1 text-[11px] font-medium',
                              stageWeatherCanceled || raceAllWeatherCanceled
                                ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
                                : 'bg-blue-100 text-blue-700',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              onClick={() => openRaceDetail(race.id)}
                              className="text-left hover:underline"
                            >
                              {formatRaceBadgeLabel(race, day.canonicalDateString, raceStagesByRaceId, t)}
                            </button>
                          </div>
                        )
                      })}

                      {dayBookings.map(booking => (
                        <div
                          key={`${booking.id}-${day.canonicalDateString}-camp`}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                            booking.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {booking.city_snapshot ?? t('season.camp')} ·{' '}
                          {titleCaseFromSnake(booking.camp_type_snapshot) || t('season.trainingCamp')}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              <h4 className="font-semibold text-gray-900">{t('season.upcomingCamps')}</h4>

              {bookings.length === 0 ? (
                <div className="mt-3 rounded-md border border-gray-200 p-4 text-sm text-gray-500">
                  {t('season.noCamps')}
                </div>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  {bookings.map(booking => (
                    <li
                      key={booking.id}
                      className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {booking.city_snapshot ?? t('season.trainingCamp')} ·{' '}
                          {titleCaseFromSnake(booking.camp_type_snapshot) || t('season.trainingCamp')}
                        </div>

                        {currentMonthStart && gameDateParts ? (
                          <div className="mt-1 text-xs text-gray-500">
                            {formatGameDateFromCanonical(
                              booking.start_date,
                              currentMonthStart,
                              gameDateParts.season_number,
                              gameDateParts.month_number,
                              t
                            )}{' '}
                            →{' '}
                            {formatGameDateFromCanonical(
                              booking.end_date,
                              currentMonthStart,
                              gameDateParts.season_number,
                              gameDateParts.month_number,
                              t
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            STATUS_BADGE_STYLES[booking.status] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {t(`season.${booking.status}`)}
                        </span>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {t('season.riders')} {booking.participants_count ?? 0}
                        </span>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {formatCurrency(booking.total_cost, locale)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {gameDateParts
                    ? t('races.seasonRaceCalendar', { season: gameDateParts.season_number })
                    : t('page.raceCalendar')}
                </h4>
                <p className="text-sm text-gray-500">
                  {t('races.description')}
                </p>
              </div>

              <div className="text-sm text-gray-500">
                {seasonRaceEntries.length === 1
                  ? t('races.raceCountOne', { count: seasonRaceEntries.length })
                  : t('races.raceCount', { count: seasonRaceEntries.length })}
              </div>
            </div>

            <div className="mb-4 w-full rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
              <div className="grid w-full grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-12">
                {Array.from({ length: 12 }, (_, index) => index + 1).map(monthNumber => {
                  const isActive = monthNumber === resolvedActiveRaceMonth

                  return (
                    <button
                      key={monthNumber}
                      type="button"
                      onClick={() => {
                        userSelectedRaceMonthRef.current = true
                        setActiveRaceMonth(monthNumber)
                        setDisplayedSeasonMonth(monthNumber)
                      }}
                      className={`w-full rounded-md px-3 py-2 text-center text-sm font-medium transition ${
                        isActive
                          ? 'bg-yellow-400 text-black'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {getGameMonthName(monthNumber, t)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{t('filters.title')}</span>
                    <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
                      {t('filters.premium')}
                    </span>
                    {isPremium && activePremiumFilterCount > 0 ? (
                      <span className="text-xs text-gray-500">
                        {t('filters.activeCount', { count: activePremiumFilterCount })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t('filters.description')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isPremium && activePremiumFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearPremiumRaceFilters}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-900"
                    >
                      {t('filters.clear')}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setPremiumFiltersOpen(current => !current)}
                    disabled={premiumStatusLoading}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:border-yellow-400 hover:bg-yellow-50 disabled:cursor-wait disabled:text-gray-400"
                    aria-expanded={premiumFiltersOpen}
                  >
                    {premiumStatusLoading
                      ? t('filters.checkingPremium')
                      : isPremium
                        ? premiumFiltersOpen
                          ? t('filters.hide')
                          : t('filters.open')
                        : t('filters.premiumFilters')}
                  </button>
                </div>
              </div>

              {premiumFiltersOpen ? (
                isPremium ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div
                        ref={countryFilterMenuRef}
                        className="relative text-xs font-medium text-gray-600"
                      >
                        <div>{t('filters.country')}</div>
                        <button
                          type="button"
                          onClick={() => setCountryFilterMenuOpen(current => !current)}
                          className="mt-1 flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left text-sm text-gray-800 transition focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                          aria-haspopup="listbox"
                          aria-expanded={countryFilterMenuOpen}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {premiumRaceFilters.countryCode === 'all' ? (
                              <span className="inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100" />
                            ) : (
                              <CountryFlag
                                code={premiumRaceFilters.countryCode}
                                unknownCountryLabel={unknownCountryLabel}
                              />
                            )}
                            <span className="truncate">
                              {premiumRaceFilters.countryCode === 'all'
                                ? t('filters.allCountries')
                                : getCountryDisplayName(
                                    premiumRaceFilters.countryCode,
                                    locale,
                                    unknownCountryLabel
                                  )}
                            </span>
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-gray-400">⌄</span>
                        </button>

                        {countryFilterMenuOpen ? (
                          <div
                            role="listbox"
                            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                          >
                            <button
                              type="button"
                              role="option"
                              aria-selected={premiumRaceFilters.countryCode === 'all'}
                              onClick={() => {
                                updatePremiumRaceFilter('countryCode', 'all')
                                setCountryFilterMenuOpen(false)
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-yellow-50 ${
                                premiumRaceFilters.countryCode === 'all'
                                  ? 'bg-yellow-50 font-semibold text-gray-900'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span className="inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100" />
                              <span>{t('filters.allCountries')}</span>
                            </button>

                            {premiumCountryOptions.map(code => (
                              <button
                                key={code}
                                type="button"
                                role="option"
                                aria-selected={premiumRaceFilters.countryCode === code}
                                onClick={() => {
                                  updatePremiumRaceFilter('countryCode', code)
                                  setCountryFilterMenuOpen(false)
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-yellow-50 ${
                                  premiumRaceFilters.countryCode === code
                                    ? 'bg-yellow-50 font-semibold text-gray-900'
                                    : 'text-gray-700'
                                }`}
                              >
                                <CountryFlag code={code} unknownCountryLabel={unknownCountryLabel} />
                                <span>{getCountryDisplayName(code, locale, unknownCountryLabel)}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <label className="text-xs font-medium text-gray-600">
                        {t('filters.category')}
                        <select
                          value={premiumRaceFilters.category}
                          onChange={event => updatePremiumRaceFilter('category', event.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        >
                          <option value="all">{t('filters.allCategories')}</option>
                          {premiumCategoryOptions.map(category => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs font-medium text-gray-600">
                        {t('filters.raceFormat')}
                        <select
                          value={premiumRaceFilters.raceType}
                          onChange={event => updatePremiumRaceFilter('raceType', event.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        >
                          <option value="all">{t('filters.allFormats')}</option>
                          <option value="one_day">{t('races.oneDay')}</option>
                          <option value="stage_race">{t('races.stageRace')}</option>
                        </select>
                      </label>

                      <label className="text-xs font-medium text-gray-600">
                        {t('filters.myRaceStatus')}
                        <select
                          value={premiumRaceFilters.myRaceStatus}
                          onChange={event =>
                            updatePremiumRaceFilter('myRaceStatus', event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        >
                          <option value="all">{t('filters.allRaces')}</option>
                          <option value="not_entered">{t('filters.notEntered')}</option>
                          <option value="applied">{t('races.applied')}</option>
                          <option value="accepted">{t('races.accepted')}</option>
                          <option value="declined">{t('races.declined')}</option>
                          <option value="withdrawn">{t('races.withdrawn')}</option>
                          <option value="missed_startlist">{t('races.missedStartlist')}</option>
                        </select>
                      </label>

                      <label className="text-xs font-medium text-gray-600">
                        {t('filters.applicationStatus')}
                        <select
                          value={premiumRaceFilters.applicationStatus}
                          onChange={event =>
                            updatePremiumRaceFilter('applicationStatus', event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                        >
                          <option value="all">{t('filters.allStatuses')}</option>
                          <option value="open">{t('filters.openForApplications')}</option>
                          <option value="not_open">{t('races.applicationsNotOpen')}</option>
                          <option value="closed">{t('races.applicationsClosed')}</option>
                          <option value="race_active">{t('races.raceActive')}</option>
                          <option value="race_finished">{t('races.raceFinished')}</option>
                          <option value="race_cancelled">{t('races.raceCanceled')}</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={premiumRaceFilters.sponsorTargetsOnly}
                          onChange={event =>
                            updatePremiumRaceFilter('sponsorTargetsOnly', event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-yellow-400 focus:ring-yellow-400"
                        />
                        {t('filters.sponsorOnly')}
                      </label>

                      <div className="text-xs text-gray-500">
                        {t('filters.showing', {
                          shown: filteredActiveMonthRaces.length,
                          total: activeMonthRaces.length,
                          month: getGameMonthName(resolvedActiveRaceMonth, t),
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true">🔒</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {t('filters.premiumTitle')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {t('filters.premiumDescription')}
                      </p>
                    </div>

                    <Link
                      to="/dashboard/premium"
                      className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:border-yellow-400 hover:bg-yellow-50"
                    >
                      {t('filters.unlockPremium')}
                    </Link>
                  </div>
                )
              ) : null}
            </div>

            {raceCalendarNotice ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {raceCalendarNotice}
              </div>
            ) : null}

            {filteredActiveMonthRaces.length === 0 ? (
              <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
                {isPremium && activePremiumFilterCount > 0
                  ? t('filters.noMatch', {
                      month: getGameMonthName(resolvedActiveRaceMonth, t),
                    })
                  : t('filters.noScheduled', {
                      month: getGameMonthName(resolvedActiveRaceMonth, t),
                    })}
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredActiveMonthRaces.map((race) => {
                  const dateBadge = formatCalendarDateBadge(race, t)
                  const effectiveRaceStatus = getEffectiveRaceCalendarStatus(race)
                  const sponsorTargetsForRace = sponsorObjectiveTargetsByRaceId[race.id] ?? []
                  const hasSponsorObjectiveTarget = sponsorTargetsForRace.length > 0
                  const sponsorTargetTitle = sponsorTargetsForRace
                    .map((target) => `${target.sponsor_name}: ${target.objective_title}`)
                    .join('\n')
                  const isFocusedRace = calendarDeepLink.raceId === race.id
                  const isSponsorObjectiveFocus =
                    isFocusedRace && calendarDeepLink.source === 'sponsor_objective'

                  return (
                    <li
                      key={race.id}
                      data-race-id={race.id}
                      className={`flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between ${
                        isFocusedRace
                          ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-[62px] shrink-0 text-center text-sm font-semibold leading-5 text-black">
                          <div>{dateBadge.start}</div>
                          {dateBadge.end ? <div>{dateBadge.end}</div> : null}
                        </div>

                        <div className="h-14 w-0.5 shrink-0 rounded-full bg-green-400" />

                        <div className="min-w-0">
                          <div className="font-medium text-gray-900">
                            <button
                              type="button"
                              onClick={() => openRaceDetail(race.id)}
                              className="text-left hover:underline"
                            >
                              <span className="mr-2 inline-flex align-middle">
                                <CountryFlag code={race.country_code} unknownCountryLabel={unknownCountryLabel} />
                              </span>
                              {race.name}
                            </button>
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {getRaceRouteSummary(race, t)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {hasSponsorObjectiveTarget ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              isSponsorObjectiveFocus
                                ? 'bg-yellow-300 text-yellow-950 ring-2 ring-yellow-400'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                            title={sponsorTargetTitle || t('races.sponsorObjectiveTarget')}
                          >
                            {t('races.sponsorGoal')}
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRaceApplicationBadgeClass(
                            effectiveRaceStatus
                          )}`}
                        >
                          {getRaceApplicationBadgeLabel(effectiveRaceStatus, t)}
                        </span>

                        {race.category ? (
                          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-700">
                            {race.category}
                          </span>
                        ) : null}

                        {race.race_type ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRaceTypeBadgeClass(
                              race.race_type
                            )}`}
                          >
                            {getRaceTypeLabel(race.race_type, t)}
                          </span>
                        ) : null}

                        <Link
                          to={`/dashboard/races/${race.id}?raceId=${race.id}`}
                          state={getCalendarReturnState(race.id)}
                          className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-700"
                        >
                          {t('races.openRace')}
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {tutorialMessage ? (
        <div className="fixed bottom-6 right-6 z-[1001] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
          {tutorialMessage}
        </div>
      ) : null}

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={t('tutorial.welcomeTitle')}
          body={t('tutorial.welcomeBody')}
          primaryAction={t('tutorial.start')}
          secondaryAction={t('tutorial.noThanks')}
          onPrimary={handleStartCalendarTutorial}
          onSecondary={handleSkipCalendarTutorial}
          onClose={handleCloseCalendarTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={currentTutorialText.title}
          body={currentTutorialText.body}
          stepLabel={`${tutorialStepIndex + 1}/${calendarTutorialSteps.length}`}
          primaryAction={
            tutorialStepIndex === calendarTutorialSteps.length - 1
              ? t('tutorial.openRace')
              : t('tutorial.next')
          }
          secondaryAction={
            tutorialStepIndex === calendarTutorialSteps.length - 1
              ? t('tutorial.finish')
              : t('tutorial.skip')
          }
          onPrimary={handleNextCalendarTutorialStep}
          onSecondary={
            tutorialStepIndex === calendarTutorialSteps.length - 1
              ? handleFinishCalendarTutorialForNow
              : handleSkipCalendarTutorial
          }
          onClose={handleCloseCalendarTutorial}
        />
      ) : null}
    </div>
  )
}
