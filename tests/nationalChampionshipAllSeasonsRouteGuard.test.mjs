import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../supabase/migrations/20261112174500_national_championship_all_seasons_route_preflight_v1.sql', import.meta.url),
  'utf8'
)

test('all nationalities with riders are included in every season preflight', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.national_championship_route_preflight_v1\(p_season_number integer\)/)
  assert.match(sql, /FROM public\.riders/)
  assert.match(sql, /n\.season_number=p_season_number/)
  assert.match(sql, /expected_countries/)
  assert.match(sql, /blocked_countries/)
  assert.match(sql, /source_stage_missing/)
  assert.match(sql, /source_stage_deleted/)
  assert.match(sql, /source_stage_wrong_country/)
})

test('hidden reserve courses are accepted but time trials and unsuitable stages are rejected', () => {
  assert.match(sql, /LEFT JOIN public\.race_reserve_pool rp/)
  assert.match(sql, /rp\.active=true/)
  assert.match(sql, /'national_championship'=any\(rp\.intended_uses\)/)
  assert.match(sql, /'general_reserve'=any\(rp\.intended_uses\)/)
  assert.match(sql, /national_competition_designated_stage_numbers/)
  assert.match(sql, /national_competition_eligible/)
  assert.match(sql, /'individual_time_trial','team_time_trial','prologue','time_trial'/)
  assert.match(sql, /preferred_route_mountain_pct_max/)
  assert.match(sql, /preferred_route_elevation_gain_max/)
  assert.match(sql, /preferred_route_elevation_per_km_max/)
})

test('scheduler refreshes stale pending schedules but does not rewrite locked historic results', () => {
  assert.match(sql, /nc\.schedule_draw_status='pending'/)
  assert.match(sql, /nc\.status='planned'/)
  assert.match(sql, /national_championship_refresh_planned_editions_v1\(v_season\)/)
  assert.match(sql, /v_route_preflight:=public\.national_championship_route_preflight_v1\(v_season\)/)
  assert.match(sql, /'status','blocked_routes'/)
  assert.match(sql, /'locked_this_game_day',0/)
  assert.doesNotMatch(sql, /DELETE FROM public\.national_championship_editions/i)
  assert.doesNotMatch(sql, /UPDATE public\.race_stage_results/i)
})

test('route lock trigger rejects incomplete or ineligible events in any season, including Season 1', () => {
  assert.match(sql, /CREATE TRIGGER national_championship_require_route_before_lock_v1/)
  assert.match(sql, /BEFORE INSERT OR UPDATE OF schedule_draw_status/)
  assert.match(sql, /NEW\.schedule_draw_status='locked'/)
  assert.match(sql, /NEW\.route_status IS DISTINCT FROM 'ready'/)
  assert.match(sql, /NEW\.final_source_stage_id IS NULL/)
  assert.match(sql, /national_championship_source_stage_eligible_v1\(NEW\.final_source_stage_id,NEW\.country_code\)/)
  assert.match(sql, /Cannot lock Season %s national championship/)
})

test('internal helpers do not grant player roles control or publish hidden route data', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.national_championship_route_preflight_v1\(integer\)/)
  assert.match(sql, /FROM PUBLIC,anon,authenticated/)
  assert.doesNotMatch(sql, /SET.*calendar_visibility.*public/i)
  assert.doesNotMatch(sql, /DELETE FROM public\.race_stages/i)
  assert.doesNotMatch(sql, /UPDATE public\.game_state/i)
})
