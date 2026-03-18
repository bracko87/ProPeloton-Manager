/**
 * src/features/squad/utils/dates.ts
 *
 * Shared date helpers for squad-related pages and modals.
 *
 * Purpose:
 * - Normalize mixed backend date payloads.
 * - Avoid browser-local timezone drift by always working in UTC.
 * - Provide movement window / age / contract date helpers reused by
 *   Squad.tsx and DevelopingTeam.tsx.
 */

import type { MovementWindowInfo } from '../types'

/**
 * extractIsoDatePrefix
 * Extract YYYY-MM-DD from a plain date or timestamp-like value.
 *
 * Supports:
 * - 2001-01-13
 * - 2001-01-13T00:00:00Z
 * - 2001-01-13 00:00:00+00
 */
export function extractIsoDatePrefix(value?: string | null) {
  if (!value) return null

  const match = String(value).trim().match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null

  return `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * toIntegerLike
 * Accept integer numbers or integer-like strings and normalize them to number.
 */
export function toIntegerLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }

  return null
}

/**
 * buildGameDateFromSeasonParts
 * Build YYYY-MM-DD from season/month/day values returned by backend RPCs.
 *
 * Backend mapping:
 * - season 1 => year 2000
 * - season 2 => year 2001
 * Therefore year = 1999 + seasonNumber
 */
export function buildGameDateFromSeasonParts(
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
export function normalizeGameDateValue(value: unknown): string | null {
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
export function parseIsoDateUtc(dateStr?: string | null) {
  const isoDate = extractIsoDatePrefix(dateStr)
  if (!isoDate) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null

  const [, y, m, d] = match
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
}

/**
 * toUtcDayNumber
 * Convert a Date to a UTC day number so day differences are timezone-safe.
 */
export function toUtcDayNumber(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * addUtcDays
 * Add whole days to a UTC date without local timezone drift.
 */
export function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
  )
}

/**
 * getMovementWindowInfo
 * Return whether the current game date is inside a movement window,
 * plus current/next labels.
 */
export function getMovementWindowInfo(gameDate?: string | null): MovementWindowInfo {
  const date = parseIsoDateUtc(gameDate)

  if (!date) {
    return {
      isOpen: false,
      currentWindowLabel: null,
      nextWindowLabel: 'Game date unavailable',
    }
  }

  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()

  const windows = [
    { month: 1, start: 1, end: 14, label: 'Jan 1 – Jan 14' },
    { month: 4, start: 1, end: 14, label: 'Apr 1 – Apr 14' },
    { month: 7, start: 1, end: 14, label: 'Jul 1 – Jul 14' },
    { month: 10, start: 1, end: 14, label: 'Oct 1 – Oct 14' },
  ]

  const current = windows.find((w) => w.month === month && day >= w.start && day <= w.end)

  if (current) {
    return {
      isOpen: true,
      currentWindowLabel: current.label,
      nextWindowLabel: current.label,
    }
  }

  const next =
    windows.find((w) => month < w.month || (month === w.month && day < w.start)) ?? windows[0]

  return {
    isOpen: false,
    currentWindowLabel: null,
    nextWindowLabel: next.label,
  }
}

/**
 * getAgeFromBirthDate
 * Compute age in years from a YYYY-MM-DD birth date string using the
 * provided game/reference date only.
 */
export function getAgeFromBirthDate(
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

/**
 * formatShortGameDate
 * Format YYYY-MM-DD-like values as "Jan 13" in UTC.
 */
export function formatShortGameDate(dateStr?: string | null) {
  const d = parseIsoDateUtc(dateStr)
  if (!d) return '—'

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

/**
 * getDaysRemaining
 * Return whole days from referenceDate until expiresAt, clamped to >= 0.
 */
export function getDaysRemaining(expiresAt?: string | null, referenceDate?: string | null) {
  const expiry = parseIsoDateUtc(expiresAt)
  const ref = parseIsoDateUtc(referenceDate)

  if (!expiry || !ref) return null

  const diffMs = toUtcDayNumber(expiry) - toUtcDayNumber(ref)
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * getContractExpiryUi
 * Build display label/sublabel/class hints for contract expiry cards.
 */
export function getContractExpiryUi(
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

/**
 * getRenewalStartLabel
 * Renewal starts the day after the current expiry date.
 */
export function getRenewalStartLabel(expiresAt?: string | null) {
  const expiry = parseIsoDateUtc(expiresAt)
  if (!expiry) return '—'

  return addUtcDays(expiry, 1).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

/**
 * isFutureDateTime
 * Check whether a timestamp-like value is in the future relative to now.
 */
export function isFutureDateTime(value?: string | null) {
  if (!value) return false

  const t = Date.parse(value)
  if (Number.isNaN(t)) return false

  return t > Date.now()
}