import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261117151000_exclude_national_races_from_sponsor_preview_v1.sql', import.meta.url), 'utf8')

test('all three sponsor preview selection pools require allowed club-applicable races', () => {
  const allowed = sql.match(/and public\.sponsor_race_allowed_for_club_objective_v1\(r\.id\)/g) || []
  const dateSelectors = sql.match(/where coalesce\(r\.end_date, r\.start_date\) between v_contract_start and v_contract_end/g) || []
  assert.equal(allowed.length, 3)
  assert.equal(dateSelectors.length, 3)
  assert.match(sql, /-- Pick one future race during contract window for exact visibility/)
  assert.match(sql, /-- Pick one sponsor target country with available races/)
  assert.match(sql, /-- Pick one sponsor target category with available races/)
})

test('sponsor preview filtering does not remove the objective validation enforcement', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sponsor_offer_visibility_preview_normalizer_v1\(\)/)
  assert.match(sql, /target_race_visibility/)
  assert.match(sql, /country_visibility/)
  assert.match(sql, /category_visibility/)
  assert.match(sql, /new\.metadata :=/)
  assert.doesNotMatch(sql, /DROP TRIGGER|DISABLE TRIGGER|TRUNCATE /i)
})
