import assert from 'node:assert/strict'
import {initializeCoupledV3,advanceCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {initializeFinitePassingV3,startFinitePassV3,stepFinitePassV3,validateFinitePassingV3} from '../../src/race-engine-v3/finitePassingResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
const before=[{riderId:'a',lane:0,meters:100},{riderId:'b',lane:1,meters:120}],moves=[{riderId:'a',lane:0,oldMeters:100,meters:105,wheelLimited:true},{riderId:'b',lane:1,oldMeters:120,meters:125,wheelLimited:false}]
for(const duration of [2,3,4])for(const watts of [20,35,50]){
 let state=startFinitePassV3(initializeFinitePassingV3(),{riderId:'a',fromLane:0,lane:1,meters:100},[{...moves[0],meters:100},moves[1]],1,duration)
 for(let j=0;j<duration;j++){validateFinitePassingV3(state,['a','b'],4,duration);const result=stepFinitePassV3(state,before,moves,10,watts);assert.equal(result.commitLane?.toLane,j===duration-1?1:undefined);state=JSON.parse(JSON.stringify(result.state))}
 assert.equal(state.completed,1);assert.equal(state.cumulativeExtraMechanicalJoules,watts*10*duration)
}
const base={...batch26Input('dordrecht-2000-10-15'),experimentalPowerDurationEnergy:true}
assert.throws(()=>initializeCoupledV3({...base,experimentalFinitePassSensitivity:{durationTicks:2}}),/requires finite passing/)
for(const bad of [{durationTicks:5},{additionalWatts:90},{selection:'unknown'},{startMaxKm:99},{bogus:1}])assert.throws(()=>initializeCoupledV3({...base,experimentalFinitePassReservation:true,experimentalFinitePassSensitivity:bad}),/Invalid|Unknown/)
const a={...base,experimentalFinitePassReservation:true},b={...a,experimentalFinitePassSensitivity:{durationTicks:4,additionalWatts:50,selection:'frontmost'}}
assert.throws(()=>advanceCoupledV3(b,initializeCoupledV3(a),1),/Checkpoint input mismatch/)
console.log('PASS Batch 32: safe passing duration, watt charges, mode gate, configuration and checkpoint fingerprint')
