import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeConditionalCorridorV3 as begin,advanceConditionalCorridorV3 as step} from './a2ConditionalCorridorV3.mjs'
const geometry=BATCH40_GEOMETRIES[1]
const mk=(id,meters,y)=>({riderId:id,meters,y})
const r=[mk('lead',118,1),mk('rear',100,1)]
const actions=(riders)=>riders.map(x=>({riderId:x.riderId,forwardMeters:x.riderId==='rear'?75:x.riderId==='lead'?45:42,targetY:x.riderId==='rear'?0:x.y}))
const clean=step(begin(),[...r,mk('extra2',76,3)],actions([...r,mk('extra2',76,3)]),geometry)
assert.equal(clean.state.policy,'fast');assert.equal(clean.state.metrics.fastStarts,1)
assert.equal(clean.intents.find(x=>x.riderId==='rear').targetY,0)
const threat=[...r,mk('extra2',150,2)],risk=step(begin(),threat,actions(threat),geometry)
assert.equal(risk.state.policy,'watch');assert.deepEqual(risk.state.riskExplanation.hazards,['extra2'])
assert.equal(risk.intents.find(x=>x.riderId==='rear').targetY,1)
const shifted=threat.map(x=>({...x,meters:x.meters+40}))
const proposed=actions(shifted).map(x=>x.riderId==='extra2'?{...x,targetY:1}:x)
const next=step(risk.state,shifted,proposed,geometry)
assert.equal(next.state.planner.phase,'rival_first')
assert.equal(next.intents.find(x=>x.riderId==='extra2').targetY,1)
assert.deepEqual(step(JSON.parse(JSON.stringify(risk.state)),shifted,proposed,geometry),next)
const rival=[mk('lead',118,1),mk('rear',100,1),mk('extra2',150,2),mk('extra3',76,3)]
const reversed=step(begin(),rival.slice().reverse(),actions(rival).reverse(),geometry)
const forward=step(begin(),rival,actions(rival),geometry)
assert.equal(reversed.state.policy,forward.state.policy)
assert.deepEqual(reversed.state.riskExplanation,forward.state.riskExplanation)
assert.equal(risk.state.officialWrites,0)
assert.throws(()=>begin({riskAheadM:999}),/Invalid/)
console.log(JSON.stringify({suite:'A2 conditional current-geometry time slots',status:'PASS',fastOpenStart:true,watchDynamicRisk:true,nonConsent:true,jsonReplay:true,officialWrites:0}))
