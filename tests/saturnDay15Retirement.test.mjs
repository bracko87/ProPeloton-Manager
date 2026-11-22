import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261122162728_saturn_day15_guest_retirement_v1.sql')
test('expiry targets only unconverted elapsed trials and locks conversion row',()=>{
 assert.match(sql,/t\.converted_at is null and t\.expires_at<=clock_timestamp\(\)/)
 assert.match(sql,/for update of t skip locked/)
 assert.match(sql,/club\.owner_user_id=t\.user_id/)
 assert.match(sql,/clock_timestamp\(\)>=old\.expires_at/)
 assert.match(sql,/revoke all on function control_center_private\.retire_expired_saturn_test_clubs_v1/)
 assert.doesNotMatch(sql,/delete from public\.clubs|delete from public\.race_stage_results|replace_90d_inactive_human_clubs_v1\(/)
})
test('retirement restores separate regional AI reserve, preserves occupancy and history',()=>{
 assert.match(sql,/ai\.tier3_division='ai_pool'/)
 assert.match(sql,/safe_get_amateur_division_for_country\(ai\.country_code\)=v_division/)
 assert.match(sql,/Trial retirement would change division occupancy/)
 assert.match(sql,/race_in_progress_or_due/)
 assert.match(sql,/race\.start_date>v_game/)
 assert.match(sql,/delete from auth\.sessions/)
 assert.match(sql,/delete from public\.club_memberships/)
 assert.match(sql,/from public\.club_riders/)
})
test('real-time scheduled cleanup and expiry messaging',()=>{
 assert.match(read('supabase/migrations/20261122162841_saturn_day15_schedule_v1.sql'),/\*\/15 \* \* \* \*/)
 assert.match(read('src/App.tsx'),/RequireUnexpiredTestAccount/)
 assert.match(read('src/pages/TestTeamSignup.tsx'),/Unregistered teams are removed on day 15/)
 assert.match(read('src/components/trial/TestAccountExpiry.tsx'),/now>=term\.expiry/)
})
