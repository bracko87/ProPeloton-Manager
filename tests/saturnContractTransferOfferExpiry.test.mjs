import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync(new URL('../supabase/migrations/20261120235910_saturn_contract_transfer_offer_expiry_v1.sql',import.meta.url),'utf8')
const rows=[
 ['cancel_rider_transfer_listing','v_listing.seller_club_id','Not allowed to cancel listings for this club'],
 ['reject_rider_transfer_offer','v_offer.seller_club_id','Not allowed to reject offers for this club'],
 ['submit_contract_renewal_offer','v_neg.club_id','Negotiation does not belong to your main club.'],
 ['withdraw_rider_transfer_offer','v_buyer_club_id','You cannot cancel this offer']
]
for(const [i,[name,club,ownerMessage]] of rows.entries()){
 test(name+' validates club ownership and original trial before modifications',()=>{
  const begin=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const end=i+1<rows.length?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+rows[i+1][0]+'('):sql.length
  assert.ok(begin>=0&&end>begin,'missing '+name)
  const body=sql.slice(begin,end)
  const owner=body.indexOf(ownerMessage)
  const guard=body.indexOf('public.saturn_test_account_requires_guard_v1()')
  const clubCheck=body.indexOf('public.saturn_test_account_can_mutate_v1('+club+')')
  const firstWrite=Math.min(...['update public.','insert into public.','delete from public.'].map(w=>{const n=body.toLowerCase().indexOf(w);return n<0?Infinity:n}))
  assert.ok(owner>0&&guard>owner&&clubCheck>guard&&firstWrite>clubCheck,'guard must follow owner check, precede writes: '+name)
  assert.match(body,/using errcode='42501'/)
  assert.doesNotMatch(body,/is_anonymous/)
 })
}
test('read-only and engine transfer routines are not overridden',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(?:staff_get_contract_extension_quote|calculate_ai_unsolicited_transfer_decision|process_due_rider_contract_starts|expire_rider_market_items)/)
 assert.doesNotMatch(sql,/^\s*(?:REVOKE|GRANT|DROP FUNCTION|DROP TABLE)/mi)
})
test.todo('staging: linked expired test manager cannot cancel rider listing')
test.todo('staging: linked expired test manager cannot reject incoming transfer offer')
test.todo('staging: linked expired test manager cannot renew rider contract')
test.todo('staging: linked expired test manager cannot withdraw pending transfer offer')
test.todo('staging: normal and verified converted owners retain all four transfer actions')
test.todo('staging: expired owners still see transfer and contract history and quotes')
