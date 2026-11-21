import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const fullSql=read('supabase/migrations/20261120235700_saturn_youth_academy_player_expiry_v1.sql')
const [sql,registrationRules]=fullSql.split('-- Updated Saturn product decision:')
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
 assert.doesNotMatch(sql,/^\\s*(?:REVOKE\\s|GRANT\\s|DROP\\s+FUNCTION\\s|ALTER\\s+TABLE[^\\n]*DISABLE\\s+ROW\\s+LEVEL\\s+SECURITY)/mi)
 assert.match(sql,/welcome Premium trial does NOT automatically grant paid Youth Academy/)
})
test.todo('staging: expired linked but unconverted manager cannot enter Youth race or modify lineup')
test.todo('staging: expired manager cannot transfer Academy budget or run Youth scouting')
test.todo('staging: expired manager can still READ Academy calendar, history and finances')
test.todo('staging: active unconverted manager cannot access Youth Academy even with paid Premium')
test.todo('staging: ordinary/converted paid Academy owners retain writes, including correct Coins and finance')
test.todo('staging: scheduler Academy maintenance and race processing work after migration')

test('canonical registration requirement considers linked but unconverted identities',()=>{
 assert.match(registrationRules,/u\.is_anonymous is false/)
 assert.match(registrationRules,/t\.converted_at is null/)
 assert.match(registrationRules,/private\.saturn_is_permanently_registered_v1\(p_user_id\)[\s\S]*public\.user_has_paid_premium_access_v1/)
})
test('coin ledger, wallet, developing clubs and academy enforce registration server-side',()=>{
 for(const name of ['coin_ledger','wallet','developing_club','youth_academy']){
  assert.match(registrationRules,new RegExp('create trigger saturn_guard_'+name+'_v1 before insert'))
 }
 assert.match(registrationRules,/old\.converted_at is null and new\.converted_at is not null/)
 assert.match(registrationRules,/apply_coin_delta\(new\.user_id,20,'welcome'/)
 assert.match(registrationRules,/'system_key','welcome_coins_v1'/)
})
test('restricted pages and checkout endpoints require verified permanent account',()=>{
 const gate=read('src/components/trial/PermanentRegistrationGate.tsx')
 assert.match(gate,/\.select\('converted_at'\)/)
 assert.match(gate,/!error && \(!data \|\| Boolean\(data\.converted_at\)\)/)
 const app=read('src/App.tsx')
 for(const page of ['DevelopingTeamPage','YouthAcademyPage','YouthRaceDetailPage','YouthAcademyTeamProfilePage','YouthRiderProfilePage','InviteFriendsPage']) {
  assert.ok(app.includes('<PermanentRegistrationGate><'+page+' />'))
 }
 for(const endpoint of ['create-coin-checkout','create-premium-checkout','create-premium-portal']){
  const edge=read('supabase/functions/'+endpoint+'/index.ts')
  assert.match(edge,/is_anonymous !== false/)
  assert.match(edge,/trialError \|\| \(trial && !trial\.converted_at\)/)
  assert.match(edge,/403, origin/)
 }
})

test('runtime registration guard SQL is identical to draft migration',()=>{
 const fixture=read('supabase/tests/fixtures/saturn_lifecycle_runtime.sql')
 const snapshot=fixture.split('-- Updated Saturn product decision:')[1].split('-- END SATURN REGISTRATION RULES SNAPSHOT')[0].trim()
 assert.equal(snapshot,registrationRules.trim())
})
