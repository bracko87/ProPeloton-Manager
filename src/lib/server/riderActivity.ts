/**
 * src/lib/server/riderActivity.ts
 *
 * Helper for writing/merging rider daily activity rows.
 *
 * IMPORTANT:
 * - Current table design allows ONE row per rider per day:
 *   primary key = (rider_id, activity_date)
 * - Therefore this helper merges multiple writes into the same daily row
 *   instead of blindly overwriting it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RiderDailyActivityIntensity,
  RiderDailyActivityType,
} from './fatigue'

export type UpsertRiderDailyActivityParams = {
  riderId: string
  activityDate: string
  participated?: boolean
  activityType?: RiderDailyActivityType | null
  intensity?: RiderDailyActivityIntensity | null
  fatigueLoad?: number
  recoveryBonus?: number
  source?: string
  sourceId?: string | null
  metadata?: Record<string, unknown>
}

type RiderDailyActivityRow = {
  rider_id: string
  activity_date: string
  participated: boolean | null
  source: string | null
  activity_type: RiderDailyActivityType | null
  intensity: RiderDailyActivityIntensity | null
  fatigue_load: number | null
  recovery_bonus: number | null
  source_id: string | null
  metadata: Record<string, unknown> | null
}

function getActivityTypePriority(type: RiderDailyActivityType | null | undefined) {
  switch (type) {
    case 'race':
      return 5
    case 'training_camp':
      return 4
    case 'training':
      return 3
    case 'recovery':
      return 2
    case 'rest':
      return 1
    default:
      return 0
  }
}

function pickMergedActivityType(
  currentType: RiderDailyActivityType | null | undefined,
  nextType: RiderDailyActivityType | null | undefined
): RiderDailyActivityType | null {
  return getActivityTypePriority(nextType) >= getActivityTypePriority(currentType)
    ? (nextType ?? null)
    : (currentType ?? null)
}

function getIntensityPriority(
  intensity: RiderDailyActivityIntensity | null | undefined
) {
  switch (intensity) {
    case 'hard':
      return 3
    case 'normal':
      return 2
    case 'light':
      return 1
    default:
      return 0
  }
}

function pickMergedIntensity(
  currentIntensity: RiderDailyActivityIntensity | null | undefined,
  nextIntensity: RiderDailyActivityIntensity | null | undefined
): RiderDailyActivityIntensity | null {
  return getIntensityPriority(nextIntensity) >= getIntensityPriority(currentIntensity)
    ? (nextIntensity ?? null)
    : (currentIntensity ?? null)
}

export async function upsertRiderDailyActivity(
  supabase: SupabaseClient,
  params: UpsertRiderDailyActivityParams
) {
  const riderId = params.riderId
  const activityDate = params.activityDate
  const incomingFatigueLoad = Math.max(0, Math.round(params.fatigueLoad ?? 0))
  const incomingRecoveryBonus = Math.max(0, Math.round(params.recoveryBonus ?? 0))
  const incomingMetadata = params.metadata ?? {}

  const { data: existing, error: existingError } = await supabase
    .from('rider_daily_activity')
    .select(`
      rider_id,
      activity_date,
      participated,
      source,
      activity_type,
      intensity,
      fatigue_load,
      recovery_bonus,
      source_id,
      metadata
    `)
    .eq('rider_id', riderId)
    .eq('activity_date', activityDate)
    .maybeSingle()

  if (existingError) throw existingError

  if (!existing) {
    const insertPayload = {
      rider_id: riderId,
      activity_date: activityDate,
      participated: params.participated ?? false,
      source: params.source ?? 'system',
      activity_type: params.activityType ?? null,
      intensity: params.intensity ?? null,
      fatigue_load: incomingFatigueLoad,
      recovery_bonus: incomingRecoveryBonus,
      source_id: params.sourceId ?? null,
      metadata: incomingMetadata,
    }

    const { error: insertError } = await supabase
      .from('rider_daily_activity')
      .insert(insertPayload)

    if (insertError) throw insertError
    return
  }

  const current = existing as RiderDailyActivityRow

  const mergedMetadata = {
    ...(current.metadata ?? {}),
    ...incomingMetadata,
    last_source: params.source ?? current.source ?? 'system',
    last_source_id: params.sourceId ?? current.source_id ?? null,
  }

  const updatePayload = {
    participated: Boolean(current.participated) || Boolean(params.participated),
    source:
      current.source && params.source && current.source !== params.source
        ? 'aggregated'
        : (params.source ?? current.source ?? 'system'),
    activity_type: pickMergedActivityType(current.activity_type, params.activityType),
    intensity: pickMergedIntensity(current.intensity, params.intensity),
    fatigue_load: (current.fatigue_load ?? 0) + incomingFatigueLoad,
    recovery_bonus: (current.recovery_bonus ?? 0) + incomingRecoveryBonus,
    source_id:
      current.source_id && params.sourceId && current.source_id !== params.sourceId
        ? null
        : (params.sourceId ?? current.source_id ?? null),
    metadata: mergedMetadata,
  }

  const { error: updateError } = await supabase
    .from('rider_daily_activity')
    .update(updatePayload)
    .eq('rider_id', riderId)
    .eq('activity_date', activityDate)

  if (updateError) throw updateError
}