import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql = read('supabase/migrations/20261120160000_saturn_test_team_lowest_tier_ai_swap_v1.sql')
const create = read('supabase/migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql')

test('private transaction-bound insert ticket cannot be created by browser role', () => {
  assert.match(sql, /create table if not exists private\.saturn_test_club_insert_tickets_v1/)
  assert.match(sql, /transaction_id bigint not null/)
  assert.match(sql, /club_id uuid not null unique/)
  assert.match(sql, /revoke all on table private\.saturn_test_club_insert_tickets_v1 from public, anon, authenticated/)
  assert.match(create, /insert into private\.saturn_test_club_insert_tickets_v1/)
  assert.match(create, /delete from private\.saturn_test_club_insert_tickets_v1/)
  assert.match(create, /txid_current\(\)/)
})

test('guest owner trigger preserves denial by default; allows only ticketed authenticated owner insert', () => {
  assert.match(sql, /create or replace function public\.ppm_reject_guest_owned_clubs_v1/)
  assert.match(sql, /tg_op = 'INSERT'/)
  assert.match(sql, /new\.owner_user_id = auth\.uid\(\)/)
  assert.match(sql, /t\.club_id = new\.id/)
  assert.match(sql, /t\.transaction_id = txid_current\(\)/)
  assert.match(sql, /private\.ppm_guest_auth_gate_v1/)
  assert.match(sql, /private\.saturn_test_club_rollout_v1/)
  assert.match(sql, /Guest accounts cannot own official multiplayer clubs unless/)
})

test('test team can replace ONLY AI in same bottom-tier regional amateur division', () => {
  assert.match(sql, /v_ticket\.world_tier/)
  assert.match(sql, /v_ticket\.amateur_division/)
  assert.match(sql, /c\.club_tier='amateur'::public\.club_tier/)
  assert.match(sql, /c\.is_ai is true/)
  assert.match(sql, /for update of c skip locked/)
  assert.match(sql, /No competition-safe AI slot available/)
  assert.doesNotMatch(sql, /delete from public\.clubs/)
})

test('historic race participation or applications exclude an AI slot', () => {
  assert.match(sql, /not exists \(\s*select 1 from public\.race_team_applications a where a\.team_id=c\.id/)
  assert.match(sql, /not exists \(\s*select 1 from public\.race_participant_teams p where p\.team_id=c\.id/)
})

test('permanent team allocation remains completely unchanged', () => {
  assert.match(sql, /if not found then\s*-- Existing permanent-player allocation behavior remains exactly as is\.\s*perform public\.assign_new_club_to_ai_slot\(new\.id\)/)
  assert.doesNotMatch(sql, /create or replace function public\.assign_new_club_to_ai_slot/)
  assert.match(create, /Automatic AI-slot assignment did not preserve the lowest eligible league/)
  assert.match(create, /if v_current>v_max_teams/)
})
test.todo('staging: a ticketed test team replaces one unused regional amateur AI with no race history')
test.todo('staging: permanent club retains original highest-tier AI-slot assignment')
test.todo('staging: direct guest-owned INSERT is rejected without ticket')
test.todo('staging: malformed ticket and unavailable regional AI slot roll back all club/AI and finance changes')
test.todo('staging: concurrent test-team creation never overfills a region or takes an active race entrant')
