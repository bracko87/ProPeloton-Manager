import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,observeForwardPairPassesV3} from './coupled2DMicroV3.mjs'
const old=[{riderId:'a',meters:102,y:0},{riderId:'b',meters:100,y:1}]
const now=[{riderId:'a',meters:103,y:0,finishSeconds:null},{riderId:'b',meters:105,y:1,finishSeconds:null}]
assert.deepEqual(observeForwardPairPassesV3(old,now),[{passer:'b',passed:'a'}])
assert.deepEqual(observeForwardPairPassesV3(old,[{...now[0],finishSeconds:10},now[1]]),[])
assert.deepEqual(observeForwardPairPassesV3([{...old[0],meters:100},old[1]],now),[])
const riders=Array.from({length:8},(_,i)=>({riderId:'r'+i,meters:100-Math.floor(i/4)*2,lane:i%4,cpWatts:210+i,wPrimeJoules:16000,tactic:'tempo'}))
const input={riders,route:[{lengthKm:3,gradePercent:0}],capacity:3,allowSteering:true}
const base=initializeCoupled2DResearchV3(input),off=initializeCoupled2DResearchV3({...input,diagnosePassing:false})
assert.deepEqual(base,off)
const trace=initializeCoupled2DResearchV3({...input,diagnosePassing:true})
let baseline=advanceCoupled2DResearchV3(base,18),recorded=advanceCoupled2DResearchV3(trace,18)
assert.deepEqual(recorded.riders,baseline.riders)
assert.deepEqual(recorded.finish,baseline.finish)
assert.deepEqual(recorded.samples,baseline.samples)
const d=recorded.metrics.passingAudit
assert.equal(d.eligible,d.admitted+d.capacityDenied+d.physicalLaneDenied+d.reservedLaneDenied)
assert.equal(d.admitted,recorded.metrics.reservationsStarted)
assert.equal(d.collisionAborted+d.finishAborted,recorded.metrics.abortedPasses)
delete recorded.metrics.passingAudit
assert.deepEqual(recorded.metrics,baseline.metrics)
const c=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(trace,9)))
assert.deepEqual(advanceCoupled2DResearchV3(c,9),advanceCoupled2DResearchV3(trace,18))
assert.throws(()=>initializeCoupled2DResearchV3({...input,diagnosePassing:'on'}),/Invalid/)
console.log(JSON.stringify({suite:'A2 passing audit',status:'PASS',defaultExact:true,physicsExact:true,checkpointExact:true,officialWrites:0}))
