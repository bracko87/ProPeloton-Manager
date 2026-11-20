import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
const sql=readFileSync(new URL('../supabase/migrations/20261120201500_saturn_expired_trial_rider_vehicle_rls_v1.sql',import.meta.url),'utf8')
const tables=['rider_contracts','club_riders','club_team_cars','club_team_buses','club_equipment_vans']
for(const table of tables){
 test(table+' restricts expired guest INSERT/UPDATE/DELETE but keeps existing SELECT',()=>{
  for(const op of ['insert','update','delete']){
   assert.ok(sql.includes('create policy saturn_trial_'+table+'_'+op+'_v1 on public.'+table))
   assert.ok(sql.includes('as restrictive for '+op+' to authenticated'))
  }
  assert.ok(sql.includes('public.saturn_trial_direct_write_allowed_v1(club_id)'))
 })
}
test('do not enable RLS for currently unreviewed legacy club_roster',()=>{
 assert.doesNotMatch(sql,/alter table public\.club_roster enable row level security/i)
 assert.doesNotMatch(sql,/for select to authenticated|drop table|disable row level security/i)
})
test.todo('staging: existing permanent-player rider/vehicle updates keep working')
test.todo('staging: expired guest cannot modify rider contracts, rider assignments or vehicles')
test.todo('staging: legacy club_roster RLS-disabled write surface reviewed with game-engine compatibility')
