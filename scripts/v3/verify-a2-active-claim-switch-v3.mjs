import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeActiveClaimSwitchV3 as start,advanceActiveClaimSwitchV3 as step} from './a2ActiveClaimSwitchV3.mjs'
const geom=BATCH40_GEOMETRIES[1],r=(riderId,meters,y)=>({riderId,meters,y})
const riders=[r('rear',100,0),r('lead',118,1),r('extra2',125,1)]
const commands=(y)=>[{riderId:'rear',forwardMeters:75,targetY:1},{riderId:'lead',forwardMeters:45,targetY:1},
 {riderId:'extra2',forwardMeters:42,targetY:y}]
const quiet=step(start(),riders,commands(1),geom)
assert.equal(quiet.decision,'CURRENT_LANE_GUARD')
assert.equal(quiet.intents.find(x=>x.riderId==='rear').targetY,0)
const early=step(start(),riders,commands(0),geom)
assert.equal(early.decision,'OBSERVED_ACTIVE_BASELINE')
assert.deepEqual(early.state.actions[0].active,['extra2'])
assert.deepEqual(early.intents.filter(x=>x.riderId!=='rear'),commands(0).filter(x=>x.riderId!=='rear'))
const afterward=step(early.state,riders,commands(1),geom)
assert.equal(afterward.decision,'CURRENT_LANE_GUARD')
const signal=step(start({mode:'signal_preemptive'}),riders.map(x=>x.riderId==='extra2'?{...x,y:2,meters:150}:x),commands(1),geom)
assert.equal(signal.decision,'OBSERVED_ACTIVE_BASELINE')
assert.deepEqual(signal.state.actions[0].active,['extra2'])
const latched=step(start({mode:'latched'}),riders,commands(0),geom)
assert.equal(step(latched.state,riders,commands(1),geom).decision,'OBSERVED_ACTIVE_BASELINE')
const switched=step(quiet.state,riders,commands(0),geom)
assert.equal(switched.decision,'OBSERVED_ACTIVE_BASELINE')
assert.deepEqual(step(JSON.parse(JSON.stringify(quiet.state)),riders,commands(0),geom),switched)
const perm=step(start(),riders.slice().reverse(),commands(0).slice().reverse(),geom)
assert.deepEqual(perm.state,early.state)
assert.equal(early.state.officialWrites,0)
assert.throws(()=>start({mode:'future_prediction'}),/Invalid/)
console.log(JSON.stringify({study:'A2_ACTIVE_CLAIM_SWITCH',gate:'PASS',quietCurrentLane:true,
 earlyActiveSwitch:true,latchedMode:true,noCoercedRivals:true,checkpoint:true,permutation:true,officialWrites:0}))
