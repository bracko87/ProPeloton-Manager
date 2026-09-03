import universalRaceStageRunner from './universal-race-stage-runner'

/**
 * Netlify scheduled-entry adapter for the Universal production race worker.
 *
 * Netlify Scheduled Functions provide scheduling through the function config
 * and a JSON request body containing `next_run`; they do not provide the
 * x-nf-event/x-netlify-event headers that the original worker used to detect a
 * scheduled invocation. This adapter is itself schedule-only and forwards the
 * invocation to the existing production worker with an internal schedule
 * marker, so the worker executes its normal `tick` lifecycle.
 *
 * No race calculation logic lives here. The authoritative calculation remains
 * the existing Universal TypeScript worker and its database exact-once gates.
 */
export const config = {
  schedule: '* * * * *',
}

export default async function handler(request: Request): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.set('x-nf-event', 'schedule')

  const forwardedRequest = new Request(request.url, {
    method: 'GET',
    headers,
  })

  return universalRaceStageRunner(forwardedRequest)
}
