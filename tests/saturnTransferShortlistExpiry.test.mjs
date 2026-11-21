import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync(new URL('../supabase/migrations/20261120235900_saturn_transfer_shortlist_saved_search_expiry_v1.sql',import.meta.url),'utf8')
const names=['transfer_add_rider_to_shortlist_v2','transfer_add_shortlist_target_v1','transfer_delete_saved_search_v1','transfer_remove_rider_from_shortlist_v2','transfer_save_market_search_v1']
for(const [i,name] of names.entries()){
 test(name+' blocks unconverted expired test user before shortlist/Coins mutation',()=>{
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const end=i+1<names.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+names[i+1]+'('):sql.length
  assert.ok(start>=0&&end>start,name)
  const body=sql.slice(start,end)
  const guard=body.indexOf('public.saturn_test_account_requires_guard_v1()')
  const club=body.indexOf('public.saturn_test_account_can_mutate_v1(')
  const write=Math.min(...['insert into public.','update public.','delete from public.'].map(x=>{const n=body.toLowerCase().indexOf(x);return n<0?Infinity:n}))
  assert.ok(guard>0&&club>guard&&write>club,name+' must check before game writes')
  assert.match(body,/using errcode='42501'/)
  if(name!=='transfer_delete_saved_search_v1'){
    assert.ok(body.indexOf('transfer_assert_owned_main_club_v1(p_club_id)')<guard,'ownership check must precede guard')
  }else{
    assert.ok(body.includes('public.get_my_primary_club_id()'))
    assert.ok(body.includes('c.owner_user_id = auth.uid()'))
  }
 })
}
test('no transfer market reading or scheduler functions overridden',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(?:transfer_get_|transfer_refresh_|get_market_|transfer_assert_owned_main_club)/)
 assert.doesNotMatch(sql,/^\s*(?:REVOKE|GRANT|DROP FUNCTION|DROP TABLE)/mi)
 assert.doesNotMatch(sql,/beginclub=>|undefined/)
})
test.todo('staging: active unconverted player can save and remove shortlist normally')
test.todo('staging: expired linked Google/email unconverted cannot save/delete shortlist')
test.todo('staging: expired linked unconverted cannot spend Coins adding riders')
test.todo('staging: market browse and shortlist READ remain available after 14-day expiry')
test.todo('staging: converted and ordinary player shortlist/Coins flows unchanged')
