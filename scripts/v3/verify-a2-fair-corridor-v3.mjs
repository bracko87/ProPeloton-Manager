import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeFairCorridorV3 as start,advanceFairCorridorV3 as step} from './a2FairCorridorSchedulingV3.mjs'
const g=BATCH40_GEOMETRIES[1],roster=(y=2)=>[{riderId:'lead',meters:118,y:1},{riderId:'rear',meters:100,y:1},{riderId:'extra2',meters:150,y}]
const intents=(blockerTarget=2)=>[{riderId:'lead',forwardMeters:45,targetY:1},{riderId:'rear',forwardMeters:75,targetY:0},{riderId:'extra2',forwardMeters:42,targetY:blockerTarget}]
const init=start(),a=step(init,roster(),intents(),g,{acknowledgedRiderIds:['extra2']})
assert.equal(a.state.phase,'active');assert.equal(a.state.targetY,0)
const riderState=roster().map(r=>({...r,meters:r.meters+40}))
const held=step(a.state,riderState,intents(1),g,{acknowledgedRiderIds:['extra2']})
assert.equal(held.state.metrics.holds,1);assert.equal(held.intents.find(x=>x.riderId==='extra2').targetY,2)
assert.equal(held.state.pending.extra2.lastRequestedY,1)
const release=step(held.state,riderState.map(r=>({...r,meters:r.meters+40})),intents(1),g,{acknowledgedRiderIds:['extra2']})
assert.equal(release.state.phase,'releasing')
assert.equal(release.intents.find(x=>x.riderId==='extra2').targetY,1)
assert.equal(release.state.metrics.holdCapReached,1)
assert.equal(release.state.metrics.holds,1)
const refused=step(a.state,riderState,intents(1),g,{acknowledgedRiderIds:[]})
assert.equal(refused.state.metrics.refusals,1)
assert.equal(refused.intents.find(x=>x.riderId==='extra2').targetY,1)
const saved=JSON.parse(JSON.stringify(held.state))
assert.deepEqual(step(saved,riderState.map(r=>({...r,meters:r.meters+40})),intents(1),g,{acknowledgedRiderIds:['extra2']}),release)
assert.throws(()=>start({maxHoldTicks:10}),/Invalid/)
console.log(JSON.stringify({suite:'A2 two-sided fair consent scheduling micro',status:'PASS',boundedHold:true,queuedIntents:true,releasePriority:true,refusalRespect:true,replayExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
