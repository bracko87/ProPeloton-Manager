/**
 * src/lib/server/fatigue.ts
 *
 * Backend fatigue utilities and daily-processing job for riders.
 *
 * Purpose:
 * - Provide pure helper functions to map numeric fatigue into UI-friendly labels
 *   and multipliers used by race/development logic.
 * - Expose load/recovery/risk math used by the daily processing job.
 * - Implement processDailyFatigue(supabase, gameDate) which updates rider rows
 *   based on today's activities and the fatigue model.
 *
 * Notes:
 * - This file is safe to import server-side only.
 * - It supports both:
 *   1) the new explicit fatigue_load / recovery_bonus model
 *   2) older legacy rows that only set participated = true
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FatigueUiLabel =
  | 'Fresh'
  | 'Normal'
  | 'Tired'
  | 'Very Tired'
  | 'Exhausted'

export type RiderAvailabilityStatus =
  | 'fit'
  | 'not_fully_fit'
  | 'injured'
  | 'sick'

export type RiderDailyActivityType =
  | 'rest'
  | 'recovery'
  | 'training'
  | 'training_camp'
  | 'race'

export type RiderDailyActivityIntensity = 'light' | 'normal' | 'hard'

export type FatigueRiskBand = 'none' | 'low' | 'medium' | 'high'

type RiderFatigueRow = {
  id: string
  birth_date: string | null
  fatigue: number | null
  fatigue_updated_on: string | null
  consecutive_heavy_days: number | null
  availability_status: RiderAvailabilityStatus | null
  unavailable_until: string | null
  unavailable_reason: string | null
  recovery: number | null
  resistance: number | null
  morale: number | null
}

type RiderDailyActivityRow = {
  participated: boolean | null
  activity_type: RiderDailyActivityType | null
  intensity: RiderDailyActivityIntensity | null
  fatigue_load: number | null
  recovery_bonus: number | null
}

export function clampFatigue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function getFatigueUi(fatigue?: number | null): {
  label: FatigueUiLabel
  color: string
} {
  const value = clampFatigue(fatigue ?? 0)

  if (value <= 19) return { label: 'Fresh', color: '#16A34A' }
  if (value <= 39) return { label: 'Normal', color: '#84CC16' }
  if (value <= 59) return { label: 'Tired', color: '#EAB308' }
  if (value <= 79) return { label: 'Very Tired', color: '#F97316' }

  return { label: 'Exhausted', color: '#DC2626' }
}

export function getFatigueRaceMultiplier(fatigue?: number | null) {
  const value = clampFatigue(fatigue ?? 0)

  if (value <= 19) return 1.0
  if (value <= 39) return 0.99
  if (value <= 59) return 0.96
  if (value <= 79) return 0.91
  return 0.84
}

export function getFatigueDevelopmentMultiplier(avgFatigue?: number | null) {
  const value = clampFatigue(avgFatigue ?? 0)

  if (value <= 29) return 1.0
  if (value <= 49) return 0.92
  if (value <= 69) return 0.78
  if (value <= 84) return 0.55
  return 0.2
}

export function getConsecutiveHeavyDaysBonus(consecutiveHeavyDays: number) {
  if (consecutiveHeavyDays <= 1) return 0
  if (consecutiveHeavyDays === 2) return 2
  if (consecutiveHeavyDays === 3) return 4
  return 6
}

export function getAgeFromBirthDate(
  birthDate: string | null | undefined,
  gameDate: string | null | undefined
): number | null {
  if (!birthDate || !gameDate) return null

  const dob = new Date(`${birthDate}T00:00:00Z`)
  const ref = new Date(`${gameDate}T00:00:00Z`)

  if (Number.isNaN(dob.getTime()) || Number.isNaN(ref.getTime())) return null

  let age = ref.getUTCFullYear() - dob.getUTCFullYear()

  const hadBirthday =
    ref.getUTCMonth() > dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() &&
      ref.getUTCDate() >= dob.getUTCDate())

  if (!hadBirthday) age -= 1

  return age
}

export function getDailyFatigueRecovery(params: {
  recoveryStat: number
  age?: number | null
  morale?: number | null
  rested?: boolean
  trainingCampToday?: boolean
}) {
  const recoveryStat = Math.max(0, Math.min(100, params.recoveryStat))
  let value = 6 + recoveryStat * 0.1

  if (params.rested) value += 2
  if ((params.morale ?? 50) >= 80) value += 1
  if ((params.morale ?? 50) < 40) value -= 1
  if ((params.age ?? 25) >= 31) value -= 1
  if (params.trainingCampToday) value -= 1

  return Math.max(3, Math.round(value))
}

export function getAvailabilityStatus(params: {
  fatigue: number
  unavailableUntil?: string | null
  unavailableReason?: string | null
  gameDate: string
}): RiderAvailabilityStatus {
  if (
    params.unavailableUntil &&
    params.unavailableReason &&
    params.unavailableUntil >= params.gameDate
  ) {
    if (params.unavailableReason === 'injury') return 'injured'
    if (params.unavailableReason === 'sickness') return 'sick'
  }

  if (params.fatigue >= 60) return 'not_fully_fit'
  return 'fit'
}

export function getOverloadScore(params: {
  fatigueAfterUpdate: number
  dailyLoad: number
  consecutiveHeavyBonus: number
  resistanceStat: number
  recoveryStat: number
}) {
  return (
    params.fatigueAfterUpdate +
    params.dailyLoad +
    params.consecutiveHeavyBonus -
    params.resistanceStat * 0.15 -
    params.recoveryStat * 0.1
  )
}

export function getFatigueRiskBand(overloadScore: number): FatigueRiskBand {
  if (overloadScore < 90) return 'none'
  if (overloadScore < 105) return 'low'
  if (overloadScore < 120) return 'medium'
  return 'high'
}

export function rollFatigueBreakdown(params: {
  overloadScore: number
  random: number
}): 'none' | 'injury' | 'sickness' {
  const band = getFatigueRiskBand(params.overloadScore)
  const r = params.random

  if (band === 'none') return 'none'

  if (band === 'low') {
    if (r < 0.01) return 'injury'
    if (r < 0.02) return 'sickness'
    return 'none'
  }

  if (band === 'medium') {
    if (r < 0.025) return 'injury'
    if (r < 0.045) return 'sickness'
    return 'none'
  }

  if (r < 0.05) return 'injury'
  if (r < 0.08) return 'sickness'
  return 'none'
}

export function getDowntimeDays(params: {
  outcome: 'injury' | 'sickness'
  random: number
  recoveryStat: number
}) {
  const recoveryModifier =
    params.recoveryStat >= 80 ? -1 : params.recoveryStat <= 35 ? 1 : 0

  if (params.outcome === 'sickness') {
    const base = params.random < 0.7 ? 3 : params.random < 0.95 ? 5 : 8
    return Math.max(2, base + recoveryModifier)
  }

  const base = params.random < 0.6 ? 4 : params.random < 0.9 ? 8 : 15
  return Math.max(3, base + recoveryModifier)
}

/**
 * Temporary compatibility helper:
 * if older systems only write participated = true but no explicit fatigue_load,
 * treat that as a default race/load day.
 */
