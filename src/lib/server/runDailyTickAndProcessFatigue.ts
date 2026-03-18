/**
 * src/lib/server/runDailyTickAndProcessFatigue.ts
 *
 * Wrapper around the real Supabase SQL clock/day engine.
 *
 * Purpose:
 * - Read the current in-game date BEFORE the SQL tick runs
 * - Execute public.run_daily_tick_if_needed()
 * - If a day boundary was crossed, process fatigue for the day that just finished
 *
 * IMPORTANT:
 * - This must run on the server with an admin/service-role Supabase client.
 * - It should be called from the same place that currently runs your game clock/tick.
 *
 * V1 assumption:
 * - This wrapper assumes the runner is called often enough that at most one day
 *   boundary is crossed per invocation.
 * - Your SQL function can technically advance across multiple days if a lot of
 *   real time elapsed. If that later becomes common, we should upgrade this
 *   wrapper to process dates from game_daily_tick_log instead of only one date.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { processGameDay } from './processGameDay'

/**
 * normalizeGameDateValue
 *
 * Normalize various RPC return shapes for the current game date into a yyyy-mm-dd string.
 *
 * @param value - raw RPC return value which can be a string, array, or object
 * @returns normalized date string (yyyy-mm-dd) or empty string on failure
 */
function normalizeGameDateValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }

  if (Array.isArray(value)) {
    const first = value[0]

    if (typeof first === 'string') {
      return first.slice(0, 10)
    }

    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>
      const nested =
        obj.current_game_date ??
        obj.game_date ??
        obj.get_current_game_date ??
        obj.date ??
        null

      if (typeof nested === 'string') {
        return nested.slice(0, 10)
      }
    }
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const nested =
      obj.current_game_date ??
      obj.game_date ??
      obj.get_current_game_date ??
      obj.date ??
      null

    if (typeof nested === 'string') {
      return nested.slice(0, 10)
    }
  }

  return ''
}

/**
 * runDailyTickAndProcessFatigue
 *
 * Correct order:
 * 1. read CURRENT game date (this is the day that is about to finish)
 * 2. run public.run_daily_tick_if_needed()
 * 3. if SQL says a day changed, process the finished day from step 1
 *
 * @param supabaseAdmin - admin/service-role Supabase client
 * @returns true if at least one in-game day boundary was crossed, else false
 */
export async function runDailyTickAndProcessFatigue(
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  // 1. Read the current date BEFORE the tick
  const { data: currentGameDateRaw, error: currentGameDateError } =
    await supabaseAdmin.rpc('get_current_game_date')

  if (currentGameDateError) {
    throw currentGameDateError
  }

  const finishedGameDate = normalizeGameDateValue(currentGameDateRaw)

  if (!finishedGameDate) {
    throw new Error('Could not resolve current game date before daily tick.')
  }

  // 2. Run the real SQL tick/day engine
  const { data: dayChangedRaw, error: tickError } =
    await supabaseAdmin.rpc('run_daily_tick_if_needed')

  if (tickError) {
    throw tickError
  }

  const dayChanged = Boolean(dayChangedRaw)

  // 3. If the SQL clock crossed into a new day, process the day that just ended
  if (dayChanged) {
    await processGameDay(supabaseAdmin, finishedGameDate)
  }

  return dayChanged
}