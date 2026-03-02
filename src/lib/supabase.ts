/**
 * src/lib/supabase.ts
 * Shared Supabase client setup for the application.
 *
 * Purpose:
 * - Initialize a browser-ready Supabase client using environment variables when available.
 * - Fall back to the provided URL and anon key only when env vars are not defined in this sandbox.
 * - Disable session persistence so no auth state is stored in local/session storage.
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

/**
 * supabase
 * The application-wide Supabase client.
 *
 * Configuration:
 * - auth.persistSession = false (do not persist sessions to local or session storage).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  }
})

export default supabase
