import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')
const form = read('src/pages/TestTeamSignup.tsx')

test('server function explicitly denies unaudited public use via independent gates and revoked execute', () => {
  assert.match(sql,/private\.ppm_guest_auth_gate_v1/)
  assert.match(sql,/private\.saturn_test_club_rollout_v1/)
  assert.match(sql,/enabled boolean not null default false/)
  assert.match(sql,/revoke all on function public\.saturn_create_test_club_v1/)
  assert.doesNotMatch(sql,/grant execute on function public\.saturn_create_test_club_v1/)
})
test('canonical anonymous Auth UUID and one official club check before any state change', () => {
  assert.match(sql,/v_user uuid := auth\.uid\(\)/)
  assert.match(sql,/from auth\.users u/)
  assert.match(sql,/u\.is_anonymous is true/)
  assert.match(sql,/pg_advisory_xact_lock/)
  assert.match(sql,/from public\.saturn_test_accounts_v1/)
  assert.match(sql,/from public\.clubs c where c\.owner_user_id=v_user/)
  assert.doesNotMatch(sql,/raw_user_meta_data|auth\.jwt\(\)/)
})
test('lowest current amateur tier, country mapping and server-approved division vacancy', () => {
  assert.match(sql,/safe_get_amateur_division_for_country/)
  assert.match(sql,/select max\(c\.world_tier\)/)
  assert.match(sql,/private\.saturn_test_division_capacity_v1/)
  assert.match(sql,/if v_current>=v_max_teams/)
  assert.match(sql,/hashtextextended\('saturn-test-division:/)
  assert.match(sql,/c\.amateur_division=v_division/)
})
test('real club, membership, finance and 14-day record are atomic', () => {
  assert.match(sql,/insert into public\.clubs\(/)
  assert.match(sql,/insert into public\.club_memberships/)
  assert.match(sql,/insert into public\.club_settings/)
  assert.match(sql,/finance_setup_new_club/)
  assert.match(sql,/apply_new_club_creation_balance_v1/)
  assert.match(sql,/insert into public\.club_finance_summary/)
  assert.match(sql,/insert into public\.saturn_test_accounts_v1/)
  assert.match(sql,/interval '168 hours'/)
  assert.match(sql,/interval '336 hours'/)
  assert.doesNotMatch(sql,/insert into public\.premium_welcome_trials|apply_coin_delta\(/)
})
test('client nickname and server validation agree', () => {
  assert.match(form,/managerName\.length < 3/)
  assert.match(form,/managerName\.length > 24/)
  assert.match(form,/minLength=\{3\} maxLength=\{24\}/)
})
test('existing AI-slot trigger cannot silently override lowest-tier placement', () => {
  assert.match(sql, /Automatic AI-slot assignment did not preserve the lowest eligible league/)
  assert.match(sql, /c\.world_tier=v_tier/)
  assert.match(sql, /c\.amateur_division=v_division/)
})

test.todo('staging: missing rollout or league capacity blocks RPC without any new club')
test.todo('staging: authorized anonymous user creates exactly one real club under concurrency')
test.todo('staging: club financial setup matches regular registered club exactly')
test.todo('staging: server expiry blocks ALL gameplay mutation functions and race registration')
test.todo('staging: seven-day premium entitlement is one-time and survives same-user conversion')
