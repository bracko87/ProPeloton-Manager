/**
 * CurrentTrainingCampPage.tsx
 * Dashboard page showing details and progress for the current training camp.
 *
 * Updated behavior:
 * - Removes the large active banner at the top.
 * - Keeps the small status pill inside the Status summary box instead.
 * - Weather / Staff boost summary / Daily camp reports / Camp staff & boosts
 *   are collapsible and closed by default.
 * - Weather is loaded from public.training_get_camp_weather.
 * - Location image / description falls back to training_camp_catalog.
 * - Training program allows team or individual intensity planning for the next 3 camp days.
 * - Rider names are normalized from public.riders first_name + last_name.
 * - Training plan save errors now show the real Edge Function error/reason.
 * - Future booked camps only show the full interface one in-game day before start.
 * - Future camps stay in booked notice state when another camp is currently active.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '../../../lib/supabase'

type CampParticipant = {
  id: string
  rider_id: string
  rider_name: string | null
  role: string | null
  status: string | null
  total_gain: number | null
  daily_gain: number | null
}

type RiderNameRow = {
  id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
}

type CampStaff = {
  id: string
  staff_id: string
  staff_name: string | null
  role_type: string | null
  boost_label: string | null
}

type StaffBoostSummary = {
  boosts?: Array<{
    staff_id?: string
    role_type?: string
    staff_name?: string
    boost_label?: string
    boost_metadata?: Record<string, unknown>
  }>
  staff_count?: number
  recovery_bonus?: number
  development_bonus_pct?: number
  organization_bonus_pct?: number
  health_risk_reduction_pct?: number
  mechanical_risk_reduction_pct?: number
}

type CampDailyReport = {
  id: string
  booking_id: string
  report_date: string
  day_index: number
  weather_state: string
  session_completed: boolean
  participants_count: number
  completed_count: number
  missed_count: number
  avg_fatigue_before: number | null
  avg_fatigue_after: number | null
  summary_text: string
  payload: Record<string, unknown>
}

type CurrentCamp = {
  id: string
  location_name: string | null
  country_code: string | null
  focus_label: string | null
  current_day: number | null
  duration_days: number | null
  status: string | null
  started_on_game_date: string | null
  ends_on_game_date: string | null

  participants_count?: number | null
  staff_count?: number | null
  charged_participants_count?: number | null
  total_cost?: number | null
  notes?: {
    staff_boost_summary?: StaffBoostSummary
    [key: string]: unknown
  } | null
}

type CampPageState = 'booked_notice' | 'prestart' | 'active' | 'post' | 'hidden'

type CampBookingWindow = {
  id: string
  club_id?: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
}

type TrainingCampLocationInfo = {
  city_name?: string | null
  country_code?: string | null
  image_url?: string | null
  short_description?: string | null
  long_description?: string | null
}

type CampWeatherDay = {
  date: string
  label?: string
  condition: string
  condition_code?: string
  temp_c: number | null
  wind_kmh: number | null
  wet_weather_chance_pct: number | null
}

type CampWeatherInfo = {
  source?: string
  today: CampWeatherDay | null
  forecast: CampWeatherDay[]
}

type TrainingPlanIntensity = 'day_off' | 'light' | 'normal' | 'hard'

type TrainingPlanRow = {
  booking_id: string
  rider_id: string
  plan_date: string
  intensity: TrainingPlanIntensity
}

type PlanDay = {
  date: string
  label: string
  isLocked: boolean
  weather: CampWeatherDay | null
}

const TRAINING_PLAN_OPTIONS: Array<{
  value: TrainingPlanIntensity
  label: string
  description: string
}> = [
  {
    value: 'day_off',
    label: 'Day off',
    description: 'No skill gain. Fatigue recovers.',
  },
  {
    value: 'light',
    label: 'Light training',
    description: 'Small skill gain. Fatigue still recovers.',
  },
  {
    value: 'normal',
    label: 'Normal intensity',
    description: 'Standard camp training effect.',
  },
  {
    value: 'hard',
    label: 'Hard intensity',
    description: 'Higher skill gain, more fatigue and risk.',
  },
]

function buildFullRiderName(row: RiderNameRow): string {
  const fullName = [row.first_name, row.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')

  return fullName || row.display_name || 'Unknown rider'
}

function parseGameDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isDateBetween(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getStrictCampPageState(
  camp: CurrentCamp | null,
  currentGameDate: string | null,
  bookingWindows: CampBookingWindow[],
): CampPageState {
  if (!camp) return 'hidden'

  const today = parseGameDate(currentGameDate)
  const start = parseGameDate(camp.started_on_game_date)
  const end = parseGameDate(camp.ends_on_game_date)

  const normalizedCampStatus = (camp.status ?? '').toLowerCase()

  if (!today || !start || !end) {
    return normalizedCampStatus === 'active' ? 'active' : 'hidden'
  }

  const selectedBooking = bookingWindows.find((booking) => booking.id === camp.id)
  const selectedClubId = selectedBooking?.club_id ?? null

  const hasOtherActiveCamp = bookingWindows.some((booking) => {
    if (booking.id === camp.id) return false
    if (selectedClubId && booking.club_id && booking.club_id !== selectedClubId) return false

    const normalizedBookingStatus = (booking.status ?? '').toLowerCase()

    if (normalizedBookingStatus !== 'active') return false

    const otherStart = parseGameDate(booking.start_date)
    const otherEnd = parseGameDate(booking.end_date)

    if (!otherStart || !otherEnd) return false

    return isDateBetween(today, otherStart, otherEnd)
  })

  if (normalizedCampStatus === 'active' && isDateBetween(today, start, end)) {
    return 'active'
  }

  if (hasOtherActiveCamp && today < start) {
    return 'booked_notice'
  }

  if (hasOtherActiveCamp && today > end) {
    return 'hidden'
  }

  if (today >= addDays(start, -1) && today < start) {
    return 'prestart'
  }

  if (today > end && today <= addDays(end, 5)) {
    return 'post'
  }

  if (today < addDays(start, -1)) {
    return 'booked_notice'
  }

  return 'hidden'
}

function formatSeasonDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = parseGameDate(value)
  if (!parsed) return value
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  const month = parsed.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${day} ${month}`
}

function formatLabel(value: string | null): string {
  if (!value) return '—'
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatGainValue(value: number | null): string {
  if (value === null || value === undefined) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `+${numeric.toFixed(1)}`
}

function formatBoostValue(value: number | null | undefined, suffix = ''): string {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric === 0) return '—'
  return `+${numeric}${suffix}`
}

function formatFatigueDelta(before: number | null, after: number | null): string {
  if (before == null || after == null) return '—'

  const delta = Number(after) - Number(before)
  if (!Number.isFinite(delta)) return '—'

  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`
}

function formatWeatherForecastLabel(dateValue: string, index: number): string {
  if (index === 0) return 'Tomorrow'

  const parsed = new Date(`${dateValue.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return dateValue

  const month = parsed.toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })

  const weekday = parsed.toLocaleString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  })

  return `${month} ${parsed.getUTCDate()} - ${weekday}`
}

function getStatusPillClasses(status: string | null): string {
  const normalized = (status ?? '').toLowerCase()

  if (normalized === 'active') {
    return 'bg-green-100 text-green-800'
  }

  if (normalized === 'completed' || normalized === 'finished') {
    return 'bg-slate-100 text-slate-700'
  }

  if (normalized === 'booked' || normalized === 'upcoming' || normalized === 'prestart') {
    return 'bg-blue-100 text-blue-800'
  }

  return 'bg-slate-100 text-slate-700'
}

function getWeatherIcon(conditionCode: string | undefined): string {
  switch (conditionCode) {
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
      return '⛈️'
    case 'sleet':
      return '🌨️'
    case 'snow':
      return '❄️'
    case 'thunderstorm':
      return '⛈️'
    default:
      return '☁️'
  }
}

function resolveWeatherBaseDate(camp: CurrentCamp): Date | null {
  const status = (camp.status ?? '').toLowerCase()

  if (status === 'active' && camp.started_on_game_date) {
    const start = parseGameDate(camp.started_on_game_date)
    if (!start) return null

    const dayOffset = Math.max(0, Number(camp.current_day ?? 1) - 1)
    return addDays(start, dayOffset)
  }

  if ((status === 'completed' || status === 'finished') && camp.ends_on_game_date) {
    return parseGameDate(camp.ends_on_game_date)
  }

  if (camp.started_on_game_date) {
    return parseGameDate(camp.started_on_game_date)
  }

  return null
}

function buildNextTrainingPlanDays(
  camp: CurrentCamp,
  weatherInfo: CampWeatherInfo | null,
  currentGameDate: string | null,
): PlanDay[] {
  const today = parseGameDate(currentGameDate)
  const fallbackBaseDate = resolveWeatherBaseDate(camp)
  const baseDate = today ?? fallbackBaseDate

  const startDate = parseGameDate(camp.started_on_game_date)
  const endDate = parseGameDate(camp.ends_on_game_date)

  if (!baseDate || !startDate || !endDate) return []

  const days: PlanDay[] = []

  for (let offset = 1; offset <= 3; offset += 1) {
    let nextDate = addDays(baseDate, offset)

    if (nextDate < startDate) {
      nextDate = startDate
    }

    if (nextDate > endDate) continue

    const isoDate = toIsoDate(nextDate)
    const alreadyExists = days.some((day) => day.date === isoDate)

    if (alreadyExists) continue

    const weather =
      weatherInfo?.forecast?.find((item) => item.date === isoDate) ?? null

    days.push({
      date: isoDate,
      label:
        offset === 1
          ? 'Tomorrow'
          : formatWeatherForecastLabel(isoDate, offset - 1),
      isLocked: false,
      weather,
    })
  }

  return days
}

function getDefaultIntensity(): TrainingPlanIntensity {
  return 'normal'
}

function getTrainingPlanPreview(intensity: TrainingPlanIntensity): string {
  switch (intensity) {
    case 'day_off':
      return '0% skill · fatigue recovery'
    case 'light':
      return '60% skill · light recovery'
    case 'hard':
      return '125% skill · high fatigue'
    case 'normal':
    default:
      return '100% skill · normal fatigue'
  }
}

function normalizeCampWeather(value: unknown): CampWeatherInfo | null {
  const data = value as {
    ok?: boolean
    source?: string
    today?: CampWeatherDay | null
    forecast?: CampWeatherDay[]
  } | null

  if (!data || data.ok === false) return null

  return {
    source: data.source ?? 'weather_normals',
    today: data.today ?? null,
    forecast: Array.isArray(data.forecast) ? data.forecast.slice(0, 5) : [],
  }
}

async function loadTrainingCampLocationInfoFallback(
  camp: CurrentCamp,
): Promise<TrainingCampLocationInfo | null> {
  const bookingId = camp.id
  const fallbackCityName = camp.location_name
  const fallbackCountryCode = camp.country_code

  let bookingLookup: {
    camp_id?: string | null
    city_snapshot?: string | null
    country_code_snapshot?: string | null
    country_code?: string | null
  } | null = null

  if (bookingId) {
    const { data, error } = await supabase
      .from('training_camp_bookings')
      .select('camp_id, city_snapshot, country_code_snapshot, country_code')
      .eq('id', bookingId)
      .maybeSingle()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load training camp booking fallback data:', error)
    } else {
      bookingLookup = data
    }
  }

  const catalogId = bookingLookup?.camp_id ?? null

  if (catalogId) {
    const { data, error } = await supabase
      .from('training_camp_catalog')
      .select('city_name, country_code, image_url, short_description, long_description')
      .eq('id', catalogId)
      .maybeSingle()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load training camp catalog by camp_id:', error)
    }

    if (data) {
      return data as TrainingCampLocationInfo
    }
  }

  const cityName = bookingLookup?.city_snapshot ?? fallbackCityName
  const countryCode =
    bookingLookup?.country_code_snapshot ??
    bookingLookup?.country_code ??
    fallbackCountryCode

  if (!cityName && !countryCode) {
    return null
  }

  let query = supabase
    .from('training_camp_catalog')
    .select('city_name, country_code, image_url, short_description, long_description')
    .limit(1)

  if (cityName) {
    query = query.eq('city_name', cityName)
  }

  if (countryCode) {
    query = query.eq('country_code', countryCode)
  }

  const { data, error } = await query

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load training camp catalog fallback by city/country:', error)
    return null
  }

  return ((data ?? [])[0] ?? null) as TrainingCampLocationInfo | null
}

export default function CurrentTrainingCampPage(): JSX.Element {
  const navigate = useNavigate()
  const { campId } = useParams()

  const [camp, setCamp] = useState<CurrentCamp | null>(null)
  const [participants, setParticipants] = useState<CampParticipant[]>([])
  const [staff, setStaff] = useState<CampStaff[]>([])
  const [reports, setReports] = useState<CampDailyReport[]>([])
  const [boostSummary, setBoostSummary] = useState<StaffBoostSummary | null>(null)
  const [locationInfo, setLocationInfo] = useState<TrainingCampLocationInfo | null>(null)
  const [weatherInfo, setWeatherInfo] = useState<CampWeatherInfo | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [bookingWindows, setBookingWindows] = useState<CampBookingWindow[]>([])

  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [isWeatherOpen, setIsWeatherOpen] = useState(false)
  const [isBoostsOpen, setIsBoostsOpen] = useState(false)
  const [isReportsOpen, setIsReportsOpen] = useState(false)
  const [isCampStaffOpen, setIsCampStaffOpen] = useState(false)

  const [trainingPlans, setTrainingPlans] = useState<Record<string, Record<string, TrainingPlanIntensity>>>({})
  const [isTrainingPlanOpen, setIsTrainingPlanOpen] = useState(true)
  const [isSavingTrainingPlans, setIsSavingTrainingPlans] = useState(false)
  const [trainingPlanMessage, setTrainingPlanMessage] = useState<string | null>(null)
  const [trainingPlanError, setTrainingPlanError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadCurrentCamp(): Promise<void> {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const { data, error } = await supabase.rpc('training_get_current_camp', {
          p_camp_id: campId ?? null,
        })

        if (cancelled) return

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to load current training camp:', error)

          setErrorMessage(
            'Current training camp data is not available yet. Create or extend the RPC training_get_current_camp to connect this page.',
          )
          setCamp(null)
          setParticipants([])
          setStaff([])
          setReports([])
          setBoostSummary(null)
          setLocationInfo(null)
          setWeatherInfo(null)
          setCurrentGameDate(null)
          setBookingWindows([])
          setTrainingPlans({})
          setTrainingPlanMessage(null)
          setTrainingPlanError(null)
          setIsLoading(false)
          return
        }

        const result = data as
          | {
              camp?: CurrentCamp | null
              participants?: CampParticipant[]
              staff?: CampStaff[]
              daily_reports?: CampDailyReport[]
              reports?: CampDailyReport[]
              boost_summary?: StaffBoostSummary | null
              location_info?: TrainingCampLocationInfo | null
              current_game_date?: string | null
            }
          | null

        const { data: gameDateData, error: gameDateError } = await supabase.rpc(
          'get_current_game_date_date',
        )

        if (gameDateError) throw gameDateError
        if (cancelled) return

        const loadedCurrentGameDate = gameDateData ? String(gameDateData) : null

        setCurrentGameDate(loadedCurrentGameDate)

        const { data: bookingWindowRows, error: bookingWindowError } = await supabase
          .from('training_camp_bookings')
          .select('id, club_id, status, start_date, end_date')
          .in('status', ['booked', 'planned', 'active', 'completed'])

        if (bookingWindowError) throw bookingWindowError
        if (cancelled) return

        setBookingWindows((bookingWindowRows ?? []) as CampBookingWindow[])

        const nextCamp = result?.camp ?? null
        const rawParticipants = result?.participants ?? []
        const nextStaff = result?.staff ?? []
        const nextReportsFromRpc = result?.daily_reports ?? result?.reports ?? []

        const resolvedCurrentGameDate =
          result?.current_game_date != null
            ? String(result.current_game_date)
            : loadedCurrentGameDate

        setCurrentGameDate(resolvedCurrentGameDate)

        if (!nextCamp) {
          setCamp(null)
          setParticipants([])
          setStaff([])
          setReports([])
          setBoostSummary(null)
          setLocationInfo(null)
          setWeatherInfo(null)
          setTrainingPlans({})
          setTrainingPlanMessage(null)
          setTrainingPlanError(null)
          setIsLoading(false)
          return
        }

        let nextLocationInfo = result?.location_info ?? null

        if (!nextLocationInfo?.image_url || !nextLocationInfo?.long_description) {
          const fallbackLocationInfo = await loadTrainingCampLocationInfoFallback(nextCamp)
          nextLocationInfo = fallbackLocationInfo ?? nextLocationInfo
        }

        if (cancelled) return

        setCamp(nextCamp)

        if (rawParticipants.length > 0) {
          const riderIds = Array.from(
            new Set(
              rawParticipants
                .map((participant) => participant.rider_id)
                .filter(Boolean),
            ),
          )

          if (riderIds.length > 0) {
            const { data: riderNameRows, error: riderNameError } = await supabase
              .from('riders')
              .select('id, first_name, last_name, display_name')
              .in('id', riderIds)

            if (cancelled) return

            if (riderNameError) {
              // eslint-disable-next-line no-console
              console.warn('Could not load full rider names:', riderNameError)
              setParticipants(rawParticipants)
            } else {
              const nameByRiderId = new Map(
                ((riderNameRows ?? []) as RiderNameRow[]).map((row) => [
                  row.id,
                  buildFullRiderName(row),
                ]),
              )

              setParticipants(
                rawParticipants.map((participant) => ({
                  ...participant,
                  rider_name:
                    nameByRiderId.get(participant.rider_id) ??
                    participant.rider_name ??
                    'Unknown rider',
                })),
              )
            }
          } else {
            setParticipants(rawParticipants)
          }
        } else {
          setParticipants([])
        }

        setStaff(nextStaff)

        const nextBoostSummary =
          result?.boost_summary ??
          nextCamp?.notes?.staff_boost_summary ??
          null

        setBoostSummary(nextBoostSummary)
        setLocationInfo(nextLocationInfo)

        if (nextCamp?.id) {
          const { data: weatherData, error: weatherError } = await supabase.rpc(
            'training_get_camp_weather',
            {
              p_booking_id: nextCamp.id,
              p_days: 5,
            },
          )

          if (cancelled) return

          if (!weatherError && weatherData) {
            setWeatherInfo(normalizeCampWeather(weatherData))
          } else {
            // eslint-disable-next-line no-console
            console.warn('Failed to load camp weather forecast:', weatherError)
            setWeatherInfo(null)
          }
        }

        if (nextReportsFromRpc.length > 0) {
          setReports(nextReportsFromRpc)
        } else if (nextCamp.id) {
          const { data: reportRows, error: reportError } = await supabase
            .from('training_camp_daily_reports')
            .select(
              'id, booking_id, report_date, day_index, weather_state, session_completed, participants_count, completed_count, missed_count, avg_fatigue_before, avg_fatigue_after, summary_text, payload',
            )
            .eq('booking_id', nextCamp.id)
            .order('report_date', { ascending: true })

          if (reportError) throw reportError
          if (cancelled) return

          setReports((reportRows ?? []) as CampDailyReport[])
        } else {
          setReports([])
        }

        if (!cancelled) {
          setIsLoading(false)
        }
      } catch (error) {
        if (cancelled) return

        // eslint-disable-next-line no-console
        console.error('Failed to load current training camp page data:', error)

        setErrorMessage('Current training camp data could not be loaded.')
        setCamp(null)
        setParticipants([])
        setStaff([])
        setReports([])
        setBoostSummary(null)
        setLocationInfo(null)
        setWeatherInfo(null)
        setCurrentGameDate(null)
        setBookingWindows([])
        setTrainingPlans({})
        setTrainingPlanMessage(null)
        setTrainingPlanError(null)
        setIsLoading(false)
      }
    }

    void loadCurrentCamp()

    return () => {
      cancelled = true
    }
  }, [campId])

  const pageState = useMemo(() => {
    return getStrictCampPageState(camp, currentGameDate, bookingWindows)
  }, [camp, currentGameDate, bookingWindows])

  const shouldShowTrainingProgram =
    pageState === 'prestart' || pageState === 'active'

  const dayOptions = useMemo(() => {
    const total = camp?.duration_days ?? 0
    return Array.from({ length: total }, (_, index) => index + 1)
  }, [camp?.duration_days])

  const visibleParticipants = useMemo(() => {
    if (selectedDay === 'all') return participants
    return participants
  }, [participants, selectedDay])

  const averageGain = useMemo(() => {
    if (visibleParticipants.length === 0) return 0

    const total = visibleParticipants.reduce((sum, rider) => {
      return sum + Number(rider.total_gain ?? rider.daily_gain ?? 0)
    }, 0)

    return total / visibleParticipants.length
  }, [visibleParticipants])

  const todayWeather = weatherInfo?.today ?? null
  const weatherForecast = weatherInfo?.forecast?.slice(0, 5) ?? []

  const planDays = useMemo(() => {
    if (!camp) return []
    return buildNextTrainingPlanDays(camp, weatherInfo, currentGameDate)
  }, [camp, weatherInfo, currentGameDate])

  function updateRiderTrainingPlan(
    riderId: string,
    planDate: string,
    intensity: TrainingPlanIntensity,
  ): void {
    setTrainingPlanMessage(null)
    setTrainingPlanError(null)

    setTrainingPlans((current) => ({
      ...current,
      [riderId]: {
        ...(current[riderId] ?? {}),
        [planDate]: intensity,
      },
    }))
  }

  function updateTeamTrainingPlan(
    planDate: string,
    intensity: TrainingPlanIntensity,
  ): void {
    setTrainingPlanMessage(null)
    setTrainingPlanError(null)

    const nextPlans: Record<string, Record<string, TrainingPlanIntensity>> = {
      ...trainingPlans,
    }

    participants.forEach((rider) => {
      nextPlans[rider.rider_id] = {
        ...(nextPlans[rider.rider_id] ?? {}),
        [planDate]: intensity,
      }
    })

    setTrainingPlans(nextPlans)
  }

  async function saveTrainingPlans(): Promise<void> {
    if (!camp?.id) return

    setIsSavingTrainingPlans(true)
    setTrainingPlanMessage(null)
    setTrainingPlanError(null)

    const plansToSave: TrainingPlanRow[] = []

    participants.forEach((rider) => {
      planDays.forEach((day) => {
        if (day.isLocked) return

        plansToSave.push({
          booking_id: camp.id,
          rider_id: rider.rider_id,
          plan_date: day.date,
          intensity:
            trainingPlans[rider.rider_id]?.[day.date] ??
            getDefaultIntensity(),
        })
      })
    })

    try {
      const { data, error } = await supabase.functions.invoke(
        'set-training-camp-day-plan',
        {
          body: {
            booking_id: camp.id,
            plans: plansToSave,
          },
        },
      )

      if (error) {
        throw new Error(error.message || 'Failed to send a request to the Edge Function')
      }

      const result = data as {
        ok?: boolean
        reason?: string
        message?: string
      } | null

      if (!result?.ok) {
        throw new Error(
          result?.reason ||
            result?.message ||
            'Training plans could not be saved.',
        )
      }

      setTrainingPlanError(null)
      setTrainingPlanMessage('Training plans saved successfully.')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Training plan save failed:', error)

      setTrainingPlanError(
        error instanceof Error
          ? error.message
          : 'Training plans could not be saved.',
      )
    } finally {
      setIsSavingTrainingPlans(false)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow">
          Loading current training camp…
        </div>
      </div>
    )
  }

  if (!camp) {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/training?tab=training-camps')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          ← Back to Training Camps
        </button>

        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 shadow">
          <h2 className="text-lg font-semibold text-slate-900">No current training camp found</h2>
          <p className="mt-2 text-sm text-slate-700">
            {errorMessage || 'There is no active training camp for this club at the moment.'}
          </p>
        </div>
      </div>
    )
  }

  if (camp && pageState === 'booked_notice') {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Booked
          </span>

          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {camp.location_name || 'Training camp'} is booked
          </h2>

          <p className="mt-2 text-sm text-slate-700">
            This training camp is booked, but the full camp interface will only become available
            one in-game day before the camp starts, and only when there is no other active training camp.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-white p-3">
              <div className="text-xs text-slate-500">Location</div>
              <div className="mt-1 font-semibold">{camp.location_name || '—'}</div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-xs text-slate-500">Focus</div>
              <div className="mt-1 font-semibold">{camp.focus_label || 'General'}</div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-xs text-slate-500">Start</div>
              <div className="mt-1 font-semibold">{formatSeasonDate(camp.started_on_game_date)}</div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-xs text-slate-500">Riders booked</div>
              <div className="mt-1 font-semibold">{participants.length}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (camp && pageState === 'hidden') {
    return (
      <div className="w-full space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
          <h2 className="text-lg font-semibold text-slate-900">
            Training camp is no longer visible
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This camp is outside the visible window, or another training camp is currently active.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            ← Back
          </button>

          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {pageState === 'post' ? 'Completed Training Camp' : 'Current Training Camp'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {pageState === 'post'
                ? 'Completed camp summary, rider development, daily reports, and assigned staff support.'
                : 'Active camp progress, rider development, weather, and assigned staff support.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/dashboard/training?tab=training-camps')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Training Camps
        </button>
      </div>

      {/* Camp summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="h-56 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {locationInfo?.image_url ? (
              <img
                src={locationInfo.image_url}
                alt={camp.location_name || 'Training camp location'}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-slate-500">
                <div className="text-5xl font-bold">
                  {(camp.location_name || 'T').slice(0, 1)}
                </div>
                <div className="mt-2 text-sm font-semibold">
                  {camp.location_name || 'Training camp'}
                </div>
                <div className="mt-1 text-xs">
                  {camp.country_code || '—'}
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Location
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {camp.location_name || 'Training camp'}
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Focus: <strong>{camp.focus_label || 'General development'}</strong>
            </p>

            <p className="mt-4 text-sm leading-7 text-slate-700">
              {locationInfo?.long_description ||
                locationInfo?.short_description ||
                'Training camp location prepared for focused rider development and team conditioning.'}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Day</div>
                <div className="mt-1 font-semibold">
                  {camp.current_day ?? '—'} / {camp.duration_days ?? '—'}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Start</div>
                <div className="mt-1 font-semibold">
                  {formatSeasonDate(camp.started_on_game_date)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">End</div>
                <div className="mt-1 font-semibold">
                  {formatSeasonDate(camp.ends_on_game_date)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Status</div>
                <div className="mt-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusPillClasses(camp.status)}`}
                  >
                    {formatLabel(camp.status)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Riders</div>
                <div className="mt-1 font-semibold">
                  {camp.participants_count ?? participants.length}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Staff</div>
                <div className="mt-1 font-semibold">
                  {camp.staff_count ?? staff.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weather */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Weather</h2>
            <p className="mt-1 text-sm text-slate-600">
              Current camp conditions and forecast for planning intensity, rest days, and risk.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsWeatherOpen((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {isWeatherOpen ? 'Hide' : 'Extend'}
          </button>
        </div>

        {isWeatherOpen ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Today
              </div>

              {todayWeather ? (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-3xl">{getWeatherIcon(todayWeather.condition_code)}</div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">
                        {todayWeather.condition}
                      </div>
                      <div className="text-sm text-slate-500">
                        {camp.location_name || 'Camp location'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white p-3">
                      <div className="text-xs text-slate-500">Temp</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {todayWeather.temp_c ?? '—'}°C
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-3">
                      <div className="text-xs text-slate-500">Wind</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {todayWeather.wind_kmh ?? '—'} km/h
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-3">
                      <div className="text-xs text-slate-500">Wet risk</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {todayWeather.wet_weather_chance_pct ?? '—'}%
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  Weather data is not available for this camp yet.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Forecast
              </div>

              {weatherForecast.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  Forecast data is not available yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {weatherForecast.map((day, index) => (
                    <div key={day.date} className="rounded-xl bg-white p-4">
                      <div className="text-xs font-medium text-slate-500">
                        {formatWeatherForecastLabel(day.date, index)}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xl">{getWeatherIcon(day.condition_code)}</span>
                        <span className="font-semibold text-slate-900">{day.condition}</span>
                      </div>

                      <div className="mt-3 text-sm text-slate-700">
                        <div>Temp {day.temp_c}°C</div>
                        <div>Wind {day.wind_kmh} km/h</div>
                        <div>Wet risk {day.wet_weather_chance_pct}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Training program */}
      {shouldShowTrainingProgram ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Training program</h2>
              <p className="mt-1 text-sm text-slate-600">
                Set team or individual training intensity for the next 3 camp days.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsTrainingPlanOpen((value) => !value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              {isTrainingPlanOpen ? 'Hide' : 'Extend'}
            </button>
          </div>

          {isTrainingPlanOpen ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <strong>Important:</strong> training plans can only be changed for the next 3 days.
                A plan for the next training day is editable only until{' '}
                <strong>23:59 on the previous in-game day</strong>.
                After that, it is locked and cannot be changed.
              </div>

              {trainingPlanMessage ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  {trainingPlanMessage}
                </div>
              ) : null}

              {trainingPlanError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {trainingPlanError}
                </div>
              ) : null}

              {planDays.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No editable future camp days are available. The camp may be finished or already on its final day.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    {planDays.map((day) => (
                      <div key={day.date} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{day.label}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatSeasonDate(day.date)}</div>
                          </div>

                          {day.weather ? (
                            <div className="text-right text-xs text-slate-600">
                              <div className="text-xl">{getWeatherIcon(day.weather.condition_code)}</div>
                              <div>{day.weather.condition}</div>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 text-xs text-slate-600">
                          Weather affects skill gain, fatigue, and risk for that day.
                        </div>

                        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Set whole team
                        </label>

                        <select
                          value={getDefaultIntensity()}
                          onChange={(event) =>
                            updateTeamTrainingPlan(day.date, event.target.value as TrainingPlanIntensity)
                          }
                          disabled={day.isLocked}
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {TRAINING_PLAN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Rider</th>
                          <th className="px-4 py-3">Role</th>
                          {planDays.map((day) => (
                            <th key={day.date} className="px-4 py-3">
                              {day.label}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 bg-white">
                        {participants.length === 0 ? (
                          <tr>
                            <td
                              colSpan={2 + planDays.length}
                              className="px-4 py-6 text-slate-500"
                            >
                              No riders assigned to this camp yet.
                            </td>
                          </tr>
                        ) : (
                          participants.map((rider) => (
                            <tr key={rider.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {rider.rider_name || 'Unknown rider'}
                              </td>

                              <td className="px-4 py-3 text-slate-600">
                                {formatLabel(rider.role)}
                              </td>

                              {planDays.map((day) => {
                                const currentIntensity =
                                  trainingPlans[rider.rider_id]?.[day.date] ??
                                  getDefaultIntensity()

                                return (
                                  <td key={`${rider.rider_id}-${day.date}`} className="px-4 py-3">
                                    <select
                                      value={currentIntensity}
                                      onChange={(event) =>
                                        updateRiderTrainingPlan(
                                          rider.rider_id,
                                          day.date,
                                          event.target.value as TrainingPlanIntensity,
                                        )
                                      }
                                      disabled={day.isLocked}
                                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                    >
                                      {TRAINING_PLAN_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>

                                    <div className="mt-1 text-xs text-slate-500">
                                      {getTrainingPlanPreview(currentIntensity)}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Day off and light training are useful when weather is bad or riders need fatigue recovery.
                    </p>

                    <button
                      type="button"
                      onClick={() => void saveTrainingPlans()}
                      disabled={isSavingTrainingPlans || planDays.length === 0}
                      className="rounded-md bg-yellow-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {isSavingTrainingPlans ? 'Saving…' : 'Save training plans'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Rider progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Rider progress</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a day to review training improvements.
            </p>
          </div>

          <select
            value={selectedDay}
            onChange={(event) =>
              setSelectedDay(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All days</option>
            {dayOptions.map((day) => (
              <option key={day} value={day}>
                Day {day}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Average improvement</span>
            <span className="font-semibold text-slate-900">
              +{averageGain.toFixed(1)}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-yellow-400"
              style={{ width: `${Math.min(100, Math.max(0, averageGain * 10))}%` }}
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Daily gain</th>
                <th className="px-4 py-3">Total gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visibleParticipants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    No riders assigned to this camp yet.
                  </td>
                </tr>
              ) : (
                visibleParticipants.map((rider) => (
                  <tr key={rider.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {rider.rider_name || 'Unknown rider'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatLabel(rider.role)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatLabel(rider.status)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatGainValue(rider.daily_gain)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatGainValue(rider.total_gain)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff boost summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Staff boost summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Active support effects from staff assigned to this training camp.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsBoostsOpen((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {isBoostsOpen ? 'Hide' : 'Extend'}
          </button>
        </div>

        {isBoostsOpen ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Recovery bonus</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatBoostValue(boostSummary?.recovery_bonus)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Development bonus</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatBoostValue(boostSummary?.development_bonus_pct, '%')}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Organization</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatBoostValue(boostSummary?.organization_bonus_pct, '%')}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Health risk reduction</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatBoostValue(boostSummary?.health_risk_reduction_pct, '%')}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Mechanical risk reduction</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatBoostValue(boostSummary?.mechanical_risk_reduction_pct, '%')}
                </div>
              </div>
            </div>

            {boostSummary?.boosts && boostSummary.boosts.length > 0 ? (
              <div className="mt-4 space-y-2">
                {boostSummary.boosts.map((boost, index) => (
                  <div
                    key={`${boost.staff_id ?? index}-${boost.role_type ?? 'staff'}`}
                    className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800"
                  >
                    <span className="font-semibold">{boost.staff_name || 'Staff member'}</span>
                    {' · '}
                    {formatLabel(boost.role_type || null)}
                    {' · '}
                    {boost.boost_label || 'Camp support boost'}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                No staff boosts are active for this camp.
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Daily reports */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daily camp reports</h2>
            <p className="mt-1 text-sm text-slate-600">
              Daily session results, missed riders, fatigue movement, and camp status notes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsReportsOpen((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {isReportsOpen ? 'Hide' : 'Extend'}
          </button>
        </div>

        {isReportsOpen ? (
          <div className="mt-4 space-y-3">
            {reports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No daily reports yet. Reports will appear after the camp starts and daily camp processing runs.
              </div>
            ) : (
              reports.map((report) => (
                <div key={report.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Day {report.day_index} · {formatSeasonDate(report.report_date)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Weather: {formatLabel(report.weather_state)} · Session{' '}
                        {report.session_completed ? 'completed' : 'not completed'}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-700">
                        Completed: {report.completed_count}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                        Missed: {report.missed_count}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                        Fatigue {formatFatigueDelta(report.avg_fatigue_before, report.avg_fatigue_after)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-700">
                    {report.summary_text}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Staff & boosts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Camp staff &amp; boosts</h2>
            <p className="mt-1 text-sm text-slate-600">
              Coaches and specialists assigned to this camp and their active boosts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCampStaffOpen((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {isCampStaffOpen ? 'Hide' : 'Extend'}
          </button>
        </div>

        {isCampStaffOpen ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Boost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-slate-500">
                      No staff are assigned to this camp yet.
                    </td>
                  </tr>
                ) : (
                  staff.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {member.staff_name || 'Unknown staff'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatLabel(member.role_type)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {member.boost_label || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}