import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261120235500_saturn_additional_equipment_write_expiry_v1.sql')
const names=[
 'equipment_save_default_setup_types',
 'equipment_save_maintenance_reminder_v1',
 'equipment_sell_item',
 'equipment_start_maintenance',
 'equipment_unlock_setup_slot_v1'
]
for(const [i,name] of names.entries()){
 test(name+' uses lifecycle expiry before all equipment writes',()=>{
  const a=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const next=i+1<names.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+names[i+1]+'('):sql.length
  assert.ok(a>=0 && next>a, name+' missing')
  const body=sql.slice(a,next)
  const linked=body.indexOf('public.saturn_test_account_requires_guard_v1()')
  const checked=body.indexOf('public.saturn_test_account_can_mutate_v1(p_club_id)')
  const resolver=body.indexOf('v_club_id := public.equipment_assert_club_access(p_club_id)')
  assert.ok(linked>0 && checked>linked && resolver>checked,'guard must precede normal access: '+name)
  assert.match(body,/using errcode='42501'/)
  assert.doesNotMatch(body,/is_anonymous/)
 })
}
test('read-only equipment resolver stays unchanged',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.equipment_assert_club_access\(/)
 assert.doesNotMatch(sql,/REVOKE|GRANT|DROP TABLE|DISABLE ROW LEVEL SECURITY/i)
})
test.todo('staging: expired linked unconverted manager cannot initiate maintenance or sell equipment')
test.todo('staging: expired linked unconverted manager cannot save default setup types or preferences')
test.todo('staging: expired linked unconverted manager cannot spend Coins unlocking equipment slots')
test.todo('staging: expired test user can still READ owned inventory/market/dashboard through shared access helper')
test.todo('staging: verified converted and ordinary managers can still use equipment actions')
