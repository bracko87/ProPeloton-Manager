import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261120140000_saturn_14day_full_game_test_account_lifecycle_v1.sql', import.meta.url), 'utf8')
const policy = readFileSync(new URL('../docs/SATURN_FULL_GAME_TEST_ACCOUNT_POLICY_2026-11-20.md', import.meta.url), 'utf8')

test('test account binds one Supabase Auth UUID to one actual official club', () => {
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\)/)
  assert.match(sql, /club_id uuid not null unique references public\.clubs\(id\)/)
  assert.match(sql, /converted_at timestamptz/)
})
test('premium lasts 7 days and test term lasts 14 days by server timestamps', () => {
  assert.match(sql, /premium_ends_at = started_at \+ interval '168 hours'/)
  assert.match(sql, /expires_at = started_at \+ interval '336 hours'/)
  assert.match(sql, /premium_ends_at timestamptz not null/)
  assert.match(sql, /expires_at timestamptz not null/)
})
test('clients can read only their own term; cannot alter trial or expiry clock', () => {
  assert.match(sql, /enable row level security/)
  assert.doesNotMatch(sql, /^\\s*alter table public\\.saturn_test_accounts_v1 force row level security;/im)
  assert.match(sql, /revoke all on table public\\.saturn_test_accounts_v1 from public, anon, authenticated/)
  assert.match(sql, /grant select on table public\.saturn_test_accounts_v1 to authenticated/)
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/)
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)/i)
})
test('schema migration never enables anonymous signup or real competition', () => {
  assert.doesNotMatch(sql, /signInAnonymously|ppm_guest_auth_gate_v1|create or replace function public\.create_club|apply_for_race|game_clock_config|cron\./i)
})
test('new design explicitly requires full real-game feature parity and placement integrity', () => {
  assert.match(policy, /real riders, training, staff, equipment, finances, transfers, races and ranking/)
  assert.match(policy, /lowest eligible official tier/)
  assert.match(policy, /highest eligible free division slot/)
})
test.todo('staging: official guest club creation atomically inserts one lifecycle record')
test.todo('staging: active guest can use authorized real gameplay and race applications')
test.todo('staging: expired guest cannot mutate ANY game state')
test.todo('staging: premium is active for first 168 hours only; conversion does not restart trial')
test.todo('staging: converted account retains same UUID, club, equipment, staff, money and race results')
test.todo('staging: vacancy assignment is serializable, season-safe and never displaces incumbent')
