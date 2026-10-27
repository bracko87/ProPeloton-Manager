import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeCurrentLaneFirstV3 as start,advanceCurrentLaneFirstV3 as advance} from './a2CurrentLaneFirstV3.mjs'
const geometry=BATCH40_GEOMETRIES[1]
const r=(riderId,meters,y)=>({riderId,meters,y})
const frames=[r('rear',100,0),r('lead',118,1),r('extra2',150,2)]
const requested=(lateral=2)=>[{riderId:'rear',forwardMeters:75,targetY:1},{riderId:'lead',forwardMeters:45,targetY:1},{riderId:'extra2',forwardMeters:42,targetY:lateral}]
const safe=advance(start(),frames,requested(),geometry)
const guarded=advance(start({outerLaneOnly:true}),frames,requested(),geometry)
assert.equal(guarded.decision,'STAY_CURRENT_CLEAR_LANE')
const otherLane=advance(start({outerLaneOnly:true}),frames.map(x=>x.riderId==='rear'?{...x,y:2}:x),requested(),geometry)
assert.equal(otherLane.decision,'LEGACY_CONFLICT_FALLBACK')
assert.equal(safe.decision,'STAY_CURRENT_CLEAR_LANE')
assert.equal(safe.intents[0].targetY,0)
assert.equal(safe.state.metrics.stayFirstTicks,1)
const same=advance(start(),[...frames.map(x=>x.riderId==='rear'?{...x,y:1}:x)],requested(),geometry)
assert.equal(same.decision,'LEGACY_CONFLICT_FALLBACK')
assert.equal(same.state.metrics.blockedSameLaneTicks,1)
const threat=advance(start(),[...frames.map(x=>x.riderId==='extra2'?{...x,meters:125,y:1}:x)],requested(0),geometry)
assert.equal(threat.decision,'LEGACY_CONFLICT_FALLBACK')
assert(threat.state.metrics.observedConflictingIntentTicks>0)
assert.equal(threat.intents.find(x=>x.riderId==='extra2').targetY,0)
const repeated=advance(JSON.parse(JSON.stringify(safe.state)),frames,requested(),geometry)
assert.deepEqual(repeated,advance(safe.state,frames,requested(),geometry))
const perm=advance(start(),frames.slice().reverse(),requested().slice().reverse(),geometry)
assert.equal(perm.decision,safe.decision)
assert.deepEqual(perm.state,safe.state)
assert.throws(()=>start({lookaheadMeters:999}),/Invalid/)
console.log(JSON.stringify({gate:'PASS',study:'A2_CURRENT_LANE_FIRST_MICRO',stayCurrent:true,
 conflictsFallback:true,nonconsentingUnchanged:true,checkpoint:true,permutation:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
