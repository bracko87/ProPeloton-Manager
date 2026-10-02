/**
 * Process Youth Academy development/graduation work for the completed game day.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function processYouthAcademyGameDay(
  supabaseAdmin: SupabaseClient,
  gameDate: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('process_youth_academy_game_day_v1', {
    p_game_date: gameDate,
  })

  if (error) {
    throw error
  }
}
