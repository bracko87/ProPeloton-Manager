import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')

test('Saturn only changes ProPeloton and keeps the complete 21-item checklist', () => {
  const plan = read('PROJECT_SATURN.md')
  assert.match(plan, /ProPeloton Manager ONLY/)
  assert.match(plan, /Project Helios/)
  assert.equal((plan.match(/^- \[ \] \*\*SAT-/gm) ?? []).length, 21)
})

test('admin analytics still requires a server-side administrator and denies anonymous EXECUTE', () => {
  const sql = read('supabase/migrations/20261120095000_saturn_admin_analytics_freshness_and_integrity.sql')
  assert.match(sql, /if not public\.is_app_admin_v1\(\) then/)
  assert.match(sql, /revoke execute on function public\.get_admin_analytics_dashboard_v1\(integer\) from public,anon/)
  assert.match(sql, /grant execute on function public\.get_admin_analytics_dashboard_v1\(integer\) to authenticated,service_role/)
  assert.match(sql, /'timezone', 'UTC'/)
  assert.match(sql, /'generated_at'/)
  assert.match(sql, /'reconciliation'/)
  assert.match(sql, /'totals_match'/)
  assert.match(sql, /'recent_sessions_5m'/)
})

test('Cycling admin UI shows server freshness and cross-table reconciliation without mislabeling presence', () => {
  const page = read('src/pages/dashboard/AdminAnalyticsPage.tsx')
  assert.match(page, /'get_admin_analytics_dashboard_v1'/)
  assert.match(page, /title="Recently recorded website activity"/)
  assert.match(page, /title="Tracking integrity"/)
  assert.match(page, /These are NOT live player connections/)
  assert.match(page, /Server generated:/)
  assert.match(page, /Last recorded page navigation:/)
  assert.match(page, /data\.reconciliation\.totals_match/)
  assert.match(page, /window\.setInterval\(refreshIfVisible, 60_000\)/)
})
