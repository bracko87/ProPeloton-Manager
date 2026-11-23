import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
const callback = read('src/components/auth/SignupEmailCallbackRouting.tsx')
const google = read('src/components/auth/GoogleAuthEntry.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const sql = read('supabase/migrations/20261123133800_saturn_promotion_balance_and_same_rider_skills_once_v1.sql')

test('Google OAuth/email callback is canonicalized to root WITHOUT reloading in-memory Auth',()=>{
  assert.match(callback, /normalizeVerifiedCallbackPath/)
  assert.match(callback, /window\.history\.replaceState/)
  assert.match(callback, /window\.location\.origin \+ '\/' \+ window\.location\.hash/)
  assert.match(callback, /normalizeVerifiedCallbackPath\(\)[\s\S]*?navigate\(data \? '\/dashboard\/overview'/)
  assert.match(callback, /normalizeVerifiedCallbackPath\(\)[\s\S]*?navigate\('\/test-account-register'/)
  assert.doesNotMatch(callback, /window\.location\.(?:reload|replace|assign)\(/)
  assert.match(sidebar, /<NavLink[\s\S]*?to=\{item\.to\}/)
})

test('Google signup and login share the authentic four-color G mark',()=>{
  assert.match(google, /<svg aria-hidden="true"/)
  assert.match(google, /#EA4335/)
  assert.match(google, /#4285F4/)
  assert.match(google, /#FBBC05/)
  assert.match(google, /#34A853/)
  assert.doesNotMatch(google, />G<\/span>/)
  assert.match(google, /purpose === 'register'/)
})

test('promoted guest teams are aligned exactly once from official destination-tier profile',()=>{
  assert.match(sql, /private\.saturn_converted_promotion_alignment_v1/)
  assert.match(sql, /on conflict\(club_id\) do nothing/i)
  assert.match(sql, /after insert[\s\S]*?private\.saturn_converted_team_placements_v1/)
  assert.match(sql, /v_profile\.avg_overall_target/)
  assert.match(sql, /v_profile\.starting_cash_user/)
  assert.match(sql, /_apply_new_club_starting_cash_v1/)
  assert.match(sql, /v_club\.cash_balance/)
  assert.match(sql, /auth\.users u/)
  assert.match(sql, /club_memberships m/)
  assert.match(sql, /revoke all on function private\.saturn_align_converted_team_v1/)
  assert.doesNotMatch(sql, /perform public\.apply_new_club_creation_balance_v1\(/i)
})

test('skills preserve rider identity and speciality; sponsors, equipment and infrastructure untouched',()=>{
  for(const col of ['sprint','climbing','time_trial','endurance','flat','recovery','resistance','race_iq','teamwork']){
    assert.match(sql, new RegExp(col+'=least\\('), col)
  }
  assert.match(sql, /potential=least\(/)
  assert.doesNotMatch(sql,/delete from public\.(?:riders|club_riders)/i)
  assert.doesNotMatch(sql,/insert into public\.(?:riders|club_riders)/i)
  assert.doesNotMatch(sql,/update public\.(?:club_sponsors|club_equipment_inventory|club_infrastructure|club_team_policies)/i)
})
