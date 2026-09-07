/**
 * RETIRED 2026-09-07.
 *
 * Production Universal race scheduling now runs in Supabase Cron and invokes
 * the Supabase Edge Function `universal-race-stage-runner` once per minute.
 *
 * There is deliberately no Netlify `config.schedule` export in this file.
 */
export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'retired',
    contract: 'netlify_universal_race_scheduler_retired_v1',
    authoritative_scheduler: 'supabase_cron',
  }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
