import assert from 'node:assert/strict'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
const field=[
 {riderId:'A',meters:110,lane:0,desiredMps:8,energy:.8},
 {riderId:'B',meters:100,lane:0,desiredMps:10,energy:.8},
 {riderId:'C',meters:150,lane:1,desiredMps:10,energy:.8}
]
const before=JSON.stringify(field)
const movement=advanceSpatialPelotonV3(field,{laneCount:2,dtSeconds:10})
const original=JSON.stringify(movement)
const report=planAnticipatoryLanesV3(field,movement,2)
assert.equal(report.mode,'EXPERIMENTAL_LATERAL_ONLY')
assert.equal(JSON.stringify(field),before)
assert.equal(JSON.stringify(movement),original)
assert.equal(report.riders.length,3)
for(let i=0;i<report.riders.length;i++){
 assert.equal(report.riders[i].meters,movement[i].meters,'No longitudinal teleport')
 assert(Math.abs(report.riders[i].lane-movement[i].lane)<=1)
}
assert.deepEqual(planAnticipatoryLanesV3([...field].reverse(),[...movement].reverse(),2).riders.sort((a,b)=>a.riderId.localeCompare(b.riderId)),[...report.riders].sort((a,b)=>a.riderId.localeCompare(b.riderId)))
assert.throws(()=>planAnticipatoryLanesV3(field,movement,0),/Invalid lane/)
assert.throws(()=>planAnticipatoryLanesV3(field,movement.slice(1),2),/missing wheel/)
console.log(JSON.stringify({result:'PASS',shifted:report.shifted,nonmutation:true,source:'synthetic'}))
