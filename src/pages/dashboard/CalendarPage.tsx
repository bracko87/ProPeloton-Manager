'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'

type GameDateParts = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
}

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
  'December'
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

const WEEKDAY_NAMES_MONDAY_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

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
  label: string
}> = [
  { key: 'p_clear', label: 'Clear' },
  { key: 'p_partly_cloudy', label: 'Partly Cloudy' },
  { key: 'p_overcast', label: 'Overcast' },
  { key: 'p_foggy', label: 'Foggy' },
  { key: 'p_drizzle', label: 'Drizzle' },
  { key: 'p_rain', label: 'Rain' },
  { key: 'p_heavy_rain', label: 'Heavy Rain' },
  { key: 'p_sleet', label: 'Sleet' },
  { key: 'p_snow', label: 'Snow' },
  { key: 'p_thunderstorm', label: 'Thunderstorm' }
]

const FILTER_OPTIONS: Array<{ key: keyof SeasonCalendarFilters; label: string }> = [
  { key: 'races', label: 'Races' },
  { key: 'trainingCamps', label: 'Training Camps' },
  { key: 'events', label: 'Events' },
  { key: 'holidays', label: 'Holidays' }
]

const BASE_GAME_SEASON_YEAR = 2000

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

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value ?? 0))
}

function titleCaseFromSnake(value: string | null | undefined): string {
  if (!value) return 'Training Camp'
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getMonthStartFromGameDate(currentGameDate: string, currentDayNumber: number): Date {
  const current = parseDateString(currentGameDate)
  return addDays(current, -(currentDayNumber - 1))
}

function getGameMonthName(monthNumber: number): string {
  return GAME_MONTH_NAMES[monthNumber - 1] ?? `Month ${monthNumber}`
}

function getGameMonthShortName(monthNumber: number): string {
  return GAME_MONTH_SHORT_NAMES[monthNumber - 1] ?? `M${monthNumber}`
}

function formatCompactGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number
): string {
  return `S${seasonNumber} · ${getGameMonthShortName(monthNumber)} ${String(dayNumber).padStart(
    2,
    '0'
  )}`
}

function formatCalendarDateBadge(race: RaceCalendarEntryWithGameDates): {
  start: string
  end: string | null
} {
  const start = race.startGameDate
  const end = race.endGameDate

  const startLabel = `${String(start.dayNumber).padStart(2, '0')} ${getGameMonthShortName(
    start.monthNumber
  )}`

  const endLabel = `${String(end.dayNumber).padStart(2, '0')} ${getGameMonthShortName(
    end.monthNumber
  )}`

  const sameDay =
    start.seasonNumber === end.seasonNumber &&
    start.monthNumber === end.monthNumber &&
    start.dayNumber === end.dayNumber

  return {
    start: startLabel,
    end: sameDay ? null : endLabel
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
  return (
    (parts.seasonNumber - 1) * 12 * GAME_MONTH_LENGTH +
    (parts.monthNumber - 1) * GAME_MONTH_LENGTH +
    (parts.dayNumber - 1)
  )
}

function getWeekdayName(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)
}

