import assert from 'node:assert/strict'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,canAdmitPassingReservationV3} from './coupled2DMicroV3.mjs'
const sample=[{meters:100},{meters:200},{meters:300}]
assert.equal(canAdmitPassingReservationV3({meters:500},sample,3),false)
assert.equal(canAdmitPassingReservationV3({meters:500},sample,3,'local_30m'),true)
assert.equal(canAdmitPassingReservationV3({meters:107},[{meters:80},{meters:90},{meters:120}],3,'local_30m'),false)
assert.equal(canAdmitPassingReservationV3({meters:130},[{meters:99},{meters:161},{meters:500}],3,'local_30m'),true)
assert.throws(()=>canAdmitPassingReservationV3({meters:100},[],3,'any'),/Invalid/)
const riders=Array.from({length:8},(_,i)=>({riderId:'r'+i,meters:100-Math.floor(i/4)*2,lane:i%4,cpWatts:200+i*2,wPrimeJoules:16000,tactic:'tempo'}))
const input={riders,route:[{lengthKm:3,gradePercent:0}],allowSteering:true,capacity:3}
const control=initializeCoupled2DResearchV3(input)
const explicit=initializeCoupled2DResearchV3({...input,experimentalPassingAdmissionPolicy:'global'})
assert.deepEqual(control,explicit,'Global control must be byte-identical')
assert.deepEqual(advanceCoupled2DResearchV3(control,18),advanceCoupled2DResearchV3(explicit,18))
const local=initializeCoupled2DResearchV3({...input,experimentalPassingAdmissionPolicy:'local_30m'})
assert.equal(local.input.experimentalPassingAdmissionPolicy,'local_30m')
assert.equal(local.officialWrites,0)
assert.deepEqual(advanceCoupled2DResearchV3(local,18),advanceCoupled2DResearchV3(JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(local,9))),9))
assert.throws(()=>initializeCoupled2DResearchV3({...input,experimentalPassingAdmissionPolicy:'unbounded'}),/Invalid/)
console.log(JSON.stringify({suite:'A2 local passing admission isolation',status:'PASS',defaultExact:true,localCheckpointExact:true,officialWrites:0}))
