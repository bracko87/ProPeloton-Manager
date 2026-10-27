import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeBoundedSlotEscapeV3 as start,advanceBoundedSlotEscapeV3 as step} from './a2BoundedSlotEscapeV3.mjs'
import {initializeObservedEscapeV3 as baseStart,advanceObservedEscapeV3 as baseStep} from './a2ObservedEscapeV3.mjs'
const g=BATCH40_GEOMETRIES[1],c=validateRoadScenarioV3(g).centerStepM
const R=(riderId,meters,y)=>({riderId,meters,y})
const M=(riderId,forwardMeters,targetY)=>({riderId,forwardMeters,targetY})
const riders=[R('rear',158,c),R('lead',163,c),R('extra2',192,3*c),R('extra3',210,3*c)]
const cmds=[M('rear',55,0),M('lead',45,c),M('extra2',42,3*c),M('extra3',42,3*c)]
const a=step(start(),riders,cmds,g),b=baseStep(baseStart(),riders,cmds,g)
assert.deepEqual(a.intents,b.intents)
assert.equal(a.state.slot.attempts,0)
const next=[R('rear',213,0),R('lead',208,c),R('extra2',234,2*c),R('extra3',252,3*c)]
const req=[M('rear',55,0),M('lead',45,c),M('extra2',42,c),M('extra3',42,2*c)]
const run=step(a.state,next,req,g)
assert.deepEqual(run.intents.filter(m=>m.riderId!=='rear'),req.filter(m=>m.riderId!=='rear'))
assert.deepEqual(step(JSON.parse(JSON.stringify(a.state)),next,req,g),run)
const reverse=step(a.state,next.slice().reverse(),req.slice().reverse(),g)
assert.deepEqual(reverse.state,run.state)
assert.equal(run.state.slot.officialWrites,0)
assert.equal(run.state.sportingApproval,'NOT_APPROVED')
assert.throws(()=>step({...a.state,slot:{...a.state.slot,officialWrites:1}},next,req,g),/Invalid/)

// A31 rejects this known observed two-rider cascade when headway is 18m;
// A32 may only adjust its follower forward travel if the full sweep is safe.
const blocked=[R('rear',204,0),R('lead',208,c),R('extra2',234,2*c),R('extra3',252,3*c)]
const strict=baseStep(b.state,blocked,req,g)
const recovered=step(run.state,blocked,req,g)
assert.equal(strict.state.escape.active===false||strict.decision!=='OBSERVED_SAFE_ESCAPE',true)
if(recovered.decision==='A32_SAFE_BOUNDED_SLOT'){
 const newRear=recovered.intents.find(m=>m.riderId==='rear')
 assert(newRear.forwardMeters<55&&newRear.forwardMeters>=0)
 assert.equal(newRear.targetY,c)
 assert.deepEqual(recovered.intents.filter(m=>m.riderId!=='rear'),req.filter(m=>m.riderId!=='rear'))
 assert.equal(recovered.state.slot.accepted>=1,true)
}
console.log(JSON.stringify({study:'A32_BOUNDED_SLOT',gate:'PASS',checkpoint:true,permutation:true,
 nonconsentingIntentsUnchanged:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
