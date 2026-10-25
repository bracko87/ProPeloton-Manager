/** Structural RED FLAG, not a passing sporting-realism test. */
import assert from 'node:assert/strict'
import {initializeExperimentalPowerV3,advanceExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const riders=Array.from({length:25},(_,i)=>({riderId:'r'+i,teamId:'t1',flat:i===0?30:86,climbing:i===0?30:86,endurance:i===0?35:86,resistance:i===0?30:86,fatigueBeforeStage:30,startStamina:80,raceSharpness:85,recovery:80,morale:80,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
const input={raceId:'synthetic',stageId:'exhaustion-continuity',sourceFingerprint:'not-production',riders,segments:[{lengthKm:15,gradePercent:0}],gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
function oneStep(energy){
 const state=initializeExperimentalPowerV3(input)
 for(const s of state.riders){s.meters=5000;s.speedMps=10;s.energy=.75}
 state.riders.find(r=>r.riderId==='r0').energy=energy
 advanceExperimentalPowerV3(input,state,1)
 return state.riders.find(r=>r.riderId==='r0').speedMps
}
const above=oneStep(.13001),below=oneStep(.12999)
const discontinuityMps=Math.abs(above-below)
assert(Number.isFinite(discontinuityMps))
const result={model:'experimental_collective_power_v3_01',status:'DIAGNOSTIC_ONLY',source:'25_SYNTHETIC_RIDERS',inputEnergyDifference:.00002,aboveThresholdSpeedMps:above,belowThresholdSpeedMps:below,discontinuityMps,engineeringIntegrity:'COMPUTED',sportingApproval:'NOT_APPROVED',concern:discontinuityMps>.3?'EXHAUSTION_STEP_CLIFF':'FURTHER_VALIDATION_REQUIRED'}
console.log(JSON.stringify(result,null,2))
