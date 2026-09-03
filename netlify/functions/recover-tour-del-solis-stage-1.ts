import universalRaceStageRunner from './universal-race-stage-runner'

const TOUR_DEL_SOLIS_STAGE_1_ID = 'd8b59420-5e7b-4715-be5f-2e3123d4f850'

/**
 * Temporary, idempotent production recovery for the one Stage 1 that became
 * overdue while the Netlify scheduled invocation was being misdetected.
 *
 * The target stage is hard-coded. The existing database Universal-engine claim
 * gate still enforces due time, official-result absence and exact-once safety.
 * This endpoint cannot calculate any other race/stage.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ status: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-nf-event', 'schedule')

  const forwardedRequest = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'calculate',
      stage_id: TOUR_DEL_SOLIS_STAGE_1_ID,
    }),
  })

  return universalRaceStageRunner(forwardedRequest)
}
