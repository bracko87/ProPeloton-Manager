import assert from 'node:assert/strict'
import {advanceSpatialPelotonV3,calculateSpatialSlipstreamV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
const room={laneCount:3,dtSeconds:10}
const riders=[
 {riderId:'front',meters:100,lane:1,desiredMps:10,energy:.8},
 {riderId:'follow',meters:94,lane:1,desiredMps:12,energy:.8,tactic:'follow'},
 {riderId:'side',meters:80,lane:0,desiredMps:10,energy:.8}
]
const one=advanceSpatialPelotonV3(riders,room)
assert.equal(one.length,3)
assert.equal(one[0].meters,200)
assert.equal(one[1].lane,0,'Fast follower should move to empty adjacent track')
assert.equal(one[1].meters,214)
assert.equal(one[1].lateralMoves,1)
assert.equal(one[1].overtook,true)
assert(one[1].slipstreamFraction>0)
assert.equal(one[0].slipstreamFraction,0)
assert.equal(calculateSpatialSlipstreamV3(riders[1],riders,{crosswindMps:12}).fraction < one[1].slipstreamFraction,true)
assert.equal(calculateSpatialSlipstreamV3(riders[1],riders,{gradePercent:9}).fraction<one[1].slipstreamFraction,true)
const tight=[{riderId:'a',meters:100,lane:0,desiredMps:10,energy:.7},{riderId:'b',meters:95,lane:0,desiredMps:12,energy:.7}]
const blocked=advanceSpatialPelotonV3(tight,{laneCount:1,dtSeconds:10})
assert.equal(blocked[1].meters,198.2)
assert.equal(blocked[1].wheelLimited,true)
assert.equal(blocked[1].lane,0)
assert.throws(()=>advanceSpatialPelotonV3([{riderId:'a',meters:0,lane:0,desiredMps:10,energy:1},{riderId:'b',meters:0,lane:0,desiredMps:10,energy:1}],room),/Overlapping/)
const reverse=advanceSpatialPelotonV3([...riders].reverse(),room)
assert.deepEqual(reverse.sort((a,b)=>a.riderId.localeCompare(b.riderId)),[...one].sort((a,b)=>a.riderId.localeCompare(b.riderId)))
assert.throws(()=>advanceSpatialPelotonV3(riders,{laneCount:0,dtSeconds:10}))
assert.throws(()=>advanceSpatialPelotonV3(riders,{laneCount:3,dtSeconds:10,minWheelGapMeters:-1}))
assert.deepEqual(riders.map(r=>r.meters),[100,94,80], 'Pure physics must not mutate its initial snapshot')
console.log('PASS isolated spatial safety, one-lane no-pass, two-lane overtake, drafting, wind/grade, input order and nonmutation')
