import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
const riders=Array.from({length:8},(_,i)=>({riderId:'r'+i,meters:100-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:220+i,wPrimeJoules:16000,tactic:'tempo'}))
const settings={riders,route:[{lengthKm:3,gradePercent:0}],capacity:3,allowSteering:true}
const ten=initializeCoupled2DResearchV3({...settings,dt:10})
const five=initializeCoupled2DResearchV3({...settings,dt:5})
assert.equal(ten.input.dt,10)
assert.equal(five.input.dt,5)
assert.equal(ten.officialWrites,0)
assert.equal(five.officialWrites,0)
assert.equal(ten.sportingApproval,'NOT_APPROVED')
assert.equal(five.sportingApproval,'NOT_APPROVED')
for(const state of [ten,five]){
 const a=advanceCoupled2DResearchV3(state,4)
 const recovered=JSON.parse(JSON.stringify(a))
 assert.deepEqual(advanceCoupled2DResearchV3(recovered,5),advanceCoupled2DResearchV3(state,9))
 assert(a.metrics.achievedMeters<=a.metrics.commandedMeters+1e-4)
 assert(a.riders.every(r=>r.energy.remainingWPrimeJoules>=0))
}
assert.deepEqual(ten,initializeCoupled2DResearchV3({...settings,dt:10}),'10s initializer changed')
console.log(JSON.stringify({suite:'A2 5s versus 10s step-size micro invariant',status:'PASS',exactCheckpoints:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
