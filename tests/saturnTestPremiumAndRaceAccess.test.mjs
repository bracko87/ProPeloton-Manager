import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const creation = read('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')
const lifecycle = read('supabase/migrations/20261120140000_saturn_14day_full_game_test_account_lifecycle_v1.sql')
const race = read('supabase/migrations/20261120170000_saturn_active_test_race_application_guard_v1.sql')

test('test players get actual first-week Premium, not merely display metadata', () => {
  assert.match(creation, /insert into public\.premium_welcome_trials_v1\(/)
  assert.match(creation, /user_id,account_email_hash,started_at,expires_at/)
  assert.match(creation, /v_start\+interval '168 hours'/)
  assert.match(creation, /on conflict \(user_id\) do nothing/)
  assert.match(creation, /Existing Premium trial cannot be restarted/)
  assert.match(lifecycle, /premium_ends_at = started_at \+ interval '168 hours'/)
  assert.doesNotMatch(creation, /insert into public\.user_premium_subscriptions/)
})

test('test-player Premium is not an extra paid subscription or fresh registration bonus', () => {
  assert.match(creation, /md5\('saturn-anonymous-v1:'\|\|v_user::text\)/)
  assert.doesNotMatch(creation, /public\.apply_coin_delta\(/)
  assert.doesNotMatch(creation, /premium_trial_claim_history_v1/)
})

test('real race application authorizes only current guest owner of active test club', () => {
  assert.match(race, /create or replace function public\.saturn_test_account_can_mutate_v1/)
  assert.match(race, /from auth\.users u/)
  assert.match(race, /create or replace function public\.saturn_test_account_requires_guard_v1/)
  assert.match(race, /t\.user_id=auth\.uid\(\) and t\.converted_at is null/)
  assert.match(race, /t\.club_id=p_club_id/)
  assert.match(race, /c\.owner_user_id=u\.id/)
  assert.match(race, /t\.started_at <= now\(\)/)
  assert.match(race, /t\.expires_at > now\(\)/)
  assert.match(race, /t\.converted_at is null/)
  assert.match(race, /return jsonb_build_object\('success',false,'error','test_account_ineligible_or_expired'\)/)
})

test('race changes leave permanent-player application behavior unchanged', () => {
  assert.match(race, /if public\.saturn_test_account_requires_guard_v1\(\) then/)
  assert.match(race, /coalesce\(p_club_id,public\.get_my_primary_club_id\(\)\)/)
  assert.match(race, /v_club_id := p_club_id;/)
  assert.match(race, /public\.club_race_application_allowed_v1/)
  assert.match(race, /public\.race_team_entries/)
  assert.match(race, /revoke all on function public\.saturn_test_account_can_mutate_v1\(uuid\)/)
})

test('guest race withdrawal checks the same exact club and unexpired term', () => {
  assert.ok(race.toLowerCase().includes('create or replace function public.cancel_race_application_v1'))
  const cancelPart = race.slice(race.toLowerCase().indexOf('create or replace function public.cancel_race_application_v1'))
  assert.ok(cancelPart.includes('saturn_test_account_can_mutate_v1(v_club_id)'))
  assert.match(cancelPart, /test_account_ineligible_or_expired/)
  assert.ok(cancelPart.includes('update public.race_team_entries'))
})

test.todo('staging JWT: guest owner may enter eligible official race before 336-hour expiry')
test.todo('staging JWT: owner cannot use arbitrary p_club_id of another player')
test.todo('staging JWT: on/after expiry all race-entry mutations are rejected')
test.todo('staging: concurrent team creation grants precisely one seven-day trial with no reset')
test.todo('staging: permanent conversion cannot restart the original trial')
test.todo('staging: all OTHER write RPCs and direct table mutations block expired test players')
