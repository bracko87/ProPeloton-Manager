import assert from 'node:assert/strict'
import {diagnosePositionCascadeTickV3} from './positionCascadeDiagnosticsV3.mjs'
const a=[{riderId:'a',meters:120,lane:0,desiredMps:8},{riderId:'b',meters:115,lane:0,desiredMps:12},{riderId:'c',meters:110,lane:0,desiredMps:14},{riderId:'d',meters:118,lane:1,desiredMps:9}]
const b=[{riderId:'a',meters:130,lane:0,wheelLimited:true},{riderId:'b',meters:127,lane:0,wheelLimited:true},{riderId:'c',meters:124,lane:0,wheelLimited:true},{riderId:'d',meters:130,lane:1,wheelLimited:false}]
const x=diagnosePositionCascadeTickV3(a,b,1)
assert.equal(x.summary.blocked,3);assert.equal(x.summary.chainAffected,2);assert.equal(x.summary.longestChain,2)
assert.deepEqual(x.rows.map(v=>v.chainDepth),[0,1,2,0])
assert.equal(diagnosePositionCascadeTickV3(a.slice().reverse(),b.slice().reverse(),1).summary.chainAffected,2)
assert.equal(diagnosePositionCascadeTickV3([{...a[2],wheelLimitedTicks:5}],[{...b[2],wheelLimited:undefined,wheelLimitedTicks:6}],1).summary.blocked,1)
assert.throws(()=>diagnosePositionCascadeTickV3([a[0],a[0]],[b[0],b[0]],1),/Duplicate/)
assert.throws(()=>diagnosePositionCascadeTickV3(a,b,-1),/Invalid/)
assert.throws(()=>diagnosePositionCascadeTickV3(a,b.slice(1),1),/Missing/)
console.log('PASS position-cascade: chained riders, permutations, counters, validation')
