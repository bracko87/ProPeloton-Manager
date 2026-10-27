import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3 as canonicalInitialize,advanceCoupled2DResearchV3 as canonicalAdvance} from './coupled2DMicroV3.mjs'
import {initializeCoupled2DResearchV3 as probeInitialize,advanceCoupled2DResearchV3 as probeAdvance} from './coupled2DOrderResearchV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const riders=Array.from({length:12},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),meters:300-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:220+i*4,wPrimeJoules:16000,tactic:i%5===0?'attack':'tempo'}))
const input={riders,route:[{lengthKm:5,gradePercent:0}],geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt:10}
const canonical=canonicalInitialize(input),control=probeInitialize(input)
assert.deepEqual(control,canonical,'Probe default state diverged from canonical solver')
assert.deepEqual(probeAdvance(control,24),canonicalAdvance(canonical,24),'Probe default physics diverged')
assert.deepEqual(probeInitialize({...input,experimentalMovementOrder:'front_first'}),canonical)
assert.throws(()=>probeInitialize({...input,experimentalMovementOrder:'unsafe'}),/Invalid/)
const statuses={}
for(const policy of ['rear_first','alternate_ticks']){
 try {
  const initial=probeInitialize({...input,experimentalMovementOrder:policy})
  assert.equal(initial.officialWrites,0)
  assert.equal(initial.sportingApproval,'NOT_APPROVED')
  const checkpoint=probeAdvance(initial,12)
  assert.deepEqual(probeAdvance(JSON.parse(JSON.stringify(checkpoint)),12),probeAdvance(initial,24))
  assert(checkpoint.riders.every(r=>Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
  statuses[policy]='MICRO_PASS'
 }catch(error){
  // A physically unsafe stress policy is a valid recorded negative research
  // result. Never silence the error or silently promote the policy.
  statuses[policy]='MICRO_REJECTED'
  console.log(JSON.stringify({policy,stressTest:'MICRO_REJECTED',cause:String(error?.message??error)}))
 }
}
console.log(JSON.stringify({suite:'A2 sequential solver order micro',canonicalControl:'EXACT',candidateStatuses:statuses,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
