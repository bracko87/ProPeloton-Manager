import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261120114500_saturn_guest_demo_drafts_v1.sql', import.meta.url), 'utf8')

test('drafts are isolated from official gameplay and limited in size', () => {
  assert.match(sql, /create table if not exists public\.saturn_guest_drafts_v1/)
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/)
  assert.match(sql, /octet_length\(draft::text\) <= 16384/)
  assert.doesNotMatch(sql, /insert into (?:public\.)?(?:clubs|club_riders|race_team_entries|premium_trial_claim_history_v1)/i)
})
test('row policies require the matching Auth UUID and canonical anonymous status for writing', () => {
  assert.match(sql, /enable row level security/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /au\.is_anonymous is true/)
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /grant select, insert \(user_id, draft\), update \(draft\)/)
  assert.doesNotMatch(sql, /grant delete/)
})
test('migration does not activate signup gate or seasonal clock', () => {
  assert.doesNotMatch(sql, /signInAnonymously|update private\.ppm_guest_auth_gate_v1|cron\.|game_clock_config|delete from auth\.users/i)
})
test.todo('Integration: guest A cannot read or write guest B draft (JWT negative tests)')
test.todo('Integration: authenticated permanent player cannot create/modify a guest draft')
test.todo('Integration: guest-to-permanent conversion preserves UUID and read-only draft')
