import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const sql=readFileSync(new URL('../supabase/migrations/20261120184500_saturn_expired_guest_direct_table_write_rls_v1.sql',import.meta.url),'utf8')
const tables=[
 ['clubs','id'],
 ['club_memberships','club_id'],
 ['club_equipment_inventory','club_id'],
 ['club_finance_summary','club_id'],
 ['club_infrastructure','club_id'],
 ['club_staff','club_id'],
 ['race_team_entries','club_id'],
 ['rider_regular_training_daily_plans','club_id'],
 ['rider_regular_training_management','club_id'],
]
test('RLS helper checks unconverted lifecycle before accepting permanent Auth status',()=>{
 assert.match(sql,/from auth\.users u/)
 assert.match(sql,/when public\.saturn_test_account_requires_guard_v1\(\) then/)
 assert.match(sql,/public\.saturn_test_account_can_mutate_v1\(p_club_id\)/)
 assert.ok(sql.indexOf('when public.saturn_test_account_requires_guard_v1() then') < sql.indexOf('u.is_anonymous is false'))
 assert.match(sql,/u\.is_anonymous is false/)
 assert.match(sql,/grant execute on function public\.saturn_trial_direct_write_allowed_v1\(uuid\)/)
})
for(const [table,col] of tables){
 test('restrictive INSERT, UPDATE and DELETE for '+table+' keep SELECT intact',()=>{
  const target='on public.'+table
  const section=sql.split('-- Direct writes only: SELECT remains readable after account expiration.').find(x=>x.includes('alter table public.'+table+' enable row level security;'))
  assert.ok(section,'missing '+table)
  for(const operation of ['insert','update','delete']){
    const policy='saturn_trial_'+table+'_'+operation+'_v1'
    assert.ok(section.includes('create policy '+policy+target+'\n  as restrictive for '+operation+' to authenticated') ||
      section.includes('create policy '+policy+' '+target+'\n  as restrictive for '+operation+' to authenticated'),policy)
  }
  assert.ok(section.includes('public.saturn_trial_direct_write_allowed_v1('+col+')'))
  assert.doesNotMatch(section,/for select|drop policy.*select|force row level security/i)
 })
}
test('no change to game engine or permanent registered user rewards',()=>{
 assert.doesNotMatch(sql,/create or replace function public\.create_club|user_premium_subscriptions|DROP TRIGGER|disable row level security|grant all/i)
})
test.todo('staging: direct expired guest INSERT/UPDATE/DELETE denied for every affected table')
test.todo('staging: direct normal user writes retain their previous existing RLS authorization')
test.todo('staging: guest creation transaction and game engine scheduler bypassed RLS only as intended')
test.todo('staging: other less common game tables and security-definer functions audited separately')
