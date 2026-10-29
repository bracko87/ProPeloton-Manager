import assert from 'node:assert/strict'
import {step99PersistentReservationsV3,step99AcceptedReservationsV3,
 step99ReservationCandidatesV3} from './a2Step99PersistentReservationsV3.mjs'
const s=[
 {id:'front',x:620,y:.3,v:9},
 {id:'rear',x:614,y:1.25,v:9},
 {id:'outer',x:602,y:3.15,v:9},
 {id:'outer2',x:602,y:4.1,v:9}
], req=[
 {id:'front',speed:9.5,targetY:1.25},
 {id:'rear',speed:9.2,targetY:2.2},
 {id:'outer',speed:9,targetY:4.1},
 {id:'outer2',speed:9,targetY:3.15}
]
const bookings=s.flatMap(v=>[{
 id:v.id,gateId:'gate-1',gateX:780,
 targetY:v.id==='front'?1.25:v.id==='rear'?2.2:3.15,
 scheduledSeconds:22},{
 id:v.id,gateId:'gate-2',gateX:1400,
 targetY:v.id==='front'?1.25:v.id==='rear'?2.2:3.15,
 scheduledSeconds:94
}])
for(let i=0;i<s.length;i++)s[i].targetY=req[i].targetY
const before=JSON.stringify([s,req,bookings])
const plan=step99PersistentReservationsV3(s,req,bookings)
assert(plan.added>0,'must create concrete physical reservation')
assert(plan.ambiguous>0,'same-X crossing ambiguity must be logged')
assert(plan.held[1],'true trailing bicycle must not enter reserved lane')
assert.equal(plan.kept,0)
assert.equal(plan.claims[0].leaderId,'front')
assert.equal(plan.claims[0].followerId,'rear')
assert.equal(plan.claims[0].gateId,'gate-1')
assert.equal(JSON.stringify([s,req,bookings]),before)
const achieved=s.map(v=>({...v,x:v.x+4.5}))
const renewed=step99PersistentReservationsV3(achieved,req,bookings,{
 atSeconds:.5,existingClaims:plan.claims})
assert.equal(renewed.kept,plan.claims.length)
assert.equal(renewed.released,0)
assert.deepEqual(renewed.claims,step99AcceptedReservationsV3(
 achieved,bookings,{atSeconds:.5,existingClaims:plan.claims}))
const stale=step99PersistentReservationsV3(achieved,req,bookings,{
 atSeconds:17,existingClaims:plan.claims})
assert.equal(stale.kept,0)
assert(stale.released>=plan.claims.length)
const unsafe=structuredClone(achieved)
unsafe[1].x=unsafe[0].x-1
const revoked=step99PersistentReservationsV3(unsafe,req,bookings,{
 atSeconds:.5,existingClaims:plan.claims})
assert(revoked.released>0)
assert.equal(revoked.kept,0)
const newGate=structuredClone(achieved)
newGate[0].x=785;newGate[1].x=780
const second=step99PersistentReservationsV3(newGate,req,bookings,{
 atSeconds:20,existingClaims:plan.claims})
assert(second.released>=1,'first gate claim must not remain over second gate')
const rename=v=>({...v,id:'renamed_'+v.id})
const names=step99PersistentReservationsV3(s.map(rename),req.map(rename),
 bookings.map(rename))
assert.equal(names.added,plan.added)
assert.equal(names.held.filter(Boolean).length,plan.held.filter(Boolean).length)
const flipped=step99PersistentReservationsV3(
 s.map(v=>({...v,y:4.4-v.y})),
 req.map(v=>({...v,targetY:4.4-v.targetY})),
 bookings.map(v=>({...v,targetY:4.4-v.targetY})))
assert.equal(flipped.added,plan.added)
assert.equal(flipped.ambiguous,plan.ambiguous)
assert.deepEqual(flipped.held,plan.held)
const rev=step99PersistentReservationsV3([...s].reverse(),
 [...req].reverse(),[...bookings].reverse())
assert.equal(rev.added,plan.added)
assert.deepEqual(rev.held,[...plan.held].reverse())
assert.throws(()=>step99PersistentReservationsV3(s,req,bookings,{
 existingClaims:[{...plan.claims[0],releaseAt:100}]}))
// An oversubscribed leader must NOT acquire one incompatible claim per
// physically nearby follower. Global matching is part of the contract.
const crowded=[
 {id:'lead',x:620,y:.3,targetY:2.2,v:9},
 {id:'followingA',x:614,y:1.25,targetY:2.2,v:9},
 {id:'followingB',x:612,y:2.2,targetY:2.2,v:9},
 {id:'followingC',x:610,y:3.15,targetY:2.2,v:9}
]
const crowdRequests=crowded.map(v=>({id:v.id,speed:9,targetY:v.targetY}))
const crowdBookings=crowded.map(v=>({id:v.id,gateId:'gate-1',
 gateX:780,targetY:v.targetY,scheduledSeconds:23}))
const matched=step99PersistentReservationsV3(crowded,
 crowdRequests,crowdBookings)
const seenClaimRiders=new Set()
for(const c of matched.claims){
 assert(!seenClaimRiders.has(c.leaderId))
 assert(!seenClaimRiders.has(c.followerId))
 seenClaimRiders.add(c.leaderId);seenClaimRiders.add(c.followerId)
}
assert(matched.claims.length<=Math.floor(crowded.length/2))
assert.equal(matched.onePhysicalRolePerRider,true)
const flippedCrowded=step99PersistentReservationsV3(
 crowded.map(v=>({...v,y:4.4-v.y,targetY:4.4-v.targetY})),
 crowdRequests.map(v=>({...v,targetY:4.4-v.targetY})),
 crowdBookings.map(v=>({...v,targetY:4.4-v.targetY})))
assert.equal(matched.claims.length,flippedCrowded.claims.length)
console.log(JSON.stringify({study:'A99_PERSISTENT_GLOBAL_BOOKING_REPLAY',
 status:'PASS',globalCandidates:plan.candidatePairs,
 acquired:plan.added,renewed:renewed.kept,
 expiresSafely:stale.released>0,
 failedClearanceRevokes:revoked.released>0,
 twoGateHandoff:second.released>0,
 equalXNoIdRightOfWay:plan.ambiguous>0,
 mirrored:true,renamed:true,reversed:true,
 noAcceptedStatesModified:true,officialWrites:0}))
