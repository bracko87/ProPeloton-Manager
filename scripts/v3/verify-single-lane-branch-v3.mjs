import assert from 'node:assert/strict'
import {chooseSingleLaneV3,forkSingleLaneV3} from './singleLaneBranchV3.mjs'
const before=[{riderId:'a',lane:0,meters:100},{riderId:'b',lane:0,meters:97},{riderId:'c',lane:1,meters:107}]
const moves=[{riderId:'a',lane:0,meters:106,wheelLimited:false},{riderId:'b',lane:0,meters:103,wheelLimited:true},{riderId:'c',lane:1,meters:113,wheelLimited:false}]
const plan={riders:[{riderId:'a',lane:0,fromLane:0,meters:106,promoted:false},{riderId:'b',lane:1,fromLane:0,meters:103,promoted:true},{riderId:'c',lane:1,fromLane:1,meters:113,promoted:false}]}
const choice=chooseSingleLaneV3(before,moves,plan)
assert.equal(choice?.riderId,'b')
const cp={version:'offline',elapsedSeconds:10,riders:[{riderId:'a',lane:0,meters:106,energy:.5},{riderId:'b',lane:0,meters:103,energy:.4,powerDurationEnergy:{remainingWPrimeJoules:3000}},{riderId:'c',lane:1,meters:113,energy:.6}]}
const changed=forkSingleLaneV3(cp,choice)
assert.equal(cp.riders[1].lane,0);assert.equal(changed.riders[1].lane,1)
assert.equal(changed.riders[1].powerDurationEnergy.remainingWPrimeJoules,3000)
assert.deepEqual({...changed.riders[1],lane:0},cp.riders[1])
assert.equal(chooseSingleLaneV3(before,moves,{riders:plan.riders.map(x=>({...x,promoted:false}))}),null)
assert.throws(()=>forkSingleLaneV3(cp,{...choice,toLane:0}),/Stale/)
assert.throws(()=>forkSingleLaneV3(cp,{...choice,meters:50}),/Stale/)
assert.throws(()=>chooseSingleLaneV3(before,moves.slice(1),plan),/Invalid/)
assert.throws(()=>forkSingleLaneV3(cp,choice,0),/Invalid/)
console.log('PASS Batch 26: exactly one safe lateral state difference, no energy debit, fail-closed validation')
