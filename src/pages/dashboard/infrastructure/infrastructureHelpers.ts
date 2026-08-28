/**
 * infrastructureHelpers.ts
 *
 * Shared formatting and infrastructure-specific helper utilities for the
 * Infrastructure dashboard (Facilities + Assets).
 *
 * This file provides the helpers consumed by:
 * - src/pages/dashboard/Infrastructure.tsx
 * - src/pages/dashboard/infrastructure/AssetsSection.tsx
 * - src/pages/dashboard/infrastructure/FacilitiesSection.tsx
 *
 * Functions are implemented with safe, deterministic behaviour and stable
 * signatures so they can be used across the infrastructure UI without
 * affecting database logic.
 */

import i18n from '@/i18n'

//////////////////////////
// Numeric helpers
//////////////////////////

/**
 * Safely coerce an unknown value into a number with a fallback.
 *
 * @param value - Arbitrary input (number | string | null | undefined).
 * @param fallback - Fallback when parsing fails (default 0).
 */
export function toNumber(
  value: unknown,
  fallback: number = 0,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return fallback
    }

    const parsed =
      Number(
        trimmed.replace(
          /,/g,
          '',
        ),
      )

    return Number.isFinite(parsed)
      ? parsed
      : fallback
  }

  return fallback
}

//////////////////////////
// Currency helpers
//////////////////////////

/**
 * Format a monetary value in a compact, human-readable way.
 *
 * Examples:
 * - 0         -> "€0"
 * - 1_200     -> "€1,200"
 * - 2_500_000 -> "€2.5M"
 *
 * @param raw - Amount as number/string/unknown.
 */
export function formatCash(
  raw: unknown,
): string {
  const amount =
    toNumber(
      raw,
      0,
    )

  const sign =
    amount < 0
      ? '-'
      : ''

  const abs =
    Math.abs(amount)

  const formatWithSeparators = (
    value: number,
  ): string =>
    value.toLocaleString(
      'en-US',
      {
        maximumFractionDigits: 0,
      },
    )

  if (abs >= 1_000_000_000) {
    return `${sign}€${(
      abs / 1_000_000_000
    ).toFixed(1)}B`
  }

  if (abs >= 1_000_000) {
    return `${sign}€${(
      abs / 1_000_000
    ).toFixed(1)}M`
  }

  if (abs >= 1_000) {
    return `${sign}€${formatWithSeparators(
      abs,
    )}`
  }

  return `${sign}€${abs.toFixed(0)}`
}

//////////////////////////
// Game date helpers
//////////////////////////

/**
 * Format a game-date string into a stable "YYYY-MM-DD" representation.
 *
 * If the input already looks like "YYYY-MM-DD", it is returned unchanged.
 * If the value cannot be parsed as a date, the raw string is returned.
 *
 * @param raw - Game date string (e.g. "2026-03-15") or null/undefined.
 */
export function formatGameDate(
  raw: string | null | undefined,
): string {
  if (!raw) {
    return 'TBD'
  }

  const trimmed =
    raw.trim()

  // Already in canonical game-date form.
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      trimmed,
    )
  ) {
    return trimmed
  }

  const timestamp =
    Date.parse(trimmed)

  if (
    Number.isNaN(timestamp)
  ) {
    return trimmed
  }

  // Normalise to UTC date-only string.
  return new Date(timestamp)
    .toISOString()
    .slice(
      0,
      10,
    )
}

/**
 * Represent a game-day duration in human-readable form.
 *
 * @param raw - Number of game days as number|string|null.
 */
export function formatGameDays(
  raw:
    | number
    | string
    | null
    | undefined,
): string {
  const days = toNumber(raw, 0)
  const key = days === 1 ? 'common.gameDay' : 'common.gameDays'

  return i18n.t(key, {
    ns: 'infrastructure',
    count: days,
  })
}

/**
 * Add a number of game days to a given game-date.
 *
 * The incoming game date is expected to be either:
 * - "YYYY-MM-DD", or
 * - a value parsable by the JS Date constructor.
 *
 * The returned value is always in "YYYY-MM-DD" form where possible.
 *
 * @param gameDate - Base game date string.
 * @param rawDays - Number of days to add.
 */
export function addGameDays(
  gameDate: string | null,
  rawDays:
    | number
    | string
    | null
    | undefined,
): string | null {
  if (!gameDate) {
    return null
  }

  const days =
    toNumber(
      rawDays,
      0,
    )

  if (days === 0) {
    return formatGameDate(
      gameDate,
    )
  }

  // If already in YYYY-MM-DD, construct a UTC date from it.
  let base: Date

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      gameDate.trim(),
    )
  ) {
    base =
      new Date(
        `${gameDate}T00:00:00Z`,
      )
  } else {
    const timestamp =
      Date.parse(gameDate)

    if (
      Number.isNaN(timestamp)
    ) {
      return null
    }

    base =
      new Date(timestamp)
  }

  const result =
    new Date(
      base.getTime(),
    )

  result.setUTCDate(
    result.getUTCDate() +
      days,
  )

  return result
    .toISOString()
    .slice(
      0,
      10,
    )
}

//////////////////////////
// Percentage helpers
//////////////////////////

/**
 * Format a support / percentage-like number for assets.
 *
 * Behaviour:
 * - Values < 10 and non-integer: 1 decimal (e.g. 3.5 -> "3.5%").
 * - Other values: 0 decimals (e.g. 25 -> "25%").
 *
 * @param raw - Percentage value as number|string|unknown.
 */
