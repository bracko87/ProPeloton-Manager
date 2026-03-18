'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type TabKey = 'regular' | 'camps'
type CampType = 'general' | 'sprint' | 'climbing' | 'flat' | 'time_trial'
type AvailabilityStatus = 'fit' | 'not_fully_fit' | 'injured' | 'sick'
type WeatherState = 'ideal' | 'good' | 'mixed' | 'poor' | 'unavailable'
type RegionFilter =
  | 'all'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Asia'
  | 'Africa'
  | 'Oceania'
  | 'Middle East'

type CalendarSuitability = 'preferred' | 'risky' | 'unavailable' | 'normal'

type GameDateParts = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
}

type Camp = {
  id: string
  name: string
  country_code: string
  city_name: string
  region_name: string
  camp_type: CampType
  terrain_profile: string
  altitude_category: string
  stars: number
  location_cost_index: number
  training_quality_multiplier: number
  recovery_comfort_bonus: number
  default_intensity: 'light' | 'normal' | 'hard'
  base_accommodation_per_day: number
  base_camp_fee_per_day: number
  preferred_weeks: number[]
  risky_weeks: number[]
  closed_weeks: number[]
  image_url: string | null
  short_description: string
  long_description: string
  best_for_text: string
  weather_note: string
  is_active: boolean
  metadata?: {
    budget_tier?: string
    best_for?: string[]
  } | null
}

type RosterRider = {
  club_id: string
  rider_id: string
  display_name: string
  assigned_role: string | null
  age_years: number | null
  overall: number | null
  country_code: string | null
  availability_status: AvailabilityStatus
  fatigue: number | null
  source_club_name?: string
  team_label?: 'First Team' | 'U23'
}

type CampQuote = {
  camp_id: string
  camp_name: string
  city_name: string
  camp_country_code: string
  camp_region_name: string
  camp_type: CampType
  stars: number
  club_id: string
  club_country_code: string
  club_region_name: string
  participants_count: number
  days_count: number
  weather_state: WeatherState
  weather_score: number
  training_modifier: string | number
  missed_day_chance: number
  travel_per_rider: number
  travel_total: number
  accommodation_total: number
  camp_fee_total: number
  logistics_total: number
  total_cost: number
  per_rider_total: number
  warnings: string[]
}

type BookingValidation = {
  is_valid: boolean
  participants_count: number
  weather_state: WeatherState
  validation_errors: string[]
  validation_warnings: string[]
  blocked_riders?: Array<{
    rider_id: string
    display_name: string | null
    availability_status: AvailabilityStatus | null
    fatigue: number | null
    status_code: string
  }>
}

type BookingResult = {
  booking_id: string
  finance_transaction_id: string
  booking_status: string
  total_cost: number
  participants_count: number
  weather_state: WeatherState
  validation_warnings: string[]
  created_at: string
}

type CurrentCampBooking = {
  id: string
  camp_id: string
  start_date: string
  end_date: string
  status: 'planned' | 'active' | 'completed' | 'cancelled'
  participants_count: number | null
  total_cost: number | null
  city_snapshot: string | null
  country_code_snapshot: string | null
  camp_type_snapshot: string | null
  created_at: string
}

const CAMP_TYPE_LABELS: Record<CampType, string> = {
  general: 'General',
  sprint: 'Sprint',
  climbing: 'Climbing',
  flat: 'Flat',
  time_trial: 'Time Trial'
}

const WEATHER_LABELS: Record<WeatherState, string> = {
  ideal: 'Ideal',
  good: 'Good',
  mixed: 'Mixed',
  poor: 'Poor',
  unavailable: 'Unavailable'
}

const WEATHER_BADGE_STYLES: Record<WeatherState, string> = {
  ideal: 'bg-green-100 text-green-700',
  good: 'bg-emerald-100 text-emerald-700',
  mixed: 'bg-amber-100 text-amber-700',
  poor: 'bg-orange-100 text-orange-700',
  unavailable: 'bg-red-100 text-red-700'
}

const AVAILABILITY_BADGE_STYLES: Record<AvailabilityStatus, string> = {
  fit: 'bg-green-100 text-green-700',
  not_fully_fit: 'bg-amber-100 text-amber-700',
  injured: 'bg-red-100 text-red-700',
  sick: 'bg-purple-100 text-purple-700'
}

const DURATION_OPTIONS = [7, 10, 14] as const

const REGION_OPTIONS: RegionFilter[] = [
  'all',
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Africa',
  'Oceania',
  'Middle East'
]

const CAMP_TYPE_OPTIONS: Array<'all' | CampType> = [
  'all',
  'general',
  'sprint',
  'climbing',
  'flat',
  'time_trial'
]

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CAMPS_PER_PAGE = 8
const GAME_MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

