import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../supabase/migrations/20261117090000_protect_global_season1_restart_v1.sql',import.meta.url),
  'utf8'
)

test('global world reset functions are internal service role only', () => {
  assert.match(sql, /p\.proname LIKE 'game_world_reset_%'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.%s FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.%s TO service_role/)
})

test('restart is blocked if any active user-owned club is missing from baseline', () => {
  assert.match(sql, /c\.owner_user_id IS NOT NULL/)
  assert.match(sql, /public\.game_world_reset_s1_competition_baseline_v1/)
  assert.match(sql, /v_missing_player_clubs>0/)
  assert.match(sql, /player-owned clubs excluded from Season 1 baseline/)
})

test('full-world reset requires all four independent safety signoffs', () => {
  assert.match(sql, /private\.game_world_reset_execution_signoffs_v1/)
  assert.match(sql, /backup_verified=true/)
  assert.match(sql, /player_clubs_preserved=true/)
  assert.match(sql, /national_calendar_rebuild_verified=true/)
  assert.match(sql, /reset_validator_updated=true/)
  assert.match(sql, /s\.signed_off_at IS NOT NULL/)
  assert.match(sql, /backup_reference/)
})

test('the guard is in the core execution path, even for direct service calls', () => {
  assert.match(sql, /private\.game_world_reset_execute_guard_v1\(p_reset_run_id\)/)
  assert.match(sql, /game_world_reset_execute_core_v1\(uuid,text\)/)
  assert.match(sql, /Unexpected core source; refusing unsafe modification/)
})

test('new migration does not wipe users, purchases or gameplay history', () => {
  assert.doesNotMatch(sql, /TRUNCATE (?:TABLE )?(?:public|auth|finance)\./i)
  assert.doesNotMatch(sql, /DELETE FROM auth\.users|DELETE FROM public\.clubs/i)
  assert.doesNotMatch(sql, /UPDATE public\.game_state|UPDATE public\.game_clock_config/i)
})
