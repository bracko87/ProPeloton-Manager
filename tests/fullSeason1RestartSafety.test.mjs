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


const playerSlots = readFileSync(
  new URL('../supabase/migrations/20261117092000_preserve_player_clubs_in_season1_world_restart_v1.sql',import.meta.url),
  'utf8'
)
const validator = readFileSync(
  new URL('../supabase/migrations/20261117093000_reset_validation_against_checkpointed_code_v1.sql',import.meta.url),
  'utf8'
)

test('four player-owned WorldTeams replace their exact displaced AI slots', () => {
  assert.match(playerSlots,/private\.game_world_reset_baseline_player_slot_audit_v1/)
  assert.match(playerSlots,/new_player_club_id uuid NOT NULL UNIQUE/)
  assert.match(playerSlots,/current_player\.created_at=old\.deleted_at/)
  assert.match(playerSlots,/s\.season_number=1 AND s\.club_tier='worldteam'/)
  assert.match(playerSlots,/v_pairs<>4/)
  assert.match(playerSlots,/club_tier='worldteam'\)<>25/)
  assert.match(playerSlots,/public\.game_world_reset_s1_competition_baseline_v1/)
  assert.doesNotMatch(playerSlots,/DELETE FROM public\.clubs|TRUNCATE public\.clubs/i)
})

test('reset validator checks checkpointed functions instead of obsolete hashes', () => {
  assert.match(validator,/transition_function_hashes/)
  assert.match(validator,/jsonb_array_elements\(checkpoint\.payload\)/)
  assert.match(validator,/checksum IS DISTINCT FROM actual/)
  assert.match(validator,/count\(\*\)=4/)
  assert.match(validator,/missing checkpoint blocks validation/i)
  assert.doesNotMatch(validator,/UPDATE public\.game_state|DELETE FROM public\.riders/i)
})


const nationalReset = readFileSync(
  new URL('../supabase/migrations/20261117114500_preserve_150_national_routes_for_season1_reset_v1.sql',import.meta.url),
  'utf8'
)

test('restart only uses national source stages that survive S2 removal', () => {
  assert.match(nationalReset, /game_world_reset_s1_national_route_baseline_v1/)
  assert.match(nationalReset, /r1\.start_date<date '2001-01-01'/)
  assert.match(nationalReset, /r2\.start_date IS NULL AND s2\.stage_date IS NULL/)
  assert.match(nationalReset, /national_championship_source_stage_eligible_v1/)
  assert.match(nationalReset, /n<>150 OR valid_n<>150/)
})

test('restart creates fresh riders for countries with no club and rebuilds all 150 national championships', () => {
  assert.match(nationalReset, /code IN \('BT','BW'\)/)
  assert.match(nationalReset, /FOR v_idx IN 1\.\.10 LOOP/)
  assert.match(nationalReset, /v_rider_countries<>150/)
  assert.match(nationalReset, /ensure_national_championship_editions_for_season_v1\(1\)/)
  assert.match(nationalReset, /national_championship_route_preflight_v1\(1\)/)
  assert.match(nationalReset, /v_edition_count<>150/)
})

test('national rebuild cannot execute outside a paused fresh Season 1 reset', () => {
  assert.match(nationalReset, /gs\.season_number=1 AND gs\.day_number=1/)
  assert.match(nationalReset, /gs\.month_number=1 AND gs\.is_paused AND gc\.is_paused/)
  assert.match(nationalReset, /Missing backup and player safety guard/)
  assert.match(nationalReset, /perform private\.game_world_reset_restore_s1_national_world_v1\(\)/)
  assert.doesNotMatch(nationalReset, /DELETE FROM auth\.users|TRUNCATE TABLE public\.riders/i)
})


const disposable = readFileSync(
  new URL('../supabase/migrations/20261117125500_disposable_test_history_preserve_accounts_v1.sql',import.meta.url),
  'utf8'
)
const singleNational = readFileSync(
  new URL('../supabase/migrations/20261117123000_season1_reset_single_national_rebuild_v1.sql',import.meta.url),
  'utf8'
)

test('disposable test history preserves player accounts and genuine purchases', () => {
  for (const kind of [
    'account_id','profile','owned_club','wallet','premium_subscription',
    'premium_invoice','coin_ledger','welcome_trial'
  ]) assert.ok(disposable.includes("'"+kind+"'"),kind)
  assert.match(disposable,/private\.game_world_reset_critical_account_snapshot_v1/)
  assert.match(disposable,/REVOKE ALL ON private\.game_world_reset_critical_account_snapshot_v1/)
  assert.match(disposable,/critical_account_snapshot_verified/)
  assert.match(disposable,/test_history_disposable/)
  assert.match(disposable,/15 minutes/)
  assert.doesNotMatch(disposable,/TRUNCATE TABLE public\.riders|DELETE FROM auth\.users/i)
})

test('a limited account snapshot is an alternative to a whole test-history backup only with explicit approval', () => {
  assert.match(disposable,/s\.backup_verified=true/)
  assert.match(disposable,/s\.test_history_disposable=true/)
  assert.match(disposable,/s\.critical_account_snapshot_verified=true/)
  assert.match(disposable,/private\.game_world_reset_critical_account_snapshot_current_v1\(p_reset_run_id\)/)
  assert.match(disposable,/s\.signed_off_at IS NOT NULL/)
  assert.match(disposable,/m\.locked=true/)
  assert.match(disposable,/cron\.job WHERE active=true/)
  assert.match(disposable,/cron\.job_run_details/)
})

test('national championships are built only once when starting the new Season 1', () => {
  assert.match(singleNational,/completed_in_earlier_s1_bootstrap/)
  assert.match(singleNational,/Do not regenerate a second time/)
  assert.match(singleNational,/national_championship_route_preflight_v1\(1\)/)
  assert.doesNotMatch(singleNational,/v_seed:=private\.game_world_reset_seed_national_starters_v1/)
  assert.doesNotMatch(singleNational,/SELECT public\.ensure_national_championship_editions_for_season_v1\(1\) INTO v_created/)
})