export function formatAssetPercent(
  raw: unknown,
): string {
  const value =
    toNumber(
      raw,
      0,
    )

  if (
    !Number.isFinite(value)
  ) {
    return '0%'
  }

  const abs =
    Math.abs(value)

  if (
    abs < 10 &&
    !Number.isInteger(value)
  ) {
    return `${value.toFixed(1)}%`
  }

  return `${value.toFixed(0)}%`
}

//////////////////////////
// Time-remaining helpers
//////////////////////////

/**
 * Format a real-time remaining duration between a completion timestamp
 * and "now" in a human-readable way.
 *
 * Examples:
 * - 45 seconds  -> "45s"
 * - 3 minutes   -> "3m"
 * - 1h 10m      -> "1h 10m"
 * - 2d 3h       -> "2d 3h"
 *
 * If the completion timestamp is missing or in the past, "0s" is returned.
 *
 * @param completeAt - ISO timestamp string or null/undefined.
 * @param nowMs - Current time in milliseconds.
 */
export function formatTimeRemaining(
  completeAt:
    | string
    | null
    | undefined,
  nowMs: number,
): string {
  if (!completeAt) {
    return '0s'
  }

  const targetTime =
    Date.parse(
      completeAt,
    )

  if (
    Number.isNaN(targetTime)
  ) {
    return '0s'
  }

  const diffMs =
    targetTime -
    nowMs

  if (diffMs <= 0) {
    return '0s'
  }

  const totalSeconds =
    Math.floor(
      diffMs / 1000,
    )

  const days =
    Math.floor(
      totalSeconds /
        86_400,
    )

  const hours =
    Math.floor(
      (
        totalSeconds %
        86_400
      ) /
        3_600,
    )

  const minutes =
    Math.floor(
      (
        totalSeconds %
        3_600
      ) /
        60,
    )

  const seconds =
    totalSeconds %
    60

  const parts:
    string[] = []

  if (days > 0) {
    parts.push(
      `${days}d`,
    )
  }

  if (hours > 0) {
    parts.push(
      `${hours}h`,
    )
  }

  if (
    minutes > 0 &&
    days === 0
  ) {
    // Once we are showing days, hours are usually enough detail.
    parts.push(
      `${minutes}m`,
    )
  }

  if (
    parts.length === 0
  ) {
    parts.push(
      `${seconds}s`,
    )
  }

  return parts.join(' ')
}

//////////////////////////
// Supabase / RPC helpers
//////////////////////////

/**
 * Normalise Supabase RPC / query results that might be:
 * - a single row object,
 * - an array of rows (take first),
 * - null/undefined.
 *
 * This keeps call sites simple and avoids repeating array checks.
 *
 * @param data - Raw RPC payload.
 */
export function normalizeSingleRow<T>(
  data: unknown,
): T | null {
  if (data == null) {
    return null
  }

  if (
    Array.isArray(data)
  ) {
    if (
      data.length === 0
    ) {
      return null
    }

    // Accept the first row; callers handle any multi-row responses.
    return data[0] as T
  }

  return data as T
}

//////////////////////////
// Facility impact helpers
//////////////////////////

/**
 * Options for building human-readable impact lines for a facility.
 *
 * The concrete shapes for capacity / effect rows are intentionally kept
 * generic here so that this helper can be used without importing all
 * infrastructure-specific types. Only readonly access is performed.
 */
type BuildFacilityImpactLinesOptions = {
  kind: unknown
  level: number
  capacityByRole?:
    | Map<any, any>
    | null
  coachingEffect?: unknown
  medicalEffect?: unknown
}

/**
 * Produce short, descriptive lines summarising what a facility level does.
 *
 * The exact copy is UI-only and does not affect any database or simulation
 * behaviour. It is designed to be stable and generic enough to work for all
 * existing facility kinds.
 *
 * @param options - Context for the current facility and club.
 */
export function buildFacilityImpactLines(
  options:
    BuildFacilityImpactLinesOptions,
): string[] {
  const {
    kind,
    level,
    capacityByRole,
    coachingEffect,
    medicalEffect,
  } = options

  const normalizedKind =
    typeof kind === 'string' && kind.trim().length > 0
      ? kind.trim().replace(/\s+/g, '_')
      : 'club'

  const kindLabel = i18n.t(`facilityTypes.${normalizedKind}`, {
    ns: 'infrastructure',
    defaultValue: normalizedKind.replace(/_/g, ' '),
  })

  const lines: string[] = [
    i18n.t('facilities.impactLevel', {
      ns: 'infrastructure',
      level,
      kind: kindLabel,
    }),
  ]

  if (capacityByRole && capacityByRole.size > 0) {
    lines.push(i18n.t('facilities.staffCapacityImpact', { ns: 'infrastructure' }))
  }

  // Apply only the effect that belongs to this facility. The old helper added
  // medical/coaching text to unrelated buildings whenever the global effect
  // context existed.
  if (normalizedKind === 'coaching' && coachingEffect) {
    lines.push(i18n.t('facilities.coachingImpact', { ns: 'infrastructure' }))
  }

  if (normalizedKind === 'medical' && medicalEffect) {
    lines.push(i18n.t('facilities.medicalImpact', { ns: 'infrastructure' }))
  }

  return lines
}
