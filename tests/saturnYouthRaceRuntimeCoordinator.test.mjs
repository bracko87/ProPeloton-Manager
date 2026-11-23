import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const path = '../supabase/migrations/20261005155151_youth_stage_route_cities_v3.sql'
const sql = readFileSync(new URL(path, import.meta.url), 'utf8')

test('Youth season runtime coordinator is defined before it is invoked', () => {
  const definition = sql.indexOf('create or replace function public.ensure_youth_race_runtime_for_season_v1(')
  const call = sql.indexOf('select public.ensure_youth_race_runtime_for_season_v1(')
  assert.ok(definition >= 0 && call > definition)
  assert.match(sql.slice(definition, call), /private\.ensure_youth_race_runtime_v1\(v_race\.id\)/)
  assert.match(sql.slice(definition, call), /where season_number=v_season[\s\S]*?status='scheduled'/)
})
