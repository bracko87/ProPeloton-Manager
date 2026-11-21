import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql=readFileSync(new URL('../supabase/migrations/20261120235800_saturn_sponsor_and_branding_write_expiry_v1.sql',import.meta.url),'utf8')
const funcs=[
 ['sponsor_prepare_main_offer_deal_metadata_v1','v_offer.club_id',"Not allowed to update this sponsor offer."],
 ['sponsor_set_objective_target_v1','v_club_id',"Not allowed to update sponsor objective target."],
 ['sponsor_sign_offer','v_offer.club_id','You do not own this club'],
 ['update_club_branding_v1','p_club_id','Only the club owner can customize club branding.'],
]
for(const [i,[name,club,error]] of funcs.entries()){
 test(name+' checks unconverted Saturn expiry after owner authorization, before write',()=>{
  const a=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const b=i+1<funcs.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+funcs[i+1][0]+'('):sql.length
  assert.ok(a>=0 && b>a,'missing '+name)
  const body=sql.slice(a,b)
  const owner=body.indexOf(error)
  const lifecycle=body.indexOf('public.saturn_test_account_requires_guard_v1()')
  const ownClub=body.indexOf('public.saturn_test_account_can_mutate_v1('+club+')')
  assert.ok(owner>=0 && lifecycle>owner && ownClub>lifecycle,name+' must retain owner check before new trial guard')
  assert.match(body,/using errcode='42501'/)
  assert.doesNotMatch(body,/is_anonymous/)
 })
}
test('does not override sponsor payout, season engine or read-only dashboards',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(?:sponsor_pay_|sponsor_process_|process_sponsors_|sponsor_get_dashboard|finance_grant_sponsor_contract_payment)/)
 assert.doesNotMatch(sql,/^\s*(?:REVOKE|GRANT|DROP FUNCTION|DROP TABLE)/mi)
})
test.todo('staging: expired linked but unconverted manager cannot sign sponsor offer')
test.todo('staging: expired manager cannot change sponsor deal, objective or club branding')
test.todo('staging: active owner can sign valid sponsor while preserving one-time financial credits')
test.todo('staging: normal and fully converted managers retain prior sponsor and branding permissions')
test.todo('staging: sponsor season engine and automated objective payouts still work')
test.todo('staging: expired player can still view sponsor dashboard, offers and history')
