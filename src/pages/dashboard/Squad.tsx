/**
 * src/pages/dashboard/Squad.tsx
 *
 * First Squad page (dashboard/squad)
 *
 * Purpose:
 * - Render the First Squad roster, widgets and modals.
 * - Keep live roster loading from public.club_roster via the shared Supabase client.
 * - Provide top navigation to switch between squad-related pages (navigates routes).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'

/**
 * RiderRole
 * Small enum-like union describing rider roles used in the UI.
 */
type RiderRole =
  | 'Leader'
  | 'Sprinter'
  | 'Climber'
  | 'TT'
  | 'Domestique'
  | 'Breakaway'
  | 'All-rounder'

/**
 * MoraleUiLabel
 * UI-only morale labels. Backend still stores morale as 0..100.
 */
type MoraleUiLabel = 'Bad' | 'Low' | 'Okay' | 'Good' | 'Great'

/**
 * RiderAvailabilityStatus
 * UI-only rider availability / fitness status.
 *
 * NOTE:
 * - This is intentionally UI-only for now.
 * - Backend logic can be wired later without changing the components below.
 */
type RiderAvailabilityStatus = 'fit' | 'not_fully_fit' | 'injured'

/**
 * ClubRosterRow
 * Minimal shape of a row returned from public.club_roster.
 */
type ClubRosterRow = {
  club_id: string
  rider_id: string
  display_name: string
  country_code: string
  assigned_role: RiderRole
  age_years: number
  overall: number
  birth_date?: string | null
}

/**
 * RiderDetails
 * Detailed rider object loaded from public.riders.
 */
type RiderDetails = {
  id: string
  country_code: string
  first_name: string
  last_name: string
  display_name: string
  role: RiderRole
  sprint: number
  climbing: number
  time_trial: number
  endurance: number
  flat: number
  recovery: number
  resistance: number
  race_iq: number
  teamwork: number
  morale: number
  potential: number
  overall: number
  birth_date: string
  image_url?: string | null
  salary?: number | null
  contract_expires_at?: string | null
  contract_expires_season?: number | null
  market_value?: number | null
  asking_price?: number | null
  asking_price_manual?: boolean | null
  availability_status?: RiderAvailabilityStatus | null
}

/**
 * ContractRenewalNegotiation
 * Exact negotiation payload used by the styled renewal modal.
 */
type ContractRenewalNegotiation = {
  negotiation_id: string
  rider_id: string
  club_id: string
  current_salary_weekly: number
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  current_contract_end_season: number
  current_contract_expires_at?: string | null
  requested_extension_seasons: number
  proposed_new_end_season: number
  attempt_count: number
  max_attempts: number
}

/**
 * RenewalNegotiationData
 * UI data used by the renewal modal.
 */
type RenewalNegotiationData = {
  negotiation_id: string
  rider_id: string
  club_id: string
  current_salary_weekly: number
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  current_contract_end_season: number
  requested_extension_seasons: number
  current_contract_expires_at?: string | null
  attempt_count: number
  max_attempts: number
  cooldown_until?: string | null
}

/**
 * ChartPoint
 * Simple shape for small chart helpers used in the page widgets.
 */
type ChartPoint = {
  label: string
  value: number
}

/**
 * getCountryName
 * Return a localized country display name from a 2-letter code.
 */
function getCountryName(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase()

  if (!code) return 'Unknown'

  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * getFlagImageUrl
 * Helper to return a 24x18 flag image URL using flagcdn.
 */
function getFlagImageUrl(countryCode?: string) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return `https://flagcdn.com/24x18/${code}.png`
}

/**
 * CountryFlag
 * Small component that renders a country flag or a fallback box.
 */
function CountryFlag({
  countryCode,
  className = 'h-4 w-5 rounded-sm object-cover',
}: {
  countryCode?: string
  className?: string
}) {
  const src = getFlagImageUrl(countryCode)
  const countryName = getCountryName(countryCode)
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return <div className={`${className} bg-gray-200`} />
  }

  return (
    <img
      src={src}
      alt={`${countryName} flag`}
      title={countryName}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

/**
 * extractIsoDatePrefix
 * Extract YYYY-MM-DD from a plain date or timestamp-like value.
 *
 * Supports:
 * - 2001-01-13
 * - 2001-01-13T00:00:00Z
 * - 2001-01-13 00:00:00+00
 */
function extractIsoDatePrefix(value?: string | null) {
  if (!value) return null

  const match = String(value).trim().match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null

  return `${match[1]}-${match[2]}-${match[3]}`
}

function toIntegerLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }

  return null
}

function buildGameDateFromSeasonParts(
  seasonNumberValue: unknown,
  monthNumberValue: unknown,
  dayNumberValue: unknown
): string | null {
  const seasonNumber = toIntegerLike(seasonNumberValue)
  const monthNumber = toIntegerLike(monthNumberValue)
  const dayNumber = toIntegerLike(dayNumberValue)

  if (
    seasonNumber === null ||
    monthNumber === null ||
    dayNumber === null ||
    seasonNumber < 1 ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31
  ) {
    return null
  }

  /**
   * Backend mapping:
   * - season 1 => year 2000
   * - season 2 => year 2001
   * Therefore the year offset must be 1999 + seasonNumber.
   */
  const year = 1999 + seasonNumber
  const date = new Date(Date.UTC(year, monthNumber - 1, dayNumber))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayNumber
  ) {
    return null
  }

  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
}

/**
 * normalizeGameDateValue
 * Normalize the response from get_current_game_date() into YYYY-MM-DD or null.
 *
 * Handles common Supabase RPC shapes:
 * - "2001-01-13"
 * - "2001-01-13 00:00:00+00"
 * - { current_game_date: "2001-01-13" }
 * - { get_current_game_date: "2001-01-13" }
 * - [{ current_game_date: "2001-01-13" }]
 * - { season_number: 2, month_number: 12, day_number: 31 }
 */
function normalizeGameDateValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return extractIsoDatePrefix(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = normalizeGameDateValue(item)
      if (found) return found
    }
    return null
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    const explicitDate =
      normalizeGameDateValue(obj.current_game_date) ??
      normalizeGameDateValue(obj.game_date) ??
      normalizeGameDateValue(obj.currentGameDate) ??
      normalizeGameDateValue(obj.get_current_game_date) ??
      normalizeGameDateValue(obj.date) ??
      normalizeGameDateValue(obj.value)

    if (explicitDate) return explicitDate

    const builtFromSeasonParts = buildGameDateFromSeasonParts(
      obj.season_number ?? obj.seasonNumber,
      obj.month_number ?? obj.monthNumber,
      obj.day_number ?? obj.dayNumber
    )

    if (builtFromSeasonParts) return builtFromSeasonParts

    for (const entry of Object.values(obj)) {
      const found = normalizeGameDateValue(entry)
      if (found) return found
    }

    return null
  }

  return null
}

