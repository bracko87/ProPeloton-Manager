import assert from 'node:assert/strict'
import {classifyAttackProximityV3} from '../../src/race-engine-v3/physicalAttackLifecycleV3.ts'
import {initializePhysicalRaceV3,advancePhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
const bunch=Array.from({length:20},(_,i)=>({riderId:'r'+i,meters:5000+i*.1}))
assert.equal(classifyAttackProximityV3(bunch,'r1').classification,'within_peloton')
const escaped=[{riderId:'r0',meters:5250},...bunch.slice(1)]
assert.equal(classifyAttackProximityV3(escaped,'r0').classification,'clear_ahead')
const dropped=[{riderId:'r0',meters:4800},...bunch.slice(1)]
assert.equal(classifyAttackProximityV3(dropped,'r0').classification,'behind_peloton')
assert.equal(classifyAttackProximityV3([{riderId:'a',meters:100},{riderId:'b',meters:200}], 'a').classification,'no_valid_peloton')
assert.throws(()=>classifyAttackProximityV3([{riderId:'a',meters:100},{riderId:'a',meters:100}],'a'))
// A former attacker behind a DIFFERENT leading B1 is within its own main pack:
// median-based checks can misinterpret these relative positions.
const riders=Array.from({length:25},(_,i)=>({riderId:'r'+i,teamId:'t',flat:70,hills:70,climbing:70,cobbles:70,stamina:70,form:70,fatigue:10}))
const input={raceId:'isolated',stageId:'physical-catch',seed:'physical',riders,route:[{lengthKm:15,gradePercent:0}]}
const run=initializePhysicalRaceV3(input)
for(const [i,r] of run.states.entries()){r.energy=.7;r.meters=i<2?5500:i<22?5000:4700}
run.states[0].attackUsedAtKm=.5
run.states[3].attackUsedAtKm=.5
run.states[23].attackUsedAtKm=.5
advancePhysicalRaceV3(input,run,1)
assert.equal(run.states[0].attackUsedAtKm,.5,'Escaped attack must persist')
assert.equal(run.states[3].attackUsedAtKm,null,'Physically merged rider must have retired attack')
assert.equal(run.states[23].attackUsedAtKm,null,'Fallen-behind attacker cannot regain a ghost attack')
const after=JSON.parse(JSON.stringify(run)),other=JSON.parse(JSON.stringify(run))
advancePhysicalRaceV3(input,after,20)
for(let i=0;i<20;i++)advancePhysicalRaceV3(input,other,1)
assert.deepEqual(after,other,'Physical catch must checkpoint/resume identically')
console.log('PASS physical peloton grouping, escaped/caught/dropped classification and deterministic checkpoint resume')
