import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../supabase/migrations/20261002134500_single_club_creation_test_exception_v1.sql', import.meta.url),
  'utf8',
)

test('historical club-creation exception requires an existing profile', () => {
  assert.match(source, /insert into public\.club_creation_test_exceptions\(user_id,reason\)\s+select p\.id,/i)
  assert.match(source, /from public\.profiles p\s+where p\.id='13747fea-414a-4fa6-87c6-c5e47de373d5'::uuid/i)
  assert.match(source, /on conflict\(user_id\) do update/i)
  assert.doesNotMatch(source, /insert into public\.club_creation_test_exceptions\(user_id,reason\)\s+values\s*\(/i)
})
