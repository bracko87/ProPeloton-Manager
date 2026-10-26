import assert from 'node:assert/strict'
import {compareFinishOrderV3,measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const a=[{riderId:'a',rank:1,finishSeconds:100,gapSeconds:0},{riderId:'b',rank:2,finishSeconds:110,gapSeconds:10},{riderId:'c',rank:3,finishSeconds:140,gapSeconds:40}]
const b=[{riderId:'c',rank:1,finishSeconds:90,gapSeconds:0},{riderId:'a',rank:2,finishSeconds:110,gapSeconds:20},{riderId:'b',rank:3,finishSeconds:120,gapSeconds:30}]
const x=compareFinishOrderV3(a,b)
assert.equal(x.changedRankCount,3);assert.equal(x.discordantPairs,2);assert.equal(x.totalPairs,3);assert.equal(x.meanAbsoluteRankShift,1.333333)
assert.equal(x.maxAbsoluteFinishChangeSeconds,50);assert.equal(x.maxAbsoluteGapChangeSeconds,40)
assert.deepEqual(compareFinishOrderV3(a,b.slice().reverse()),x)
assert.equal(compareFinishOrderV3(a,a).discordantPairs,0)
assert.throws(()=>compareFinishOrderV3(a,[b[0],b[0],b[2]]),/Missing or duplicate/)
assert.throws(()=>compareFinishOrderV3(a,[b[0]]),/Invalid/)
const groups=measurePelotonSeparationsV3({riders:[{riderId:'a',meters:200,finishSeconds:null},{riderId:'b',meters:169,finishSeconds:null},{riderId:'c',meters:166,finishSeconds:null},{riderId:'d',meters:100,finishSeconds:50}]})
assert.equal(groups.separateGroups,2);assert.equal(groups.gapsAboveThreshold,1);assert.equal(groups.maximumAdjacentGapMeters,31)
assert.throws(()=>measurePelotonSeparationsV3({riders:[{riderId:'x',meters:NaN,finishSeconds:null}]}),/Nonfinite/)
console.log('PASS Batch 27 finish-order inversion, time-change, group separation and input guards')
