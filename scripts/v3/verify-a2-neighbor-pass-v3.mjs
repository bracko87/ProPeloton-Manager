import assert from 'node:assert/strict'
import {chooseNeighborSpaceLaneV3} from './neighborPassV3.mjs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
const g={centerStepM:1,lateralCollisionM:.8,laneCount:4}
const r={riderId:'r',meters:100,y:1,finishSeconds:null}
const other=(riderId,meters,y)=>({riderId,meters,y,finishSeconds:null})
assert.equal(chooseNeighborSpaceLaneV3(r,[r,other('front0',103,0),other('front2',120,2)],[],[0,2],g),2)
assert.equal(chooseNeighborSpaceLaneV3(r,[r,other('front0',120,0),other('front2',103,2)],[],[0,2],g),0)
assert.equal(chooseNeighborSpaceLaneV3(r,[r],[],[0,2],g),0)
assert.equal(chooseNeighborSpaceLaneV3(r,[r],[{...other('x',125,1),reservation:{targetY:0}}],[0,2],g),2)
assert.throws(()=>chooseNeighborSpaceLaneV3(r,[r],[],[],g),/Invalid/)
const riders=Array.from({length:8},(_,i)=>({riderId:'r'+i,meters:100-Math.floor(i/4)*2,lane:i%4,cpWatts:210+i,wPrimeJoules:16000,tactic:'tempo'}))
const input={riders,route:[{lengthKm:3,gradePercent:0}],capacity:3,allowSteering:true}
const baseline=initializeCoupled2DResearchV3(input)
const explicit=initializeCoupled2DResearchV3({...input,experimentalPassLanePolicy:'left_first'})
assert.deepEqual(baseline,explicit,'Default experiment must be byte-identical')
assert.deepEqual(advanceCoupled2DResearchV3(baseline,18),advanceCoupled2DResearchV3(explicit,18))
const trial=initializeCoupled2DResearchV3({...input,experimentalPassLanePolicy:'neighbor_space'})
assert.equal(trial.input.experimentalPassLanePolicy,'neighbor_space')
const half=advanceCoupled2DResearchV3(trial,9)
assert.deepEqual(advanceCoupled2DResearchV3(JSON.parse(JSON.stringify(half)),9),advanceCoupled2DResearchV3(trial,18))
assert.throws(()=>initializeCoupled2DResearchV3({...input,experimentalPassLanePolicy:'unsafe'}),/Invalid/)
console.log(JSON.stringify({suite:'A2 neighbor-space safe corridor preference',status:'PASS',defaultExact:true,checkpointExact:true,officialWrites:0}))
