import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const file = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const foundation = '20261005154000_youth_race_stages_fresh_install_foundation_v1.sql'
const consumer = '20261005154856_youth_race_costs_fields_routes_v3.sql'

test('Youth race stages exist before downstream schema changes', () => {
  assert.ok(foundation < consumer)
  const sql = file(foundation)
  assert.match(sql, /create table if not exists public\.youth_race_stages/i)
  assert.match(sql, /race_id uuid not null references public\.youth_races\(id\) on delete cascade/i)
  assert.match(sql, /unique \(race_id, stage_number\)/i)
  for (const key of ['stage_date', 'stage_type', 'distance_km', 'start_time_region_code',
    'planned_start_hour_number', 'planned_start_minute', 'planned_start_time_label',
    'sprint_points_total', 'mountain_points_total', 'time_trial_points_total',
    'status', 'created_at', 'updated_at']) {
    assert.match(sql, new RegExp('\\b' + key + '\\b'))
  }
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on public\.youth_race_stages from anon, authenticated/i)
  assert.match(sql, /alter table public\.youth_races/i)
  for (const field of ['start_time_region_code','planned_start_hour_number',
    'planned_start_minute','planned_start_time_label','planned_start_assigned_at']) {
    assert.match(sql, new RegExp('add column if not exists ' + field + '\\b'))
  }
  assert.match(file(consumer), /alter table public\.youth_race_stages/i)
})
