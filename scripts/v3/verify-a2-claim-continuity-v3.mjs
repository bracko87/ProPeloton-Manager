import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeActiveClaimSwitchV3 as start,advanceActiveClaimSwitchV3 as step} from './a2ActiveClaimSwitchV3.mjs'
const geometry=BATCH40_GEOMETRIES[1],g=validateRoadScenarioV3(geometry),c=g.centerStepM
const riders=[{riderId:'rear',meters:100,y:0},{riderId:'lead',meters:118,y:c},{riderId:'extra2',meters:150,y:2*c}]
const moves=(moving)=>[
 {riderId:'rear',forwardMeters:75,targetY:c},
 {riderId:'lead',forwardMeters:45,targetY:c},
 {riderId:'extra2',forwardMeters:42,targetY:moving?c:2*c}
]
const original=moves(true),quiet=moves(false)
let a=step(start({mode:'signal_latched'}),riders,original,geometry)
assert.equal(a.decision,'OBSERVED_ACTIVE_BASELINE')
assert.equal(a.state.latched,true)
assert.equal(a.state.metrics.signalLatches,1)
const restored=step(JSON.parse(JSON.stringify(a.state)),riders,quiet,geometry)
assert.equal(restored.decision,'OBSERVED_ACTIVE_BASELINE')
assert.equal(restored.state.metrics.signalLatches,1)
assert.deepEqual(restored.intents.filter(x=>x.riderId!=='rear'),quiet.filter(x=>x.riderId!=='rear'))
let b=step(start({mode:'signal_memory_3'}),riders,original,geometry)
assert.equal(b.decision,'OBSERVED_ACTIVE_BASELINE')
assert.equal(b.state.signalMemoryTicks,2)
const reversed=step(start({mode:'signal_memory_3'}),riders.slice().reverse(),original.slice().reverse(),geometry)
assert.deepEqual(reversed.state,b.state)
for(let k=0;k<2;k++){
 b=step(JSON.parse(JSON.stringify(b.state)),riders,quiet,geometry)
 assert.equal(b.decision,'OBSERVED_ACTIVE_BASELINE')
}
assert.equal(b.state.signalMemoryTicks,0)
b=step(b.state,riders,quiet,geometry)
assert.equal(b.decision,'CURRENT_LANE_GUARD')
assert.equal(b.state.officialWrites,0)
assert.equal(b.state.sportingApproval,'NOT_APPROVED')
assert.throws(()=>start({mode:'future_omniscient'}),/Invalid/)
console.log(JSON.stringify({study:'A2_CLAIM_CONTINUITY',gate:'PASS',observedOnly:true,latched:true,memory3:true,noRivalControl:true,checkpoint:true,permutation:true,officialWrites:0}))
