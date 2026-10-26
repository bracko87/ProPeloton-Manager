import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,shouldPreparePass2DV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const g=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const a={riderId:'a',meters:100,y:0,speedMps:9,finishSeconds:null,reservation:null,blockedStreak:0}
const b={riderId:'b',meters:106,y:0,speedMps:8,finishSeconds:null,reservation:null,blockedStreak:0}
assert.equal(shouldPreparePass2DV3(a,[a,b],g,'blocked_2'),false)
assert.equal(shouldPreparePass2DV3(a,[a,b],g,'closing_wheel'),true)
assert.equal(shouldPreparePass2DV3({...a,speedMps:8.05},[b],g,'closing_wheel'),false)
assert.equal(shouldPreparePass2DV3({...a,blockedStreak:2},[a,b],g,'blocked_2'),true)
assert.equal(shouldPreparePass2DV3({...a,finishSeconds:4},[a,b],g,'closing_wheel'),false)
assert.throws(()=>shouldPreparePass2DV3(a,[a,b],g,'unsafe'),/Invalid/)
const riders=Array.from({length:8},(_,i)=>({riderId:'r'+i,meters:100-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:210+i,wPrimeJoules:16000,tactic:'tempo'}))
const input={riders,route:[{lengthKm:3,gradePercent:0}],allowSteering:true}
const old=initializeCoupled2DResearchV3(input)
const explicit=initializeCoupled2DResearchV3({...input,experimentalPassingTrigger:'blocked_2'})
assert.deepEqual(old,explicit,'Default now differs from historical baseline')
const control=advanceCoupled2DResearchV3(old,18),copy=advanceCoupled2DResearchV3(explicit,18)
assert.deepEqual(control,copy)
const early=initializeCoupled2DResearchV3({...input,experimentalPassingTrigger:'closing_wheel'})
let restored=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(early,9)))
restored=advanceCoupled2DResearchV3(restored,9)
assert.deepEqual(restored,advanceCoupled2DResearchV3(early,18))
assert(restored.metrics.achievedMeters<=restored.metrics.commandedMeters+1e-4)
assert.equal(restored.officialWrites,0)
console.log(JSON.stringify({suite:'Milestone A2 closing-wheel early pass',status:'PASS',ticks:18,defaultExact:true,checkpointExact:true,officialWrites:0}))
