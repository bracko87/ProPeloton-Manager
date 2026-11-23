import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (name) => readFileSync(
  new URL('../supabase/migrations/' + name, import.meta.url), 'utf8',
)

test('early Youth Academy allocation waits for its later invitation-sync dependency', () => {
  const consumer = '20261005151711_youth_allocation_hourly_monitoring_v2.sql'
  const provider = '20261005155038_youth_geo_allocation_budget_selection_v3.sql'
  assert.ok(consumer < provider)
  assert.match(source(provider), /create or replace function public\.sync_youth_scheduled_race_invitations_v2\(/i)
  const sql = source(consumer)
  assert.match(sql, /if to_regprocedure\('public\.sync_youth_scheduled_race_invitations_v2\(integer\)'\) is not null then\s+perform public\.process_youth_team_allocations_v2\(/i)
  assert.doesNotMatch(sql, /^select public\.process_youth_team_allocations_v2\(/im)
})
