/** Research-only mode, W-prime, and checkpoint invariant test; no official writes. */
import assert from 'node:assert/strict'
import {initializeCoupledV3,runCoupledV3,advanceCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {initializeEnergyBalanceResearchV3,boundRequestedSpeedByEnergyV3,advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const riders=Array.from({length:12},(_,i)=>({riderId:'r'+String(i+1).padStart(3,'0'),teamId:'t'+(i%3+1),flat:65+i%8,climbing:66+i%10,endurance:65+i%9,resistance:67+i%7,fatigueBeforeStage:10,startStamina:85,raceSharpness:75,recovery:70,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
const base={raceId:'batch24',stageId:'batch24-test',seed:'batch24-offline',riders,route:[{lengthKm:3,gradePercent:0},{lengthKm:2,gradePercent:7.5}],orders:[{riderId:'r001',startKm:0,endKm:1.5,tactic:'attack'},{riderId:'r001',startKm:2.5,endKm:4.5,tactic:'attack'}],grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
assert.throws(()=>initializeCoupledV3({...base,experimentalSeparatedAerobicPower:true}),/requires power-duration energy/)
const coupled={...base,experimentalPowerDurationEnergy:true},separated={...coupled,experimentalSeparatedAerobicPower:true}
const original=runCoupledV3(coupled),direct=runCoupledV3(separated)
let cp=initializeCoupledV3(separated),n=0
while(!cp.complete){cp=JSON.parse(JSON.stringify(advanceCoupledV3(separated,cp,[1,2,4,3][n++%4])));assert(n<1500)}
assert.deepEqual(finalizeCoupledV3(separated,cp),direct,'Restart mismatch')
assert.equal(original.powerDuration.modeledRiders,riders.length)
assert.equal(direct.powerDuration.modeledRiders,riders.length)
assert.equal(direct.officialWrites,0);assert.equal(direct.sportingApproval,'NOT_APPROVED')
assert(direct.finish.length===riders.length&&direct.finish.every(x=>Number.isFinite(x.gapSeconds)&&x.gapSeconds>=0))
assert(cp.riders.every(x=>x.powerDurationEnergy.remainingWPrimeJoules>=0&&x.powerDurationEnergy.remainingWPrimeJoules<=x.powerDurationEnergy.wPrimeJoules))
const attacker=cp.riders.find(x=>x.riderId==='r001')
assert(attacker.attackAttempts>=1&&attacker.attackAttempts<=2)
assert(attacker.powerDurationEnergy.cumulativeSupraCriticalJoules>0)
const empty=initializeEnergyBalanceResearchV3({criticalWatts:250,wPrimeJoules:20000,initialWPrimeJoules:0})
const capped=boundRequestedSpeedByEnergyV3(empty,10,15,x=>40*x)
assert(capped<=6.250001&&capped>=6.249999)
assert.equal(advanceEnergyBalanceResearchV3(empty,350,10).accepted,false)
console.log(JSON.stringify({mode:'OFFLINE_NO_SPORTING_APPROVAL',riders:riders.length,checkpointBatches:n,attacks:attacker.attackAttempts,workAboveCriticalJoules:attacker.powerDurationEnergy.cumulativeSupraCriticalJoules,officialWrites:0}))
