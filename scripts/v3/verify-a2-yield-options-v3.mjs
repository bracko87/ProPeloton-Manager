import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {resolveTargetedSimultaneousPathsV3 as instrumented} from './simultaneousCrossingAwareResolveV3.mjs'
import {resolveTargetedSimultaneousPathsV3 as original} from './simultaneousTargetedResolveV3.mjs'
import {initializeSimultaneousMicroV3 as startA,advanceSimultaneousMicroV3 as advanceA} from './simultaneousCrossingAwareMicroV3.mjs'
import {initializeSimultaneousMicroV3 as startB,advanceSimultaneousMicroV3 as advanceB} from './simultaneousTargetedMicroV3.mjs'
const g=BATCH40_GEOMETRIES[1],r=(riderId,meters,y)=>({riderId,meters,y,speedMps:4,cpWatts:250,wPrimeJoules:18000})
const riders=[r('lead',110,0),r('trail',100,0),r('outside',105,3),r('tail',90,2)]
const moves=[{riderId:'lead',forwardMeters:40,targetY:0},{riderId:'trail',forwardMeters:60,targetY:1},{riderId:'outside',forwardMeters:48,targetY:3},{riderId:'tail',forwardMeters:65,targetY:2}]
const a=instrumented(riders,moves,g),b=original(riders,moves,g)
assert.deepEqual(a.paths,b.paths,'Instrumentation changed resolved swept trajectories')
const d=a.yieldOptions
assert.equal(d.conflictingPairs,d.zeroFeasible+d.oneFeasible+d.twoFeasible)
assert.equal(d.prioritizedPairs,d.priorityZeroFeasible+d.prioritySingleFeasible+d.priorityTwoFeasible)
assert.equal(d.prioritySingleFeasible,d.prioritySingleMustYieldProtected+d.prioritySingleAlreadyPreservesProtected)
assert.equal(d.priorityTwoFeasible,d.priorityAlreadyPreserved+d.priorityBothButCostGapOver10m+d.priorityBothCostGapWithin10m)
assert.equal(d.twoFeasible,d.twoChoiceCostGap0to2m+d.twoChoiceCostGap2to10m+d.twoChoiceCostGap10to25m+d.twoChoiceCostGapOver25m)
assert.equal(d.priorityActualSwitched,a.actualPreferenceChanges)
const order=x=>x.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
assert.deepEqual(order(a.paths),order(instrumented(riders.slice().reverse(),moves.slice().reverse(),g).paths))
let sa=startA({riders,geometry:g}),sb=startB({riders,geometry:g}),cp=null
for(let tick=0;tick<22;tick++){
 sa=advanceA(sa,moves);sb=advanceB(sb,moves)
 assert.deepEqual(sa.riders,sb.riders,'Diagnostics modified the actual state or energy')
 assert.equal(sa.metrics.achievedMeters,sb.metrics.achievedMeters)
 assert.equal(sa.metrics.mechanicalJ,sb.metrics.mechanicalJ)
 if(tick===9)cp=JSON.parse(JSON.stringify(sa))
}
for(let tick=10;tick<22;tick++)cp=advanceA(cp,moves)
assert.deepEqual(cp,sa,'Diagnostic serialized checkpoint was not exact')
assert.equal(sa.officialWrites,0)
console.log(JSON.stringify({suite:'A2 swept-yield option decision audit',status:'PASS',sweptPathExact:true,energyExact:true,checkpointExact:true,counters:sa.metrics.yieldOptions,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