function getWeekdayIndexMondayFirst(date: Date): number {
  const jsDay = date.getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

function formatGameMonthLabel(seasonNumber: number, monthNumber: number): string {
  return `Season ${seasonNumber} - ${getGameMonthName(monthNumber)}`
}

function formatGameDateDisplay(
  seasonNumber: number,
  monthNumber: number,
  dayNumber: number,
  canonicalDate: string
): string {
  const weekdayName = getWeekdayName(parseDateString(canonicalDate))
  return `Season ${seasonNumber} - ${weekdayName} - ${getGameMonthName(monthNumber)} ${dayNumber}`
}

function formatGameDateFromCanonical(
  canonicalDate: string,
  currentMonthStart: Date,
  currentSeasonNumber: number,
  currentMonthNumber: number
): string {
  const parts = getGameDatePartsFromCanonical(
    canonicalDate,
    currentMonthStart,
    currentSeasonNumber,
    currentMonthNumber
  )

  return formatGameDateDisplay(parts.seasonNumber, parts.monthNumber, parts.dayNumber, canonicalDate)
}

function formatRaceGameRange(
  start: RaceCalendarEntryWithGameDates['startGameDate'],
  end: RaceCalendarEntryWithGameDates['endGameDate'],
  startDate: string,
  endDate: string
): string {
  const sameDay =
    start.seasonNumber === end.seasonNumber &&
    start.monthNumber === end.monthNumber &&
    start.dayNumber === end.dayNumber

  if (sameDay) {
    return formatGameDateDisplay(start.seasonNumber, start.monthNumber, start.dayNumber, startDate)
  }

  return `${formatGameDateDisplay(
    start.seasonNumber,
    start.monthNumber,
    start.dayNumber,
    startDate
  )} → ${formatGameDateDisplay(end.seasonNumber, end.monthNumber, end.dayNumber, endDate)}`
}

function formatCalendarCellDate(monthNumber: number, dayNumber: number): string {
  return `${getGameMonthName(monthNumber)} ${dayNumber}`
}

function formatRaceBadgeLabel(
  race: RaceCalendarItem,
  canonicalDateString: string,
  stagesByRaceId: Record<string, RaceStageCalendarRow[]>
): string {
  const stages = stagesByRaceId[race.id] ?? []
  const matchingStage = stages.find(stage => stage.stage_date === canonicalDateString)

  if (matchingStage?.stage_number != null) {
    return `${race.name} · Stage ${matchingStage.stage_number}`
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

  return `${race.name} · Stage ${safeStageNumber}`
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null

  const normalized = code.trim().toUpperCase()

  if (normalized === 'UK') return 'GB'
  if (!/^[A-Z]{2}$/.test(normalized)) return null

  return normalized
}

function getFlagImageUrl(code: string | null | undefined): string | null {
  const normalized = normalizeCountryCode(code)

  if (!normalized) return null

  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
}

function CountryFlag({ code }: { code: string | null | undefined }) {
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
      className="inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function getRaceTypeLabel(raceType: string | null | undefined): string {
  if (raceType === 'one_day') return 'One Day'
  if (raceType === 'stage_race') return 'Stage Race'
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
    case 'cancelled':
      return 'bg-red-100 text-red-700'
    case 'closed':
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function getRaceApplicationBadgeLabel(status?: string | null): string {
  switch (status?.toLowerCase()) {
    case 'not_open':
      return 'Applications not open'
    case 'open':
      return 'Open for Applications'
    case 'closed':
      return 'Applications closed'
    case 'applied':
      return 'Applied'
    case 'accepted':
      return 'Accepted'
    case 'declined':
      return 'Declined'
    case 'withdrawn':
      return 'Withdrawn'
    case 'missed_startlist':
      return 'Missed startlist'
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

function getEffectiveRaceCalendarStatus(race: RaceCalendarItem): RaceApplicationStatus | null {
  const raceStatus = race.status?.toLowerCase() ?? null

  if (raceStatus === 'active') return 'race_active'
  if (raceStatus === 'completed' || raceStatus === 'archived') return 'race_finished'
  if (raceStatus === 'cancelled') return 'cancelled'

  return race.existing_application_status ?? race.applications_status
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
  race: RaceCalendarItem
): string {
  const startCity =
    cleanRouteCity(race.first_start_city)

  const finishCity =
    cleanRouteCity(race.final_finish_city)

  const stageCount = Number(
    race.actual_stage_count ??
      race.stage_count ??
      0
  )

  if (startCity && finishCity) {
    const stageSuffix =
      race.race_type === 'stage_race' &&
      stageCount > 1
        ? ` · ${stageCount} stages`
        : ''

    return `${startCity} → ${finishCity}${stageSuffix}`
  }

  if (race.description?.trim()) {
    return race.description.trim()
  }

  if (race.host_city?.trim()) {
    return `Host area: ${race.host_city.trim()}`
  }

  return 'Route details coming soon'
}

function getGameDatePartsFromCanonical(
  canonicalDate: string,
  currentMonthStart: Date,
  currentSeasonNumber: number,
  currentMonthNumber: number
): DerivedGameDateParts {
  const target = parseDateString(canonicalDate)
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
    dayNumber
  }
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

function getDominantWeatherLabel(weather: WeatherNormals | null): string {
  if (!weather) return 'No weather data'

  let bestLabel = 'Mixed Conditions'
  let bestScore = -1

  for (const item of WEATHER_LABELS) {
    const score = Number(weather[item.key] ?? 0)
    if (score > bestScore) {
      bestScore = score
      bestLabel = item.label
    }
  }

  return bestLabel
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

export default function CalendarPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeView, setActiveView] = useState<CalendarView>('season')
  const [activeRaceMonth, setActiveRaceMonth] = useState(1)
  const [displayedSeasonMonth, setDisplayedSeasonMonth] = useState(1)

  const location = useLocation()
  const navigate = useNavigate()

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

  const [seasonFilters, setSeasonFilters] = useState<SeasonCalendarFilters>({
    races: true,
    trainingCamps: true,
    events: false,
    holidays: false
  })

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
          throw new Error('No club was found for the logged-in user.')
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

          if (raceIds.length > 0) {
            const [entryRulesRes, userEntriesRes] = await Promise.all([
              supabase
                .from('race_entry_rules')
                .select(
                  'race_id, applications_status, target_teams, max_teams, min_riders_per_team, max_riders_per_team'
                )
                .in('race_id', raceIds),
              supabase
                .from('race_team_entries')
                .select('race_id, club_id, status')
                .in('race_id', raceIds)
                .eq('club_id', resolvedClubId)
                .in('status', ['applied', 'accepted', 'declined', 'withdrawn', 'missed_startlist', 'cancelled'])
            ])

            if (!entryRulesRes.error) {
              entryRulesByRaceId = ((entryRulesRes.data ?? []) as RaceEntryRules[]).reduce<
                Record<string, RaceEntryRules>
              >((acc, rule) => {
                acc[rule.race_id] = rule
                return acc
              }, {})
            }

            if (!userEntriesRes.error) {
              userEntriesByRaceId = ((userEntriesRes.data ?? []) as RaceTeamEntry[]).reduce<
                Record<string, RaceTeamEntry>
              >((acc, entry) => {
                acc[entry.race_id] = entry
                return acc
              }, {})
            }
          }

          resolvedRaces = raceRows.map(row => {
            const raceId = toNullableString(row.id) ?? ''
            const entryRules = entryRulesByRaceId[raceId]
            const userEntry = userEntriesByRaceId[raceId]

            return {
              ...row,
              id: raceId,
              name: toNullableString(row.name) ?? 'Unnamed race',
              start_date: toNullableString(row.start_date) ?? '',
              end_date: toNullableString(row.end_date),
              category: toNullableString(row.category),
              applications_status: entryRules?.applications_status ?? null,
              status: toNullableString(row.status),
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
            const stagesRes = await supabase
              .from('race_stages')
              .select('race_id, stage_number, stage_date')
              .in('race_id', raceIds)
              .order('stage_date', { ascending: true })
              .order('stage_number', { ascending: true })

            if (!stagesRes.error) {
              resolvedRaceStagesByRaceId = ((stagesRes.data ?? []) as RaceStageCalendarRow[]).reduce<
                Record<string, RaceStageCalendarRow[]>
              >((acc, stage) => {
                if (!acc[stage.race_id]) acc[stage.race_id] = []
                acc[stage.race_id].push({
                  race_id: stage.race_id,
                  stage_number: stage.stage_number,
                  stage_date: stage.stage_date,
                })
                return acc
              }, {})
            }
          }
        } catch {
          resolvedRaceNotice = 'Race Calendar is ready, but the race source is not available yet.'
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
                  sponsor_name: toNullableString(row.sponsor_name) ?? 'Sponsor',
                  objective_title: toNullableString(row.objective_title) ?? 'Sponsor objective',
                  target_race_id: targetRaceId,
                  required_result: toNullableString(row.required_result) ?? 'objective',
                  display_status_label: toNullableString(row.display_status_label) ?? 'Scheduled',
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
          const message = err instanceof Error ? err.message : 'Failed to load calendar.'
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
  }, [])

  useEffect(() => {
    if (!gameDateParts) return

    const deepLink = getCalendarDeepLinkParams(location.search)
    const resolvedMonth = deepLink.monthNumber ?? gameDateParts.month_number

    setActiveRaceMonth(resolvedMonth)
    setDisplayedSeasonMonth(resolvedMonth)

    if (deepLink.view) {
      setActiveView(deepLink.view)
    }
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

    if (typeof state.restoreMonthNumber === 'number') {
      setActiveRaceMonth(state.restoreMonthNumber)
      setDisplayedSeasonMonth(state.restoreMonthNumber)
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


  const currentMonthStart = useMemo(() => {
    if (!currentGameDate || !gameDateParts) return null
    return getMonthStartFromGameDate(currentGameDate, gameDateParts.day_number)
  }, [currentGameDate, gameDateParts])

  const displayedMonthStart = useMemo(() => {
    if (!currentMonthStart || !gameDateParts) return null
    const monthOffset = displayedSeasonMonth - gameDateParts.month_number
    return addDays(currentMonthStart, monthOffset * GAME_MONTH_LENGTH)
  }, [currentMonthStart, gameDateParts, displayedSeasonMonth])

  const monthDays = useMemo(() => {
    if (!displayedMonthStart || !currentMonthStart || !gameDateParts) return []

    return Array.from({ length: GAME_MONTH_LENGTH }, (_, index) => {
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
  }, [displayedMonthStart, currentMonthStart, gameDateParts])

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
      .filter((race) => race.startGameDate.monthNumber === activeRaceMonth)
      .sort((a, b) => {
        const dateDiff =
          getRaceCalendarSortOrdinal(a.startGameDate) -
          getRaceCalendarSortOrdinal(b.startGameDate)

        if (dateDiff !== 0) return dateDiff

        return a.name.localeCompare(b.name)
      })
  }, [seasonRaceEntries, activeRaceMonth])

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
  }, [loading, activeView, activeRaceMonth, activeMonthRaces.length, location.search])

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

  const weekdayHeaders = useMemo(() => {
    return WEEKDAY_NAMES_MONDAY_FIRST
  }, [])

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

  function toggleSeasonFilter(key: keyof SeasonCalendarFilters): void {
    setSeasonFilters(current => ({
      ...current,
      [key]: !current[key]
    }))
  }

  function handlePreviousSeasonMonth(): void {
    setDisplayedSeasonMonth(current => Math.max(1, current - 1))
  }

  function handleNextSeasonMonth(): void {
    setDisplayedSeasonMonth(current => Math.min(12, current + 1))
  }

  function getCalendarReturnState(raceId: string) {
    return {
      from: 'calendar',
      returnTo: `${location.pathname}${location.search}`,
      returnScrollY: window.scrollY,
      returnRaceId: raceId,
      returnCalendarView: activeView,
      returnMonthNumber: activeView === 'races' ? activeRaceMonth : displayedSeasonMonth,
    }
  }

  function openRaceDetail(raceId: string): void {
    navigate(`/dashboard/races/${raceId}?raceId=${raceId}`, {
      state: getCalendarReturnState(raceId),
    })
  }

  if (loading) {
    return <div className="w-full text-sm text-gray-600">Loading calendar…</div>
  }


  return (
    <div className="w-full">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-gray-900">Calendar</h2>
          <p className="mt-1 text-sm text-gray-500">
            Season overview, race schedule, and team-country weather for the current in-game date.
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
              Season Calendar
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
              Race Calendar
            </button>
          </div>
        </div>

        {activeView === 'season' ? (
          <div className="w-full xl:max-w-[380px]">
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Team Country Weather
              </div>

              {teamWeather && gameDateParts && currentGameDate ? (
                <div className="mt-2 space-y-1.5">
                  <div className="text-sm font-medium text-gray-900">
                    Today:{' '}
                    {formatGameDateDisplay(
                      gameDateParts.season_number,
                      gameDateParts.month_number,
                      gameDateParts.day_number,
                      currentGameDate
                    )}
                  </div>

                  <div className="text-sm font-semibold text-gray-900">
                    {formatWeatherNumber(teamWeather.avg_temp_c)}°C ·{' '}
                    {getDominantWeatherLabel(teamWeather)}
                  </div>

                  <div className="text-xs text-gray-600">
                    Min {formatWeatherNumber(teamWeather.avg_min_temp_c)}° · Max{' '}
                    {formatWeatherNumber(teamWeather.avg_max_temp_c)}° · Wind{' '}
                    {formatWeatherNumber(teamWeather.avg_wind_kmh)} km/h · Rain{' '}
                    {formatWeatherNumber(teamWeather.avg_precip_mm, 1)} mm
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-600">
                  No team-country weather data available yet.
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
                    ? formatGameMonthLabel(gameDateParts.season_number, displayedSeasonMonth)
                    : 'Current Month'}
                </h4>
                <p className="text-sm text-gray-500">
                  {currentGameDate && gameDateParts
                    ? `Today: ${formatGameDateDisplay(
                        gameDateParts.season_number,
                        gameDateParts.month_number,
                        gameDateParts.day_number,
                        currentGameDate
                      )}`
                    : 'Game date unavailable'}
                </p>
              </div>

              <div className="flex justify-center xl:flex-1">
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={handlePreviousSeasonMonth}
                    disabled={displayedSeasonMonth === 1}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      displayedSeasonMonth === 1
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    ← Previous
                  </button>

                  <div className="min-w-[140px] px-3 text-center text-sm font-semibold text-gray-800">
                    {getGameMonthName(displayedSeasonMonth)}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextSeasonMonth}
                    disabled={displayedSeasonMonth === 12}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      displayedSeasonMonth === 12
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Next →
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
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  {bookings.length} planned / active training camp
                  {bookings.length === 1 ? '' : 's'}
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
                      {formatCalendarCellDate(day.gameParts.monthNumber, day.gameParts.dayNumber)}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayRaces.map(race => (
                        <div
                          key={`${race.id}-${day.canonicalDateString}-race`}
                          data-race-id={race.id}
                          className="rounded-md bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700"
                        >
                          <button
                            type="button"
                            onClick={() => openRaceDetail(race.id)}
                            className="text-left hover:underline"
                          >
                            {formatRaceBadgeLabel(race, day.canonicalDateString, raceStagesByRaceId)}
                          </button>
                        </div>
                      ))}

                      {dayBookings.map(booking => (
                        <div
                          key={`${booking.id}-${day.canonicalDateString}-camp`}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                            booking.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {booking.city_snapshot ?? 'Camp'} ·{' '}
                          {titleCaseFromSnake(booking.camp_type_snapshot)}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              <h4 className="font-semibold text-gray-900">Upcoming Training Camps</h4>

              {bookings.length === 0 ? (
                <div className="mt-3 rounded-md border border-gray-200 p-4 text-sm text-gray-500">
                  No planned or active training camps yet.
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
                          {booking.city_snapshot ?? 'Training Camp'} ·{' '}
                          {titleCaseFromSnake(booking.camp_type_snapshot)}
                        </div>

                        {currentMonthStart && gameDateParts ? (
                          <div className="mt-1 text-xs text-gray-500">
                            {formatGameDateFromCanonical(
                              booking.start_date,
                              currentMonthStart,
                              gameDateParts.season_number,
                              gameDateParts.month_number
                            )}{' '}
                            →{' '}
                            {formatGameDateFromCanonical(
                              booking.end_date,
                              currentMonthStart,
                              gameDateParts.season_number,
                              gameDateParts.month_number
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
                          {booking.status}
                        </span>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          Riders: {booking.participants_count ?? 0}
                        </span>

                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {formatCurrency(booking.total_cost)}
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
                    ? `Season ${gameDateParts.season_number} Race Calendar`
                    : 'Race Calendar'}
                </h4>
                <p className="text-sm text-gray-500">
                  Each month has its own tab with all scheduled races.
                </p>
              </div>

              <div className="text-sm text-gray-500">
                {seasonRaceEntries.length} race{seasonRaceEntries.length === 1 ? '' : 's'} in this
                season
              </div>
            </div>

            <div className="mb-4 w-full rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
              <div className="grid w-full grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-12">
                {Array.from({ length: 12 }, (_, index) => index + 1).map(monthNumber => (
                  <button
                    key={monthNumber}
                    type="button"
                    onClick={() => setActiveRaceMonth(monthNumber)}
                    className={`w-full rounded-md px-3 py-2 text-center text-sm font-medium transition ${
                      activeRaceMonth === monthNumber
                        ? 'bg-yellow-400 text-black'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {getGameMonthName(monthNumber)}
                  </button>
                ))}
              </div>
            </div>

            {raceCalendarNotice ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {raceCalendarNotice}
              </div>
            ) : null}

            {activeMonthRaces.length === 0 ? (
              <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
                No races scheduled for {getGameMonthName(activeRaceMonth)}.
              </div>
            ) : (
              <ul className="space-y-3">
                {activeMonthRaces.map((race) => {
                  const dateBadge = formatCalendarDateBadge(race)
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
                                <CountryFlag code={race.country_code} />
                              </span>
                              {race.name}
                            </button>
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {getRaceRouteSummary(race)}
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
                            title={sponsorTargetTitle || 'Sponsor objective target'}
                          >
                            ★ Sponsor goal
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRaceApplicationBadgeClass(
                            effectiveRaceStatus
                          )}`}
                        >
                          {getRaceApplicationBadgeLabel(effectiveRaceStatus)}
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
                            {getRaceTypeLabel(race.race_type)}
                          </span>
                        ) : null}

                        <Link
                          to={`/dashboard/races/${race.id}?raceId=${race.id}`}
                          state={getCalendarReturnState(race.id)}
                          className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-700"
                        >
                          Open Race
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
    </div>
  )
}
