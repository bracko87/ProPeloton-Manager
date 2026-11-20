import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const identity = read('supabase/migrations/20261120110500_saturn_guest_mode_fail_closed_auth_and_rewards_v1.sql')
const competition = read('supabase/migrations/20261120113000_saturn_guest_competition_and_direct_club_guards_v1.sql')

test('Guest Mode starts disabled and cannot be activated without verification', () => {
  assert.match(identity, /enabled boolean not null default false/)
  assert.match(identity, /check \(not enabled or verified_at is not null\)/)
  assert.match(identity, /values \(true,false\) on conflict\(id\) do nothing/)
  assert.match(identity, /revoke all on private\.ppm_guest_auth_gate_v1 from PUBLIC,anon,authenticated/)
  assert.match(identity, /enable row level security/)
  assert.doesNotMatch(identity, /update private\.ppm_guest_auth_gate_v1\s+set enabled\s*=\s*true/i)
})

test('An anonymous Auth signup is blocked at the server, even if client UI is bypassed', () => {
  assert.match(identity, /coalesce\(new\.is_anonymous,false\)/)
  assert.match(identity, /select 1 from private\.ppm_guest_auth_gate_v1 g/)
  assert.match(identity, /g\.enabled=true and g\.verified_at is not null/)
  assert.match(identity, /before insert on auth\.users for each row/)
  assert.match(identity, /'Guest Mode is not available yet/)
  assert.doesNotMatch(identity, /new\.raw_user_meta_data\s*->>\s*'is_anonymous'/)
})

test('Guest accounts cannot farm signup welcome coins or the Premium trial', () => {
  assert.match(identity, /au\.id=NEW\.id and au\.is_anonymous=true/)
  assert.match(identity, /Anonymous users cannot claim welcome coins/)
  assert.match(identity, /au\.id=v_user and au\.is_anonymous=true/)
  assert.match(identity, /'reason','guest_account'/)
  assert.match(identity, /'show_welcome',false,'show_expired',false/)
  assert.match(identity, /premium_trial_claim_history_v1/)
})

test('Guest players cannot create official clubs through RPC or direct table writes', () => {
  assert.match(identity, /au\.id=v_user_id and au\.is_anonymous=true/)
  assert.match(competition, /new\.owner_user_id is not null/)
  assert.match(competition, /u\.id=new\.owner_user_id and u\.is_anonymous=true/)
  assert.match(competition, /before insert or update of owner_user_id on public\.clubs/)
  assert.match(competition, /Guest accounts cannot own official multiplayer clubs/)
})

test('Guest players cannot apply for real races even via another club', () => {
  assert.match(competition, /au\.id=v_user_id and au\.is_anonymous=true/)
  assert.match(competition, /'success',false,'error','guest_not_eligible'/)
  assert.match(competition, /public\.apply_for_race_v1/)
})

test('The Saturn guard deployment does not turn on or reset game release machinery', () => {
  for (const sql of [identity, competition]) {
    assert.doesNotMatch(sql, /cron\.alter_job|game_clock_config\s+set|ppm_december_2026_release_tick_v1\(\)|update auth\.users|delete from auth\.users|truncate auth\.users/i)
  }
})

// Full guest workflow requires staging integration tests (not falsely marked done):
test.todo('SAT-01: anonymous signup creates only one stable temporary Auth UUID and an isolated demo profile')
test.todo('SAT-02: email verification/linkIdentity upgrades the SAME UUID and restores draft progress')
test.todo('SAT-08: no duplicate coin grant, Premium trial, race entry or competition rank after conversion')
test.todo('SAT-08: rate limits and Turnstile/CAPTCHA block repeated anonymous signup abuse')
