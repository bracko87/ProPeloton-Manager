import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261122211500_saturn_privileged_view_private_field_masking.sql')

test('SAT-09 exact fields masked inside the current API view names, not only hidden in React', () => {
  const views = [
    'club_profile_popup_view',
    'rider_statistics_page_international_v1',
    'rider_statistics_page_view',
    'rider_statistics_view',
    'v_rider_modal_skill_ui',
    'v_rider_skill_card_deltas',
    'v_rider_latest_weekly_change_ui',
    'v_rider_latest_weekly_visible_deltas_ui',
    'race_participant_riders_v1',
  ]
  for (const view of views) assert.ok(sql.includes("'" + view + "'"), 'Missing view ' + view)
  assert.match(sql, /create or replace view public\.%I with \(security_barrier=true\)/i)
  assert.match(sql, /pg_get_viewdef\(c\.oid,\s*true\)/i)
  assert.match(sql, /order by a\.attnum/i)
  assert.match(sql, /CASE WHEN saturn_acl\.permitted THEN src\./)
  assert.match(sql, /ELSE NULL END AS/)
  assert.match(sql, /v_count <> cardinality\(v_sensitive\)/)
  assert.match(sql, /private\.saturn_sensitive_view_originals_20261122/)
  assert.match(sql, /refusing double wrapping/i)
})

test('SAT-09 uses JWT ownership, not authenticated role alone', () => {
  assert.match(sql, /auth\.uid\(\) is not null/i)
  assert.match(sql, /c\.owner_user_id = auth\.uid\(\)/)
  assert.match(sql, /cm\.user_id = auth\.uid\(\)/)
  assert.match(sql, /cr\.rider_id = p_rider_id/)
  assert.match(sql, /c\.deleted_at is null/)
  assert.match(sql, /security definer\s+set search_path = ''/gi)
  assert.match(sql, /revoke all on function private\.saturn_can_view_club_private_v1/)
  assert.match(sql, /revoke all on function private\.saturn_can_view_rider_private_v1/)
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.(riders|club_finance_summary)\s+to\s+anon/i)
})

test('SAT-09 all previously exposed fields are masked and identities/standings are not removed', () => {
  for (const key of ['club_cash_balance','current_balance','weekly_income','weekly_expenses',
      'wage_total','active_sponsor_monthly_total','main_sponsor_monthly_amount',
      'overall','potential','sprint','climbing','time_trial','endurance','flat',
      'recovery','resistance','race_iq','teamwork','morale','salary',
      'contract_expires_season','fatigue','current_value','old_value','new_value',
      'delta_value','changed_attributes','source_summary']) {
    assert.ok(sql.includes("'" + key + "'"), key + ' not masked')
  }
  assert.doesNotMatch(sql, /'season_points_overall'\s*,|'international_points'\s*,|'club_name'\s*,|'display_name'\s*,|'world_rank'\s*,/)
  assert.match(sql, /v_scope_function:='private\.saturn_can_view_rider_private_v1'/)
  assert.match(sql, /v_scope_function:='private\.saturn_can_view_club_private_v1'/)
})

test('SAT-09 verification is read only, includes anon and role-without-JWT', () => {
  const verify = read('supabase/tests/saturn_privileged_view_private_field_mask_verify_readonly.sql')
  assert.equal((verify.match(/^begin read only;/gm) || []).length, 2)
  assert.equal((verify.match(/^rollback;/gm) || []).length, 2)
  assert.match(verify, /^set local role anon;/m)
  assert.match(verify, /^set local role authenticated;/m)
  assert.doesNotMatch(verify.replace(/^--.*$/gm, ''), /\b(insert|update|delete|drop|truncate|alter|grant|revoke)\b/i)
  assert.match(verify, /base_rider_rows/)
  assert.match(verify, /public_rider_stat_rows/)
  assert.match(verify, /exposed_club_cash/)
  assert.match(verify, /exact_sprint/)
})
