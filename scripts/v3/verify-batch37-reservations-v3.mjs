import assert from 'node:assert/strict'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {attributeWheelReservationsV3,selectSafeSinglePreparationV3,pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
const setup=[
 {riderId:'a',meters:100,lane:0,desiredMps:10,energy:.8,tactic:'follow'},
 {riderId:'b',meters:96,lane:0,desiredMps:12,energy:.8,tactic:'follow'},
 {riderId:'c',meters:103,lane:1,desiredMps:10,energy:.8,tactic:'follow'},
 {riderId:'d',meters:90,lane:2,desiredMps:10,energy:.8,tactic:'follow'}
]
const road={laneCount:4,dtSeconds:10,minWheelGapMeters:1.8}
const moves=advanceSpatialPelotonV3(setup,road)
const details=attributeWheelReservationsV3(setup,moves,road)
assert.equal(details.summary.riders,4)
assert(details.records.every(r=>r.lossMeters>=0))
assert(details.records.find(r=>r.riderId==='b').sameLaneReservationId==='a')
assert(details.records.find(r=>r.riderId==='b').sameLaneClippedMeters>0)
assert.deepEqual(attributeWheelReservationsV3(setup.slice().reverse(),advanceSpatialPelotonV3(setup.slice().reverse(),road),road).summary,details.summary)
assert.throws(()=>attributeWheelReservationsV3(setup,moves.map(m=>({...m,meters:m.meters+1})),road),/Unreproduced/)
assert.throws(()=>attributeWheelReservationsV3([setup[0],setup[0]],moves.slice(0,2),road),/Invalid/)
const selected=selectSafeSinglePreparationV3(setup,moves,road)
assert(selected.candidate===null||selected.candidate.fromLane!==selected.candidate.toLane)
const next=setup.map((r,i)=>({...r,meters:moves[i].meters,lane:moves[i].lane}))
const nxt=advanceSpatialPelotonV3(next,road)
const result=pairedOneTickLanePreparationV3(next,nxt,{riderId:'b',fromLane:next[1].lane,toLane:3},road)
assert(typeof result.safe==='boolean')
assert.throws(()=>pairedOneTickLanePreparationV3(next,nxt,{riderId:'x',fromLane:0,toLane:1},road),/Stale/)
const forced={...setup[2],lane:0,meters:96}
assert.throws(()=>advanceSpatialPelotonV3([setup[0],forced],road),/Overlapping/)
console.log(JSON.stringify({status:'PASS',suite:'Batch37 reservation attribution',riderCount:4,blocked:details.summary.wheelLimitedRiderTicks,clip:details.summary.actualLostMeters,selected:!!selected.candidate}))
