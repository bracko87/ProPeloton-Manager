/**
 * src/lib/server/morale.ts
 *
 * Backend helpers for rider morale processing.
 *
 * Purpose:
 * - Provide server-side utility functions for computing and updating rider morale.
 * - This file currently includes:
 *   - clampMorale
 *   - getMoraleDeltaFromParticipation
 *   - hasRecentParticipation
 *   - processDailyMorale
 *
 * Notes:
 * - Functions in this file are intended to be invoked from server-side code.
 * - The Supabase client is accepted as an argument to avoid coupling to a specific import here.
 * - Threshold handling and notifications are NOT included yet; we add those next.
 */

/**
 * Minimal rider shape needed for morale processing.
 */
type RiderMoraleRow = {
  id: string
  morale: number
  morale_updated_on: string | null
}

/**
 * shiftIsoDate
 *
 * Safely shift a YYYY-MM-DD date string by a number of days using UTC,
 * avoiding timezone issues that can happen with plain `new Date('YYYY-MM-DD')`.
 *
 * @param dateStr - ISO date string in YYYY-MM-DD format
 * @param days - Number of days to shift (can be negative)
 * @returns shifted ISO date string in YYYY-MM-DD format
 */
function shiftIsoDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

/**
 * clampMorale
 *
 * Keep morale value inside the allowed 0..100 range.
 *
 * @param value - morale value to clamp
 * @returns number - clamped morale value
 */
export function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/**
 * getMoraleDeltaFromParticipation
 *
 * Return the daily morale change based on recent participation.
 *
 * Rule:
 * - participated in last lookback window -> +1
 * - no participation in last lookback window -> -1
 *
 * @param participatedInLast2Days - whether rider participated recently
 * @returns number - morale delta
 */
export function getMoraleDeltaFromParticipation(participatedInLast2Days: boolean): number {
  return participatedInLast2Days ? 1 : -1
}

/**
 * hasRecentParticipation
 *
 * Check whether a rider has a "participated" activity within a lookback window
 * ending on gameDate (inclusive).
 *
 * @param supabase - Supabase client instance
 * @param riderId - Rider id to check
 * @param gameDate - ISO date string in YYYY-MM-DD format; treated as the end of the window
 * @param lookbackDays - Number of days to look back, inclusive of gameDate (default: 2)
 * @returns boolean - true if a participation row exists in the window, false otherwise
 */
export async function hasRecentParticipation(
  supabase: any,
  riderId: string,
  gameDate: string,
  lookbackDays = 2
): Promise<boolean> {
  if (lookbackDays < 1) {
    throw new Error('lookbackDays must be at least 1')
  }

  const from = shiftIsoDate(gameDate, -(lookbackDays - 1))
  const to = gameDate

  const { data, error } = await supabase
    .from('rider_daily_activity')
    .select('rider_id')
    .eq('rider_id', riderId)
    .eq('participated', true)
    .gte('activity_date', from)
    .lte('activity_date', to)
    .limit(1)

  if (error) {
    throw error
  }

  return (data?.length ?? 0) > 0
}

/**
 * processDailyMorale
 *
 * Run one daily morale update for all riders for the provided in-game date.
 *
 * Rule:
 * - if rider has participated in at least one activity in the last 2 days -> morale +1
 * - if rider has not participated in the last 2 days -> morale -1
 * - morale is always clamped to 0..100
 * - a rider is processed only once per gameDate
 *
 * This is the first simple version.
 * It does NOT yet:
 * - create notifications
 * - handle low morale warnings
 * - handle release requests
 *
 * @param supabase - Supabase client instance
 * @param gameDate - Current in-game date in YYYY-MM-DD format
 */
export async function processDailyMorale(
  supabase: any,
  gameDate: string
): Promise<void> {
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, morale, morale_updated_on')

  if (ridersError) {
    throw ridersError
  }

  if (!riders || riders.length === 0) {
    return
  }

  for (const rider of riders as RiderMoraleRow[]) {
    // Prevent double-processing for the same in-game day.
    if (rider.morale_updated_on === gameDate) {
      continue
    }

    const participatedInLast2Days = await hasRecentParticipation(
      supabase,
      rider.id,
      gameDate,
      2
    )

    const delta = getMoraleDeltaFromParticipation(participatedInLast2Days)
    const newMorale = clampMorale(rider.morale + delta)

    const { error: updateError } = await supabase
      .from('riders')
      .update({
        morale: newMorale,
        morale_updated_on: gameDate
      })
      .eq('id', rider.id)

    if (updateError) {
      throw updateError
    }
  }
}