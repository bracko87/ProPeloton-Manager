import assert from 'node:assert/strict'
import {initializePersistentPassTrackerV3 as begin,advancePersistentPassTrackerV3 as next,summarizePersistentPassTrackerV3 as summary} from './a2PersistentPassesV3.mjs'
const riders=(a,b)=>[{riderId:'a',meters:a},{riderId:'b',meters:b}]
let s=begin(riders(12,10))
s=next(s,riders(12,13),10) // b passes a
assert.equal(summary(s).crossingEvents,1)
assert.equal(summary(s).durationWindows['30s'].rightCensoredRecentEvents,1)
s=next(s,riders(14,13),20) // a passes b after 10s, quick reversal
assert.equal(summary(s).durationWindows['30s'].reversedWithinWindow,1)
s=next(s,riders(14,16),50) // b passes again
s=next(s,riders(14,16),80)
let x=summary(s)
assert.equal(x.crossingEvents,3)
assert.equal(x.uniqueUnorderedCrossingPairs,1)
assert.equal(x.uniqueDirectionalCrossingPairs,2)
assert.equal(x.repeatedCrossingsAfterFirstPerPair,2)
assert.equal(x.durationWindows['30s'].sustainedEvents,1)
assert.equal(x.durationWindows['30s'].reversedWithinWindow,1)
assert.equal(x.durationWindows['60s'].rightCensoredRecentEvents,1)
s=next(s,riders(14,16),110)
x=summary(s)
assert.equal(x.durationWindows['60s'].sustainedEvents,1)
const revived=next(JSON.parse(JSON.stringify(s)),riders(18,16),120)
assert.deepEqual(revived,next(s,riders(18,16),120))
let equal=begin(riders(10,10))
equal=next(equal,riders(10,11),10)
assert.equal(summary(equal).crossingEvents,0,'Separation of tied first positions is not a pass')
equal=next(equal,riders(10,10.02),20)
equal=next(equal,riders(12,10),30)
assert.equal(summary(equal).crossingEvents,1)
assert.throws(()=>begin(riders(10,11),{epsilon:0}),/Invalid/)
assert.throws(()=>next(begin(riders(10,11)),[{riderId:'a',meters:12}],10),/Missing/)
console.log(JSON.stringify({suite:'A2 persistent pass, repass, tie and censor observer',status:'PASS',checkpointExact:true,quickReversalDistinguished:true,rightCensoringDistinguished:true,officialWrites:0}))
