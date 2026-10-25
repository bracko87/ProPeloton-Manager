import assert from 'node:assert/strict'
import {initializePhysicalRaceV3,advancePhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
const riders=Array.from({length:25},(_,i)=>({riderId:'r'+i,teamId:'t'+Math.floor(i/5),flat:70,hills:70,climbing:70,cobbles:70,stamina:70,form:70,fatigue:10}))
const input={raceId:'isolated',stageId:'caught-attack-life',seed:'verified-contract',riders,route:[{lengthKm:15,gradePercent:0}],dtSeconds:10,sampleEverySeconds:60}
const clean=initializePhysicalRaceV3(input)
const stale=initializePhysicalRaceV3(input)
// A once-attacking rider has already been physically caught; both versions
// share identical positions and energy, differing ONLY in the stale marker.
for(const s of [clean,stale]){
 for(const r of s.states){r.meters=3500;r.speedMps=11.2;r.energy=.70}
}
const staleRider=stale.states.find(s=>s.riderId==='r0')
staleRider.attackUsedAtKm=.25
staleRider.attackAttempts=1
const after=advancePhysicalRaceV3(input,stale,1)
const comparison=advancePhysicalRaceV3(input,clean,1)
const rs=after.states.find(s=>s.riderId==='r0'),rc=comparison.states.find(s=>s.riderId==='r0')
assert.equal(rs.attackUsedAtKm,null,'Caught rider retained an old active escape attempt')
assert.equal(rs.meters,rc.meters,'Caught rider received extra power after a retired attack')
assert.equal(rs.energy,rc.energy,'Retired attack incorrectly altered energy')
assert.equal(rs.attackAttempts,1,'Past attack history must remain auditable')
// A rider already physically clear (not caught) is not automatically retired.
const clear=initializePhysicalRaceV3(input)
for(const r of clear.states){r.meters=3500;r.speedMps=11.2;r.energy=.7}
clear.states[0].meters+=250
clear.states[0].attackUsedAtKm=.25
clear.states[0].attackAttempts=1
advancePhysicalRaceV3(input,clear,1)
assert.equal(clear.states[0].attackUsedAtKm,.25,'An active physical escape must not be dismissed')
// Catch lifecycle must serialize and resume deterministically.
const saved=JSON.parse(JSON.stringify(stale))
const saveTwo=JSON.parse(JSON.stringify(stale))
advancePhysicalRaceV3(input,saved,20)
for(let i=0;i<20;i++)advancePhysicalRaceV3(input,saveTwo,1)
assert.deepEqual(saved,saveTwo,'Catch checkpoint resume changed authoritative physical state')
console.log('PASS caught former attacker returns to ordinary pace; escape remains while physically clear; resumable history stays deterministic')
