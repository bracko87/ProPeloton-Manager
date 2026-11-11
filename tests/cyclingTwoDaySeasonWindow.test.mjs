import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const sql = read('../supabase/migrations/20261111143000_cycling_two_day_season_window_v1.sql')
const windowUI = read('../src/components/season/CyclingSeasonWindowBoundary.tsx')
const app = read('../src/App.tsx')

test('real time windows last at least 24h each and never unpause before validated migration', () => {
  assert.match(sql, /migration_until_at=now\(\)\+interval '24 hours'/)
  assert.match(sql, /resume_at=now\(\)\+interval '24 hours'/)
  assert.match(sql, /now\(\)<w\.migration_until_at/)
  assert.match(sql, /now\(\)<w\.resume_at/)
  assert.match(sql, /r\.status='completed'/)
  assert.match(sql, /r\.validation_report->'final'->>'ok'/)
  assert.match(sql, /lr\.status='completed'/)
  assert.match(sql, /IF NOT v_verified THEN/)
  assert.match(sql, /SET phase='delayed'/)
})

test('cycling transition wraps existing v2 migration instead of rebuilding race results', () => {
  assert.match(sql, /season_transition_boundary_controller_v2\(/)
  assert.match(sql, /season_transition_engine_resume_completed_v2\(/)
  assert.match(sql, /v_boundary:=public\.cycling_season_boundary_hold_v1/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.tick_cycling_season_window_v1/)
  assert.match(sql, /mode='production'/)
  assert.doesNotMatch(sql, /DELETE FROM public\.races/)
  assert.doesNotMatch(sql, /UPDATE public\.race_stage_results/)
})

test('the migration locks before processing and keeps the source season protected', () => {
  assert.match(sql, /phase='migration',source_season=v_source,target_season=v_target/)
  assert.match(sql, /hour_number=23,minute_number=59/)
  assert.match(sql, /is_paused=true/)
  assert.match(sql, /'held_at','Dec 31 23:59:59'/)
  assert.match(sql, /'migration_reopen_at'/)
  assert.match(sql, /public\.cycling_season_window_v1 ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.cycling_season_window_v1 FROM public,anon,authenticated/)
})

test('preseason opens registration on January 1 but game remains paused', () => {
  assert.match(sql, /g\.season_number=w\.target_season AND g\.month_number=1/)
  assert.match(sql, /g\.day_number=1 AND g\.hour_number=0 AND g\.minute_number=0/)
  assert.match(sql, /phase='preparation',preparation_started_at=now\(\)/)
  assert.match(sql, /UPDATE public\.game_clock_config SET is_paused=true,speed_multiplier=2/)
  assert.match(sql, /SET phase='off',resumed_at=now\(\)/)
  assert.match(sql, /'speed_multiplier',2/)
})

test('lock screen covers login and dashboard; preparation popup shows timezone and disappears', () => {
  assert.match(app, /<CyclingSeasonWindowBoundary>/)
  assert.match(app, /<\/CyclingSeasonWindowBoundary>/)
  assert.ok(app.indexOf('<CyclingSeasonWindowBoundary>') < app.indexOf('<Routes>'))
  assert.match(windowUI, /get_cycling_public_season_window_v1/)
  assert.match(windowUI, /window\.setInterval\(\(\) => void refresh\(\), 15_000\)/)
  assert.match(windowUI, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(windowUI, /if \(windowStatus\.locked\)/)
  assert.match(windowUI, /windowStatus\.phase === 'preparation'/)
  assert.match(windowUI, /formatForViewer\(windowStatus\.resume_at\)/)
  assert.match(windowUI, /timeZoneName: 'short'/)
  assert.match(windowUI, /Europe\/Berlin|resolvedOptions\(\)\.timeZone/)
  assert.match(windowUI, /to="\/dashboard\/calendar"/)
  assert.match(windowUI, /return \(\s*<WindowContext.Provider/)
})
