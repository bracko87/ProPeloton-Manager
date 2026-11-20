import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql=readFileSync(new URL('../supabase/migrations/20261120200000_saturn_active_trial_riders_facilities_finance_v1.sql',import.meta.url),'utf8')
const names=[
 ['finance_issue_emergency_loan','v_finance_club_id'],
 ['purchase_race_replay_access_v1','public.get_my_primary_club_id()'],
 ['release_club_staff','v_staff.club_id'],
 ['release_owned_rider','v_main_club_id'],
 ['release_rider_to_free_agents','v_actor_club_id'],
 ['sell_infrastructure_asset','v_quote.club_id'],
 ['upgrade_club_facility','p_club_id']
]
for(const [i,[name,club]] of names.entries()){
 test(name+' checks active term and club identity for anonymous manager',()=>{
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
   const end=i+1<names.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+names[i+1][0]+'('):sql.length
   assert.ok(start>=0 && end>start,name+' source missing')
   const src=sql.slice(start,end)
   assert.ok(src.includes('public.saturn_test_account_requires_guard_v1()'),name+' must restrict unconverted lifecycle regardless of Auth label')
   assert.ok(src.includes('public.saturn_test_account_can_mutate_v1('+club+')'),name+' must check exact club')
   assert.ok(src.includes("using errcode='42501'"))
   assert.ok(src.includes('Test account expired or not authorized for this club'))
 })
}
test('facility expiry check is before INSERT, not inside infrastructure columns',()=>{
 const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.upgrade_club_facility(')
 assert.ok(start>=0)
 const body=sql.slice(start)
 const check=body.indexOf('saturn_test_account_can_mutate_v1(p_club_id)')
 const insert=body.indexOf('insert into public.club_infrastructure (')
 assert.ok(check>0 && insert>check,'the anonymous expiry guard must precede facility INSERT')
})

test('financial and rider actions keep original paths for normal registered users',()=>{
 assert.match(sql,/public\.finance_issue_emergency_loan_non_ai_core_v1/)
 assert.match(sql,/public\.finance_spend_from_club/)
 assert.match(sql,/public\.finance_credit_to_club/)
 assert.match(sql,/public\.user_coin_ledger/)
 assert.doesNotMatch(sql,/DROP TRIGGER|DROP POLICY|DISABLE ROW LEVEL SECURITY|GRANT ALL|update auth\.users/i)
})
test.todo('staging: active test manager can release owned rider/staff and use permitted facility actions')
test.todo('staging: expired test manager cannot take loan, sell club assets or spend Coins')
test.todo('staging: loans initiated by scheduler/system continue to behave as before')
test.todo('staging: 14-day expiry during transaction cannot be bypassed by retry or concurrent sessions')
test.todo('staging: registered manager retains preexisting finance permissions')
