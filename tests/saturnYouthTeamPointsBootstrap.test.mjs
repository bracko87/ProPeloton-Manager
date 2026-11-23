import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL(
  '../supabase/migrations/20261006122500_youth_team_ranking_points_fresh_install_v1.sql',
  import.meta.url), 'utf8')

test('Youth team points use actual world/continental/regional production multipliers', () => {
  for (const signature of [
    'private.youth_class_multiplier_v1(text)',
    'private.youth_team_ranking_points_v1(text,integer)'
  ]) assert.ok(sql.includes("to_regprocedure('" + signature + "') is null"))

  assert.match(sql, /when 'world' then 2\.50/)
  assert.match(sql, /when 'continental' then 1\.50/)
  assert.match(sql, /else 1\.00/)
  assert.match(sql, /private\.youth_race_base_points_v1\(p_position\)/)
  assert.match(sql, /private\.youth_class_multiplier_v1\(p_competition_class\)/)
  assert.ok('20261006122500' < '20261006123000')
})
