import assert from 'node:assert/strict'
import {fatiguePowerEnvelopeV3} from '../../src/race-engine-v3/fatiguePowerEnvelopeV3.ts'
import {initializeExperimentalPowerV3,advanceExperimentalPowerV3,runExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const approx=(a,b,e=1e-9)=>Math.abs(a-b)<=e
assert(approx(fatiguePowerEnvelopeV3(1,300).peakDeliverableWatts,450))
assert(approx(fatiguePowerEnvelopeV3(0,300).peakDeliverableWatts,240))
for(let step=0;step<100;step++){
 const a=fatiguePowerEnvelopeV3(step/100,300)
 const b=fatiguePowerEnvelopeV3((step+1)/100,300)
 assert(b.multiplier>=a.multiplier, 'More reserve must not provide less available mechanical watts')
 assert(b.multiplier-a.multiplier<=.055,'Unexpected noncontinuous reserve acceleration')
}
for(const e of [0,.00001,.1,.12999,.13001,.19999,.2,.20001,.99,1]){
 const val=fatiguePowerEnvelopeV3(e,200)
 assert(val.peakDeliverableWatts>=160&&val.peakDeliverableWatts<=300)
 if(e<1)assert(Math.abs(val.multiplier-fatiguePowerEnvelopeV3(e+1e-6,200).multiplier)<.00002)
}
assert.throws(()=>fatiguePowerEnvelopeV3(-.01,300))
assert.throws(()=>fatiguePowerEnvelopeV3(.5,NaN))
const riders=Array.from({length:25},(_,i)=>({riderId:'r'+i,teamId:'team',flat:i===0?30:86,climbing:i===0?30:86,endurance:i===0?35:86,resistance:i===0?30:86,fatigueBeforeStage:30,startStamina:80,raceSharpness:85,recovery:80,morale:80,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
const input={raceId:'synthetic',stageId:'fatigue-continuity',sourceFingerprint:'research-test',riders,segments:[{lengthKm:15,gradePercent:0}],gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
function oneStep(e){
 const state=initializeExperimentalPowerV3(input)
 for(const r of state.riders){r.meters=5000;r.speedMps=10;r.energy=.75}
 state.riders.find(x=>x.riderId==='r0').energy=e
 advanceExperimentalPowerV3(input,state,1)
 return state.riders.find(x=>x.riderId==='r0').speedMps
}
const cliffDelta=Math.abs(oneStep(.13001)-oneStep(.12999))
assert(cliffDelta<.05,'Old 13% speed cliff reintroduced')
const direct=runExperimentalPowerV3(input)
assert(direct.finish.length===25)
assert(direct.sportingApproval==='NOT_APPROVED')
assert(direct.officialWrites===0)
console.log(JSON.stringify({status:'PASS_ENGINEERING_ONLY',reserveMinWatts:240,reserveMaxWatts:450,thresholdDeltaMps:cliffDelta,riders:25,frames:direct.groupFrames.length,sportingAcceptance:'NO_GO'}))
