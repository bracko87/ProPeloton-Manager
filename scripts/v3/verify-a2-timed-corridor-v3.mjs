import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeTimedCorridorV3 as start,advanceTimedCorridorV3 as step} from './a2TimedCorridorV3.mjs'
const g=BATCH40_GEOMETRIES[1]
const r=(riderId,meters,y)=>({riderId,meters,y})
const initial=[r('lead',118,1),r('rear',100,1),r('extra2',150,2)]
const requests=(otherTarget=2)=>[{riderId:'lead',forwardMeters:45,targetY:1},{riderId:'rear',forwardMeters:75,targetY:0},{riderId:'extra2',forwardMeters:42,targetY:otherTarget}]
const observe=step(start(),initial,requests(),g)
assert.equal(observe.state.phase,'observe')
assert.equal(observe.intents.find(m=>m.riderId==='rear').targetY,1)
const threat=step(observe.state,initial.map(r=>({...r,meters:r.meters+40})),requests(1),g)
assert.equal(threat.state.phase,'rival_first')
assert.equal(threat.intents.find(m=>m.riderId==='extra2').targetY,1,'No consent: preserve rival lane-change')
const held=step(observe.state,initial.map(r=>({...r,meters:r.meters+40})),requests(1),g,{acknowledgedRiderIds:['extra2']})
assert.equal(held.intents.find(m=>m.riderId==='extra2').targetY,1,'Rival-first ignores consent and never forces hold')
const priority=step(start({mode:'pass_first'}),initial,requests(),g)
const allowed=step(priority.state,initial.map(r=>({...r,meters:r.meters+40})),requests(1),g,{acknowledgedRiderIds:['extra2']})
assert.equal(allowed.state.phase,'pass_first')
assert.equal(allowed.intents.find(m=>m.riderId==='extra2').targetY,2,'Consenting rider one-tick hold')
const afterCap=step(allowed.state,initial.map(r=>({...r,meters:r.meters+80})),requests(1),g,{acknowledgedRiderIds:['extra2']})
assert.equal(afterCap.state.phase,'rival_first')
assert.equal(afterCap.intents.find(m=>m.riderId==='extra2').targetY,1)
const finishedRiders=[r('lead',230,1),r('rear',210,1),r('extra2',265,0)]
const finished=step(threat.state,finishedRiders,requests(0),g)
assert.equal(finished.state.metrics.rivalCompleted,1)
assert.equal(finished.state.phase,'passing')
assert.equal(finished.state.targetY,2,'Pass-after should select newly freed right corridor')
const replay=step(JSON.parse(JSON.stringify(threat.state)),finishedRiders,requests(0),g)
assert.deepEqual(replay,finished)
assert.throws(()=>start({mode:'unknown'}),/Invalid/)
console.log(JSON.stringify({suite:'A2 nonclairvoyant before/after time slots',status:'PASS',rivalConsentProtected:true,boundedHold:true,freshLaneSelected:true,replayExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
