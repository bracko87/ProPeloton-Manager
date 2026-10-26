import assert from 'node:assert/strict'
import {continuousBicycleCollisionV3,startContinuousPassV3,advanceContinuousPassV3,continuousPassCompletedV3} from './continuousLateralResearchV3.mjs'
const safeA={x0:0,x1:50,y0:0,y1:1},safeB={x0:10,x1:60,y0:1,y1:1}
assert.equal(continuousBicycleCollisionV3(safeA,safeB),false,'Longitudinally separated swept bikes must not collide')
assert.equal(continuousBicycleCollisionV3({x0:0,x1:20,y0:0,y1:1},{x0:20,x1:0,y0:1,y1:1}),true,'Crossing trajectories collide between safe endpoints')
assert.equal(continuousBicycleCollisionV3({x0:10,x1:15,y0:0,y1:0},{x0:10,x1:15,y0:1,y1:1}),false,'Adjacent separated lanes are legal')
assert.equal(continuousBicycleCollisionV3({x0:10,x1:15,y0:0,y1:0},{x0:10,x1:15,y0:.6,y1:.6}),true,'Bike width matters')
assert.equal(continuousBicycleCollisionV3({x0:0,x1:5,y0:0,y1:0},{x0:10,x1:15,y0:0,y1:0}),false)
assert.throws(()=>continuousBicycleCollisionV3({x0:NaN,x1:5,y0:0,y1:0},safeB),/Invalid/)
const energy={criticalWatts:250,wPrimeJoules:15000,remainingWPrimeJoules:15000,efficiency:.23,cumulativeMechanicalJoules:0,cumulativeMetabolicJoules:0,cumulativeSupraCriticalJoules:0,cumulativeRecoveredWPrimeJoules:0,seconds:0}
const candidate={riderId:'a',fromLane:0,toLane:1,blockingLeaderId:'b'},rider={riderId:'a',lane:0,powerDurationEnergy:energy}
const before=[{riderId:'a',lane:0,meters:20},{riderId:'b',lane:0,meters:30},{riderId:'c',lane:1,meters:60}]
const moves=before.map(x=>({...x,meters:x.meters+5})),trace=[{riderId:'a',actualMechanicalWatts:200}]
let s=startContinuousPassV3(candidate,rider,{reactionTicks:2,steeringTicks:3})
const baseline=structuredClone(s)
for(let j=0;j<5;j++){
 const original=structuredClone(s)
 const next=advanceContinuousPassV3(s,before,moves,trace)
 assert.deepEqual(s,original,'Input reservation mutated')
 const restart=JSON.parse(JSON.stringify(s))
 assert.deepEqual(advanceContinuousPassV3(restart,before,moves,trace),next,'JSON checkpoint step drift')
 s=next
}
assert(continuousPassCompletedV3(s));assert.equal(s.actualChecks,5);assert.equal(s.extraWorkJoules,1050)
assert.equal(s.energy.cumulativeMechanicalJoules,5*200*10+1050);assert.equal(s.energy.seconds,50)
assert.equal(baseline.progress,0)
const collidedBefore=[before[0],before[1],{riderId:'c',lane:1,meters:20}]
const collidedMoves=collidedBefore.map(x=>({...x,meters:x.meters+5}))
let collision=startContinuousPassV3(candidate,rider,{reactionTicks:1,steeringTicks:3})
collision=advanceContinuousPassV3(collision,collidedBefore,collidedMoves,trace)
collision=advanceContinuousPassV3(collision,collidedBefore,collidedMoves,trace)
assert.equal(collision.phase,'rejected');assert.equal(collision.reason,'continuous_2d_swept_collision')
assert.equal(collision.extraWorkJoules,0)
const depleted={...energy,remainingWPrimeJoules:0,criticalWatts:100}
let failed=startContinuousPassV3(candidate,{...rider,powerDurationEnergy:depleted},{reactionTicks:1,steeringTicks:4,extraWatts:50})
failed=advanceContinuousPassV3(failed,before,moves,[{riderId:'a',actualMechanicalWatts:300}])
assert.equal(failed.reason,'finite_wprime_budget')
assert.throws(()=>startContinuousPassV3({...candidate,toLane:3},rider),/Invalid/)
console.log(JSON.stringify({suite:'batch39-continuous-bicycle',status:'PASS',tests:['continuous_mid_tick_intersection','adjacent_lane_width','checkpoint_replay','no_state_mutation','delayed_lane_progress','work_and_Wprime','collision_rejection','empty_Wprime_rejection']}))
