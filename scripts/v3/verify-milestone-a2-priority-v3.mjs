import assert from 'node:assert/strict'
import {priorityCompareCoupled2DV3,initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const a={riderId:'r001',meters:100,y:0},b={riderId:'r002',meters:100,y:1}
assert(priorityCompareCoupled2DV3(a,b,{tick:0,policy:'rider_id'})<0)
assert(priorityCompareCoupled2DV3(a,b,{tick:0,policy:'rotating_lane'})<0)
assert(priorityCompareCoupled2DV3(a,b,{tick:1,policy:'rotating_lane'})>0)
assert(priorityCompareCoupled2DV3(a,{...b,meters:101},{tick:1,policy:'rotating_lane'})>0)
assert.throws(()=>priorityCompareCoupled2DV3(a,b,{policy:'unfair'}),/Invalid/)
const riders=Array.from({length:12},(_,i)=>({riderId:'r'+String(i+1).padStart(3,'0'),meters:200-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:210+i,wPrimeJoules:15000,tactic:'tempo'}))
const input={riders,route:[{lengthKm:1.5,gradePercent:0}],geometry:BATCH40_GEOMETRIES[1],allowSteering:true}
const original=initializeCoupled2DResearchV3(input)
const explicit=initializeCoupled2DResearchV3({...input,experimentalPriorityPolicy:'rider_id'})
let x=advanceCoupled2DResearchV3(original,24),y=advanceCoupled2DResearchV3(explicit,24)
assert.deepEqual(x,y,'Explicit historical rider-ID priority changed baseline')
const altered=initializeCoupled2DResearchV3({...input,experimentalPriorityPolicy:'rotating_lane'})
let entire=advanceCoupled2DResearchV3(altered,48),resumed=structuredClone(altered)
for(let j=0;j<6;j++)resumed=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(resumed,8)))
assert.deepEqual(entire,resumed,'Alternate tie priority was not deterministically resumable')
assert.equal(summarizeCoupled2DResearchV3(entire).officialWrites,0)
assert.throws(()=>initializeCoupled2DResearchV3({...input,experimentalPriorityPolicy:'random'}),/Invalid/)
console.log(JSON.stringify({suite:'Milestone A2 deterministic lane-rotating tie priority',status:'PASS',riders:riders.length,exactDefault:true,checkpoint:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
