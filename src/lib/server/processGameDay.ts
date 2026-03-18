/**
 * src/lib/server/processGameDay.ts
 *
 * Small orchestration helper to run all per-day processing jobs
 * for a completed in-game date.
 *
 * Purpose:
 * - Provide a single entrypoint to run daily processors (fatigue, morale, etc.)
 * - Keep ordering in one place so callers can invoke it safely.
 *
 * IMPORTANT:
 * - This function processes the day that just finished.
 * - Activity writers that create rider_daily_activity rows for this gameDate
 *   must already have written rows for that same date.
 * - The caller is responsible for deciding which date should be processed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { processDailyFatigue } from './fatigue'
// import { processDailyMorale } from './morale'

/**
 * processGameDay
 *
 * @param supabaseAdmin - admin/service-role Supabase client
 * @param gameDate - ISO date string (yyyy-mm-dd) representing the completed day to process
 */
export async function processGameDay(
  supabaseAdmin: SupabaseClient,
  gameDate: string
) {
  await processDailyFatigue(supabaseAdmin, gameDate)

  /**
   * Enable later once morale daily processor is fully wired
   * into the same trusted server flow.
   */
  // await processDailyMorale(supabaseAdmin, gameDate)
}