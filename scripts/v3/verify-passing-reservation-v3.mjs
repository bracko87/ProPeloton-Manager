import assert from 'node:assert/strict'
import {firstClipCauseV3,startReservationV3,stepReservationV3,speedBudgetForPassingV3} from './passingReservationV3.mjs'
const A={riderId:'a',meters:10,lane:0,desiredMps:5},B={riderId:'b',meters:15,lane:0,desiredMps:2}
const moves=[{riderId:'a',meters:18,oldMeters:10,lane:0},{riderId:'b',meters:17,oldMeters:15,lane:0}]
assert.equal(firstClipCauseV3([A,B],moves,2).clipped,2)
assert.equal(firstClipCauseV3([A,B],moves,2).leaderConstrained,1)
assert.throws(()=>firstClipCauseV3([A,A],moves,2),/duplicate/)
const choice={riderId:'a',meters:10,fromLane:0,toLane:1}
let r=startReservationV3(choice,[A,B],3)
assert.equal(r.remainingTicks,3)
const before=[A,B],after=[{...A,meters:12},{...B,meters:18}]
for(let i=0;i<2;i++){
 const step=stepReservationV3(r,before,after,10,40)
 assert.equal(step.status,'pending');assert.equal(step.commitLane,null);r=step.reservation
}
const final=stepReservationV3(r,before,after,10,40)
assert.equal(final.status,'completed');assert.equal(final.commitLane,1);assert.equal(final.mechanicalJoules,1200)
assert.equal(after[0].lane,0)
const unsafe=stepReservationV3(startReservationV3(choice,[A]),[A,{riderId:'x',meters:10,lane:1}], [{...A,meters:12},{riderId:'x',meters:12,lane:1}],10,40)
assert.equal(unsafe.status,'rejected')
assert.equal(unsafe.commitLane,null)
assert.throws(()=>startReservationV3({...choice,toLane:3},[A]),/Stale/)
assert.throws(()=>stepReservationV3(r,before,[{...after[0],lane:1},after[1]],10),/source lane/)
assert(Math.abs(speedBudgetForPassingV3(10,v=>v*30,30)-9)<1e-6)
assert(Math.abs(speedBudgetForPassingV3(10,v=>v*30,0)-10)<1e-8)
console.log('PASS Batch 30: first clip diagnostic, 3-tick finite reservation, no free lane, clearance, power cost, invalid plans')
