import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../supabase/migrations/20261001170000_national_jersey_rules_and_test_prep_v57.sql', import.meta.url),
  'utf8',
)

test('historical National Team preview fixture does not block fresh database creation', () => {
  assert.match(source, /insert into private\.national_race_preparation_test_overrides\(/i)
  assert.match(source, /select e\.id,a\.id,true,/)
  assert.match(source, /from public\.nations_group_events e\s+join public\.national_associations a/i)
  assert.match(source, /where e\.id='5a1a5892-773a-47b4-9915-7327272ca0b5'::uuid/)
  assert.match(source, /on conflict\(event_id\) do update/)
  assert.doesNotMatch(source,/values\(\s*'5a1a5892-773a-47b4-9915-7327272ca0b5'/i)
})
