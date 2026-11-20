import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261120183000_saturn_active_trial_equipment_write_guards_v1.sql', import.meta.url), 'utf8')
const names = [
 'equipment_discard_item',
 'equipment_purchase_item',
 'equipment_purchase_race_supplies',
 'equipment_save_auto_restock_rule_v1',
 'equipment_save_default_setup',
 'equipment_save_setup_preset',
]
for (const [index,name] of names.entries()) {
 test(name+' enforces test expiry and exact owner club prior to equipment operations',()=>{
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
   const end=index+1<names.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+names[index+1]+'('):sql.length
   assert.ok(start>=0 && end>start)
   const body=sql.slice(start,end)
   const guard=body.indexOf('not public.saturn_test_account_can_mutate_v1(p_club_id)')
   const normalAccess=body.indexOf('v_club_id := public.equipment_assert_club_access(p_club_id)')
   assert.ok(guard>=0,name+' lacks expired test block')
   assert.ok(normalAccess===-1 || guard<normalAccess,name+' must stop before modifying equipment')
   assert.match(body,/saturn_test_account_requires_guard_v1\(\)/)
   assert.match(body,/using errcode='42501'/)
 })
}
test('permanent players have unchanged existing Auth/equipment entitlement logic',()=>{
 assert.doesNotMatch(sql,/drop function|drop trigger|disable row level security|grant all/i)
 assert.match(sql,/equipment_assert_club_access\(p_club_id\)/)
})
test.todo('staging: test user can purchase, discard, and configure equipment while trial active')
test.todo('staging: expired test user cannot purchase, discard, or change equipment setup')
test.todo('staging: normal registered equipment actions and paid-only premium checks unchanged')
test.todo('staging: verify direct table updates and maintenance/repair/sale RPCs separately')
