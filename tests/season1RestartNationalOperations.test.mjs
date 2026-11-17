import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = file => readFileSync(new URL('../' + file, import.meta.url),'utf8')
const nations = read('supabase/migrations/20261117104000_prepare_s1_150_nation_and_nations_rebuild_v1.sql')
const wired = read('supabase/migrations/20261117104500_integrate_clean_competition_restart_validation_v1.sql')
const cron = read('supabase/migrations/20261117105000_prepare_and_require_cron_quiescence_before_full_reset_v1.sql')

test('canonical restart nation target has exactly 150 two-letter countries', () => {
  const m = nations.match(/INSERT INTO private\.game_world_reset_national_countries_v1\(country_code\) VALUES([\s\S]*?)ON CONFLICT\(country_code\) DO NOTHING;/)
  assert.ok(m)
  const codes = [...m[1].matchAll(/\('([A-Z]{2})'\)/g)].map(x => x[1])
  assert.equal(codes.length,150)
  assert.equal(new Set(codes).size,150)
  for (const code of ['BT','BW','IN','RS','DE','MK']) assert.ok(codes.includes(code),code)
  assert.match(nations,/ALTER TABLE private\.game_world_reset_national_countries_v1 ENABLE ROW LEVEL SECURITY/)
})

test('special starter rider function only runs in frozen Season 1 and never touches players', () => {
  assert.match(nations,/private\.game_world_reset_seed_national_starters_v1/)
  assert.match(nations,/r\.status='source_frozen'/)
  assert.match(nations,/g\.season_number=1/)
  assert.match(nations,/c\.base_season=1/)
  assert.match(nations,/cc NOT IN\('BT','BW'\)/)
  assert.match(nations,/pick_generated_rider_first_name/)
  assert.match(nations,/pick_generated_rider_last_name/)
  assert.doesNotMatch(nations,/DELETE FROM auth\.users|UPDATE auth\.users|TRUNCATE public\.clubs/i)
})

test('old National/World/Nations results and fixture races are cleared before fresh schedules', () => {
  assert.match(nations,/game_world_reset_cleanup_national_competitions_v1/)
  assert.match(nations,/TRUNCATE TABLE public\.nations_competition_editions CASCADE/)
  assert.match(nations,/TRUNCATE TABLE public\.nations_team_standing_history/)
  assert.match(nations,/TRUNCATE TABLE public\.national_team_squads CASCADE/)
  assert.match(nations,/r\.category IN \('NC','NCQ','WRC','WNF','WNQ'\)/)
  assert.match(nations,/public\.race_stage_results/)
  assert.match(nations,/persistent_undated_reserve_routes_preserved/)
})

test('fresh Season 1 generates 150 National Championships and Worlds/Nations only after cleanup', () => {
  assert.match(nations,/game_world_reset_rebuild_national_competitions_v1/)
  assert.match(nations,/game_world_reset_seed_national_starters_v1\(p_reset_run_id\)/)
  assert.match(nations,/ensure_national_championship_editions_for_season_v1\(1\)/)
  assert.match(nations,/v_total<>150 OR v_ready<>150 OR v_missing<>0/)
  assert.match(nations,/v_world<>1/)
  assert.match(nations,/create_nations_competition_edition_v1\(1\)/)
  assert.match(nations,/schedule_nations_edition_v1/)
  assert.match(wired,/game_world_reset_cleanup_national_competitions_v1\(p_reset_run_id\)/)
  assert.match(wired,/game_world_reset_rebuild_national_competitions_v1\(p_reset_run_id\)/)
  assert.match(wired,/private\.game_world_reset_execute_guard_v1/)
})

test('final reset validation rejects stale nations history and missing routes', () => {
  assert.match(wired,/fresh_s1_national_editions/)
  assert.match(wired,/v_national_total=150 and v_national_ready=150/)
  assert.match(wired,/v_missing_national_countries=0 and v_missing_national_riders=0/)
  assert.match(wired,/v_world_road_ready=1 and v_nations_ready=1/)
  assert.match(wired,/v_nations_history=0 and v_nations_points=0/)
})

test('all automated jobs are snapshotted before suspension and stay unchanged before approval', () => {
  assert.match(cron,/CREATE TABLE IF NOT EXISTS private\.game_world_reset_cron_snapshot_v1/)
  assert.match(cron,/originally_active boolean NOT NULL/)
  assert.match(cron,/r\.status='source_frozen'/)
  assert.match(cron,/s\.backup_verified=true/)
  assert.match(cron,/cron\.alter_job\(job_id:=v_job\.jobid,active:=false\)/)
  assert.match(cron,/job_snapshot_rows/)
  assert.match(cron,/recently_running_jobs/)
  assert.match(cron,/World reset blocked: cron jobs must be snapshotted, suspended, and drained/)
  assert.doesNotMatch(cron,/DROP SCHEMA cron|cron\.unschedule/)
})

test('private reset helpers are not exposed to ordinary players', () => {
  const signatures = [
    'private.game_world_reset_national_readiness_v1()',
    'private.game_world_reset_seed_national_starters_v1(uuid)',
    'private.game_world_reset_cleanup_national_competitions_v1(uuid)',
    'private.game_world_reset_rebuild_national_competitions_v1(uuid)'
  ]
  for (const signature of signatures) {
    assert.ok(nations.includes('REVOKE ALL ON FUNCTION ' + signature + ' FROM PUBLIC,anon,authenticated'), signature)
  }
  assert.match(cron,/REVOKE ALL ON FUNCTION private\.game_world_reset_quiesce_cron_v1\(uuid\) FROM PUBLIC,anon,authenticated/)
  assert.match(cron,/REVOKE ALL ON FUNCTION private\.game_world_reset_execute_guard_v1\(uuid\) FROM PUBLIC,anon,authenticated/)
})
