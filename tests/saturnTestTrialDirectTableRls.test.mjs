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
test('helper requires canonical anonymous Auth and exact active owned test club',()=>{
 assert.match(sql,/from auth\.users u/)
 assert.match(sql,/u\.is_anonymous is true/)
 assert.match(sql,/t\.club_id=p_club_id/)
 assert.match(sql,/c\.owner_user_id=u\.id/)
 assert.match(sql,/t\.expires_at>now\(\)/)
 assert.match(sql,/t\.started_at<=now\(\)/)
 assert.match(sql,/t\.converted_at is null/)
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
