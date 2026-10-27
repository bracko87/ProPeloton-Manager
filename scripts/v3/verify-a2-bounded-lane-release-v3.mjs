import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeBoundedLaneReleaseV3 as start,advanceBoundedLaneReleaseV3 as step} from './a2BoundedLaneReleaseV3.mjs'
const geom=BATCH40_GEOMETRIES[1],r=(riderId,meters,y)=>({riderId,meters,y})
const riders=[r('rear',100,0),r('lead',118,1),r('extra2',125,1)]
const commands=[{riderId:'rear',forwardMeters:75,targetY:1},{riderId:'lead',forwardMeters:45,targetY:1},
 {riderId:'extra2',forwardMeters:42,targetY:0}]
const a=step(start({maxHoldTicks:1}),riders,commands,geom)
assert.equal(a.decision,'VOLUNTARY_BOUNDED_STAY')
assert.equal(a.intents.find(x=>x.riderId==='rear').targetY,0)
assert.deepEqual(a.intents.filter(x=>x.riderId!=='rear'),commands.filter(x=>x.riderId!=='rear'))
const b=step(a.state,riders,commands,geom)
assert.notEqual(b.decision,'VOLUNTARY_BOUNDED_STAY')
assert.equal(b.state.metrics.exhausted,1)
const twice=step(start({maxHoldTicks:2}),riders,commands,geom)
assert.equal(step(twice.state,riders,commands,geom).decision,'VOLUNTARY_BOUNDED_STAY')
assert.notEqual(step(step(twice.state,riders,commands,geom).state,riders,commands,geom).decision,'VOLUNTARY_BOUNDED_STAY')
assert.deepEqual(step(JSON.parse(JSON.stringify(a.state)),riders,commands,geom),b)
const normal=[r('rear',100,1),r('lead',118,1),r('extra2',125,2)]
const stable=step(start(),normal,commands.map(c=>({...c,targetY:c.riderId==='extra2'?2:c.targetY})),geom)
assert.notEqual(stable.decision,'VOLUNTARY_BOUNDED_STAY')
assert.equal(stable.state.officialWrites,0)
assert.equal(stable.state.sportingApproval,'NOT_APPROVED')
assert.throws(()=>start({maxHoldTicks:9}),/Invalid/)
console.log(JSON.stringify({study:'A2_BOUNDED_RELEASE_MICRO',gate:'PASS',oneTickCap:true,twoTickCap:true,
 consentNotInferred:true,checkpointExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
