/**
 * infrastructureUtils.ts
 *
 * Shared pure utility helpers for the Infrastructure dashboard.
 * Contains formatting helpers, date utilities, and staff-capacity/impact helpers.
 * No React or Supabase imports here to keep this module lightweight and reusable.
 */

import { DEFAULT_CURRENCY, roleLabelMap } from './infrastructureConfig'
import type {
  CoachingEffectRow,
  FacilityImpactKind,
  MedicalEffectRow,
  StaffCapacityRow,
  StaffRole,
} from './infrastructureTypes'

/**
 * Format a real-time countdown between now and a completion timestamp.
 */
export function formatTimeRemaining(completeAt: string, nowMs: number): string {
  const targetMs = new Date(completeAt).getTime()
  const remainingMs = Math.max(targetMs - nowMs, 0)

  const totalSeconds = Math.floor(remainingMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`

  return `${seconds}s`
}

/**
 * Format a game-day duration with pluralization.
 */
export function formatGameDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return '-'
  return `${days} game day${days === 1 ? '' : 's'}`
}

/**
 * Format money using a given currency and no fractional digits.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency = DEFAULT_CURRENCY,
): string {
  if (amount === null || amount === undefined) return '-'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Convenience wrapper for money formatting using the default currency.
 */
export function formatCash(amount: number | null | undefined): string {
  return formatMoney(amount, DEFAULT_CURRENCY)
}

/**
 * Safely normalize a numeric value that might come as string/number/null into a number.
 */
export function toNumber(value: string | number | null | undefined, fallback = 1): number {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Format a numeric value as a percentage with 1 decimal, trimming trailing .0.
 */
export function formatAssetPercent(value: string | number | null | undefined): string {
  const numberValue = toNumber(value, 0)
  return `${numberValue.toFixed(1).replace('.0', '')}%`
}

/**
 * Format a multiplier greater/less than 1.0 as a +/- percentage.
 */
export function formatPositiveMultiplier(value: string | number | null | undefined): string {
  const multiplier = toNumber(value, 1)
  const pct = (multiplier - 1) * 100

  if (Math.abs(pct) < 0.05) return '+0%'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.0', '')}%`
}

/**
 * Format a reduction multiplier where values below 1.0 mean reduction.
 */
export function formatReductionMultiplier(value: string | number | null | undefined): string {
  const multiplier = toNumber(value, 1)
  const pct = (1 - multiplier) * 100

  if (Math.abs(pct) < 0.05) return '0%'
  return `${pct >= 0 ? '-' : '+'}${Math.abs(pct).toFixed(1).replace('.0', '')}%`
}

/**
 * Parse a YYYY-MM-DD game date string into a UTC Date instance.
 */
export function parseGameDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const [yearRaw, monthRaw, dayRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Add a number of game days to a game-date string and return YYYY-MM-DD.
 */
export function addGameDays(value: string | null, days: number | null | undefined): string | null {
  const parsed = parseGameDate(value)
  if (!parsed || !days) return null

  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * Format a game-date string into Season N - D Mon.
 */
export function formatGameDate(value: string | null | undefined): string {
  const parsed = parseGameDate(value)
  if (!parsed) return '-'

  const season = parsed.getUTCFullYear() - 1999
  const day = parsed.getUTCDate()
  const month = parsed.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  })

  return `Season ${season} - ${day} ${month}`
}

/**
 * Normalize a Supabase-style maybe-array result into one row or null.
 */
export function normalizeSingleRow<T>(data: T | T[] | null): T | null {
  if (!data) return null
  if (Array.isArray(data)) return data[0] ?? null
  return data
}

/**
 * Extract limit/active/open/canHire values from a staff capacity row.
 */
export function getCapacityValue(row: StaffCapacityRow | undefined): {
  limit: number
  active: number
  open: number
  canHire: boolean
} {
  const limit = row?.limit_count ?? row?.current_capacity ?? 0
  const active = row?.active_count ?? row?.assigned_count ?? 0
  const open = row?.open_slots ?? Math.max(limit - active, 0)
  const canHire = row?.can_hire ?? row?.is_hireable ?? open > 0

  return { limit, active, open, canHire }
}

/**
 * Build a short human-readable capacity string for a staff role.
 */
export function describeCapacity(
  role: StaffRole,
  capacityByRole: Map<StaffRole, StaffCapacityRow>,
): string {
  const row = capacityByRole.get(role)
  const label = roleLabelMap[role]

  if (!row) return `${label}: capacity unknown`

  const { limit, active, open, canHire } = getCapacityValue(row)

  if (limit <= 0) return `${label}: locked`

  if (open > 0 && canHire) {
    return `${label}: ${open} open slot${open === 1 ? '' : 's'}`
  }

  return `${label}: ${active}/${limit} filled`
}

/**
 * Map scouting facility level to report-quality cap.
 */
export function scoutingQualityCap(level: number): string {
  if (level <= 1) return 'Basic'
  if (level === 2) return 'Solid'
  if (level === 3) return 'Strong'
  return 'Elite'
}

/**
 * Build facility impact-description lines for the current facility level.
 */
export function buildFacilityImpactLines({
  kind,
  level,
  capacityByRole,
  coachingEffect,
  medicalEffect,
}: {
  kind: FacilityImpactKind
  level: number
  capacityByRole: Map<StaffRole, StaffCapacityRow>
  coachingEffect: CoachingEffectRow | null
  medicalEffect: MedicalEffectRow | null
}): string[] {
  switch (kind) {
    case 'club':
      return [
        describeCapacity('sport_director', capacityByRole),
        level < 2
          ? 'Club House Lv 2 unlocks the Sport Director slot.'
          : 'Supports stronger club administration and future sponsor/contract systems.',
      ]

    case 'coaching': {
      const lines = [
        describeCapacity('head_coach', capacityByRole),
        describeCapacity('trainer', capacityByRole),
      ]

      if (coachingEffect) {
        lines.push(
          `Effective coaching: ${formatPositiveMultiplier(
            coachingEffect.training_efficiency_multiplier,
          )} training output, ${formatPositiveMultiplier(
            coachingEffect.development_multiplier,
          )} development, ${formatReductionMultiplier(
            coachingEffect.overload_risk_multiplier,
          )} overload risk.`,
        )
      }

      if (level === 0) {
        lines.push('Training Center Lv 1 removes the harsh Lv 0 coaching cap.')
      }

      if (level < 3) {
        lines.push('Training Center Lv 3 unlocks the second Trainer slot.')
      }

      return lines
    }

    case 'medical': {
      const lines = [
        describeCapacity('team_doctor', capacityByRole),
        describeCapacity('physio', capacityByRole),
        describeCapacity('nutritionist', capacityByRole),
      ]

      if (medicalEffect) {
        lines.push(
          `Effective medical: ${formatReductionMultiplier(
            medicalEffect.risk_multiplier,
          )} injury/sickness risk, ${formatReductionMultiplier(
            medicalEffect.recovery_duration_multiplier,
          )} recovery duration, +${medicalEffect.daily_recovery_bonus ?? 0} daily recovery, -${
            medicalEffect.fatigue_floor_reduction ?? 0
          } fatigue floor.`,
        )
      }

      if (level === 0) {
        lines.push('Medical Center Lv 1 removes the harsh Lv 0 medical cap and unlocks second Physio.')
      }

      if (level < 2) {
        lines.push('Medical Center Lv 2 unlocks Nutritionist.')
      }

      if (level < 3) {
        lines.push('Medical Center Lv 3 unlocks second Team Doctor and third Physio.')
      }

      return lines
    }

    case 'scouting':
      return [
        describeCapacity('scout_analyst', capacityByRole),
        `Current report-quality cap: ${scoutingQualityCap(level)}.`,
        level <= 1
          ? 'Scouting Office Lv 2 unlocks Solid report quality.'
          : 'Higher Scouting Office levels unlock stronger final report quality.',
      ]

    case 'youth':
      return [
        describeCapacity('u23_head_coach', capacityByRole),
        level === 0
          ? 'Youth Academy Lv 1 unlocks the U23 Head Coach slot.'
          : 'Youth Academy Lv 2 gives U23 riders +10% training and development once the U23 system applies this effect.',
      ]

    case 'mechanics':
      return [
        describeCapacity('mechanic', capacityByRole),
        level === 0
          ? 'Mechanics Workshop Lv 1 removes harsh mechanic cap and unlocks second Mechanic.'
          : 'Higher levels unlock more mechanics and future equipment repair bonuses.',
      ]

    default:
      return []
  }
}