import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261120235700_saturn_youth_academy_player_expiry_v1.sql')
const functions=[
 'decline_my_youth_race_invitation_v1',
 'enter_my_youth_race_v1',
 'run_my_youth_scouting_search_v2',
 'save_my_youth_race_lineup_v1',
 'transfer_my_youth_academy_budget_v1',
 'update_my_youth_training_philosophy_v1',
]
for(const [i,name] of functions.entries()){
 test(name+' checks unconverted Saturn identity and own club before Youth writes',()=>{
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const end=i+1<functions.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+functions[i+1]+'('):sql.length
  assert.ok(start>=0 && end>start,name+' missing')
  const body=sql.slice(start,end)
  const authenticated=body.indexOf("if v_user is null then raise exception 'Not authenticated'")
  const gate=body.indexOf('public.saturn_test_account_requires_guard_v1()')
  const club=body.indexOf('public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())')
  const premium=body.indexOf('user_has_youth_academy_access_v1(v_user)')
  assert.ok(authenticated>0 && gate>authenticated && club>gate && premium>club,name+' must check expiry before paid academy actions')
  assert.match(body,/using errcode='42501'/)
  assert.doesNotMatch(body,/is_anonymous/)
 })
}
test('Youth Academy read-only and scheduler functions are not replaced',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(?:get_my_youth|process_youth_|run_youth_academy_season_transition|finance_process_monthly_youth)/)
 assert.doesNotMatch(sql,/REVOKE|GRANT|DISABLE ROW LEVEL SECURITY|DROP FUNCTION/i)
 assert.match(sql,/welcome Premium trial does NOT automatically grant paid Youth Academy/)
})
test.todo('staging: expired linked but unconverted manager cannot enter Youth race or modify lineup')
test.todo('staging: expired manager cannot transfer Academy budget or run Youth scouting')
test.todo('staging: expired manager can still READ Academy calendar, history and finances')
test.todo('staging: active unconverted manager retains only allowed paid Academy access')
test.todo('staging: ordinary/converted paid Academy owners retain writes, including correct Coins and finance')
test.todo('staging: scheduler Academy maintenance and race processing work after migration')
