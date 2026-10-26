import assert from 'node:assert/strict'
import {newQueueTrackerV3,recordQueueTickV3,summarizeQueuesV3,beginSteeringV3,stepSteeringV3} from './queueReservationV3.mjs'
const t=newQueueTrackerV3(),r=(leader)=>({riderId:'a',blocked:!!leader,lossMeters:3,sameLaneReservationId:leader})
for(let n=1;n<=4;n++)recordQueueTickV3(t,[r('b')],n)
recordQueueTickV3(t,[r('c')],5)
recordQueueTickV3(t,[r(null)],6)
assert.equal(summarizeQueuesV3(t).episodes3,1)
assert.equal(summarizeQueuesV3(t).longestQueueTicks,4)
assert.equal(summarizeQueuesV3(t).sameLeaderContinuationTicks,3)
const energy={criticalWatts:250,wPrimeJoules:10000,efficiency:.23,remainingWPrimeJoules:10000,cumulativeMechanicalJoules:0,cumulativeMetabolicJoules:0,cumulativeSupraCriticalJoules:0,cumulativeRecoveredWPrimeJoules:0,seconds:0}
const c={riderId:'a',fromLane:0,toLane:1},base=()=>beginSteeringV3(c,{riderId:'a',powerDurationEnergy:energy})
const before=[{riderId:'a',lane:0,meters:100},{riderId:'b',lane:0,meters:120}]
const next=[{riderId:'a',lane:0,meters:105},{riderId:'b',lane:0,meters:125}]
const trace=[{riderId:'a',actualMechanicalWatts:240}]
const safe=base()
for(let i=0;i<5;i++)stepSteeringV3(safe,before,next,trace)
assert(safe.completed)
assert.equal(safe.extraWorkJoules,1050)
assert(safe.energy.remainingWPrimeJoules<10000)
assert.throws(()=>stepSteeringV3(safe,before,next,trace),/completed/)
const bad=base();stepSteeringV3(bad,before,next,trace);stepSteeringV3(bad,before,next,trace)
stepSteeringV3(bad,[...before,{riderId:'c',lane:1,meters:101}],[...next,{riderId:'c',lane:1,meters:106}],trace)
assert.equal(bad.rejected,'swept_lane_conflict')
assert.throws(()=>beginSteeringV3(c,{riderId:'a',powerDurationEnergy:energy},{durationTicks:2}),/Invalid/)
console.log('PASS Batch38 queue persistence, swept collision, reaction delay and actual W-prime ledger')