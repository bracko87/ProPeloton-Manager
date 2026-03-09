/**
 * src/routes/api/dev/process-morale/+server.ts
 *
 * Dev endpoint to trigger daily morale processing.
 */

import { json } from '@sveltejs/kit'
import { processDailyMorale } from '$lib/server/morale'

/**
 * POST
 * Handle POST requests to run processDailyMorale.
 *
 * Expected JSON body:
 *   { gameDate: "YYYY-MM-DD" }
 */
export async function POST({ locals, request }: any) {
  const { gameDate } = await request.json()

  if (!gameDate) {
    return json({ error: 'gameDate is required' }, { status: 400 })
  }

  try {
    await processDailyMorale(locals.supabase, gameDate)

    return json({
      success: true,
      message: `Daily morale processed for ${gameDate}`
    })
  } catch (error: any) {
    console.error('processDailyMorale failed:', error)

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}