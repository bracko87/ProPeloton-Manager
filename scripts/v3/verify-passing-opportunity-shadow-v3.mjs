import assert from 'node:assert/strict'
import {auditPassingOpportunitiesV3} from '../../src/race-engine-v3/passingOpportunityShadowV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
const road={laneCount:2,dtSeconds:10,minWheelGapMeters:1.8}
const field=[
  {riderId:'leader',meters:100,lane:1,desiredMps:10,energy:.8},
  {riderId:'follower',meters:95,lane:1,desiredMps:12,energy:.8},
  {riderId:'ahead_in_target',meters:110,lane:0,desiredMps:11,energy:.8},
  {riderId:'slower',meters:70,lane:0,desiredMps:10,energy:.8}
]
const original=JSON.stringify(field)
const audit=auditPassingOpportunitiesV3(field,road)
assert.equal(audit.mode,'SHADOW_ONLY_DO_NOT_APPLY')
assert.equal(audit.riders,4)
assert(audit.blockedRiders>0)
const suggested=audit.decisions.find(x=>x.riderId==='follower')
assert(suggested.potentialGainMeters>0,'A moving bike ahead in another lane must not block all passing opportunities')
assert.equal(suggested.adjacentLane,0)
assert(suggested.potentialMeters<220,'A pass advisory must remain behind the adjacent bicycle')
assert.equal(suggested.reason,'potential_lane_change')
assert.equal(JSON.stringify(field),original,'Shadow audit must not change rider state')
assert.deepEqual(auditPassingOpportunitiesV3([...field].reverse(),road).decisions.sort((a,b)=>a.riderId.localeCompare(b.riderId)),
  [...audit.decisions].sort((a,b)=>a.riderId.localeCompare(b.riderId)),'No array-order dependency')
assert.deepEqual(advanceSpatialPelotonV3(field,road),advanceSpatialPelotonV3(field,road),'Existing physical solver remains deterministic')
const withNoRoom=auditPassingOpportunitiesV3(field,{laneCount:2,dtSeconds:10,minWheelGapMeters:1.8})
assert(withNoRoom.decisions.every(x=>x.potentialGainMeters>=0))
assert.throws(()=>auditPassingOpportunitiesV3([{riderId:'one',meters:0,lane:0,desiredMps:12,energy:1},{riderId:'two',meters:0,lane:0,desiredMps:10,energy:1}],road),/Overlapping/)
console.log(JSON.stringify({suite:'shadow_passing_v3',status:'PASS_ENGINEERING_ONLY',blocked:audit.blockedRiders,opportunities:audit.opportunities,passActuallyExecuted:0,sportingApproval:'NOT_APPROVED'}))
