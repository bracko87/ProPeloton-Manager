import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const rpc = readFileSync(new URL('../supabase/migrations/20261120193000_saturn_active_trial_transfers_finance_guards_v1.sql',import.meta.url),'utf8')
const rls = readFileSync(new URL('../supabase/migrations/20261120194500_saturn_expired_trial_transfer_camp_rls_v1.sql',import.meta.url),'utf8')
const entries=[
 ['accept_rider_transfer_offer','v_offer.seller_club_id'],
 ['cancel_rider_transfer_listing','v_listing.seller_club_id'],
 ['cancel_training_camp_booking','v_booking.club_id'],
 ['confirm_unsolicited_ai_transfer_bid_v1','v_bid.buyer_club_id'],
 ['extend_club_staff_contract','(select cs.club_id from public.club_staff cs where cs.id=p_staff_id)'],
 ['finance_book_training_camp','p_club_id'],
 ['finance_book_training_camp_v2','p_club_id']
]

for(const [index,[name,club]] of entries.entries()){
 test(name+' checks active guest term and specific club BEFORE mutations',()=>{
  const start=rpc.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  const end=index+1<entries.length?rpc.indexOf('CREATE OR REPLACE FUNCTION public.'+entries[index+1][0]+'('):rpc.length
  assert.ok(start>=0 && end>start,name+' source missing')
  const body=rpc.slice(start,end)
  assert.ok(body.includes('public.saturn_test_account_requires_guard_v1()'))
  assert.ok(body.includes('saturn_test_account_can_mutate_v1('+club+')'))
  assert.ok(body.includes("using errcode='42501'"))
  assert.ok(body.includes('Test account expired or not authorized for this club'))
 })
}
const tables=[
 'rider_transfer_listings','rider_transfer_offers',
 'rider_transfer_negotiations','rider_unsolicited_transfer_bids',
 'training_camp_bookings'
]
for(const table of tables){
 test(table+' direct writes are RESTRICTIVE and preserve normal SELECT',()=>{
   for(const op of ['insert','update','delete']){
     assert.ok(rls.includes('create policy saturn_trial_'+table+'_'+op+'_v1 on public.'+table))
     assert.ok(rls.includes('as restrictive for '+op+' to authenticated'))
   }
   assert.ok(rls.includes('saturn_trial_direct_write_allowed_v1('))
 })
}
test('registered transfers, normal contract rules and system schedulers are not globally denied',()=>{
 assert.doesNotMatch(rpc,/DROP FUNCTION|DROP TRIGGER|DISABLE ROW LEVEL SECURITY|GRANT ALL/i)
 assert.doesNotMatch(rls,/DISABLE ROW LEVEL SECURITY|DROP TABLE|GRANT ALL|for select to authenticated/i)
 assert.match(rpc,/from public\.rider_transfer_offers/)
 assert.match(rpc,/from public\.training_camp_bookings/)
})
test.todo('staging: active test player may negotiate a real transfer, book and cancel camps')
test.todo('staging: expired test player denied every selected transfer/finance action')
test.todo('staging: distinct buyer and seller maintain their existing permissions')
test.todo('staging: permanent team and game engine finance workflows remain unaffected')
test.todo('staging: all other transaction/credit/transfer RPCs audited separately')
