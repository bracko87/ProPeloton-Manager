import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8')
const sql = read('supabase/migrations/20261117110000_prepare_full_s1_restart_maintenance_access_gate_v1.sql')
const page = read('src/components/season/CyclingSeasonWindowBoundary.tsx')

test('reset maintenance gate is created locked off and cannot be activated before verified backup', () => {
  assert.match(sql,/game_world_reset_maintenance_gate_v1/)
  assert.match(sql,/locked boolean NOT NULL DEFAULT false/)
  assert.match(sql,/VALUES\(true,false\)/)
  assert.match(sql,/game_world_reset_execution_signoffs_v1/)
  assert.match(sql,/s\.backup_verified=true/)
  assert.match(sql,/s\.national_calendar_rebuild_verified=true/)
  assert.match(sql,/s\.player_clubs_preserved=true/)
  assert.match(sql,/s\.reset_validator_updated=true/)
  assert.match(sql,/s\.signed_off_at IS NOT NULL/)
  assert.match(sql,/WHERE id=p_reset_run_id AND status='preflight'/)
})

test('maintenance public status is separated from old migration and has no fabricated reopening time', () => {
  assert.match(sql,/'reset_maintenance'/)
  assert.match(sql,/'restart_locked'/)
  assert.match(sql,/g\.locked,false/)
  assert.match(sql,/WHEN coalesce\(g\.locked,false\) OR w\.phase='off' THEN null/)
  assert.match(sql,/THEN 1 WHEN w\.phase='off'/)
  assert.doesNotMatch(sql,/UPDATE public\.game_state|UPDATE public\.game_clock_config/)
})

test('new login sessions are rejected when maintenance is active', () => {
  assert.match(sql,/cycling_reject_new_session_during_migration_v1/)
  assert.match(sql,/game_world_reset_maintenance_gate_v1 WHERE id=true AND locked=true/)
  assert.match(sql,/Sign-in is unavailable while Season 1 is being safely restarted/)
  assert.match(sql,/REVOKE ALL ON FUNCTION private\.game_world_reset_activate_maintenance_v1\(uuid\) FROM PUBLIC,anon,authenticated/)
})

test('maintenance screen hides game content, does not promise opening date or allow inspector bypass', () => {
  assert.match(page,/type Phase = .*'reset_maintenance'/)
  assert.match(page,/restart_locked: boolean/)
  assert.match(page,/if \(windowStatus\.restart_locked\) \{/)
  assert.match(page,/if \(windowStatus\.locked\) \{/)
  assert.ok(page.indexOf('if (windowStatus.restart_locked)') < page.indexOf('if (windowStatus.locked)'))
  assert.match(page,/A fresh Season 1 is being prepared/)
  assert.match(page,/Ein[e]? neue Saison 1 wird vorbereitet/)
  assert.match(page,/An opening date has not yet been confirmed/)
  assert.doesNotMatch(page,/restartReopen:.*\{.*resume_at/)
  const block = page.split('if (windowStatus.restart_locked) {')[1]?.split('if (windowStatus.locked) {')[0]
  assert.ok(block)
  assert.doesNotMatch(block,/inspectorReport|children|CyclingAdminInspection|Navigate/)
  assert.match(page,/Authorized migration inspection/)
})
