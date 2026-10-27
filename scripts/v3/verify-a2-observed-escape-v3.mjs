import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeObservedEscapeV3 as init,advanceObservedEscapeV3 as step} from './a2ObservedEscapeV3.mjs'
const geom=BATCH40_GEOMETRIES[1],c=validateRoadScenarioV3(geom).centerStepM
const r=(id,x,y)=>({riderId:id,meters:x,y})
const i=(id,m,y)=>({riderId:id,forwardMeters:m,targetY:y})
const initial=[r('rear',158,c),r('lead',163,c),r('extra2',192,3*c),r('extra3',210,3*c)]
const first=[i('rear',55,0),i('lead',45,c),i('extra2',42,3*c),i('extra3',42,3*c)]
const one=step(init(),initial,first,geom)
assert.equal(one.state.guarded.initialOuterLaneEligible,false)
const observed=[r('rear',213,0),r('lead',208,c),r('extra2',234,2*c),r('extra3',252,2*c)]
const demand=[i('rear',55,0),i('lead',45,c),i('extra2',42,c),i('extra3',42,c)]
const two=step(one.state,observed,demand,geom)
assert.equal(two.decision,'OBSERVED_SAFE_ESCAPE')
assert.equal(two.intents.find(x=>x.riderId==='rear').targetY,c)
assert.deepEqual(two.intents.filter(x=>x.riderId!=='rear'),demand.filter(x=>x.riderId!=='rear'))
assert.equal(two.state.escape.sweptSafeExits,1)
const replay=step(JSON.parse(JSON.stringify(one.state)),observed,demand,geom)
assert.deepEqual(replay,two)
const reordered=step(one.state,observed.slice().reverse(),demand.slice().reverse(),geom)
assert.deepEqual(reordered.state,two.state)
assert.equal(two.state.escape.officialWrites,0)
assert.equal(two.state.sportingApproval,'NOT_APPROVED')
console.log(JSON.stringify({study:'A2_OBSERVED_ESCAPE_STEP31',gate:'PASS',earlyLeftSignal:true,
 selectedSafeAdjacent:true,noCoercedOtherRiders:true,checkpoint:true,permutation:true,officialWrites:0}))
