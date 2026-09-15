/**
 * src/lib/supabase.ts
 * Shared Supabase client setup for the application.
 *
 * Purpose:
 * - Initialize a browser-ready Supabase client using environment variables when available.
 * - Fall back to the provided URL and anon key only when env vars are not defined in this sandbox.
 * - Disable session persistence so no auth state is stored in local/session storage.
 * - Keep public.riders protected by its existing RLS while allowing race replay/result
 *   identity-only lookups (name + country) through a narrow read-only race-participant view.
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Default Supabase project configuration.
 * NOTE: These are a sandbox-only fallback for this environment.
 * In a real deployment, always configure:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */
const DEFAULT_SUPABASE_URL = 'https://okuravitxocyevkexfgi.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdXJhdml0eG9jeWV2a2V4ZmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODk5MTEsImV4cCI6MjA4Nzk2NTkxMX0.JQXjcNSjn91Wm4ZJJleYcMI2huQjvd2yY7IRRPDtVEY'

/**
 * env
 * Safely read Vite-style environment variables if present.
 * Optional chaining avoids runtime errors when env is undefined.
 */
const env = (import.meta as any)?.env ?? {}

/**
 * SUPABASE_URL / SUPABASE_ANON_KEY
 * Prefer environment variables; fall back to provided defaults in this sandbox only.
 */
const SUPABASE_URL: string =
  (env.VITE_SUPABASE_URL as string) || DEFAULT_SUPABASE_URL
const SUPABASE_ANON_KEY: string =
  (env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY

const RACE_RIDER_IDENTITY_VIEW = 'race_rider_public_identity_v1'
const RIDER_IDENTITY_COLUMNS = new Set([
  'id',
  'first_name',
  'last_name',
  'display_name',
  'country_code',
])

/**
 * isRaceRiderIdentitySelect
 *
 * RaceDetailPage deliberately hydrates only rider identity fields after loading
 * race snapshots. public.riders RLS correctly prevents a viewer from selecting
 * arbitrary competitor rider rows, so those identity-only requests can otherwise
 * return only the viewer's own riders. That leaves replay rows without surnames
 * and country flags.
 *
 * The database exposes a narrowly-scoped read-only view containing only identity
 * fields for riders who have appeared in a race. Rewrite only the known identity
 * selects; every other public.riders query continues to hit the RLS-protected table.
 */
function isRaceRiderIdentitySelect(selectValue: string | null): boolean {
  if (!selectValue) return false

  const columns = selectValue
    .split(',')
    .map((column) => column.replace(/"/g, '').trim())
    .filter(Boolean)

  if (columns.length < 4) return false
  if (!columns.includes('id')) return false
  if (!columns.includes('first_name')) return false
  if (!columns.includes('last_name')) return false
  if (!columns.includes('display_name')) return false

  return columns.every((column) => RIDER_IDENTITY_COLUMNS.has(column))
}

const browserFetch = globalThis.fetch.bind(globalThis)

/**
 * raceIdentityAwareFetch
 *
 * Supabase/PostgREST requests are left untouched except for GET requests to
 * /rest/v1/riders that select only the approved identity columns above. Those
 * requests are redirected to race_rider_public_identity_v1 while preserving all
 * filters (including id=in.(...)). This keeps the existing RaceDetailPage API
 * calls working without broadening public.riders RLS.
 */
function raceIdentityAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : null
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase()

  if (method !== 'GET') {
    return browserFetch(input, init)
  }

  let url: URL
  try {
    url = new URL(request?.url ?? String(input))
  } catch {
    return browserFetch(input, init)
  }

  const isRidersEndpoint = url.pathname.endsWith('/rest/v1/riders')
  const selectValue = url.searchParams.get('select')

  if (!isRidersEndpoint || !isRaceRiderIdentitySelect(selectValue)) {
    return browserFetch(input, init)
  }

  url.pathname = url.pathname.replace(
    /\/rest\/v1\/riders$/,
    `/rest/v1/${RACE_RIDER_IDENTITY_VIEW}`
  )

  const rewrittenInput: RequestInfo | URL = request
    ? new Request(url.toString(), request)
    : url

  return browserFetch(rewrittenInput, init)
}

/**
 * supabase
 * The application-wide Supabase client.
 *
 * Configuration:
 * - auth.persistSession = false (do not persist sessions to local or session storage).
 * - global.fetch routes only race rider identity-only reads through the safe identity view.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  },
  global: {
    fetch: raceIdentityAwareFetch
  }
})

export default supabase