function getImplicitLegacyFatigueLoad(activities: RiderDailyActivityRow[]) {
  const hasLegacyParticipation = activities.some((row) => row.participated === true)
  if (!hasLegacyParticipation) return 0

  const hasExplicitFatigueLoad = activities.some((row) => (row.fatigue_load ?? 0) > 0)
  if (hasExplicitFatigueLoad) return 0

  return 12
}

export async function processDailyFatigue(
  supabase: SupabaseClient,
  gameDate: string
) {
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select(`
      id,
      birth_date,
      fatigue,
      fatigue_updated_on,
      consecutive_heavy_days,
      availability_status,
      unavailable_until,
      unavailable_reason,
      recovery,
      resistance,
      morale
    `)

  if (ridersError) throw ridersError

  const typedRiders = (riders ?? []) as RiderFatigueRow[]

  for (const rider of typedRiders) {
    if (rider.fatigue_updated_on === gameDate) continue

    const { data: activities, error: activitiesError } = await supabase
      .from('rider_daily_activity')
      .select(`
        participated,
        activity_type,
        intensity,
        fatigue_load,
        recovery_bonus
      `)
      .eq('rider_id', rider.id)
      .eq('activity_date', gameDate)

    if (activitiesError) throw activitiesError

    const typedActivities = (activities ?? []) as RiderDailyActivityRow[]

    const explicitLoad = typedActivities.reduce(
      (sum, row) => sum + (row.fatigue_load ?? 0),
      0
    )

    const implicitLegacyLoad = getImplicitLegacyFatigueLoad(typedActivities)

    const totalLoad = explicitLoad + implicitLegacyLoad

    const totalRecoveryBonus = typedActivities.reduce(
      (sum, row) => sum + (row.recovery_bonus ?? 0),
      0
    )

    const hadHeavyLoad = totalLoad >= 10
    const consecutiveHeavyDays = hadHeavyLoad
      ? (rider.consecutive_heavy_days ?? 0) + 1
      : 0

    const consecutiveHeavyBonus =
      hadHeavyLoad ? getConsecutiveHeavyDaysBonus(consecutiveHeavyDays) : 0

    const age = getAgeFromBirthDate(rider.birth_date, gameDate)

    const rested = totalLoad === 0
    const trainingCampToday = typedActivities.some(
      (row) => row.activity_type === 'training_camp'
    )

    const dailyRecovery =
      getDailyFatigueRecovery({
        recoveryStat: rider.recovery ?? 50,
        age,
        morale: rider.morale ?? 50,
        rested,
        trainingCampToday,
      }) + totalRecoveryBonus

    const newFatigue = clampFatigue(
      (rider.fatigue ?? 0) + totalLoad + consecutiveHeavyBonus - dailyRecovery
    )

    const overloadScore = getOverloadScore({
      fatigueAfterUpdate: newFatigue,
      dailyLoad: totalLoad,
      consecutiveHeavyBonus,
      resistanceStat: rider.resistance ?? 50,
      recoveryStat: rider.recovery ?? 50,
    })

    const outcome = rollFatigueBreakdown({
      overloadScore,
      random: Math.random(),
    })

    let unavailableUntil: string | null = rider.unavailable_until ?? null
    let unavailableReason: string | null = rider.unavailable_reason ?? null

    if (outcome !== 'none') {
      const downtimeDays = getDowntimeDays({
        outcome,
        random: Math.random(),
        recoveryStat: rider.recovery ?? 50,
      })

      const date = new Date(`${gameDate}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + downtimeDays)

      unavailableUntil = date.toISOString().slice(0, 10)
      unavailableReason = outcome === 'injury' ? 'injury' : 'sickness'
    } else if (unavailableUntil && unavailableUntil < gameDate) {
      unavailableUntil = null
      unavailableReason = null
    }

    const availabilityStatus = getAvailabilityStatus({
      fatigue: newFatigue,
      unavailableUntil,
      unavailableReason,
      gameDate,
    })

    const { error: updateError } = await supabase
      .from('riders')
      .update({
        fatigue: newFatigue,
        fatigue_updated_on: gameDate,
        consecutive_heavy_days: consecutiveHeavyDays,
        unavailable_until: unavailableUntil,
        unavailable_reason: unavailableReason,
        availability_status: availabilityStatus,
      })
      .eq('id', rider.id)

    if (updateError) throw updateError
  }
}