function renderStars(count: number): string {
  return '★'.repeat(Math.max(0, count)) + '☆'.repeat(Math.max(0, 5 - count))
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function titleCaseFromSnake(value: string | null | undefined): string {
  if (!value) return 'Training Camp'
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getCountryRegion(countryCode: string | null | undefined): string {
  const code = (countryCode ?? '').toUpperCase()

  if (
    [
      'AL',
      'AD',
      'AT',
      'BA',
      'BE',
      'BG',
      'BY',
      'CH',
      'CY',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GB',
      'GR',
      'HR',
      'HU',
      'IE',
      'IS',
      'IT',
      'LT',
      'LU',
      'LV',
      'ME',
      'MK',
      'MT',
      'NL',
      'NO',
      'PL',
      'PT',
      'RO',
      'RS',
      'SE',
      'SI',
      'SK',
      'SM',
      'UA'
    ].includes(code)
  ) {
    return 'Europe'
  }

  if (
    ['US', 'CA', 'MX', 'CR', 'CU', 'DO', 'GT', 'HN', 'JM', 'NI', 'PA', 'SV', 'TT'].includes(code)
  ) {
    return 'North America'
  }

  if (['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'PE', 'PY', 'UY', 'VE'].includes(code)) {
    return 'South America'
  }

  if (['DZ', 'EG', 'ET', 'GH', 'KE', 'MA', 'NG', 'RW', 'TN', 'UG', 'ZA'].includes(code)) {
    return 'Africa'
  }

  if (['AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'TR'].includes(code)) {
    return 'Middle East'
  }

  if (['AU', 'NZ'].includes(code)) return 'Oceania'

  if (
    ['CN', 'HK', 'ID', 'IN', 'JP', 'KZ', 'KR', 'MY', 'PH', 'SG', 'TH', 'TW', 'UZ', 'VN'].includes(
      code
    )
  ) {
    return 'Asia'
  }

  return 'Other'
}

function estimateTravelPerRider(
  clubCountryCode: string | null,
  campCountryCode: string,
  campRegionName: string
): number {
  const clubRegion = getCountryRegion(clubCountryCode)

  if ((clubCountryCode ?? '').toUpperCase() === campCountryCode.toUpperCase()) return 80
  if (clubRegion === campRegionName) return 200

  if (
    (clubRegion === 'Europe' && ['Africa', 'Middle East'].includes(campRegionName)) ||
    (campRegionName === 'Europe' && ['Africa', 'Middle East'].includes(clubRegion)) ||
    (clubRegion === 'North America' && campRegionName === 'South America') ||
    (clubRegion === 'South America' && campRegionName === 'North America') ||
    (clubRegion === 'Asia' && campRegionName === 'Middle East') ||
    (clubRegion === 'Middle East' && campRegionName === 'Asia')
  ) {
    return 450
  }

  if (clubRegion === 'Oceania' || campRegionName === 'Oceania') return 1200
  return 850
}

function estimatePerRiderCost(
  camp: Camp,
  clubCountryCode: string | null,
  days: number,
  participantsCount: number
): number {
  const travelPerRider = estimateTravelPerRider(clubCountryCode, camp.country_code, camp.region_name)

  const accommodationPerRider = camp.base_accommodation_per_day * camp.location_cost_index * days
  const campFeePerRider = camp.base_camp_fee_per_day * camp.location_cost_index * days
  const logisticsShare = participantsCount > 0 ? 500 / participantsCount : 0

  return Math.round(travelPerRider + accommodationPerRider + campFeePerRider + logisticsShare)
}

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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function startOfWeekMonday(date: Date): Date {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfWeekSunday(date: Date): Date {
  const start = startOfWeekMonday(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(0, 0, 0, 0)
  return end
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isBeforeDay(a: Date, b: Date): boolean {
  const left = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const right = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return left < right
}

function isAfterDay(a: Date, b: Date): boolean {
  const left = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const right = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return left > right
}

function isDateWithinRange(date: Date, startDateValue: string, endDateValue: string): boolean {
  const start = parseDateString(startDateValue)
  const end = parseDateString(endDateValue)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()

  return target >= startTime && target <= endTime
}

function getCurrentSeasonStartDate(currentGameDateValue: string | null): Date | null {
  if (!currentGameDateValue) return null
  const current = parseDateString(currentGameDateValue)
  return new Date(current.getFullYear(), 0, 1)
}

function getCurrentSeasonEndDate(currentGameDateValue: string | null): Date | null {
  if (!currentGameDateValue) return null
  const current = parseDateString(currentGameDateValue)
  return new Date(current.getFullYear(), 11, 31)
}

function formatGameDateLabel(dateValue: string): string {
  try {
    const selected = parseDateString(dateValue)
    return `${GAME_MONTH_SHORT[selected.getMonth()]} ${selected.getDate()}`
  } catch {
    return dateValue
  }
}

function formatGameMonthLabel(
  monthDate: Date,
  currentGameDateValue: string | null,
  currentSeasonNumber: number | null
): string {
  if (!currentGameDateValue || currentSeasonNumber == null) {
    return `Month ${monthDate.getMonth() + 1}`
  }

  return `Current Season · Month ${monthDate.getMonth() + 1}`
}

function getISOWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getDateSuitability(date: Date, camp: Camp | null): CalendarSuitability {
  if (!camp) return 'normal'
  const week = getISOWeek(date)

  if (toArray(camp.closed_weeks).includes(week)) return 'unavailable'
  if (toArray(camp.preferred_weeks).includes(week)) return 'preferred'
  if (toArray(camp.risky_weeks).includes(week)) return 'risky'
  return 'normal'
}

function getMonthGridDates(monthDate: Date): Date[] {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const gridStart = startOfWeekMonday(monthStart)
  const gridEnd = endOfWeekSunday(monthEnd)

  const days: Date[] = []
  const cursor = new Date(gridStart)

  while (cursor <= gridEnd) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

function getSuitabilityTitle(suitability: CalendarSuitability): string {
  if (suitability === 'preferred') return 'Best period'
  if (suitability === 'risky') return 'Risky weather period'
  if (suitability === 'unavailable') return 'Unavailable period'
  return 'Normal period'
}

function getDayButtonClassName(
  suitability: CalendarSuitability,
  isSelected: boolean,
  isCurrentMonth: boolean
): string {
  if (suitability === 'unavailable') {
    return [
      'bg-red-50 text-red-400',
      isCurrentMonth ? '' : 'opacity-60',
      isSelected ? 'ring-2 ring-red-300' : ''
    ]
      .join(' ')
      .trim()
  }

  if (isSelected) {
    return [
      suitability === 'preferred'
        ? 'bg-green-600 text-white'
        : suitability === 'risky'
          ? 'bg-amber-500 text-white'
          : 'bg-blue-600 text-white',
      'ring-2 ring-blue-200'
    ].join(' ')
  }

  if (suitability === 'preferred') {
    return `bg-green-100 text-green-700 hover:bg-green-200 ${!isCurrentMonth ? 'opacity-70' : ''}`
  }

  if (suitability === 'risky') {
    return `bg-amber-100 text-amber-700 hover:bg-amber-200 ${!isCurrentMonth ? 'opacity-70' : ''}`
  }

  return `${isCurrentMonth ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-50'}`
}

type CampDatePickerProps = {
  value: string
  onChange: (nextValue: string) => void
  camp: Camp | null
  minDate: string | null
  maxDate: string | null
  currentGameDateValue: string | null
  currentSeasonNumber: number | null
  bookings: CurrentCampBooking[]
}

function CampDatePicker({
  value,
  onChange,
  camp,
  minDate,
  maxDate,
  currentGameDateValue,
  currentSeasonNumber,
  bookings
}: CampDatePickerProps): JSX.Element {
  const baseDateValue = value || minDate || currentGameDateValue || '2000-01-01'
  const selectedDate = useMemo(() => parseDateString(baseDateValue), [baseDateValue])

  const minimumDate = useMemo(() => (minDate ? parseDateString(minDate) : null), [minDate])
  const maximumDate = useMemo(() => (maxDate ? parseDateString(maxDate) : null), [maxDate])
  const seasonStartDate = useMemo(
    () => getCurrentSeasonStartDate(currentGameDateValue),
    [currentGameDateValue]
  )
  const seasonEndDate = useMemo(
    () => getCurrentSeasonEndDate(currentGameDateValue),
    [currentGameDateValue]
  )

  const [isOpen, setIsOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selectedDate))
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate))
  }, [selectedDate])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const calendarDays = useMemo(() => getMonthGridDates(viewMonth), [viewMonth])

  const canGoToPreviousMonth = useMemo(() => {
    if (!seasonStartDate) return true
    const previousMonth = addMonths(viewMonth, -1)
    return startOfMonth(previousMonth).getTime() >= startOfMonth(seasonStartDate).getTime()
  }, [viewMonth, seasonStartDate])

  const canGoToNextMonth = useMemo(() => {
    if (!seasonEndDate) return true
    const nextMonth = addMonths(viewMonth, 1)
    return startOfMonth(nextMonth).getTime() <= startOfMonth(seasonEndDate).getTime()
  }, [viewMonth, seasonEndDate])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition hover:border-gray-400 focus:border-blue-500"
      >
        <span>{formatGameDateLabel(baseDateValue)}</span>
        <span className="text-gray-500">📅</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (!canGoToPreviousMonth) return
                setViewMonth(prev => addMonths(prev, -1))
              }}
              disabled={!canGoToPreviousMonth}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ←
            </button>

            <div className="text-sm font-semibold text-gray-900">
              {formatGameMonthLabel(viewMonth, currentGameDateValue, currentSeasonNumber)}
            </div>

            <button
              type="button"
              onClick={() => {
                if (!canGoToNextMonth) return
                setViewMonth(prev => addMonths(prev, 1))
              }}
              disabled={!canGoToNextMonth}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              →
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map(label => (
              <div key={label} className="py-1 text-center text-xs font-medium text-gray-500">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(day => {
              const isSelected = isSameDay(day, selectedDate)
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth()
              const suitability = getDateSuitability(day, camp)
              const isBeforeMinimum = minimumDate != null ? isBeforeDay(day, minimumDate) : false
              const isAfterMaximum = maximumDate != null ? isAfterDay(day, maximumDate) : false
              const isUnavailable = suitability === 'unavailable'
              const isDisabled = isUnavailable || isBeforeMinimum || isAfterMaximum
              const isBookedPeriod = bookings.some(booking =>
                isDateWithinRange(day, booking.start_date, booking.end_date)
              )

              return (
                <button
                  key={toDateString(day)}
                  type="button"
                  disabled={isDisabled}
                  title={
                    isBeforeMinimum
                      ? 'Past in-game date'
                      : isAfterMaximum
                        ? 'Outside current season'
                        : getSuitabilityTitle(suitability)
                  }
                  onClick={() => {
                    if (isDisabled) return
                    onChange(toDateString(day))
                    setIsOpen(false)
                  }}
                  className={`flex h-10 items-center justify-center rounded-lg text-sm transition ${getDayButtonClassName(
                    suitability,
                    isSelected,
                    isCurrentMonth
                  )} ${isBookedPeriod ? 'ring-2 ring-blue-200' : ''} ${
                    isDisabled ? 'cursor-not-allowed opacity-70' : ''
                  }`}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-green-100 ring-1 ring-green-200" />
              <span>Best period</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-100 ring-1 ring-amber-200" />
              <span>Risky period</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-100 ring-1 ring-red-200" />
              <span>Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-gray-100 ring-1 ring-gray-200" />
              <span>Normal</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-white ring-2 ring-blue-200" />
              <span>Existing camp booking</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function isClubLevelActiveCampOnlyError(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return normalized === 'club already has a planned or active training camp.'
}

export default function TrainingPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('camps')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [clubCountryCode, setClubCountryCode] = useState<string | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [currentGameDateParts, setCurrentGameDateParts] = useState<GameDateParts | null>(null)
  const [camps, setCamps] = useState<Camp[]>([])
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterRider[]>([])

  const [days, setDays] = useState<number>(7)
  const [startDate, setStartDate] = useState<string>('')
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all')
  const [campTypeFilter, setCampTypeFilter] = useState<'all' | CampType>('all')
  const [maxPerRiderFilter, setMaxPerRiderFilter] = useState<number>(2500)
  const [currentPage, setCurrentPage] = useState<number>(1)

  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quote, setQuote] = useState<CampQuote | null>(null)
  const [validation, setValidation] = useState<BookingValidation | null>(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [showAssignedRidersModal, setShowAssignedRidersModal] = useState(false)
  const [currentCampParticipantIds, setCurrentCampParticipantIds] = useState<string[]>([])
  const [cancelLoading, setCancelLoading] = useState(false)
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null)
  const [currentCampBooking, setCurrentCampBooking] = useState<CurrentCampBooking | null>(null)
  const [clubBookings, setClubBookings] = useState<CurrentCampBooking[]>([])
  const [overlapBlockedRiders, setOverlapBlockedRiders] = useState<
    NonNullable<BookingValidation['blocked_riders']>
  >([])

  const selectedCamp = useMemo(
    () => camps.find(camp => camp.id === selectedCampId) ?? null,
    [camps, selectedCampId]
  )

  const currentSeasonEndDateValue = useMemo(() => {
    if (!currentGameDate) return null
    const current = parseDateString(currentGameDate)
    return toDateString(new Date(current.getFullYear(), 11, 31))
  }, [currentGameDate])

  const selectableRoster = useMemo(
    () =>
      roster.filter(
        rider =>
          rider.availability_status === 'fit' ||
          rider.availability_status === 'not_fully_fit' ||
          rider.availability_status === 'injured' ||
          rider.availability_status === 'sick'
      ),
    [roster]
  )

  const overlapBlockedRiderMap = useMemo(
    () =>
      new Map(
        overlapBlockedRiders.map(blocked => [
          blocked.rider_id,
          blocked
        ])
      ),
    [overlapBlockedRiders]
  )

  const validationErrors = useMemo(
    () => toArray(validation?.validation_errors),
    [validation?.validation_errors]
  )

  const filteredValidationErrors = useMemo(
    () => validationErrors.filter(message => !isClubLevelActiveCampOnlyError(message)),
    [validationErrors]
  )

  const hasSelectedOverlapBlockedRider = useMemo(
    () => selectedRiderIds.some(riderId => overlapBlockedRiderMap.has(riderId)),
    [selectedRiderIds, overlapBlockedRiderMap]
  )

  const isBookingAllowedWithAvailableRiders =
    filteredValidationErrors.length === 0 &&
    !hasSelectedOverlapBlockedRider &&
    selectedRiderIds.length >= 5

  const canSubmitBooking =
    Boolean(selectedCampId) &&
    !bookingLoading &&
    Boolean(validation?.is_valid || isBookingAllowedWithAvailableRiders)

  const currentCampParticipants = useMemo(() => {
    return roster.filter(rider => currentCampParticipantIds.includes(rider.rider_id))
  }, [roster, currentCampParticipantIds])

  const filteredCamps = useMemo(() => {
    const selectedCount = Math.max(selectedRiderIds.length, 5)

    return camps.filter(camp => {
      const matchesRegion = regionFilter === 'all' || camp.region_name === regionFilter
      const matchesType = campTypeFilter === 'all' || camp.camp_type === campTypeFilter

      const estimatedPerRider = estimatePerRiderCost(camp, clubCountryCode, days, selectedCount)
      const matchesCost = estimatedPerRider <= maxPerRiderFilter

      return matchesRegion && matchesType && matchesCost
    })
  }, [
    camps,
    regionFilter,
    campTypeFilter,
    maxPerRiderFilter,
    clubCountryCode,
    days,
    selectedRiderIds.length
  ])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCamps.length / CAMPS_PER_PAGE)),
    [filteredCamps.length]
  )

  const pagedCamps = useMemo(() => {
    const startIndex = (currentPage - 1) * CAMPS_PER_PAGE
    return filteredCamps.slice(startIndex, startIndex + CAMPS_PER_PAGE)
  }, [filteredCamps, currentPage])

  async function loadCurrentCampBooking(nextClubId: string): Promise<void> {
    const { data, error } = await supabase
      .from('training_camp_bookings')
      .select(
        'id, camp_id, start_date, end_date, status, participants_count, total_cost, city_snapshot, country_code_snapshot, camp_type_snapshot, created_at'
      )
      .eq('club_id', nextClubId)
      .in('status', ['planned', 'active'])
      .order('start_date', { ascending: true })

    if (error) throw error

    const bookings = (data ?? []) as CurrentCampBooking[]
    setClubBookings(bookings)

    const activeBooking = bookings.find(booking => booking.status === 'active') ?? null
    const plannedBooking = bookings.find(booking => booking.status === 'planned') ?? null
    setCurrentCampBooking(activeBooking ?? plannedBooking ?? bookings[0] ?? null)
  }

  async function loadCurrentCampParticipants(bookingId: string): Promise<void> {
    const { data, error } = await supabase
      .from('training_camp_participants')
      .select('rider_id')
      .eq('booking_id', bookingId)

    if (error) throw error

    setCurrentCampParticipantIds((data ?? []).map((row: { rider_id: string }) => row.rider_id))
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [regionFilter, campTypeFilter, maxPerRiderFilter])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (filteredCamps.length === 0) {
      setSelectedCampId(null)
      return
    }

    if (!selectedCampId || !filteredCamps.some(camp => camp.id === selectedCampId)) {
      setSelectedCampId(filteredCamps[0].id)
    }
  }, [filteredCamps, selectedCampId])

  useEffect(() => {
    const validIds = selectableRoster
      .filter(rider => !overlapBlockedRiderMap.has(rider.rider_id))
      .map(rider => rider.rider_id)

    setSelectedRiderIds(current => {
      const kept = current.filter(id => validIds.includes(id))
      const fill = validIds
        .filter(id => !kept.includes(id))
        .slice(0, Math.max(0, 5 - kept.length))

      const next = [...kept, ...fill]

      return arraysEqual(current, next) ? current : next
    })
  }, [selectableRoster, overlapBlockedRiderMap])

  useEffect(() => {
    setOverlapBlockedRiders([])
  }, [clubId, selectedCampId, startDate, days])

  useEffect(() => {
    let cancelled = false

    async function loadPage(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const { data: myClubId, error: clubError } = await supabase.rpc('get_my_primary_club_id')
        if (clubError) throw clubError
        if (!myClubId) {
          throw new Error('No club was found for the logged-in user.')
        }

        const familyRes = await supabase.rpc('get_club_family_ids', {
          p_club_id: myClubId
        })

        if (familyRes.error) throw familyRes.error

        const familyClubs = (familyRes.data ?? []) as Array<{
          club_id: string
          club_name: string
          team_label: 'First Team' | 'U23'
        }>

        const familyClubIds = familyClubs.map(row => row.club_id)
        const familyClubMap = new Map(
          familyClubs.map(row => [
            row.club_id,
            { club_name: row.club_name, team_label: row.team_label }
          ])
        )

        const [gameDateRes, gameDatePartsRes] = await Promise.all([
          supabase.rpc('get_current_game_date_date'),
          supabase.rpc('get_current_game_date_parts')
        ])

        if (gameDateRes.error) throw gameDateRes.error
        if (gameDatePartsRes.error) throw gameDatePartsRes.error

        const { data: clubRow, error: clubRowError } = await supabase
          .from('clubs')
          .select('country_code')
          .eq('id', myClubId)
          .single()

        if (clubRowError) throw clubRowError

        const [campRes, rosterRes] = await Promise.all([
          supabase
            .from('training_camp_catalog')
            .select('*')
            .eq('is_active', true)
            .order('country_code', { ascending: true })
            .order('city_name', { ascending: true }),
          supabase
            .from('club_roster')
            .select(
              'club_id, rider_id, display_name, assigned_role, age_years, overall, country_code, availability_status, fatigue'
            )
            .in('club_id', familyClubIds)
            .order('overall', { ascending: false })
        ])

        if (campRes.error) throw campRes.error
        if (rosterRes.error) throw rosterRes.error

        if (cancelled) return

        const loadedCamps = (campRes.data ?? []) as Camp[]
        const loadedRoster = ((rosterRes.data ?? []) as RosterRider[])
          .map(rider => {
            const source = familyClubMap.get(rider.club_id)

            return {
              ...rider,
              source_club_name: source?.club_name ?? 'Unknown Team',
              team_label: (source?.team_label ?? 'First Team') as 'First Team' | 'U23'
            }
          })
          .sort((a, b) => {
            const aPriority = a.team_label === 'U23' ? 1 : 0
            const bPriority = b.team_label === 'U23' ? 1 : 0
            if (aPriority !== bPriority) return aPriority - bPriority
            return (b.overall ?? 0) - (a.overall ?? 0)
          })

        const nextGameDate = String(gameDateRes.data ?? '')
        const nextGameDateParts = Array.isArray(gameDatePartsRes.data)
          ? ((gameDatePartsRes.data[0] as GameDateParts | undefined) ?? null)
          : (gameDatePartsRes.data as GameDateParts | null)

        setClubId(myClubId as string)
        setClubCountryCode(clubRow.country_code ?? null)
        setCurrentGameDate(nextGameDate || null)
        setCurrentGameDateParts(nextGameDateParts)
        setCamps(loadedCamps)
        setSelectedCampId(prev => prev ?? loadedCamps[0]?.id ?? null)
        setRoster(loadedRoster)
        setSelectedRiderIds(
          loadedRoster
            .filter(
              rider =>
                rider.availability_status === 'fit' ||
                rider.availability_status === 'not_fully_fit' ||
                rider.availability_status === 'injured' ||
                rider.availability_status === 'sick'
            )
            .slice(0, 5)
            .map(rider => rider.rider_id)
        )
        setStartDate(prev => prev || nextGameDate)

        await loadCurrentCampBooking(myClubId as string)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load training page.'
          setError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPage()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function refreshQuoteAndValidation(): Promise<void> {
      if (!clubId || !selectedCampId || !startDate) {
        setQuote(null)
        setValidation(null)
        return
      }

      setQuoteLoading(true)
      setBookingResult(null)

      try {
        const riderIds = [...new Set(selectedRiderIds)]

        const [quoteRes, validationRes] = await Promise.all([
          supabase.rpc('get_training_camp_quote', {
            p_club_id: clubId,
            p_camp_id: selectedCampId,
            p_start_date: startDate,
            p_days: days,
            p_rider_ids: riderIds
          }),
          supabase.rpc('validate_training_camp_booking', {
            p_club_id: clubId,
            p_camp_id: selectedCampId,
            p_start_date: startDate,
            p_days: days,
            p_rider_ids: riderIds
          })
        ])

        if (quoteRes.error) throw quoteRes.error
        if (validationRes.error) throw validationRes.error
        if (cancelled) return

        const nextQuote = (quoteRes.data?.[0] ?? null) as CampQuote | null
        const nextValidation = (validationRes.data?.[0] ?? null) as BookingValidation | null
        const nextOverlapBlockedRiders = toArray(nextValidation?.blocked_riders).filter(
          rider => rider.status_code === 'already_in_overlapping_camp'
        )

        setQuote(nextQuote)
        setValidation(nextValidation)

        setOverlapBlockedRiders(current => {
          const currentIds = current.map(r => `${r.rider_id}:${r.status_code}`).sort()
          const nextIds = nextOverlapBlockedRiders.map(r => `${r.rider_id}:${r.status_code}`).sort()

          if (arraysEqual(currentIds, nextIds)) {
            return current
          }

          return nextOverlapBlockedRiders
        })
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to calculate training camp quote.'
          setError(message)
          setQuote(null)
          setValidation(null)
        }
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }

    void refreshQuoteAndValidation()

    return () => {
      cancelled = true
    }
  }, [clubId, selectedCampId, startDate, days, selectedRiderIds])

  async function handleDebugBooking(): Promise<void> {
    if (!clubId || !selectedCampId) return

    setBookingLoading(true)
    setError(null)
    setBookingResult(null)

    try {
      const riderIds = [...new Set(selectedRiderIds)]
      const idempotencyKey = `training-camp-${selectedCampId}-${startDate}-${days}-${Date.now()}`

      const { data, error: rpcError } = await supabase.rpc('finance_book_training_camp_debug', {
        p_club_id: clubId,
        p_camp_id: selectedCampId,
        p_start_date: startDate,
        p_days: days,
        p_rider_ids: riderIds,
        p_idempotency_key: idempotencyKey
      })

      if (rpcError) {
        throw new Error(rpcError.message || 'Training camp booking failed.')
      }

      const debugResult = data as
        | {
            ok: boolean
            message?: string
            booking_id?: string
            finance_transaction_id?: string
            booking_status?: string
            total_cost?: number
            participants_count?: number
            weather_state?: WeatherState
            validation_warnings?: string[]
            created_at?: string
          }
        | null

      if (!debugResult) {
        throw new Error('Training camp debug response was empty.')
      }

      if (!debugResult.ok) {
        throw new Error(debugResult.message || 'Training camp booking failed.')
      }

      setBookingResult({
        booking_id: debugResult.booking_id ?? '',
        finance_transaction_id: debugResult.finance_transaction_id ?? '',
        booking_status: debugResult.booking_status ?? 'planned',
        total_cost: debugResult.total_cost ?? 0,
        participants_count: debugResult.participants_count ?? 0,
        weather_state: (debugResult.weather_state ?? 'good') as WeatherState,
        validation_warnings: debugResult.validation_warnings ?? [],
        created_at: debugResult.created_at ?? new Date().toISOString()
      })

      await loadCurrentCampBooking(clubId)
      setOverlapBlockedRiders([])

      const validationRes = await supabase.rpc('validate_training_camp_booking', {
        p_club_id: clubId,
        p_camp_id: selectedCampId,
        p_start_date: startDate,
        p_days: days,
        p_rider_ids: riderIds
      })

      if (!validationRes.error) {
        setValidation((validationRes.data?.[0] ?? null) as BookingValidation | null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Training camp booking failed.'
      setError(message)
    } finally {
      setBookingLoading(false)
    }
  }

  async function handleCancelCamp(): Promise<void> {
    if (!currentCampBooking || !clubId) return

    setCancelLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.rpc('cancel_training_camp_booking_debug', {
        p_booking_id: currentCampBooking.id
      })

      if (error) {
        console.error('cancel_training_camp_booking_debug error raw:', error)
        console.error(
          'cancel_training_camp_booking_debug error json:',
          JSON.stringify(error, null, 2)
        )

        const fullMessage = [error.message, (error as any).details, (error as any).hint]
          .filter(Boolean)
          .join(' — ')

        throw new Error(fullMessage || 'Failed to cancel training camp.')
      }

      const debugResult = data as
        | {
            ok: boolean
            message?: string
            result?: {
              ok?: boolean
              refund_amount?: number
            }
          }
        | null

      if (!debugResult) {
        throw new Error('Cancel debug response was empty.')
      }

      if (!debugResult.ok) {
        throw new Error(debugResult.message || 'Failed to cancel training camp.')
      }

      if (debugResult.result?.ok !== true) {
        throw new Error('Failed to cancel training camp.')
      }

      await loadCurrentCampBooking(clubId)
      setCurrentCampParticipantIds([])
      setShowAssignedRidersModal(false)
      setBookingResult(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to cancel training camp.'
      setError(message)
    } finally {
      setCancelLoading(false)
    }
  }

  function toggleRider(riderId: string): void {
    if (overlapBlockedRiderMap.has(riderId)) return

    setSelectedRiderIds(current => {
      if (current.includes(riderId)) {
        return current.filter(id => id !== riderId)
      }
      return [...current, riderId]
    })
  }

  if (loading) {
    return <div className="w-full text-sm text-gray-600">Loading training page…</div>
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Training</h2>
          <p className="mt-1 text-sm text-gray-600">
            Training Camps are live first. Regular Training stays as the next phase.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {bookingResult ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Booking created successfully. Booking ID:{' '}
          <span className="font-medium">{bookingResult.booking_id}</span>
        </div>
      ) : null}

      {currentCampBooking ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Current / Planned Training Camp
              </h3>
              <p className="mt-1 text-sm text-gray-700">
                {currentCampBooking.city_snapshot ?? 'Training Camp'} ·{' '}
                {titleCaseFromSnake(currentCampBooking.camp_type_snapshot)}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {formatGameDateLabel(currentCampBooking.start_date)} →{' '}
                {formatGameDateLabel(currentCampBooking.end_date)}
              </p>
              {currentGameDateParts?.season_number != null ? (
                <p className="mt-1 text-xs text-gray-500">
                  Season {currentGameDateParts.season_number}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  currentCampBooking.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {currentCampBooking.status}
              </span>

              <button
                type="button"
                onClick={async () => {
                  if (!currentCampBooking) return
                  await loadCurrentCampParticipants(currentCampBooking.id)
                  setShowAssignedRidersModal(true)
                }}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Riders: {currentCampBooking.participants_count ?? 0}
              </button>

              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700">
                {formatCurrency(currentCampBooking.total_cost ?? 0)}
              </span>

              <button
                type="button"
                onClick={() => void handleCancelCamp()}
                disabled={cancelLoading}
                className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLoading ? 'Cancelling…' : 'Cancel Camp'}
              </button>
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            Existing camp dates are outlined in blue in the date picker. Overlap is enforced per
            rider during validation and booking, so another camp in the same period can still be
            planned if riders do not conflict.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">
            Current / Planned Training Camp
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            No planned or active training camp yet. Pick a camp, choose riders, and book it.
          </p>
        </div>
      )}

      <div className="border-b border-gray-200 pb-4">
        <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('regular')}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
              activeTab === 'regular'
                ? 'bg-yellow-400 text-black shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Regular Training
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('camps')}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
              activeTab === 'camps'
                ? 'bg-yellow-400 text-black shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Training Camps
          </button>
        </div>
      </div>

      {activeTab === 'regular' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Regular Training</h3>
          <p className="mt-2 text-sm text-gray-600">
            This stays intentionally light for now. Training Camps are the first live training
            system, while regular weekly training will come after the long-term skill progression
            processor is ready.
          </p>
        </div>
      ) : null}

      {activeTab === 'camps' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1.5fr]">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Region</span>
                  <select
                    value={regionFilter}
                    onChange={event => setRegionFilter(event.target.value as RegionFilter)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {REGION_OPTIONS.map(region => (
                      <option key={region} value={region}>
                        {region === 'all' ? 'All regions' : region}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Camp type</span>
                  <select
                    value={campTypeFilter}
                    onChange={event => setCampTypeFilter(event.target.value as 'all' | CampType)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {CAMP_TYPE_OPTIONS.map(type => (
                      <option key={type} value={type}>
                        {type === 'all' ? 'All types' : CAMP_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    Max cost / rider: {formatCurrency(maxPerRiderFilter)}
                  </span>
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={maxPerRiderFilter}
                    onChange={event => setMaxPerRiderFilter(Number(event.target.value))}
                    className="mt-3 w-full"
                  />
                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>$500</span>
                    <span>$5,000</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Available Camps</h3>
                <span className="text-xs text-gray-500">
                  {filteredCamps.length} offers · Page {currentPage}/{totalPages}
                </span>
              </div>

              <div className="space-y-4">
                {pagedCamps.map(camp => {
                  const isSelected = camp.id === selectedCampId
                  return (
                    <button
                      key={camp.id}
                      type="button"
                      onClick={() => setSelectedCampId(camp.id)}
                      className={`w-full overflow-hidden rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-blue-400 ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                        <div className="h-40 bg-gray-100">
                          {camp.image_url ? (
                            <img
                              src={camp.image_url}
                              alt={camp.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-sm text-slate-500">
                              No image yet
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-gray-900">{camp.name}</h4>
                              <p className="text-sm text-gray-500">
                                {camp.city_name}, {camp.country_code} ·{' '}
                                {CAMP_TYPE_LABELS[camp.camp_type]}
                              </p>
                            </div>
                            <span className="text-sm font-medium text-amber-600">
                              {renderStars(camp.stars)}
                            </span>
                          </div>

                          <p className="mt-3 text-sm text-gray-600">{camp.short_description}</p>

                          <div className="mt-3 text-sm font-medium text-gray-900">
                            From{' '}
                            {formatCurrency(
                              estimatePerRiderCost(
                                camp,
                                clubCountryCode,
                                days,
                                Math.max(selectedRiderIds.length, 5)
                              )
                            )}{' '}
                            / rider
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                              Best for: {camp.best_for_text || CAMP_TYPE_LABELS[camp.camp_type]}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                              {camp.metadata?.budget_tier ?? 'standard'}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                              {camp.terrain_profile}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {filteredCamps.length > CAMPS_PER_PAGE ? (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`h-9 min-w-9 rounded-lg px-3 text-sm font-medium ${
                          page === currentPage
                            ? 'bg-yellow-400 text-black'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="h-52 overflow-hidden rounded-t-xl bg-gray-100">
                {selectedCamp?.image_url ? (
                  <img
                    src={selectedCamp.image_url}
                    alt={selectedCamp.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-sm text-slate-500">
                    Camp image placeholder
                  </div>
                )}
              </div>

              {selectedCamp ? (
                <div className="space-y-4 overflow-visible p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{selectedCamp.name}</h3>
                      <p className="text-sm text-gray-500">
                        {selectedCamp.city_name}, {selectedCamp.country_code} ·{' '}
                        {selectedCamp.region_name}
                      </p>
                    </div>
                    <div className="text-right text-sm text-amber-600">
                      <div className="font-medium">{renderStars(selectedCamp.stars)}</div>
                      <div className="text-xs text-gray-500">
                        {CAMP_TYPE_LABELS[selectedCamp.camp_type]}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700">{selectedCamp.long_description}</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Best for
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{selectedCamp.best_for_text}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Weather note
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{selectedCamp.weather_note}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Start date
                      </span>
                      <CampDatePicker
                        value={startDate}
                        onChange={setStartDate}
                        camp={selectedCamp}
                        minDate={currentGameDate}
                        maxDate={currentSeasonEndDateValue}
                        currentGameDateValue={currentGameDate}
                        currentSeasonNumber={currentGameDateParts?.season_number ?? null}
                        bookings={clubBookings}
                      />
                      {startDate ? (
                        <div className="mt-2 text-xs text-gray-500">
                          {formatGameDateLabel(startDate)}
                        </div>
                      ) : null}
                      {currentGameDateParts?.season_number != null ? (
                        <div className="mt-1 text-xs text-gray-500">
                          Season {currentGameDateParts.season_number}
                        </div>
                      ) : null}
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Duration
                      </span>
                      <select
                        value={days}
                        onChange={event => setDays(Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        {DURATION_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option} days
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="p-5 text-sm text-gray-500">
                  No camp matches the current filters.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Rider Selection</h3>
                <span className="text-xs text-gray-500">Minimum 5 riders</span>
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {selectableRoster.map(rider => {
                  const isSelected = selectedRiderIds.includes(rider.rider_id)
                  const overlapBlocked = overlapBlockedRiderMap.get(rider.rider_id)
                  const isDisabled = Boolean(overlapBlocked)

                  return (
                    <label
                      key={rider.rider_id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                      } ${isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleRider(rider.rider_id)}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900">
                              {rider.display_name}
                            </div>

                            {rider.team_label === 'U23' ? (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                U23
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                First Team
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            {rider.source_club_name} · OVR {rider.overall ?? '-'} · Fatigue{' '}
                            {rider.fatigue ?? 0}
                          </div>

                          {overlapBlocked ? (
                            <div className="text-[11px] text-red-600">
                              Unavailable for this date range: already in an overlapping camp.
                            </div>
                          ) : null}

                          {['injured', 'sick'].includes(rider.availability_status) ? (
                            <div className="text-[11px] text-amber-600">
                              Can attend camp, but will not train until recovered.
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${AVAILABILITY_BADGE_STYLES[rider.availability_status]}`}
                      >
                        {rider.availability_status.replaceAll('_', ' ')}
                      </span>
                    </label>
                  )
                })}
              </div>

              {overlapBlockedRiders.length > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Some riders are unavailable for the selected date range because they are already
                  assigned to an overlapping training camp.
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Quote & Booking</h3>
                {quote?.weather_state ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${WEATHER_BADGE_STYLES[quote.weather_state]}`}
                  >
                    {WEATHER_LABELS[quote.weather_state]}
                  </span>
                ) : null}
              </div>

              {quoteLoading ? (
                <div className="text-sm text-gray-600">Calculating quote…</div>
              ) : quote ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Participants</div>
                      <div>{quote.participants_count}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Per rider</div>
                      <div>{formatCurrency(quote.per_rider_total)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Travel total</div>
                      <div>{formatCurrency(quote.travel_total)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Accommodation</div>
                      <div>{formatCurrency(quote.accommodation_total)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Camp fee</div>
                      <div>{formatCurrency(quote.camp_fee_total)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium">Logistics</div>
                      <div>{formatCurrency(quote.logistics_total)}</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 px-4 py-3">
                    <div className="text-sm text-gray-500">Total camp cost</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(quote.total_cost)}
                    </div>
                  </div>

                  {filteredValidationErrors.length > 0 ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <div className="font-medium">Booking blocked</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {filteredValidationErrors.map(message => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {toArray(validation?.validation_warnings).length > 0 ||
                  toArray(quote.warnings).length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      <div className="font-medium">Warnings</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {toArray(validation?.validation_warnings).map(message => (
                          <li key={`validation-${message}`}>{message}</li>
                        ))}
                        {toArray(quote.warnings).map(message => (
                          <li key={`quote-${message}`}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleDebugBooking()}
                    disabled={!canSubmitBooking}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {bookingLoading ? 'Booking Training Camp…' : 'Book Training Camp'}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  Pick a camp and riders to see the quote.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showAssignedRidersModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Assigned Riders</h3>
              <button
                type="button"
                onClick={() => setShowAssignedRidersModal(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {currentCampParticipants.length === 0 ? (
                <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                  No assigned riders found.
                </div>
              ) : (
                currentCampParticipants.map(rider => (
                  <div
                    key={rider.rider_id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {rider.display_name}
                        </span>

                        {rider.team_label === 'U23' ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            U23
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                            First Team
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-500">
                        {rider.source_club_name} · OVR {rider.overall ?? '-'} · Fatigue{' '}
                        {rider.fatigue ?? 0}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        AVAILABILITY_BADGE_STYLES[rider.availability_status]
                      }`}
                    >
                      {rider.availability_status.replaceAll('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}