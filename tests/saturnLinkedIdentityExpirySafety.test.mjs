import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const migration = n => read('supabase/migrations/'+n)
const race = migration('20261120170000_saturn_active_test_race_application_guard_v1.sql')
const rls = migration('20261120184500_saturn_expired_guest_direct_table_write_rls_v1.sql')
const reviewed=[
 ['20261120170000_saturn_active_test_race_application_guard_v1.sql',2],
 ['20261120180000_saturn_active_trial_training_staff_write_guards_v1.sql',6],
 ['20261120183000_saturn_active_trial_equipment_write_guards_v1.sql',6],
 ['20261120193000_saturn_active_trial_transfers_finance_guards_v1.sql',7],
 ['20261120200000_saturn_active_trial_riders_facilities_finance_v1.sql',7],
]

test('unconverted Saturn lifecycle record, NOT is_anonymous, determines trial guard',()=>{
 const helper=race.slice(
  race.indexOf('create or replace function public.saturn_test_account_requires_guard_v1()'),
  race.indexOf('create or replace function public.saturn_test_account_can_mutate_v1(')
 )
 assert.match(helper,/from public\.saturn_test_accounts_v1 t/)
 assert.match(helper,/t\.user_id=auth\.uid\(\) and t\.converted_at is null/)
 assert.doesNotMatch(helper,/is_anonymous|raw_user_meta_data|auth\.jwt/)
 assert.match(helper,/security definer/)
})

test('a linked but unconverted player has the same 14-day club and expiry checks',()=>{
 const helper=race.slice(
   race.indexOf('create or replace function public.saturn_test_account_can_mutate_v1('),
   race.indexOf('-- Retain original permanent-user behavior.')
 )
 for(const check of [
  't.club_id=p_club_id','c.owner_user_id=u.id','c.is_ai is false',
  'c.is_active is true',"c.club_type='main'",
  't.started_at <= now()','t.expires_at > now()',
  't.converted_at is null'
 ]) assert.ok(helper.includes(check),check)
 assert.doesNotMatch(helper,/is_anonymous/, 'a linked email/Google identity must not lose active trial permissions')
})

test('all 28 reviewed player-write RPCs enforce lifecycle guard, not Auth anonymity',()=>{
 let total=0
 for(const [filename,expected] of reviewed){
  const sql=migration(filename)
  const count=(sql.match(/if public\.saturn_test_account_requires_guard_v1\(\)/g)||[]).length
  assert.equal(count,expected,filename)
  assert.doesNotMatch(sql,/if\s+exists\s*\(\s*select\s+1\s+from\s+auth\.users[^;]*is_anonymous\s*(?:is\s*)?true/i,
   'remaining Auth-only test writer guard in '+filename)
  total+=count
 }
 assert.equal(total,28)
})

test('RLS checks unconverted lifecycle before permanent Auth fast path',()=>{
 const helper=rls.slice(
  rls.indexOf('create or replace function public.saturn_trial_direct_write_allowed_v1('),
  rls.indexOf('-- Direct writes only: SELECT remains readable after account expiration.')
 )
 const unconverted=helper.indexOf('when public.saturn_test_account_requires_guard_v1() then')
 const active=helper.indexOf('public.saturn_test_account_can_mutate_v1(p_club_id)')
 const permanent=helper.indexOf('u.is_anonymous is false')
 assert.ok(unconverted>0 && active>unconverted && permanent>active)
 assert.match(helper,/when auth\.uid\(\) is null or p_club_id is null then false/)
 assert.match(helper,/else false/)
 assert.match(helper,/grant execute on function public\.saturn_trial_direct_write_allowed_v1\(uuid\)/)
})

test.todo('staging JWT: 14-day ACTIVE unconverted linked-email user still has authorized own-club writes')
test.todo('staging JWT: expired unconverted Google-linked nonanonymous user denied RPC and direct table writes')
test.todo('staging JWT: fully converted original UUID retains normal registered-player permissions')
test.todo('staging JWT: ordinary registered account without Saturn lifecycle remains unaffected')
