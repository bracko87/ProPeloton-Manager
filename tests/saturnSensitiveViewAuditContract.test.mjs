import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('SAT-08 sensitive view audit is read-only and tests both public SQL roles', () => {
  const sql = read('supabase/tests/saturn_sensitive_view_privilege_audit_readonly.sql')
  assert.equal((sql.match(/^begin read only;/gm) || []).length, 2)
  assert.equal((sql.match(/^rollback;/gm) || []).length, 2)
  assert.match(sql, /^set local role anon;/m)
  assert.match(sql, /^set local role authenticated;/m)
  assert.doesNotMatch(
    sql.replace(/^--.*$/gm, ''),
    /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|commit|do\s+\$\$|call\s+)\b/i,
  )
  for (const name of [
    'club_profile_popup_view',
    'rider_statistics_page_international_v1',
    'rider_statistics_page_view',
    'rider_statistics_view',
    'v_rider_modal_skill_ui',
    'v_rider_skill_card_deltas',
    'v_rider_latest_weekly_visible_deltas_ui',
    'club_finance_summary',
    'riders',
  ]) {
    assert.ok(sql.includes(name), 'Missing view/table audit: ' + name)
  }
  assert.doesNotMatch(sql, /select\s+\*/i)
})

test('SAT-08 remediation preserves public rankings and avoids unsafe blanket revocations', () => {
  const notes = read('docs/SATURN_SENSITIVE_VIEW_PRIVACY_AUDIT_2026-11-22.md')
  assert.match(notes, /Confirmed exposure \/ not yet remediated/i)
  assert.match(notes, /security_invoker/i)
  assert.match(notes, /authenticated/i)
  assert.match(notes, /Public rankings/i)
  assert.match(notes, /staging/i)
  assert.match(notes, /RiderProfilePublicPage\.tsx/)
  assert.match(notes, /TeamProfilePage\.tsx/)
  assert.match(notes, /Do not simply set/i)
  assert.match(notes, /Track follow-up/i)
})