/**
 * parseIsoDateUtc
 * Safely parse YYYY-MM-DD (or timestamp-like strings) as a UTC date without
 * browser-local timezone shifts.
 */
function parseIsoDateUtc(dateStr?: string | null) {
  const isoDate = extractIsoDatePrefix(dateStr)
  if (!isoDate) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null

  const [, y, m, d] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
}

function toUtcDayNumber(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
  )
}

/**
 * getAgeFromBirthDate
 * Compute age in years from a YYYY-MM-DD birth date string using only the game/reference date.
 */
function getAgeFromBirthDate(
  birthDate?: string | null,
  referenceDate?: string | null
): number | null {
  const dob = parseIsoDateUtc(birthDate)
  const ref = parseIsoDateUtc(referenceDate)

  if (!dob || !ref) return null

  let age = ref.getUTCFullYear() - dob.getUTCFullYear()

  const hasBirthdayPassed =
    ref.getUTCMonth() > dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() >= dob.getUTCDate())

  if (!hasBirthdayPassed) age -= 1

  return age
}

function formatShortGameDate(dateStr?: string | null) {
  const d = parseIsoDateUtc(dateStr)
  if (!d) return '—'

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

function getDaysRemaining(expiresAt?: string | null, referenceDate?: string | null) {
  const expiry = parseIsoDateUtc(expiresAt)
  const ref = parseIsoDateUtc(referenceDate)

  if (!expiry || !ref) return null

  const diffMs = toUtcDayNumber(expiry) - toUtcDayNumber(ref)
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function getContractExpiryUi(
  expiresAt?: string | null,
  referenceDate?: string | null,
  fallbackSeason?: number | null
): {
  label: string
  sublabel?: string
  valueClassName: string
} {
  const daysRemaining = getDaysRemaining(expiresAt, referenceDate)
  const shortDate = formatShortGameDate(expiresAt)

  if (expiresAt) {
    const baseLabel =
      fallbackSeason === null || fallbackSeason === undefined
        ? shortDate
        : `Season ${fallbackSeason} - ${shortDate}`

    const urgent = daysRemaining !== null && daysRemaining < 90

    return {
      label: baseLabel,
      sublabel:
        daysRemaining === null
          ? 'Game date unavailable'
          : daysRemaining === 1
            ? '1 day remaining'
            : `${daysRemaining} days remaining`,
      valueClassName: urgent
        ? 'text-lg leading-tight whitespace-nowrap text-red-600'
        : 'text-lg leading-tight whitespace-nowrap',
    }
  }

  return {
    label:
      fallbackSeason === null || fallbackSeason === undefined
        ? '—'
        : `Season ${fallbackSeason}`,
    sublabel: referenceDate ? undefined : 'Game date unavailable',
    valueClassName: 'text-lg leading-tight whitespace-nowrap',
  }
}

function getRenewalStartLabel(expiresAt?: string | null) {
  const expiry = parseIsoDateUtc(expiresAt)
  if (!expiry) return '—'

  return addUtcDays(expiry, 1).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

function isFutureDateTime(value?: string | null) {
  if (!value) return false

  const t = Date.parse(value)
  if (Number.isNaN(t)) return false

  return t > Date.now()
}

function getRenewalErrorMessage(message?: string | null) {
  const text = (message ?? '').toLowerCase()

  if (text.includes('salary') || text.includes('minimum')) {
    return 'Rider refused the offer because the salary is below his current expectations.'
  }

  if (text.includes('contract length') || text.includes('duration')) {
    return 'Rider refused the offer because he is not happy with the proposed contract length.'
  }

  if (text.includes('cooldown') || text.includes('72 hour') || text.includes('72 hours')) {
    return 'Negotiations have collapsed. This rider will not discuss a new contract for 72 hours, and morale dropped by 10.'
  }

  if (text.includes('recent form') || text.includes('morale')) {
    return 'Rider refused the offer because recent form and morale increase his demands.'
  }

  if (text.includes('open negotiation not found')) {
    return 'This negotiation is no longer active. Open a new contract talk after the cooldown expires.'
  }

  if (text.includes('result type')) {
    return 'Renewal logic returned an invalid backend response. The SQL function needs to be fixed.'
  }

  return message ?? 'The rider refused the offer.'
}

/**
 * DEFAULT_RIDER_IMAGE_URL
 * Fallback image for riders with no image set.
 */
const DEFAULT_RIDER_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/Default%20Profile.png'

const SEASON_WEEKS = 52

/**
 * getRiderImageUrl
 * Return a safe image URL for rider thumbnails.
 */
function getRiderImageUrl(imageUrl?: string | null) {
  if (!imageUrl || imageUrl.trim() === '') {
    return DEFAULT_RIDER_IMAGE_URL
  }

  return imageUrl
}

function formatMoney(n?: number | null) {
  if (n == null) return '—'
  return `$${new Intl.NumberFormat('de-DE').format(n)}`
}

function formatWeeklySalary(n?: number | null) {
  if (n == null) return '—'
  return `${formatMoney(n)}/week`
}

function getSeasonWage(weeklySalary?: number | null) {
  if (weeklySalary == null) return null
  return weeklySalary * SEASON_WEEKS
}

/**
 * formatSalary
 * Localized salary display or dash.
 */
function formatSalary(value?: number | null) {
  if (value === null || value === undefined) return '—'

  const amount = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)

  return `$${amount}/week`
}

/**
 * formatPlainMoney
 * Number formatting without currency suffix/prefix composition logic.
 */
function formatPlainMoney(value?: number | null) {
  if (value === null || value === undefined) return '—'

  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * hexToRgba
 * Convert a hex color to rgba for subtle badge backgrounds/borders.
 */
function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const int = Number.parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * getMoraleUi
 * Translate backend morale (0..100) into UI label + exact colors.
 */
function getMoraleUi(morale?: number | null): {
  label: MoraleUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
} {
  const value = Math.max(0, Math.min(100, morale ?? 0))

  if (value <= 19) {
    const color = '#DC2626'
    return {
      label: 'Bad',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 39) {
    const color = '#F97316'
    return {
      label: 'Low',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 59) {
    const color = '#EAB308'
    return {
      label: 'Okay',
      color,
      bgColor: hexToRgba(color, 0.14),
      borderColor: hexToRgba(color, 0.24),
      dotColor: color,
    }
  }

  if (value <= 79) {
    const color = '#84CC16'
    return {
      label: 'Good',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  const color = '#16A34A'
  return {
    label: 'Great',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
  }
}

/**
 * getDefaultRiderAvailabilityStatus
 * Temporary UI-only default until backend status logic is connected.
 */
function getDefaultRiderAvailabilityStatus(): RiderAvailabilityStatus {
  return 'fit'
}

/**
 * getRiderStatusUi
 * UI representation for rider current status / availability.
 */
function getRiderStatusUi(status?: RiderAvailabilityStatus | null): {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
} {
  const safeStatus = status ?? getDefaultRiderAvailabilityStatus()

  if (safeStatus === 'injured') {
    const color = '#DC2626'
    return {
      label: 'Injured',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'not_fully_fit') {
    const color = '#C2410C'
    return {
      label: 'Not fully fit',
      icon: '♥',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  const color = '#16A34A'
  return {
    label: 'Fit',
    icon: '♥',
    color,
    bgColor: hexToRgba(color, 0.1),
    borderColor: hexToRgba(color, 0.2),
  }
}

/**
 * RiderStatusBadge
 * UI-only rider status badge.
 */
function RiderStatusBadge({
  status,
  className = '',
  compact = false,
}: {
  status?: RiderAvailabilityStatus | null
  className?: string
  compact?: boolean
}) {
  const ui = getRiderStatusUi(status)

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${compact ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3 py-1 text-sm'} ${className}`}
      title={`Status: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: ui.color,
          lineHeight: 1,
          fontSize: compact ? '0.8rem' : '0.9rem',
        }}
      >
        {ui.icon}
      </span>
      <span>{ui.label}</span>
    </span>
  )
}

/**
 * MoraleBadge
 * UI-only morale badge. Does not show the raw morale number.
 */
function MoraleBadge({
  morale,
  className = '',
}: {
  morale?: number | null
  className?: string
}) {
  const ui = getMoraleUi(morale)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${className}`}
      title={`Morale: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ui.dotColor }} />
      <span>{ui.label}</span>
    </span>
  )
}

/**
 * getDiffClass / getLeftValueClass / getRightValueClass / formatDiff
 * Small visual helpers for compare diffs.
 */
function getDiffClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-500'
}
function getLeftValueClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-700'
}
function getRightValueClass(diff: number) {
  if (diff > 0) return 'text-red-600'
  if (diff < 0) return 'text-green-600'
  return 'text-gray-700'
}
function formatDiff(diff: number) {
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

/**
 * Simple reusable UI pieces used by the page widgets.
 * Kept local to this file to avoid changing existing imports.
 */

function CompactValueTile({
  label,
  value,
  valueClassName = '',
  subvalue,
  subvalueClassName = '',
  children,
}: {
  label: string
  value: string
  valueClassName?: string
  subvalue?: string
  subvalueClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-2 font-semibold text-gray-900 ${valueClassName || 'text-2xl'}`}>
        {value}
      </div>
      {subvalue ? (
        <div className={`mt-1 text-xs ${subvalueClassName || 'text-gray-500'}`}>{subvalue}</div>
      ) : null}
      {children}
    </div>
  )
}

function CompactStatusTile({
  label,
  status,
  subtitle,
  statusColor,
  statusClassName = '',
}: {
  label: string
  status: string
  subtitle?: string
  statusColor?: string
  statusClassName?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
        <span>{label}</span>
        {subtitle ? <span>({subtitle})</span> : null}
      </div>
      <div
        className={`mt-2 font-semibold ${statusClassName || 'text-2xl'}`}
        style={statusColor ? { color: statusColor } : undefined}
      >
        {status}
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value))

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 flex items-end justify-between">
        <div className="text-xl font-semibold text-gray-900">{safeValue}</div>
        <div className="text-xs text-gray-400">/100</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yellow-400" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function RenewalFeedbackBox({
  type,
  message,
}: {
  type: 'success' | 'error' | 'info' | null
  message: string | null
}) {
  if (!message) return null

  const classes =
    type === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : type === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gray-200 bg-gray-50 text-gray-600'

  return <div className={`rounded-xl border p-4 text-sm ${classes}`}>{message}</div>
}

/**
 * LineChart / VerticalBarChart / HorizontalMetricBar
 * Lightweight SVG widgets copied from prior UI for same visuals.
 */
function LineChart({ data }: { data: ChartPoint[] }) {
  const width = 760
  const height = 240
  const padLeft = 34
  const padRight = 20
  const padTop = 18
  const padBottom = 34

  const maxValue = Math.max(...data.map((d) => d.value), 10)
  const usableWidth = width - padLeft - padRight
  const usableHeight = height - padTop - padBottom

  const points = data.map((point, index) => {
    const x = padLeft + (index * usableWidth) / Math.max(1, data.length - 1)
    const y = padTop + usableHeight - (point.value / maxValue) * usableHeight
    return { ...point, x, y }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${padLeft},${padTop + usableHeight} ${polylinePoints} ${
    padLeft + usableWidth
  },${padTop + usableHeight}`

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        {[0.25, 0.5, 0.75, 1].map((line) => {
          const y = padTop + usableHeight - usableHeight * line
          return (
            <g key={line}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text x={6} y={y + 4} fontSize="10" fill="#6b7280">
                {Math.round(maxValue * line)}
              </text>
            </g>
          )
        })}

        <polygon points={areaPoints} fill="#fde68a" opacity="0.45" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#eab308"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" fill="#ca8a04" />
            <text
              x={point.x}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function VerticalBarChart({ data }: { data: ChartPoint[] }) {
  const width = 420
  const height = 240
  const padTop = 18
  const padBottom = 40
  const padLeft = 18
  const padRight = 18

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom
  const barWidth = chartWidth / Math.max(data.length, 1) - 18

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line
          x1={padLeft}
          y1={padTop + chartHeight}
          x2={width - padRight}
          y2={padTop + chartHeight}
          stroke="#d1d5db"
          strokeWidth="1"
        />

        {data.map((item, index) => {
          const x = padLeft + index * (barWidth + 18) + 10
          const barHeight = (item.value / maxValue) * chartHeight
          const y = padTop + chartHeight - barHeight

          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="8"
                fill={index < 3 ? '#facc15' : '#9ca3af'}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#374151"
              >
                {item.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function HorizontalMetricBar({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  const width = max > 0 ? (value / max) * 100 : 0

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yellow-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

/**
 * CompareBalanceBar
 * Small bar used in the compare modal to visualize differences.
 */
function CompareBalanceBar({ diff }: { diff: number }) {
  const clamped = Math.max(-100, Math.min(100, diff))
  const widthPercent = Math.min(50, Math.max(0, (Math.abs(clamped) / 100) * 50))

  return (
    <div className="relative h-3 w-full rounded-full bg-gray-100">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-300" />

      {clamped > 0 && (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-full bg-green-500"
          style={{ width: `${widthPercent}%` }}
        />
      )}

      {clamped < 0 && (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-full bg-red-500"
          style={{ width: `${widthPercent}%` }}
        />
      )}

      {clamped === 0 && (
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400" />
      )}
    </div>
  )
}

async function fetchRiderDetailsById(riderId: string): Promise<RiderDetails> {
  const { data, error } = await supabase
    .from('riders')
    .select(
      `
      id,
      country_code,
      first_name,
      last_name,
      display_name,
      role,
      sprint,
      climbing,
      time_trial,
      endurance,
      flat,
      recovery,
      resistance,
      race_iq,
      teamwork,
      morale,
      potential,
      overall,
      birth_date,
      image_url,
      salary,
      contract_expires_at,
      contract_expires_season,
      market_value,
      asking_price,
      asking_price_manual
    `
    )
    .eq('id', riderId)
    .single()

  if (error) throw error

  return {
    ...(data as RiderDetails),
    availability_status: getDefaultRiderAvailabilityStatus(),
  }
}

/**
 * RiderProfileModal
 * Extracted modal component kept inside this file to preserve behavior and imports.
 *
 * NOTE: The modal interacts with the same supabase client used by the page.
 */
function RiderProfileModal({
  open,
  onClose,
  riderId,
  onImageUpdated,
  gameDate,
}: {
  open: boolean
  onClose: () => void
  riderId: string | null
  onImageUpdated?: (id: string, imageUrl: string) => void
  gameDate?: string | null
}) {
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageSaveMessage, setImageSaveMessage] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [contractActionMessage, setContractActionMessage] = useState<string | null>(null)
  const [renewalBusy, setRenewalBusy] = useState(false)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalData, setRenewalData] = useState<RenewalNegotiationData | null>(null)
  const [offerSalaryInput, setOfferSalaryInput] = useState('')
  const [offerExtensionInput, setOfferExtensionInput] = useState('1')
  const [renewalResultType, setRenewalResultType] = useState<'success' | 'error' | 'info' | null>(
    null
  )
  const [renewalResultMessage, setRenewalResultMessage] = useState<string | null>(null)
  const [askingPriceInput, setAskingPriceInput] = useState('')
  const [askingPriceMessage, setAskingPriceMessage] = useState<string | null>(null)
  const [isSavingAskingPrice, setIsSavingAskingPrice] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadRider() {
      if (!riderId) return

      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setContractActionMessage(null)
      setAskingPriceInput('')
      setAskingPriceMessage(null)

      try {
        const nextRider = await fetchRiderDetailsById(riderId)

        if (!mounted) return

        setSelectedRider(nextRider)
        setImageUrlInput(nextRider.image_url ?? '')
      } catch (e: any) {
        if (!mounted) return
        setProfileError(e?.message ?? 'Failed to load rider profile.')
      } finally {
        if (!mounted) return
        setProfileLoading(false)
      }
    }

    if (open) {
      void loadRider()
    } else {
      setSelectedRider(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setImageSaving(false)
      setProfileError(null)
      setContractActionMessage(null)
      setRenewalBusy(false)
      setRenewalModalOpen(false)
      setRenewalData(null)
      setOfferSalaryInput('')
      setOfferExtensionInput('1')
      setRenewalResultType(null)
      setRenewalResultMessage(null)
      setAskingPriceInput('')
      setAskingPriceMessage(null)
      setIsSavingAskingPrice(false)
    }

    return () => {
      mounted = false
    }
  }, [open, riderId])

  async function applyImageChange() {
    if (!selectedRider) return

    setImageSaving(true)
    setImageSaveMessage(null)

    try {
      const nextImageUrl = imageUrlInput.trim() || DEFAULT_RIDER_IMAGE_URL

      const { error } = await supabase
        .from('riders')
        .update({ image_url: nextImageUrl })
        .eq('id', selectedRider.id)

      if (error) throw error

      setSelectedRider({
        ...selectedRider,
        image_url: nextImageUrl,
      })
      setImageUrlInput(nextImageUrl)
      setImageSaveMessage('Image updated successfully.')
      if (onImageUpdated) onImageUpdated(selectedRider.id, nextImageUrl)
    } catch (e: any) {
      setImageSaveMessage(e?.message ?? 'Failed to update rider image.')
    } finally {
      setImageSaving(false)
    }
  }

  async function handleSetAskingPrice() {
    if (!selectedRider?.id) return

    const price = Math.round(Number(askingPriceInput))

    if (!Number.isFinite(price) || price < 1000) {
      setAskingPriceMessage('Please enter a valid asking price.')
      return
    }

    setIsSavingAskingPrice(true)
    setAskingPriceMessage(null)

    try {
      const { error } = await supabase
        .from('riders')
        .update({
          asking_price: price,
          asking_price_manual: true,
        })
        .eq('id', selectedRider.id)

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(selectedRider.id)

      setSelectedRider(refreshedRider)
      setAskingPriceInput('')
      setAskingPriceMessage('Asking price updated.')
    } catch (e: any) {
      console.error('set asking price failed:', e)
      setAskingPriceMessage(e?.message ?? 'Could not set asking price.')
    } finally {
      setIsSavingAskingPrice(false)
    }
  }

  async function handleNewContract() {
    if (!selectedRider) return

    setRenewalBusy(true)
    setContractActionMessage(null)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const { data: openData, error: openError } = await supabase.rpc(
        'open_contract_renewal_negotiation',
        { p_rider_id: selectedRider.id }
      )

      if (openError) throw openError

      const negotiation = Array.isArray(openData) ? openData[0] : openData

      if (!negotiation) {
        throw new Error('Could not open renewal negotiation.')
      }

      const normalized: RenewalNegotiationData = {
        ...negotiation,
        current_contract_expires_at:
          negotiation.current_contract_expires_at ?? selectedRider.contract_expires_at ?? null,
        attempt_count: negotiation.attempt_count ?? 0,
        max_attempts: negotiation.max_attempts ?? 5,
        cooldown_until: negotiation.cooldown_until ?? null,
      }

      setRenewalData(normalized)
      setOfferSalaryInput(String(normalized.expected_salary_weekly))
      setOfferExtensionInput(String(normalized.requested_extension_seasons ?? 1))
      setRenewalModalOpen(true)
    } catch (e: any) {
      setContractActionMessage(
        getRenewalErrorMessage(e?.message ?? 'Failed to open renewal negotiation.')
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  async function handleSubmitRenewalOffer() {
    if (!renewalData || !selectedRider) return

    setRenewalBusy(true)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const offerSalary = Number(offerSalaryInput)
      const offerExtension = Number(offerExtensionInput)

      if (!Number.isFinite(offerSalary) || offerSalary <= 0) {
        throw new Error('Please enter a valid weekly salary offer.')
      }

      if (![1, 2].includes(offerExtension)) {
        throw new Error('Extension length must be 1 or 2 seasons.')
      }

      const { data: submitData, error: submitError } = await supabase.rpc(
        'submit_contract_renewal_offer',
        {
          p_negotiation_id: renewalData.negotiation_id,
          p_offer_salary_weekly: offerSalary,
          p_offer_extension_seasons: offerExtension,
        }
      )

      if (submitError) throw submitError

      const result = Array.isArray(submitData) ? submitData[0] : submitData

      if (!result) {
        throw new Error('No renewal result returned.')
      }

      if (result.accepted) {
        setRenewalResultType('success')
        setRenewalResultMessage(
          result.message ??
            `Contract extended for ${offerExtension} ${
              offerExtension === 1 ? 'season' : 'seasons'
            } starting from ${renewalCurrentStartLabel}.`
        )

        setSelectedRider((prev) =>
          prev
            ? {
                ...prev,
                salary: result.new_salary_weekly,
                contract_expires_season: result.new_contract_end_season,
                contract_expires_at: result.new_contract_expires_at ?? prev.contract_expires_at,
                morale: result.new_morale ?? prev.morale,
              }
            : prev
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                current_contract_expires_at:
                  result.new_contract_expires_at ?? prev.current_contract_expires_at,
                current_contract_end_season:
                  result.new_contract_end_season ?? prev.current_contract_end_season,
              }
            : prev
        )
      } else {
        setRenewalResultType('error')
        setRenewalResultMessage(
          getRenewalErrorMessage(result.message ?? 'The rider rejected the offer.')
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                cooldown_until: result.cooldown_until ?? prev.cooldown_until ?? null,
              }
            : prev
        )

        if (typeof result.new_morale === 'number') {
          setSelectedRider((prev) =>
            prev
              ? {
                  ...prev,
                  morale: result.new_morale,
                }
              : prev
          )
        }
      }
    } catch (e: any) {
      setRenewalResultType('error')
      setRenewalResultMessage(
        getRenewalErrorMessage(e?.message ?? 'Failed to submit renewal offer.')
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  function closeAll() {
    setCompareOpen(false)
    onClose()
  }

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    gameDate ?? null,
    selectedRider?.contract_expires_season
  )

  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, gameDate ?? null)

  const renewalCurrentContractExpiresAt =
    renewalData?.current_contract_expires_at ?? selectedRider?.contract_expires_at

  const renewalCurrentContractEndSeason =
    renewalData?.current_contract_end_season ?? selectedRider?.contract_expires_season

  const renewalCurrentStartLabel = getRenewalStartLabel(renewalCurrentContractExpiresAt)

  const renewalDaysRemaining = getDaysRemaining(renewalCurrentContractExpiresAt, gameDate ?? null)

  const renewalLocked =
    !!renewalData &&
    (renewalData.attempt_count >= renewalData.max_attempts ||
      isFutureDateTime(renewalData.cooldown_until))

  const askingPriceDisplay =
    selectedRider?.asking_price === null || selectedRider?.asking_price === undefined
      ? '$ -'
      : formatMoney(selectedRider.asking_price)

  const moraleUi = getMoraleUi(selectedRider?.morale)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={closeAll}
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="text-3xl font-semibold text-gray-900">
            {selectedRider
              ? `${selectedRider.first_name} ${selectedRider.last_name}`
              : 'Rider Profile'}
          </div>

          <button
            type="button"
            onClick={closeAll}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          {profileLoading && <div className="text-sm text-gray-600">Loading rider profile…</div>}

          {!profileLoading && profileError && (
            <div>
              <div className="text-sm font-medium text-red-600">Could not load rider profile</div>
              <div className="mt-1 text-sm text-gray-600">{profileError}</div>
            </div>
          )}

          {!profileLoading && !profileError && selectedRider && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div>
                  <img
                    src={getRiderImageUrl(selectedRider.image_url)}
                    alt={selectedRider.display_name}
                    className="h-80 w-full rounded-xl border border-gray-200 object-cover"
                  />

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Paste rider image URL"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
                    />

                    <button
                      type="button"
                      onClick={applyImageChange}
                      disabled={imageSaving}
                      className="mt-3 w-full rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {imageSaving ? 'Saving image...' : 'Apply Image Change'}
                    </button>

                    {imageSaveMessage && (
                      <div className="mt-2 text-sm text-gray-600">{imageSaveMessage}</div>
                    )}
                  </div>

                  <div className="mt-5 border-t border-gray-200 pt-4">
                    <div className="rounded-xl border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">Set Asking Price</div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-500">$</span>
                        <input
                          type="number"
                          min={1000}
                          value={askingPriceInput}
                          onChange={(e) => {
                            setAskingPriceInput(e.target.value)
                            if (askingPriceMessage) setAskingPriceMessage(null)
                          }}
                          className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-yellow-400"
                          placeholder="Enter asking price"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handleSetAskingPrice()
                        }}
                        disabled={isSavingAskingPrice}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingAskingPrice ? 'Saving...' : 'Set'}
                      </button>

                      {askingPriceMessage ? (
                        <div className="mt-2 text-xs text-gray-500">{askingPriceMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      <CountryFlag countryCode={selectedRider.country_code} />
                      {getCountryName(selectedRider.country_code)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      {selectedRider.role}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      Age {profileAge ?? '—'}
                    </span>
                    <RiderStatusBadge status={selectedRider.availability_status} />
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
                      Overall {selectedRider.overall}%
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <CompactValueTile
                      label="Salary (Weekly)"
                      value={formatWeeklySalary(selectedRider.salary)}
                      valueClassName="text-lg leading-tight whitespace-nowrap"
                      subvalue={`Full season wage: ${formatMoney(getSeasonWage(selectedRider.salary))}`}
                      subvalueClassName="text-xs text-gray-500"
                    />

                    <CompactValueTile
                      label="Contract Ends"
                      value={contractExpiryUi.label}
                      subvalue={contractExpiryUi.sublabel}
                      valueClassName={contractExpiryUi.valueClassName}
                      subvalueClassName={
                        contractExpiryUi.valueClassName.includes('text-red-600')
                          ? 'text-xs text-red-600'
                          : 'text-xs text-gray-500'
                      }
                    />

                    <CompactValueTile
                      label="Market Value"
                      value={formatMoney(selectedRider.market_value)}
                      valueClassName="text-lg leading-tight whitespace-nowrap"
                    />

                    <CompactValueTile
                      label="Asking Price"
                      value={askingPriceDisplay}
                      valueClassName={`text-lg leading-tight whitespace-nowrap ${
                        selectedRider.asking_price === null ||
                        selectedRider.asking_price === undefined
                          ? 'text-gray-500'
                          : 'text-gray-900'
                      }`}
                    />
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 text-base font-semibold text-gray-900">
                      Rider Attributes
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: 'Sprint', value: selectedRider.sprint },
                        { label: 'Climbing', value: selectedRider.climbing },
                        { label: 'Time Trial', value: selectedRider.time_trial },
                        { label: 'Endurance', value: selectedRider.endurance },
                        { label: 'Flat', value: selectedRider.flat },
                        { label: 'Recovery', value: selectedRider.recovery },
                        { label: 'Resistance', value: selectedRider.resistance },
                        { label: 'Race IQ', value: selectedRider.race_iq },
                        { label: 'Teamwork', value: selectedRider.teamwork },
                      ].map((stat) => (
                        <StatTile key={stat.label} label={stat.label} value={stat.value} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-200 pt-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <CompactValueTile
                        label="Potential"
                        value={`${selectedRider.potential}/100`}
                        valueClassName="text-lg leading-tight whitespace-nowrap"
                      />

                      <CompactStatusTile
                        label="Morale"
                        status={moraleUi.label}
                        statusColor={moraleUi.color}
                        statusClassName="text-lg leading-tight whitespace-nowrap"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <button
                    type="button"
                    onClick={handleNewContract}
                    disabled={renewalBusy}
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {renewalBusy ? 'Processing...' : 'New Contract'}
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Transfer List
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Compare Rider
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Release
                  </button>
                </div>

                {contractActionMessage && (
                  <div className="mt-3 text-sm text-gray-600">{contractActionMessage}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {compareOpen && selectedRider && (
        <CompareRiderModal
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          leftRider={selectedRider}
        />
      )}

      {renewalModalOpen && renewalData && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRenewalModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <div className="text-2xl font-semibold text-gray-900">Contract Renewal</div>
                <div className="mt-1 text-sm text-gray-500">
                  Review and submit a renewal offer for {selectedRider?.display_name}.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <CompactValueTile
                  label="Current Salary"
                  value={formatSalary(renewalData.current_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Expected Salary"
                  value={formatSalary(renewalData.expected_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Likely Minimum"
                  value={formatSalary(renewalData.min_acceptable_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Current Contract Ends"
                  value={`Season ${renewalCurrentContractEndSeason ?? '—'} - ${formatShortGameDate(
                    renewalCurrentContractExpiresAt
                  )}`}
                  subvalue={
                    renewalDaysRemaining === null
                      ? 'Game date unavailable'
                      : renewalDaysRemaining === 1
                        ? '1 day remaining'
                        : `${renewalDaysRemaining} days remaining`
                  }
                  valueClassName={
                    renewalDaysRemaining !== null && renewalDaysRemaining < 90
                      ? 'text-lg leading-tight whitespace-nowrap text-red-600'
                      : 'text-lg leading-tight whitespace-nowrap'
                  }
                  subvalueClassName={
                    renewalDaysRemaining !== null && renewalDaysRemaining < 90
                      ? 'text-xs text-red-600'
                      : 'text-xs text-gray-500'
                  }
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Your Weekly Salary Offer
                  </label>
                  <div className="mb-2 text-sm text-gray-500">
                    Enter the amount you want to offer this rider per week.
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={offerSalaryInput}
                      onChange={(e) => setOfferSalaryInput(e.target.value)}
                      disabled={renewalBusy || renewalLocked}
                      className="w-full rounded-xl border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Enter weekly salary offer"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Extension Length
                  </label>

                  <div className="mb-2 text-sm text-gray-500">
                    Starts from {renewalCurrentStartLabel}.
                  </div>

                  <select
                    value={offerExtensionInput}
                    onChange={(e) => setOfferExtensionInput(e.target.value)}
                    disabled={renewalBusy || renewalLocked}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="1">1 season</option>
                    <option value="2">2 seasons</option>
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <RenewalFeedbackBox type={renewalResultType} message={renewalResultMessage} />
              </div>

              {renewalData?.cooldown_until && isFutureDateTime(renewalData.cooldown_until) && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Negotiations are blocked until{' '}
                  {new Date(renewalData.cooldown_until).toLocaleString()}.
                </div>
              )}

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Riders react to salary, contract length, morale, and recent form.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitRenewalOffer}
                disabled={renewalBusy || renewalLocked}
                className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renewalBusy ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * CompareRiderModal
 * Keep compare modal logic local: compares selected left rider to another rider
 * from the same roster. Diff is left - right.
 */
function CompareRiderModal({
  open,
  onClose,
  leftRider,
}: {
  open: boolean
  onClose: () => void
  leftRider: RiderDetails
}) {
  const [compareCandidates, setCompareCandidates] = useState<ClubRosterRow[]>([])
  const [compareTargetId, setCompareTargetId] = useState('')
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [comparedRider, setComparedRider] = useState<RiderDetails | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadCandidates() {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr
        const userId = authData.user?.id
        if (!userId) return

        const { data: club, error: clubErr } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
          .single()
        if (clubErr) throw clubErr
        if (!club?.id) return

        const { data: roster, error: rosterErr } = await supabase
          .from('club_roster')
          .select(
            'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall'
          )
          .eq('club_id', club.id)
          .order('overall', { ascending: false })

        if (rosterErr) throw rosterErr
        if (!mounted) return
        setCompareCandidates((roster ?? []) as ClubRosterRow[])
      } catch {
        // keep silent for modal candidate load errors
      }
    }

    if (open) void loadCandidates()

    return () => {
      mounted = false
    }
  }, [open])

  async function handleCompareSelect(riderId: string) {
    setCompareTargetId(riderId)
    setComparedRider(null)
    setCompareError(null)

    if (!riderId) return

    setCompareLoading(true)

    try {
      const { data, error } = await supabase
        .from('riders')
        .select(
          `
          id,
          country_code,
          first_name,
          last_name,
          display_name,
          role,
          sprint,
          climbing,
          time_trial,
          endurance,
          flat,
          recovery,
          resistance,
          race_iq,
          teamwork,
          morale,
          potential,
          overall,
          birth_date,
          image_url,
          salary,
          contract_expires_at,
          contract_expires_season,
          market_value,
          asking_price,
          asking_price_manual
        `
        )
        .eq('id', riderId)
        .single()

      if (error) throw error
      setComparedRider({
        ...(data as RiderDetails),
        availability_status: getDefaultRiderAvailabilityStatus(),
      })
    } catch (e: any) {
      setCompareError(e?.message ?? 'Failed to load compare rider.')
    } finally {
      setCompareLoading(false)
    }
  }

  if (!open) return null

  const COMPARE_STATS: { key: keyof RiderDetails; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'sprint', label: 'Sprint' },
    { key: 'climbing', label: 'Climbing' },
    { key: 'time_trial', label: 'Time Trial' },
    { key: 'endurance', label: 'Endurance' },
    { key: 'flat', label: 'Flat' },
    { key: 'recovery', label: 'Recovery' },
    { key: 'resistance', label: 'Resistance' },
    { key: 'race_iq', label: 'Race IQ' },
    { key: 'teamwork', label: 'Teamwork' },
    { key: 'morale', label: 'Morale' },
    { key: 'potential', label: 'Potential' },
  ]

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-gray-200 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-gray-900">Compare Riders</div>
                <div className="mt-1 text-sm text-gray-500">
                  Select another rider from the same team to compare against{' '}
                  {leftRider.first_name} {leftRider.last_name}.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">Compare with</label>
              <select
                value={compareTargetId}
                onChange={(e) => handleCompareSelect(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
              >
                <option value="">Select a rider</option>
                {compareCandidates.map((rider) => (
                  <option key={rider.rider_id} value={rider.rider_id}>
                    {rider.display_name} • {rider.assigned_role} • {rider.overall}%
                  </option>
                ))}
              </select>

              {compareCandidates.length === 0 && (
                <div className="mt-2 text-sm text-gray-500">
                  No other riders are available for comparison.
                </div>
              )}

              {compareLoading && (
                <div className="mt-3 text-sm text-gray-600">Loading comparison…</div>
              )}

              {compareError && <div className="mt-3 text-sm text-red-600">{compareError}</div>}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={getRiderImageUrl(leftRider.image_url)}
                    alt={leftRider.display_name}
                    className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">
                      {leftRider.first_name} {leftRider.last_name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                      <CountryFlag countryCode={leftRider.country_code} />
                      <span>{getCountryName(leftRider.country_code)}</span>
                      <span>•</span>
                      <span>{leftRider.role}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden items-center justify-center lg:flex">
                <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
                  VS
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                {comparedRider ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={getRiderImageUrl(comparedRider.image_url)}
                      alt={comparedRider.display_name}
                      className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">
                        {comparedRider.first_name} {comparedRider.last_name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                        <CountryFlag countryCode={comparedRider.country_code} />
                        <span>{getCountryName(comparedRider.country_code)}</span>
                        <span>•</span>
                        <span>{comparedRider.role}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[64px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
                    Choose a rider to compare
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-3 pr-4">Stat</th>
                    <th className="py-3 pr-4">
                      {leftRider.first_name} {leftRider.last_name}
                    </th>
                    <th className="py-3 px-4 text-center">Diff</th>
                    <th className="py-3 pl-4">
                      {comparedRider
                        ? `${comparedRider.first_name} ${comparedRider.last_name}`
                        : 'Compared Rider'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_STATS.map((stat) => {
                    const currentValue = Number(leftRider[stat.key] ?? 0)
                    const compareValue = comparedRider
                      ? Number(comparedRider[stat.key] ?? 0)
                      : null
                    const diff = compareValue === null ? null : currentValue - compareValue
                    const isMoraleRow = stat.key === 'morale'

                    return (
                      <tr key={stat.key as string} className="border-b border-gray-100">
                        <td className="py-3 pr-4 font-medium text-gray-800">{stat.label}</td>

                        <td className="py-3 pr-4">
                          {isMoraleRow ? (
                            <MoraleBadge morale={leftRider.morale} />
                          ) : (
                            <span
                              className={
                                diff === null
                                  ? 'text-gray-700'
                                  : `font-medium ${getLeftValueClass(diff as number)}`
                              }
                            >
                              {currentValue}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isMoraleRow ? (
                            <div className="text-center text-gray-400">—</div>
                          ) : diff === null ? (
                            <div className="text-center text-gray-400">—</div>
                          ) : (
                            <div className="flex min-w-[280px] items-center gap-4">
                              <div className="min-w-0 flex-1">
                                <CompareBalanceBar diff={diff as number} />
                              </div>
                              <div
                                className={`w-14 text-center font-semibold ${getDiffClass(diff as number)}`}
                              >
                                {formatDiff(diff as number)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 pl-4">
                          {isMoraleRow ? (
                            comparedRider ? (
                              <MoraleBadge morale={comparedRider.morale} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )
                          ) : compareValue === null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`font-medium ${getRightValueClass(diff ?? 0)}`}>
                              {compareValue}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * SquadPage
 * First Squad page exported for route /dashboard/squad
 *
 * Responsibilities:
 * - Load the club roster for the current owner's club.
 * - Render roster table and widgets.
 * - Open RiderProfileModal and CompareRiderModal.
 * - Render top navigation to related squad pages (navigates routes).
 */
export default function SquadPage() {
  const location = useLocation()

  const [rows, setRows] = useState<ClubRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)

  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)

  const [compareLeft, setCompareLeft] = useState<RiderDetails | null>(null)

  const SQUAD_MAX = 18

  const riders = useMemo(
    () =>
      rows.map((r, idx) => ({
        rowNo: idx + 1,
        id: r.rider_id,
        name: r.display_name,
        countryCode: r.country_code,
        role: r.assigned_role,
        age: getAgeFromBirthDate(r.birth_date ?? null, gameDate ?? null) ?? r.age_years,
        overall: r.overall,
        status: getDefaultRiderAvailabilityStatus() as RiderAvailabilityStatus,
      })),
    [rows, gameDate]
  )

  const squadDisplayData = useMemo(() => {
    const sorted = [...riders].sort((a, b) => b.overall - a.overall)
    const avgOverall = sorted.length
      ? Math.round(sorted.reduce((sum, rider) => sum + rider.overall, 0) / sorted.length)
      : 60

    const seasonTrend = [
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
    ].map((label, index) => ({
      label,
      value: Math.max(
        8,
        Math.round((avgOverall - 48) * 0.95 + 8 + (index % 2 === 0 ? 0 : 2))
      ),
    }))

    const podiumChart = [
      { label: 'Wins', value: Math.max(1, Math.round((avgOverall - 52) / 4) + 1) },
      { label: '2nd', value: 2 },
      { label: '3rd', value: 3 },
      { label: 'Top10', value: 9 },
      { label: 'Top20', value: 20 },
    ]

    return {
      seasonTrend,
      podiumChart,
      summary: {
        wins: podiumChart[0].value,
        podiums: podiumChart[0].value + podiumChart[1].value + podiumChart[2].value,
        top10s: podiumChart[3].value,
        bestGC: Math.max(2, 12 - podiumChart[0].value),
      },
    }
  }, [riders])

  useEffect(() => {
    let isMounted = true

    async function loadRoster() {
      setLoading(true)
      setError(null)

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr

        const userId = authData.user?.id
        if (!userId) throw new Error('Not authenticated.')

        const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
          'get_current_game_date'
        )

        if (gameDateErr) throw gameDateErr

        const normalizedGameDate = normalizeGameDateValue(currentGameDate)

        if (!isMounted) return
        setGameDate(normalizedGameDate)

        const { data: club, error: clubErr } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
          .single()
        if (clubErr) throw clubErr
        if (!club?.id) throw new Error('No club found for this user.')

        const { data: roster, error: rosterErr } = await supabase
          .from('club_roster')
          .select(
            'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall'
          )
          .eq('club_id', club.id)
          .order('overall', { ascending: false })

        if (rosterErr) throw rosterErr

        const rosterRows = (roster ?? []) as ClubRosterRow[]
        const riderIds = rosterRows.map((row) => row.rider_id)

        let birthDateMap = new Map<string, string | null>()

        if (riderIds.length > 0) {
          const { data: riderBirthDates, error: riderBirthDatesErr } = await supabase
            .from('riders')
            .select('id, birth_date')
            .in('id', riderIds)

          if (riderBirthDatesErr) throw riderBirthDatesErr

          birthDateMap = new Map(
            (riderBirthDates ?? []).map((row: { id: string; birth_date: string | null }) => [
              row.id,
              row.birth_date,
            ])
          )
        }

        const mergedRows = rosterRows.map((row) => ({
          ...row,
          birth_date: birthDateMap.get(row.rider_id) ?? null,
        }))

        if (!isMounted) return
        setRows(mergedRows)
      } catch (e: any) {
        if (!isMounted) return
        setError(e?.message ?? 'Failed to load squad.')
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }

    void loadRoster()

    return () => {
      isMounted = false
    }
  }, [])

  async function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
    setProfileOpen(true)
    try {
      const { data, error } = await supabase
        .from('riders')
        .select(
          `
          id,
          first_name,
          last_name,
          display_name,
          role,
          sprint,
          climbing,
          time_trial,
          endurance,
          flat,
          recovery,
          resistance,
          race_iq,
          teamwork,
          morale,
          potential,
          overall,
          country_code,
          image_url,
          birth_date,
          salary,
          contract_expires_at,
          contract_expires_season,
          market_value,
          asking_price,
          asking_price_manual
        `
        )
        .eq('id', riderId)
        .single()
      if (!error && data) {
        setCompareLeft({
          ...(data as RiderDetails),
          availability_status: getDefaultRiderAvailabilityStatus(),
        })
      }
    } catch {
      // ignore
    }
  }

  function closeProfile() {
    setProfileOpen(false)
    setSelectedRiderId(null)
    setCompareLeft(null)
  }

  function isActive(path: string) {
    const current = location.pathname
    return current === path
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Squad</h2>
          <div className="text-sm text-gray-500">
            Manage your first-team squad and view season insights.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#/dashboard/squad"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/squad')
                ? 'bg-yellow-400 text-black'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            First Squad
          </a>

          <a
            href="#/dashboard/developing-team"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Developing Team
          </a>

          <a
            href="#/dashboard/staff"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/staff')
                ? 'bg-yellow-400 text-black'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Staff
          </a>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="text-base font-semibold text-gray-800">First Squad</div>
        <div className="text-sm text-gray-500">
          Riders: <span className="font-medium text-gray-700">{riders.length}/{SQUAD_MAX}</span>
        </div>
      </div>

      {riders.length >= SQUAD_MAX && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          Squad is full ({SQUAD_MAX} riders). Transfers, signings and promotions must respect the
          squad cap.
        </div>
      )}

      {loading && (
        <div className="w-full rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading squad…
        </div>
      )}

      {!loading && error && (
        <div className="w-full rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load squad</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="w-full rounded-lg bg-white p-4 shadow">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold text-gray-800">First Squad</div>
              <div className="text-sm text-gray-500">
                Riders:{' '}
                <span className="font-medium text-gray-700">{riders.length}/{SQUAD_MAX}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="p-2">#</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Country</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Age</th>
                    <th className="p-2">Overall</th>
                    <th className="p-2 w-[160px]">Status</th>
                    <th className="p-2 w-[90px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.rowNo}</td>
                      <td className="p-2 font-medium text-gray-800">{r.name}</td>
                      <td className="p-2">
                        <div
                          className="flex items-center gap-2"
                          title={getCountryName(r.countryCode)}
                        >
                          <CountryFlag countryCode={r.countryCode} />
                          <span className="text-gray-700">{r.countryCode}</span>
                        </div>
                      </td>
                      <td className="p-2">{r.role}</td>
                      <td className="p-2">{r.age ?? '—'}</td>
                      <td className="p-2">{r.overall}%</td>
                      <td className="p-2">
                        <RiderStatusBadge status={r.status} compact />
                      </td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() => openRiderProfile(r.id)}
                          className="text-sm font-medium text-yellow-600 hover:text-yellow-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}

                  {riders.length === 0 && (
                    <tr className="border-t">
                      <td className="p-2 text-gray-500" colSpan={8}>
                        No riders found for this club yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompactValueTile label="Season Wins" value={`${squadDisplayData.summary.wins}`} />
            <CompactValueTile
              label="Season Podiums"
              value={`${squadDisplayData.summary.podiums}`}
            />
            <CompactValueTile
              label="Top 10 Results"
              value={`${squadDisplayData.summary.top10s}`}
            />
            <CompactValueTile label="Best GC" value={`${squadDisplayData.summary.bestGC}`} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Last Team Race</div>
                <div className="mt-1 text-sm text-gray-500">Result preview (mocked)</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">Rider</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders.slice(0, 8).map((r, index) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-gray-800">{r.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{r.role}</td>
                        <td className="py-3 text-gray-700">
                          {index < 3 ? `${index + 1}th` : `${index + 4}th`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Next Race Selection</div>
                <div className="mt-1 text-sm text-gray-500">Mock selection preview</div>
              </div>
              <div className="space-y-3">
                {riders.slice(0, 7).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium text-gray-800">{r.name}</div>
                      <div className="mt-1 text-sm text-gray-500">
                        Selected for role {r.role}
                      </div>
                    </div>
                    <div className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      {r.role}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg bg-white p-4 shadow xl:col-span-2">
              <div className="text-base font-semibold text-gray-800">
                Team Results This Season
              </div>
              <div className="mt-4">
                <LineChart data={squadDisplayData.seasonTrend} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-base font-semibold text-gray-800">Podiums & Placings</div>
              <div className="mt-4">
                <VerticalBarChart data={squadDisplayData.podiumChart} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow xl:col-span-3">
              <div className="text-base font-semibold text-gray-800">Race Type Snapshot</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'One-day classics', value: 72 },
                  { label: 'Stage finishes', value: 60 },
                  { label: 'Mountain days', value: 34 },
                  { label: 'Time trials', value: 29 },
                ].map((item) => (
                  <HorizontalMetricBar
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    max={100}
                  />
                ))}
              </div>
            </div>
          </div>

          <RiderProfileModal
            open={profileOpen}
            onClose={closeProfile}
            riderId={selectedRiderId}
            gameDate={gameDate}
          />
        </>
      )}
    </div>
  )
}