import assert from 'node:assert/strict'
import {pairedFirstDivergenceV3,verifyLaneRowSwapV3} from './pairedFirstDivergenceV3.mjs'
const a=[{riderId:'a',meters:100,lane:0,wheelLimitedTicks:0},{riderId:'b',meters:97,lane:0,wheelLimitedTicks:0},{riderId:'c',meters:97,lane:1,wheelLimitedTicks:0}]
const b=[{...a[0]},{...a[1],lane:1},{...a[2],lane:0}]
assert.deepEqual(verifyLaneRowSwapV3(a,b),{ids:['b','c'],meters:97})
assert.throws(()=>verifyLaneRowSwapV3(a,[...b.slice(0,2),{...b[2],meters:98}]),/only lanes/)
assert.throws(()=>verifyLaneRowSwapV3(a,a),/non-reciprocal/)
const toA=[{...a[0],meters:106},{...a[1],meters:104,wheelLimitedTicks:1},{...a[2],meters:107}]
const toB=[{...b[0],meters:106},{...b[1],meters:108},{...b[2],meters:104,wheelLimitedTicks:1}]
const result=pairedFirstDivergenceV3(a,toA,b,toB,10,1)
assert.equal(result.riderCount,3);assert.equal(result.motionDifferent,2);assert.equal(result.blockedDifferent,2)
assert.equal(result.material.length,2);assert.equal(result.maxAdvanceDifferenceMeters,4)
assert.equal(result.blockEvents.length,2);assert.equal(result.control.groups,1);assert.equal(result.perturbed.groups,1)
assert.throws(()=>pairedFirstDivergenceV3(a,toA,b.slice(0,2),toB),/Paired rosters/)
assert.throws(()=>pairedFirstDivergenceV3(a,toA,b,toB,0),/Invalid paired tick/)
assert.throws(()=>pairedFirstDivergenceV3(a,[{...toA[0],meters:99},...toA.slice(1)],b,toB),/Backward/)
assert.deepEqual(pairedFirstDivergenceV3([...a].reverse(),[...toA].reverse(),[...b].reverse(),[...toB].reverse(),10,1).material,result.material)
console.log('PASS Batch33: reciprocal lane swaps, material motion divergence, upstream wheel/block changes, group geometry, fail-closed validation')
