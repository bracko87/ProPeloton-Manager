import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261123090605_saturn_admin_only_youth_competition_health_wrapper_v1.sql')
const adminUi = read('src/pages/dashboard/AdminRaceOperationsPage.tsx')

test('SAT-13 admin UI uses protected monitor route, not the legacy publicly callable RPC', () => {
  assert.match(adminUi, /supabase\.rpc\('admin_monitor_youth_competition_health_v1'\)/)
  assert.doesNotMatch(adminUi, /supabase\.rpc\('monitor_youth_competition_health_v1'\)/)
  assert.match(adminUi, /get_admin_race_operations_v1/)
  assert.match(adminUi, /get_admin_youth_race_operations_v1/)
})

test('SAT-13 preserves the existing monitor and adds a fail-closed admin wrapper', () => {
  assert.match(migration, /create function public\.admin_monitor_youth_competition_health_v1\(\)/i)
  assert.match(migration, /returns jsonb/i)
  assert.match(migration, /security definer\s+set search_path = ''/i)
  assert.match(migration, /auth\.uid\(\) is null or not public\.is_app_admin_v1\(\)/)
  assert.match(migration, /raise exception 'Administrator access required'/i)
  assert.match(migration, /errcode = '42501'/)
  const guard = migration.indexOf('if auth.uid() is null or not public.is_app_admin_v1()')
  const call = migration.indexOf('return public.monitor_youth_competition_health_v1()')
  assert.ok(guard >= 0 && call > guard, 'ownership check must precede any monitor call')
  assert.match(migration, /revoke all on function public\.admin_monitor_youth_competition_health_v1\(\)/i)
  assert.match(migration, /from public, anon, authenticated, service_role;/i)
  assert.match(migration, /to authenticated;/i)
  assert.doesNotMatch(migration, /revoke execute on function public\.monitor_youth_competition_health_v1/i)
  assert.doesNotMatch(migration, /select public\.monitor_youth_competition_health_v1\(/i)
})

test('SAT-13 old direct monitor is explicitly tracked as an incomplete cutover, not reported secured', () => {
  const notes = read('docs/SATURN_ADMIN_YOUTH_HEALTH_CUTOVER_2026-11-23.md')
  assert.match(notes, /legacy monitor remains callable/i)
  assert.match(notes, /do not revoke/i)
  assert.match(notes, /browser/i)
  assert.match(notes, /cron/i)
})
