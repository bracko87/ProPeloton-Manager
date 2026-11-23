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

test('SAT-13 raw legacy monitors are explicitly revoked while the admin wrapper remains', () => {
  const notes = read('docs/SATURN_ADMIN_YOUTH_HEALTH_CUTOVER_2026-11-23.md')
  const legacyClosure = read('supabase/migrations/20261123121513_saturn_close_legacy_public_youth_competition_monitor_v1.sql')
  const rawClosure = read('supabase/migrations/20261123121812_saturn_restrict_raw_system_health_watchdogs_v1.sql')
  assert.match(legacyClosure, /REVOKE ALL ON FUNCTION public\.monitor_youth_competition_health_v1\(\)/i)
  assert.match(legacyClosure, /FROM PUBLIC, anon, authenticated/i)
  assert.match(notes, /Database direct-execution cutover complete/i)
  assert.match(notes, /live administrator browser regression still pending/i)
  const expected = [
    'run_system_health_watchdog_v1',
    'monitor_youth_academy_full_health_v1',
    'monitor_special_infrastructure_health_v1',
    'monitor_youth_core_health_v1',
    'monitor_youth_staff_responsibilities_health_v1',
    'monitor_youth_scouting_recruitment_health_v1',
    'monitor_youth_finance_health_v1',
    'monitor_youth_rankings_health_v1',
    'monitor_youth_lifecycle_health_v1',
  ]
  for (const name of expected) {
    assert.ok(rawClosure.includes(`REVOKE ALL ON FUNCTION public.${name}()`), name)
  }
  assert.match(rawClosure, /FROM PUBLIC, anon, authenticated/i)
})
