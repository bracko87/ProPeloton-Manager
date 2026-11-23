import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261123084033_saturn_restrict_remaining_internal_finance_season_process_v1.sql')
const verification = read('supabase/tests/saturn_internal_finance_season_rpc_permissions_readonly.sql')

const expected = [
  'public.finance_charge_club_staff_wages(uuid,text)',
  'public.finance_charge_weekly_team_policy_costs(uuid,text)',
  'public.finance_record_missed_startlist_fine_v1(uuid)',
  'public.finance_record_prestart_disqualification_fine_v1(uuid)',
  'public.finance_run_due_monthly_tax_audits_guarded_v1(boolean)',
  'public.finance_sync_team_policy_nonrecurring_costs_v1(uuid)',
  'public.process_birthday_gifts_v1(date)',
  'public.process_daily_health_cases()',
  'public.process_daily_training_camp_activities()',
  'public.process_daily_training_camps()',
  'public.process_forward_daily_automation_v1()',
  'public.process_inactive_clubs_for_season_transition_v1(uuid,integer,integer,boolean)',
  'public.process_one_daily_tick_backlog_smart_v1(integer)',
  'public.process_one_daily_tick_backlog_v1(integer)',
  'public.process_rider_contract_season_expiry_v1(uuid,integer,integer)',
  'public.process_rider_submission_deadlines_v1()',
  'public.process_sponsors_for_season_transition_v1(uuid,integer,integer)',
  'public.process_staff_contract_season_expiry_v1(uuid,integer,integer)',
  'public.process_user_team_inactivity_v1(boolean)',
  'public.process_weekly_rider_development_for_window(date,date,boolean)',
  'public.race_engine_due_stage_watchdog_run_v1()',
  'public.run_competition_season_transition_v1(uuid,integer,integer)',
  'public.run_season_reset_if_due()',
  'public.run_season_reset()',
].sort()

test('SAT-11 revokes and regrants only the expected 24 privileged RPC signatures', () => {
  const revoke = [...migration.matchAll(/^revoke execute on function (public\..+) from public, anon, authenticated;$/gmi)].map(m => m[1]).sort()
  const grant = [...migration.matchAll(/^grant execute on function (public\..+) to service_role;$/gmi)].map(m => m[1]).sort()
  assert.deepEqual(revoke, expected)
  assert.deepEqual(grant, expected)
  assert.equal(new Set(revoke).size, 24)
})

test('SAT-11 preflight protects definer callers and avoids mutations', () => {
  assert.match(migration, /to_regprocedure\(v_sig\)/)
  assert.match(migration, /p\.proowner='postgres'::regrole/)
  assert.match(migration, /not c\.prosecdef/)
  assert.match(migration, /pg_trigger/)
  assert.match(migration, /pg_rewrite/)
  assert.doesNotMatch(migration, /(?:^|\n)(?:update|delete|truncate|alter|drop|insert)\s+/im)
})

test('SAT-11 read-only verifier does not run any business function', () => {
  for (const fn of expected) assert.ok(verification.includes(fn.slice('public.'.length).split('(')[0]))
  assert.match(verification, /has_function_privilege\('anon'/)
  assert.match(verification, /has_function_privilege\('authenticated'/)
  assert.match(verification, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(verification.replace(/^--.*$/gm,''), /\b(?:call|perform|grant|revoke|insert|update|delete|alter|truncate)\b/i)
})
