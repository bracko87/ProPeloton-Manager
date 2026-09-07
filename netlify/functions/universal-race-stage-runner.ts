/**
 * RETIRED 2026-09-07.
 *
 * Authoritative production race execution has moved to the Supabase Edge
 * Function `universal-race-stage-runner`, invoked exclusively by Supabase Cron.
 *
 * This Netlify endpoint is intentionally inert. Keeping a tombstone instead of
 * a scheduled function guarantees that a stale/forged Netlify schedule header
 * cannot claim or calculate an official production stage.
 */
export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'retired',
    contract: 'netlify_universal_race_worker_retired_v1',
    authoritative_scheduler: 'supabase_cron',
    authoritative_worker: 'supabase_edge_function',
  }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
