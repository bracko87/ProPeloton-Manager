import assert from 'node:assert/strict'
import {A2_RECONSTRUCTIONS,sampleNonlinearSweepV3 as position,inspectNonlinearPairV3 as inspect,
 nonlinearPassFractionV3 as passTime,nonlinearLaneEntryFractionV3 as laneTime,compareNonlinearOrderV3 as compare} from './a2NonlinearSweepsV3.mjs'
const parked={x0:10,x1:10,y0:0,y1:0}
const crossing={x0:0,x1:20,y0:0,y1:2}
assert.equal(inspect(parked,crossing,{profile:'affine'}).collision,false,'Affine straight sweeps must be safe')
assert.equal(inspect(parked,crossing,{profile:'steering_delayed'}).collision,true,'Delayed lateral movement creates a hidden overlap')
assert.equal(inspect(parked,crossing,{profile:'acceleration_frontloaded'}).collision,true,'Earlier forward movement creates a hidden overlap')
for(const profile of A2_RECONSTRUCTIONS){
 assert.deepEqual(position(crossing,0,profile),{x:0,y:0})
 assert.deepEqual(position(crossing,1,profile),{x:20,y:2})
}
const p={x0:0,x1:20,y0:1,y1:1},lead={x0:10,x1:10,y0:2,y1:2},rival={x0:0,x1:0,y0:1,y1:0}
assert(Math.abs(passTime(p,lead,{profile:'affine'})-.5)<1e-10)
assert(Math.abs(laneTime(rival,{profile:'affine'})-.5)<1e-10)
assert.equal(compare(p,lead,rival,{profile:'affine'}).classification,'TIED_UNDER_RECONSTRUCTION')
assert.equal(compare(p,lead,rival,{profile:'acceleration_frontloaded'}).classification,'PASS_BEFORE')
assert.equal(compare(p,lead,rival,{profile:'acceleration_delayed'}).classification,'PASS_AFTER')
assert.equal(compare(p,lead,rival,{profile:'steering_delayed'}).classification,'PASS_BEFORE')
assert.equal(compare(p,lead,rival,{profile:'steering_frontloaded'}).classification,'PASS_AFTER')
assert.equal(passTime(p,{...lead,x0:30,x1:30}),null)
assert.throws(()=>inspect(parked,crossing,{segments:1}),/Invalid/)
console.log(JSON.stringify({study:'A2_NONLINEAR_ENDPOINT_SENSITIVITY',status:'PASS',endpointIdentical:true,
 affineSafeButDelayedSteerCollision:true,affineSafeButEarlyAccelerationCollision:true,
 affineOrderingTiedButProfilesReverse:true,profiles:A2_RECONSTRUCTIONS.length,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
