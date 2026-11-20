import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql=readFileSync(new URL('../supabase/migrations/20261120180000_saturn_active_trial_training_staff_write_guards_v1.sql',import.meta.url),'utf8')
const funcs=[
 'clear_rider_daily_training_override_v1',
 'hire_staff_candidate',
 'save_training_camp_day_training_plans',
 'set_regular_training_coach_automation_v1',
 'set_rider_daily_training_override_v1',
 'set_rider_regular_training_management_v1',
]

test('all reviewed training/staff functions contain the server-side expired guest guard',()=>{
 for (const [i,name] of funcs.entries()){
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
   assert.ok(start>=0,name+' source missing')
   const end=i+1<funcs.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+funcs[i+1]+'('):sql.length
   const body=sql.slice(start,end)
   assert.match(body,/from auth\.users u where u\.id=auth\.uid\(\) and u\.is_anonymous is true/)
   assert.match(body,/not public\.saturn_test_account_can_mutate_v1\(/)
   assert.match(body,/using errcode='42501'/)
   assert.match(body,/Test account expired or not eligible for this club/)
 }
})
test('owner-matched club is checked before hiring candidate or changing camp plan',()=>{
 const hire=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.hire_staff_candidate('),sql.indexOf('CREATE OR REPLACE FUNCTION public.save_training_camp_day_training_plans('))
 const camp=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.save_training_camp_day_training_plans('),sql.indexOf('CREATE OR REPLACE FUNCTION public.set_regular_training_coach_automation_v1('))
 assert.ok(hire.indexOf("raise exception 'Main club not found.'")<hire.indexOf('saturn_test_account_can_mutate_v1(v_club_id)'))
 assert.ok(camp.indexOf('v_club_id := public.get_my_club_id()')<camp.indexOf('saturn_test_account_can_mutate_v1(v_club_id)'))
})
test('regular permanent user code remains behind canonical anonymous test only check',()=>{
 assert.equal((sql.match(/u\.is_anonymous is true/g)||[]).length,6)
 assert.equal((sql.match(/saturn_test_account_can_mutate_v1/g)||[]).length,6)
 assert.doesNotMatch(sql,/DROP FUNCTION|DROP POLICY|GRANT ALL|ALTER TABLE.*DISABLE ROW LEVEL SECURITY/i)
})
test.todo('staging: active guest can save an ordinary rider training plan and hire staff')
test.todo('staging: expired guest cannot modify training, camp, coach or staff data')
test.todo('staging: other club IDs cannot be targeted by an active guest')
test.todo('staging: registered account retains all prior training and hiring permissions')
test.todo('staging: check direct table RLS and all remaining RPC mutation paths')
