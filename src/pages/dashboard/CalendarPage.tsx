'use client'

import React, { useEffect, useMemo, useState } from 'react'
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

type RaceCalendarItem = {
  id: string
  name: string
  start_date: string
  end_date: string | null
  country_code: string | null
  category: string | null
  race_type: string | null
}

type DerivedGameDateParts = {
  seasonNumber: number
  monthNumber: number
  dayNumber: number
}

type RaceCalendarEntry = RaceCalendarItem & {
  startGameDate: DerivedGameDateParts
  endGameDate: DerivedGameDateParts
}

type CalendarView = 'season' | 'races'

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

function parseDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
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

function getWeekdayName(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)
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

function formatGameDateShortDisplay(
  monthNumber: number,
  dayNumber: number,
  canonicalDate: string
): string {
  const weekdayName = getWeekdayName(parseDateString(canonicalDate))
  return `${weekdayName} - ${getGameMonthName(monthNumber)} ${dayNumber}`
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

  return formatGameDateDisplay(
    parts.seasonNumber,
    parts.monthNumber,
    parts.dayNumber,
    canonicalDate
  )
}

function formatRaceGameRange(start: RaceCalendarEntry['startGameDate'], end: RaceCalendarEntry['endGameDate'], startDate: string, endDate: string): string {
  const sameDay =
    start.seasonNumber === end.seasonNumber &&
    start.monthNumber === end.monthNumber &&
    start.dayNumber === end.dayNumber

  if (sameDay) {
    return formatGameDateDisplay(
      start.seasonNumber,
      start.monthNumber,
      start.dayNumber,
      startDate
    )
  }

  return `${formatGameDateDisplay(
    start.seasonNumber,
    start.monthNumber,
    start.dayNumber,
    startDate
  )} → ${formatGameDateDisplay(
    end.seasonNumber,
    end.monthNumber,
    end.dayNumber,
    endDate
  )}`
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
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
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

export default function CalendarPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeView, setActiveView] = useState<CalendarView>('season')
  const [activeRaceMonth, setActiveRaceMonth] = useState(1)

  const [clubId, setClubId] = useState<string | null>(null)

  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [gameDateParts, setGameDateParts] = useState<GameDateParts | null>(null)

  const [bookings, setBookings] = useState<TrainingCampBooking[]>([])
  const [races, setRaces] = useState<RaceCalendarItem[]>([])

  const [teamWeather, setTeamWeather] = useState<WeatherNormals | null>(null)

  const [raceCalendarNotice, setRaceCalendarNotice] = useState<string | null>(null)

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
              .select(
                `
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
                `
              )
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
          const racesRes = await supabase
            .from('races')
            .select('id, name, start_date, end_date, country_code, category, race_type')
            .order('start_date', { ascending: true })

          if (racesRes.error) {
            resolvedRaceNotice =
              'Race Calendar is ready, but the race source is not available yet.'
          } else {
            resolvedRaces = (racesRes.data ?? []) as RaceCalendarItem[]
          }
        } catch {
          resolvedRaceNotice =
            'Race Calendar is ready, but the race source is not available yet.'
        }

        if (cancelled) return

        setClubId(resolvedClubId)
        setCurrentGameDate(nextGameDate || null)
        setGameDateParts(nextGameDateParts)
        setBookings((bookingsRes.data ?? []) as TrainingCampBooking[])
        setTeamWeather(resolvedTeamWeather)
        setRaces(resolvedRaces)
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
    if (gameDateParts) {
      setActiveRaceMonth(gameDateParts.month_number)
    }
  }, [gameDateParts])

  const currentMonthStart = useMemo(() => {
    if (!currentGameDate || !gameDateParts) return null
    return getMonthStartFromGameDate(currentGameDate, gameDateParts.day_number)
  }, [currentGameDate, gameDateParts])

  const monthDays = useMemo(() => {
    if (!currentMonthStart || !gameDateParts) return []

    return Array.from({ length: GAME_MONTH_LENGTH }, (_, index) => {
      const canonicalDate = addDays(currentMonthStart, index)
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
  }, [currentMonthStart, gameDateParts])

  const seasonRaceEntries = useMemo(() => {
    if (!currentMonthStart || !gameDateParts) return []

    return races
      .map((race): RaceCalendarEntry => {
        const startGameDate = getGameDatePartsFromCanonical(
          race.start_date,
          currentMonthStart,
          gameDateParts.season_number,
          gameDateParts.month_number
        )

        const endGameDate = getGameDatePartsFromCanonical(
          race.end_date ?? race.start_date,
          currentMonthStart,
          gameDateParts.season_number,
          gameDateParts.month_number
        )

        return {
          ...race,
          end_date: race.end_date ?? race.start_date,
          startGameDate,
          endGameDate
        }
      })
      .filter(race => race.startGameDate.seasonNumber === gameDateParts.season_number)
      .sort(
        (a, b) =>
          parseDateString(a.start_date).getTime() - parseDateString(b.start_date).getTime()
      )
  }, [races, currentMonthStart, gameDateParts])

  const activeMonthRaces = useMemo(() => {
    return seasonRaceEntries.filter(race => race.startGameDate.monthNumber === activeRaceMonth)
  }, [seasonRaceEntries, activeRaceMonth])

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
                    Today: {formatGameDateDisplay(
                      gameDateParts.season_number,
                      gameDateParts.month_number,
                      gameDateParts.day_number,
                      currentGameDate
                    )}
                  </div>

                  <div className="text-lg font-semibold text-gray-900">
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
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {gameDateParts
                    ? formatGameMonthLabel(
                        gameDateParts.season_number,
                        gameDateParts.month_number
                      )
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

              <div className="text-sm text-gray-500">
                {bookings.length} planned / active training camp
                {bookings.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="grid w-full grid-cols-7 gap-2 text-sm text-gray-600">
              {monthDays.map(day => {
                const dayBookings = bookings.filter(booking =>
                  isDateWithinRange(day.canonicalDate, booking.start_date, booking.end_date)
                )

                const isToday =
                  currentGameDate != null && day.canonicalDateString === currentGameDate

                return (
                  <div
                    key={day.canonicalDateString}
                    className={`min-h-[110px] rounded-md border p-3 ${
                      isToday ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="text-[11px] font-medium leading-4 text-gray-700">
                      {formatGameDateShortDisplay(
                        day.gameParts.monthNumber,
                        day.gameParts.dayNumber,
                        day.canonicalDateString
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayBookings.map(booking => (
                        <div
                          key={`${booking.id}-${day.canonicalDateString}`}
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

            <div className="mb-4 inline-flex flex-wrap rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
              {Array.from({ length: 12 }, (_, index) => index + 1).map(monthNumber => (
                <button
                  key={monthNumber}
                  type="button"
                  onClick={() => setActiveRaceMonth(monthNumber)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    activeRaceMonth === monthNumber
                      ? 'bg-yellow-400 text-black'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {getGameMonthName(monthNumber)}
                </button>
              ))}
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
                {activeMonthRaces.map(race => (
                  <li
                    key={race.id}
                    className="flex flex-col gap-3 rounded-md border border-gray-200 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{race.name}</div>

                      <div className="mt-1 text-xs text-gray-500">
                        {formatRaceGameRange(
                          race.startGameDate,
                          race.endGameDate,
                          race.start_date,
                          race.end_date ?? race.start_date
                        )}
                      </div>

                      <div className="mt-1 text-xs text-gray-400">
                        {race.start_date}
                        {race.end_date && race.end_date !== race.start_date
                          ? ` → ${race.end_date}`
                          : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {race.country_code ? (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {race.country_code}
                        </span>
                      ) : null}

                      {race.category ? (
                        <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-700">
                          {race.category}
                        </span>
                      ) : null}

                      {race.race_type ? (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700">
                          {titleCaseFromSnake(race.race_type)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {clubId ? <div className="mt-4 text-xs text-gray-400">Club ID: {clubId}</div> : null}
      </div>
    </div>
  )
}