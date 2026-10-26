import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const riders=Array.from({length:12},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),meters:300-Math.floor(i/4)*2,lane:i%4,cpWatts:220+i*4,wPrimeJoules:16000,tactic:i%5===0?'attack':'tempo'}))
const input={riders,route:[{lengthKm:5,gradePercent:0}],geometry:BATCH40_GEOMETRIES[1],allowSteering:true}
assert.throws(()=>initializeCoupled2DResearchV3({...input,riders:[riders[0],riders[0]]}),/Invalid/)
assert.throws(()=>initializeCoupled2DResearchV3({...input,riders:[{...riders[0]}, {...riders[1],lane:0,meters:riders[0].meters}]}),/Initial two-dimensional/)
const a=initializeCoupled2DResearchV3(input)
const b=initializeCoupled2DResearchV3(input)
assert.deepEqual(a,b)
const full=advanceCoupled2DResearchV3(a,36)
for(const n of [1,5,3,7,10,10])advanceCoupled2DResearchV3 // never mutate input
let resumed=structuredClone(b)
for(const n of [1,5,3,7,10,10])resumed=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(resumed,n)))
assert.deepEqual(resumed,full,'Restarting 2D rider motion changes position or W-prime')
assert.deepEqual(a,initializeCoupled2DResearchV3(input))
const result=summarizeCoupled2DResearchV3(full)
assert.equal(result.riders,12)
assert.equal(result.ticks,36)
assert.equal(result.officialWrites,0)
assert.equal(result.stageFinished,false)
assert(result.positions.every(x=>x.remainingWPrimeJ>=0&&x.remainingWPrimeJ<=16000))
assert(result.metrics.achievedMeters<=result.metrics.commandedMeters+1e-5)
assert.throws(()=>advanceCoupled2DResearchV3({...a,officialWrites:1},1),/Invalid/)
console.log(JSON.stringify({status:'PASS',suite:'batch42 independent full-2D micro solver',riders:result.riders,ticks:result.ticks,metrics:result.metrics,firstGap:result.first30mGapSecond,unchangedInput:true,checkpoint:true}))
